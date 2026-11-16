/**
 * Shared Cognitive State snapshot maintained by the Universal Runtime.
 */

import type { InterventionLevel, TelemetryUsage } from '#src/common';
import type {
  DualSystemCollaborationMetrics,
  S1ObservationSnapshot,
  System2Guidance,
} from '#src/dual-system';
import type {
  Candidate,
  Intervention,
  Observation,
  SessionStatus,
  TranscriptSegment,
} from '#src/entities';
import type { ScenarioId } from '#src/scenario';
import type { UtcIso8601 } from '#src/versions';

export interface SuppressionEntry {
  key: string;
  reason: 'user_dismissed' | 'cooldown' | 'silent_mode' | 'ceiling_exceeded' | 'topic_resolved';
  until: UtcIso8601;
  createdAt: UtcIso8601;
}

export type AttentionSignal =
  | 'fluent'
  | 'hesitating'
  | 'drifting'
  | 'omission_risk'
  | 'answering_question'
  | 'recovering';

export interface SharedCognitiveState {
  sessionId: string;
  scenarioId: ScenarioId;
  /** Monotonically incremented whenever active chapter, task constraints, or confirmed context changes. */
  contextVersion: number;
  updatedAt: UtcIso8601;
  sessionStatus: SessionStatus;
  silentMode: boolean;
  maxInterventionLevel: InterventionLevel;
  activeGoal: string;
  activeChapterId?: string;
  activeChapterTitle?: string;
  constraints: string[];
  attentionSignal: AttentionSignal;
  openGapLabels: string[];
  activeIntervention: Intervention | null;
  activeCandidate: Candidate | null;
  queuedCandidates: Candidate[];
  recentObservations: Observation[];
  recentSegments: TranscriptSegment[];
  cooldownUntil?: UtcIso8601;
  lastInterventionAt?: UtcIso8601;
  suppressions: SuppressionEntry[];
  /** Scenario-specific runtime state projection when available. */
  scenarioState?: Record<string, unknown>;
  /** 共享黑板当前生效的 System 2 异步指导指令（无或已过期时为 null）。 */
  system2Guidance?: System2Guidance | null;
  /** 最近一次 System 1 实时评估观测快照。 */
  latestS1Observation?: S1ObservationSnapshot | null;
  /** 双系统异步协同实时指标。 */
  dualSystemMetrics?: DualSystemCollaborationMetrics;
  telemetry: TelemetryUsage;
}

/** SharedCognitiveState 兼容别名。 */
export type CognitiveSnapshot = SharedCognitiveState;
