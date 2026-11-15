/**
 * Shared Cognitive State snapshot maintained by the Universal Runtime.
 */

import type { InterventionLevel, TelemetryUsage } from './common';
import type {
  Candidate,
  Intervention,
  Observation,
  SessionStatus,
  TranscriptSegment,
} from './entities';
import type { ScenarioId } from './scenario';

export interface SuppressionEntry {
  key: string;
  reason: 'user_dismissed' | 'cooldown' | 'silent_mode' | 'ceiling_exceeded' | 'topic_resolved';
  untilMs: number;
  createdAtMs: number;
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
  updatedAt: number;
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
  cooldownUntilMs: number;
  lastInterventionAtMs?: number;
  suppressions: SuppressionEntry[];
  /** Scenario-specific runtime state projection when available. */
  scenarioState?: Record<string, unknown>;
  telemetry: TelemetryUsage;
}
