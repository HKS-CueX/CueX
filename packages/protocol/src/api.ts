/**
 * HTTP REST API Contracts shared between server gateway and web client.
 */

import type { AsrCapabilityStatus } from '#src/audio';
import type {
  AccountUsageSummary,
  BillingAuditRecord,
  Entitlement,
  PlanDefinition,
  UsageRecord,
} from '#src/commercial';
import type {
  DataScope,
  LlmReasoningEffort,
  PrivacyLevel,
  System1PromptFormat,
} from '#src/common';
import type { DualSystemCollaborationMetrics } from '#src/dual-system';
import type { MemoryCategory, MemoryItem } from '#src/entities';
import type {
  PresentationContextPack,
  PresentationPackSummary,
  PresentationReflection,
} from '#src/presentation';
import type { ScenarioCapabilityDescriptor, ScenarioId } from '#src/scenario';
import type { UtcIso8601 } from '#src/versions';

/**
 * 脱敏后的模型子系统健康检查与能力归因结构。
 * 严格禁止包含 API Key、Bearer Token 或裸机 Host URL。
 */
export interface LlmSubsystemHealthStatus {
  backend: string;
  mode: 'real' | 'local_fallback';
  healthy: boolean;
  detail?: string;
  provider?: string;
  model?: string;
  degraded?: boolean;
  /** 是否触发了本地规则/备用降级路径。 */
  fallbackActive?: boolean;
  /** 触发降级或退避的脱敏原因说明。 */
  fallbackReason?: string;
  /** System 1 专属：提示词格式（如 'jev-v1'）与温度校准状态。 */
  promptFormat?: System1PromptFormat;
  calibrated?: boolean;
  /** System 2 专属：推理强度（如 'medium'）与下游编译/复盘模型归因。 */
  reasoningEffort?: LlmReasoningEffort;
  compilerModel?: string;
  reflectionModel?: string;
  lastHealthCheckAt?: UtcIso8601;
}

export interface HealthStatusResponse {
  ok: boolean;
  service: string;
  version: string;
  apiVersion: string;
  wsProtocolVersion: string;
  timestamp: UtcIso8601;
  asr: AsrCapabilityStatus;
  system1: LlmSubsystemHealthStatus;
  system2: LlmSubsystemHealthStatus;
  /** 可选：Compiler 与 Reflection 模型归因细分状态。 */
  compiler?: LlmSubsystemHealthStatus;
  reflection?: LlmSubsystemHealthStatus;
  /** 可选：最近一次活跃会话的双系统协同指标摘要。 */
  dualSystemMetrics?: DualSystemCollaborationMetrics;
}

export interface ScenariosListResponse {
  scenarios: ScenarioCapabilityDescriptor[];
}

export interface PresentationPackListResponse {
  packs: PresentationPackSummary[];
}

export interface PresentationPackDetailResponse {
  pack: PresentationContextPack;
}

export interface MemoryListResponse {
  items: MemoryItem[];
}

export interface MemoryCreateInput {
  scenarioId: ScenarioId | 'universal';
  category: MemoryCategory;
  title: string;
  content: string;
  tags?: string[];
  sourceSessionId?: string;
  userConfirmed: boolean;
  privacyLevel: PrivacyLevel;
  scope: DataScope;
}

export interface MemoryPatchInput {
  title?: string;
  content?: string;
  category?: MemoryCategory;
  tags?: string[];
  privacyLevel?: PrivacyLevel;
  scope?: DataScope;
  userConfirmed?: boolean;
}

export interface SessionReflectionResponse {
  reflection: PresentationReflection;
}

export interface PlansListResponse {
  plans: PlanDefinition[];
}

export interface EntitlementsResponse {
  entitlements: Entitlement[];
  usageSummary: AccountUsageSummary;
}

export interface UsageLedgerListResponse {
  records: UsageRecord[];
  summary: AccountUsageSummary;
}

export interface BillingAuditListResponse {
  records: BillingAuditRecord[];
}
