import {
  nowUtcIso8601,
  type AsrCapabilityStatus,
  type Candidate,
  type CognitiveEvent,
  type ControllerDecision,
  type DataDeletionReceipt,
  type DualSystemCollaborationMetrics,
  type Evidence,
  type FastDecisionVerdict,
  type Intervention,
  type InterventionFeedback,
  type Outcome,
  type PresentationLiveState,
  type PresentationReflection,
  type PresentationWeakSegment,
  type S1ObservationSnapshot,
  type ScenarioCapabilityDescriptor,
  type ServerMessage,
  type Session,
  type SharedCognitiveState,
  type SlowReasoningCandidateResult,
  type System2Guidance,
  type TelemetryUsage,
  type TranscriptSegment,
  type UtcIso8601,
  type WithdrawalReason,
  type WsAttachState,
} from '@cuex/protocol';
import { formatApiError } from '@/lib/format';
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
  /** 当前连接附着角色与并发控制权状态（主控端或伴随窗）。 */
  attachState: WsAttachState | null;
  /** 共享黑板上当前由 System 2 下发的异步指导指令。 */
  system2Guidance: System2Guidance | null;
  /** 最近保留的 System 2 指导修订历史，供 Inspector 透视追踪。 */
  guidanceHistory: System2Guidance[];
  /** 最近一轮 System 1（Colab Jev-Like 或本地规则）单轮观测快照。 */
  latestS1Observation: S1ObservationSnapshot | null;
  /** 最近保留的多轮 System 1 观测轨迹。 */
  s1Observations: S1ObservationSnapshot[];
  /** 双向异步双系统协同计数与延迟分布指标。 */
  dualSystemMetrics: DualSystemCollaborationMetrics | null;
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
  attachState: null,
  system2Guidance: null,
  guidanceHistory: [],
  latestS1Observation: null,
  s1Observations: [],
  dualSystemMetrics: null,
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

function upsertGuidance(list: System2Guidance[], guidance: System2Guidance): System2Guidance[] {
  const idx = list.findIndex((item) => item.revision === guidance.revision);
  if (idx < 0) return [...list, guidance].slice(-12);
  const next = [...list];
  next[idx] = guidance;
  return next;
}

function upsertS1Observation(
  list: S1ObservationSnapshot[],
  observation: S1ObservationSnapshot
): S1ObservationSnapshot[] {
  const idx = list.findIndex((item) => item.turnSeq === observation.turnSeq);
  if (idx < 0) return [...list, observation].slice(-30);
  const next = [...list];
  next[idx] = observation;
  return next;
}

function selectFresherGuidance(
  current: System2Guidance | null,
  incoming: System2Guidance | null | undefined
): System2Guidance | null {
  if (incoming === undefined) return current;
  if (incoming === null) return null;
  if (!current || incoming.revision >= current.revision) return incoming;
  return current;
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
      // 伴随窗/重连接入时，服务端会先直发当前最新 session.ready（无 serverSeq），随后按序补播首条带 serverSeq 的历史 session.ready；
      // 同一会话收到带 serverSeq 的历史补播 session.ready 时仅推进 lastServerSeq，禁止用 t=0 历史快照覆盖当前角色与实时状态。
      if (isSameSession && typeof msg.serverSeq === 'number') {
        return {
          ...state,
          lastServerSeq: nextSeq,
        };
      }
      const incomingActive = msg.payload.initialState.activeIntervention;
      const safeActive = isStaleOrFinishedIntervention(
        incomingActive,
        isSameSession ? state.interventionHistory : [],
        msg.payload.initialState.activeCandidate
      )
        ? null
        : incomingActive;

      const initialGuidance = msg.payload.initialState.system2Guidance ?? null;
      const initialObservation = msg.payload.initialState.latestS1Observation ?? null;
      const initialMetrics =
        msg.payload.initialState.dualSystemMetrics ?? msg.payload.initialState.telemetry.dualSystem ?? null;

      if (isSameSession) {
        const nextGuidance = selectFresherGuidance(state.system2Guidance, initialGuidance);
        const nextAttachState =
          state.attachState?.role === 'companion' && msg.payload.attachState?.role === 'primary'
            ? state.attachState
            : (msg.payload.attachState ?? state.attachState);
        return {
          ...state,
          wsStatus: 'connected',
          error: undefined,
          lastServerSeq: nextSeq,
          session: msg.payload.session,
          scenario: msg.payload.scenario,
          asrStatus: msg.payload.asrStatus,
          attachState: nextAttachState,
          system2Guidance: nextGuidance,
          guidanceHistory: nextGuidance ? upsertGuidance(state.guidanceHistory, nextGuidance) : state.guidanceHistory,
          latestS1Observation: initialObservation ?? state.latestS1Observation,
          s1Observations: initialObservation
            ? upsertS1Observation(state.s1Observations, initialObservation)
            : state.s1Observations,
          dualSystemMetrics: initialMetrics ?? state.dualSystemMetrics,
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
        attachState: msg.payload.attachState ?? null,
        system2Guidance: initialGuidance,
        guidanceHistory: initialGuidance ? [initialGuidance] : [],
        latestS1Observation: initialObservation,
        s1Observations: initialObservation ? [initialObservation] : [],
        dualSystemMetrics: initialMetrics,
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
      const nextGuidance = selectFresherGuidance(state.system2Guidance, msg.payload.system2Guidance);
      const nextObservation = msg.payload.latestS1Observation ?? state.latestS1Observation;
      return {
        ...state,
        lastServerSeq: nextSeq,
        system2Guidance: nextGuidance,
        guidanceHistory:
          msg.payload.system2Guidance && nextGuidance
            ? upsertGuidance(state.guidanceHistory, nextGuidance)
            : state.guidanceHistory,
        latestS1Observation: nextObservation,
        s1Observations: msg.payload.latestS1Observation
          ? upsertS1Observation(state.s1Observations, msg.payload.latestS1Observation)
          : state.s1Observations,
        dualSystemMetrics:
          msg.payload.dualSystemMetrics ?? msg.payload.telemetry.dualSystem ?? state.dualSystemMetrics,
        cognitiveState: {
          ...msg.payload,
          activeIntervention: safeActive,
        },
        activeIntervention: safeActive,
        telemetry: msg.payload.telemetry,
      };
    }

    case 'system1.verdict': {
      const obs = msg.payload.observation;
      return {
        ...state,
        lastServerSeq: nextSeq,
        verdicts: state.verdicts.some((v) => v.requestId === msg.payload.requestId)
          ? state.verdicts
          : [...state.verdicts, msg.payload].slice(-40),
        latestS1Observation: obs ?? state.latestS1Observation,
        s1Observations: obs ? upsertS1Observation(state.s1Observations, obs) : state.s1Observations,
      };
    }

    case 'system2.candidate': {
      const candidate = msg.payload.candidate;
      const incomingGuidance = msg.payload.guidance;
      const nextGuidance = incomingGuidance
        ? selectFresherGuidance(state.system2Guidance, incomingGuidance)
        : state.system2Guidance;
      return {
        ...state,
        lastServerSeq: nextSeq,
        candidateResults: state.candidateResults.some((r) => r.requestId === msg.payload.requestId)
          ? state.candidateResults
          : [...state.candidateResults, msg.payload].slice(-30),
        candidates: candidate ? upsertCandidate(state.candidates, candidate) : state.candidates,
        system2Guidance: nextGuidance,
        guidanceHistory: incomingGuidance
          ? upsertGuidance(state.guidanceHistory, incomingGuidance)
          : state.guidanceHistory,
      };
    }

    case 'system2.guidance': {
      // 仅接收版本号不低于当前版本的异步指导指令，防止乱序回退
      const nextGuidance = selectFresherGuidance(state.system2Guidance, msg.payload);
      return {
        ...state,
        lastServerSeq: nextSeq,
        system2Guidance: nextGuidance,
        guidanceHistory: upsertGuidance(state.guidanceHistory, msg.payload),
        cognitiveState: state.cognitiveState
          ? { ...state.cognitiveState, system2Guidance: nextGuidance }
          : state.cognitiveState,
      };
    }

    case 'session.attach_state':
      return {
        ...state,
        lastServerSeq: nextSeq,
        attachState: msg.payload,
      };

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
        dualSystemMetrics: msg.payload.dualSystem ?? state.dualSystemMetrics,
      };

    case 'session.error':
      return {
        ...state,
        lastServerSeq: nextSeq,
        error: msg.payload.code
          ? formatApiError({
              code: msg.payload.code,
              message: msg.payload.message,
              retryable: msg.payload.retryable,
            })
          : msg.payload.message,
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
