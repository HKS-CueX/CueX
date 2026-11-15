import { describe, expect, it } from 'vitest';
import type {
  ControllerDecision,
  Intervention,
  ServerMessage,
  SharedCognitiveState,
} from '@cuex/protocol';
import {
  initialPresentationSessionState,
  presentationSessionReducer,
} from '../src/core/session/presentationSession';

const baseState: SharedCognitiveState = {
  sessionId: 'sess-1',
  scenarioId: 'presentation',
  contextVersion: 1,
  updatedAt: 1000,
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
  cooldownUntilMs: 0,
  suppressions: [],
  telemetry: {
    sessionId: 'sess-1',
    updatedAt: 1000,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
    modelCalls: 0,
    localRuleEvaluations: 0,
    latencyMs: 0,
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

describe('presentationSessionReducer', () => {
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
      shownAt: 2000,
      chapterId: 'ch-1',
    };
    const decisionShow: ControllerDecision = {
      decisionId: 'dec-1',
      sessionId: 'sess-1',
      timestamp: 2000,
      contextVersion: 1,
      selectedAction: 'show_l2_keyword',
      level: 'L2',
      candidateId: 'cand-1',
      interventionId: 'int-1',
      intervention,
      reason: 'Missing core metric',
      trace: {
        evaluatedAt: 2000,
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
      payload: baseState,
    });
    state = applyMsg(state, {
      type: 'intervention.shown',
      payload: { sessionId: 'sess-1', intervention, decision: decisionShow },
    });
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
      payload: {
        sessionId: 'sess-1',
        interventionId: 'int-1',
        candidateId: 'cand-1',
        reason: 'user_recovered',
        decision: { ...decisionShow, decisionId: 'dec-2', selectedAction: 'withdraw' },
        withdrawnAt: 3000,
      },
    });
    expect(state.activeIntervention).toBeNull();
    expect(state.lastWithdrawn?.reason).toBe('user_recovered');
    expect(state.interventionHistory[0].withdrawalReason).toBe('user_recovered');
    expect(state.interventionHistory[0].userFeedback).toBe('helpful');
  });

  it('clears transient data when session.wiped arrives', () => {
    let state = applyMsg(initialPresentationSessionState, {
      type: 'cognitive.state',
      payload: baseState,
    });
    state = applyMsg(state, {
      type: 'session.wiped',
      payload: { sessionId: 'sess-1', wipedAt: 9999 },
    });
    expect(state.session).toBeNull();
    expect(state.transcripts).toEqual([]);
    expect(state.wipedAt).toBe(9999);
  });
});
