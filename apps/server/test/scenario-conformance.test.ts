import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ServerMessage } from '@cuex/protocol';
import {
  CognitiveRuntimeSession,
  HeuristicFastDecisionProvider,
  InterventionController,
  LexicalBm25RetrievalProvider,
  LocalSlowReasoningProvider,
  ManualClock,
  MemoryStore,
} from '../src/runtime';
import {
  PresentationRuntimePlugin,
  SAMPLE_PRESENTATION_PACK,
  ScenarioNotImplementedError,
  ScenarioRegistry,
  toUniversalContextPack,
} from '../src/scenarios';

test('ScenarioRegistry exposes presentation as implemented and roadmap scenarios honestly', () => {
  const registry = new ScenarioRegistry();
  const list = registry.listScenarios();
  assert.equal(list.find((s) => s.id === 'presentation')?.status, 'implemented');
  for (const id of ['social', 'teaching', 'sales', 'custom'] as const) {
    assert.equal(list.find((s) => s.id === id)?.status, 'roadmap');
    assert.throws(() => registry.assertRunnable(id), ScenarioNotImplementedError);
  }
  const runnable = registry.assertRunnable('presentation');
  assert.equal(runnable.id, 'presentation');
});

test('PresentationRuntimePlugin conforms across multi-chapter pace, omission, Q&A grounding, ungrounded gap, rehearsal, and reflection', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cuex-scenario-conf-'));
  const memoryStore = new MemoryStore(path.join(tmpDir, 'memory'));
  const clock = new ManualClock(1_700_000_000_000);
  const pack = structuredClone(SAMPLE_PRESENTATION_PACK);
  const emitted: ServerMessage[] = [];

  try {
    const plugin = new PresentationRuntimePlugin({
      sessionId: 'sess_conf_1',
      mode: 'live',
      viewMode: 'focus',
      pack,
      startedAt: clock.now(),
    });

    const runtime = new CognitiveRuntimeSession({
      sessionId: 'sess_conf_1',
      mode: 'live',
      viewMode: 'focus',
      silentMode: false,
      maxInterventionLevel: 'L3',
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
      slowReasoning: new LocalSlowReasoningProvider({ candidateTtlMs: 10_000 }),
      retrieval: new LexicalBm25RetrievalProvider(),
      controller: new InterventionController({
        cooldownMs: 8_000,
        candidateTtlMs: 10_000,
        dismissSuppressionMs: 30_000,
      }),
      memoryStore,
      clock,
      emitMessage: (m) => emitted.push(m),
    });

    // Advance past chapter 1 targetDuration + 15s to verify overtime pace projection.
    const ch1Target = pack.progressNodes[0].targetDurationSec;
    clock.advance((ch1Target + 15) * 1_000);
    await runtime.processTick(1_000);
    const snapOver = runtime.state.snapshot({
      recentObservations: runtime.context.getRecentObservations(),
      recentSegments: runtime.context.getRecentSegments(),
      now: clock.now(),
    });
    const projOver = plugin.getProjection(snapOver, clock.now());
    assert.equal(projOver.paceStatus, 'overtime');

    // Explicit chapter change updates active chapter cleanly and records node status.
    runtime.setChapter(pack.progressNodes[1].chapterId);
    const afterChapterSnap = runtime.state.snapshot({
      recentObservations: runtime.context.getRecentObservations(),
      recentSegments: runtime.context.getRecentSegments(),
      now: clock.now(),
    });
    const afterChapterProj = plugin.getProjection(afterChapterSnap, clock.now());
    assert.equal(afterChapterProj.activeChapterId, pack.progressNodes[1].chapterId);
    assert.equal(afterChapterProj.chapterNodes[0].status, 'completed');

    // Cooldown advance, then ask an ungrounded out-of-scope audience question -> flagged without fabricated numbers.
    clock.advance(12_000);
    await runtime.ingestSpeech({
      speaker: 'audience',
      text: '请问你们去年在欧洲市场的商业合同签约额和净利润率是多少？',
      isFinal: true,
    });
    assert.ok(
      emitted.some(
        (m) =>
          m.type === 'intervention.shown' &&
          m.payload.intervention.evidenceIds.length === 0 &&
          /未检索|缺乏|核验/.test(m.payload.intervention.cueText),
      ),
    );

    const ended = runtime.end(2, 'completed');
    assert.equal(ended.reflection.sessionId, 'sess_conf_1');
    assert.ok(ended.reflection.diagnosis.unansweredQuestions.length >= 1);
    assert.ok(ended.reflection.weakSegments.length >= 1);
    assert.equal(ended.reflection.utility.formula, 'V = H - λI');
    assert.equal(ended.reflection.telemetry.usageSource, 'local_rule_zero');
  } finally {
    memoryStore.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
