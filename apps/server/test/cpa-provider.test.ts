import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Evidence } from '@cuex/protocol';
import { loadServerConfig } from '../src/config';
import { CueXGatewayServer } from '../src/gateway/GatewayServer';
import {
  CognitiveRuntimeSession,
  CpaClient,
  CpaFastDecisionProvider,
  CpaSlowReasoningProvider,
  FallbackFastDecisionProvider,
  FallbackSlowReasoningProvider,
  HeuristicFastDecisionProvider,
  InterventionController,
  LexicalBm25RetrievalProvider,
  LocalSlowReasoningProvider,
  MemoryStore,
  SharedCognitiveStateStore,
  createFastDecisionProvider,
  createSlowReasoningProvider,
  enhanceCompiledPackWithCpa,
  enhanceReflectionWithCpa,
  extractCpaUsage,
  extractJsonObject,
  msToIso,
  resolveCpaConfig,
} from '../src/runtime';
import {
  PresentationRuntimePlugin,
  SAMPLE_PRESENTATION_PACK,
  compilePresentationPack,
} from '../src/scenarios';
import { buildPresentationReflection } from '../src/scenarios/presentation/PresentationReflection';
import { SqliteRepository } from '../src/storage';

test('resolveCpaConfig honors env precedence, dev models.json opt-in, offline lock, and secret redaction', () => {
  // Never auto-loads without explicit env or dev opt-in
  assert.equal(resolveCpaConfig({ env: {} }), null);

  // Offline lock suppresses CPA unless forced
  assert.equal(
    resolveCpaConfig({
      env: {
        CUEX_TEST_OFFLINE: '1',
        CPA_BASE_URL: 'https://api.example.test/v1',
        CPA_API_KEY: 'sk-test-secret-123456',
      },
    }),
    null,
  );

  // Explicit env vars win over models.json
  const fromEnv = resolveCpaConfig({
    env: {
      CPA_BASE_URL: 'https://user:pass@api.example.test/v1/',
      CPA_API_KEY: 'sk-test-secret-abcdef',
      CPA_SYSTEM1_MODEL: 'fast-model-x',
      CPA_SYSTEM2_MODEL: 'reason-model-y',
      CPA_TIMEOUT_MS: '18000',
    },
  });
  assert.ok(fromEnv);
  assert.equal(fromEnv.baseUrl, 'https://api.example.test/v1');
  assert.equal(fromEnv.system1Model, 'fast-model-x');
  assert.equal(fromEnv.system2Model, 'reason-model-y');
  assert.equal(fromEnv.timeoutMs, 18_000);
  assert.equal(fromEnv.source, 'env');
  assert.ok(!('apiKey' in fromEnv));
  assert.ok(!JSON.stringify(fromEnv).includes('sk-test-secret-abcdef'));
  assert.equal(
    fromEnv.redact('Failed calling https://api.example.test with sk-test-secret-abcdef'),
    'Failed calling https://api.example.test with [REDACTED_SECRET]',
  );

  // Opt-in temp models.json loader
  const dir = mkdtempSync(path.join(tmpdir(), 'cuex-cpa-cfg-'));
  try {
    const modelsPath = path.join(dir, 'models.json');
    writeFileSync(
      modelsPath,
      JSON.stringify({
        providers: {
          'gpt.kanglives.top': {
            baseUrl: 'https://proxy.example.test/v1',
            apiKey: 'secret-token-xyz-999',
            api: 'openai-responses',
            models: [
              { id: 'gemini-4-hydrogen', api: 'openai-responses' },
              { id: 'deepseek-v4.1-flash', api: 'openai-completions' },
            ],
          },
        },
      }),
      'utf8',
    );

    const fromDev = resolveCpaConfig({
      env: {
        CPA_MODELS_JSON: modelsPath,
        CPA_SYSTEM2_MODEL: 'deepseek-v4.1-flash',
      },
    });
    assert.ok(fromDev);
    assert.equal(fromDev.source, 'dev_models_json');
    assert.equal(fromDev.providerLabel, 'cpa:gpt.kanglives.top');
    assert.equal(fromDev.modelApiHints['gemini-4-hydrogen'], 'responses');
    assert.equal(fromDev.modelApiHints['deepseek-v4.1-flash'], 'chat_completions');
    assert.ok(!fromDev.redact('err secret-token-xyz-999').includes('secret-token-xyz-999'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('extractJsonObject and extractCpaUsage support responses + chat_completions, fences, reasoning_tokens, and unreported usage', () => {
  const fenced = extractJsonObject<{ ok: boolean }>('```json\n{"ok":true}\n```');
  assert.equal(fenced.ok, true);

  const proseWrapped = extractJsonObject<{ intent: string }>('思考完毕，结果如下：{"intent":"omission"} 完毕');
  assert.equal(proseWrapped.intent, 'omission');

  const respUsage = extractCpaUsage({
    usage: {
      input_tokens: 120,
      input_tokens_details: { cached_tokens: 30 },
      output_tokens: 260,
      output_tokens_details: { reasoning_tokens: 200 },
      total_tokens: 380,
    },
  });
  assert.deepEqual(respUsage, {
    inputTokens: 120,
    outputTokens: 260,
    cachedInputTokens: 30,
    reasoningTokens: 200,
    totalTokens: 380,
    usageReported: true,
  });

  const chatUsage = extractCpaUsage({
    usage: {
      prompt_tokens: 50,
      completion_tokens: 90,
      prompt_tokens_details: { cached_tokens: 10 },
      completion_tokens_details: { reasoning_tokens: 40 },
      total_tokens: 140,
    },
  });
  assert.equal(chatUsage.usageReported, true);
  assert.equal(chatUsage.reasoningTokens, 40);
  assert.equal(chatUsage.cachedInputTokens, 10);

  const unreported = extractCpaUsage({});
  assert.equal(unreported.usageReported, false);
  assert.equal(unreported.inputTokens, 0);
  assert.equal(unreported.outputTokens, 0);
});

test('CpaClient, CpaFastDecisionProvider, CpaSlowReasoningProvider, and SharedCognitiveStateStore handle /responses, unreported usage, and fallback cleanly', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const cfg = resolveCpaConfig({
    env: {
      CPA_BASE_URL: 'https://cpa.mock.local/v1',
      CPA_API_KEY: 'mock-cpa-secret-0001',
      CPA_SYSTEM1_MODEL: 'gemini-3.5-flash-lite',
      CPA_SYSTEM2_MODEL: 'gemini-4-hydrogen',
    },
  })!;

  // 1) Mock /responses returning unreported usage on S1, reported usage with reasoningTokens on S2
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    requests.push({ url, body });

    // Ensure reasoning budget is never starved
    assert.ok(Number(body.max_output_tokens) >= 1024);

    if (body.model === 'gemini-3.5-flash-lite') {
      return new Response(
        JSON.stringify({
          id: 'resp_1',
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: '```json\n{"cognitiveState":"omitting_key_point","interventionNeed":"trigger_l2","recommendedLevel":"L2","confidence":0.88,"missingPointIds":["kp_1"],"coveredPointIds":[],"driftDetected":false,"recoveryDetected":false,"reason":"遗漏核心延迟数据"}\n```',
                },
              ],
            },
          ],
          // Deliberately omit usage to verify provider_unreported attribution
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        id: 'resp_2',
        status: 'completed',
        output: [
          { type: 'reasoning', summary: [] },
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  status: 'synthesized',
                  title: 'Q&A 核心依据',
                  cueText: 'CueX 采用惩罚系数 λ=2 抑制多余打扰。',
                  bullets: ['来源：samplePack'],
                  evidenceIds: ['ev_sample_7'],
                  grounded: true,
                  rationale: '命中 verified evidence',
                }),
              },
            ],
          },
        ],
        usage: {
          input_tokens: 310,
          input_tokens_details: { cached_tokens: 40 },
          output_tokens: 220,
          output_tokens_details: { reasoning_tokens: 150 },
          total_tokens: 530,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const client = new CpaClient(cfg, { fetch: mockFetch });
  const s1 = new CpaFastDecisionProvider(client);
  const s2 = new CpaSlowReasoningProvider(client);
  const ev: Evidence = SAMPLE_PRESENTATION_PACK.evidence.find((e) => e.id === 'ev_sample_7')!;

  const s1Verdict = await s1.evaluate({
    sessionId: 'sess_cpa_1',
    scenarioId: 'presentation',
    contextVersion: 1,
    timestamp: msToIso(1_700_000_000_000),
    activeGoal: '介绍 CueX 净效用机制',
    expectedPoints: [{ id: 'kp_1', label: '净效用 λ=2', covered: false }],
    recentSegments: [
      {
        segmentId: 'seg_1',
        sessionId: 'sess_cpa_1',
        speaker: 'presenter',
        text: '我们先讲一下整体理念，具体数字一会再看。',
        delta: '我们先讲一下整体理念，具体数字一会再看。',
        isFinal: true,
        confidence: 0.95,
        startMs: 0,
        endMs: 1200,
      },
    ],
    recentTextDigest: '',
    silenceDurationMs: 0,
  });

  assert.equal(s1Verdict.usage?.modelCalls, 1);
  assert.equal(s1Verdict.usage?.usageSource, 'provider_unreported');
  assert.equal(s1Verdict.usage?.inputTokens, 0);

  const stateStore = new SharedCognitiveStateStore({
    sessionId: 'sess_cpa_1',
    scenarioId: 'presentation',
    activeGoal: '介绍 CueX 净效用机制',
    constraints: [],
    silentMode: false,
    maxInterventionLevel: 'L3',
    now: 1_700_000_000_000,
  });
  const afterS1Telemetry = stateStore.recordTelemetry(
    'system1',
    s1Verdict.latencyMs,
    s1Verdict.usage,
    s1Verdict.backend,
    1_700_000_000_100,
  );
  assert.equal(afterS1Telemetry.modelCalls, 1);
  assert.equal(afterS1Telemetry.usageSource, 'provider_unreported');

  const s2Res = await s2.synthesize({
    requestId: 's2_1',
    sessionId: 'sess_cpa_1',
    scenarioId: 'presentation',
    contextVersion: 1,
    timestamp: msToIso(1_700_000_000_200),
    triggerKind: 'live_qa',
    requestedLevel: 'L2',
    activeGoal: '回答评委关于惩罚系数的提问',
    questionText: '默认惩罚系数是多少？',
    recentSegments: [],
    retrievedEvidence: [ev],
    constraints: [],
    basedOnSegmentId: 'seg_1',
  });

  assert.equal(s2Res.status, 'synthesized');
  assert.equal(s2Res.grounded, true);
  assert.deepEqual(s2Res.evidenceIds, ['ev_sample_7']);
  assert.equal(s2Res.usage?.reasoningTokens, 150);
  assert.equal(s2Res.usage?.usageSource, 'provider_reported');

  const afterS2Telemetry = stateStore.recordTelemetry(
    'system2',
    s2Res.latencyMs,
    s2Res.usage,
    s2Res.backend,
    1_700_000_000_300,
  );
  assert.equal(afterS2Telemetry.modelCalls, 2);
  assert.equal(afterS2Telemetry.reasoningTokens, 150);
  assert.equal(afterS2Telemetry.usageSource, 'provider_reported');

  // Verify missing-evidence honesty on live_qa with empty retrieval
  const missingQa = await s2.synthesize({
    requestId: 's2_2',
    sessionId: 'sess_cpa_1',
    scenarioId: 'presentation',
    contextVersion: 1,
    timestamp: msToIso(1_700_000_000_400),
    triggerKind: 'live_qa',
    requestedLevel: 'L2',
    activeGoal: '回答未覆盖的问题',
    questionText: '你们明年海外商业收入预计是多少亿？',
    recentSegments: [],
    retrievedEvidence: [],
    constraints: [],
    basedOnSegmentId: 'seg_2',
  });
  assert.equal(missingQa.status, 'insufficient_evidence');
  assert.equal(missingQa.grounded, false);
  assert.equal(missingQa.candidate?.kind, 'missing_evidence_notice');
  assert.deepEqual(missingQa.evidenceIds, []);
  assert.equal(requests.length, 3);
});

test('CpaSlowReasoningProvider blocks fabricated numbers and FallbackProviders degrade cleanly to local_rule_zero without leaking keys', async () => {
  const cfg = resolveCpaConfig({
    env: {
      CPA_BASE_URL: 'https://cpa.mock.local/v1',
      CPA_API_KEY: 'mock-topsecret-never-leak-7788',
      CPA_API_MODE: 'chat_completions',
    },
  })!;

  const clientWithHallucination = new CpaClient(cfg, {
    fetch: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  status: 'synthesized',
                  title: '幻觉指标',
                  cueText: '延迟降低 99.9% 并且成本减少 888 万！',
                  evidenceIds: ['ev_sample_1'],
                  grounded: true,
                  rationale: 'test fabricated numbers',
                }),
              },
            },
          ],
          usage: { prompt_tokens: 40, completion_tokens: 30, total_tokens: 70 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  });

  const s2Guarded = new CpaSlowReasoningProvider(clientWithHallucination);
  const res = await s2Guarded.synthesize({
    requestId: 's2_guard',
    sessionId: 'sess_guard',
    scenarioId: 'presentation',
    contextVersion: 1,
    timestamp: msToIso(Date.now()),
    triggerKind: 'omission',
    requestedLevel: 'L2',
    activeGoal: '核心演示',
    missingPoints: [{ id: 'kp_1', label: '边缘轻量提示' }],
    recentSegments: [],
    retrievedEvidence: [SAMPLE_PRESENTATION_PACK.evidence[0]],
    constraints: [],
    basedOnSegmentId: 'seg_g',
  });
  assert.ok(!res.candidate?.cueText.includes('99.9'));
  assert.ok(!res.candidate?.cueText.includes('888'));
  assert.ok(res.backend.includes('grounding-guard'));

  // Failure redaction & fallback to local_rule_zero
  const failingClient = new CpaClient(cfg, {
    fetch: async () => {
      throw new Error('upstream 500 for bearer mock-topsecret-never-leak-7788');
    },
  });
  const s1Fallback = new FallbackFastDecisionProvider(
    new CpaFastDecisionProvider(failingClient),
    new HeuristicFastDecisionProvider(),
  );
  const s2Fallback = new FallbackSlowReasoningProvider(
    new CpaSlowReasoningProvider(failingClient),
    new LocalSlowReasoningProvider(),
  );

  const v = await s1Fallback.evaluate({
    sessionId: 's_err',
    scenarioId: 'presentation',
    contextVersion: 1,
    timestamp: msToIso(Date.now()),
    activeGoal: 'goal',
    expectedPoints: [],
    recentSegments: [],
    recentTextDigest: '',
    silenceDurationMs: 2_000,
  });
  assert.equal(v.usage?.usageSource, 'local_rule_zero');
  assert.equal(v.usage?.degraded, true);
  assert.ok(!v.reason.includes('mock-topsecret-never-leak-7788'));

  const sr = await s2Fallback.synthesize({
    requestId: 'r_err',
    sessionId: 's_err',
    scenarioId: 'presentation',
    contextVersion: 1,
    timestamp: msToIso(Date.now()),
    triggerKind: 'manual_help',
    requestedLevel: 'L2',
    activeGoal: 'goal',
    recentSegments: [],
    retrievedEvidence: [],
    constraints: [],
    basedOnSegmentId: 'seg_e',
  });
  assert.equal(sr.usage?.usageSource, 'local_rule_zero');
  assert.equal(sr.usage?.degraded, true);
  assert.ok(!sr.rationale.includes('mock-topsecret-never-leak-7788'));
});

test('Compiler and Reflection CPA helpers enforce number grounding, keep deterministic V = H - λI, and expose LlmSubsystemHealthStatus', async () => {
  const cfg = resolveCpaConfig({
    env: {
      CPA_BASE_URL: 'https://cpa.mock.local/v1',
      CPA_API_KEY: 'mock-compile-secret-333',
      CPA_API_MODE: 'responses',
    },
  })!;

  const client = new CpaClient(cfg, {
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      const instructions = String(body.instructions ?? '');
      if (instructions.includes('Presentation Context Compiler')) {
        return new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      oneLineThesis: '以 24ms 本地实测延迟实现实时演讲辅助',
                      audienceHook: '实时提示而不打断演讲流',
                      facts: [
                        { text: '端到端延迟稳定在 24ms', category: 'metric' },
                        { text: '虚构融资 5000 万美元', category: 'metric' },
                      ],
                      qaCards: [
                        {
                          question: '延迟数据是如何测得的？',
                          rationale: '验证真实端到端表现',
                          suggestedAnswer: '基于资料记录的 24ms 实测基准。',
                        },
                        {
                          question: '明年营收 9 亿怎么达成？',
                          rationale: '应被数字守卫拦截',
                          suggestedAnswer: '预计营收 9 亿元。',
                        },
                      ],
                    }),
                  },
                ],
              },
            ],
            usage: { input_tokens: 180, output_tokens: 95, total_tokens: 275 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    overallSummary: '本次演讲覆盖要点完整，停顿处未产生多余干扰。',
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 90, output_tokens: 45, total_tokens: 135 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  const compileInput = {
    title: 'CueX 实时推理演示',
    sceneType: 'product_launch' as const,
    goal: '展示 24ms 实时推理性能',
    rawMaterials: '# 核心性能\n端到端延迟稳定在 24ms，采用本地确定性控制器零幻觉拦截。',
    keyFactsInput: ['端到端延迟稳定在 24ms'],
    targetDurationSec: 180,
  };
  const basePack = compilePresentationPack(compileInput, 1_700_000_000_000);
  const compiled = await enhanceCompiledPackWithCpa(client, basePack, compileInput);
  assert.equal(compiled.pack.compiledBy, 'llm_compiler');
  assert.ok(!compiled.pack.facts.some((f) => f.text.includes('5000')));
  assert.ok(!compiled.pack.qaCards.some((q) => q.question.includes('9')));
  assert.ok(compiled.pack.qaCards.some((q) => q.question.includes('延迟数据')));

  const now = 1_700_000_010_000;
  const plugin = new PresentationRuntimePlugin({
    sessionId: 'sess_refl_cpa',
    mode: 'live',
    viewMode: 'focus',
    pack: compiled.pack,
    startedAt: now,
  });
  const reflRepo = new SqliteRepository(':memory:');
  reflRepo.init();
  const runtime = new CognitiveRuntimeSession({
    sessionId: 'sess_refl_cpa',
    mode: 'live',
    viewMode: 'focus',
    silentMode: false,
    maxInterventionLevel: 'L3',
    privacyNoticeAccepted: true,
    goal: compiled.pack.goal,
    constraints: [],
    asrStatus: { backend: 'text-only', mode: 'text_simulation', available: true, streaming: false, detail: 'offline' },
    plugin,
    fastDecision: new HeuristicFastDecisionProvider(),
    slowReasoning: new LocalSlowReasoningProvider(),
    retrieval: new LexicalBm25RetrievalProvider(),
    controller: new InterventionController({
      cooldownMs: 15_000,
      candidateTtlMs: 12_000,
      dismissSuppressionMs: 45_000,
      hesitationSilenceMs: 1_600,
    }),
    memoryStore: new MemoryStore(reflRepo),
  });
  const baseRefl = runtime.buildReflection(2);
  const enhRefl = await enhanceReflectionWithCpa(client, baseRefl);
  assert.deepEqual(enhRefl.reflection.utility, baseRefl.utility);
  assert.equal(enhRefl.reflection.diagnosis.coverageRatio, baseRefl.diagnosis.coverageRatio);
  assert.ok(enhRefl.reflection.diagnosis.overallSummary.includes('本次演讲覆盖要点完整'));

  // Verify GatewayServer /health reports LlmSubsystemHealthStatus metadata when CpaProviders are injected
  const dir = mkdtempSync(path.join(tmpdir(), 'cuex-gw-cpa-'));
  try {
    const serverConfig = loadServerConfig({
      PORT: '0',
      CUEX_RUNTIME_DIR: dir,
      CUEX_SYSTEM1: 'real',
      CUEX_SYSTEM2: 'real',
      CUEX_ASR: 'fake',
    });
    const repo = new SqliteRepository(path.join(dir, 'test.db'));
    repo.init();
    const server = new CueXGatewayServer({
      config: serverConfig,
      repo,
      cpaClient: client,
      fastDecision: new CpaFastDecisionProvider(client),
      slowReasoning: new CpaSlowReasoningProvider(client),
    });
    const addr = await server.start();
    try {
      const hRes = await fetch(`http://127.0.0.1:${addr.port}/health`);
      assert.equal(hRes.status, 200);
      const health = (await hRes.json()) as {
        system1: { provider?: string; model?: string; degraded?: boolean };
        system2: { provider?: string; model?: string; degraded?: boolean };
      };
      assert.equal(health.system1.provider, 'cpa:cpa.mock.local');
      assert.equal(health.system1.model, 'gemini-4-hydrogen');
      assert.equal(health.system1.degraded, false);
      assert.equal(health.system2.model, 'gemini-4-hydrogen');
      assert.equal(health.system2.degraded, false);
    } finally {
      await server.stop();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createFastDecisionProvider and createSlowReasoningProvider report honest degraded fallback when unconfigured', async () => {
  const s1 = createFastDecisionProvider('real', {});
  const s2 = createSlowReasoningProvider('real', { env: {} });
  assert.equal(s1.mode, 'local_fallback');
  assert.equal(s2.mode, 'local_fallback');
  const s1h = await s1.health();
  const s2h = await s2.health();
  assert.equal(s1h.ok, false);
  assert.equal(s2h.ok, false);
  assert.equal(s1h.degraded, true);
  assert.equal(s2h.degraded, true);
});

test('CognitiveRuntime avoids redundant remote CPA System 1 calls on interim partials and deterministic pace ticks', async () => {
  let remoteS1Calls = 0;
  const cfg = resolveCpaConfig({
    env: {
      CPA_BASE_URL: 'https://cpa.mock.local/v1',
      CPA_API_KEY: 'mock-throttle-test-0001',
    },
  })!;
  const mockClient = new CpaClient(cfg, {
    fetch: async () => {
      remoteS1Calls += 1;
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    cognitiveState: 'fluent',
                    interventionNeed: 'none',
                    recommendedLevel: 'L0',
                    confidence: 0.9,
                    missingPointIds: [],
                    coveredPointIds: [],
                    driftDetected: false,
                    recoveryDetected: false,
                    reason: '流畅推进中',
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  let nowMs = 1_700_000_000_000;
  const clock = { now: () => nowMs };
  const plugin = new PresentationRuntimePlugin({
    sessionId: 'sess_throttle_1',
    mode: 'live',
    viewMode: 'focus',
    pack: SAMPLE_PRESENTATION_PACK,
    startedAt: nowMs,
  });
  const repo = new SqliteRepository(':memory:');
  repo.init();
  const events: Array<{ type: string }> = [];
  const runtime = new CognitiveRuntimeSession({
    sessionId: 'sess_throttle_1',
    mode: 'live',
    viewMode: 'focus',
    silentMode: false,
    maxInterventionLevel: 'L3',
    privacyNoticeAccepted: true,
    goal: SAMPLE_PRESENTATION_PACK.goal,
    constraints: [],
    asrStatus: { backend: 'colab-gpu-asr', mode: 'colab_gpu', available: true, streaming: true, detail: 'ready' },
    plugin,
    fastDecision: new CpaFastDecisionProvider(mockClient),
    slowReasoning: new LocalSlowReasoningProvider(),
    retrieval: new LexicalBm25RetrievalProvider(),
    controller: new InterventionController({
      cooldownMs: 15_000,
      candidateTtlMs: 12_000,
      dismissSuppressionMs: 45_000,
    }),
    memoryStore: new MemoryStore(repo),
    clock,
    emitMessage: (msg) => {
      events.push({ type: msg.type });
    },
  });

  // 1) Interim partial speech emits live caption without firing remote CPA System 1
  await runtime.ingestSpeech({
    speaker: 'presenter',
    text: '各位评委好，今天介绍',
    isFinal: false,
    source: 'external_asr',
    endMs: nowMs + 400,
  });
  assert.equal(remoteS1Calls, 0);
  assert.ok(events.some((e) => e.type === 'asr.transcript'));

  // 2) Finalized utterance fires remote CPA System 1 once (greeting stays fluent / L0 with zero false interventions)
  await runtime.ingestSpeech({
    speaker: 'presenter',
    text: '各位评委好，今天介绍 CueX。',
    isFinal: true,
    source: 'external_asr',
    endMs: nowMs + 1000,
  });
  assert.equal(remoteS1Calls, 1);

  // 3) Advance past pause threshold & chapter targetDurationSec: first pause tick fires remote S1 once;
  // subsequent background timer ticks (with deterministic pace_overtime triggerCandidate) make 0 extra remote S1 calls
  nowMs += 90_000;
  await runtime.processTick();
  assert.equal(remoteS1Calls, 2);
  nowMs += 2_000;
  await runtime.processTick();
  nowMs += 2_000;
  await runtime.processTick();
  nowMs += 2_000;
  await runtime.processTick();
  assert.equal(remoteS1Calls, 2);
});

test('CpaClient defaults S1 to gemini-4-hydrogen with low reasoningEffort, guards presenter greetings, streams SSE, and classifies HTTP errors', async () => {
  const seenPayloads: Array<{ url: string; body: Record<string, unknown> }> = [];
  const defaultCfg = resolveCpaConfig({
    env: {
      CPA_BASE_URL: 'https://cpa.mock.local/v1',
      CPA_API_KEY: 'mock-stream-secret-0001',
    },
  })!;
  assert.equal(defaultCfg.system1Model, 'gemini-4-hydrogen');
  assert.equal(defaultCfg.system2Model, 'gemini-4-hydrogen');

  const client = new CpaClient(defaultCfg, {
    fetch: async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      seenPayloads.push({ url, body });

      if (body.stream === true && url.endsWith('/responses')) {
        const sseBody = [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"CueX 采用"}\n\n',
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"检索核验回答。"}\n\n',
          'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":50,"output_tokens":12,"output_tokens_details":{"reasoning_tokens":4},"total_tokens":62}}}\n\n',
        ].join('');
        return new Response(sseBody, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }

      if (body.stream === true && url.endsWith('/chat/completions')) {
        const sseBody = [
          'data: {"choices":[{"delta":{"content":"流式回答"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"完成。"}}],"usage":{"prompt_tokens":30,"completion_tokens":8,"total_tokens":38}}\n\n',
          'data: [DONE]\n\n',
        ].join('');
        return new Response(sseBody, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }

      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    cognitiveState: 'answering_question',
                    interventionNeed: 'trigger_l2',
                    recommendedLevel: 'L2',
                    confidence: 0.72,
                    missingPointIds: [],
                    coveredPointIds: [],
                    driftDetected: false,
                    recoveryDetected: false,
                    reason: '测试即使上游误判提问，开场问候仍应稳态 L0',
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 90, output_tokens: 30, output_tokens_details: { reasoning_tokens: 18 }, total_tokens: 120 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  // 1) Greeting never triggers Q&A in either Heuristic or CPA S1, and S1 defaults to reasoningEffort=low on gemini-4-hydrogen
  const heuristic = new HeuristicFastDecisionProvider();
  const greetingInput = {
    sessionId: 'sess_greeting_1',
    scenarioId: 'presentation' as const,
    contextVersion: 1,
    timestamp: msToIso(1_700_000_000_000),
    activeGoal: '向评委演示 CueX 核心能力',
    expectedPoints: [{ id: 'kp_1', label: '检索核验不编造数字', covered: false }],
    recentSegments: [
      {
        segmentId: 'seg_greet',
        sessionId: 'sess_greeting_1',
        speaker: 'presenter' as const,
        text: '各位评委好，我们是记性好了一点团队，今天带来的产品叫 CueX。',
        delta: '各位评委好，我们是记性好了一点团队，今天带来的产品叫 CueX。',
        isFinal: true,
        confidence: 0.96,
        startMs: 0,
        endMs: 2800,
      },
    ],
    recentTextDigest: '',
    silenceDurationMs: 0,
  };
  const hVerdict = await heuristic.evaluate(greetingInput);
  assert.equal(hVerdict.detectedQuestion, undefined);
  assert.equal(hVerdict.cognitiveState, 'fluent');
  assert.equal(hVerdict.recommendedLevel, 'L0');

  const cpaS1 = new CpaFastDecisionProvider(client);
  const cVerdict = await cpaS1.evaluate(greetingInput);
  assert.equal(cVerdict.cognitiveState, 'fluent');
  assert.equal(cVerdict.interventionNeed, 'none');
  assert.equal(cVerdict.recommendedLevel, 'L0');
  assert.equal(seenPayloads[0]?.body.model, 'gemini-4-hydrogen');
  assert.deepEqual(seenPayloads[0]?.body.reasoning, { effort: 'low' });

  // 2) SSE streaming on /responses and /chat/completions
  const deltas: string[] = [];
  const sseResp = await client.completeStreamText({
    tier: 'system2',
    systemPrompt: '你是回答助手',
    userPrompt: '请一句话介绍 CueX',
    onDelta: (d) => deltas.push(d),
  });
  assert.equal(sseResp.text, 'CueX 采用检索核验回答。');
  assert.equal(sseResp.chunkCount, 2);
  assert.deepEqual(deltas, ['CueX 采用', '检索核验回答。']);
  assert.equal(sseResp.usage.usageReported, true);
  assert.equal(sseResp.usage.reasoningTokens, 4);

  const chatCfg = resolveCpaConfig({
    env: {
      CPA_BASE_URL: 'https://cpa.mock.local/v1',
      CPA_API_KEY: 'mock-stream-secret-0001',
      CPA_API_MODE: 'chat_completions',
      CPA_SYSTEM1_MODEL: 'gemini-3.5-flash-lite',
    },
  })!;
  const chatClient = new CpaClient(chatCfg, { fetch: client['fetchFn'] });
  const chatSse = await chatClient.completeStreamText({
    tier: 'system1',
    systemPrompt: 'sys',
    userPrompt: 'usr',
  });
  assert.equal(chatSse.endpoint, 'chat_completions');
  assert.equal(chatSse.text, '流式回答完成。');
  assert.equal(chatSse.usage.totalTokens, 38);

  // 3) Auth 401 fails immediately without retrying; 429 rate-limit retries and recovers
  let authAttempts = 0;
  const authClient = new CpaClient(defaultCfg, {
    fetch: async () => {
      authAttempts += 1;
      return new Response(JSON.stringify({ error: { message: 'Invalid bearer token mock-stream-secret-0001' } }), {
        status: 401,
      });
    },
  });
  await assert.rejects(
    () =>
      authClient.completeJson({
        tier: 'system1',
        systemPrompt: 's',
        userPrompt: 'u',
        maxRetries: 2,
      }),
    (err: Error) => err.message.includes('CPA HTTP 401') && !err.message.includes('mock-stream-secret-0001'),
  );
  assert.equal(authAttempts, 1);

  let rateAttempts = 0;
  const retryClient = new CpaClient(defaultCfg, {
    fetch: async () => {
      rateAttempts += 1;
      if (rateAttempts === 1) {
        return new Response(JSON.stringify({ error: { message: 'rate limit exceeded' } }), { status: 429 });
      }
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        }),
        { status: 200 },
      );
    },
  });
  const recovered = await retryClient.completeJson<{ ok: boolean }>({
    tier: 'system1',
    systemPrompt: 's',
    userPrompt: 'u',
    maxRetries: 1,
  });
  assert.equal(recovered.parsed.ok, true);
  assert.equal(recovered.retries, 1);
  assert.equal(rateAttempts, 2);
});
