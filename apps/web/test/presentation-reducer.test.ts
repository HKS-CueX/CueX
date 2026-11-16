import { describe, expect, it } from 'vitest';
import type {
  ControllerDecision,
  DataDeletionReceipt,
  DualSystemCollaborationMetrics,
  Intervention,
  S1ObservationSnapshot,
  ServerMessage,
  SharedCognitiveState,
  System2Guidance,
  WsAttachState,
} from '@cuex/protocol';
import { createWsRolePolicy } from '@cuex/protocol';
import {
  initialPresentationSessionState,
  presentationSessionReducer,
} from '../src/core/session/presentationSession';

const T0 = '2026-11-16T00:00:00.000Z';
const T1 = '2026-11-16T00:00:02.000Z';
const T2 = '2026-11-16T00:00:04.000Z';

const baseState: SharedCognitiveState = {
  sessionId: 'sess-1',
  scenarioId: 'presentation',
  contextVersion: 1,
  updatedAt: T0,
  sessionStatus: 'active',
  silentMode: false,
  maxInterventionLevel: 'L3',
  activeGoal: 'Present CueX',
  activeChapterId: 'ch-1',
  activeChapterTitle: 'Problem & Architecture',
  constraints: [],
  attentionSignal: 'fluent',
  openGapLabels: [],
  activeIntervention: null,
  activeCandidate: null,
  queuedCandidates: [],
  recentObservations: [],
  recentSegments: [],
  cooldownUntil: undefined,
  suppressions: [],
  telemetry: {
    sessionId: 'sess-1',
    updatedAt: T0,
    usageSource: 'local_rule_zero',
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
    modelCalls: 0,
    retries: 0,
    localRuleEvaluations: 1,
    latencyMs: 3,
    latencyStats: { avgMs: 3, p95Ms: 3, maxMs: 3 },
    degraded: false,
    usingLocalFallback: true,
    asrProvider: 'text_simulation',
    asrDurationMs: 0,
    costFen: 0,
    cost: { currency: 'CNY', amountFen: 0, formatted: '¥0.00' },
    estimation: {
      isEstimated: false,
      source: 'local_rule_zero',
      usingLocalFallback: true,
    },
  },
};

function applyMsg(state: typeof initialPresentationSessionState, message: ServerMessage) {
  return presentationSessionReducer(state, { type: 'server_message', message });
}

describe('presentationSessionReducer (Protocol v2.0)', () => {
  it('tracks intervention.shown, optimistic local_feedback, and automatic withdrawal', () => {
    const intervention: Intervention = {
      interventionId: 'int-1',
      sessionId: 'sess-1',
      candidateId: 'cand-1',
      level: 'L2',
      title: '补充核心指标',
      cueText: 'V = H - λI',
      evidenceIds: ['ev-1'],
      grounded: true,
      contextVersion: 1,
      shownAt: T1,
      chapterId: 'ch-1',
    };
    const decisionShow: ControllerDecision = {
      decisionId: 'dec-1',
      sessionId: 'sess-1',
      timestamp: T1,
      contextVersion: 1,
      selectedAction: 'show_l2_keyword',
      level: 'L2',
      candidateId: 'cand-1',
      interventionId: 'int-1',
      intervention,
      reason: 'Missing core metric',
      trace: {
        evaluatedAt: T1,
        contextVersion: 1,
        groundedChecked: true,
        evidenceCount: 1,
        cooldownRemainingMs: 0,
        ceilingLevel: 'L3',
        silentMode: false,
        paused: false,
        signalsEvaluated: {
          silenceMs: 0,
          semanticGap: true,
          drift: false,
          openQuestion: false,
          manualHelp: false,
          recovery: false,
        },
        rulesApplied: ['grounding_ok'],
      },
    };

    let state = applyMsg(initialPresentationSessionState, {
      type: 'cognitive.state',
      serverSeq: 1,
      payload: baseState,
    });
    state = applyMsg(state, {
      type: 'intervention.shown',
      serverSeq: 2,
      payload: { sessionId: 'sess-1', intervention, decision: decisionShow },
    });
    expect(state.lastServerSeq).toBe(2);
    expect(state.activeIntervention?.interventionId).toBe('int-1');
    expect(state.interventionHistory).toHaveLength(1);

    state = presentationSessionReducer(state, {
      type: 'local_feedback',
      interventionId: 'int-1',
      feedback: 'helpful',
    });
    expect(state.activeIntervention?.userFeedback).toBe('helpful');

    state = applyMsg(state, {
      type: 'intervention.withdrawn',
      serverSeq: 3,
      payload: {
        sessionId: 'sess-1',
        interventionId: 'int-1',
        candidateId: 'cand-1',
        reason: 'user_recovered',
        decision: { ...decisionShow, decisionId: 'dec-2', selectedAction: 'withdraw' },
        withdrawnAt: T2,
      },
    });
    expect(state.lastServerSeq).toBe(3);
    expect(state.activeIntervention).toBeNull();
    expect(state.lastWithdrawn?.reason).toBe('user_recovered');
    expect(state.interventionHistory[0].withdrawalReason).toBe('user_recovered');
    expect(state.interventionHistory[0].userFeedback).toBe('helpful');
  });

  it('deduplicates replayed serverSeq messages and never re-displays withdrawn hints', () => {
    const intervention: Intervention = {
      interventionId: 'int-dup',
      sessionId: 'sess-1',
      candidateId: 'cand-dup',
      level: 'L2',
      title: '旧提示',
      cueText: '不要重现',
      evidenceIds: ['ev-1'],
      grounded: true,
      contextVersion: 1,
      shownAt: T1,
    };

    let state = applyMsg(initialPresentationSessionState, {
      type: 'cognitive.state',
      serverSeq: 5,
      payload: baseState,
    });
    state = applyMsg(state, {
      type: 'intervention.shown',
      serverSeq: 6,
      payload: {
        sessionId: 'sess-1',
        intervention,
        decision: {
          decisionId: 'dec-dup-1',
          sessionId: 'sess-1',
          timestamp: T1,
          contextVersion: 1,
          selectedAction: 'show_l2_keyword',
          level: 'L2',
          interventionId: 'int-dup',
          reason: 'gap',
          trace: {
            evaluatedAt: T1,
            contextVersion: 1,
            groundedChecked: true,
            evidenceCount: 1,
            cooldownRemainingMs: 0,
            ceilingLevel: 'L3',
            silentMode: false,
            paused: false,
            signalsEvaluated: {
              silenceMs: 0,
              semanticGap: true,
              drift: false,
              openQuestion: false,
              manualHelp: false,
              recovery: false,
            },
            rulesApplied: ['ok'],
          },
        },
      },
    });
    state = applyMsg(state, {
      type: 'intervention.withdrawn',
      serverSeq: 7,
      payload: {
        sessionId: 'sess-1',
        interventionId: 'int-dup',
        reason: 'user_recovered',
        decision: {
          decisionId: 'dec-dup-2',
          sessionId: 'sess-1',
          timestamp: T2,
          contextVersion: 1,
          selectedAction: 'withdraw',
          reason: 'recovered',
          trace: {
            evaluatedAt: T2,
            contextVersion: 1,
            groundedChecked: true,
            evidenceCount: 1,
            cooldownRemainingMs: 0,
            ceilingLevel: 'L3',
            silentMode: false,
            paused: false,
            signalsEvaluated: {
              silenceMs: 0,
              semanticGap: false,
              drift: false,
              openQuestion: false,
              manualHelp: false,
              recovery: true,
            },
            rulesApplied: ['withdraw'],
          },
        },
        withdrawnAt: T2,
      },
    });
    expect(state.activeIntervention).toBeNull();

    // Replay older serverSeq=6 -> ignored completely
    const afterReplay = applyMsg(state, {
      type: 'intervention.shown',
      serverSeq: 6,
      payload: {
        sessionId: 'sess-1',
        intervention,
        decision: {
          decisionId: 'dec-dup-1',
          sessionId: 'sess-1',
          timestamp: T1,
          contextVersion: 1,
          selectedAction: 'show_l2_keyword',
          level: 'L2',
          interventionId: 'int-dup',
          reason: 'replay',
          trace: {
            evaluatedAt: T1,
            contextVersion: 1,
            groundedChecked: true,
            evidenceCount: 1,
            cooldownRemainingMs: 0,
            ceilingLevel: 'L3',
            silentMode: false,
            paused: false,
            signalsEvaluated: {
              silenceMs: 0,
              semanticGap: true,
              drift: false,
              openQuestion: false,
              manualHelp: false,
              recovery: false,
            },
            rulesApplied: ['ok'],
          },
        },
      },
    });
    expect(afterReplay.activeIntervention).toBeNull();

    // Newer cognitive.state carrying stale activeIntervention for already-withdrawn int-dup -> filtered
    const afterStaleState = applyMsg(afterReplay, {
      type: 'cognitive.state',
      serverSeq: 8,
      payload: {
        ...baseState,
        activeIntervention: intervention,
      },
    });
    expect(afterStaleState.activeIntervention).toBeNull();
  });

  it('clears transient data on session.wiped and stores deletion_receipt', () => {
    let state = applyMsg(initialPresentationSessionState, {
      type: 'cognitive.state',
      serverSeq: 1,
      payload: baseState,
    });
    state = applyMsg(state, {
      type: 'session.wiped',
      serverSeq: 2,
      payload: { sessionId: 'sess-1', wipedAt: T2 },
    });
    expect(state.session).toBeNull();
    expect(state.transcripts).toEqual([]);
    expect(state.wipedAt).toBe(T2);

    const receipt: DataDeletionReceipt = {
      receiptId: 'rcpt-1',
      userId: 'user-1',
      tenantId: 'tenant_default',
      requestedAt: T1,
      completedAt: T2,
      deletedScopes: [{ scope: 'sessions', deletedCount: 1 }],
      preservedRecords: [
        {
          category: 'billing_audit_logs',
          count: 1,
          reason: 'Financial audit retention',
          retentionPolicy: '7y',
        },
      ],
      thirdPartyCaveats: [],
    };
    const afterReceipt = presentationSessionReducer(state, {
      type: 'deletion_receipt',
      receipt,
    });
    expect(afterReceipt.deletionReceipt?.receiptId).toBe('rcpt-1');
    expect(afterReceipt.wipedAt).toBe(T2);
  });

  // 验证 @cuex/protocol v2.2.0 双向异步协同与伴随窗状态同步
  it('tracks system2.guidance monotonic revisions, S1 observations, dualSystem metrics, and session.attach_state', () => {
    const attachState: WsAttachState = {
      sessionId: 'sess-1',
      lastSeenSeq: 1,
      role: 'companion',
      activePrimaryConnected: true,
      canCaptureMic: false,
      rolePolicy: createWsRolePolicy('companion'),
      companionCount: 1,
    };

    let state = applyMsg(initialPresentationSessionState, {
      type: 'session.attach_state',
      serverSeq: 1,
      payload: attachState,
    });
    expect(state.attachState?.role).toBe('companion');
    expect(state.attachState?.canCaptureMic).toBe(false);
    expect(state.attachState?.rolePolicy.canInteractWithCues).toBe(true);

    const gRev2: System2Guidance = {
      guidanceId: 'guid-2',
      sessionId: 'sess-1',
      revision: 2,
      contextVersion: 1,
      basedOnTurnSeq: 4,
      staleAfterTurnSeq: 7,
      issuedAtMs: 1_700_000_002_000,
      expiresAtMs: 1_700_000_020_000,
      focusDirective: '先回应提问再回切净效用公式',
      strategyHints: ['仅引用已确认事实 F-04'],
      recommendedBias: 'qa_grounding',
      preferredLevel: 'L2',
      evidenceAnchors: ['ev-4'],
      grounded: true,
      reasoningEffort: 'medium',
      model: 'gemini-4-hydrogen',
    };
    const gStaleRev1: System2Guidance = {
      ...gRev2,
      guidanceId: 'guid-1',
      revision: 1,
      focusDirective: '旧修订不应覆盖 r2',
    };

    state = applyMsg(state, { type: 'system2.guidance', serverSeq: 2, payload: gRev2 });
    state = applyMsg(state, { type: 'system2.guidance', serverSeq: 3, payload: gStaleRev1 });
    expect(state.system2Guidance?.revision).toBe(2);
    expect(state.system2Guidance?.focusDirective).toBe('先回应提问再回切净效用公式');
    expect(state.guidanceHistory).toHaveLength(2);

    const obs: S1ObservationSnapshot = {
      turnSeq: 5,
      observedAtMs: 1_700_000_003_000,
      decisionType: 'noul',
      selectedSlot: 3,
      label: 'omitting_key_point',
      calibratedConfidence: 0.91,
      margin: 0.42,
      entropy: 0.28,
      escalatedToS2: true,
      escalationReason: 'omission_with_open_gap',
      latencyMs: 88,
      degraded: false,
      providerKind: 'colab_jev',
      model: 'autotrust/JEV-27B',
      promptFormat: 'jev-v1',
      calibrated: true,
      guidanceAppliedRevision: 2,
    };
    const metrics: DualSystemCollaborationMetrics = {
      s1Evaluations: 5,
      s1Escalations: 2,
      s2AsyncDispatches: 2,
      s2Completed: 1,
      s2CancelledAsStale: 1,
      s2Coalesced: 1,
      guidanceRevisionsIssued: 2,
      guidanceAppliedCount: 1,
      guidanceExpiredOrOverridden: 0,
      s1P50LatencyMs: 85,
      s1P95LatencyMs: 112,
      s2P50LatencyMs: 2100,
      s2P95LatencyMs: 3200,
    };

    state = applyMsg(state, {
      type: 'system1.verdict',
      serverSeq: 4,
      payload: {
        requestId: 'req-s1-5',
        sessionId: 'sess-1',
        contextVersion: 1,
        timestamp: T1,
        cognitiveState: 'omitting_key_point',
        speakerIntent: 'presenting',
        interventionNeed: 'trigger_l1',
        recommendedLevel: 'L1',
        recoveryDetected: false,
        confidence: 0.91,
        coveredPointIds: [],
        missingPointIds: ['p-2'],
        driftDetected: false,
        reason: 'Omission detected with calibrated S1 margin',
        signals: {
          silenceMs: 0,
          semanticOmission: true,
          topicDrift: false,
          openQuestion: false,
          recovery: false,
        },
        latencyMs: 88,
        backend: 'colab-jev-s1',
        observation: obs,
      },
    });
    expect(state.latestS1Observation?.model).toBe('autotrust/JEV-27B');
    expect(state.latestS1Observation?.guidanceAppliedRevision).toBe(2);

    state = applyMsg(state, {
      type: 'telemetry.updated',
      serverSeq: 5,
      payload: {
        ...baseState.telemetry,
        dualSystem: metrics,
      },
    });
    expect(state.dualSystemMetrics?.s2CancelledAsStale).toBe(1);

    state = applyMsg(state, {
      type: 'session.error',
      serverSeq: 6,
      payload: {
        code: 'COMPANION_READ_ONLY',
        message: '伴随窗禁止写入音频分片',
      },
    });
    expect(state.error).toContain('COMPANION_READ_ONLY');
  });
});
