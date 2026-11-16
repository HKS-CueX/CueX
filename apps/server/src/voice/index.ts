/**
 * ASR engines for the CueX runtime. Supports real Sherpa ASR (local or WebSocket)
 * and transparent text-only capability reporting when native ASR is disabled or missing.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AsrCapabilityStatus } from '@cuex/protocol';
import { ColabAsrProvider } from './asr-colab';
import { LocalSherpaAsr } from './asr-local';
import { RemoteSherpaAsr } from './asr-remote';
import type { AsrCallbacks, AsrEngine, AsrStream } from './types';

export type { AsrCorrection, AsrCallbacks, AsrEngine, AsrStream } from './types';
export { correctAsrText } from './corrections';
export {
  ColabAsrProvider,
  resolveColabAsrConfig,
  type ColabAsrConfig,
  type ColabAsrHttpResponse,
  type ColabAsrProviderOptions,
  type ColabBatchTranscribeResult,
  type ColabHttpRequestFn,
  type ColabWebSocketFactory,
} from './asr-colab';
export { LocalSherpaAsr } from './asr-local';
export { RemoteSherpaAsr } from './asr-remote';

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

let asr: AsrEngine | undefined;

export function createAsrEngine(source: Source = process.env): AsrEngine {
  const shared = source === process.env;
  if (shared && asr) return asr;
  const { env, num } = reader(source);
  const mode = (env('CUEX_ASR') ?? 'fake').toLowerCase();
  let engine: AsrEngine;
  if (mode !== 'real') {
    engine = new TextOnlyAsr('CUEX_ASR=fake: use browser Web Speech API or speech.delta simulation.');
  } else {
    const colabUrl = env('CUEX_COLAB_ASR_URL') ?? env('COLAB_ASR_URL');
    const url = env('CUEX_ASR_URL');
    const fallbackDir = defaultAsrModelDir(source);
    const modelDir = env('CUEX_ASR_MODEL_DIR') ?? (existsSync(join(fallbackDir, 'tokens.txt')) ? fallbackDir : undefined);
    if (colabUrl) {
      engine = new ColabAsrProvider({ env: source });
    } else if (url) {
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
  if (engine instanceof ColabAsrProvider) {
    return engine.probe();
  }
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

export async function warmupVoice(): Promise<void> {
  const started = Date.now();
  const jobs: Array<Promise<string>> = [];
  const speech = createAsrEngine();
  if (speech instanceof ColabAsrProvider) {
    jobs.push(speech.probe().then((st) => `colab=${st.lifecycleState ?? 'unknown'} (${st.detail})`));
  }
  if (speech instanceof LocalSherpaAsr) jobs.push(Promise.resolve().then(() => { speech.warmup(); return 'asr model loaded'; }));
  if (speech instanceof RemoteSherpaAsr) jobs.push(speech.probe().then(() => 'asr server reachable'));
  const results = await Promise.allSettled(jobs);
  const notes = results.map(r => (r.status === 'fulfilled' ? r.value : `FAILED: ${(r.reason as Error).message}`));
  log(`asr=${speech.backend}; ${notes.join('; ') || 'text-only mode ready'} (${Date.now() - started} ms)`);
}
