/**
 * 双向异步双系统协同（System 1 / System 2）与共享认知黑板核心契约。
 * 注意：仅定义与具体垂直场景解耦的通用实时协同协议。
 */

import type { InterventionLevel, LlmReasoningEffort, System1PromptFormat } from '#src/common';
import type { CognitiveAttentionState, InterventionNeed, SlowReasoningTriggerKind } from '#src/reasoning';
import type { UtcIso8601 } from '#src/versions';

/** System 2 下发给 System 1 与控制器的推荐提示偏向枚举。 */
export const SYSTEM2_GUIDANCE_BIASES = [
  'stay_silent',
  'prefer_l1',
  'prefer_l2',
  'prefer_l3',
  'qa_grounding',
  'recovery_hold',
] as const;

export type System2GuidanceBias = (typeof SYSTEM2_GUIDANCE_BIASES)[number];

/** System 1 JEV-Like 决策头的槽位任务类型。 */
export const S1_DECISION_KINDS = ['noul', 'choice', 'score', 'unknown'] as const;

export type S1DecisionKind = (typeof S1_DECISION_KINDS)[number];

/** System 1 实际执行的推理提供方分类。 */
export const S1_PROVIDER_KINDS = ['colab_jev', 'local_jev', 'local_rule_zero'] as const;

export type S1ProviderKind = (typeof S1_PROVIDER_KINDS)[number];

/**
 * System 2 异步深度规划写回共享认知黑板的指导指令（System2Guidance）。
 * 携带单调递增修订号、轮次时效窗口、证据锚点与推理强度元数据。
 */
export interface System2Guidance {
  guidanceId: string;
  sessionId: string;
  /** 严格单调递增修订号，用于去重与防止过期指导覆盖新认知状态。 */
  revision: number;
  contextVersion: number;
  /** 触发本次异步规划时依据的 System 1 轮次序号。 */
  basedOnTurnSeq: number;
  /** 超过该轮次序号后，System 1 应视为指导可能失效并重新评估。 */
  staleAfterTurnSeq?: number;
  issuedAtMs: number;
  expiresAtMs: number;
  issuedAt?: UtcIso8601;
  expiresAt?: UtcIso8601;
  targetChapterId?: string;
  targetChapterTitle?: string;
  /** 给 System 1 与干预控制器的简明语义聚焦指令。 */
  focusDirective: string;
  /** 策略微调提示，例如“先回应关键提问再引导回到主线章回”。 */
  strategyHints: string[];
  recommendedBias?: System2GuidanceBias;
  preferredLevel?: InterventionLevel;
  /** 所依据的已验证证据 ID 集合，禁止编造无证据事实。 */
  evidenceAnchors: string[];
  grounded: boolean;
  reasoningEffort?: LlmReasoningEffort;
  triggerKind?: SlowReasoningTriggerKind | 'background_alignment' | 'periodic_review';
  provider?: string;
  model?: string;
  correlationId?: string;
}

/**
 * System 1（如 Colab JEV-27B / 9B）单轮实时观测快照，供黑板、健康诊断与评估追踪。
 */
export interface S1ObservationSnapshot {
  turnSeq: number;
  observedAtMs: number;
  observedAt?: UtcIso8601;
  decisionType: S1DecisionKind;
  /** 命中 24-slot 决策头的槽位索引（降级规则引擎无槽位时可记录为 -1）。 */
  selectedSlot: number;
  label: string;
  /** 温度校准后的主槽位置信度（[0, 1]）。 */
  calibratedConfidence: number;
  /** 校准后最高概率与次高概率之差（Top1 - Top2 margin）。 */
  margin: number;
  /** 校准后概率分布香农熵（>= 0）。 */
  entropy: number;
  escalationReason?: string;
  escalatedToS2: boolean;
  latencyMs: number;
  degraded: boolean;
  providerKind: S1ProviderKind;
  model?: string;
  promptFormat?: System1PromptFormat;
  calibrated?: boolean;
  /** 本轮评估实际读取并应用的 System2Guidance 修订号。 */
  guidanceAppliedRevision?: number;
  cognitiveState?: CognitiveAttentionState;
  interventionNeed?: InterventionNeed;
}

/**
 * 双向异步双系统协同统计指标。
 */
export interface DualSystemCollaborationMetrics {
  s1Evaluations: number;
  s1Escalations: number;
  s2AsyncDispatches: number;
  s2Completed: number;
  /** 因对话推进、章回切换或上下文版本变化而被丢弃的过期 System 2 任务数。 */
  s2CancelledAsStale: number;
  /** 连续高频触发被单飞/合并去重的 System 2 调度次数。 */
  s2Coalesced: number;
  guidanceRevisionsIssued: number;
  guidanceAppliedCount: number;
  guidanceExpiredOrOverridden: number;
  s1LastLatencyMs?: number;
  s1P50LatencyMs?: number;
  s1P95LatencyMs?: number;
  s2LastLatencyMs?: number;
  s2P50LatencyMs?: number;
  s2P95LatencyMs?: number;
  updatedAt?: UtcIso8601;
}
