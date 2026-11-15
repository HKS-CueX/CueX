/**
 * Shared domain-agnostic primitives for CueX Universal Cognitive Runtime.
 */

export type InterventionLevel = 'L0' | 'L1' | 'L2' | 'L3';

export const INTERVENTION_LEVEL_RANK: Record<InterventionLevel, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

export const DEFAULT_UTILITY_LAMBDA = 2;

export type DataScope = 'global' | 'scenario' | 'session' | 'document';

export type PrivacyLevel = 'ephemeral' | 'session' | 'local_private' | 'shared';

export type EvidenceLifecycle = 'draft' | 'active' | 'superseded' | 'archived' | 'revoked';

export type EvidenceSourceType =
  | 'user_document'
  | 'user_input'
  | 'user_confirmed_memory'
  | 'compiler_extracted'
  | 'live_transcript'
  | 'system_rule';

export type TelemetryMeasurementSource = 'provider_reported' | 'local_rule_zero' | 'estimated';

export interface ModelCallBreakdown {
  tier: 'asr' | 'system1' | 'system2' | 'compiler' | 'reflection' | 'retrieval';
  provider: string;
  model?: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  latencyMsTotal: number;
  latencyMsAvg: number;
  measurementSource: TelemetryMeasurementSource;
}

export interface TelemetryEstimationMetadata {
  /** True only when exact provider usage headers were unavailable and an explicit estimation method was used. */
  isEstimated: boolean;
  source: TelemetryMeasurementSource;
  /** True when local deterministic rules/heuristics ran with 0 LLM tokens. */
  usingLocalFallback: boolean;
  notes?: string;
  estimatedCostCny?: number;
}

/**
 * Honest runtime token, cache, latency, and call accounting.
 * Local deterministic rule evaluations record 0 tokens and set `usingLocalFallback: true`.
 */
export interface TelemetryUsage {
  sessionId: string;
  updatedAt: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  modelCalls: number;
  localRuleEvaluations: number;
  latencyMs: number;
  lastSystem1LatencyMs?: number;
  lastSystem2LatencyMs?: number;
  estimation: TelemetryEstimationMetadata;
  byTier?: Partial<Record<ModelCallBreakdown['tier'], ModelCallBreakdown>>;
}
