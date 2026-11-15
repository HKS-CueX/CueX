import type {
  AttentionSignal,
  Candidate,
  Intervention,
  InterventionLevel,
  ModelCallBreakdown,
  Observation,
  ProviderUsageRecord,
  ScenarioId,
  SessionStatus,
  SharedCognitiveState,
  SuppressionEntry,
  TelemetryUsage,
  TranscriptSegment,
} from '@cuex/protocol';

export interface SharedStateInit {
  sessionId: string;
  scenarioId: ScenarioId;
  activeGoal: string;
  activeChapterId?: string;
  activeChapterTitle?: string;
  constraints: string[];
  silentMode: boolean;
  maxInterventionLevel: InterventionLevel;
  now: number;
}

/**
 * Atomic Shared Cognitive State & Honest Telemetry Store.
 * Tracks monotonic `contextVersion`, Candidate map, cooldowns, suppressions,
 * active/historical interventions, and verified usage tokens (0 for local rules).
 */
export class SharedCognitiveStateStore {
  private readonly sessionId: string;
  private readonly scenarioId: ScenarioId;
  private contextVersion = 1;
  private updatedAt: number;
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
  private readonly suppressions = new Map<string, SuppressionEntry>();
  private readonly telemetry: TelemetryUsage;

  constructor(init: SharedStateInit) {
    this.sessionId = init.sessionId;
    this.scenarioId = init.scenarioId;
    this.updatedAt = init.now;
    this.silentMode = init.silentMode;
    this.maxInterventionLevel = init.maxInterventionLevel;
    this.activeGoal = init.activeGoal;
    this.activeChapterId = init.activeChapterId;
    this.activeChapterTitle = init.activeChapterTitle;
    this.constraints = [...init.constraints];
    this.telemetry = {
      sessionId: init.sessionId,
      updatedAt: init.now,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
      modelCalls: 0,
      localRuleEvaluations: 0,
      latencyMs: 0,
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

  bumpContextVersion(now: number): number {
    this.contextVersion += 1;
    this.updatedAt = now;
    return this.contextVersion;
  }

  setSessionStatus(status: SessionStatus, now: number): void {
    this.sessionStatus = status;
    this.updatedAt = now;
  }

  getSessionStatus(): SessionStatus {
    return this.sessionStatus;
  }

  setSilentMode(silentMode: boolean, now: number): void {
    this.silentMode = silentMode;
    this.updatedAt = now;
  }

  isSilentMode(): boolean {
    return this.silentMode;
  }

  setMaxInterventionLevel(level: InterventionLevel, now: number): void {
    this.maxInterventionLevel = level;
    this.updatedAt = now;
  }

  getMaxInterventionLevel(): InterventionLevel {
    return this.maxInterventionLevel;
  }

  setChapter(chapterId: string | undefined, chapterTitle: string | undefined, now: number, bump = true): number {
    this.activeChapterId = chapterId;
    this.activeChapterTitle = chapterTitle;
    return bump ? this.bumpContextVersion(now) : this.contextVersion;
  }

  setGoalAndConstraints(goal: string, constraints: string[], now: number, bump = true): number {
    this.activeGoal = goal;
    this.constraints = [...constraints];
    return bump ? this.bumpContextVersion(now) : this.contextVersion;
  }

  setAttentionAndGaps(signal: AttentionSignal, gapLabels: string[], now: number): void {
    this.attentionSignal = signal;
    this.openGapLabels = [...gapLabels];
    this.updatedAt = now;
  }

  upsertCandidate(candidate: Candidate, now: number): void {
    this.candidates.set(candidate.candidateId, { ...candidate });
    this.updatedAt = now;
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
    now: number,
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
    this.updatedAt = now;
  }

  setActiveIntervention(intervention: Intervention, cooldownMs: number, now: number): void {
    this.activeIntervention = { ...intervention };
    this.interventionHistory.push(this.activeIntervention);
    this.lastInterventionAtMs = now;
    this.cooldownUntilMs = now + cooldownMs;
    this.updateCandidateStatus(intervention.candidateId, 'active', now);
  }

  getActiveIntervention(): Intervention | null {
    return this.activeIntervention ? { ...this.activeIntervention } : null;
  }

  clearActiveIntervention(
    reason: NonNullable<Intervention['withdrawalReason']>,
    now: number,
    dismissed = false,
  ): Intervention | null {
    if (!this.activeIntervention) return null;
    const current = this.activeIntervention;
    current.withdrawnAt = now;
    current.withdrawalReason = reason;
    if (dismissed) {
      current.dismissedAt = now;
    }
    this.updateCandidateStatus(current.candidateId, dismissed ? 'dismissed' : 'withdrawn', now, {
      withdrawalReason: reason,
    });
    const closed = { ...current };
    this.activeIntervention = null;
    this.updatedAt = now;
    return closed;
  }

  setInterventionFeedback(
    interventionId: string,
    feedback: NonNullable<Intervention['userFeedback']>,
    now: number,
  ): Intervention | undefined {
    const target = this.interventionHistory.find((item) => item.interventionId === interventionId);
    if (!target) return undefined;
    target.userFeedback = feedback;
    target.feedbackAt = now;
    this.updatedAt = now;
    return { ...target };
  }

  getInterventionHistory(): Intervention[] {
    return this.interventionHistory.map((item) => ({ ...item }));
  }

  getCooldownRemainingMs(now: number): number {
    return Math.max(0, this.cooldownUntilMs - now);
  }

  getCooldownUntilMs(): number {
    return this.cooldownUntilMs;
  }

  addSuppression(entry: SuppressionEntry, now: number): void {
    this.suppressions.set(entry.key, { ...entry });
    this.updatedAt = now;
  }

  isSuppressed(key: string, now: number): SuppressionEntry | undefined {
    const entry = this.suppressions.get(key);
    if (!entry) return undefined;
    if (now >= entry.untilMs) {
      this.suppressions.delete(key);
      return undefined;
    }
    return entry;
  }

  getActiveSuppressions(now: number): SuppressionEntry[] {
    for (const [key, entry] of this.suppressions.entries()) {
      if (now >= entry.untilMs) this.suppressions.delete(key);
    }
    return [...this.suppressions.values()];
  }

  recordTelemetry(
    tier: ModelCallBreakdown['tier'],
    latencyMs: number,
    usage: ProviderUsageRecord | undefined,
    providerLabel: string,
    now: number,
  ): TelemetryUsage {
    const cleanLatency = Math.max(0, Math.round(latencyMs));
    this.telemetry.updatedAt = now;
    this.telemetry.latencyMs = cleanLatency;
    if (tier === 'system1') this.telemetry.lastSystem1LatencyMs = cleanLatency;
    if (tier === 'system2') this.telemetry.lastSystem2LatencyMs = cleanLatency;

    const byTier = (this.telemetry.byTier ??= {});
    const prev: ModelCallBreakdown = byTier[tier] ?? {
      tier,
      provider: providerLabel,
      model: usage?.model,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      latencyMsTotal: 0,
      latencyMsAvg: 0,
      measurementSource: usage?.measurementSource ?? 'local_rule_zero',
    };

    const calls = usage?.modelCalls ?? 0;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const cachedInputTokens = usage?.cachedInputTokens ?? 0;
    const isLocalRule = !usage || usage.measurementSource === 'local_rule_zero' || calls === 0;

    if (isLocalRule) {
      this.telemetry.localRuleEvaluations += 1;
    } else {
      this.telemetry.modelCalls += calls;
      this.telemetry.inputTokens += inputTokens;
      this.telemetry.outputTokens += outputTokens;
      this.telemetry.cachedInputTokens += cachedInputTokens;
      this.telemetry.totalTokens = this.telemetry.inputTokens + this.telemetry.outputTokens;
    }

    const totalTierOps = prev.calls + (isLocalRule ? 1 : calls);
    const updatedTier: ModelCallBreakdown = {
      tier,
      provider: usage?.provider ?? providerLabel,
      model: usage?.model ?? prev.model,
      calls: prev.calls + calls,
      inputTokens: prev.inputTokens + inputTokens,
      outputTokens: prev.outputTokens + outputTokens,
      cachedInputTokens: prev.cachedInputTokens + cachedInputTokens,
      latencyMsTotal: prev.latencyMsTotal + cleanLatency,
      latencyMsAvg: Math.round((prev.latencyMsTotal + cleanLatency) / Math.max(1, totalTierOps)),
      measurementSource: isLocalRule ? prev.measurementSource : usage.measurementSource,
    };
    byTier[tier] = updatedTier;

    if (this.telemetry.modelCalls > 0) {
      this.telemetry.estimation = {
        isEstimated: usage?.measurementSource === 'estimated',
        source: usage?.measurementSource === 'estimated' ? 'estimated' : 'provider_reported',
        usingLocalFallback: this.telemetry.localRuleEvaluations > 0,
        notes: 'Exact provider-reported tokens for model calls; 0 tokens for deterministic local rule steps.',
      };
    } else {
      this.telemetry.estimation = {
        isEstimated: false,
        source: 'local_rule_zero',
        usingLocalFallback: true,
        notes: 'Deterministic local rule execution (0 LLM tokens consumed).',
      };
    }

    return this.getTelemetry();
  }

  getTelemetry(): TelemetryUsage {
    return {
      ...this.telemetry,
      estimation: { ...this.telemetry.estimation },
      byTier: this.telemetry.byTier ? { ...this.telemetry.byTier } : undefined,
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
      updatedAt: this.updatedAt,
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
      cooldownUntilMs: this.cooldownUntilMs,
      lastInterventionAtMs: this.lastInterventionAtMs,
      suppressions: this.getActiveSuppressions(params.now),
      ...(params.scenarioState ? { scenarioState: params.scenarioState } : {}),
      telemetry: this.getTelemetry(),
    };
  }
}
