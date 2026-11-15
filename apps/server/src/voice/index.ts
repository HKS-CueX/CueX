/**
 * Voice engines for the CueX runtime. Supports real Sherpa ASR (local or WebSocket)
 * and transparent text-only capability reporting when native ASR is disabled or missing.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AsrCapabilityStatus } from '@cuex/protocol';
import { LocalSherpaAsr } from './asr-local';
import { RemoteSherpaAsr } from './asr-remote';
import { EdgeTts } from './tts-edge';
import { HttpTts } from './tts-http';
import { LocalSherpaTts } from './tts-local';
import type { AsrCallbacks, AsrEngine, AsrStream, TtsChunk, TtsEngine } from './types';

export type { AsrCorrection, AsrCallbacks, AsrEngine, AsrStream, TtsChunk, TtsEngine } from './types';
export { correctAsrText } from './corrections';
export { LocalSherpaAsr } from './asr-local';
export { RemoteSherpaAsr } from './asr-remote';

export const DEFAULT_EDGE_VOICE = 'zh-CN-YunyangNeural';

type Source = NodeJS.ProcessEnv;
const reader = (source: Source) => {
  const env = (key: string): string | undefined => source[key]?.trim() || undefined;
  const num = (key: string, fallback: number): number => {
    const value = env(key);
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${key} must be a number, got "${value}"`);
    return parsed;
  };
  return { env, num };
};
const log = (message: string) => console.log(`[voice] ${message}`);

export const DEFAULT_ASR_MODEL = 'sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30';

export function defaultAsrModelDir(source: Source = process.env): string {
  return join(reader(source).env('CUEX_MODEL_DIR') ?? join(homedir(), '.cache', 'cuex-models'), DEFAULT_ASR_MODEL);
}

/** Browser sends speech.delta (Web Speech API or text simulation); binary audio.chunk gets ASR_TEXT_ONLY. */
export class TextOnlyAsr implements AsrEngine {
  readonly backend = 'text-only';
  readonly reason: string;

  constructor(reason = 'CUEX_ASR=fake (browser Web Speech / speech.delta mode)') {
    this.reason = reason;
  }

  async open(_opts: { sampleRate: number }, _callbacks: AsrCallbacks): Promise<AsrStream> {
    return { write() {}, end() {} };
  }
}

class FallbackTts implements TtsEngine {
  constructor(private readonly engines: TtsEngine[]) {}
  get backend(): string { return this.engines.map(e => e.backend).join('>'); }

  close(): void {
    for (const engine of this.engines) (engine as { close?: () => void }).close?.();
  }

  async *synthesize(text: string, signal: AbortSignal): AsyncIterable<TtsChunk> {
    let lastError: unknown;
    for (const engine of this.engines) {
      if (signal.aborted) return;
      try {
        for await (const chunk of engine.synthesize(text, signal)) yield chunk;
        return;
      } catch (error) {
        if (signal.aborted) return;
        lastError = error;
        log(`${engine.backend} failed (${(error as Error).message}); trying the next TTS engine`);
      }
    }
    throw lastError ?? new Error('No TTS engine is configured');
  }
}

let asr: AsrEngine | undefined;
let tts: TtsEngine | undefined;
let edge: EdgeTts | undefined;

export function createAsrEngine(source: Source = process.env): AsrEngine {
  const shared = source === process.env;
  if (shared && asr) return asr;
  const { env, num } = reader(source);
  const mode = (env('CUEX_ASR') ?? 'fake').toLowerCase();
  let engine: AsrEngine;
  if (mode !== 'real') {
    engine = new TextOnlyAsr('CUEX_ASR=fake: use browser Web Speech API or speech.delta simulation.');
  } else {
    const url = env('CUEX_ASR_URL');
    const fallbackDir = defaultAsrModelDir(source);
    const modelDir = env('CUEX_ASR_MODEL_DIR') ?? (existsSync(join(fallbackDir, 'tokens.txt')) ? fallbackDir : undefined);
    if (url) {
      engine = new RemoteSherpaAsr({ url, connectTimeoutMs: num('CUEX_ASR_CONNECT_TIMEOUT_MS', 4000) });
    } else if (modelDir) {
      engine = new LocalSherpaAsr({
        modelDir,
        threads: num('CUEX_ASR_THREADS', 2),
        provider: env('CUEX_ASR_PROVIDER') ?? 'cpu',
        endpointSilenceSec: num('CUEX_ASR_ENDPOINT_SILENCE', 0.7),
        maxUtteranceSec: num('CUEX_ASR_MAX_UTTERANCE', 20),
      });
    } else {
      log(`ASR is text-only: no model in ${fallbackDir}. Run apps/server/scripts/voice-fetch-asr-model.sh, or set CUEX_ASR_URL or CUEX_ASR_MODEL_DIR`);
      engine = new TextOnlyAsr('Native Sherpa ASR model unavailable; using speech.delta (browser Web Speech / text).');
    }
  }
  if (shared) asr = engine;
  return engine;
}

export async function describeAsrCapability(engine: AsrEngine, source: Source = process.env): Promise<AsrCapabilityStatus> {
  if (engine instanceof LocalSherpaAsr) {
    return {
      backend: engine.backend,
      mode: 'local_sherpa',
      available: true,
      streaming: true,
      detail: 'In-process sherpa-onnx streaming zipformer ASR ready for PCM16 frames.',
    };
  }
  if (engine instanceof RemoteSherpaAsr) {
    try {
      await engine.probe();
      return {
        backend: engine.backend,
        mode: 'remote_sherpa',
        available: true,
        streaming: true,
        detail: `Remote sherpa-onnx WebSocket ASR reachable (${source.CUEX_ASR_URL ?? 'configured URL'}).`,
      };
    } catch (error) {
      return {
        backend: engine.backend,
        mode: 'remote_sherpa',
        available: false,
        streaming: false,
        detail: `Remote sherpa-onnx ASR unreachable (${error instanceof Error ? error.message : String(error)}); use speech.delta.`,
      };
    }
  }
  const reason = engine instanceof TextOnlyAsr ? engine.reason : 'Text-only ASR channel (speech.delta).';
  const isSimulated = (source.CUEX_ASR ?? 'fake').toLowerCase() !== 'real';
  return {
    backend: engine.backend,
    mode: 'text_simulation',
    available: isSimulated,
    streaming: false,
    detail: reason,
  };
}

export function createTtsEngine(source: Source = process.env): TtsEngine {
  const shared = source === process.env;
  if (shared && tts) return tts;
  const { env, num } = reader(source);
  const url = env('CUEX_TTS_URL') ?? 'http://127.0.0.1:18766/tts';
  const modelDir = env('CUEX_TTS_MODEL_DIR');
  const makers: Record<string, (() => TtsEngine) | undefined> = {
    edge: () => {
      const engine = new EdgeTts({
        voice: env('CUEX_EDGE_VOICE') ?? DEFAULT_EDGE_VOICE,
        rate: env('CUEX_EDGE_RATE') ?? '+8%',
        pitch: env('CUEX_EDGE_PITCH') ?? '+0Hz',
        timeoutMs: num('CUEX_TTS_TIMEOUT_MS', 8000),
      });
      if (shared) edge = engine;
      return engine;
    },
    http: () => new HttpTts({ url, timeoutMs: num('CUEX_TTS_TIMEOUT_MS', 30000) }),
    sherpa: modelDir ? () => new LocalSherpaTts({ modelDir, threads: num('CUEX_TTS_THREADS', 2), speakerId: num('CUEX_TTS_SPEAKER', 0), speed: num('CUEX_TTS_SPEED', 1) }) : undefined,
  };
  const first = env('CUEX_TTS_BACKEND') ?? 'http';
  if (!(first in makers)) throw new Error(`CUEX_TTS_BACKEND must be edge, http or sherpa, got "${first}"`);
  if (!makers[first]) throw new Error(`CUEX_TTS_BACKEND=${first} needs ${first === 'http' ? 'CUEX_TTS_URL' : 'CUEX_TTS_MODEL_DIR'}`);
  const fallback = env('CUEX_TTS_FALLBACK') ?? 'none';
  if (fallback !== 'auto' && fallback !== 'none') throw new Error('CUEX_TTS_FALLBACK must be auto or none');
  const order = fallback === 'none' ? [first] : [first, ...['http', 'sherpa', 'edge'].filter(name => name !== first)];
  const engines = order.flatMap(name => (makers[name] ? [makers[name]!()] : []));
  const engine = engines.length === 1 ? engines[0] : new FallbackTts(engines);
  if (shared) tts = engine;
  return engine;
}

export async function warmupVoice(): Promise<void> {
  const started = Date.now();
  const jobs: Array<Promise<string>> = [];
  const speech = createAsrEngine();
  if (speech instanceof LocalSherpaAsr) jobs.push(Promise.resolve().then(() => { speech.warmup(); return 'asr model loaded'; }));
  if (speech instanceof RemoteSherpaAsr) jobs.push(speech.probe().then(() => 'asr server reachable'));
  if ((process.env.CUEX_TTS ?? 'fake').toLowerCase() === 'real') {
    createTtsEngine();
    if (edge) jobs.push(edge.warmup().then(() => 'edge tts connected'));
  }
  const results = await Promise.allSettled(jobs);
  const notes = results.map(r => (r.status === 'fulfilled' ? r.value : `FAILED: ${(r.reason as Error).message}`));
  log(`asr=${speech.backend}; ${notes.join('; ') || 'text-only mode ready'} (${Date.now() - started} ms)`);
}
