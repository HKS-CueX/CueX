import type {
  AsrCapabilityStatus,
  Candidate,
  CognitiveEvent,
  ControllerDecision,
  Evidence,
  FastDecisionVerdict,
  Intervention,
  InterventionFeedback,
  Outcome,
  PresentationLiveState,
  PresentationReflection,
  PresentationWeakSegment,
  ScenarioCapabilityDescriptor,
  ServerMessage,
  Session,
  SharedCognitiveState,
  SlowReasoningCandidateResult,
  TelemetryUsage,
  TranscriptSegment,
  WithdrawalReason,
} from '@cuex/protocol';
import type { WsConnectionStatus } from '../driver/CueXWSClient';

export interface WithdrawnBanner {
  interventionId: string;
  title?: string;
  cueText?: string;
  reason: WithdrawalReason;
  withdrawnAt: number;
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
  wipedAt?: number;
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
};

export type PresentationSessionAction =
  | { type: 'reset' }
  | { type: 'ws_status'; status: WsConnectionStatus }
  | { type: 'error'; message?: string }
  | { type: 'clear_withdrawn' }
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
  if (action.type === 'local_feedback') {
    const updatedActive =
      state.activeIntervention?.interventionId === action.interventionId
        ? { ...state.activeIntervention, userFeedback: action.feedback, feedbackAt: Date.now() }
        : state.activeIntervention;
    const updatedHistory = state.interventionHistory.map((item) =>
      item.interventionId === action.interventionId
        ? { ...item, userFeedback: action.feedback, feedbackAt: Date.now() }
        : item
    );
    return {
      ...state,
      activeIntervention: updatedActive,
      interventionHistory: updatedHistory,
    };
  }

  const msg = action.message;
  switch (msg.type) {
    case 'session.ready':
      return {
        ...initialPresentationSessionState,
        wsStatus: 'connected',
        session: msg.payload.session,
        scenario: msg.payload.scenario,
        asrStatus: msg.payload.asrStatus,
        cognitiveState: msg.payload.initialState,
        presentationState: msg.payload.presentationState ?? null,
        telemetry: msg.payload.initialState.telemetry,
      };

    case 'session.state':
      return {
        ...state,
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
        session: state.session
          ? { ...state.session, status: 'ended', endedAt: msg.payload.endedAt }
          : state.session,
        outcome: msg.payload.outcome,
        reflection: msg.payload.reflection ?? state.reflection,
        telemetry: msg.payload.outcome.telemetry,
      };

    case 'session.wiped':
      return {
        ...initialPresentationSessionState,
        wsStatus: state.wsStatus,
        wipedAt: msg.payload.wipedAt,
      };

    case 'asr.status':
      return {
        ...state,
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
        transcripts: nextTranscripts.slice(-120),
        asrStatus: msg.payload.asrStatus ?? state.asrStatus,
      };
    }

    case 'cognitive.event':
      return {
        ...state,
        events: [...state.events, msg.payload].slice(-60),
      };

    case 'cognitive.state':
      return {
        ...state,
        cognitiveState: msg.payload,
        activeIntervention: msg.payload.activeIntervention,
        telemetry: msg.payload.telemetry,
      };

    case 'system1.verdict':
      return {
        ...state,
        verdicts: [...state.verdicts, msg.payload].slice(-40),
      };

    case 'system2.candidate': {
      const candidate = msg.payload.candidate;
      return {
        ...state,
        candidateResults: [...state.candidateResults, msg.payload].slice(-30),
        candidates: candidate ? upsertCandidate(state.candidates, candidate) : state.candidates,
      };
    }

    case 'controller.decision':
      return {
        ...state,
        decisions: [...state.decisions, msg.payload].slice(-60),
      };

    case 'intervention.shown':
      return {
        ...state,
        activeIntervention: msg.payload.intervention,
        interventionHistory: upsertIntervention(state.interventionHistory, msg.payload.intervention),
        lastWithdrawn: null,
        decisions: state.decisions.some((d) => d.decisionId === msg.payload.decision.decisionId)
          ? state.decisions
          : [...state.decisions, msg.payload.decision].slice(-60),
      };

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
        presentationState: msg.payload,
      };

    case 'rehearsal.ready':
      return {
        ...state,
        rehearsalContext: {
          weakSegment: msg.payload.weakSegment,
          promptText: msg.payload.promptText,
          supportingEvidence: msg.payload.supportingEvidence,
        },
      };

    case 'telemetry.updated':
      return {
        ...state,
        telemetry: msg.payload,
      };

    case 'session.error':
      return {
        ...state,
        error: msg.payload.message,
      };

    case 'pong':
      return state;

    default: {
      const exhaustive: never = msg;
      void exhaustive;
      return state;
    }
  }
}
