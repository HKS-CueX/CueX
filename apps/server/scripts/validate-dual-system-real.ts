/**
 * Wave 4 可复现全链路三路真机双系统协同验证脚本
 *
 * 严格静音原则：
 * - 仅离线读取 demo-pack/audio 下的 16kHz PCM16 单声道 WAV 文件并通过 WS audio.chunk 注入；
 * - 绝不调用系统扬声器或任何音频外放设备。
 *
 * 验证矩阵（真实三路并发）：
 * 1. ASR：Colab GPU SenseVoiceSmall（:10086 WSS/HTTPS）
 * 2. System 1：Colab autotrust/JEV-27B（:10010 TLS + Bearer + Keep-Alive，0 次走 CPA）
 * 3. System 2 / Compiler / Reflection：CPA gemini-4-hydrogen（固定 reasoningEffort='medium'）
 *    并分别对比实测 `responses` 模式与 `chat_completions` 模式真实耗时与 Token。
 * 4. 真实 Gateway + 主控端/伴随窗双 WS 接入 + 演讲全场景 + 异步合并/取消/指导闭环 + 复盘。
 *
 * 用法：
 *   CPA_DEV_MODELS_LOADER=1 pnpm --filter @cuex/server exec tsx scripts/validate-dual-system-real.ts
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import {
  type DualSystemCollaborationMetrics,
  type FastDecisionInput,
  type FastDecisionVerdict,
  type HealthStatusResponse,
  type PresentationContextPack,
  type ServerMessage,
  validateHealthStatusResponse,
} from '@cuex/protocol';
import { loadServerConfig } from '../src/config';
import { CueXGatewayServer } from '../src/gateway/GatewayServer';
import {
  computeLatencyStats,
  CpaClient,
  CpaSlowReasoningProvider,
  FallbackSlowReasoningProvider,
  LocalSlowReasoningProvider,
  createFastDecisionProvider,
  resolveCpaConfig,
} from '../src/runtime';
import { SqliteRepository } from '../src/storage';
import { LlamaSystemOne, resolveLlamaSystemOneConfig } from '../src/system1';
import { ColabAsrProvider, resolveColabAsrConfig } from '../src/voice';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_LOCAL_PATH = path.join(REPO_ROOT, '.cuex-runtime', '.env.phase3.local');
const DEMO_PACK_DIR = path.join(
  REPO_ROOT,
  'deliverables',
  'cuex-final',
  'mandatory',
  'ai-employee-demo',
  'demo-pack',
);
const RUNTIME_REPORT_PATH = path.join(
  REPO_ROOT,
  '.cuex-runtime',
  'dual-system-real-validation.json',
);
const EVIDENCE_REPORT_PATH = path.join(
  REPO_ROOT,
  'deliverables',
  'cuex-final',
  'mandatory',
  'ai-employee-demo',
  'evidence',
  'dual-system-real-validation.json',
);

interface ManifestSample {
  id: string;
  relativePath: string;
  category: string;
  expectedCueBehavior: string;
  groundTruth: string;
  durationSec: number;
}

interface ManifestFile {
  sampleCount: number;
  samples: ManifestSample[];
}

interface CpaCallLogEntry {
  tier: string;
  model: string;
  endpoint: 'responses' | 'chat_completions';
  reasoningEffort: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  ok: boolean;
}

interface S1CallLogEntry {
  latencyMs: number;
  backend: string;
  promptFormat: string;
  calibrated: boolean;
  degraded: boolean;
  cognitiveState: string;
  interventionNeed: string;
  usageSource: string;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  guidanceAppliedRevision?: number;
}

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

function extractWavPcm16(wavBytes: Buffer): Buffer {
  if (wavBytes.length < 44 || wavBytes.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Expected valid RIFF WAV buffer');
  }
  let offset = 12;
  while (offset + 8 <= wavBytes.length) {
    const chunkId = wavBytes.toString('ascii', offset, offset + 4);
    const chunkSize = wavBytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (chunkId === 'data') {
      return wavBytes.subarray(dataStart, Math.min(wavBytes.length, dataStart + chunkSize));
    }
    offset = dataStart + chunkSize + (chunkSize % 2);
  }
  throw new Error('WAV data subchunk not found');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function createSanitizer(secrets: string[], hosts: string[]) {
  const uniqueSecrets = [...new Set(secrets.filter((s) => s && s.length >= 6))];
  const uniqueHosts = [...new Set(hosts.filter((h) => h && !['127.0.0.1', 'localhost', '::1'].includes(h)))];
  return (text: string): string => {
    let out = text;
    for (const sec of uniqueSecrets) {
      out = out.split(sec).join('[REDACTED_SECRET]');
    }
    for (const host of uniqueHosts) {
      out = out.split(host).join('[REDACTED_ENDPOINT]');
    }
    out = out
      .replace(/\/Users\/[^\s"'`]+/g, '[REDACTED_PATH]')
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED_TOKEN]')
      .replace(/sk-[A-Za-z0-9\-_]{10,}/g, '[REDACTED_KEY]');
    return out;
  };
}

function sanitizeDeep<T>(value: T, sanitize: (s: string) => string): T {
  if (typeof value === 'string') return sanitize(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v, sanitize)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeDeep(v, sanitize);
    }
    return out as T;
  }
  return value;
}

async function checkUnauthorizedStatus(baseUrl: string, caPemPath?: string): Promise<number> {
  const url = new URL('/health', baseUrl);
  const ca = caPemPath && existsSync(caPemPath) ? readFileSync(caPemPath) : undefined;
  return await new Promise<number>((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: url.pathname,
        method: 'GET',
        agent: false,
        headers: { Connection: 'close' },
        ca,
        timeout: 8_000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Unauthorized probe timeout')));
    req.on('error', reject);
    req.end();
  });
}

interface TrackedWs {
  ws: WebSocket;
  events: Array<ServerMessage & { receivedAtMs: number }>;
  waitFor: (
    predicate: (msg: ServerMessage) => boolean,
    label: string,
    timeoutMs?: number,
    startIndex?: number,
  ) => Promise<ServerMessage & { receivedAtMs: number }>;
  closeClean: () => Promise<void>;
}

async function connectTrackedWs(url: string): Promise<TrackedWs> {
  const ws = new WebSocket(url);
  const events: Array<ServerMessage & { receivedAtMs: number }> = [];
  const waiters: Array<{
    startIndex: number;
    predicate: (msg: ServerMessage) => boolean;
    resolve: (msg: ServerMessage & { receivedAtMs: number }) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString('utf8')) as ServerMessage;
    const stamped = { ...msg, receivedAtMs: Date.now() };
    events.push(stamped);
    const idx = events.length - 1;
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      const w = waiters[i];
      if (idx >= w.startIndex && w.predicate(stamped)) {
        clearTimeout(w.timer);
        waiters.splice(i, 1);
        w.resolve(stamped);
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  const waitFor = (
    predicate: (msg: ServerMessage) => boolean,
    label: string,
    timeoutMs = 20_000,
    startIndex = 0,
  ) => {
    const hit = events.slice(startIndex).find(predicate);
    if (hit) return Promise.resolve(hit);
    return new Promise<ServerMessage & { receivedAtMs: number }>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(
          new Error(
            `Timeout waiting for [${label}] after index ${startIndex} (seen=${events
              .slice(startIndex)
              .map((e) => e.type)
              .join(',')})`,
          ),
        );
      }, timeoutMs);
      waiters.push({ startIndex, predicate, resolve, reject, timer });
    });
  };

  const closeClean = async () => {
    if (ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve());
      ws.close();
      setTimeout(resolve, 400);
    });
  };

  return { ws, events, waitFor, closeClean };
}

async function sendWavChunks(ws: WebSocket, sessionId: string, wavBytes: Buffer, paceMs = 14): Promise<void> {
  const pcm = extractWavPcm16(wavBytes);
  const bytesPerChunk = 3200; // 100ms @ 16kHz mono PCM16
  let ts = Date.now();
  for (let offset = 0; offset < pcm.length; offset += bytesPerChunk) {
    const slice = pcm.subarray(offset, Math.min(pcm.length, offset + bytesPerChunk));
    ws.send(
      JSON.stringify({
        type: 'audio.chunk',
        payload: {
          sessionId,
          format: 'pcm16',
          sampleRate: 16_000,
          channels: 1,
          timestamp: ts,
          data: slice.toString('base64'),
        },
      }),
    );
    ts += 100;
    await sleep(paceMs);
  }
  // 追加 1500ms 尾部静音帧（15 x 100ms），触发 Colab fsmn-vad 尾点检出并立即吐出 isFinal。
  const silenceData = Buffer.alloc(bytesPerChunk).toString('base64');
  for (let i = 0; i < 15; i += 1) {
    ws.send(
      JSON.stringify({
        type: 'audio.chunk',
        payload: {
          sessionId,
          format: 'pcm16',
          sampleRate: 16_000,
          channels: 1,
          timestamp: ts,
          data: silenceData,
        },
      }),
    );
    ts += 100;
    await sleep(paceMs);
  }
}

function summarizeLatency(samples: readonly number[]): {
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
} {
  const base = computeLatencyStats(samples);
  if (!samples.length) return { avgMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const p50Ms = sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0;
  return { avgMs: base.avgMs, p50Ms: Math.round(p50Ms), p95Ms: base.p95Ms, maxMs: base.maxMs };
}

async function main(): Promise<void> {
  loadEnvFile(path.join(REPO_ROOT, '.env'));
  loadEnvFile(ENV_LOCAL_PATH);

  // 确保真实三路均开启（若未设置 CPA_DEV_MODELS_LOADER 且 env 无直配 CPA_API_KEY，则需显式开启 loader）。
  if (!process.env.CPA_BASE_URL && !process.env.CPA_DEV_MODELS_LOADER) {
    process.env.CPA_DEV_MODELS_LOADER = '1';
  }
  process.env.CUEX_ASR = 'real';
  process.env.CUEX_SYSTEM1 = 'real';
  process.env.CUEX_SYSTEM2 = 'real';

  const asrCfg = resolveColabAsrConfig(process.env);
  const s1Cfg = resolveLlamaSystemOneConfig(process.env);
  const cpaRespCfg = resolveCpaConfig({
    env: { ...process.env, CPA_API_MODE: 'responses', CPA_SYSTEM2_REASONING_EFFORT: 'medium' },
  });
  const cpaChatCfg = resolveCpaConfig({
    env: { ...process.env, CPA_API_MODE: 'chat_completions', CPA_SYSTEM2_REASONING_EFFORT: 'medium' },
  });

  assert.ok(asrCfg, 'Colab ASR config required (.cuex-runtime/.env.phase3.local)');
  assert.ok(s1Cfg, 'Colab S1 JEV config required (.cuex-runtime/.env.phase3.local)');
  assert.ok(cpaRespCfg, 'CPA config required (set CPA_DEV_MODELS_LOADER=1 or CPA_BASE_URL/CPA_API_KEY)');
  assert.ok(cpaChatCfg, 'CPA chat_completions config required');

  const secretsToRedact = [
    asrCfg.apiKey,
    s1Cfg.apiKey,
    cpaRespCfg.getApiKey(),
    process.env.CUEX_COLAB_ASR_API_KEY ?? '',
    process.env.CUEX_S1_API_KEY ?? '',
    process.env.CPA_API_KEY ?? '',
  ];
  const hostsToRedact = [
    new URL(asrCfg.baseUrl).hostname,
    new URL(s1Cfg.baseUrl).hostname,
    new URL(cpaRespCfg.baseUrl).hostname,
  ];
  const sanitize = createSanitizer(secretsToRedact, hostsToRedact);

  console.log('[wave4] 1. Direct three-way route & protocol parity verification...');

  // 1a. Colab ASR probe & 401 guard
  const colabAsr = new ColabAsrProvider(asrCfg);
  const asrProbe = await colabAsr.probe();
  assert.equal(asrProbe.available, true, `Colab ASR must be available: ${asrProbe.detail}`);
  const asrUnauthCode = await checkUnauthorizedStatus(asrCfg.baseUrl, asrCfg.caCertPath);
  assert.equal(asrUnauthCode, 401, 'Colab ASR /health without Bearer must reject 401');

  // 1b. Direct Colab JEV-27B Keep-Alive & Calibration test
  const s1UnauthCode = await checkUnauthorizedStatus(s1Cfg.baseUrl, s1Cfg.caCertPath);
  assert.equal(s1UnauthCode, 401, 'Colab JEV S1 /health without Bearer must reject 401');

  const directS1 = new LlamaSystemOne({ env: process.env });
  const directS1Health = await directS1.health();
  assert.equal(directS1Health.ok, true, `Colab S1 must be healthy: ${directS1Health.detail}`);
  assert.equal(directS1.promptFormat, 'jev-v1');
  assert.equal(directS1.calibrated, true);

  const s1DirectProbes: Array<Record<string, unknown>> = [];
  try {
    const testPrompts = [
      {
        label: 'fluent_intro',
        state: 'Goal: Pitch CueX runtime. Latest speech: 大家好，今天展示通用认知运行时如何实现零编造临场提示。',
      },
      {
        label: 'topic_drift',
        state: 'Goal: Pitch CueX unit economics. Missing: Pro pricing. Latest speech: 周末我去公园跑步买蓝牙耳机。',
      },
      {
        label: 'hesitation_gap',
        state: 'Goal: Explain Dual-System controller. Latest speech: 嗯那个，控制器具体是怎么拦截幻觉数字我一时卡住了...',
      },
    ];
    for (const item of testPrompts) {
      const res = await directS1.decide(item.state, {
        need_help: {
          kind: 'noul',
          question:
            'Given presentation goal and open gaps, does presenter need a real-time cue right now?',
        },
      });
      s1DirectProbes.push({
        label: item.label,
        latencyMs: res.latencyMs,
        model: res.model,
        promptFormat: res.promptFormat,
        calibrated: res.calibrated,
        top: res.answers.need_help.top,
        probTrue: Number((res.answers.need_help.probabilities.true ?? 0).toFixed(6)),
        selectedSlot: res.answers.need_help.selectedSlot,
        margin: res.answers.need_help.margin,
        entropy: res.answers.need_help.entropy,
        usage: res.usage,
      });
    }
  } finally {
    directS1.close();
  }

  // 1c. Live CPA comparison: responses vs chat_completions at gemini-4-hydrogen + medium
  const modeBench: Record<
    'responses' | 'chat_completions',
    { runs: Array<Record<string, unknown>>; avgMs: number; p50Ms: number; p95Ms: number }
  > = {
    responses: { runs: [], avgMs: 0, p50Ms: 0, p95Ms: 0 },
    chat_completions: { runs: [], avgMs: 0, p50Ms: 0, p95Ms: 0 },
  };
  const benchPrompts = [
    '问题：CueX 为什么不只依靠停顿时间触发？已知证据：System 1 必须联合语义遗漏、话题漂移与停顿门控，纯停顿不触发提示。请输出严格 JSON。',
    '问题：当讲稿缺乏依据时如何处理？已知证据：未命中 Verified Evidence 时严禁编造数字，需明确缺失依据说明。请输出严格 JSON。',
  ];
  for (const modeName of ['responses', 'chat_completions'] as const) {
    const cfg = modeName === 'responses' ? cpaRespCfg : cpaChatCfg;
    const client = new CpaClient(cfg);
    for (const prompt of benchPrompts) {
      const res = await client.completeJson<{ status?: string; cueText?: string; grounded?: boolean }>({
        tier: 'system2',
        reasoningEffort: 'medium',
        systemPrompt:
          'You are CueX System 2 synthesizer. Return concise JSON {"status":"synthesized","cueText":"...","grounded":true,"evidenceIds":["ev_1"]}. Never invent figures.',
        userPrompt: prompt,
        maxRetries: 0,
      });
      modeBench[modeName].runs.push({
        endpoint: res.endpoint,
        model: res.model,
        reasoningEffort: 'medium',
        latencyMs: res.latencyMs,
        statusOk: Boolean(res.parsed),
        usage: res.usage,
      });
    }
    const lat = summarizeLatency(modeBench[modeName].runs.map((r) => Number(r.latencyMs)));
    modeBench[modeName].avgMs = lat.avgMs;
    modeBench[modeName].p50Ms = lat.p50Ms;
    modeBench[modeName].p95Ms = lat.p95Ms;
  }

  console.log('[wave4] 2. Starting full 3-way real CueXGatewayServer + dual-window WebSocket validation...');
  const runtimeDir = mkdtempSync(path.join(tmpdir(), 'cuex-wave4-real-'));
  const repo = new SqliteRepository(path.join(runtimeDir, 'wave4.db'));
  repo.init();

  const s1Logs: S1CallLogEntry[] = [];
  const cpaLogs: CpaCallLogEntry[] = [];

  const realFastProvider = createFastDecisionProvider('real', process.env);
  const spiedFastProvider = {
    get backend() {
      return realFastProvider.backend;
    },
    get mode() {
      return realFastProvider.mode;
    },
    health: () => realFastProvider.health(),
    async evaluate(input: FastDecisionInput, signal?: AbortSignal): Promise<FastDecisionVerdict> {
      const res = await realFastProvider.evaluate(input, signal);
      s1Logs.push({
        latencyMs: res.latencyMs,
        backend: res.backend,
        promptFormat: res.observation?.promptFormat ?? 'rule_zero',
        calibrated: Boolean(res.observation?.calibrated),
        degraded: Boolean(res.usage?.degraded),
        cognitiveState: res.cognitiveState,
        interventionNeed: res.interventionNeed,
        usageSource: res.usage?.usageSource ?? 'unknown',
        inputTokens: res.usage?.inputTokens ?? 0,
        outputTokens: res.usage?.outputTokens ?? 0,
        modelCalls: res.usage?.modelCalls ?? 0,
        ...(res.observation?.guidanceAppliedRevision !== undefined
          ? { guidanceAppliedRevision: res.observation.guidanceAppliedRevision }
          : {}),
      });
      return res;
    },
  };

  const baseCpaClient = new CpaClient(cpaRespCfg);
  const originalCompleteJson = baseCpaClient.completeJson.bind(baseCpaClient);
  baseCpaClient.completeJson = async <T>(req: Parameters<CpaClient['completeJson']>[0]) => {
    const out = await originalCompleteJson<T>(req);
    cpaLogs.push({
      tier: req.tier,
      model: out.model,
      endpoint: out.endpoint,
      reasoningEffort: req.reasoningEffort ?? baseCpaClient.config.system2ReasoningEffort,
      latencyMs: out.latencyMs,
      inputTokens: out.usage.inputTokens,
      outputTokens: out.usage.outputTokens,
      reasoningTokens: out.usage.reasoningTokens,
      cachedInputTokens: out.usage.cachedInputTokens,
      totalTokens: out.usage.totalTokens,
      ok: true,
    });
    return out;
  };

  const spiedSlowProvider = new FallbackSlowReasoningProvider(
    new CpaSlowReasoningProvider(baseCpaClient),
    new LocalSlowReasoningProvider(),
  );

  const serverCfg = loadServerConfig({
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '0',
    CUEX_RUNTIME_DIR: runtimeDir,
    CUEX_ASR: 'real',
    CUEX_SYSTEM1: 'real',
    CUEX_SYSTEM2: 'real',
    CUEX_COOLDOWN_MS: '1',
  });

  const gw = new CueXGatewayServer({
    config: serverCfg,
    repo,
    asrEngine: colabAsr,
    cpaClient: baseCpaClient,
    fastDecision: spiedFastProvider,
    slowReasoning: spiedSlowProvider,
  });

  const { port } = await gw.start();
  const baseUrl = `http://127.0.0.1:${port}`;
  const manifest = JSON.parse(
    readFileSync(path.join(DEMO_PACK_DIR, 'audio', 'manifest.json'), 'utf8'),
  ) as ManifestFile;
  const pitchMd = readFileSync(path.join(DEMO_PACK_DIR, 'cuex-presentation-pitch.md'), 'utf8');
  const whitelistJson = JSON.parse(
    readFileSync(path.join(DEMO_PACK_DIR, 'cuex-fact-whitelist.json'), 'utf8'),
  ) as { facts: Array<{ text: string }> };

  const scenarioResults: Array<Record<string, unknown>> = [];
  let initialHealthSnap: HealthStatusResponse;
  let finalHealthSnap: HealthStatusResponse;
  let finalDualMetrics: DualSystemCollaborationMetrics;
  let compiledPackSummary: Record<string, unknown> = {};
  let reflectionResult: Record<string, unknown> = {};

  try {
    // Verify initial /health
    const hRes = await fetch(`${baseUrl}/health`);
    assert.equal(hRes.status, 200);
    initialHealthSnap = (await hRes.json()) as HealthStatusResponse;
    assert.equal(validateHealthStatusResponse(initialHealthSnap).ok, true);
    assert.equal(initialHealthSnap.system1.promptFormat, 'jev-v1');
    assert.equal(initialHealthSnap.system1.calibrated, true);
    assert.equal(initialHealthSnap.system2.model, 'gemini-4-hydrogen');
    assert.equal(initialHealthSnap.system2.reasoningEffort, 'medium');
    assert.equal(initialHealthSnap.compiler?.model, 'gemini-4-hydrogen');
    assert.equal(initialHealthSnap.reflection?.model, 'gemini-4-hydrogen');

    // Login & grant Pro plan
    const authRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Wave4 Three-Way Validator' }),
    });
    const authJson = (await authRes.json()) as { token: string; user: { userId: string; tenantId: string } };
    repo.upsertEntitlement({
      entitlementId: `ent_w4_pro_${authJson.user.userId}`,
      userId: authJson.user.userId,
      tenantId: authJson.user.tenantId,
      planId: 'pro',
      status: 'active',
      grantedAt: new Date().toISOString(),
      remainingSessions: 100,
      remainingLiveMinutes: 240,
      source: 'manual_grant',
    });
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authJson.token}`,
    };

    // Compile Presentation Pack using live CPA Compiler (`gemini-4-hydrogen`, `medium`)
    const compileRes = await fetch(`${baseUrl}/api/presentation/compile`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'CueX Wave 4 真实三路验证路演包',
        sceneType: 'pitch',
        goal: '展示 CueX 通用认知运行时、Unit Economics(Pro 59元/月、Event 29元、83.8%毛利率)、L0-L3 克制干预与 V=H-λI',
        audience: '评委与技术负责人',
        targetDurationSec: 300,
        rawMaterials: pitchMd,
        keyFactsInput: whitelistJson.facts.map((f) => f.text),
      }),
    });
    assert.equal(compileRes.status, 201);
    const compileJson = (await compileRes.json()) as { pack: PresentationContextPack };
    compiledPackSummary = {
      packId: compileJson.pack.packId,
      compiledBy: compileJson.pack.compiledBy,
      chapterCount: compileJson.pack.cueSheet.chapters.length,
      evidenceCount: compileJson.pack.evidence.length,
      qaCardsCount: compileJson.pack.qaCards.length,
    };
    const packChapters = compileJson.pack.cueSheet.chapters;
    const ch1Id = packChapters[0]?.chapterId ?? 'ch_1';
    const ch2Id = packChapters[1]?.chapterId ?? ch1Id;

    // --- Scenario A: clip_01_intro_natural WAV -> Colab ASR -> Colab JEV-27B -> L0 quiet + Companion isolation ---
    {
      const sample = manifest.samples.find((s) => s.id === 'clip_01_intro_natural')!;
      const wav = readFileSync(path.join(DEMO_PACK_DIR, sample.relativePath));
      const primary = await connectTrackedWs(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(authJson.token)}&role=primary`);
      try {
        primary.ws.send(
          JSON.stringify({
            type: 'session.start',
            payload: {
              scenarioId: 'presentation',
              packId: compileJson.pack.packId,
              mode: 'live',
              viewMode: 'focus',
              privacyNoticeAccepted: true,
            },
          }),
        );
        const ready = await primary.waitFor((m) => m.type === 'session.ready', 'A:session.ready');
        const sessId = ready.type === 'session.ready' ? ready.payload.session.sessionId : '';
        assert.ok(sessId);

        const comp = await connectTrackedWs(
          `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(authJson.token)}&sessionId=${encodeURIComponent(sessId)}&role=companion&lastSeenSeq=0`,
        );
        try {
          await comp.waitFor((m) => m.type === 'session.ready', 'A:comp.ready');
          // Verify COMPANION_READ_ONLY rejection under real Gateway
          comp.ws.send(
            JSON.stringify({
              type: 'speech.delta',
              payload: { sessionId: sessId, speaker: 'presenter', text: 'illegal companion input', isFinal: true },
            }),
          );
          const compErr = await comp.waitFor((m) => m.type === 'session.error', 'A:comp readonly err');
          assert.equal(compErr.type === 'session.error' ? compErr.payload.code : '', 'COMPANION_READ_ONLY');

          const startIdx = primary.events.length;
          await sendWavChunks(primary.ws, sessId, wav, 12);
          const finalAsr = await primary.waitFor(
            (m) => m.type === 'asr.transcript' && m.payload.segment.isFinal === true,
            'A:asr final',
            20_000,
            startIdx,
          );
          await primary.waitFor((m) => m.type === 'system1.verdict', 'A:s1 verdict', 15_000, startIdx);
          await sleep(1_500);
          const shown = primary.events.slice(startIdx).filter((e) => e.type === 'intervention.shown');
          scenarioResults.push({
            id: 'scenario_a_intro_natural_companion',
            title: '正常开场流畅陈述（真实 WAV -> :10086 ASR -> :10010 JEV-27B）+ Companion 只读隔离',
            passed: shown.length === 0,
            transcript: finalAsr.type === 'asr.transcript' ? finalAsr.payload.segment.text : '',
            shownCount: shown.length,
            companionReadOnlyBlocked: true,
          });
        } finally {
          await comp.closeClean();
        }
        primary.ws.send(JSON.stringify({ type: 'session.end', payload: { sessionId: sessId } }));
        await primary.waitFor((m) => m.type === 'session.ended', 'A:ended', 35_000);
      } finally {
        await primary.closeClean();
      }
    }

    // --- Scenario B: clip_10_deliberate_omission_demo + clip_11_topic_drift_demo + user_recovered withdraw ---
    {
      const sampleOmit = manifest.samples.find((s) => s.id === 'clip_10_deliberate_omission_demo')!;
      const wavOmit = readFileSync(path.join(DEMO_PACK_DIR, sampleOmit.relativePath));
      const sampleDrift = manifest.samples.find((s) => s.id === 'clip_11_topic_drift_demo')!;
      const wavDrift = readFileSync(path.join(DEMO_PACK_DIR, sampleDrift.relativePath));

      const primary = await connectTrackedWs(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(authJson.token)}&role=primary`);
      try {
        primary.ws.send(
          JSON.stringify({
            type: 'session.start',
            payload: {
              scenarioId: 'presentation',
              packId: compileJson.pack.packId,
              mode: 'live',
              viewMode: 'inspector',
              privacyNoticeAccepted: true,
            },
          }),
        );
        const ready = await primary.waitFor((m) => m.type === 'session.ready', 'B:ready');
        const sessId = ready.type === 'session.ready' ? ready.payload.session.sessionId : '';
        const comp = await connectTrackedWs(
          `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(authJson.token)}&sessionId=${encodeURIComponent(sessId)}&role=companion`,
        );
        try {
          await comp.waitFor((m) => m.type === 'session.ready', 'B:comp ready');

          // B1: Stream omission WAV clip
          const omitIdx = primary.events.length;
          await sendWavChunks(primary.ws, sessId, wavOmit, 12);
          await primary.waitFor(
            (m) => m.type === 'asr.transcript' && m.payload.segment.isFinal === true,
            'B:omit asr',
            25_000,
            omitIdx,
          );
          await primary.waitFor((m) => m.type === 'system1.verdict', 'B:omit s1', 15_000, omitIdx);
          // Also wait briefly for async S2 if S1 escalated
          await sleep(4_500);
          const omitShown = primary.events.slice(omitIdx).filter((e) => e.type === 'intervention.shown').length;

          // B2: Stream topic drift WAV clip (`clip_11_topic_drift_demo`) -> S1 immediate + CPA S2 async -> then recover!
          const driftIdx = primary.events.length;
          await sendWavChunks(primary.ws, sessId, wavDrift, 12);
          const driftS1 = await primary.waitFor((m) => m.type === 'system1.verdict', 'B:drift s1', 25_000, driftIdx);
          const driftShown = await primary.waitFor(
            (m) => m.type === 'intervention.shown',
            'B:drift s2 shown',
            25_000,
            driftIdx,
          );
          const driftCompShown = await comp.waitFor(
            (m) => m.type === 'intervention.shown',
            'B:comp drift shown',
            10_000,
          );
          const nonBlockingDeltaMs = driftShown.receivedAtMs - driftS1.receivedAtMs;

          // Verify companion receives `system2.guidance`
          await comp.waitFor((m) => m.type === 'system2.guidance', 'B:comp guidance', 15_000);

          // Now recover back to topic -> `user_recovered` automatic withdrawal on BOTH sockets!
          const recIdx = primary.events.length;
          primary.ws.send(
            JSON.stringify({
              type: 'speech.delta',
              payload: {
                speaker: 'presenter',
                text: '回到正题，我们来看 CueX 通用认知运行时与单位经济模型：Pro 每月59元，Event 单场29元，毛利率达到83.8%。',
                isFinal: true,
              },
            }),
          );
          const recWithdrawn = await primary.waitFor(
            (m) => m.type === 'intervention.withdrawn' && m.payload.reason === 'user_recovered',
            'B:user_recovered withdrawn',
            15_000,
            recIdx,
          );
          assert.equal(recWithdrawn.type, 'intervention.withdrawn');

          scenarioResults.push({
            id: 'scenario_b_omission_drift_async_recovery',
            title: '遗漏+跑偏（真实 WAV 流）异步 S1/S2 解耦、Guidance 写入、Companion 同步与自愈撤回',
            passed: Boolean(driftShown && driftCompShown && recWithdrawn),
            omitShownCount: omitShown,
            nonBlockingS1ToS2GapMs: nonBlockingDeltaMs,
            withdrawnReason: 'user_recovered',
          });
        } finally {
          await comp.closeClean();
        }
        primary.ws.send(JSON.stringify({ type: 'session.end', payload: { sessionId: sessId } }));
        await primary.waitFor((m) => m.type === 'session.ended', 'B:ended', 35_000);
      } finally {
        await primary.closeClean();
      }
    }

    // --- Scenario C: clip_03_pauses_fillers WAV + Pause vs Hesitation + Consecutive Coalescing + Q&A Grounding/Honesty + Chapter Cancel + Reflection ---
    {
      const samplePause = manifest.samples.find((s) => s.id === 'clip_03_pauses_fillers')!;
      const wavPause = readFileSync(path.join(DEMO_PACK_DIR, samplePause.relativePath));
      const sampleQa = manifest.samples.find((s) => s.id === 'clip_09_speaker_interruption_qa')!;
      const wavQa = readFileSync(path.join(DEMO_PACK_DIR, sampleQa.relativePath));

      const primary = await connectTrackedWs(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(authJson.token)}&role=primary`);
      try {
        primary.ws.send(
          JSON.stringify({
            type: 'session.start',
            payload: {
              scenarioId: 'presentation',
              packId: compileJson.pack.packId,
              mode: 'live',
              viewMode: 'inspector',
              privacyNoticeAccepted: true,
            },
          }),
        );
        const ready = await primary.waitFor((m) => m.type === 'session.ready', 'C:ready');
        const sessId = ready.type === 'session.ready' ? ready.payload.session.sessionId : '';
        const comp = await connectTrackedWs(
          `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(authJson.token)}&sessionId=${encodeURIComponent(sessId)}&role=companion`,
        );
        try {
          await comp.waitFor((m) => m.type === 'session.ready', 'C:comp ready');

          // C1: Pause fillers WAV clip
          const pauseIdx = primary.events.length;
          await sendWavChunks(primary.ws, sessId, wavPause, 12);
          await primary.waitFor(
            (m) => m.type === 'asr.transcript' && m.payload.segment.isFinal === true,
            'C:pause asr',
            25_000,
            pauseIdx,
          );
          await sleep(1_500);

          // C2: Genuine hesitation turn -> triggers real S2 cue & writes System2Guidance
          const hesIdx = primary.events.length;
          primary.ws.send(
            JSON.stringify({
              type: 'speech.delta',
              payload: {
                speaker: 'presenter',
                text: '嗯那个，说到单位经济模型具体收费标准和毛利率我突然忘了，一时卡住了...',
                isFinal: true,
              },
            }),
          );
          const hesShown = await primary.waitFor((m) => m.type === 'intervention.shown', 'C:hesitation shown', 25_000, hesIdx);
          await primary.waitFor((m) => m.type === 'system2.guidance', 'C:hesitation guidance', 15_000, hesIdx);

          // C3: Turn N+1 fluent speech consumes System2Guidance written by S2 (`guidanceAppliedCount` check later)
          const postGuidIdx = primary.events.length;
          primary.ws.send(
            JSON.stringify({
              type: 'speech.delta',
              payload: {
                speaker: 'presenter',
                text: '接回核心数字：Pro版本59元每月含240分钟，Event单场29元含120分钟，直接毛利率83.8%。',
                isFinal: true,
              },
            }),
          );
          await primary.waitFor((m) => m.type === 'system1.verdict', 'C:post-guidance s1', 15_000, postGuidIdx);

          // C4: Grounded Q&A WAV (`clip_09_speaker_interruption_qa`) -> answers with Verified Evidence
          const qaGroundedIdx = primary.events.length;
          await sendWavChunks(primary.ws, sessId, wavQa, 12);
          const qaGroundedShown = await primary.waitFor(
            (m) => m.type === 'intervention.shown',
            'C:grounded QA shown',
            25_000,
            qaGroundedIdx,
          );
          const qaGroundedInt = qaGroundedShown.type === 'intervention.shown' ? qaGroundedShown.payload.intervention : undefined;

          // C5: Out-of-scope Ungrounded Q&A -> honest non-fabrication notice!
          const qaUngroundedIdx = primary.events.length;
          primary.ws.send(
            JSON.stringify({
              type: 'speech.delta',
              payload: {
                speaker: 'audience',
                text: '请问你们明年第四季度海外净营收预计有多少亿美元，B轮融资投前估值具体是多少？',
                isFinal: true,
              },
            }),
          );
          const qaUngroundedShown = await primary.waitFor(
            (m) => m.type === 'intervention.shown',
            'C:ungrounded QA honest shown',
            25_000,
            qaUngroundedIdx,
          );
          const qaUngroundedInt = qaUngroundedShown.type === 'intervention.shown' ? qaUngroundedShown.payload.intervention : undefined;

          // C6: Rapid burst -> s2Coalesced + chapter.set -> s2CancelledAsStale + Companion manual help!
          const burstMark1 = primary.events.length;
          primary.ws.send(
            JSON.stringify({
              type: 'speech.delta',
              payload: { speaker: 'presenter', text: '今天天气真不错我们聊聊旁边的午饭选择和咖啡店菜单吧', isFinal: true },
            }),
          );
          await primary.waitFor((m) => m.type === 'system1.verdict', 'C6:burst s1 #1', 15_000, burstMark1);
          const burstMark2 = primary.events.length;
          primary.ws.send(
            JSON.stringify({
              type: 'speech.delta',
              payload: { speaker: 'presenter', text: '再顺便说下昨天晚上看的足球比赛集锦也挺精彩', isFinal: true },
            }),
          );
          await primary.waitFor((m) => m.type === 'system1.verdict', 'C6:burst s1 #2', 15_000, burstMark2);
          const burstMark3 = primary.events.length;
          primary.ws.send(
            JSON.stringify({
              type: 'speech.delta',
              payload: { speaker: 'presenter', text: '还有周末旅游规划想去海边晒太阳买智能手环', isFinal: true },
            }),
          );
          await primary.waitFor((m) => m.type === 'system1.verdict', 'C6:burst s1 #3', 15_000, burstMark3);
          primary.ws.send(JSON.stringify({ type: 'chapter.set', payload: { sessionId: sessId, chapterId: ch2Id } }));
          await sleep(400);

          // Companion sends manual help (`intervention.request_help`) -> high-priority path synced to both
          const helpMark = primary.events.length;
          comp.ws.send(
            JSON.stringify({
              type: 'intervention.request_help',
              payload: {
                sessionId: sessId,
                preferredLevel: 'L3',
                question: '请给我一段30秒内可口述的 CueX 核心价值总结',
              },
            }),
          );
          const helpShown = await primary.waitFor((m) => m.type === 'intervention.shown', 'C:comp manual help shown', 25_000, helpMark);

          // Wait any trailing S2 before session.end, inspect /health live metrics before ending!
          await sleep(500);
          const preEndHealthRes = await fetch(`${baseUrl}/health`);
          const preEndHealth = (await preEndHealthRes.json()) as HealthStatusResponse;
          finalDualMetrics = preEndHealth.dualSystemMetrics!;

          // End session -> real CPA Reflection (`gemini-4-hydrogen · medium`) preserving deterministic stats
          primary.ws.send(JSON.stringify({ type: 'session.end', payload: { sessionId: sessId } }));
          const endedEvt = await primary.waitFor((m) => m.type === 'session.ended', 'C:ended', 45_000);
          const endedPayload = endedEvt.type === 'session.ended' ? endedEvt.payload : undefined;
          assert.ok(endedPayload?.reflection);
          assert.equal(endedPayload.reflection.utility.lambda, 2);
          reflectionResult = {
            utility: endedPayload.reflection.utility,
            diagnosisSummary: endedPayload.reflection.diagnosis,
            telemetry: endedPayload.outcome.telemetry,
            timelineLength: endedPayload.reflection.timeline.length,
          };

          scenarioResults.push({
            id: 'scenario_c_full_bidirectional_qa_coalesce_cancel_reflection',
            title: '犹豫卡顿 + 指导闭环 + 有据/无据问答边界 + 高频合并/切章取消 + 伴随求助 + 真实 CPA 复盘',
            passed: Boolean(
              hesShown &&
                qaGroundedInt &&
                qaUngroundedInt &&
                helpShown &&
                qaUngroundedInt.grounded === false &&
                qaUngroundedInt.missingEvidenceNotice &&
                !/\d{2,}/.test(qaUngroundedInt.cueText),
            ),
            qaGrounded: {
              grounded: qaGroundedInt?.grounded,
              evidenceCount: qaGroundedInt?.evidenceIds.length ?? 0,
            },
            qaUngroundedHonesty: {
              grounded: qaUngroundedInt?.grounded,
              evidenceIds: qaUngroundedInt?.evidenceIds,
              missingEvidenceNotice: qaUngroundedInt?.missingEvidenceNotice,
              cueText: qaUngroundedInt?.cueText,
            },
            dualSystemMetricsSnapshot: finalDualMetrics,
          });
        } finally {
          await comp.closeClean();
        }
      } finally {
        await primary.closeClean();
      }
    }

    const finalHRes = await fetch(`${baseUrl}/health`);
    finalHealthSnap = (await finalHRes.json()) as HealthStatusResponse;
  } finally {
    await gw.stop();
    repo.close();
    rmSync(runtimeDir, { recursive: true, force: true });
  }

  // Summarize telemetry across all three subsystems
  const cpaS1Calls = cpaLogs.filter((c) => c.tier === 'system1');
  const cpaS2Calls = cpaLogs.filter((c) => c.tier === 'system2');
  const cpaCompCalls = cpaLogs.filter((c) => c.tier === 'compiler');
  const cpaReflCalls = cpaLogs.filter((c) => c.tier === 'reflection');

  assert.equal(cpaS1Calls.length, 0, 'ZERO System 1 calls may route through CPA');

  const s1RemoteCalls = s1Logs.filter((l) => !l.degraded && l.usageSource !== 'local_rule_zero');
  const s1FallbackCalls = s1Logs.filter((l) => l.degraded || l.usageSource === 'local_rule_zero');
  const s1DecisionDist = s1Logs.reduce<Record<string, number>>((acc, item) => {
    const key = `${item.cognitiveState}:${item.interventionNeed}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const sumCpaTokens = (rows: CpaCallLogEntry[]) =>
    rows.reduce(
      (acc, r) => ({
        calls: acc.calls + 1,
        inputTokens: acc.inputTokens + r.inputTokens,
        outputTokens: acc.outputTokens + r.outputTokens,
        reasoningTokens: acc.reasoningTokens + r.reasoningTokens,
        cachedInputTokens: acc.cachedInputTokens + r.cachedInputTokens,
        totalTokens: acc.totalTokens + r.totalTokens,
      }),
      { calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedInputTokens: 0, totalTokens: 0 },
    );

  const report = sanitizeDeep(
    {
      generatedAt: new Date().toISOString(),
      strictSilentMode: true,
      audioPlaybackTriggered: false,
      routingVerification: {
        s1CallsRoutedToCpa: cpaS1Calls.length,
        colabAsrUnauthorizedHttp: asrUnauthCode,
        colabS1UnauthorizedHttp: s1UnauthCode,
        asrCapability: asrProbe,
        s1DirectKeepAliveProbes: s1DirectProbes,
        cpaResponsesVsChatComparison: {
          model: 'gemini-4-hydrogen',
          reasoningEffort: 'medium',
          responses: modeBench.responses,
          chat_completions: modeBench.chat_completions,
        },
        initialGatewayHealth: initialHealthSnap!,
        finalGatewayHealth: finalHealthSnap!,
      },
      compiledPackSummary,
      gatewayThreeWayTelemetry: {
        system1: {
          backend: initialHealthSnap!.system1.backend,
          model: initialHealthSnap!.system1.model,
          promptFormat: initialHealthSnap!.system1.promptFormat,
          calibrated: initialHealthSnap!.system1.calibrated,
          totalEvaluations: s1Logs.length,
          remoteJevCalls: s1RemoteCalls.length,
          localFallbackCalls: s1FallbackCalls.length,
          latencyStatsMs: summarizeLatency(s1RemoteCalls.map((r) => r.latencyMs)),
          decisionDistribution: s1DecisionDist,
        },
        system2AndCpaTiers: {
          system2: {
            ...sumCpaTokens(cpaS2Calls),
            model: 'gemini-4-hydrogen',
            reasoningEffort: 'medium',
            latencyStatsMs: summarizeLatency(cpaS2Calls.map((r) => r.latencyMs)),
          },
          compiler: {
            ...sumCpaTokens(cpaCompCalls),
            model: 'gemini-4-hydrogen',
            reasoningEffort: 'medium',
            latencyStatsMs: summarizeLatency(cpaCompCalls.map((r) => r.latencyMs)),
          },
          reflection: {
            ...sumCpaTokens(cpaReflCalls),
            model: 'gemini-4-hydrogen',
            reasoningEffort: 'medium',
            latencyStatsMs: summarizeLatency(cpaReflCalls.map((r) => r.latencyMs)),
          },
        },
        dualSystemCollaboration: finalDualMetrics!,
        reflectionResult,
      },
      scenarios: scenarioResults,
    },
    sanitize,
  );

  const serialized = JSON.stringify(report, null, 2);
  // 最终安全核查：严禁任何密钥前缀、裸域名或用户目录路径落盘
  assert.ok(!/\/Users\//.test(serialized), 'Report must not contain /Users/ local path');
  assert.ok(!/sk-[A-Za-z0-9]{10,}/.test(serialized), 'Report must not contain raw API keys');

  mkdirSync(path.dirname(RUNTIME_REPORT_PATH), { recursive: true });
  mkdirSync(path.dirname(EVIDENCE_REPORT_PATH), { recursive: true });
  writeFileSync(RUNTIME_REPORT_PATH, serialized, 'utf8');
  writeFileSync(EVIDENCE_REPORT_PATH, serialized, 'utf8');

  console.log('[wave4] Three-way real dual-system validation completed cleanly!');
  console.log(serialized);
}

main().catch((err) => {
  console.error('[wave4] Validation failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
