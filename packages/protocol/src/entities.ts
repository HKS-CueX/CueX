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
} from './common';
import type { WithdrawalReason } from './controller';
import type { ScenarioId } from './scenario';

export type SessionStatus = 'initializing' | 'active' | 'paused' | 'ended';

export interface Session {
  sessionId: string;
  scenarioId: ScenarioId;
  status: SessionStatus;
  mode: string;
  viewMode: 'focus' | 'inspector';
  startedAt: number;
  endedAt?: number;
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
  updatedAt: number;
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
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface Evidence {
  id: string;
  text: string;
  source: string;
  timestamp: number;
  confidence: number;
  scope: DataScope;
  privacyLevel: PrivacyLevel;
  userConfirmed: boolean;
  verified: boolean;
  lifecycle: EvidenceLifecycle;
  sourceType?: EvidenceSourceType;
  title?: string;
  tags?: string[];
  locked?: boolean;
  locationRef?: string;
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
  timestamp: number;
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
  timestamp: number;
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
  expiresAt: number;
  contextVersion: number;
  evidenceIds: string[];
  basedOnSegmentId: string;
  status: CandidateStatus;
  withdrawalReason?: WithdrawalReason;
  createdAt?: number;
  kind?: CandidateKind;
  grounded?: boolean;
  missingEvidenceNotice?: string;
  triggerReason?: string;
  targetChapterId?: string;
  targetKeyPointId?: string;
  suppressedReason?: string;
}

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
  shownAt: number;
  withdrawnAt?: number;
  withdrawalReason?: WithdrawalReason;
  dismissedAt?: number;
  userFeedback?: InterventionFeedback;
  feedbackAt?: number;
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
  scenarioId: ScenarioId | 'universal';
  category: MemoryCategory;
  title: string;
  content: string;
  tags?: string[];
  sourceSessionId?: string;
  userConfirmed: boolean;
  privacyLevel: PrivacyLevel;
  scope: DataScope;
  createdAt: string;
  updatedAt: string;
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
  completedAt: number;
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
  generatedAt: string;
  outcome: Outcome;
  interventions: Intervention[];
  observations: Observation[];
  memoryProposals: MemoryProposal[];
  highlights: string[];
  improvementFocuses: string[];
}
