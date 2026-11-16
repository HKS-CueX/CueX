import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MemoryStore, msToIso } from '../src/runtime';
import { computeUtilitySummary } from '../src/scenarios';

test('MemoryStore enforces explicit userConfirmed opt-in and supports CRUD and session wipe', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cuex-mem-test-'));
  let store: MemoryStore | undefined;
  let reloaded: MemoryStore | undefined;
  try {
    store = new MemoryStore(dir);

    assert.throws(() => {
      store!.create({
        scenarioId: 'presentation',
        category: 'preference',
        title: '未确认记忆',
        content: '不应被静默写入',
        sourceSessionId: 'sess_1',
        userConfirmed: false,
        privacyLevel: 'local_private',
        scope: 'scenario',
      });
    }, /userConfirmed/);

    const m1 = store.create({
      scenarioId: 'presentation',
      category: 'pacing_habit',
      title: '开场控时',
      content: '开场控制在 90 秒内完成。',
      sourceSessionId: 'sess_1',
      userConfirmed: true,
      privacyLevel: 'local_private',
      scope: 'scenario',
    });

    const m2 = store.create({
      scenarioId: 'presentation',
      category: 'fact',
      title: '全局口径',
      content: '延迟目标控制在 1460 ms 内。',
      sourceSessionId: 'sess_2',
      userConfirmed: true,
      privacyLevel: 'shared',
      scope: 'global',
    });

    assert.equal(store.list().length, 2);

    const patched = store.patch(m1.memoryId, { content: '开场控制在 75 秒内完成。' });
    assert.equal(patched?.content, '开场控制在 75 秒内完成。');

    // Wiping sess_1 only deletes sess_1 records.
    const wipedCount = store.wipeSession('sess_1');
    assert.equal(wipedCount, 1);
    assert.equal(store.get(m1.memoryId), undefined);
    assert.ok(store.get(m2.memoryId));

    // Patching userConfirmed=false or deleting removes item cleanly.
    assert.equal(store.delete(m2.memoryId), true);
    assert.equal(store.list().length, 0);

    // Reloading from disk confirms durable empty state.
    reloaded = new MemoryStore(dir);
    assert.equal(reloaded.list().length, 0);
  } finally {
    reloaded?.close();
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computeUtilitySummary computes V = H - λI honestly for explicit feedback, dismissals, and recovery withdrawals', () => {
  const utility = computeUtilitySummary({
    lambda: 2,
    interventions: [
      {
        interventionId: 'i1',
        sessionId: 's',
        candidateId: 'c1',
        level: 'L2',
        title: 't1',
        cueText: 'cue1',
        evidenceIds: ['ev1'],
        grounded: true,
        contextVersion: 1,
        shownAt: msToIso(1_700_000_001_000),
        withdrawnAt: msToIso(1_700_000_003_000),
        withdrawalReason: 'user_recovered',
        userFeedback: 'helpful',
      },
      {
        interventionId: 'i2',
        sessionId: 's',
        candidateId: 'c2',
        level: 'L1',
        title: 't2',
        cueText: 'cue2',
        evidenceIds: [],
        grounded: true,
        contextVersion: 1,
        shownAt: msToIso(1_700_000_004_000),
        withdrawnAt: msToIso(1_700_000_004_500),
        withdrawalReason: 'user_recovered',
      },
      {
        interventionId: 'i3',
        sessionId: 's',
        candidateId: 'c3',
        level: 'L2',
        title: 't3',
        cueText: 'cue3',
        evidenceIds: [],
        grounded: true,
        contextVersion: 1,
        shownAt: msToIso(1_700_000_006_000),
        withdrawnAt: msToIso(1_700_000_006_200),
        withdrawalReason: 'user_dismissed',
        dismissedAt: msToIso(1_700_000_006_200),
      },
    ],
    decisions: [
      {
        decisionId: 'd1',
        sessionId: 's',
        timestamp: msToIso(1_700_000_002_000),
        contextVersion: 1,
        selectedAction: 'stay_silent',
        level: 'L0',
        suppressReason: 'pause_only_without_gap',
        reason: 'suppressed',
        trace: {
          evaluatedAt: msToIso(1_700_000_002_000),
          contextVersion: 1,
          groundedChecked: false,
          evidenceCount: 0,
          cooldownRemainingMs: 0,
          ceilingLevel: 'L2',
          silentMode: false,
          paused: false,
          signalsEvaluated: {
            silenceMs: 2500,
            semanticGap: false,
            drift: false,
            openQuestion: false,
            manualHelp: false,
            recovery: false,
          },
          rulesApplied: ['pause_only_without_gap'],
        },
      },
    ],
  });

  // H = 2 (i1 explicit helpful, i2 user_recovered without disruption), I = 1 (i3 dismissed), lambda = 2 -> V = 2 - 2*1 = 0
  assert.equal(utility.helpfulCount, 2);
  assert.equal(utility.distractingCount, 1);
  assert.equal(utility.explicitHelpfulCount, 1);
  assert.equal(utility.explicitDistractingCount, 0);
  assert.equal(utility.withdrawnBeforeDisruptionCount, 2);
  assert.equal(utility.suppressedCount, 1);
  assert.equal(utility.netUtilityScore, 0);
  assert.equal(utility.formula, 'V = H - λI');
});
