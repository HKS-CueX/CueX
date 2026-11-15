/**
 * Controller Protocol contracts.
 * Enforces minimum necessary intervention, TTL, contextVersion gating, grounding verification, and automatic withdrawal.
 */

import type { InterventionLevel } from './common';
import type { Intervention } from './entities';

export type WithdrawalReason =
  | 'user_recovered'
  | 'topic_changed'
  | 'chapter_changed'
  | 'context_invalidated'
  | 'candidate_expired'
  | 'user_dismissed'
  | 'superseded';

export type ControllerAction =
  | 'stay_silent'
  | 'show_l1_edge'
  | 'show_l2_keyword'
  | 'show_l3_scaffold'
  | 'withdraw';

export type ControllerSuppressReason =
  | 'silent_mode'
  | 'session_paused'
  | 'ceiling_exceeded'
  | 'cooldown_active'
  | 'user_dismissed_suppression'
  | 'candidate_expired'
  | 'stale_context_version'
  | 'ungrounded_evidence'
  | 'no_semantic_need'
  | 'pause_only_without_gap'
  | 'user_already_recovering'
  | 'lower_priority';

export interface ControllerInspectionTrace {
  evaluatedAt: number;
  contextVersion: number;
  candidateId?: string;
  candidateContextVersion?: number;
  ttlRemainingMs?: number;
  groundedChecked: boolean;
  evidenceCount: number;
  cooldownRemainingMs: number;
  ceilingLevel: InterventionLevel;
  silentMode: boolean;
  paused: boolean;
  signalsEvaluated: {
    silenceMs: number;
    semanticGap: boolean;
    drift: boolean;
    openQuestion: boolean;
    manualHelp: boolean;
    recovery: boolean;
  };
  rulesApplied: string[];
}

export interface ControllerDecision {
  decisionId: string;
  sessionId: string;
  timestamp: number;
  contextVersion: number;
  selectedAction: ControllerAction;
  level: InterventionLevel;
  candidateId?: string;
  interventionId?: string;
  intervention?: Intervention;
  withdrawalReason?: WithdrawalReason;
  suppressReason?: ControllerSuppressReason | string;
  reason: string;
  trace: ControllerInspectionTrace;
}
