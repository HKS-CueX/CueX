/**
 * Shared domain-agnostic primitives for CueX Universal Cognitive Runtime.
 */

import type { DualSystemCollaborationMetrics } from '#src/dual-system';
import type { MoneyAmount, UtcIso8601 } from '#src/versions';

/** 支持的 LLM 推理强度等级（用于 CPA / System 2 归因与指导元数据）。 */
export const LLM_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'] as const;

export type LlmReasoningEffort = (typeof LLM_REASONING_EFFORTS)[number];

/** System 1 提示词与决策头格式枚举。 */
export const SYSTEM1_PROMPT_FORMATS = ['jev-v1', 'jevstyle-v1', 'chat', 'rule_zero'] as const;

export type System1PromptFormat = (typeof SYSTEM1_PROMPT_FORMATS)[number];

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

export type DocumentExtractionStatus = 'parsed' | 'unreadable' | 'rejected';

export const TELEMETRY_USAGE_SOURCES = [
  'provider_reported',
  'provider_unreported',
  'local_rule_zero',
  'estimated',
] as const;

export type TelemetryUsageSource = (typeof TELEMETRY_USAGE_SOURCES)[number];

/** Compatibility alias for TelemetryUsageSource. */
export type TelemetryMeasurementSource = TelemetryUsageSource;

export interface ModelCallBreakdown {
  tier: 'asr' | 'system1' | 'system2' | 'compiler' | 'reflection' | 'retrieval';
  provider: string;
  model?: string;
  calls: number;
  retries: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens?: number;
  latencyMsTotal: number;
  latencyMsAvg: number;
  usageSource: TelemetryUsageSource;
  degraded: boolean;
  costFen: number;
}

export interface TelemetryLatencyStats {
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface TelemetryEstimationMetadata {
  /** True only when exact provider usage headers were unavailable and an explicit estimation method was used. */
  isEstimated: boolean;
  source: TelemetryUsageSource;
  /** True when local deterministic rules/heuristics ran with 0 LLM tokens. */
  usingLocalFallback: boolean;
  notes?: string;
}

/**
 * Honest runtime token, cache, latency, retry, ASR, and cost attribution accounting.
 * Local deterministic rule evaluations record 0 tokens, `usageSource: 'local_rule_zero'`, and `costFen: 0`.
 */
export interface TelemetryUsage {
  sessionId: string;
  updatedAt: UtcIso8601;
  usageSource: TelemetryUsageSource;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
  modelCalls: number;
  retries: number;
  localRuleEvaluations: number;
  latencyMs: number;
  latencyStats: TelemetryLatencyStats;
  lastSystem1LatencyMs?: number;
  lastSystem2LatencyMs?: number;
  degraded: boolean;
  usingLocalFallback: boolean;
  asrProvider: string;
  asrDurationMs: number;
  /** Integer minor units in CNY Fen (Number.isSafeInteger). */
  costFen: number;
  cost: MoneyAmount;
  estimation: TelemetryEstimationMetadata;
  byTier?: Partial<Record<ModelCallBreakdown['tier'], ModelCallBreakdown>>;
  /** 可选双系统异步协同统计摘要。 */
  dualSystem?: DualSystemCollaborationMetrics;
}
