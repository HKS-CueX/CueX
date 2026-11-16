import { randomUUID } from 'node:crypto';
import {
  createMoneyAmount,
  nowUtcIso8601,
  type AccountUsageSummary,
  type BillingAuditRecord,
  type DataDeletionReceipt,
  type Entitlement,
  type PaymentCheckoutPreviewRequest,
  type PaymentCheckoutPreviewResult,
  type PaymentWebhookEvent,
  type PlanId,
  type TelemetryUsage,
  type UsageRecord,
  type UsageType,
  type UsageUnit,
  type UserAccount,
  type UserDataExportBundle,
} from '@cuex/protocol';
import { HttpServiceError } from '../security';
import type { StorageRepository } from '../storage';
import type { PaymentProviderAdapter } from './PaymentProviderAdapter';
import { getPlanById, listPlans } from './PlanCatalog';

export function currentBillingWindowUtc(now = new Date()): {
  periodStart: string;
  periodEnd: string;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}

function planPriority(planId: PlanId): number {
  switch (planId) {
    case 'team':
      return 4;
    case 'pro':
      return 3;
    case 'event':
      return 2;
    case 'free':
    default:
      return 1;
  }
}

/**
 * Commercial Entitlements, UsageLedger, Quota Gate, Checkout Sandbox, and GDPR/PIPL Data Sovereignty service.
 */
export class CommercialService {
  constructor(
    private readonly repo: StorageRepository,
    private readonly payment: PaymentProviderAdapter,
  ) {}

  listPlans() {
    return listPlans();
  }

  ensureActiveEntitlement(user: UserAccount): Entitlement {
    const nowIso = nowUtcIso8601();
    const { periodStart } = currentBillingWindowUtc();
    const existing = this.repo.listEntitlements(user.userId);
    const active = existing
      .filter((e) => e.status === 'active' && (!e.expiresAt || e.expiresAt > nowIso))
      .sort((a, b) => planPriority(b.planId) - planPriority(a.planId));

    if (active.length > 0) {
      return active[0];
    }

    // Preserve exhausted quota within the same billing period instead of resetting free sessions.
    const exhaustedCurrent = existing
      .filter(
        (e) =>
          e.status === 'exhausted' &&
          (!e.expiresAt || e.expiresAt > nowIso) &&
          (e.planId !== 'free' || e.grantedAt >= periodStart),
      )
      .sort((a, b) => planPriority(b.planId) - planPriority(a.planId));
    if (exhaustedCurrent.length > 0) {
      return exhaustedCurrent[0];
    }

    const freePlan = getPlanById('free')!;
    const created: Entitlement = {
      entitlementId: `ent_${user.userId}_free_${periodStart.slice(0, 7)}`,
      userId: user.userId,
      tenantId: user.tenantId,
      planId: 'free',
      status: 'active',
      grantedAt: nowIso,
      remainingSessions: freePlan.quotas.monthlySessionsLimit,
      remainingLiveMinutes: freePlan.quotas.liveMinutesLimit,
      source: 'default_free',
    };
    return this.repo.upsertEntitlement(created);
  }

  getEntitlementsAndSummary(user: UserAccount): {
    entitlements: Entitlement[];
    usageSummary: AccountUsageSummary;
  } {
    const primary = this.ensureActiveEntitlement(user);
    const entitlements = this.repo.listEntitlements(user.userId);
    const plan = getPlanById(primary.planId) ?? getPlanById('free')!;
    const { periodStart, periodEnd } = currentBillingWindowUtc();
    const usageSummary = this.repo.computeUsageSummary({
      userId: user.userId,
      tenantId: user.tenantId,
      periodStart,
      periodEnd,
      activePlanId: primary.planId,
      sessionsLimit: plan.quotas.monthlySessionsLimit,
      liveMinutesLimit: plan.quotas.liveMinutesLimit,
      nowIso: nowUtcIso8601(),
    });
    return { entitlements, usageSummary };
  }

  getUsageRecordsAndSummary(user: UserAccount): {
    records: UsageRecord[];
    summary: AccountUsageSummary;
    entitlements: Entitlement[];
  } {
    const { entitlements, usageSummary } = this.getEntitlementsAndSummary(user);
    const { periodStart } = currentBillingWindowUtc();
    const records = this.repo.listUsageRecords(user.userId, periodStart);
    return { records, summary: usageSummary, entitlements };
  }

  reserveSessionStart(params: {
    user: UserAccount;
    sessionId: string;
    idempotencyKey?: string;
  }): { entitlement: Entitlement; usageRecord: UsageRecord; deduplicated: boolean } {
    const { user, sessionId } = params;
    this.ensureActiveEntitlement(user);
    const freeDefault = getPlanById('free')?.quotas.monthlySessionsLimit ?? 2;
    const { periodStart } = currentBillingWindowUtc();
    const res = this.repo.reserveSessionQuotaAtomically({
      userId: user.userId,
      tenantId: user.tenantId,
      sessionId,
      idempotencyKey: params.idempotencyKey ?? `sess_start:${user.userId}:${sessionId}`,
      periodStart,
      occurredAt: nowUtcIso8601(),
      defaultMonthlyLimit: freeDefault,
    });

    if (!res.ok) {
      throw new HttpServiceError('QUOTA_EXCEEDED', res.reason, { httpStatus: 402 });
    }
    return {
      entitlement: res.entitlement,
      usageRecord: res.usageRecord,
      deduplicated: res.deduplicated,
    };
  }

  recordUsage(params: {
    user: UserAccount;
    sessionId?: string;
    usageType: UsageType;
    quantity: number;
    unit: UsageUnit;
    source: string;
    idempotencyKey: string;
    costFen?: number;
    metadata?: Record<string, unknown>;
    decrementLiveMinutes?: number;
  }): { record: UsageRecord; deduplicated: boolean } {
    const active = this.ensureActiveEntitlement(params.user);
    return this.repo.recordUsageIdempotent(
      {
        id: `use_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        userId: params.user.userId,
        tenantId: params.user.tenantId,
        ...(params.sessionId ? { sessionId: params.sessionId } : {}),
        entitlementId: active.entitlementId,
        usageType: params.usageType,
        quantity: Math.max(0, Math.round(params.quantity)),
        unit: params.unit,
        occurredAt: nowUtcIso8601(),
        idempotencyKey: params.idempotencyKey,
        source: params.source,
        costFen: params.costFen ?? 0,
        ...(params.metadata ? { metadata: params.metadata } : {}),
      },
      {
        entitlementId: active.entitlementId,
        decrementLiveMinutes: params.decrementLiveMinutes,
      },
    );
  }

  recordTelemetryUsage(user: UserAccount, usage: TelemetryUsage): void {
    this.repo.saveTelemetryRecord(usage, user.userId);
  }

  previewCheckout(
    user: UserAccount,
    request: PaymentCheckoutPreviewRequest,
  ): PaymentCheckoutPreviewResult {
    const plan = getPlanById(request.planId);
    if (!plan) {
      throw new HttpServiceError('VALIDATION_ERROR', `Unknown plan "${request.planId}".`);
    }
    const result = this.payment.previewCheckout(plan, request);

    const audit: BillingAuditRecord = {
      auditId: `ba_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      userId: user.userId,
      tenantId: user.tenantId,
      eventType: 'checkout_preview',
      planId: plan.planId,
      amount: result.total,
      provider: request.paymentChannel,
      externalTransactionId: result.previewId,
      occurredAt: result.createdAt,
      retentionNote: 'Retained for commercial reconciliation and preview trace.',
    };
    this.repo.appendBillingAuditIdempotent(audit, `preview:${result.previewId}`);
    return result;
  }

  processWebhook(params: {
    rawBody: Buffer | string;
    signatureHeader?: string;
    providerParam?: string;
    event: PaymentWebhookEvent;
  }): { deduplicated: boolean; entitlement?: Entitlement; audit: BillingAuditRecord } {
    this.payment.verifyWebhookSignature(params.rawBody, params.signatureHeader ?? params.event.signature);

    if (params.providerParam && params.providerParam !== params.event.provider) {
      throw new HttpServiceError(
        'VALIDATION_ERROR',
        `Webhook path provider "${params.providerParam}" mismatches payload provider "${params.event.provider}".`,
      );
    }

    const plan = getPlanById(params.event.planId);
    if (!plan || plan.status === 'planned') {
      throw new HttpServiceError(
        'VALIDATION_ERROR',
        `Webhook references invalid or unlaunchable plan "${params.event.planId}".`,
      );
    }

    const targetUser =
      this.repo.findUserById(params.event.userId) ??
      this.repo.upsertUser({
        userId: params.event.userId,
        tenantId: params.event.tenantId ?? `tenant_${params.event.userId}`,
        displayName: params.event.userId,
        role: 'owner',
        authMode: 'session_token',
        createdAt: params.event.occurredAt,
        updatedAt: params.event.occurredAt,
      });

    return this.repo.withTransaction(() => {
      const auditBase: BillingAuditRecord = {
        auditId: `ba_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        userId: targetUser.userId,
        tenantId: targetUser.tenantId,
        eventType:
          params.event.eventType === 'payment.succeeded'
            ? 'entitlement_granted'
            : params.event.eventType === 'payment.refunded'
              ? 'refund_recorded'
              : 'entitlement_revoked',
        planId: plan.planId,
        amount: createMoneyAmount(params.event.amount.amountFen),
        provider: params.event.provider,
        externalTransactionId: params.event.eventId,
        occurredAt: nowUtcIso8601(),
        retentionNote: 'Billing audit retained for statutory compliance and anti-fraud audit.',
      };

      const auditRes = this.repo.appendBillingAuditIdempotent(auditBase, params.event.idempotencyKey);
      if (auditRes.deduplicated) {
        return {
          deduplicated: true,
          audit: auditRes.record,
        };
      }

      if (params.event.eventType === 'payment.succeeded') {
        const expiresAt =
          plan.billingCycle === 'one_time_14d'
            ? new Date(Date.now() + 14 * 86_400_000).toISOString()
            : plan.billingCycle === 'monthly'
              ? new Date(Date.now() + 30 * 86_400_000).toISOString()
              : plan.billingCycle === 'annual'
                ? new Date(Date.now() + 365 * 86_400_000).toISOString()
                : undefined;

        const granted = this.repo.upsertEntitlement({
          entitlementId: `ent_${targetUser.userId}_${plan.planId}_${params.event.eventId.slice(0, 8)}`,
          userId: targetUser.userId,
          tenantId: targetUser.tenantId,
          planId: plan.planId,
          status: 'active',
          grantedAt: nowUtcIso8601(),
          ...(expiresAt ? { expiresAt } : {}),
          remainingSessions: plan.quotas.monthlySessionsLimit,
          remainingLiveMinutes: plan.quotas.liveMinutesLimit,
          source: 'webhook',
        });
        return {
          deduplicated: false,
          entitlement: granted,
          audit: auditRes.record,
        };
      }

      // Refund or subscription cancellation revokes non-free entitlements cleanly.
      const currentEnts = this.repo.listEntitlements(targetUser.userId);
      let updatedEnt: Entitlement | undefined;
      for (const ent of currentEnts) {
        if (ent.planId === plan.planId && ent.status === 'active') {
          updatedEnt = this.repo.upsertEntitlement({ ...ent, status: 'revoked' });
        }
      }
      return {
        deduplicated: false,
        ...(updatedEnt ? { entitlement: updatedEnt } : {}),
        audit: auditRes.record,
      };
    });
  }

  exportUserData(
    user: UserAccount,
    format: 'json' | 'markdown' = 'json',
  ): { format: 'json'; bundle: UserDataExportBundle } | { format: 'markdown'; markdown: string; bundle: UserDataExportBundle } {
    const { usageSummary } = this.getEntitlementsAndSummary(user);
    const bundle = this.repo.exportUserData(user, usageSummary);
    if (format === 'json') {
      return { format: 'json', bundle };
    }

    const lines: string[] = [
      `# CueX 用户数据导出报告 (${bundle.exportId})`,
      '',
      `- 导出时间: \`${bundle.exportedAt}\``,
      `- 用户 ID: \`${bundle.user.userId}\` | 租户: \`${bundle.user.tenantId}\` | 名称: ${bundle.user.displayName}`,
      `- 当前套餐: \`${bundle.usageSummary.activePlanId}\` | 本周期会话: ${bundle.usageSummary.sessionsUsed}/${bundle.usageSummary.sessionsLimit ?? '无限'} | Tokens: ${bundle.usageSummary.totalTokensUsed} | 成本: ${(bundle.usageSummary.totalCostFen / 100).toFixed(2)} CNY`,
      '',
      `## Context Packs (${bundle.packs.length})`,
      ...bundle.packs.map(
        (p) => `- \`${p.packId}\` ${p.title}（场景=${p.sceneType}, 事实=${p.facts.length}, 锁定=${p.facts.filter((f) => f.locked).length}）`,
      ),
      '',
      `## Opt-in Memories (${bundle.memories.length})`,
      ...bundle.memories.map(
        (m) => `- \`${m.memoryId}\` [${m.category}] ${m.title}: ${m.content} (userConfirmed=${m.userConfirmed})`,
      ),
      '',
      `## Reflections (${bundle.reflections.length})`,
      ...bundle.reflections.map(
        (r) =>
          `- \`${r.sessionId}\` (${r.generatedAt}): V=${r.utility.netUtilityScore}, 覆盖率=${(r.diagnosis.coverageRatio * 100).toFixed(0)}%, Tokens=${r.telemetry.totalTokens}`,
      ),
      '',
      `## Billing Audit Records (${bundle.billingAuditRecords.length})`,
      ...bundle.billingAuditRecords.map(
        (a) => `- \`${a.auditId}\` [${a.eventType}] ${a.occurredAt} (${a.provider}) — ${a.retentionNote}`,
      ),
      '',
    ];

    return {
      format: 'markdown',
      markdown: lines.join('\n'),
      bundle,
    };
  }

  wipeSession(user: UserAccount, sessionId: string): DataDeletionReceipt {
    const existing = this.repo.getSession(sessionId);
    if (existing?.session.userId && existing.session.userId !== user.userId && user.role !== 'admin') {
      throw new HttpServiceError('FORBIDDEN', 'You do not have permission to wipe another user session.');
    }
    const nowIso = nowUtcIso8601();
    return this.repo.wipeSessionData({
      sessionId,
      userId: user.userId,
      tenantId: user.tenantId,
      requestedAt: nowIso,
      completedAt: nowUtcIso8601(),
    });
  }

  wipeAccountData(user: UserAccount): DataDeletionReceipt {
    const nowIso = nowUtcIso8601();
    return this.repo.wipeAccountData({
      userId: user.userId,
      tenantId: user.tenantId,
      requestedAt: nowIso,
      completedAt: nowUtcIso8601(),
    });
  }
}
