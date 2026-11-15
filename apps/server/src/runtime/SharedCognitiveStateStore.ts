import {
  createMoneyAmount,
  type AttentionSignal,
  type Candidate,
  type Intervention,
  type InterventionLevel,
  type ModelCallBreakdown,
  type Observation,
  type ProviderUsageRecord,
  type ScenarioId,
  type SessionStatus,
  type SharedCognitiveState,
  type SuppressionEntry,
  type TelemetryUsage,
  type TranscriptSegment,
} from '@cuex/protocol';
import { computeLatencyStats, isoToMs, msToIso } from './time';

export interface SharedStateInit {
  sessionId: string;
  scenarioId: ScenarioId;
  activeGoal: string;
  activeChapterId?: string;
  activeChapterTitle?: string;
  constraints: string[];
  silentMode: boolean;
  maxInterventionLevel: InterventionLevel;
  asrProvider?: string;
  now: number;
}

interface InternalSuppressionRecord {
  entry: SuppressionEntry;
  untilMs: number;
}

/**
 * Atomic Shared Cognitive State & Honest Telemetry Store.
 * Tracks monotonic `contextVersion`, Candidate map, cooldowns, suppressions,
 * active/historical interventions, and verified usage tokens/cost/retries/latency stats.
 */
export class SharedCognitiveStateStore {
  private readonly sessionId: string;
  private readonly scenarioId: ScenarioId;
  private contextVersion = 1;
  private updatedAtMs: number;
  private sessionStatus: SessionStatus = 'active';
  private silentMode: boolean;
  private maxInterventionLevel: InterventionLevel;
  private activeGoal: string;
  private activeChapterId?: string;
  private activeChapterTitle?: string;
  private constraints: string[];
  private attentionSignal: AttentionSignal = 'fluent';
  private openGapLabels: string[] = [];

  private activeIntervention: Intervention | null = null;
  private readonly interventionHistory: Intervention[] = [];
  private readonly candidates = new Map<string, Candidate>();
  private cooldownUntilMs = 0;
  private lastInterventionAtMs?: number;
  private readonly suppressions = new Map<string, InternalSuppressionRecord>();
  private readonly latencySamples: number[] = [];
  private readonly telemetry: TelemetryUsage;

  constructor(init: SharedStateInit) {
    this.sessionId = init.sessionId;
    this.scenarioId = init.scenarioId;
    this.updatedAtMs = init.now;
    this.silentMode = init.silentMode;
    this.maxInterventionLevel = init.maxInterventionLevel;
    this.activeGoal = init.activeGoal;
    this.activeChapterId = init.activeChapterId;
    this.activeChapterTitle = init.activeChapterTitle;
    this.constraints = [...init.constraints];
    const nowIso = msToIso(init.now);
    this.telemetry = {
      sessionId: init.sessionId,
      updatedAt: nowIso,
      usageSource: 'local_rule_zero',
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
      modelCalls: 0,
      retries: 0,
      localRuleEvaluations: 0,
      latencyMs: 0,
      latencyStats: { avgMs: 0, p95Ms: 0, maxMs: 0 },
      degraded: false,
      usingLocalFallback: true,
      asrProvider: init.asrProvider ?? 'text_only_offline',
      asrDurationMs: 0,
      costFen: 0,
      cost: createMoneyAmount(0),
      estimation: {
        isEstimated: false,
        source: 'local_rule_zero',
        usingLocalFallback: true,
        notes: '0 model calls so far; local rules record exact 0 tokens.',
      },
      byTier: {},
    };
  }

  getContextVersion(): number {
    return this.contextVersion;
  }

  bumpContextVersion(nowMs: number): number {
    this.contextVersion += 1;
    this.updatedAtMs = nowMs;
    return this.contextVersion;
  }

  setSessionStatus(status: SessionStatus, nowMs: number): void {
    this.sessionStatus = status;
    this.updatedAtMs = nowMs;
  }

  getSessionStatus(): SessionStatus {
    return this.sessionStatus;
  }

  setSilentMode(silentMode: boolean, nowMs: number): void {
    this.silentMode = silentMode;
    this.updatedAtMs = nowMs;
  }

  isSilentMode(): boolean {
    return this.silentMode;
  }

  setMaxInterventionLevel(level: InterventionLevel, nowMs: number): void {
    this.maxInterventionLevel = level;
    this.updatedAtMs = nowMs;
  }

  getMaxInterventionLevel(): InterventionLevel {
    return this.maxInterventionLevel;
  }

  setChapter(chapterId: string | undefined, chapterTitle: string | undefined, nowMs: number, bump = true): number {
    this.activeChapterId = chapterId;
    this.activeChapterTitle = chapterTitle;
    if (bump) return this.bumpContextVersion(nowMs);
    this.updatedAtMs = nowMs;
    return this.contextVersion;
  }

  setGoalAndConstraints(goal: string, constraints: string[], nowMs: number, bump = true): number {
    this.activeGoal = goal;
    this.constraints = [...constraints];
    if (bump) return this.bumpContextVersion(nowMs);
    this.updatedAtMs = nowMs;
    return this.contextVersion;
  }

  setAttentionAndGaps(signal: AttentionSignal, gapLabels: string[], nowMs: number): void {
    this.attentionSignal = signal;
    this.openGapLabels = [...gapLabels];
    this.updatedAtMs = nowMs;
  }

  upsertCandidate(candidate: Candidate, nowMs: number): void {
    this.candidates.set(candidate.candidateId, { ...candidate });
    this.updatedAtMs = nowMs;
  }

  getCandidate(candidateId: string): Candidate | undefined {
    return this.candidates.get(candidateId);
  }

  getPendingCandidates(): Candidate[] {
    return [...this.candidates.values()].filter((c) => c.status === 'pending');
  }

  getActiveCandidate(): Candidate | null {
    if (!this.activeIntervention) return null;
    return this.candidates.get(this.activeIntervention.candidateId) ?? null;
  }

  updateCandidateStatus(
    candidateId: string,
    status: Candidate['status'],
    nowMs: number,
    meta?: { withdrawalReason?: Candidate['withdrawalReason']; suppressedReason?: string },
  ): void {
    const current = this.candidates.get(candidateId);
    if (!current) return;
    this.candidates.set(candidateId, {
      ...current,
      status,
      ...(meta?.withdrawalReason ? { withdrawalReason: meta.withdrawalReason } : {}),
      ...(meta?.suppressedReason ? { suppressedReason: meta.suppressedReason } : {}),
    });
    this.updatedAtMs = nowMs;
  }

  setActiveIntervention(intervention: Intervention, cooldownMs: number, nowMs: number): void {
    this.activeIntervention = { ...intervention };
    this.interventionHistory.push(this.activeIntervention);
    this.lastInterventionAtMs = nowMs;
    this.cooldownUntilMs = nowMs + cooldownMs;
    this.updateCandidateStatus(intervention.candidateId, 'active', nowMs);
  }

  getActiveIntervention(): Intervention | null {
    return this.activeIntervention ? { ...this.activeIntervention } : null;
  }

  clearActiveIntervention(
    reason: NonNullable<Intervention['withdrawalReason']>,
    nowMs: number,
    dismissed = false,
  ): Intervention | null {
    if (!this.activeIntervention) return null;
    const nowIso = msToIso(nowMs);
    const current = this.activeIntervention;
    current.withdrawnAt = nowIso;
    current.withdrawalReason = reason;
    if (dismissed) {
      current.dismissedAt = nowIso;
    }
    this.updateCandidateStatus(current.candidateId, dismissed ? 'dismissed' : 'withdrawn', nowMs, {
      withdrawalReason: reason,
    });
    const closed = { ...current };
    this.activeIntervention = null;
    this.updatedAtMs = nowMs;
    return closed;
  }

  setInterventionFeedback(
    interventionId: string,
    feedback: NonNullable<Intervention['userFeedback']>,
    nowMs: number,
  ): Intervention | undefined {
    const target = this.interventionHistory.find((item) => item.interventionId === interventionId);
    if (!target) return undefined;
    target.userFeedback = feedback;
    target.feedbackAt = msToIso(nowMs);
    this.updatedAtMs = nowMs;
    return { ...target };
  }

  getInterventionHistory(): Intervention[] {
    return this.interventionHistory.map((item) => ({ ...item }));
  }

  getCooldownRemainingMs(nowMs: number): number {
    return Math.max(0, this.cooldownUntilMs - nowMs);
  }

  getCooldownUntilMs(): number {
    return this.cooldownUntilMs;
  }

  addSuppression(
    params: { key: string; reason: SuppressionEntry['reason']; createdAtMs: number; untilMs: number },
    nowMs: number,
  ): void {
    this.suppressions.set(params.key, {
      entry: {
        key: params.key,
        reason: params.reason,
        createdAt: msToIso(params.createdAtMs),
        until: msToIso(params.untilMs),
      },
      untilMs: params.untilMs,
    });
    this.updatedAtMs = nowMs;
  }

  isSuppressed(key: string, nowMs: number): SuppressionEntry | undefined {
    const record = this.suppressions.get(key);
    if (!record) return undefined;
    if (nowMs >= record.untilMs) {
      this.suppressions.delete(key);
      return undefined;
    }
    return { ...record.entry };
  }

  getActiveSuppressions(nowMs: number): SuppressionEntry[] {
    for (const [key, record] of this.suppressions.entries()) {
      if (nowMs >= record.untilMs) this.suppressions.delete(key);
    }
    return [...this.suppressions.values()].map((r) => ({ ...r.entry }));
  }

  recordAsrMetrics(params: { provider: string; durationMs: number; degraded?: boolean; nowMs: number }): void {
    this.telemetry.asrProvider = params.provider;
    this.telemetry.asrDurationMs += Math.max(0, Math.round(params.durationMs));
    if (params.degraded) this.telemetry.degraded = true;
    this.telemetry.updatedAt = msToIso(params.nowMs);
  }

  recordTelemetry(
    tier: ModelCallBreakdown['tier'],
    latencyMs: number,
    usage: ProviderUsageRecord | undefined,
    providerLabel: string,
    nowMs: number,
  ): TelemetryUsage {
    const cleanLatency = Math.max(0, Math.round(latencyMs));
    this.latencySamples.push(cleanLatency);
    if (this.latencySamples.length > 250) {
      this.latencySamples.splice(0, this.latencySamples.length - 250);
    }

    this.telemetry.updatedAt = msToIso(nowMs);
    this.telemetry.latencyMs = cleanLatency;
    this.telemetry.latencyStats = computeLatencyStats(this.latencySamples);
    if (tier === 'system1') this.telemetry.lastSystem1LatencyMs = cleanLatency;
    if (tier === 'system2') this.telemetry.lastSystem2LatencyMs = cleanLatency;

    const byTier = (this.telemetry.byTier ??= {});
    const prev: ModelCallBreakdown = byTier[tier] ?? {
      tier,
      provider: providerLabel,
      model: usage?.model,
      calls: 0,
      retries: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      latencyMsTotal: 0,
      latencyMsAvg: 0,
      usageSource: usage?.usageSource ?? 'local_rule_zero',
      degraded: Boolean(usage?.degraded),
      costFen: 0,
    };

    const calls = usage?.modelCalls ?? 0;
    const retries = usage?.retries ?? 0;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const cachedInputTokens = usage?.cachedInputTokens ?? 0;
    const costFen = Math.max(0, Math.round(usage?.costFen ?? 0));
    const degraded = Boolean(usage?.degraded);
    const isLocalRule = !usage || usage.usageSource === 'local_rule_zero' || calls === 0;

    this.telemetry.retries += retries;
    if (degraded) {
      this.telemetry.degraded = true;
    }

    if (isLocalRule) {
      this.telemetry.localRuleEvaluations += 1;
    } else {
      this.telemetry.modelCalls += calls;
      this.telemetry.inputTokens += inputTokens;
      this.telemetry.outputTokens += outputTokens;
      this.telemetry.cachedInputTokens += cachedInputTokens;
      this.telemetry.totalTokens = this.telemetry.inputTokens + this.telemetry.outputTokens;
      this.telemetry.costFen += costFen;
      this.telemetry.cost = createMoneyAmount(this.telemetry.costFen);
    }

    const totalTierOps = prev.calls + (isLocalRule ? 1 : calls);
    const updatedTier: ModelCallBreakdown = {
      tier,
      provider: usage?.provider ?? providerLabel,
      model: usage?.model ?? prev.model,
      calls: prev.calls + calls,
      retries: prev.retries + retries,
      inputTokens: prev.inputTokens + inputTokens,
      outputTokens: prev.outputTokens + outputTokens,
      cachedInputTokens: prev.cachedInputTokens + cachedInputTokens,
      latencyMsTotal: prev.latencyMsTotal + cleanLatency,
      latencyMsAvg: Math.round((prev.latencyMsTotal + cleanLatency) / Math.max(1, totalTierOps)),
      usageSource: isLocalRule ? prev.usageSource : usage.usageSource,
      degraded: prev.degraded || degraded,
      costFen: prev.costFen + (isLocalRule ? 0 : costFen),
    };
    byTier[tier] = updatedTier;

    const usingFallback = this.telemetry.localRuleEvaluations > 0;
    this.telemetry.usingLocalFallback = usingFallback;

    if (this.telemetry.modelCalls > 0) {
      const source = usage?.usageSource === 'estimated' ? 'estimated' : 'provider_reported';
      this.telemetry.usageSource = source;
      this.telemetry.estimation = {
        isEstimated: source === 'estimated',
        source,
        usingLocalFallback: usingFallback,
        notes: 'Exact provider-reported tokens for model calls; 0 tokens for deterministic local rule steps.',
      };
    } else {
      this.telemetry.usageSource = 'local_rule_zero';
      this.telemetry.estimation = {
        isEstimated: false,
        source: 'local_rule_zero',
        usingLocalFallback: true,
        notes: this.telemetry.degraded
          ? 'Degraded to local deterministic rule fallback after provider unavailability (0 LLM tokens consumed).'
          : 'Deterministic local rule execution (0 LLM tokens consumed).',
      };
    }

    return this.getTelemetry();
  }

  getTelemetry(): TelemetryUsage {
    return {
      ...this.telemetry,
      cost: { ...this.telemetry.cost },
      latencyStats: { ...this.telemetry.latencyStats },
      estimation: { ...this.telemetry.estimation },
      byTier: this.telemetry.byTier ? structuredClone(this.telemetry.byTier) : undefined,
    };
  }

  snapshot(params: {
    recentObservations: Observation[];
    recentSegments: TranscriptSegment[];
    scenarioState?: Record<string, unknown>;
    now: number;
  }): SharedCognitiveState {
    return {
      sessionId: this.sessionId,
      scenarioId: this.scenarioId,
      contextVersion: this.contextVersion,
      updatedAt: msToIso(this.updatedAtMs),
      sessionStatus: this.sessionStatus,
      silentMode: this.silentMode,
      maxInterventionLevel: this.maxInterventionLevel,
      activeGoal: this.activeGoal,
      activeChapterId: this.activeChapterId,
      activeChapterTitle: this.activeChapterTitle,
      constraints: [...this.constraints],
      attentionSignal: this.attentionSignal,
      openGapLabels: [...this.openGapLabels],
      activeIntervention: this.activeIntervention ? { ...this.activeIntervention } : null,
      activeCandidate: this.getActiveCandidate() ? { ...this.getActiveCandidate()! } : null,
      queuedCandidates: this.getPendingCandidates().map((c) => ({ ...c })),
      recentObservations: params.recentObservations,
      recentSegments: params.recentSegments,
      ...(this.cooldownUntilMs > 0 ? { cooldownUntil: msToIso(this.cooldownUntilMs) } : {}),
      ...(this.lastInterventionAtMs !== undefined
        ? { lastInterventionAt: msToIso(this.lastInterventionAtMs) }
        : {}),
      suppressions: this.getActiveSuppressions(params.now),
      ...(params.scenarioState ? { scenarioState: params.scenarioState } : {}),
      telemetry: this.getTelemetry(),
    };
  }
}

export { isoToMs };
