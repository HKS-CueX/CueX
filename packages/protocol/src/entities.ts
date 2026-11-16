/**
 * Universal Entities for CueX Cognitive Runtime.
 * Strictly domain-agnostic; scenario adapters bind domain semantics via ContextPack & policies.
 */

import type {
  DataScope,
  EvidenceLifecycle,
  EvidenceSourceType,
  InterventionLevel,
  PrivacyLevel,
  TelemetryUsage,
} from '#src/common';
import type { WithdrawalReason } from '#src/controller';
import type { ScenarioId } from '#src/scenario';
import type { UtcIso8601 } from '#src/versions';

export type SessionStatus = 'initializing' | 'active' | 'paused' | 'ended';

export interface Session {
  sessionId: string;
  tenantId?: string;
  userId?: string;
  scenarioId: ScenarioId;
  status: SessionStatus;
  mode: string;
  viewMode: 'focus' | 'inspector';
  startedAt: UtcIso8601;
  endedAt?: UtcIso8601;
  contextPackId?: string;
  silentMode: boolean;
  maxInterventionLevel: InterventionLevel;
  privacyNoticeAccepted: boolean;
  metadata?: Record<string, unknown>;
}

export interface TaskContext {
  taskId: string;
  sessionId: string;
  scenarioId: ScenarioId;
  goal: string;
  audience?: string;
  activeChapterId?: string;
  activeChapterTitle?: string;
  targetDurationSec?: number;
  elapsedSec?: number;
  constraints: string[];
  forbiddenClaims?: string[];
  contextVersion: number;
  updatedAt: UtcIso8601;
}

export interface ContextPackChapter {
  id: string;
  title: string;
  order: number;
  targetDurationSec?: number;
  keyPoints: Array<{
    id: string;
    label: string;
    required?: boolean;
  }>;
}

export interface ContextPack {
  packId: string;
  schemaVersion: number;
  tenantId?: string;
  userId?: string;
  scenarioId: ScenarioId;
  title: string;
  description?: string;
  goal: string;
  audience?: string;
  targetDurationSec?: number;
  constraints: string[];
  forbiddenClaims: string[];
  chapters: ContextPackChapter[];
  evidence: Evidence[];
  createdAt: UtcIso8601;
  updatedAt: UtcIso8601;
  metadata?: Record<string, unknown>;
}

export interface Evidence {
  id: string;
  schemaVersion: number;
  text: string;
  source: string;
  sourceType?: EvidenceSourceType;
  sourceDocumentId?: string;
  locationRef?: string;
  contentHash?: string;
  title?: string;
  tags?: string[];
  timestamp: UtcIso8601;
  createdAt: UtcIso8601;
  updatedAt: UtcIso8601;
  confidence: number;
  scope: DataScope;
  privacyLevel: PrivacyLevel;
  userConfirmed: boolean;
  verified: boolean;
  locked: boolean;
  lifecycle: EvidenceLifecycle;
}

export type CognitiveEventType =
  | 'session.lifecycle'
  | 'speech.partial'
  | 'speech.final'
  | 'silence.tick'
  | 'topic.shift'
  | 'chapter.change'
  | 'question.detected'
  | 'omission.detected'
  | 'drift.detected'
  | 'recovery.detected'
  | 'user.manual_help'
  | 'user.dismiss_hint'
  | 'user.feedback'
  | 'user.mode_change'
  | 'candidate.prepared'
  | 'intervention.shown'
  | 'intervention.withdrawn'
  | 'context.updated';

export interface CognitiveEvent<TPayload = Record<string, unknown>> {
  event_id: string;
  session_id: string;
  event_type: CognitiveEventType;
  timestamp: UtcIso8601;
  source: string;
  payload: TPayload;
  confidence: number;
  context_version: number;
}

export type ObservationKind =
  | 'silence'
  | 'pace_overtime'
  | 'pace_fast'
  | 'topic_drift'
  | 'key_point_omission'
  | 'audience_question'
  | 'hesitation'
  | 'recovery'
  | 'manual_trigger'
  | 'chapter_transition';

export interface Observation {
  observationId: string;
  sessionId: string;
  kind: ObservationKind;
  summary: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  timestamp: UtcIso8601;
  contextVersion: number;
  relatedSegmentId?: string;
  relatedChapterId?: string;
  signals?: Record<string, number | string | boolean>;
}

export type TranscriptSpeaker = 'presenter' | 'audience' | 'interlocutor' | 'unknown';

export type TranscriptSource =
  | 'local_sherpa'
  | 'remote_sherpa'
  | 'browser_webspeech'
  | 'text_simulation'
  | 'external_asr'
  | 'system';

export interface TranscriptSegment {
  segmentId: string;
  sessionId: string;
  speaker: TranscriptSpeaker;
  text: string;
  delta: string;
  isFinal: boolean;
  confidence: number;
  startMs: number;
  endMs: number;
  occurredAt?: UtcIso8601;
  source?: TranscriptSource;
  chapterId?: string;
}

export type CandidateStatus =
  | 'pending'
  | 'active'
  | 'suppressed'
  | 'expired'
  | 'withdrawn'
  | 'dismissed';

export type CandidateKind =
  | 'pace_nudge'
  | 'omission_cue'
  | 'drift_recovery'
  | 'qa_grounding'
  | 'manual_scaffold'
  | 'missing_evidence_notice';

export interface Candidate {
  candidateId: string;
  sessionId: string;
  level: InterventionLevel;
  title: string;
  cueText: string;
  bullets?: string[];
  priority: number;
  ttlMs: number;
  expiresAt: UtcIso8601;
  createdAt?: UtcIso8601;
  contextVersion: number;
  evidenceIds: string[];
  basedOnSegmentId: string;
  status: CandidateStatus;
  withdrawalReason?: WithdrawalReason;
  kind?: CandidateKind;
  grounded?: boolean;
  missingEvidenceNotice?: string;
  triggerReason?: string;
  targetChapterId?: string;
  targetKeyPointId?: string;
  suppressedReason?: string;
}

/** Candidate 兼容别名，方便跨模块及文档对齐使用。 */
export type CueCandidate = Candidate;

export type InterventionFeedback = 'helpful' | 'distracting';

export interface Intervention {
  interventionId: string;
  sessionId: string;
  candidateId: string;
  level: InterventionLevel;
  title: string;
  cueText: string;
  bullets?: string[];
  evidenceIds: string[];
  grounded: boolean;
  missingEvidenceNotice?: string;
  basedOnSegmentId?: string;
  contextVersion: number;
  shownAt: UtcIso8601;
  withdrawnAt?: UtcIso8601;
  withdrawalReason?: WithdrawalReason;
  dismissedAt?: UtcIso8601;
  userFeedback?: InterventionFeedback;
  feedbackAt?: UtcIso8601;
  chapterId?: string;
}

export type MemoryCategory =
  | 'preference'
  | 'terminology'
  | 'fact'
  | 'pacing_habit'
  | 'qa_pattern'
  | 'style';

export interface MemoryItem {
  memoryId: string;
  schemaVersion: number;
  tenantId?: string;
  userId?: string;
  scenarioId: ScenarioId | 'universal';
  category: MemoryCategory;
  title: string;
  content: string;
  tags?: string[];
  sourceSessionId?: string;
  userConfirmed: boolean;
  privacyLevel: PrivacyLevel;
  scope: DataScope;
  createdAt: UtcIso8601;
  updatedAt: UtcIso8601;
}

export interface MemoryProposal {
  proposalId: string;
  scenarioId: ScenarioId | 'universal';
  category: MemoryCategory;
  title: string;
  content: string;
  rationale: string;
  scope: DataScope;
  privacyLevel: PrivacyLevel;
  sourceSessionId: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface Outcome {
  outcomeId: string;
  sessionId: string;
  scenarioId: ScenarioId;
  completedAt: UtcIso8601;
  durationMs: number;
  utilityScore: number;
  helpfulCount: number;
  interruptionCount: number;
  lambda: number;
  coverageRatio: number;
  summary: string;
  telemetry: TelemetryUsage;
}

export interface Reflection {
  reflectionId: string;
  sessionId: string;
  scenarioId: ScenarioId;
  generatedAt: UtcIso8601;
  outcome: Outcome;
  interventions: Intervention[];
  observations: Observation[];
  memoryProposals: MemoryProposal[];
  highlights: string[];
  improvementFocuses: string[];
}
