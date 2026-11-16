import { createMoneyAmount, nowUtcIso8601, type TelemetryUsage } from '@cuex/protocol';
import { redactLogText } from './Logger';

interface ProviderBucket {
  calls: number;
  errors: number;
  retries: number;
  degraded: boolean;
  latenciesMs: number[];
  lastError?: string;
}

function summarizeLatencies(samples: number[]) {
  if (samples.length === 0) {
    return { avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const pct = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
  return {
    avgMs: Number((sum / sorted.length).toFixed(2)),
    p50Ms: Number(pct(0.5).toFixed(2)),
    p95Ms: Number(pct(0.95).toFixed(2)),
    p99Ms: Number(pct(0.99).toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

/**
 * In-process redacted runtime telemetry & SLI collector backing `/api/observability/summary`.
 */
export class MetricsCollector {
  private httpRequestsTotal = 0;
  private httpErrorsTotal = 0;
  private httpRateLimitedTotal = 0;
  private readonly httpByStatus = new Map<string, number>();
  private readonly httpLatencies: number[] = [];

  private wsActiveConnections = 0;
  private wsTotalConnections = 0;
  private wsDisconnects = 0;
  private wsReconnects = 0;
  private wsDedupedEvents = 0;
  private wsReplayedEvents = 0;

  private readonly providers = new Map<string, ProviderBucket>();

  private controllerDecisionsTotal = 0;
  private controllerShownTotal = 0;
  private controllerWithdrawnTotal = 0;
  private controllerSuppressedTotal = 0;
  private readonly withdrawReasons = new Map<string, number>();
  private readonly suppressReasons = new Map<string, number>();

  private groundingCheckedTotal = 0;
  private groundingGroundedTotal = 0;

  private sessionsStarted = 0;
  private sessionsCompleted = 0;
  private sessionsWiped = 0;
  private docsExtracted = 0;
  private packsCompiled = 0;
  private memoriesSaved = 0;

  private readonly sessionTelemetry = new Map<string, TelemetryUsage>();

  recordHttpRequest(status: number, latencyMs: number): void {
    this.httpRequestsTotal += 1;
    if (status >= 400) this.httpErrorsTotal += 1;
    if (status === 429) this.httpRateLimitedTotal += 1;
    const key = String(status);
    this.httpByStatus.set(key, (this.httpByStatus.get(key) ?? 0) + 1);
    this.httpLatencies.push(Math.max(0, latencyMs));
    if (this.httpLatencies.length > 2_000) this.httpLatencies.shift();
  }

  recordWsConnect(isReconnect: boolean): void {
    this.wsActiveConnections += 1;
    this.wsTotalConnections += 1;
    if (isReconnect) this.wsReconnects += 1;
  }

  recordWsDisconnect(): void {
    this.wsActiveConnections = Math.max(0, this.wsActiveConnections - 1);
    this.wsDisconnects += 1;
  }

  recordWsDeduped(): void {
    this.wsDedupedEvents += 1;
  }

  recordWsReplayed(count: number): void {
    this.wsReplayedEvents += Math.max(0, count);
  }

  recordProviderCall(
    tier: 'asr' | 'system1' | 'system2',
    params: { latencyMs: number; retries?: number; ok: boolean; degraded?: boolean; error?: string },
  ): void {
    let bucket = this.providers.get(tier);
    if (!bucket) {
      bucket = { calls: 0, errors: 0, retries: 0, degraded: false, latenciesMs: [] };
      this.providers.set(tier, bucket);
    }
    bucket.calls += 1;
    bucket.retries += params.retries ?? 0;
    if (!params.ok) bucket.errors += 1;
    bucket.degraded = Boolean(params.degraded ?? (!params.ok || bucket.degraded));
    if (params.error) bucket.lastError = redactLogText(params.error);
    bucket.latenciesMs.push(Math.max(0, params.latencyMs));
    if (bucket.latenciesMs.length > 1_000) bucket.latenciesMs.shift();
  }

  recordControllerDecision(action: string, reasonCode?: string): void {
    this.controllerDecisionsTotal += 1;
    if (action.startsWith('show_')) {
      this.controllerShownTotal += 1;
    } else if (action === 'withdraw') {
      this.controllerWithdrawnTotal += 1;
      if (reasonCode) {
        this.withdrawReasons.set(reasonCode, (this.withdrawReasons.get(reasonCode) ?? 0) + 1);
      }
    } else if (action === 'stay_silent') {
      this.controllerSuppressedTotal += 1;
      if (reasonCode) {
        this.suppressReasons.set(reasonCode, (this.suppressReasons.get(reasonCode) ?? 0) + 1);
      }
    }
  }

  recordGroundingCheck(grounded: boolean): void {
    this.groundingCheckedTotal += 1;
    if (grounded) this.groundingGroundedTotal += 1;
  }

  recordFunnelEvent(
    kind:
      | 'doc_extracted'
      | 'pack_compiled'
      | 'session_started'
      | 'session_completed'
      | 'session_wiped'
      | 'memory_saved',
  ): void {
    if (kind === 'doc_extracted') this.docsExtracted += 1;
    if (kind === 'pack_compiled') this.packsCompiled += 1;
    if (kind === 'session_started') this.sessionsStarted += 1;
    if (kind === 'session_completed') this.sessionsCompleted += 1;
    if (kind === 'session_wiped') this.sessionsWiped += 1;
    if (kind === 'memory_saved') this.memoriesSaved += 1;
  }

  updateSessionTelemetry(usage: TelemetryUsage): void {
    this.sessionTelemetry.set(usage.sessionId, structuredClone(usage));
  }

  removeSessionTelemetry(sessionId: string): void {
    this.sessionTelemetry.delete(sessionId);
  }

  snapshot() {
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedInputTokens = 0;
    let modelCalls = 0;
    let localRuleEvaluations = 0;
    let totalCostFen = 0;
    const sources = new Set<string>();

    for (const t of this.sessionTelemetry.values()) {
      totalTokens += t.totalTokens;
      inputTokens += t.inputTokens;
      outputTokens += t.outputTokens;
      cachedInputTokens += t.cachedInputTokens;
      modelCalls += t.modelCalls;
      localRuleEvaluations += t.localRuleEvaluations;
      totalCostFen += t.costFen;
      sources.add(t.usageSource);
    }

    const providersSummary = Object.fromEntries(
      [...this.providers.entries()].map(([tier, b]) => [
        tier,
        {
          calls: b.calls,
          errors: b.errors,
          retries: b.retries,
          degraded: b.degraded,
          ...(b.lastError ? { lastError: b.lastError } : {}),
          latencyMs: summarizeLatencies(b.latenciesMs),
        },
      ]),
    );

    return {
      generatedAt: nowUtcIso8601(),
      http: {
        requestsTotal: this.httpRequestsTotal,
        errorsTotal: this.httpErrorsTotal,
        rateLimitedTotal: this.httpRateLimitedTotal,
        byStatus: Object.fromEntries(this.httpByStatus.entries()),
        latencyMs: summarizeLatencies(this.httpLatencies),
      },
      ws: {
        activeConnections: this.wsActiveConnections,
        totalConnections: this.wsTotalConnections,
        disconnects: this.wsDisconnects,
        reconnects: this.wsReconnects,
        dedupedClientEvents: this.wsDedupedEvents,
        replayedEvents: this.wsReplayedEvents,
      },
      providers: providersSummary,
      controller: {
        decisionsTotal: this.controllerDecisionsTotal,
        shownTotal: this.controllerShownTotal,
        withdrawnTotal: this.controllerWithdrawnTotal,
        suppressedTotal: this.controllerSuppressedTotal,
        byWithdrawReason: Object.fromEntries(this.withdrawReasons.entries()),
        bySuppressReason: Object.fromEntries(this.suppressReasons.entries()),
      },
      grounding: {
        checkedTotal: this.groundingCheckedTotal,
        groundedTotal: this.groundingGroundedTotal,
        groundingRate:
          this.groundingCheckedTotal > 0
            ? Number((this.groundingGroundedTotal / this.groundingCheckedTotal).toFixed(4))
            : 1,
      },
      funnel: {
        docsExtracted: this.docsExtracted,
        packsCompiled: this.packsCompiled,
        sessionsStarted: this.sessionsStarted,
        sessionsCompleted: this.sessionsCompleted,
        sessionsWiped: this.sessionsWiped,
        memoriesSaved: this.memoriesSaved,
        sessionCompletionRate:
          this.sessionsStarted > 0
            ? Number((this.sessionsCompleted / this.sessionsStarted).toFixed(4))
            : 0,
      },
      telemetryTotals: {
        totalTokens,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        modelCalls,
        localRuleEvaluations,
        costFen: totalCostFen,
        cost: createMoneyAmount(totalCostFen),
        measurementSourcesSeen: [...sources],
      },
    };
  }
}
