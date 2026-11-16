/**
 * Reproducible Live CPA LLM Validation & Acceptance Matrix Script (Phase 3)
 *
 * Covers:
 * - Section 4.4: Head-to-head System 1 benchmark (`gemini-4-hydrogen` with low reasoning effort
 *   vs `gemini-3.5-flash-lite`) across opening greeting, fluent speech, omission, recovery,
 *   silent pause, and live Q&A.
 * - Section 4.5: Complete CPA Acceptance Matrix:
 *   - Live CPA tests: streaming SSE, long ContextPack compile + S2 synthesis, invalid model ID,
 *     timeout & AbortSignal cancellation with honest degraded fallback.
 *   - Separated mockContractMatrix (isolated local HTTP mock): 401/403, 429, 503 unavailable,
 *     malformed JSON, stale contextVersion, repeated-request idempotency, provider_unreported usage.
 *   - Top-level Section 4.5 telemetry counters (`requestCount`, `successCount`, `errorCount`,
 *     `inputTokens`, `outputTokens`, `reasoningTokens`, `p50LatencyMs`, `p95LatencyMs`,
 *     `timeoutCount`, `retryCount`).
 *
 * Usage:
 *   CPA_DEV_MODELS_LOADER=1 pnpm --filter @cuex/server exec tsx scripts/validate-cpa-live.ts
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Candidate, Evidence, FastDecisionInput, FastDecisionVerdict, ProviderUsageRecord } from '@cuex/protocol';
import {
  computeLatencyStats,
  ContextStore,
  CpaClient,
  CpaFastDecisionProvider,
  CpaSlowReasoningProvider,
  enhanceCompiledPackWithCpa,
  enhanceReflectionWithCpa,
  FallbackSlowReasoningProvider,
  HeuristicFastDecisionProvider,
  InterventionController,
  LexicalBm25RetrievalProvider,
  LocalSlowReasoningProvider,
  MemoryStore,
  msToIso,
  ProviderResilience,
  resolveCpaConfig,
  SharedCognitiveStateStore,
} from '../src/runtime';
import { CognitiveRuntimeSession } from '../src/runtime/CognitiveRuntime';
import {
  compilePresentationPack,
  PresentationRuntimePlugin,
  SAMPLE_PRESENTATION_PACK,
} from '../src/scenarios';
import { SqliteRepository } from '../src/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ENV_LOCAL_PATH = path.join(REPO_ROOT, '.cuex-runtime', '.env.phase3.local');
const REPORT_OUT_PATH = path.join(
  REPO_ROOT,
  'deliverables',
  'cuex-final',
  'mandatory',
  'ai-employee-demo',
  'evidence',
  'cpa-llm-report.json',
);

interface LiveCallCounters {
  requestCount: number;
  successCount: number;
  errorCount: number;
  timeoutCount: number;
  retryCount: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  latenciesMs: number[];
}

function createLiveCounters(): LiveCallCounters {
  return {
    requestCount: 0,
    successCount: 0,
    errorCount: 0,
    timeoutCount: 0,
    retryCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    latenciesMs: [],
  };
}

function computeP50(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].map((x) => Math.max(0, Math.round(x))).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.5) - 1));
  return sorted[idx];
}

function recordSuccessCall(
  counters: LiveCallCounters,
  latencyMs: number,
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
    retries?: number;
  } | undefined,
): void {
  counters.requestCount += 1;
  counters.successCount += 1;
  counters.latenciesMs.push(latencyMs);
  if (usage) {
    counters.inputTokens += usage.inputTokens ?? 0;
    counters.outputTokens += usage.outputTokens ?? 0;
    counters.reasoningTokens += usage.reasoningTokens ?? 0;
    counters.cachedInputTokens += usage.cachedInputTokens ?? 0;
    counters.retryCount += usage.retries ?? 0;
  }
}

function loadEnvFileIfExists(filePath: string): void {
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

function buildS1BenchmarkCases(baseTs: number): Array<{
  name: string;
  input: FastDecisionInput;
  verify: (v: FastDecisionVerdict) => boolean;
  expectedSummary: string;
}> {
  return [
    {
      name: 'introGreetingQuiet',
      expectedSummary: 'fluent / L0 (opening greeting must not trigger Q&A)',
      verify: (v) =>
        v.cognitiveState === 'fluent' &&
        v.interventionNeed === 'none' &&
        v.recommendedLevel === 'L0',
      input: {
        sessionId: 'sess_cpa_bench',
        scenarioId: 'presentation',
        contextVersion: 1,
        timestamp: msToIso(baseTs),
        activeGoal: '向评委演示 CueX 核心能力',
        activeChapterId: 'ch_1',
        activeChapterTitle: '为什么需要低打扰认知副驾驶',
        expectedPoints: [
          { id: 'kp_intro_1', label: '传统提词器强行打断注意流', covered: false },
          { id: 'kp_intro_2', label: 'CueX 采用净效用门控控制提醒节奏', covered: false },
        ],
        recentSegments: [
          {
            segmentId: 'seg_bench_1',
            sessionId: 'sess_cpa_bench',
            speaker: 'presenter',
            text: '各位评委好，我们是记性好了一点团队，今天带来的产品叫 CueX。',
            delta: '各位评委好，我们是记性好了一点团队，今天带来的产品叫 CueX。',
            isFinal: true,
            confidence: 0.96,
            startMs: 0,
            endMs: 3200,
          },
        ],
        recentTextDigest: '讲者开场问候评委并介绍团队与产品名称',
        silenceDurationMs: 0,
      },
    },
    {
      name: 'fluentQuiet',
      expectedSummary: 'fluent / L0',
      verify: (v) =>
        (v.cognitiveState === 'fluent' || v.cognitiveState === 'recovering') &&
        v.interventionNeed === 'none' &&
        v.recommendedLevel === 'L0',
      input: {
        sessionId: 'sess_cpa_bench',
        scenarioId: 'presentation',
        contextVersion: 2,
        timestamp: msToIso(baseTs + 1000),
        activeGoal: '开场介绍 CueX 演讲认知副驾驶与低打扰设计',
        activeChapterId: 'ch_1',
        activeChapterTitle: '为什么需要低打扰认知副驾驶',
        expectedPoints: [
          { id: 'kp_intro_1', label: '传统提词器强行打断注意流', covered: true },
          { id: 'kp_intro_2', label: 'CueX 采用净效用门控控制提醒节奏', covered: false },
        ],
        recentSegments: [
          {
            segmentId: 'seg_bench_2',
            sessionId: 'sess_cpa_bench',
            speaker: 'presenter',
            text: '大家好，传统提词器经常满屏滚动并打断演讲者思路，而 CueX 接下来会用净效用门控控制提醒时机。',
            delta: '而 CueX 接下来会用净效用门控控制提醒时机。',
            isFinal: true,
            confidence: 0.96,
            startMs: 3500,
            endMs: 6800,
          },
        ],
        recentTextDigest: '开场对比传统提词器与 CueX 净效用门控理念',
        silenceDurationMs: 200,
      },
    },
    {
      name: 'omissionTrigger',
      expectedSummary: 'omitting_key_point / trigger_l1|trigger_l2',
      verify: (v) =>
        v.cognitiveState === 'omitting_key_point' &&
        (v.interventionNeed === 'trigger_l1' || v.interventionNeed === 'trigger_l2') &&
        (v.recommendedLevel === 'L1' || v.recommendedLevel === 'L2'),
      input: {
        sessionId: 'sess_cpa_bench',
        scenarioId: 'presentation',
        contextVersion: 3,
        timestamp: msToIso(baseTs + 2000),
        activeGoal: '讲清双系统架构、惩罚系数 λ=2 与本地控制门控',
        activeChapterId: 'ch_2',
        activeChapterTitle: '双系统认知架构',
        expectedPoints: [
          { id: 'kp_arch_1', label: 'System 1 快速判定语义状态与时机', covered: true },
          { id: 'kp_arch_2', label: '净效用函数 V = H - λI（默认惩罚系数 λ=2）', covered: false },
        ],
        recentSegments: [
          {
            segmentId: 'seg_bench_3',
            sessionId: 'sess_cpa_bench',
            speaker: 'presenter',
            text: '我们有 System 1 做快速感知判定……嗯，然后就直接看下一章产品演示了。',
            delta: '嗯，然后就直接看下一章产品演示了。',
            isFinal: true,
            confidence: 0.91,
            startMs: 12000,
            endMs: 16500,
          },
        ],
        recentTextDigest: '讲完 System 1 后准备直接跳转下一章，遗漏关键净效用公式 V = H - λI 与默认 λ=2',
        silenceDurationMs: 1200,
      },
    },
    {
      name: 'recoveryWithdraw',
      expectedSummary: 'recovering / withdraw_active / L0',
      verify: (v) =>
        v.recoveryDetected &&
        v.cognitiveState === 'recovering' &&
        v.interventionNeed === 'withdraw_active' &&
        v.recommendedLevel === 'L0',
      input: {
        sessionId: 'sess_cpa_bench',
        scenarioId: 'presentation',
        contextVersion: 4,
        timestamp: msToIso(baseTs + 3000),
        activeGoal: '讲清双系统架构、惩罚系数 λ=2 与本地控制门控',
        activeChapterId: 'ch_2',
        activeChapterTitle: '双系统认知架构',
        expectedPoints: [
          { id: 'kp_arch_1', label: 'System 1 快速判定语义状态与时机', covered: true },
          { id: 'kp_arch_2', label: '净效用函数 V = H - λI（默认惩罚系数 λ=2）', covered: true },
        ],
        recentSegments: [
          {
            segmentId: 'seg_bench_4',
            sessionId: 'sess_cpa_bench',
            speaker: 'presenter',
            text: '补充一下核心度量：我们定义了净效用函数 V = H - λI，默认惩罚系数 λ=2，每次误打扰都会带来双倍扣分。',
            delta: '补充一下核心度量：我们定义了净效用函数 V = H - λI，默认惩罚系数 λ=2，每次误打扰都会带来双倍扣分。',
            isFinal: true,
            confidence: 0.97,
            startMs: 17000,
            endMs: 21500,
          },
        ],
        recentTextDigest: '演讲者已自主补全遗漏要点 V = H - λI 与 λ=2',
        silenceDurationMs: 100,
        activeIntervention: {
          interventionId: 'int_active_1',
          level: 'L2',
          title: '补全核心公式',
          cueText: '提及净效用函数 V = H - λI（默认 λ=2）',
          shownAt: msToIso(baseTs + 2100),
        },
      },
    },
    {
      name: 'pauseWithoutGapQuiet',
      expectedSummary: 'L0 (intentional pause without semantic gap must stay silent)',
      verify: (v) => v.interventionNeed === 'none' && v.recommendedLevel === 'L0',
      input: {
        sessionId: 'sess_cpa_bench',
        scenarioId: 'presentation',
        contextVersion: 5,
        timestamp: msToIso(baseTs + 4000),
        activeGoal: '总结核心价值',
        activeChapterId: 'ch_3',
        activeChapterTitle: '落地与总结',
        expectedPoints: [
          { id: 'kp_end_1', label: '本地 Controller 保障证据接地与零幻觉', covered: true },
        ],
        recentSegments: [
          {
            segmentId: 'seg_bench_5',
            sessionId: 'sess_cpa_bench',
            speaker: 'presenter',
            text: '因此，本地 Controller 保障了证据接地与零幻觉输出。',
            delta: '因此，本地 Controller 保障了证据接地与零幻觉输出。',
            isFinal: true,
            confidence: 0.98,
            startMs: 25000,
            endMs: 28000,
          },
        ],
        recentTextDigest: '演讲者完整陈述结论后刻意留白停顿，无要点遗漏或跑题',
        silenceDurationMs: 2600,
      },
    },
    {
      name: 'qaDetect',
      expectedSummary: 'answering_question / trigger_l2 / L2',
      verify: (v) =>
        v.cognitiveState === 'answering_question' &&
        (v.interventionNeed === 'trigger_l2' || v.interventionNeed === 'trigger_l3') &&
        (v.recommendedLevel === 'L2' || v.recommendedLevel === 'L3'),
      input: {
        sessionId: 'sess_cpa_bench',
        scenarioId: 'presentation',
        contextVersion: 6,
        timestamp: msToIso(baseTs + 5000),
        activeGoal: '现场评委问答',
        activeChapterId: 'ch_4',
        activeChapterTitle: 'Q&A 环节',
        expectedPoints: [
          { id: 'kp_qa_1', label: '基于白名单事实与证据引用回答', covered: false },
        ],
        recentSegments: [
          {
            segmentId: 'seg_bench_6',
            sessionId: 'sess_cpa_bench',
            speaker: 'audience',
            text: '请问 CueX 的默认干扰惩罚系数 λ 是多少？凭什么说它不会乱编数字？',
            delta: '请问 CueX 的默认干扰惩罚系数 λ 是多少？凭什么说它不会乱编数字？',
            isFinal: true,
            confidence: 0.95,
            startMs: 30000,
            endMs: 33500,
          },
        ],
        recentTextDigest: '评委提问 CueX 默认惩罚系数 λ 与数字接地机制',
        silenceDurationMs: 0,
      },
    },
  ];
}

async function runMockContractMatrix(): Promise<Record<string, unknown>> {
  const baseMockEnv = {
    CPA_BASE_URL: 'https://cpa.mock.contract.local/v1',
    CPA_API_KEY: 'mock-contract-secret-9988',
    CPA_API_MODE: 'responses',
  };
  const cfg = resolveCpaConfig({ env: baseMockEnv })!;

  // 1) 401/403 auth failure fails fast without retry and redacts secrets
  let attempts401 = 0;
  const auth401Client = new CpaClient(cfg, {
    resilience: new ProviderResilience({ failureThreshold: 5, cooldownMs: 5000 }),
    fetch: async () => {
      attempts401 += 1;
      return new Response(
        JSON.stringify({ error: { message: `Unauthorized token ${baseMockEnv.CPA_API_KEY}` } }),
        { status: 401 },
      );
    },
  });
  let err401 = '';
  try {
    await auth401Client.completeJson({
      tier: 'system1',
      systemPrompt: 's',
      userPrompt: 'u',
      maxRetries: 2,
    });
  } catch (err) {
    err401 = err instanceof Error ? err.message : String(err);
  }
  assert.ok(err401.includes('CPA HTTP 401'));
  assert.ok(!err401.includes(baseMockEnv.CPA_API_KEY));
  assert.equal(attempts401, 1);

  let attempts403 = 0;
  const auth403Client = new CpaClient(cfg, {
    resilience: new ProviderResilience({ failureThreshold: 5, cooldownMs: 5000 }),
    fetch: async () => {
      attempts403 += 1;
      return new Response(JSON.stringify({ error: { message: 'Forbidden scope' } }), { status: 403 });
    },
  });
  let err403 = '';
  try {
    await auth403Client.completeJson({
      tier: 'system2',
      systemPrompt: 's',
      userPrompt: 'u',
      maxRetries: 2,
    });
  } catch (err) {
    err403 = err instanceof Error ? err.message : String(err);
  }
  assert.ok(err403.includes('CPA HTTP 403'));
  assert.equal(attempts403, 1);

  // 2) 429 rate-limit retries cleanly and recovers
  let attempts429 = 0;
  const rateClient = new CpaClient(cfg, {
    resilience: new ProviderResilience({ failureThreshold: 5, cooldownMs: 5000 }),
    fetch: async () => {
      attempts429 += 1;
      if (attempts429 === 1) {
        return new Response(JSON.stringify({ error: { message: 'Rate limit reached' } }), { status: 429 });
      }
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'output_text', text: '{"recovered":true}' }] }],
          usage: { input_tokens: 18, output_tokens: 6, total_tokens: 24 },
        }),
        { status: 200 },
      );
    },
  });
  const rateRes = await rateClient.completeJson<{ recovered: boolean }>({
    tier: 'system1',
    systemPrompt: 's',
    userPrompt: 'u',
    maxRetries: 1,
  });
  assert.equal(rateRes.parsed.recovered, true);
  assert.equal(rateRes.retries, 1);

  // 3) Upstream 503 unavailable -> circuit opens -> degraded local_rule_zero fallback without fabricated claims
  let attempts503 = 0;
  const breakerResilience = new ProviderResilience({ failureThreshold: 2, cooldownMs: 10_000 });
  const unavailClient = new CpaClient(cfg, {
    resilience: breakerResilience,
    fetch: async () => {
      attempts503 += 1;
      return new Response(JSON.stringify({ error: { message: 'Upstream 503 unavailable' } }), { status: 503 });
    },
  });
  const fallbackS2 = new FallbackSlowReasoningProvider(
    new CpaSlowReasoningProvider(unavailClient),
    new LocalSlowReasoningProvider(),
  );
  const req503 = {
    requestId: 's2_503_1',
    sessionId: 'sess_mock',
    scenarioId: 'presentation' as const,
    contextVersion: 1,
    timestamp: msToIso(Date.now()),
    triggerKind: 'live_qa' as const,
    requestedLevel: 'L2' as const,
    activeGoal: '回答问题',
    questionText: 'CueX 如何工作？',
    recentSegments: [],
    retrievedEvidence: SAMPLE_PRESENTATION_PACK.evidence.slice(0, 1),
    constraints: [],
    basedOnSegmentId: 'seg_1',
  };
  const degraded1 = await fallbackS2.synthesize(req503);
  const degraded2 = await fallbackS2.synthesize({ ...req503, requestId: 's2_503_2' });
  const circuitHealth = await fallbackS2.health();
  assert.equal(degraded1.usage?.usageSource, 'local_rule_zero');
  assert.equal(degraded1.usage?.degraded, true);
  assert.equal(degraded2.usage?.degraded, true);
  assert.equal(circuitHealth.degraded, true);

  // 4) Malformed JSON / HTML response handled cleanly
  const malformedClient = new CpaClient(cfg, {
    resilience: new ProviderResilience({ failureThreshold: 5, cooldownMs: 5000 }),
    fetch: async () => new Response('<html>502 Bad Gateway</html>', { status: 200 }),
  });
  let malformedErr = '';
  try {
    await malformedClient.completeJson({
      tier: 'system1',
      systemPrompt: 's',
      userPrompt: 'u',
      maxRetries: 0,
    });
  } catch (err) {
    malformedErr = err instanceof Error ? err.message : String(err);
  }
  assert.ok(malformedErr.includes('non-JSON response') || malformedErr.includes('PROVIDER_UNAVAILABLE'));

  // 5) Stale contextVersion & repeated-request idempotency in InterventionController
  const now = 1_700_000_000_000;
  const controller = new InterventionController({
    cooldownMs: 15_000,
    candidateTtlMs: 12_000,
    dismissSuppressionMs: 45_000,
  });
  const contextStore = new ContextStore({
    session: {
      sessionId: 'sess_mock_ctrl',
      scenarioId: 'presentation',
      status: 'active',
      mode: 'live',
      viewMode: 'focus',
      startedAt: msToIso(now),
      silentMode: false,
      maxInterventionLevel: 'L3',
      privacyNoticeAccepted: true,
    },
    taskContext: {
      taskId: 'task_mock_ctrl',
      sessionId: 'sess_mock_ctrl',
      scenarioId: 'presentation',
      goal: 'goal',
      constraints: [],
      contextVersion: 2,
      updatedAt: msToIso(now),
    },
  });
  const state = new SharedCognitiveStateStore({
    sessionId: 'sess_mock_ctrl',
    scenarioId: 'presentation',
    activeGoal: 'goal',
    constraints: [],
    silentMode: false,
    maxInterventionLevel: 'L3',
    now,
  });
  state.bumpContextVersion(now); // contextVersion = 2
  const staleCandidate: Candidate = {
    candidateId: 'cand_stale_1',
    sessionId: 'sess_mock_ctrl',
    level: 'L2',
    title: '过期版本候选',
    cueText: 'V = H - λI',
    bullets: [],
    priority: 80,
    ttlMs: 10_000,
    expiresAt: msToIso(now + 10_000),
    contextVersion: 1,
    evidenceIds: [],
    basedOnSegmentId: 'seg_1',
    status: 'pending',
    createdAt: msToIso(now),
    kind: 'omission_cue',
    grounded: true,
    triggerReason: 'omitting_key_point',
  };
  const staleEval = controller.evaluateCandidates({
    sessionId: 'sess_mock_ctrl',
    state,
    context: contextStore,
    candidates: [staleCandidate],
    signals: {
      silenceMs: 0,
      semanticGap: true,
      drift: false,
      openQuestion: false,
      manualHelp: false,
      recovery: false,
    },
    now,
  });
  assert.equal(staleEval.decision.selectedAction, 'stay_silent');
  assert.equal(staleEval.decision.suppressReason, 'stale_context_version');

  const validCandidate: Candidate = { ...staleCandidate, candidateId: 'cand_fresh_1', contextVersion: 2 };
  const firstShow = controller.evaluateCandidates({
    sessionId: 'sess_mock_ctrl',
    state,
    context: contextStore,
    candidates: [validCandidate],
    signals: {
      silenceMs: 0,
      semanticGap: true,
      drift: false,
      openQuestion: false,
      manualHelp: false,
      recovery: false,
    },
    now,
  });
  assert.equal(firstShow.decision.selectedAction, 'show_l2_keyword');
  const dupShow = controller.evaluateCandidates({
    sessionId: 'sess_mock_ctrl',
    state,
    context: contextStore,
    candidates: [{ ...validCandidate, candidateId: 'cand_fresh_dup' }],
    signals: {
      silenceMs: 0,
      semanticGap: true,
      drift: false,
      openQuestion: false,
      manualHelp: false,
      recovery: false,
    },
    now: now + 500,
  });
  assert.equal(dupShow.decision.selectedAction, 'stay_silent');

  // 6) provider_unreported usage attribution (omitted usage field stays 0 tokens, never fabricated)
  const unreportedClient = new CpaClient(cfg, {
    fetch: async () =>
      new Response(
        JSON.stringify({
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }],
        }),
        { status: 200 },
      ),
  });
  const s1Mock = new CpaFastDecisionProvider(unreportedClient);
  const verdictUnrep = await s1Mock.evaluate({
    sessionId: 'sess_unrep',
    scenarioId: 'presentation',
    contextVersion: 1,
    timestamp: msToIso(now),
    activeGoal: 'goal',
    expectedPoints: [],
    recentSegments: [],
    recentTextDigest: '',
    silenceDurationMs: 0,
  });
  assert.equal(verdictUnrep.usage?.usageSource, 'provider_unreported');
  assert.equal(verdictUnrep.usage?.inputTokens, 0);

  return {
    isolatedFromLiveTelemetry: true,
    auth401And403: {
      passed: true,
      attempts401,
      attempts403,
      secretRedacted: true,
      failFastNoRetry: true,
    },
    rateLimit429Retry: {
      passed: true,
      attempts: attempts429,
      retries: rateRes.retries,
      recovered: rateRes.parsed.recovered,
    },
    upstream503CircuitAndFallback: {
      passed: true,
      attemptsObserved: attempts503,
      circuitOpened: circuitHealth.degraded,
      fallbackUsageSource: degraded1.usage?.usageSource,
      fallbackDegraded: degraded1.usage?.degraded,
    },
    malformedResponse: {
      passed: true,
      error: malformedErr,
    },
    staleContextVersionAndIdempotency: {
      passed: true,
      staleRejectionReason: staleEval.decision.suppressReason,
      firstShowAction: firstShow.decision.selectedAction,
      duplicateSuppressionAction: dupShow.decision.selectedAction,
    },
    providerUnreportedAttribution: {
      passed: true,
      usageSource: verdictUnrep.usage?.usageSource,
      inputTokens: verdictUnrep.usage?.inputTokens,
      outputTokens: verdictUnrep.usage?.outputTokens,
    },
  };
}

async function main(): Promise<void> {
  loadEnvFileIfExists(ENV_LOCAL_PATH);

  const cfg = resolveCpaConfig({
    env: process.env,
    allowDevModelsJson: process.env.CPA_DEV_MODELS_LOADER === '1',
  });
  if (!cfg) {
    throw new Error(
      'CPA config not found. Set CPA_BASE_URL + CPA_API_KEY or run with CPA_DEV_MODELS_LOADER=1.',
    );
  }

  const client = new CpaClient(cfg);
  const s2 = new CpaSlowReasoningProvider(client);
  const liveCounters = createLiveCounters();

  const startedAt = new Date().toISOString();
  const stateStore = new SharedCognitiveStateStore({
    sessionId: 'sess_cpa_live_validation',
    scenarioId: 'presentation',
    activeGoal: '介绍 CueX 认知副驾驶核心架构、净效用机制 V = H - λI 与实时控制策略',
    constraints: ['仅引用已核验事实，严禁编造数字'],
    silentMode: false,
    maxInterventionLevel: 'L3',
    now: Date.now(),
  });

  // 1. Health checks
  const s1Health = client.health('system1');
  const s2Health = client.health('system2');
  assert.equal(s1Health.ok, true, `System1 CPA health failed: ${s1Health.detail}`);
  assert.equal(s2Health.ok, true, `System2 CPA health failed: ${s2Health.detail}`);

  // 2. Section 4.4 Head-to-Head System 1 Benchmark: gemini-4-hydrogen (low effort) vs gemini-3.5-flash-lite
  const baseTs = Date.now();
  const s1Cases = buildS1BenchmarkCases(baseTs);
  const benchmarkModels = [cfg.system1Model, 'gemini-3.5-flash-lite'];
  const uniqueBenchModels = [...new Set(benchmarkModels)];
  const benchResults: Record<
    string,
    {
      model: string;
      reasoningEffort: string;
      passedCount: number;
      totalCases: number;
      accuracy: number;
      p50LatencyMs: number;
      p95LatencyMs: number;
      avgLatencyMs: number;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      cases: Record<string, unknown>;
    }
  > = {};

  const primaryS1Verdicts: Record<string, FastDecisionVerdict> = {};

  for (const modelName of uniqueBenchModels) {
    const modelCfg = resolveCpaConfig({
      env: { ...process.env, CPA_SYSTEM1_MODEL: modelName },
      allowDevModelsJson: process.env.CPA_DEV_MODELS_LOADER === '1',
    })!;
    const modelClient = new CpaClient(modelCfg);
    const modelS1 = new CpaFastDecisionProvider(modelClient);
    const caseLatencies: number[] = [];
    const caseDetails: Record<string, unknown> = {};
    let passedCount = 0;
    let inTok = 0;
    let outTok = 0;
    let rsnTok = 0;

    for (const c of s1Cases) {
      const verdict = await modelS1.evaluate(c.input);
      const ok = c.verify(verdict);
      if (ok) passedCount += 1;
      caseLatencies.push(verdict.latencyMs);
      inTok += verdict.usage?.inputTokens ?? 0;
      outTok += verdict.usage?.outputTokens ?? 0;
      rsnTok += verdict.usage?.reasoningTokens ?? 0;
      recordSuccessCall(liveCounters, verdict.latencyMs, verdict.usage);

      if (modelName === cfg.system1Model) {
        primaryS1Verdicts[c.name] = verdict;
        stateStore.recordTelemetry(
          'system1',
          verdict.latencyMs,
          verdict.usage,
          verdict.backend,
          baseTs + caseLatencies.length * 10,
        );
      }

      caseDetails[c.name] = {
        passed: ok,
        expected: c.expectedSummary,
        cognitiveState: verdict.cognitiveState,
        interventionNeed: verdict.interventionNeed,
        recommendedLevel: verdict.recommendedLevel,
        recoveryDetected: verdict.recoveryDetected,
        missingPointIds: verdict.missingPointIds,
        latencyMs: verdict.latencyMs,
        usage: verdict.usage,
      };
    }

    const stats = computeLatencyStats(caseLatencies);
    const avgLatencyMs = Math.round(
      caseLatencies.reduce((sum, x) => sum + x, 0) / Math.max(1, caseLatencies.length),
    );
    benchResults[modelName] = {
      model: modelName,
      reasoningEffort: /hydrogen/i.test(modelName) ? (modelCfg.reasoningEffort ?? 'low') : (modelCfg.reasoningEffort ?? 'provider_default'),
      passedCount,
      totalCases: s1Cases.length,
      accuracy: Number((passedCount / s1Cases.length).toFixed(4)),
      p50LatencyMs: computeP50(caseLatencies),
      p95LatencyMs: stats.p95Ms,
      avgLatencyMs,
      inputTokens: inTok,
      outputTokens: outTok,
      reasoningTokens: rsnTok,
      cases: caseDetails,
    };
  }

  // Assert primary configured S1 model (gemini-4-hydrogen) passes all 6 classification checks
  assert.equal(
    benchResults[cfg.system1Model].passedCount,
    s1Cases.length,
    `Primary S1 model ${cfg.system1Model} failed one or more S1 benchmark checks`,
  );

  // 3. System 2 grounded live Q&A + ungrounded gap honesty check
  const retrieval = new LexicalBm25RetrievalProvider();
  const sampleEvidence = SAMPLE_PRESENTATION_PACK.evidence;
  const retrievedGrounded = await retrieval.search(
    '净效用函数惩罚系数 λ 是多少',
    sampleEvidence,
    { topK: 4 },
  );
  const groundedEvidenceList: Evidence[] = retrievedGrounded.map((r) => r.evidence);

  const s2Grounded = await s2.synthesize({
    requestId: 's2_val_grounded',
    sessionId: 'sess_cpa_live_validation',
    scenarioId: 'presentation',
    contextVersion: 4,
    timestamp: msToIso(baseTs + 4000),
    triggerKind: 'live_qa',
    requestedLevel: 'L2',
    activeGoal: '回答评委提问',
    questionText: 'CueX 如何量化低打扰？默认惩罚系数 λ 是多少？',
    recentSegments: [],
    retrievedEvidence: groundedEvidenceList,
    constraints: ['仅引用已核验证据，不得编造数字'],
    basedOnSegmentId: 'seg_bench_6',
  });
  recordSuccessCall(liveCounters, s2Grounded.latencyMs, s2Grounded.usage);
  stateStore.recordTelemetry(
    'system2',
    s2Grounded.latencyMs,
    { ...s2Grounded.usage!, correlationId: 'corr_cpa_val_s2_1' },
    s2Grounded.backend,
    baseTs + 4010,
  );
  assert.equal(s2Grounded.status, 'synthesized', 'Grounded live Q&A should synthesize');
  assert.equal(s2Grounded.grounded, true, 'Grounded live Q&A must be marked grounded=true');
  assert.ok(s2Grounded.evidenceIds.length > 0, 'Grounded live Q&A must cite evidenceIds');

  const s2Ungrounded = await s2.synthesize({
    requestId: 's2_val_ungrounded',
    sessionId: 'sess_cpa_live_validation',
    scenarioId: 'presentation',
    contextVersion: 4,
    timestamp: msToIso(baseTs + 5000),
    triggerKind: 'live_qa',
    requestedLevel: 'L2',
    activeGoal: '回答评委提问',
    questionText: '请问贵司明年在欧洲市场的企业版客单价和营收预算分别是多少欧元？',
    recentSegments: [],
    retrievedEvidence: [],
    constraints: ['若无资料依据，必须明确声明资料未覆盖，严禁编造数字'],
    basedOnSegmentId: 'seg_bench_6',
  });
  recordSuccessCall(liveCounters, s2Ungrounded.latencyMs, s2Ungrounded.usage);
  stateStore.recordTelemetry(
    'system2',
    s2Ungrounded.latencyMs,
    { ...s2Ungrounded.usage!, correlationId: 'corr_cpa_val_s2_2' },
    s2Ungrounded.backend,
    baseTs + 5010,
  );
  assert.equal(s2Ungrounded.status, 'insufficient_evidence');
  assert.equal(s2Ungrounded.grounded, false);
  assert.equal(s2Ungrounded.evidenceIds.length, 0);

  // 4. PresentationCompiler CPA enhancement + Long ContextPack acceptance test
  const compileInput = {
    title: 'CueX 实时认知副驾驶发布路演',
    sceneType: 'pitch' as const,
    goal: '阐述低打扰双系统架构、1460 ms System 1 目标延迟与完整全栈工程落地能力',
    audience: '黑客松评委与工程负责人',
    targetDurationSec: 240,
    rawMaterials: [
      '# 1. 痛点与定位',
      '传统提词器强行整屏滚动，打断演讲者注意力流，同时无法识别临场跳词与评委突发提问。',
      'CueX 定位为面向高风险现场沟通的实时认知副驾驶，默认保持 L0 静默，仅在净效用为正时出手。',
      '# 2. 双系统认知架构',
      'System 1 在 1460 ms 目标内判定说话者语义状态（流畅、犹豫、遗漏、跑题、问答、自我恢复）。',
      'System 2 仅在遗漏或 Q&A 需求触发时按需调用，并结合 BM25 与向量检索生成可核验短卡。',
      '# 3. 净效用函数与控制门控',
      '采用 V = H - λI 计算净效用，默认干扰惩罚系数 λ=2，误打扰记双倍惩罚。',
      '独立 InterventionController 强制执行 TTL（12000 ms）、冷却期（15000 ms）、contextVersion 一致性校验与自动撤回。',
      '# 4. 实时语音与零幻觉证据链',
      '开发联调采用远端 RTX PRO 6000 Colab GPU 上的 SenseVoiceSmall 实时流式 ASR（PCM16LE 16kHz）。',
      '任何数字宣称必须来自 FactWhitelist 或 Verified Evidence；未命中资料时明确提示“当前资料未覆盖”。',
      '# 5. 商业模式与隐私',
      '采用个人专业版与企业席位订阅模式，支持严格用户确认 opt-in 记忆库、数据导出及一键彻底清除。',
    ].join('\n'),
    keyFactsInput: [
      'System 1 目标在 1460 ms 内完成状态判定',
      '净效用公式 V = H - λI，默认惩罚系数 λ=2',
      'InterventionController 强制校验 TTL 12000 ms 与冷却期 15000 ms',
      '任何未出现在已核验证据中的数字均被拦截，未覆盖资料必须诚实声明',
      '记忆库仅在 userConfirmed === true 时写入并支持一键清除',
      'SenseVoiceSmall 流式 ASR 运行于 16kHz PCM16LE 音频通道',
      '支持 focus 与 inspector 双视图模式与 L0-L3 四级梯度控制',
      '演练复盘保留可回放时间轴与单点弱项强化练习',
    ],
  };
  const basePack = compilePresentationPack(compileInput, baseTs);
  const compiledRes = await enhanceCompiledPackWithCpa(client, basePack, compileInput);
  if (compiledRes.usage) {
    recordSuccessCall(liveCounters, compiledRes.latencyMs ?? 0, compiledRes.usage);
    stateStore.recordTelemetry(
      'compiler',
      compiledRes.latencyMs ?? 0,
      { ...compiledRes.usage, correlationId: 'corr_cpa_val_compiler' },
      cfg.providerLabel,
      baseTs + 6010,
    );
  }
  assert.equal(compiledRes.pack.compiledBy, 'llm_compiler');
  assert.ok(compiledRes.pack.cueSheet.chapters.length >= 4, 'Long ContextPack should retain >= 4 chapters');
  assert.ok(compiledRes.pack.facts.length >= 6, 'Long ContextPack should preserve >= 6 facts');

  // Long ContextPack live System 2 retrieval & synthesis
  const longRetrieved = await retrieval.search(
    'InterventionController 的 TTL 冷却时间 和 λ 惩罚系数 分别是多少',
    compiledRes.pack.evidence,
    { topK: 5 },
  );
  const s2LongPack = await s2.synthesize({
    requestId: 's2_val_long_pack',
    sessionId: 'sess_cpa_live_validation',
    scenarioId: 'presentation',
    contextVersion: 5,
    timestamp: msToIso(baseTs + 6200),
    triggerKind: 'live_qa',
    requestedLevel: 'L2',
    activeGoal: compiledRes.pack.goal,
    questionText: 'Controller 冷却和 TTL 参数是多少？干扰惩罚 λ 为何设为 2？',
    recentSegments: [],
    retrievedEvidence: longRetrieved.map((r) => r.evidence),
    constraints: compiledRes.pack.facts.map((f) => f.text),
    basedOnSegmentId: 'seg_bench_6',
  });
  recordSuccessCall(liveCounters, s2LongPack.latencyMs, s2LongPack.usage);
  stateStore.recordTelemetry(
    'system2',
    s2LongPack.latencyMs,
    { ...s2LongPack.usage!, correlationId: 'corr_cpa_val_s2_long' },
    s2LongPack.backend,
    baseTs + 6250,
  );
  assert.equal(s2LongPack.status, 'synthesized');
  assert.equal(s2LongPack.grounded, true);
  assert.ok(s2LongPack.evidenceIds.length >= 1);

  // 5. PresentationReflection CPA enhancement
  const plugin = new PresentationRuntimePlugin({
    sessionId: 'sess_cpa_refl',
    mode: 'live',
    viewMode: 'focus',
    pack: compiledRes.pack,
    startedAt: baseTs,
  });
  const memRepo = new SqliteRepository(':memory:');
  memRepo.init();
  const runtimeSess = new CognitiveRuntimeSession({
    sessionId: 'sess_cpa_refl',
    mode: 'live',
    viewMode: 'focus',
    silentMode: false,
    maxInterventionLevel: 'L3',
    privacyNoticeAccepted: true,
    goal: compiledRes.pack.goal,
    constraints: compiledRes.pack.facts.map((f) => f.text),
    asrStatus: {
      backend: 'text-only',
      mode: 'text_simulation',
      available: true,
      streaming: false,
      detail: 'CPA validation harness',
    },
    plugin,
    fastDecision: new HeuristicFastDecisionProvider(),
    slowReasoning: new LocalSlowReasoningProvider(),
    retrieval,
    controller: new InterventionController({
      cooldownMs: 15_000,
      candidateTtlMs: 12_000,
      dismissSuppressionMs: 45_000,
    }),
    memoryStore: new MemoryStore(memRepo),
  });
  const baseReflection = runtimeSess.buildReflection(2);
  const reflRes = await enhanceReflectionWithCpa(client, baseReflection);
  if (reflRes.usage) {
    recordSuccessCall(liveCounters, reflRes.latencyMs ?? 0, reflRes.usage);
    stateStore.recordTelemetry(
      'reflection',
      reflRes.latencyMs ?? 0,
      { ...reflRes.usage, correlationId: 'corr_cpa_val_reflection' },
      cfg.providerLabel,
      baseTs + 7010,
    );
  }
  assert.ok(reflRes.usage && reflRes.usage.modelCalls >= 1);
  assert.deepEqual(reflRes.reflection.utility, baseReflection.utility);

  // 6. Live Section 4.5 Matrix Checks: Streaming SSE, Invalid Model ID, Timeout & AbortSignal Cancellation
  const sseDeltas: string[] = [];
  const sseStreamRes = await client.completeStreamText({
    tier: 'system2',
    systemPrompt: '你是 CueX 中文问答助手，请用不超过 40 字直接概括 CueX 净效用机制。',
    userPrompt: '核心事实：CueX 采用 V = H - λI，默认 λ=2，未命中资料禁止编造。',
    onDelta: (d) => sseDeltas.push(d),
  });
  recordSuccessCall(liveCounters, sseStreamRes.totalLatencyMs, {
    ...sseStreamRes.usage,
    retries: sseStreamRes.retries,
  });
  const sseUsageRecord: ProviderUsageRecord = {
    modelCalls: 1,
    retries: sseStreamRes.retries,
    inputTokens: sseStreamRes.usage.inputTokens,
    outputTokens: sseStreamRes.usage.outputTokens,
    cachedInputTokens: sseStreamRes.usage.cachedInputTokens,
    reasoningTokens: sseStreamRes.usage.reasoningTokens,
    usageSource: sseStreamRes.usage.usageReported ? 'provider_reported' : 'provider_unreported',
    degraded: false,
    costFen: 0,
    provider: cfg.providerLabel,
    model: sseStreamRes.model,
    correlationId: 'corr_cpa_val_stream',
  };
  stateStore.recordTelemetry('system2', sseStreamRes.totalLatencyMs, sseUsageRecord, cfg.providerLabel, baseTs + 7500);
  assert.ok(sseStreamRes.text.trim().length > 0, 'Streaming SSE returned empty text');
  assert.ok(sseStreamRes.chunkCount >= 1, 'Streaming SSE expected >= 1 chunk');

  // 6b) Live Invalid Model ID
  const isolatedInvalidClient = new CpaClient(cfg, {
    resilience: new ProviderResilience({ failureThreshold: 5, cooldownMs: 5000 }),
  });
  let invalidModelError = '';
  const invalidStart = performance.now();
  liveCounters.requestCount += 1;
  try {
    await isolatedInvalidClient.completeJson({
      tier: 'system2',
      model: 'cuex-nonexistent-model-validation-404',
      systemPrompt: 'Return JSON {"ok":true}',
      userPrompt: 'ping',
      maxRetries: 0,
      timeoutMs: 8000,
    });
    throw new Error('Expected invalid model ID call to reject');
  } catch (err) {
    invalidModelError = cfg.redact(err instanceof Error ? err.message : String(err));
    liveCounters.errorCount += 1;
    liveCounters.latenciesMs.push(Math.max(1, Math.round(performance.now() - invalidStart)));
  }
  assert.ok(invalidModelError.includes('CPA HTTP') || invalidModelError.includes('PROVIDER_'));

  // 6c) Live Timeout (CPA_TIMEOUT_MS=80 -> honest degraded fallback) & AbortSignal cancellation
  const shortTimeoutCfg = resolveCpaConfig({
    env: { ...process.env, CPA_TIMEOUT_MS: '80', CPA_S1_TIMEOUT_MS: '80' },
    allowDevModelsJson: process.env.CPA_DEV_MODELS_LOADER === '1',
  })!;
  const isolatedTimeoutClient = new CpaClient(shortTimeoutCfg, {
    resilience: new ProviderResilience({ failureThreshold: 5, cooldownMs: 5000 }),
  });
  const guardedSlow = new FallbackSlowReasoningProvider(
    new CpaSlowReasoningProvider(isolatedTimeoutClient),
    new LocalSlowReasoningProvider(),
  );
  liveCounters.requestCount += 1;
  const timeoutStart = performance.now();
  const timeoutDegradedRes = await guardedSlow.synthesize({
    requestId: 's2_live_timeout_fallback',
    sessionId: 'sess_cpa_live_validation',
    scenarioId: 'presentation',
    contextVersion: 6,
    timestamp: msToIso(baseTs + 8000),
    triggerKind: 'live_qa',
    requestedLevel: 'L2',
    activeGoal: '验证超时降级零幻觉',
    questionText: 'CueX 如何保证超时降级安全？',
    recentSegments: [],
    retrievedEvidence: [],
    constraints: [],
    basedOnSegmentId: 'seg_bench_6',
  });
  const timeoutElapsedMs = Math.max(1, Math.round(performance.now() - timeoutStart));
  liveCounters.errorCount += 1;
  liveCounters.timeoutCount += 1;
  liveCounters.retryCount += timeoutDegradedRes.usage?.retries ?? 0;
  liveCounters.latenciesMs.push(timeoutElapsedMs);
  assert.equal(timeoutDegradedRes.usage?.degraded, true);
  assert.equal(timeoutDegradedRes.usage?.usageSource, 'local_rule_zero');
  assert.equal(timeoutDegradedRes.status, 'insufficient_evidence');

  const abortClient = new CpaClient(cfg, {
    resilience: new ProviderResilience({ failureThreshold: 5, cooldownMs: 5000 }),
  });
  const abortCtrl = new AbortController();
  const abortTimer = setTimeout(() => abortCtrl.abort(new Error('Explicit caller abort signal')), 60);
  liveCounters.requestCount += 1;
  const abortStart = performance.now();
  let abortError = '';
  try {
    await abortClient.completeJson({
      tier: 'system2',
      systemPrompt: '你是回答助手',
      userPrompt: '请详细介绍 CueX 全链路架构，输出 JSON {"summary":"..."}',
      maxRetries: 0,
      signal: abortCtrl.signal,
    });
  } catch (err) {
    abortError = cfg.redact(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(abortTimer);
  }
  const abortElapsedMs = Math.max(1, Math.round(performance.now() - abortStart));
  liveCounters.errorCount += 1;
  liveCounters.latenciesMs.push(abortElapsedMs);
  assert.ok(abortError.length > 0, 'Expected AbortSignal call to reject cleanly');

  // 7. Isolated Mock Contract Matrix (401/403, 429, 503, malformed JSON, stale contextVersion, idempotency, unreported usage)
  const mockContractMatrix = await runMockContractMatrix();

  const telemetry = stateStore.getTelemetry();
  const latencyStats = computeLatencyStats(liveCounters.latenciesMs);

  const report = {
    schemaVersion: 'cpa-llm-report.v2',
    validatedAt: new Date().toISOString(),
    startedAt,
    provider: cfg.providerLabel,
    apiMode: cfg.apiMode,
    models: {
      system1: cfg.system1Model,
      system1ReasoningEffort: /hydrogen/i.test(cfg.system1Model) ? (cfg.reasoningEffort ?? 'low') : (cfg.reasoningEffort ?? 'provider_default'),
      system2: cfg.system2Model,
      compiler: cfg.compilerModel,
      reflection: cfg.reflectionModel,
    },
    // Required Section 4.5 top-level metrics (strictly measured from live CPA calls above)
    requestCount: liveCounters.requestCount,
    successCount: liveCounters.successCount,
    errorCount: liveCounters.errorCount,
    inputTokens: liveCounters.inputTokens,
    outputTokens: liveCounters.outputTokens,
    reasoningTokens: liveCounters.reasoningTokens,
    cachedInputTokens: liveCounters.cachedInputTokens,
    p50LatencyMs: computeP50(liveCounters.latenciesMs),
    p95LatencyMs: latencyStats.p95Ms,
    timeoutCount: liveCounters.timeoutCount,
    retryCount: liveCounters.retryCount,
    health: {
      system1: s1Health,
      system2: s2Health,
    },
    s1ModelBenchmark: {
      note: 'Head-to-head live CPA benchmark comparing default gemini-4-hydrogen (reasoningEffort=low) vs optional fast override gemini-3.5-flash-lite across identical 6 S1 utterances.',
      models: benchResults,
    },
    system1Checks: {
      introGreetingQuiet: primaryS1Verdicts.introGreetingQuiet
        ? {
            cognitiveState: primaryS1Verdicts.introGreetingQuiet.cognitiveState,
            interventionNeed: primaryS1Verdicts.introGreetingQuiet.interventionNeed,
            recommendedLevel: primaryS1Verdicts.introGreetingQuiet.recommendedLevel,
            latencyMs: primaryS1Verdicts.introGreetingQuiet.latencyMs,
            usage: primaryS1Verdicts.introGreetingQuiet.usage,
          }
        : undefined,
      fluentQuiet: {
        cognitiveState: primaryS1Verdicts.fluentQuiet.cognitiveState,
        interventionNeed: primaryS1Verdicts.fluentQuiet.interventionNeed,
        recommendedLevel: primaryS1Verdicts.fluentQuiet.recommendedLevel,
        latencyMs: primaryS1Verdicts.fluentQuiet.latencyMs,
        usage: primaryS1Verdicts.fluentQuiet.usage,
      },
      omissionTrigger: {
        cognitiveState: primaryS1Verdicts.omissionTrigger.cognitiveState,
        interventionNeed: primaryS1Verdicts.omissionTrigger.interventionNeed,
        recommendedLevel: primaryS1Verdicts.omissionTrigger.recommendedLevel,
        missingPointIds: primaryS1Verdicts.omissionTrigger.missingPointIds,
        latencyMs: primaryS1Verdicts.omissionTrigger.latencyMs,
        usage: primaryS1Verdicts.omissionTrigger.usage,
      },
      recoveryWithdraw: {
        cognitiveState: primaryS1Verdicts.recoveryWithdraw.cognitiveState,
        interventionNeed: primaryS1Verdicts.recoveryWithdraw.interventionNeed,
        recoveryDetected: primaryS1Verdicts.recoveryWithdraw.recoveryDetected,
        latencyMs: primaryS1Verdicts.recoveryWithdraw.latencyMs,
        usage: primaryS1Verdicts.recoveryWithdraw.usage,
      },
      pauseWithoutGapQuiet: {
        cognitiveState: primaryS1Verdicts.pauseWithoutGapQuiet.cognitiveState,
        interventionNeed: primaryS1Verdicts.pauseWithoutGapQuiet.interventionNeed,
        recommendedLevel: primaryS1Verdicts.pauseWithoutGapQuiet.recommendedLevel,
        latencyMs: primaryS1Verdicts.pauseWithoutGapQuiet.latencyMs,
        usage: primaryS1Verdicts.pauseWithoutGapQuiet.usage,
      },
      qaDetect: {
        cognitiveState: primaryS1Verdicts.qaDetect.cognitiveState,
        interventionNeed: primaryS1Verdicts.qaDetect.interventionNeed,
        recommendedLevel: primaryS1Verdicts.qaDetect.recommendedLevel,
        latencyMs: primaryS1Verdicts.qaDetect.latencyMs,
        usage: primaryS1Verdicts.qaDetect.usage,
      },
    },
    system2Checks: {
      groundedQa: {
        status: s2Grounded.status,
        grounded: s2Grounded.grounded,
        evidenceIds: s2Grounded.evidenceIds,
        title: s2Grounded.candidate?.title,
        cueText: s2Grounded.candidate?.cueText,
        latencyMs: s2Grounded.latencyMs,
        usage: s2Grounded.usage,
      },
      ungroundedQaGap: {
        status: s2Ungrounded.status,
        grounded: s2Ungrounded.grounded,
        evidenceIds: s2Ungrounded.evidenceIds,
        candidateKind: s2Ungrounded.candidate?.kind,
        cueText: s2Ungrounded.candidate?.cueText,
        latencyMs: s2Ungrounded.latencyMs,
        usage: s2Ungrounded.usage,
      },
    },
    compilerCheck: {
      cpaUsed: Boolean(compiledRes.usage && compiledRes.usage.modelCalls > 0),
      compiledBy: compiledRes.pack.compiledBy,
      factsCount: compiledRes.pack.facts.length,
      qaCardsCount: compiledRes.pack.qaCards.length,
      latencyMs: compiledRes.latencyMs,
      usage: compiledRes.usage,
    },
    reflectionCheck: {
      cpaUsed: Boolean(reflRes.usage && reflRes.usage.modelCalls > 0),
      utilityPreserved: true,
      utilityFormula: reflRes.reflection.utility.formula,
      overallSummary: reflRes.reflection.diagnosis.overallSummary,
      latencyMs: reflRes.latencyMs,
      usage: reflRes.usage,
    },
    liveMatrixChecks: {
      streamingCompletion: {
        passed: true,
        model: sseStreamRes.model,
        endpoint: sseStreamRes.endpoint,
        firstTokenLatencyMs: sseStreamRes.firstTokenLatencyMs,
        totalLatencyMs: sseStreamRes.totalLatencyMs,
        chunkCount: sseStreamRes.chunkCount,
        deltaCount: sseDeltas.length,
        excerpt: sseStreamRes.text.slice(0, 120),
        usage: sseStreamRes.usage,
      },
      longContextPack: {
        passed: true,
        chaptersCount: compiledRes.pack.cueSheet.chapters.length,
        factsCount: compiledRes.pack.facts.length,
        evidenceCount: compiledRes.pack.evidence.length,
        s2Status: s2LongPack.status,
        s2Grounded: s2LongPack.grounded,
        s2EvidenceIds: s2LongPack.evidenceIds,
        s2LatencyMs: s2LongPack.latencyMs,
        usage: s2LongPack.usage,
      },
      invalidModelId: {
        passed: true,
        error: invalidModelError,
      },
      timeoutAndAbort: {
        passed: true,
        timeoutElapsedMs,
        degraded: timeoutDegradedRes.usage?.degraded,
        usageSource: timeoutDegradedRes.usage?.usageSource,
        status: timeoutDegradedRes.status,
        cueText: timeoutDegradedRes.candidate?.cueText,
        abortElapsedMs,
        abortError,
      },
    },
    mockContractMatrix,
    aggregatedTelemetry: telemetry,
  };

  const sanitizedJson = cfg.redact(JSON.stringify(report, null, 2));
  const auditMod = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'check-public-data.mjs')).href)) as {
    inspectPublicText: (file: string, text: string) => Array<{ file: string; kind: string; excerpt: string }>;
  };
  const findings = auditMod.inspectPublicText('deliverables/cuex-final/mandatory/ai-employee-demo/evidence/cpa-llm-report.json', sanitizedJson);
  assert.equal(
    findings.length,
    0,
    `Sanitized CPA report failed public-data audit: ${JSON.stringify(findings)}`,
  );

  mkdirSync(path.dirname(REPORT_OUT_PATH), { recursive: true });
  writeFileSync(REPORT_OUT_PATH, `${sanitizedJson}\n`, 'utf8');
  console.log(`CPA live validation passed. Wrote sanitized report -> ${path.relative(REPO_ROOT, REPORT_OUT_PATH)}`);
  console.log(
    JSON.stringify({
      provider: cfg.providerLabel,
      s1Model: cfg.system1Model,
      s2Model: cfg.system2Model,
      requestCount: report.requestCount,
      successCount: report.successCount,
      errorCount: report.errorCount,
      timeoutCount: report.timeoutCount,
      retryCount: report.retryCount,
      p50LatencyMs: report.p50LatencyMs,
      p95LatencyMs: report.p95LatencyMs,
      inputTokens: report.inputTokens,
      outputTokens: report.outputTokens,
      reasoningTokens: report.reasoningTokens,
    }),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
