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
import type { DataScope, PrivacyLevel } from '#src/common';
import type { MemoryCategory, MemoryItem } from '#src/entities';
import type {
  PresentationContextPack,
  PresentationPackSummary,
  PresentationReflection,
} from '#src/presentation';
import type { ScenarioCapabilityDescriptor, ScenarioId } from '#src/scenario';
import type { UtcIso8601 } from '#src/versions';

export interface HealthStatusResponse {
  ok: boolean;
  service: string;
  version: string;
  apiVersion: string;
  wsProtocolVersion: string;
  timestamp: UtcIso8601;
  asr: AsrCapabilityStatus;
  system1: {
    backend: string;
    mode: 'real' | 'local_fallback';
    healthy: boolean;
    detail?: string;
  };
  system2: {
    backend: string;
    mode: 'real' | 'local_fallback';
    healthy: boolean;
    detail?: string;
  };
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
