import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type {
  FastDecisionInput,
  FastDecisionVerdict,
  ServerMessage,
  SlowReasoningCandidateRequest,
  SlowReasoningCandidateResult,
  System2Guidance,
} from '@cuex/protocol';
import { loadServerConfig } from '../src/config';
import { CueXGatewayServer } from '../src/gateway/GatewayServer';
import {
  CognitiveRuntimeSession,
  CpaClient,
  CpaFastDecisionProvider,
  FallbackFastDecisionProvider,
  HeuristicFastDecisionProvider,
  InterventionController,
  LexicalBm25RetrievalProvider,
  LlamaFastDecisionProvider,
  LocalSlowReasoningProvider,
  ManualClock,
  MemoryStore,
  createFastDecisionProvider,
  msToIso,
  resolveCpaConfig,
} from '../src/runtime';
import {
  PresentationRuntimePlugin,
  SAMPLE_PRESENTATION_PACK,
  toUniversalContextPack,
} from '../src/scenarios';
import { SqliteRepository } from '../src/storage';
import {
  DEFAULT_CUEX_S1_MODEL,
  LlamaSystemOne,
  resolveLlamaSystemOneConfig,
} from '../src/system1';
import { TextOnlyAsr } from '../src/voice';

const JEV_27B_META = JSON.parse(
  readFileSync(new URL('../src/system1/autotrust-jev27b.json', import.meta.url), 'utf8'),
) as {
  decisionHead: {
    bias: number[];
    verbalizer_ids: number[];
    slots: { ranges: Record<'noul' | 'choice' | 'score', [number, number]> };
  };
  calibration: { per_kind: Record<'noul' | 'choice' | 'score', number> };
};

const JEV_9B_META = JSON.parse(
  readFileSync(new URL('../src/system1/autotrust-jev9b.json', import.meta.url), 'utf8'),
) as {
  decisionHead: {
    bias: number[];
    verbalizer_ids: number[];
  };
  calibration: { per_kind: Record<'noul' | 'choice' | 'score', number> };
};

function createTestRuntimeHarness(opts?: {
  fastDecision?: ConstructorParameters<typeof CognitiveRuntimeSession>[0]['fastDecision'];
  slowReasoning?: ConstructorParameters<typeof CognitiveRuntimeSession>[0]['slowReasoning'];
  asyncSystem2?: boolean;
  ceiling?: 'L0' | 'L1' | 'L2' | 'L3';
  silentMode?: boolean;
  cooldownMs?: number;
  candidateTtlMs?: number;
  dismissSuppressionMs?: number;
}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cuex-dual-sys-'));
  const clock = new ManualClock(1_700_100_000_000);
  const emitted: ServerMessage[] = [];
  const pack = structuredClone(SAMPLE_PRESENTATION_PACK);
  const plugin = new PresentationRuntimePlugin({
    sessionId: 'sess_dual_test',
    mode: 'live',
    viewMode: 'focus',
    pack,
    startedAt: clock.now(),
  });
  const memoryStore = new MemoryStore(path.join(dir, 'memory'));
  const runtime = new CognitiveRuntimeSession({
    sessionId: 'sess_dual_test',
    mode: 'live',
    viewMode: 'focus',
    silentMode: opts?.silentMode ?? false,
    maxInterventionLevel: opts?.ceiling ?? 'L3',
    privacyNoticeAccepted: true,
    contextPack: toUniversalContextPack(pack),
    goal: pack.goal,
    audience: pack.audience,
    targetDurationSec: pack.targetDurationSec,
    constraints: pack.cueSheet.chapters.map((c) => c.coreMessage),
    forbiddenClaims: pack.forbiddenClaims,
    initialChapterId: pack.progressNodes[0].chapterId,
    initialChapterTitle: pack.progressNodes[0].title,
    asrStatus: {
      backend: 'text-only',
      mode: 'text_simulation',
      available: true,
      streaming: false,
      detail: 'test',
    },
    plugin,
    fastDecision: opts?.fastDecision ?? new HeuristicFastDecisionProvider(),
    slowReasoning: opts?.slowReasoning ?? new LocalSlowReasoningProvider({ candidateTtlMs: opts?.candidateTtlMs ?? 12_000 }),
    retrieval: new LexicalBm25RetrievalProvider(),
    controller: new InterventionController({
      cooldownMs: opts?.cooldownMs ?? 15_000,
      candidateTtlMs: opts?.candidateTtlMs ?? 12_000,
      dismissSuppressionMs: opts?.dismissSuppressionMs ?? 45_000,
    }),
    memoryStore,
    clock,
    asyncSystem2: opts?.asyncSystem2 ?? false,
    emitMessage: (msg) => {
      emitted.push(msg);
    },
  });

  return {
    dir,
    clock,
    emitted,
    pack,
    plugin,
    memoryStore,
    runtime,
    cleanup: () => {
      try {
        runtime.end(2);
      } catch {
        // already ended
      }
      memoryStore.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('System 1/2 model routing: S1 real routes strictly to Colab/local JEV stack, never CPA, and S2 defaults to gemini-4-hydrogen medium', async (t) => {
  // 1. Offline/unconfigured guard for createFastDecisionProvider('real')
  const degraded = createFastDecisionProvider('real', {
    CUEX_TEST_OFFLINE: '1',
    CUEX_S1_URL: 'https://127.0.0.1:10010',
    CUEX_S1_API_KEY: 's1-secret-token',
  });
  assert.equal(degraded.mode, 'local_fallback');
  const degradedHealth = await degraded.health();
  assert.equal(degradedHealth.ok, false);
  assert.equal(degradedHealth.fallbackActive, true);
  assert.equal(degradedHealth.promptFormat, 'rule_zero');
  assert.equal(degradedHealth.calibrated, false);

  // 2. Even with CPA env present and CUEX_S1_URL absent, S1 MUST NOT route to CPA
  const noCpaFallback = createFastDecisionProvider('real', {
    CUEX_S1_FORCE_IN_OFFLINE_TEST: '1',
    CPA_BASE_URL: 'https://api.example.test/v1',
    CPA_API_KEY: 'sk-test-cpa-key',
  });
  assert.equal(noCpaFallback.mode, 'local_fallback');
  assert.ok(!(noCpaFallback instanceof CpaFastDecisionProvider));

  // 3. When S1 config is active, createFastDecisionProvider('real') wraps LlamaFastDecisionProvider
  const activeS1Cfg = resolveLlamaSystemOneConfig({
    CUEX_S1_FORCE_IN_OFFLINE_TEST: '1',
    CUEX_S1_URL: 'http://127.0.0.1:10010',
    CUEX_S1_API_KEY: 's1-secret-token',
    CUEX_S1_FORMAT: 'jev-v1',
  });
  assert.ok(activeS1Cfg);
  assert.equal(activeS1Cfg.model, DEFAULT_CUEX_S1_MODEL);
  assert.equal(activeS1Cfg.promptFormat, 'jev-v1');
  const activeLocalProvider = createFastDecisionProvider('real', {
    CUEX_S1_FORCE_IN_OFFLINE_TEST: '1',
    CUEX_S1_URL: 'http://127.0.0.1:10010',
    CUEX_S1_API_KEY: 's1-secret-token',
  });
  assert.ok(activeLocalProvider instanceof FallbackFastDecisionProvider);
  assert.equal(activeLocalProvider.backend, 'llama-jev-27b');

  const activeRemoteProvider = createFastDecisionProvider('real', {
    CUEX_S1_FORCE_IN_OFFLINE_TEST: '1',
    CUEX_S1_URL: 'https://s1.example.test:10010',
    CUEX_S1_API_KEY: 's1-secret-token',
  });
  assert.ok(activeRemoteProvider instanceof FallbackFastDecisionProvider);
  assert.equal(activeRemoteProvider.backend, 'colab-jev-27b');

  // 4. Mock JEV HTTP server verifying: Bearer auth, 401 failure, JEV-27B vs JEV-9B metadata,
  //    single + bias zero double-counting vs unbiased W@h, Keep-Alive connection reuse & stale socket retry.
  let authHeadersSeen: string[] = [];
  let connectionRemotePorts: number[] = [];
  let headFormulaMode: 'unbiased' | 'biased' = 'unbiased';
  let rejectWith401 = false;
  let dropNextCompletion = false;
  let completionCalls = 0;

  const server = http.createServer((req, res) => {
    authHeadersSeen.push(String(req.headers.authorization ?? ''));
    if (req.socket.remotePort) {
      connectionRemotePorts.push(req.socket.remotePort);
    }

    if (rejectWith401) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', model: 'autotrust/JEV-27B' }));
      return;
    }

    if (req.url === '/completion' && req.method === 'POST') {
      completionCalls += 1;
      if (dropNextCompletion) {
        dropNextCompletion = false;
        req.socket.destroy();
        return;
      }

      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk.toString();
      });
      req.on('end', () => {
        const body = JSON.parse(raw) as { logit_bias?: [number, number][] };
        const firstId = body.logit_bias?.[0]?.[0];
        const secondId = body.logit_bias?.[1]?.[0];
        // Return equal raw probs [0.5, 0.5] so exact difference from bias[0] vs bias[1] is cleanly measurable
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            headFormula:
              headFormulaMode === 'unbiased' ? 'unbiased_head_proj(W@h)' : 'biased_head_proj',
            tokens_evaluated: 42,
            tokens_predicted: 1,
            tokens_cached: 30,
            completion_probabilities: [
              {
                top_probs: [
                  { id: firstId, token: 'false', prob: 0.5 },
                  { id: secondId, token: 'true', prob: 0.5 },
                ],
              },
            ],
          }),
        );
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });
  server.keepAliveTimeout = 10_000;

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const s1BaseUrl = `http://127.0.0.1:${addr.port}`;

  const jev27 = new LlamaSystemOne({
    baseUrl: s1BaseUrl,
    apiKey: 's1-live-token-xyz',
    model: 'autotrust/JEV-27B',
    promptFormat: 'jev-v1',
  });
  const jev9 = new LlamaSystemOne({
    baseUrl: s1BaseUrl,
    apiKey: 's1-live-token-xyz',
    model: 'autotrust/JEV-9B',
    promptFormat: 'jev-v1',
  });

  t.after(async () => {
    jev27.close();
    jev9.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // 4a. Check health + Bearer token + 27B vs 9B verbalizer metadata selection
  const h27 = await jev27.health();
  assert.equal(h27.ok, true);
  assert.equal(h27.promptFormat, 'jev-v1');
  assert.equal(h27.calibrated, true);
  assert.equal(authHeadersSeen[0], 'Bearer s1-live-token-xyz');

  // 4b. Verify single + bias math on unbiased_head_proj(W@h) vs zero double-bias on biased_head_proj
  headFormulaMode = 'unbiased';
  const q = { q0: { kind: 'noul' as const, question: 'Need cue?' } };
  const resUnbiased = await jev27.decide('state', q);
  const b0 = JEV_27B_META.decisionHead.bias[0];
  const b1 = JEV_27B_META.decisionHead.bias[1];
  const temp27 = JEV_27B_META.calibration.per_kind.noul;
  const w0 = (Math.log(0.5) + b0) / temp27;
  const w1 = (Math.log(0.5) + b1) / temp27;
  const m = Math.max(w0, w1);
  const expectedFalseProb = Math.exp(w0 - m) / (Math.exp(w0 - m) + Math.exp(w1 - m));
  assert.ok(
    Math.abs((resUnbiased.answers.q0.probabilities.false ?? 0) - expectedFalseProb) < 1e-9,
    'unbiased W@h applies decisionHead.bias / T_noul exactly once',
  );
  assert.equal(resUnbiased.answers.q0.selectedSlot, b0 >= b1 ? 0 : 1);

  headFormulaMode = 'biased';
  const resAlreadyBiased = await jev27.decide('state', q);
  assert.ok(
    Math.abs((resAlreadyBiased.answers.q0.probabilities.false ?? 0) - 0.5) < 1e-9,
    'biased_head_proj skips client bias so bias is never double-counted',
  );

  // 4c. Compare JEV-9B selects JEV-9B verbalizer_ids & bias
  assert.notDeepEqual(JEV_27B_META.decisionHead.bias[0], JEV_9B_META.decisionHead.bias[0]);
  headFormulaMode = 'unbiased';
  const res9b = await jev9.decide('state', q);
  const w9_0 = (Math.log(0.5) + JEV_9B_META.decisionHead.bias[0]) / JEV_9B_META.calibration.per_kind.noul;
  const w9_1 = (Math.log(0.5) + JEV_9B_META.decisionHead.bias[1]) / JEV_9B_META.calibration.per_kind.noul;
  const m9 = Math.max(w9_0, w9_1);
  const expected9False = Math.exp(w9_0 - m9) / (Math.exp(w9_0 - m9) + Math.exp(w9_1 - m9));
  assert.ok(Math.abs((res9b.answers.q0.probabilities.false ?? 0) - expected9False) < 1e-9);

  // 4d. Keep-Alive connection reuse across multiple sequential calls on jev27
  const portsBefore = connectionRemotePorts.length;
  await jev27.decide('state-ka-1', q);
  await jev27.decide('state-ka-2', q);
  const kaPorts = connectionRemotePorts.slice(portsBefore);
  assert.equal(kaPorts.length, 2);
  assert.equal(kaPorts[0], kaPorts[1], 'HTTP Keep-Alive reuses persistent socket across calls');

  // 4e. Stale socket reuse retry (first socket reset recovers cleanly on retry)
  dropNextCompletion = true;
  const callsBeforeRetry = completionCalls;
  const retryRes = await jev27.decide('state-retry', q);
  assert.equal(completionCalls, callsBeforeRetry + 2);
  assert.ok(retryRes.answers.q0);

  // 4f. 401 unauthorized handling: redacts Bearer secret & FallbackFastDecisionProvider exposes degraded attribution
  rejectWith401 = true;
  const wrapped401 = new FallbackFastDecisionProvider(
    new LlamaFastDecisionProvider(jev27),
    new HeuristicFastDecisionProvider(),
  );
  const fallbackVerdict = await wrapped401.evaluate({
    sessionId: 'sess_auth_check',
    scenarioId: 'presentation',
    contextVersion: 1,
    timestamp: msToIso(Date.now()),
    activeGoal: 'goal',
    activeChapterId: 'ch1',
    activeChapterTitle: 'Opening',
    expectedPoints: [],
    recentSegments: [],
    recentTextDigest: '今天正常介绍核心思路',
    silenceDurationMs: 0,
  });
  assert.equal(fallbackVerdict.usage?.degraded, true);
  assert.ok(!fallbackVerdict.reason.includes('s1-live-token-xyz'));
  const fallbackHealth = await wrapped401.health();
  assert.equal(fallbackHealth.fallbackActive, true);
  assert.equal(fallbackHealth.ok, false);
  assert.ok(!fallbackHealth.detail.includes('s1-live-token-xyz'));

  // 5. CPA S2 config defaults to gemini-4-hydrogen + reasoningEffort=medium for both responses and chat_completions
  const cpaCfg = resolveCpaConfig({
    env: {
      CPA_FORCE_IN_OFFLINE_TEST: '1',
      CPA_BASE_URL: 'https://cpa.example.test/v1',
      CPA_API_KEY: 'sk-test-cpa-secret',
    },
  });
  assert.ok(cpaCfg);
  assert.equal(cpaCfg.system2Model, 'gemini-4-hydrogen');
  assert.equal(cpaCfg.compilerModel, 'gemini-4-hydrogen');
  assert.equal(cpaCfg.reflectionModel, 'gemini-4-hydrogen');
  assert.equal(cpaCfg.system2ReasoningEffort, 'medium');

  const capturedPayloads: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fakeFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    capturedPayloads.push({ url: urlStr, body });
    const isResp = urlStr.endsWith('/responses');
    return new Response(
      JSON.stringify(
        isResp
          ? {
              id: 'resp_1',
              output_text: '{"status":"synthesized","title":"提示","cueText":"请补充关键结论","bullets":[],"evidenceIds":[],"grounded":false}',
              usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 },
            }
          : {
              id: 'chat_1',
              choices: [
                {
                  message: {
                    content: '{"status":"synthesized","title":"提示","cueText":"请补充关键结论","bullets":[],"evidenceIds":[],"grounded":false}',
                  },
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
            },
      ),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  const cpaRespClient = new CpaClient(cpaCfg, { fetch: fakeFetch });
  await cpaRespClient.completeJson({ tier: 'system2', systemPrompt: 's', userPrompt: 'u' });
  const cpaChatCfg = resolveCpaConfig({
    env: {
      CPA_FORCE_IN_OFFLINE_TEST: '1',
      CUEX_CPA_BASE_URL: 'https://cpa.example.test/v1',
      CUEX_CPA_API_KEY: 'sk-test-cpa-secret',
      CUEX_CPA_API_MODE: 'chat_completions',
      CUEX_CPA_REASONING_EFFORT: 'high',
    },
  });
  assert.ok(cpaChatCfg);
  assert.equal(cpaChatCfg.system2ReasoningEffort, 'high');
  const cpaChatClient = new CpaClient(cpaChatCfg, { fetch: fakeFetch });
  await cpaChatClient.completeJson({ tier: 'system2', systemPrompt: 's', userPrompt: 'u' });

  assert.deepEqual(capturedPayloads[0].body.reasoning, { effort: 'medium' });
  assert.equal(capturedPayloads[1].body.reasoning_effort, 'high');

  // 6. Gateway decoupling: CUEX_SYSTEM1=real with CUEX_SYSTEM2=fake does not initialize CPA & exposes independent attribution
  const gwDir = mkdtempSync(path.join(os.tmpdir(), 'cuex-gw-decouple-'));
  const repo = new SqliteRepository(path.join(gwDir, 'test.db'));
  const gwConfig = loadServerConfig({
    CUEX_RUNTIME_DIR: gwDir,
    CUEX_SYSTEM1: 'real',
    CUEX_SYSTEM2: 'fake',
    CUEX_ASR: 'fake',
    CUEX_AUTH_REQUIRED: 'false',
  });
  const gateway = new CueXGatewayServer({
    config: { ...gwConfig, host: '127.0.0.1', port: 0 },
    repo,
    fastDecision: wrapped401,
    asrEngine: new TextOnlyAsr(),
  });
  const { port: gwPort } = await gateway.start();
  t.after(async () => {
    await gateway.stop();
    repo.close();
    rmSync(gwDir, { recursive: true, force: true });
  });
  const healthRes = await fetch(`http://127.0.0.1:${gwPort}/health`);
  const healthJson = (await healthRes.json()) as Record<string, any>;
  assert.equal(healthJson.system1.mode, 'local_fallback');
  assert.equal(healthJson.system1.fallbackActive, true);
  assert.equal(healthJson.system2.mode, 'local_fallback');
  assert.equal(healthJson.compiler.mode, 'local_fallback');
  assert.equal(healthJson.reflection.mode, 'local_fallback');
  assert.ok(healthJson.dualSystemMetrics);
});

test('Async bidirectional S1<->S2 collaboration: non-blocking S1, coalescing, preemption, stale cancel, guidance loop, and urgent override', async (t) => {
  const s2Started: Array<{ triggerKind: string; text: string; turnSeq: number }> = [];
  const s2Resolvers: Array<{
    req: SlowReasoningCandidateRequest;
    signal?: AbortSignal;
    resolve: (res: SlowReasoningCandidateResult) => void;
    reject: (err: Error) => void;
  }> = [];

  const controlledSlowProvider = {
    backend: 'controlled-async-s2',
    mode: 'real' as const,
    async health() {
      return {
        ok: true,
        detail: 'controlled async s2',
        model: 'gemini-4-hydrogen',
        reasoningEffort: 'medium' as const,
      };
    },
    synthesize(req: SlowReasoningCandidateRequest, signal?: AbortSignal) {
      s2Started.push({
        triggerKind: req.triggerKind,
        text: req.recentTextDigest,
        turnSeq: req.basedOnTurnSeq ?? 0,
      });
      return new Promise<SlowReasoningCandidateResult>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const entry = { req, signal, resolve, reject };
        s2Resolvers.push(entry);
        signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('Aborted as stale', 'AbortError'));
          },
          { once: true },
        );
      });
    },
  };

  let s1InputsSeen: FastDecisionInput[] = [];
  const spyS1 = new HeuristicFastDecisionProvider();
  const wrappingS1 = {
    backend: spyS1.backend,
    mode: spyS1.mode,
    health: () => spyS1.health(),
    async evaluate(input: FastDecisionInput, signal?: AbortSignal): Promise<FastDecisionVerdict> {
      s1InputsSeen.push(input);
      return spyS1.evaluate(input, signal);
    },
  };

  const harness = createTestRuntimeHarness({
    fastDecision: wrappingS1,
    slowReasoning: controlledSlowProvider,
    asyncSystem2: true,
    cooldownMs: 0,
  });
  t.after(() => harness.cleanup());

  const makeGuidanceAndResult = (
    req: SlowReasoningCandidateRequest,
    bias: System2Guidance['recommendedBias'],
    directive: string,
  ): SlowReasoningCandidateResult => {
    const nowMs = harness.clock.now();
    const evidenceId = harness.pack.evidence[0].evidenceId;
    return {
      requestId: req.requestId,
      sessionId: req.sessionId,
      contextVersion: req.contextVersion,
      timestamp: msToIso(nowMs),
      status: 'synthesized',
      candidate: {
        candidateId: `cand_${req.requestId}`,
        sessionId: req.sessionId,
        level: bias === 'qa_grounding' ? 'L2' : 'L1',
        title: directive,
        cueText: '请补充真实评测架构数据',
        bullets: ['说明为什么不依赖纯停顿触发'],
        priority: req.triggerKind === 'live_qa' ? 95 : 70,
        ttlMs: 12_000,
        expiresAt: msToIso(nowMs + 12_000),
        contextVersion: req.contextVersion,
        evidenceIds: [evidenceId],
        basedOnSegmentId: req.basedOnSegmentId,
        status: 'pending',
        createdAt: msToIso(nowMs),
        kind: req.triggerKind === 'live_qa' ? 'qa_grounding' : 'drift_recovery',
        grounded: true,
      },
      guidance: {
        guidanceId: `guid_${req.requestId}`,
        sessionId: req.sessionId,
        revision: 1,
        contextVersion: req.contextVersion,
        basedOnTurnSeq: req.basedOnTurnSeq ?? 0,
        staleAfterTurnSeq: (req.basedOnTurnSeq ?? 0) + 4,
        issuedAtMs: nowMs,
        expiresAtMs: nowMs + 25_000,
        issuedAt: msToIso(nowMs),
        expiresAt: msToIso(nowMs + 25_000),
        targetChapterId: req.activeChapterId,
        focusDirective: directive,
        strategyHints: ['优先点出事件驱动闭环'],
        recommendedBias: bias,
        evidenceAnchors: [evidenceId],
        grounded: true,
        triggerKind: req.triggerKind,
        provider: 'controlled-async-s2',
        model: 'gemini-4-hydrogen',
      },
      evidenceIds: [evidenceId],
      grounded: true,
      latencyMs: 35,
      backend: 'controlled-async-s2',
    };
  };

  // 1. Non-blocking S1: drift turn dispatches S2 asynchronously while ingestSpeech resolves IMMEDIATELY before S2 finishes
  harness.clock.advance(500);
  const t0 = performance.now();
  await harness.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '今天天气不错我们先聊聊外面的咖啡厅菜单吧',
    isFinal: true,
    source: 'text_simulation',
  });
  const s1WallMs = performance.now() - t0;
  assert.ok(s1WallMs < 150, `S1 ingestSpeech must not wait for pending S2 (${s1WallMs}ms)`);
  assert.equal(s2Resolvers.length, 1, 'S2 #1 is now in-flight asynchronously');
  assert.ok(
    harness.emitted.some((m) => m.type === 'system1.verdict'),
    'S1 verdict emitted immediately',
  );

  // 2. Coalescing: 2 rapid drift turns while S2 #1 is in-flight replace pending slot cleanly (`s2Coalesced >= 1`)
  harness.clock.advance(200);
  await harness.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '我再补充一句今天的午饭和天气都不错',
    isFinal: true,
    source: 'text_simulation',
  });
  harness.clock.advance(200);
  await harness.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '还有昨天那场足球比赛也很精彩',
    isFinal: true,
    source: 'text_simulation',
  });
  let metrics = harness.runtime.state.getDualSystemMetrics();
  assert.ok(metrics.s2Coalesced >= 1, 'rapid lower/equal priority dispatches coalesce while S2 is busy');

  // 3. High-priority preemption: audience open question (`live_qa`) preempts queued/in-flight drift S2 (`s2CancelledAsStale >= 1`)
  harness.clock.advance(200);
  await harness.runtime.ingestSpeech({
    speaker: 'audience',
    text: '请问你们为什么不能只靠 LLM 停顿时间做提醒？',
    isFinal: true,
    source: 'text_simulation',
  });
  metrics = harness.runtime.state.getDualSystemMetrics();
  assert.ok(metrics.s2CancelledAsStale >= 1, 'live_qa preempts low-priority background S2');

  // Resolve the preempted flight late? It's already aborted, waiting briefly and resolving active live_qa task
  await new Promise((r) => setTimeout(r, 10));
  const qaFlight = s2Resolvers[s2Resolvers.length - 1];
  assert.equal(qaFlight.req.triggerKind, 'live_qa');
  qaFlight.resolve(makeGuidanceAndResult(qaFlight.req, 'stay_silent', '暂时保持静默观察'));
  await harness.runtime.waitForSystem2Idle();

  // Verify System2Guidance write-back & `system2.guidance` emission
  const guidanceMsgs = harness.emitted.filter((m) => m.type === 'system2.guidance');
  assert.equal(guidanceMsgs.length, 1);
  assert.equal(guidanceMsgs[0].payload.revision, 1);
  assert.equal(guidanceMsgs[0].payload.recommendedBias, 'stay_silent');

  // 4. Turn N+1 S1 reads active `stay_silent` guidance from blackboard and increments `guidanceAppliedCount`
  harness.clock.advance(500);
  await harness.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '今天主要向大家汇报一下 CueX 演示工作流',
    isFinal: true,
    source: 'text_simulation',
  });
  const lastS1Input = s1InputsSeen[s1InputsSeen.length - 1];
  assert.equal(lastS1Input.activeGuidance?.revision, 1);
  metrics = harness.runtime.state.getDualSystemMetrics();
  assert.ok(metrics.guidanceAppliedCount >= 1, 'S1 Turn N+1 reads and applies active guidance');

  // 5. Urgent audience question overrides `stay_silent` guidance (`guidanceExpiredOrOverridden >= 1`)
  harness.clock.advance(400);
  await harness.runtime.ingestSpeech({
    speaker: 'audience',
    text: '那你们怎么保证绝对不编造指标数字呢？',
    isFinal: true,
    source: 'text_simulation',
  });
  metrics = harness.runtime.state.getDualSystemMetrics();
  assert.ok(metrics.guidanceExpiredOrOverridden >= 1, 'urgent audience question overrides stale stay_silent guidance');
  const latestQa = s2Resolvers[s2Resolvers.length - 1];
  latestQa.resolve(makeGuidanceAndResult(latestQa.req, 'qa_grounding', '用白名单事实作答'));
  await harness.runtime.waitForSystem2Idle();

  // 6. Chapter change (`contextVersion` bump) cancels active in-flight S2 & increments `s2CancelledAsStale`
  harness.clock.advance(1000);
  await harness.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '又聊到电影票房了，和演示无关',
    isFinal: true,
    source: 'text_simulation',
  });
  const inflightBeforeChapter = s2Resolvers[s2Resolvers.length - 1];
  const staleBefore = harness.runtime.state.getDualSystemMetrics().s2CancelledAsStale;
  harness.runtime.setChapter(harness.pack.progressNodes[1].chapterId);
  assert.equal(inflightBeforeChapter.signal?.aborted, true, 'chapter.set aborts stale in-flight S2');
  // Late resolve attempt must be discarded without emitting intervention.shown
  const shownBeforeLate = harness.emitted.filter((m) => m.type === 'intervention.shown').length;
  inflightBeforeChapter.resolve(makeGuidanceAndResult(inflightBeforeChapter.req, 'prefer_l2', '陈旧章节提示'));
  await harness.runtime.waitForSystem2Idle();
  const shownAfterLate = harness.emitted.filter((m) => m.type === 'intervention.shown').length;
  assert.equal(shownAfterLate, shownBeforeLate, 'late stale S2 result is discarded cleanly');
  assert.ok(harness.runtime.state.getDualSystemMetrics().s2CancelledAsStale > staleBefore);

  // 7. TTL / turnSeq expiry check on shared cognitive blackboard
  const testGuid: System2Guidance = {
    guidanceId: 'guid_ttl_test',
    sessionId: harness.runtime.sessionId,
    revision: 99,
    contextVersion: harness.runtime.state.getContextVersion(),
    basedOnTurnSeq: harness.runtime.state.getTurnSeq(),
    staleAfterTurnSeq: harness.runtime.state.getTurnSeq() + 1,
    issuedAtMs: harness.clock.now(),
    expiresAtMs: harness.clock.now() + 2_000,
    issuedAt: msToIso(harness.clock.now()),
    expiresAt: msToIso(harness.clock.now() + 2_000),
    focusDirective: '短暂指导',
    strategyHints: ['短窗校验'],
    recommendedBias: 'prefer_l1',
    evidenceAnchors: [],
    grounded: true,
    triggerKind: 'omission',
  };
  harness.runtime.state.commitSystem2Guidance(testGuid, harness.clock.now());
  assert.ok(harness.runtime.state.getActiveGuidance(harness.clock.now()));
  harness.clock.advance(2_500);
  const expired = harness.runtime.state.getActiveGuidance(harness.clock.now());
  assert.equal(expired, null, 'guidance expires cleanly after TTL');
});

test('CueX Presentation 19-scenario behavioral conformance suite (L0-L3, withdrawals, grounding honesty, V = H - λI)', async (t) => {
  // Runs deterministic synchronous verification across all 19 presentation behavioral cases
  const h = createTestRuntimeHarness({ asyncSystem2: false, cooldownMs: 5_000, candidateTtlMs: 10_000 });
  t.after(() => h.cleanup());

  const countShown = () => h.emitted.filter((m) => m.type === 'intervention.shown').length;
  const countWithdrawn = (reason?: string) =>
    h.emitted.filter(
      (m) =>
        m.type === 'intervention.withdrawn' &&
        (reason ? m.payload.reason === reason : true),
    ).length;

  // Case 1: Fluent opening greeting -> L0 stay_silent
  h.clock.advance(1_000);
  await h.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '大家好，今天由我来演示 CueX 双系统实时认知协助工作台。',
    isFinal: true,
    source: 'text_simulation',
  });
  assert.equal(countShown(), 0, 'Case 1: fluent opening stays L0 quiet');

  // Case 2: Pure short silence without semantic gap -> suppressed
  h.clock.advance(2_200);
  await h.runtime.processTick(2_200);
  assert.equal(countShown(), 0, 'Case 2: pure short silence suppressed');

  // Case 3: Longer silence tick (5000ms) while context clean -> suppressed
  h.clock.advance(5_000);
  await h.runtime.processTick(5_000);
  assert.equal(countShown(), 0, 'Case 3: long silence without gap suppressed');

  // Case 4: Natural presentation advance touching chapter 1 points
  h.clock.advance(1_500);
  await h.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '很多演讲者在高压临场问答时容易忘记核心证据链与时间边界，而传统提词器无法理解上下文。',
    isFinal: true,
    source: 'text_simulation',
  });
  assert.equal(countShown(), 0, 'Case 4: grounded chapter progression stays quiet');

  // Case 5: Topic drift triggers L1/L2 nudge
  h.clock.advance(2_000);
  const shownBeforeDrift = countShown();
  await h.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '顺便聊聊昨天晚上电影院旁边那家火锅店的蘸料配方真不错。',
    isFinal: true,
    source: 'text_simulation',
  });
  assert.equal(countShown(), shownBeforeDrift + 1, 'Case 5: off-topic drift triggers nudge');

  // Case 6: Presenter self-recovers onto topic -> auto withdrawal (`user_recovered`)
  h.clock.advance(1_500);
  await h.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '回到 CueX 本身，核心目标是在零编造前提下给出最低打扰认知提示。',
    isFinal: true,
    source: 'text_simulation',
  });
  assert.ok(countWithdrawn('user_recovered') >= 1, 'Case 6: user_recovered auto-withdraws drift cue');

  // Case 7: Trigger cue then change chapter -> auto withdrawal (`chapter_changed`)
  h.clock.advance(10_000);
  await h.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '今天周末逛街人特别多，餐厅排队好长啊。',
    isFinal: true,
    source: 'text_simulation',
  });
  assert.ok(h.runtime.state.getActiveIntervention(), 'Case 7a: active cue shown before chapter switch');
  h.clock.advance(500);
  h.runtime.setChapter(h.pack.progressNodes[1].chapterId);
  assert.ok(countWithdrawn('chapter_changed') >= 1, 'Case 7b: chapter_changed auto-withdraws old cue');

  // Case 8: Natural chapter transition text updates presentation progress
  h.clock.advance(2_000);
  await h.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '接下来我们进入双系统协同架构部分，看看事件驱动如何工作。',
    isFinal: true,
    source: 'text_simulation',
  });
  const progMsgs = h.emitted.filter((m) => m.type === 'presentation.progress');
  assert.ok(progMsgs.length >= 1, 'Case 8: progress events emitted cleanly');

  // Case 9: Grounded audience Q&A hits verified whitelist evidence
  h.clock.advance(6_000);
  const shownBeforeQa = countShown();
  await h.runtime.ingestSpeech({
    speaker: 'audience',
    text: '请问你们为什么不能只靠 LLM 停顿时间做提醒？',
    isFinal: true,
    source: 'text_simulation',
  });
  assert.equal(countShown(), shownBeforeQa + 1, 'Case 9: grounded audience Q&A surfaces answer card');
  const qaMsg = h.emitted.filter((m) => m.type === 'intervention.shown').pop();
  assert.equal(qaMsg?.type, 'intervention.shown');
  assert.equal(qaMsg.payload.intervention.grounded, true);
  assert.ok(qaMsg.payload.intervention.evidenceIds.length >= 1);

  // Case 10: Ungrounded out-of-scope Q&A honestly flags missing evidence and fabricates ZERO figures
  h.clock.advance(11_000);
  const shownBeforeUngrounded = countShown();
  await h.runtime.ingestSpeech({
    speaker: 'audience',
    text: '那你们明年第四季度营收预测和具体定价折扣率是多少？',
    isFinal: true,
    source: 'text_simulation',
  });
  assert.equal(countShown(), shownBeforeUngrounded + 1, 'Case 10: ungrounded Q&A triggers honest notice');
  const ungroundedMsg = h.emitted.filter((m) => m.type === 'intervention.shown').pop();
  assert.equal(ungroundedMsg?.type, 'intervention.shown');
  assert.equal(ungroundedMsg.payload.intervention.grounded, false);
  assert.ok(ungroundedMsg.payload.intervention.missingEvidenceNotice);
  assert.ok(!/\d{2,}/.test(ungroundedMsg.payload.intervention.cueText));

  // Case 11 & 12: Controller rejects fabricated numbers & forbidden claims from untrusted candidate
  const ver = h.runtime.state.getContextVersion();
  const fabOutcome = h.runtime.submitExternalCandidate(
    {
      candidateId: 'cand_fab_nums',
      sessionId: h.runtime.sessionId,
      level: 'L2',
      title: '伪造指标',
      cueText: '可回答准确率提升 99.8%，商业合同总额达 300万',
      priority: 95,
      ttlMs: 12_000,
      expiresAt: msToIso(h.clock.now() + 12_000),
      contextVersion: ver,
      evidenceIds: [h.pack.evidence[0].evidenceId],
      status: 'pending',
      createdAt: msToIso(h.clock.now()),
      kind: 'qa_grounding',
      grounded: true,
    },
    { openQuestion: true },
  );
  assert.equal(fabOutcome.decision.selectedAction, 'stay_silent', 'Case 11: ungrounded fabricated numbers blocked');

  if (h.pack.forbiddenClaims.length > 0) {
    const forbOutcome = h.runtime.submitExternalCandidate(
      {
        candidateId: 'cand_forb_claim',
        sessionId: h.runtime.sessionId,
        level: 'L2',
        title: '违禁声明',
        cueText: `我们的方案 ${h.pack.forbiddenClaims[0]}`,
        priority: 95,
        ttlMs: 12_000,
        expiresAt: msToIso(h.clock.now() + 12_000),
        contextVersion: ver,
        evidenceIds: [h.pack.evidence[0].evidenceId],
        status: 'pending',
        createdAt: msToIso(h.clock.now()),
        kind: 'qa_grounding',
        grounded: true,
      },
      { openQuestion: true },
    );
    assert.equal(forbOutcome.decision.selectedAction, 'stay_silent', 'Case 12: forbiddenClaims blocked');
  }

  // Case 13: Manual help overrides cooldown cleanly
  h.clock.advance(500);
  await h.runtime.requestManualHelp({
    preferredLevel: 'L3',
    question: '请帮我总结本节核心亮点',
  });
  const activeAfterHelp = h.runtime.state.getActiveIntervention();
  assert.ok(activeAfterHelp, 'Case 13: manual help produces immediate card');

  // Case 14: Dismiss intervention suppresses duplicate immediate triggers (`user_dismissed`)
  h.runtime.dismissIntervention({ interventionId: activeAfterHelp.interventionId });
  assert.ok(countWithdrawn('user_dismissed') >= 1, 'Case 14: dismiss triggers user_dismissed');
  h.runtime.recordFeedback(activeAfterHelp.interventionId, 'helpful');

  // Case 15: Silent mode suppresses non-manual triggers
  h.runtime.setSilentMode(true);
  h.clock.advance(6_000);
  const shownBeforeSilentDrift = countShown();
  await h.runtime.ingestSpeech({
    speaker: 'presenter',
    text: '再跑题聊一下旅游景点和美食攻略',
    isFinal: true,
    source: 'text_simulation',
  });
  assert.equal(countShown(), shownBeforeSilentDrift, 'Case 15: silentMode suppresses unsolicited nudges');
  h.runtime.setSilentMode(false);

  // Case 16: Ceiling capping (`maxInterventionLevel: L1`) prevents L3 cards unless explicitly capped
  h.runtime.setCeiling('L1');
  h.clock.advance(6_000);
  await h.runtime.requestManualHelp({
    preferredLevel: 'L3',
    question: '为什么不依赖纯停顿触发？',
  });
  const activeCapped = h.runtime.state.getActiveIntervention();
  if (activeCapped) {
    assert.ok(activeCapped.level === 'L1', `Case 16: ceiling L1 enforced cleanly (got ${activeCapped.level})`);
  }

  // Case 17: Candidate TTL expiry -> `reconcileBeforeReconnect` withdraws expired intervention
  h.clock.advance(15_000);
  h.runtime.reconcileBeforeReconnect();
  assert.ok(countWithdrawn('candidate_expired') >= 1, 'Case 17: expired intervention withdrawn as candidate_expired');

  // Case 18: Opt-in MemoryStore privacy check: rejects unconfirmed writes unless userConfirmed === true
  assert.throws(
    () =>
      h.memoryStore.create({
        scenarioId: 'presentation',
        scope: 'scenario',
        category: 'preference',
        content: '偏好简短关键词提示而非长段落',
        privacyLevel: 'private',
        userConfirmed: false as unknown as true,
      }),
    /userConfirmed === true/,
    'Case 18a: MemoryStore blocks unconfirmed writes',
  );
  assert.equal(h.memoryStore.list().length, 0, 'Case 18b: unconfirmed memory excluded from persisted store');

  // Case 19: Session end builds honest reflection & V = H - λI (λ = 2)
  const ended = h.runtime.end(2);
  assert.equal(ended.reflection.utility.lambda, 2);
  assert.equal(
    ended.reflection.utility.netUtilityScore,
    ended.reflection.utility.helpfulCount - 2 * ended.reflection.utility.distractingCount,
    'Case 19: reflection computes V = H - λI exactly',
  );
  assert.ok(ended.reflection.timeline.length >= 1);
});
