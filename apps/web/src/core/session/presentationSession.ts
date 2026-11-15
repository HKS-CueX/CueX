import {
  nowUtcIso8601,
  type AsrCapabilityStatus,
  type Candidate,
  type CognitiveEvent,
  type ControllerDecision,
  type DataDeletionReceipt,
  type Evidence,
  type FastDecisionVerdict,
  type Intervention,
  type InterventionFeedback,
  type Outcome,
  type PresentationLiveState,
  type PresentationReflection,
  type PresentationWeakSegment,
  type ScenarioCapabilityDescriptor,
  type ServerMessage,
  type Session,
  type SharedCognitiveState,
  type SlowReasoningCandidateResult,
  type TelemetryUsage,
  type TranscriptSegment,
  type UtcIso8601,
  type WithdrawalReason,
} from '@cuex/protocol';
import type { WsConnectionStatus } from '../driver/CueXWSClient';

export interface WithdrawnBanner {
  interventionId: string;
  title?: string;
  cueText?: string;
  reason: WithdrawalReason;
  withdrawnAt: UtcIso8601;
}

export interface PresentationSessionState {
  wsStatus: WsConnectionStatus;
  error?: string;
  session: Session | null;
  scenario: ScenarioCapabilityDescriptor | null;
  asrStatus: AsrCapabilityStatus | null;
  cognitiveState: SharedCognitiveState | null;
  presentationState: PresentationLiveState | null;
  transcripts: TranscriptSegment[];
  events: CognitiveEvent[];
  verdicts: FastDecisionVerdict[];
  candidateResults: SlowReasoningCandidateResult[];
  candidates: Candidate[];
  decisions: ControllerDecision[];
  activeIntervention: Intervention | null;
  interventionHistory: Intervention[];
  lastWithdrawn: WithdrawnBanner | null;
  telemetry: TelemetryUsage | null;
  outcome: Outcome | null;
  reflection: PresentationReflection | null;
  rehearsalContext: {
    weakSegment: PresentationWeakSegment;
    promptText: string;
    supportingEvidence: Evidence[];
  } | null;
  wipedAt?: UtcIso8601;
  deletionReceipt: DataDeletionReceipt | null;
  lastServerSeq: number;
}

export const initialPresentationSessionState: PresentationSessionState = {
  wsStatus: 'idle',
  session: null,
  scenario: null,
  asrStatus: null,
  cognitiveState: null,
  presentationState: null,
  transcripts: [],
  events: [],
  verdicts: [],
  candidateResults: [],
  candidates: [],
  decisions: [],
  activeIntervention: null,
  interventionHistory: [],
  lastWithdrawn: null,
  telemetry: null,
  outcome: null,
  reflection: null,
  rehearsalContext: null,
  deletionReceipt: null,
  lastServerSeq: 0,
};

export type PresentationSessionAction =
  | { type: 'reset' }
  | { type: 'ws_status'; status: WsConnectionStatus }
  | { type: 'error'; message?: string }
  | { type: 'clear_withdrawn' }
  | { type: 'deletion_receipt'; receipt: DataDeletionReceipt }
  | { type: 'local_feedback'; interventionId: string; feedback: InterventionFeedback }
  | { type: 'server_message'; message: ServerMessage };

function upsertCandidate(list: Candidate[], candidate: Candidate): Candidate[] {
  const idx = list.findIndex((item) => item.candidateId === candidate.candidateId);
  if (idx < 0) return [...list, candidate].slice(-30);
  const next = [...list];
  next[idx] = candidate;
  return next;
}

function upsertIntervention(list: Intervention[], intervention: Intervention): Intervention[] {
  const idx = list.findIndex((item) => item.interventionId === intervention.interventionId);
  if (idx < 0) return [...list, intervention].slice(-40);
  const next = [...list];
  next[idx] = intervention;
  return next;
}

function isStaleOrFinishedIntervention(
  intervention: Intervention | null | undefined,
  history: Intervention[],
  candidate?: Candidate | null
): boolean {
  if (!intervention) return true;
  if (intervention.withdrawnAt || intervention.withdrawalReason || intervention.dismissedAt) {
    return true;
  }
  const existing = history.find((item) => item.interventionId === intervention.interventionId);
  if (existing && (existing.withdrawnAt || existing.withdrawalReason || existing.dismissedAt)) {
    return true;
  }
  if (candidate && candidate.candidateId === intervention.candidateId) {
    if (candidate.status === 'expired' || candidate.status === 'withdrawn' || candidate.status === 'dismissed') {
      return true;
    }
    const expiresMs = Date.parse(candidate.expiresAt);
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
      return true;
    }
  }
  return false;
}

export function presentationSessionReducer(
  state: PresentationSessionState,
  action: PresentationSessionAction
): PresentationSessionState {
  if (action.type === 'reset') {
    return { ...initialPresentationSessionState };
  }
  if (action.type === 'ws_status') {
    return { ...state, wsStatus: action.status };
  }
  if (action.type === 'error') {
    return { ...state, error: action.message };
  }
  if (action.type === 'clear_withdrawn') {
    return { ...state, lastWithdrawn: null };
  }
  if (action.type === 'deletion_receipt') {
    return {
      ...initialPresentationSessionState,
      wsStatus: state.wsStatus,
      wipedAt: action.receipt.completedAt,
      deletionReceipt: action.receipt,
    };
  }
  if (action.type === 'local_feedback') {
    const feedbackAt = nowUtcIso8601();
    const updatedActive =
      state.activeIntervention?.interventionId === action.interventionId
        ? { ...state.activeIntervention, userFeedback: action.feedback, feedbackAt }
        : state.activeIntervention;
    const updatedHistory = state.interventionHistory.map((item) =>
      item.interventionId === action.interventionId
        ? { ...item, userFeedback: action.feedback, feedbackAt }
        : item
    );
    return {
      ...state,
      activeIntervention: updatedActive,
      interventionHistory: updatedHistory,
    };
  }

  const msg = action.message;
  if (typeof msg.serverSeq === 'number' && msg.serverSeq <= state.lastServerSeq) {
    return state;
  }
  const nextSeq =
    typeof msg.serverSeq === 'number' ? Math.max(state.lastServerSeq, msg.serverSeq) : state.lastServerSeq;

  switch (msg.type) {
    case 'session.ready': {
      const isSameSession = state.session?.sessionId === msg.payload.session.sessionId;
      const incomingActive = msg.payload.initialState.activeIntervention;
      const safeActive = isStaleOrFinishedIntervention(
        incomingActive,
        isSameSession ? state.interventionHistory : [],
        msg.payload.initialState.activeCandidate
      )
        ? null
        : incomingActive;

      if (isSameSession) {
        return {
          ...state,
          wsStatus: 'connected',
          error: undefined,
          lastServerSeq: nextSeq,
          session: msg.payload.session,
          scenario: msg.payload.scenario,
          asrStatus: msg.payload.asrStatus,
          cognitiveState: {
            ...msg.payload.initialState,
            activeIntervention: safeActive,
          },
          activeIntervention: safeActive,
          presentationState: msg.payload.presentationState ?? state.presentationState,
          telemetry: msg.payload.initialState.telemetry,
        };
      }

      return {
        ...initialPresentationSessionState,
        wsStatus: 'connected',
        lastServerSeq: nextSeq,
        session: msg.payload.session,
        scenario: msg.payload.scenario,
        asrStatus: msg.payload.asrStatus,
        cognitiveState: {
          ...msg.payload.initialState,
          activeIntervention: safeActive,
        },
        activeIntervention: safeActive,
        presentationState: msg.payload.presentationState ?? null,
        telemetry: msg.payload.initialState.telemetry,
      };
    }

    case 'session.state':
      return {
        ...state,
        lastServerSeq: nextSeq,
        session: msg.payload.session,
        cognitiveState: state.cognitiveState
          ? {
              ...state.cognitiveState,
              sessionStatus: msg.payload.session.status,
              silentMode: msg.payload.session.silentMode,
              maxInterventionLevel: msg.payload.session.maxInterventionLevel,
            }
          : state.cognitiveState,
      };

    case 'session.ended':
      return {
        ...state,
        lastServerSeq: nextSeq,
        session: state.session
          ? { ...state.session, status: 'ended', endedAt: msg.payload.endedAt }
          : state.session,
        activeIntervention: null,
        outcome: msg.payload.outcome,
        reflection: msg.payload.reflection ?? state.reflection,
        telemetry: msg.payload.outcome.telemetry,
      };

    case 'session.wiped':
      return {
        ...initialPresentationSessionState,
        wsStatus: state.wsStatus,
        lastServerSeq: nextSeq,
        wipedAt: msg.payload.wipedAt,
      };

    case 'asr.status':
      return {
        ...state,
        lastServerSeq: nextSeq,
        asrStatus: msg.payload,
      };

    case 'asr.transcript': {
      const seg = msg.payload.segment;
      const existingIdx = state.transcripts.findIndex((item) => item.segmentId === seg.segmentId);
      const nextTranscripts = [...state.transcripts];
      if (existingIdx >= 0) {
        nextTranscripts[existingIdx] = seg;
      } else {
        nextTranscripts.push(seg);
      }
      return {
        ...state,
        lastServerSeq: nextSeq,
        transcripts: nextTranscripts.slice(-120),
        asrStatus: msg.payload.asrStatus ?? state.asrStatus,
      };
    }

    case 'cognitive.event':
      return {
        ...state,
        lastServerSeq: nextSeq,
        events: [...state.events, msg.payload].slice(-60),
      };

    case 'cognitive.state': {
      const safeActive = isStaleOrFinishedIntervention(
        msg.payload.activeIntervention,
        state.interventionHistory,
        msg.payload.activeCandidate
      )
        ? null
        : msg.payload.activeIntervention;
      return {
        ...state,
        lastServerSeq: nextSeq,
        cognitiveState: {
          ...msg.payload,
          activeIntervention: safeActive,
        },
        activeIntervention: safeActive,
        telemetry: msg.payload.telemetry,
      };
    }

    case 'system1.verdict':
      return {
        ...state,
        lastServerSeq: nextSeq,
        verdicts: state.verdicts.some((v) => v.requestId === msg.payload.requestId)
          ? state.verdicts
          : [...state.verdicts, msg.payload].slice(-40),
      };

    case 'system2.candidate': {
      const candidate = msg.payload.candidate;
      return {
        ...state,
        lastServerSeq: nextSeq,
        candidateResults: state.candidateResults.some((r) => r.requestId === msg.payload.requestId)
          ? state.candidateResults
          : [...state.candidateResults, msg.payload].slice(-30),
        candidates: candidate ? upsertCandidate(state.candidates, candidate) : state.candidates,
      };
    }

    case 'controller.decision':
      return {
        ...state,
        lastServerSeq: nextSeq,
        decisions: state.decisions.some((d) => d.decisionId === msg.payload.decisionId)
          ? state.decisions
          : [...state.decisions, msg.payload].slice(-60),
      };

    case 'intervention.shown': {
      const matchedCand = state.candidates.find(
        (c) => c.candidateId === msg.payload.intervention.candidateId
      );
      if (
        isStaleOrFinishedIntervention(
          msg.payload.intervention,
          state.interventionHistory,
          matchedCand
        )
      ) {
        return {
          ...state,
          lastServerSeq: nextSeq,
          decisions: state.decisions.some((d) => d.decisionId === msg.payload.decision.decisionId)
            ? state.decisions
            : [...state.decisions, msg.payload.decision].slice(-60),
        };
      }
      return {
        ...state,
        lastServerSeq: nextSeq,
        activeIntervention: msg.payload.intervention,
        interventionHistory: upsertIntervention(state.interventionHistory, msg.payload.intervention),
        lastWithdrawn: null,
        decisions: state.decisions.some((d) => d.decisionId === msg.payload.decision.decisionId)
          ? state.decisions
          : [...state.decisions, msg.payload.decision].slice(-60),
      };
    }

    case 'intervention.withdrawn': {
      const prev =
        state.activeIntervention?.interventionId === msg.payload.interventionId
          ? state.activeIntervention
          : state.interventionHistory.find((i) => i.interventionId === msg.payload.interventionId);
      const updatedIntervention = prev
        ? {
            ...prev,
            withdrawnAt: msg.payload.withdrawnAt,
            withdrawalReason: msg.payload.reason,
          }
        : undefined;
      return {
        ...state,
        lastServerSeq: nextSeq,
        activeIntervention:
          state.activeIntervention?.interventionId === msg.payload.interventionId
            ? null
            : state.activeIntervention,
        interventionHistory: updatedIntervention
          ? upsertIntervention(state.interventionHistory, updatedIntervention)
          : state.interventionHistory,
        lastWithdrawn: {
          interventionId: msg.payload.interventionId,
          title: prev?.title,
          cueText: prev?.cueText,
          reason: msg.payload.reason,
          withdrawnAt: msg.payload.withdrawnAt,
        },
        decisions: state.decisions.some((d) => d.decisionId === msg.payload.decision.decisionId)
          ? state.decisions
          : [...state.decisions, msg.payload.decision].slice(-60),
      };
    }

    case 'presentation.progress':
      return {
        ...state,
        lastServerSeq: nextSeq,
        presentationState: msg.payload,
      };

    case 'rehearsal.ready':
      return {
        ...state,
        lastServerSeq: nextSeq,
        rehearsalContext: {
          weakSegment: msg.payload.weakSegment,
          promptText: msg.payload.promptText,
          supportingEvidence: msg.payload.supportingEvidence,
        },
      };

    case 'telemetry.updated':
      return {
        ...state,
        lastServerSeq: nextSeq,
        telemetry: msg.payload,
      };

    case 'session.error':
      return {
        ...state,
        lastServerSeq: nextSeq,
        error: msg.payload.message,
      };

    case 'pong':
      return {
        ...state,
        lastServerSeq: nextSeq,
      };

    default: {
      const exhaustive: never = msg;
      void exhaustive;
      return state;
    }
  }
}
