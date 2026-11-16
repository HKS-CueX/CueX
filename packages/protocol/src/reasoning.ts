/**
 * Model-Agnostic Decision (System 1) and Slow Reasoning (System 2) Contracts.
 */

import type { InterventionLevel, LlmReasoningEffort, TelemetryUsageSource } from '#src/common';
import type { S1ObservationSnapshot, System2Guidance } from '#src/dual-system';
import type { Candidate, Evidence, Intervention, TranscriptSegment } from '#src/entities';
import type { ScenarioId } from '#src/scenario';
import type { UtcIso8601 } from '#src/versions';

export interface ProviderUsageRecord {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens?: number;
  modelCalls: number;
  retries?: number;
  usageSource: TelemetryUsageSource;
  degraded?: boolean;
  costFen?: number;
  provider?: string;
  model?: string;
  correlationId?: string;
}

export interface FastDecisionInput {
  sessionId: string;
  scenarioId: ScenarioId;
  contextVersion: number;
  timestamp: UtcIso8601;
  activeGoal: string;
  activeChapterId?: string;
  activeChapterTitle?: string;
  expectedPoints: Array<{
    id: string;
    label: string;
    covered: boolean;
  }>;
  recentSegments: TranscriptSegment[];
  recentTextDigest: string;
  silenceDurationMs: number;
  activeCandidate?: Pick<
    Candidate,
    'candidateId' | 'level' | 'title' | 'cueText' | 'contextVersion' | 'basedOnSegmentId'
  >;
  activeIntervention?: Pick<
    Intervention,
    'interventionId' | 'level' | 'title' | 'cueText' | 'shownAt'
  >;
  manualHelpRequested?: boolean;
  /** 可选 System 1 评估轮次序号与黑板当前生效的 System 2 指导指令。 */
  turnSeq?: number;
  activeGuidance?: System2Guidance | null;
}

export type CognitiveAttentionState =
  | 'fluent'
  | 'on_track'
  | 'drifting'
  | 'omitting_key_point'
  | 'hesitating'
  | 'answering_question'
  | 'recovering'
  | 'overtime';

export type SpeakerIntent =
  | 'presenting'
  | 'elaborating'
  | 'transitioning'
  | 'responding_to_qa'
  | 'pausing_for_effect'
  | 'searching_for_word'
  | 'wrapping_up';

export type InterventionNeed =
  | 'none'
  | 'prepare_candidate'
  | 'trigger_l1'
  | 'trigger_l2'
  | 'trigger_l3'
  | 'withdraw_active';

export interface FastDecisionVerdict {
  requestId: string;
  sessionId: string;
  contextVersion: number;
  timestamp: UtcIso8601;
  cognitiveState: CognitiveAttentionState;
  speakerIntent: SpeakerIntent;
  interventionNeed: InterventionNeed;
  recommendedLevel: InterventionLevel;
  recoveryDetected: boolean;
  confidence: number;
  coveredPointIds: string[];
  missingPointIds: string[];
  detectedQuestion?: string;
  driftDetected: boolean;
  reason: string;
  signals: {
    silenceMs: number;
    semanticOmission: boolean;
    topicDrift: boolean;
    openQuestion: boolean;
    recovery: boolean;
  };
  latencyMs: number;
  backend: string;
  usage?: ProviderUsageRecord;
  /** 可选 System 1 本轮观测明细（供共享认知黑板同步记录）。 */
  observation?: S1ObservationSnapshot;
}

export type SlowReasoningTriggerKind =
  | 'omission'
  | 'drift'
  | 'live_qa'
  | 'pace_overtime'
  | 'manual_help'
  | 'hesitation';

export interface SlowReasoningCandidateRequest {
  requestId: string;
  sessionId: string;
  scenarioId: ScenarioId;
  contextVersion: number;
  timestamp: UtcIso8601;
  triggerKind: SlowReasoningTriggerKind;
  requestedLevel: InterventionLevel;
  activeGoal: string;
  activeChapterId?: string;
  activeChapterTitle?: string;
  questionText?: string;
  missingPoints?: Array<{ id: string; label: string }>;
  recentSegments: TranscriptSegment[];
  retrievedEvidence: Evidence[];
  constraints: string[];
  forbiddenClaims?: string[];
  basedOnSegmentId: string;
  /** 可选触发本次推理时的轮次序号与推理强度覆盖。 */
  basedOnTurnSeq?: number;
  reasoningEffort?: LlmReasoningEffort;
}

export interface SlowReasoningCandidateResult {
  requestId: string;
  sessionId: string;
  contextVersion: number;
  timestamp: UtcIso8601;
  status: 'synthesized' | 'insufficient_evidence' | 'no_action_needed' | 'aborted' | 'error';
  candidate?: Candidate;
  /** 可选由 System 2 同步产出的指导指令更新。 */
  guidance?: System2Guidance;
  reasoningEffort?: LlmReasoningEffort;
  evidenceIds: string[];
  /** True only when every claim in the candidate is grounded in verified Evidence items. */
  grounded: boolean;
  /** Explicit notice when requested facts are absent from user-confirmed evidence. */
  ungroundedNotice?: string;
  rationale: string;
  latencyMs: number;
  backend: string;
  usage?: ProviderUsageRecord;
  /** 可选 System 1 本轮观测明细（供共享认知黑板同步记录）。 */
  observation?: S1ObservationSnapshot;
}
