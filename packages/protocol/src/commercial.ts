/**
 * Auth, Commercial Plan, Entitlement, UsageLedger, Payment Sandbox, and Data Sovereignty Contracts.
 */

import type { MemoryItem } from '#src/entities';
import type { PresentationContextPack, PresentationReflection } from '#src/presentation';
import type { MoneyAmount, UtcIso8601 } from '#src/versions';

export const PLAN_IDS = ['free', 'event', 'pro', 'team'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanStatus = 'active' | 'planned';

export type PaymentChannel = 'sandbox' | 'wechat_pay' | 'alipay';

export interface UserAccount {
  userId: string;
  tenantId: string;
  email?: string;
  displayName: string;
  role: 'owner' | 'member' | 'admin';
  authMode: 'session_token' | 'local_dev' | 'api_key';
  createdAt: UtcIso8601;
  updatedAt: UtcIso8601;
}

export interface AuthSessionCreateInput {
  displayName?: string;
  email?: string;
  tenantId?: string;
  inviteCode?: string;
}

export interface PlanQuotaConfig {
  monthlySessionsLimit: number | null;
  liveMinutesLimit: number | null;
  maxFactsPerPack: number | null;
  maxUploadBytes: number;
  reflectionEnabled: boolean;
  singlePointRehearsalEnabled: boolean;
  persistentMemoryEnabled: boolean;
  cloudAsrMinutesIncluded: number;
}

export interface PlanDefinition {
  planId: PlanId;
  name: string;
  displayName: string;
  status: PlanStatus;
  billingCycle: 'none' | 'one_time_14d' | 'monthly' | 'annual';
  price: MoneyAmount;
  annualPrice?: MoneyAmount;
  quotas: PlanQuotaConfig;
  features: string[];
  limitations: string[];
  /** Explicit commercial tag separating unvalidated pricing hypotheses from live billing. */
  isCommercialHypothesis: boolean;
}

export interface Entitlement {
  entitlementId: string;
  userId: string;
  tenantId: string;
  planId: PlanId;
  status: 'active' | 'exhausted' | 'expired' | 'revoked';
  grantedAt: UtcIso8601;
  expiresAt?: UtcIso8601;
  remainingSessions: number | null;
  remainingLiveMinutes: number | null;
  source: 'default_free' | 'sandbox_checkout' | 'manual_grant' | 'webhook';
}

export type UsageType =
  | 'session_started'
  | 'live_audio_ms'
  | 'document_extract'
  | 'context_compile'
  | 'system1_eval'
  | 'system2_synthesis'
  | 'reflection_generated'
  | 'memory_write';

export type UsageUnit = 'count' | 'ms' | 'tokens' | 'bytes';

export interface UsageRecord {
  id: string;
  userId: string;
  tenantId?: string;
  sessionId?: string;
  entitlementId?: string;
  usageType: UsageType;
  quantity: number;
  unit: UsageUnit;
  occurredAt: UtcIso8601;
  idempotencyKey: string;
  source: string;
  /** Integer minor units in CNY Fen when billable/costed; 0 for local rule evaluations. */
  costFen?: number;
  metadata?: Record<string, unknown>;
}

export interface AccountUsageSummary {
  userId: string;
  tenantId: string;
  periodStart: UtcIso8601;
  periodEnd: UtcIso8601;
  activePlanId: PlanId;
  sessionsUsed: number;
  sessionsLimit: number | null;
  liveMinutesUsed: number;
  liveMinutesLimit: number | null;
  totalTokensUsed: number;
  totalCostFen: number;
  totalCost: MoneyAmount;
  updatedAt: UtcIso8601;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  token?: string;
  user: UserAccount;
  sessionTokenExpiresAt?: UtcIso8601;
  entitlements: Entitlement[];
  usageSummary: AccountUsageSummary;
}

export interface BillingAuditRecord {
  auditId: string;
  userId: string;
  tenantId: string;
  eventType:
    | 'checkout_preview'
    | 'entitlement_granted'
    | 'entitlement_revoked'
    | 'webhook_received'
    | 'refund_recorded'
    | 'account_wiped';
  planId?: PlanId;
  amount?: MoneyAmount;
  provider: PaymentChannel | 'manual';
  externalTransactionId?: string;
  occurredAt: UtcIso8601;
  retentionNote: string;
}

export interface PaymentCheckoutPreviewRequest {
  planId: PlanId;
  billingCycle: 'one_time_14d' | 'monthly' | 'annual';
  paymentChannel: PaymentChannel;
  couponCode?: string;
}

export interface PaymentCheckoutPreviewResult {
  previewId: string;
  planId: PlanId;
  planStatus: PlanStatus;
  billingCycle: 'one_time_14d' | 'monthly' | 'annual';
  paymentChannel: PaymentChannel;
  mode: 'sandbox_only' | 'not_configured';
  subtotal: MoneyAmount;
  discount: MoneyAmount;
  total: MoneyAmount;
  liveCheckoutAvailable: boolean;
  notice: string;
  createdAt: UtcIso8601;
}

export interface PaymentWebhookEvent {
  eventId: string;
  provider: PaymentChannel;
  eventType: 'payment.succeeded' | 'payment.refunded' | 'subscription.cancelled';
  userId: string;
  tenantId?: string;
  planId: PlanId;
  amount: MoneyAmount;
  idempotencyKey: string;
  occurredAt: UtcIso8601;
  signature?: string;
  rawPayload?: Record<string, unknown>;
}

export interface UserDataExportBundle {
  exportId: string;
  exportedAt: UtcIso8601;
  schemaVersion: number;
  user: UserAccount;
  entitlements: Entitlement[];
  usageSummary: AccountUsageSummary;
  usageRecords: UsageRecord[];
  billingAuditRecords: BillingAuditRecord[];
  packs: PresentationContextPack[];
  memories: MemoryItem[];
  reflections: PresentationReflection[];
}

export interface DeletedDataScopeEntry {
  scope:
    | 'sessions'
    | 'packs'
    | 'memories'
    | 'reflections'
    | 'telemetry'
    | 'usage_records'
    | 'auth_tokens';
  deletedCount: number;
}

export interface PreservedBillingAuditEntry {
  category: 'billing_audit_logs' | 'anonymized_compliance_receipt';
  count: number;
  reason: string;
  retentionPolicy: string;
}

export interface DataDeletionReceipt {
  receiptId: string;
  userId: string;
  tenantId: string;
  requestedAt: UtcIso8601;
  completedAt: UtcIso8601;
  deletedScopes: DeletedDataScopeEntry[];
  preservedRecords: PreservedBillingAuditEntry[];
  thirdPartyCaveats: string[];
}
