import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Candidate, ServerMessage } from '@cuex/protocol';
import {
  CognitiveRuntimeSession,
  HeuristicFastDecisionProvider,
  InterventionController,
  LexicalBm25RetrievalProvider,
  LocalSlowReasoningProvider,
  ManualClock,
  MemoryStore,
  msToIso,
} from '../src/runtime';
import {
  PresentationRuntimePlugin,
  SAMPLE_PRESENTATION_PACK,
  toUniversalContextPack,
} from '../src/scenarios';

function buildTestSession(ceiling: 'L0' | 'L1' | 'L2' | 'L3' = 'L2') {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cuex-ctrl-test-'));
  const clock = new ManualClock(1_700_000_000_000);
  const emitted: ServerMessage[] = [];
  const pack = structuredClone(SAMPLE_PRESENTATION_PACK);
  const plugin = new PresentationRuntimePlugin({
    sessionId: 'test_sess',
    mode: 'live',
    viewMode: 'focus',
    pack,
    startedAt: clock.now(),
  });
  const memoryStore = new MemoryStore(path.join(dir, 'memory'));
  const runtime = new CognitiveRuntimeSession({
    sessionId: 'test_sess',
    mode: 'live',
    viewMode: 'focus',
    silentMode: false,
    maxInterventionLevel: ceiling,
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
    fastDecision: new HeuristicFastDecisionProvider(),
    slowReasoning: new LocalSlowReasoningProvider({ candidateTtlMs: 5_000 }),
    retrieval: new LexicalBm25RetrievalProvider(),
    controller: new InterventionController({
      cooldownMs: 10_000,
      candidateTtlMs: 5_000,
      dismissSuppressionMs: 30_000,
    }),
    memoryStore,
    clock,
    emitMessage: (msg) => emitted.push(msg),
  });

  const cleanup = () => {
    memoryStore.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { runtime, clock, emitted, cleanup };
}

test('Controller rejects pause-only ticks without semantic gaps', async () => {
  const { runtime, clock, cleanup } = buildTestSession();
  try {
    await runtime.ingestSpeech({
      text: '传统对话框 AI 需要用户停下来阅读长段输出，打断语言流与目光接触。',
      isFinal: true,
    });
    clock.advance(4_000);
    const decision = await runtime.processTick(4_000);
    assert.ok(decision);
    assert.equal(decision.selectedAction, 'stay_silent');
    assert.equal(decision.suppressReason, 'pause_only_without_gap');
    assert.equal(runtime.state.getActiveIntervention(), null);
  } finally {
    cleanup();
  }
});

test('Controller blocks ungrounded fabricated numbers and forbidden claims', () => {
  const { runtime, clock, cleanup } = buildTestSession();
  try {
    const hallucinated: Candidate = {
      candidateId: 'cand_fake_num',
      sessionId: runtime.sessionId,
      level: 'L2',
      title: '虚假数据',
      cueText: '实测可提高转化率 88.5%，营收突破 2000 万元。',
      priority: 95,
      ttlMs: 5_000,
      expiresAt: msToIso(clock.now() + 5_000),
      contextVersion: runtime.state.getContextVersion(),
      evidenceIds: ['ev_sample_1'],
      basedOnSegmentId: 'seg_init',
      status: 'pending',
      kind: 'qa_grounding',
      grounded: true,
    };
    const res1 = runtime.submitExternalCandidate(hallucinated, { openQuestion: true });
    assert.equal(res1.decision.selectedAction, 'stay_silent');
    assert.equal(res1.decision.suppressReason, 'ungrounded_evidence');
    assert.equal(runtime.state.getActiveIntervention(), null);

    const forbidden: Candidate = {
      candidateId: 'cand_forbidden',
      sessionId: runtime.sessionId,
      level: 'L2',
      title: '越界声明',
      cueText: '禁止宣称 100% 识别准确或零幻觉保证。',
      priority: 95,
      ttlMs: 5_000,
      expiresAt: msToIso(clock.now() + 5_000),
      contextVersion: runtime.state.getContextVersion(),
      evidenceIds: [],
      basedOnSegmentId: 'seg_init',
      status: 'pending',
      kind: 'omission_cue',
      grounded: true,
    };
    const res2 = runtime.submitExternalCandidate(forbidden, { semanticGap: true });
    assert.equal(res2.decision.selectedAction, 'stay_silent');
    assert.equal(res2.decision.suppressReason, 'ungrounded_evidence');
  } finally {
    cleanup();
  }
});

test('Controller enforces TTL expiry, contextVersion mismatch, L0-L3 ceiling, and silent mode', () => {
  const { runtime, clock, cleanup } = buildTestSession('L1');
  try {
    const tooHigh: Candidate = {
      candidateId: 'cand_l3_over',
      sessionId: runtime.sessionId,
      level: 'L3',
      title: 'L3 Scaffold',
      cueText: '总结三点核心观点。',
      priority: 90,
      ttlMs: 5_000,
      expiresAt: msToIso(clock.now() + 5_000),
      contextVersion: runtime.state.getContextVersion(),
      evidenceIds: [],
      basedOnSegmentId: 'seg_init',
      status: 'pending',
      kind: 'manual_scaffold',
      grounded: true,
    };
    const ceilingRes = runtime.submitExternalCandidate(tooHigh, { semanticGap: true });
    assert.equal(ceilingRes.decision.suppressReason, 'ceiling_exceeded');

    const expired: Candidate = {
      ...tooHigh,
      candidateId: 'cand_expired',
      level: 'L1',
      expiresAt: msToIso(clock.now() - 10),
    };
    const expRes = runtime.submitExternalCandidate(expired, { semanticGap: true });
    assert.equal(expRes.decision.suppressReason, 'candidate_expired');

    const stale: Candidate = {
      ...tooHigh,
      candidateId: 'cand_stale_ver',
      level: 'L1',
      contextVersion: runtime.state.getContextVersion() - 1,
    };
    const staleRes = runtime.submitExternalCandidate(stale, { semanticGap: true });
    assert.equal(staleRes.decision.suppressReason, 'stale_context_version');

    runtime.setSilentMode(true);
    const valid: Candidate = {
      ...tooHigh,
      candidateId: 'cand_valid_silent',
      level: 'L1',
    };
    const silentRes = runtime.submitExternalCandidate(valid, { semanticGap: true });
    assert.equal(silentRes.decision.suppressReason, 'silent_mode');
  } finally {
    cleanup();
  }
});

test('Controller executes automatic withdrawal across user_recovered, context_invalidated, chapter_changed, candidate_expired, and user_dismissed suppression', async () => {
  const { runtime, clock, emitted, cleanup } = buildTestSession('L2');
  try {
    // 1. Trigger drift prompt, then recover -> user_recovered
    await runtime.ingestSpeech({
      text: '顺便聊一下昨天我去吃的午饭，今天外面风景真不错。',
      isFinal: true,
    });
    assert.ok(runtime.state.getActiveIntervention());

    clock.advance(2_000);
    await runtime.ingestSpeech({
      text: '回到刚才的主线要点：自然停顿本身不等于卡壳，Controller 会结合语义缺口判定。',
      isFinal: true,
    });
    assert.equal(runtime.state.getActiveIntervention(), null);
    assert.ok(
      emitted.some(
        (m) => m.type === 'intervention.withdrawn' && m.payload.reason === 'user_recovered',
      ),
    );

    // 2. Dismiss active prompt -> user_dismissed + dismissal suppression window
    clock.advance(20_000);
    const cand: Candidate = {
      candidateId: 'cand_dismiss_1',
      sessionId: runtime.sessionId,
      level: 'L1',
      title: '提醒一',
      cueText: '补提核心要点。',
      priority: 80,
      ttlMs: 12_000,
      expiresAt: msToIso(clock.now() + 12_000),
      contextVersion: runtime.state.getContextVersion(),
      evidenceIds: [],
      basedOnSegmentId: 'seg_init',
      status: 'pending',
      kind: 'omission_cue',
      grounded: true,
      targetKeyPointId: 'kp_same_topic',
    };
    const shown = runtime.submitExternalCandidate(cand, { semanticGap: true });
    assert.ok(shown.shown);

    const dismissDecision = runtime.dismissIntervention({
      interventionId: shown.shown.interventionId,
      candidateId: cand.candidateId,
    });
    assert.equal(dismissDecision.withdrawalReason, 'user_dismissed');

    // Re-submitting same targetKeyPointId inside suppression window must be suppressed.
    const repeat = runtime.submitExternalCandidate(
      { ...cand, candidateId: 'cand_dismiss_2', expiresAt: msToIso(clock.now() + 12_000) },
      { semanticGap: true },
    );
    assert.equal(repeat.decision.suppressReason, 'user_dismissed_suppression');

    // 3. Context invalidation withdraws active prompt cleanly
    clock.advance(35_000);
    const shownCtx = runtime.submitExternalCandidate(
      {
        ...cand,
        candidateId: 'cand_ctx_inv',
        targetKeyPointId: 'kp_other',
        expiresAt: msToIso(clock.now() + 20_000),
      },
      { semanticGap: true },
    );
    assert.ok(shownCtx.shown);
    runtime.invalidateContextVersion();
    assert.ok(
      emitted.some(
        (m) => m.type === 'intervention.withdrawn' && m.payload.reason === 'context_invalidated',
      ),
    );

    // 4. Candidate TTL expiry withdraws active prompt on tick
    clock.advance(16_000);
    const shownTtl = runtime.submitExternalCandidate(
      {
        ...cand,
        candidateId: 'cand_ttl_wd',
        targetKeyPointId: 'kp_ttl',
        ttlMs: 4_000,
        expiresAt: msToIso(clock.now() + 4_000),
        contextVersion: runtime.state.getContextVersion(),
      },
      { semanticGap: true },
    );
    assert.ok(shownTtl.shown);
    clock.advance(5_000);
    const wdTick = await runtime.processTick(5_000);
    assert.equal(wdTick?.withdrawalReason, 'candidate_expired');

    // 5. Honest zero tokens tracked for local rule execution
    const telemetry = runtime.state.getTelemetry();
    assert.equal(telemetry.totalTokens, 0);
    assert.equal(telemetry.modelCalls, 0);
    assert.equal(telemetry.estimation.source, 'local_rule_zero');
    assert.ok(telemetry.localRuleEvaluations >= 1);
  } finally {
    cleanup();
  }
});
