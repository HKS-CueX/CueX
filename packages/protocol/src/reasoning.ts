/**
 * Model-Agnostic Decision (System 1) and Slow Reasoning (System 2) Contracts.
 */

import type { InterventionLevel, TelemetryUsageSource } from '#src/common';
import type { Candidate, Evidence, Intervention, TranscriptSegment } from '#src/entities';
import type { ScenarioId } from '#src/scenario';
import type { UtcIso8601 } from '#src/versions';

export interface ProviderUsageRecord {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  modelCalls: number;
  retries?: number;
  usageSource: TelemetryUsageSource;
  degraded?: boolean;
  costFen?: number;
  provider?: string;
  model?: string;
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
}

export interface SlowReasoningCandidateResult {
  requestId: string;
  sessionId: string;
  contextVersion: number;
  timestamp: UtcIso8601;
  status: 'synthesized' | 'insufficient_evidence' | 'no_action_needed' | 'aborted' | 'error';
  candidate?: Candidate;
  evidenceIds: string[];
  /** True only when every claim in the candidate is grounded in verified Evidence items. */
  grounded: boolean;
  /** Explicit notice when requested facts are absent from user-confirmed evidence. */
  ungroundedNotice?: string;
  rationale: string;
  latencyMs: number;
  backend: string;
  usage?: ProviderUsageRecord;
}
