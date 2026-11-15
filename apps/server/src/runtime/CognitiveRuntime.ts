import {
  INTERVENTION_LEVEL_RANK,
  type AsrCapabilityStatus,
  type Candidate,
  type ContextPack,
  type ControllerDecision,
  type InterventionFeedback,
  type InterventionLevel,
  type Outcome,
  type PresentationMode,
  type ServerMessage,
  type Session,
  type SlowReasoningTriggerKind,
  type TaskContext,
  type TranscriptSource,
  type TranscriptSpeaker,
  type ViewMode,
} from '@cuex/protocol';
import { ContextStore } from './ContextStore';
import { CognitiveEventBus } from './EventBus';
import { InterventionController, type ControllerSignalContext } from './InterventionController';
import type { MemoryStore } from './MemoryStore';
import { SharedCognitiveStateStore } from './SharedCognitiveStateStore';
import {
  systemClock,
  type FastDecisionProvider,
  type RetrievalProvider,
  type RuntimeClock,
  type ScenarioRuntimePlugin,
  type SlowReasoningProvider,
} from './types';

export interface CognitiveRuntimeSessionOptions<TState = Record<string, unknown>, TReflection = unknown> {
  sessionId: string;
  mode: PresentationMode;
  viewMode: ViewMode;
  silentMode: boolean;
  maxInterventionLevel: InterventionLevel;
  privacyNoticeAccepted: boolean;
  contextPack?: ContextPack;
  goal: string;
  audience?: string;
  targetDurationSec?: number;
  constraints: string[];
  forbiddenClaims?: string[];
  initialChapterId?: string;
  initialChapterTitle?: string;
  asrStatus: AsrCapabilityStatus;
  plugin: ScenarioRuntimePlugin<TState, TReflection>;
  fastDecision: FastDecisionProvider;
  slowReasoning: SlowReasoningProvider;
  retrieval: RetrievalProvider;
  controller: InterventionController;
  memoryStore: MemoryStore;
  clock?: RuntimeClock;
  emitMessage?: (msg: ServerMessage) => void;
}

/**
 * Domain-agnostic Cognitive Runtime Session Coordinator.
 * Wires EventBus -> ContextStore -> SharedCognitiveStateStore -> S1/Retrieval/S2 -> InterventionController.
 */
export class CognitiveRuntimeSession<TState = Record<string, unknown>, TReflection = unknown> {
  readonly sessionId: string;
  readonly eventBus = new CognitiveEventBus();
  readonly context: ContextStore;
  readonly state: SharedCognitiveStateStore;
  private readonly plugin: ScenarioRuntimePlugin<TState, TReflection>;
  private readonly fastDecision: FastDecisionProvider;
  private readonly slowReasoning: SlowReasoningProvider;
  private readonly retrieval: RetrievalProvider;
  private readonly controller: InterventionController;
  private readonly memoryStore: MemoryStore;
  private readonly clock: RuntimeClock;
  private readonly emitMessage?: (msg: ServerMessage) => void;
  private readonly asrStatus: AsrCapabilityStatus;

  private s1Seq = 0;
  private s2Seq = 0;
  private inFlightAbort?: AbortController;
  private lastEvaluatedSilenceSegId?: string;

  constructor(opts: CognitiveRuntimeSessionOptions<TState, TReflection>) {
    this.sessionId = opts.sessionId;
    this.plugin = opts.plugin;
    this.fastDecision = opts.fastDecision;
    this.slowReasoning = opts.slowReasoning;
    this.retrieval = opts.retrieval;
    this.controller = opts.controller;
    this.memoryStore = opts.memoryStore;
    this.clock = opts.clock ?? systemClock;
    this.emitMessage = opts.emitMessage;
    this.asrStatus = opts.asrStatus;

    const now = this.clock.now();
    const session: Session = {
      sessionId: opts.sessionId,
      scenarioId: opts.plugin.scenarioId,
      status: 'active',
      mode: opts.mode,
      viewMode: opts.viewMode,
      startedAt: now,
      contextPackId: opts.contextPack?.packId,
      silentMode: opts.silentMode,
      maxInterventionLevel: opts.maxInterventionLevel,
      privacyNoticeAccepted: opts.privacyNoticeAccepted,
    };

    const taskContext: TaskContext = {
      taskId: `task_${opts.sessionId}`,
      sessionId: opts.sessionId,
      scenarioId: opts.plugin.scenarioId,
      goal: opts.goal,
      audience: opts.audience,
      activeChapterId: opts.initialChapterId,
      activeChapterTitle: opts.initialChapterTitle,
      targetDurationSec: opts.targetDurationSec,
      elapsedSec: 0,
      constraints: opts.constraints,
      forbiddenClaims: opts.forbiddenClaims,
      contextVersion: 1,
      updatedAt: now,
    };

    const confirmedMemories = opts.memoryStore.getConfirmedForScenario(opts.plugin.scenarioId);

    this.context = new ContextStore({
      session,
      taskContext,
      contextPack: opts.contextPack,
      confirmedMemories,
    });

    this.state = new SharedCognitiveStateStore({
      sessionId: opts.sessionId,
      scenarioId: opts.plugin.scenarioId,
      activeGoal: opts.goal,
      activeChapterId: opts.initialChapterId,
      activeChapterTitle: opts.initialChapterTitle,
      constraints: opts.constraints,
      silentMode: opts.silentMode,
      maxInterventionLevel: opts.maxInterventionLevel,
      now,
    });

    const startEvt = this.eventBus.emit({
      sessionId: opts.sessionId,
      eventType: 'session.lifecycle',
      timestamp: now,
      source: 'runtime',
      payload: { action: 'started', mode: opts.mode },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send({ type: 'cognitive.event', payload: startEvt });
  }

  private send(msg: ServerMessage): void {
    this.emitMessage?.(msg);
  }

  private emitStateAndProjection(now: number): void {
    const scenarioState = this.plugin.getProjection(
      this.state.snapshot({
        recentObservations: this.context.getRecentObservations(),
        recentSegments: this.context.getRecentSegments(),
        now,
      }),
      now,
    ) as Record<string, unknown>;

    const fullSnapshot = this.state.snapshot({
      recentObservations: this.context.getRecentObservations(),
      recentSegments: this.context.getRecentSegments(),
      scenarioState,
      now,
    });
    this.send({ type: 'cognitive.state', payload: fullSnapshot });
    if (this.plugin.scenarioId === 'presentation') {
      this.send({
        type: 'presentation.progress',
        payload: scenarioState as never,
      });
    }
  }

  private dispatchWithdrawalIfAny(decision: ControllerDecision | null, now: number): boolean {
    if (!decision || decision.selectedAction !== 'withdraw' || !decision.intervention) return false;
    this.send({ type: 'controller.decision', payload: decision });
    this.send({
      type: 'intervention.withdrawn',
      payload: {
        sessionId: this.sessionId,
        interventionId: decision.intervention.interventionId,
        candidateId: decision.candidateId,
        reason: decision.withdrawalReason ?? 'user_recovered',
        decision,
        withdrawnAt: now,
      },
    });
    this.plugin.onInterventionWithdrawn?.(
      decision.intervention,
      decision.withdrawalReason ?? 'user_recovered',
    );
    const evt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'intervention.withdrawn',
      timestamp: now,
      source: 'controller',
      payload: {
        interventionId: decision.intervention.interventionId,
        reason: decision.withdrawalReason,
      },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send({ type: 'cognitive.event', payload: evt });
    return true;
  }

  private dispatchControllerOutcome(
    outcome: ReturnType<InterventionController['evaluateCandidates']>,
    now: number,
  ): void {
    if (outcome.supersededDecision && outcome.supersededWithdrawn) {
      this.dispatchWithdrawalIfAny(outcome.supersededDecision, now);
    }
    this.send({ type: 'controller.decision', payload: outcome.decision });
    if (outcome.shown) {
      this.send({
        type: 'intervention.shown',
        payload: {
          sessionId: this.sessionId,
          intervention: outcome.shown,
          decision: outcome.decision,
        },
      });
      this.plugin.onInterventionShown?.(outcome.shown);
      const evt = this.eventBus.emit({
        sessionId: this.sessionId,
        eventType: 'intervention.shown',
        timestamp: now,
        source: 'controller',
        payload: {
          interventionId: outcome.shown.interventionId,
          level: outcome.shown.level,
          grounded: outcome.shown.grounded,
        },
        confidence: 1,
        contextVersion: this.state.getContextVersion(),
      });
      this.send({ type: 'cognitive.event', payload: evt });
    }
  }

  private capLevel(requested: InterventionLevel): InterventionLevel {
    const ceiling = this.state.getMaxInterventionLevel();
    if (INTERVENTION_LEVEL_RANK[requested] > INTERVENTION_LEVEL_RANK[ceiling]) {
      return ceiling === 'L0' ? 'L1' : ceiling;
    }
    return requested;
  }

  async ingestSpeech(input: {
    speaker?: TranscriptSpeaker;
    text: string;
    isFinal: boolean;
    confidence?: number;
    startMs?: number;
    endMs?: number;
    source?: TranscriptSource;
  }): Promise<{
    segment: ReturnType<ContextStore['recordSegment']>;
    decision?: ControllerDecision;
  }> {
    const now = input.endMs ?? this.clock.now();
    const trimmed = input.text.trim();
    if (!trimmed) {
      throw new Error('Empty speech text cannot be ingested.');
    }

    const segment = this.context.recordSegment({
      speaker: input.speaker ?? 'presenter',
      text: trimmed,
      isFinal: input.isFinal,
      confidence: input.confidence ?? 0.94,
      startMs: input.startMs ?? Math.max(now - 900, this.context.session.startedAt),
      endMs: now,
      source: input.source ?? 'text_simulation',
      chapterId: this.context.taskContext.activeChapterId,
    });

    this.send({
      type: 'asr.transcript',
      payload: {
        segment,
        asrStatus: this.asrStatus,
      },
    });

    const speechEvt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: segment.isFinal ? 'speech.final' : 'speech.partial',
      timestamp: now,
      source: segment.source ?? 'text_simulation',
      payload: {
        segmentId: segment.segmentId,
        speaker: segment.speaker,
        text: segment.text,
      },
      confidence: segment.confidence,
      contextVersion: this.state.getContextVersion(),
    });
    this.send({ type: 'cognitive.event', payload: speechEvt });

    const pluginResult = this.plugin.onSegment?.(segment, now, this.state.getContextVersion()) ?? {};
    if (pluginResult.chapterChangedTo) {
      this.context.updateChapter(
        pluginResult.chapterChangedTo,
        pluginResult.chapterChangedTitle,
        now,
      );
      this.state.setChapter(
        pluginResult.chapterChangedTo,
        pluginResult.chapterChangedTitle,
        now,
        false,
      );
      if (pluginResult.contextBumped) {
        this.state.bumpContextVersion(now);
      }
      const chEvt = this.eventBus.emit({
        sessionId: this.sessionId,
        eventType: 'chapter.change',
        timestamp: now,
        source: 'scenario_plugin',
        payload: {
          chapterId: pluginResult.chapterChangedTo,
          title: pluginResult.chapterChangedTitle,
        },
        confidence: 1,
        contextVersion: this.state.getContextVersion(),
      });
      this.send({ type: 'cognitive.event', payload: chEvt });
    }

    if (pluginResult.extraObservations?.length) {
      for (const obs of pluginResult.extraObservations) {
        this.context.addObservation(obs);
      }
    }

    // Cancel superseded in-flight reasoning on newer finalized utterance.
    if (this.inFlightAbort) {
      this.inFlightAbort.abort();
    }
    this.inFlightAbort = new AbortController();
    const signal = this.inFlightAbort.signal;

    const targetCtx = this.plugin.getTargetContextSnapshot();
    const expectedPoints = this.plugin.getExpectedPoints();
    let verdict;
    try {
      verdict = await this.fastDecision.evaluate(
        {
          sessionId: this.sessionId,
          scenarioId: this.plugin.scenarioId,
          contextVersion: this.state.getContextVersion(),
          timestamp: now,
          activeGoal: targetCtx.goal,
          activeChapterId: targetCtx.chapterId,
          activeChapterTitle: targetCtx.chapterTitle,
          expectedPoints,
          recentSegments: this.context.getRecentSegments(8),
          recentTextDigest: this.context.getRecentTextDigest(),
          silenceDurationMs: 0,
          activeCandidate: this.state.getActiveCandidate() ?? undefined,
          activeIntervention: this.state.getActiveIntervention() ?? undefined,
        },
        signal,
      );
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        return { segment };
      }
      throw error;
    }

    const telemetryAfterS1 = this.state.recordTelemetry(
      'system1',
      verdict.latencyMs,
      verdict.usage,
      verdict.backend,
      now,
    );
    this.send({ type: 'system1.verdict', payload: verdict });
    this.send({ type: 'telemetry.updated', payload: telemetryAfterS1 });

    const effectiveRecovery = verdict.recoveryDetected || Boolean(pluginResult.directRecoveryDetected);
    const effectiveDrift = verdict.driftDetected || Boolean(pluginResult.topicDriftTopic);
    const effectiveQuestion = pluginResult.questionText ?? verdict.detectedQuestion;
    const semanticGap =
      verdict.signals.semanticOmission ||
      verdict.cognitiveState === 'omitting_key_point' ||
      verdict.cognitiveState === 'hesitating';

    const attentionSignal = effectiveRecovery
      ? 'recovering'
      : effectiveQuestion
        ? 'answering_question'
        : effectiveDrift
          ? 'drifting'
          : verdict.cognitiveState === 'hesitating'
            ? 'hesitating'
            : semanticGap
              ? 'omission_risk'
              : 'fluent';

    const gapLabels = expectedPoints
      .filter((p) => verdict.missingPointIds.includes(p.id))
      .map((p) => p.label);
    this.state.setAttentionAndGaps(attentionSignal, gapLabels, now);

    const signals: ControllerSignalContext = {
      verdict,
      silenceMs: 0,
      semanticGap,
      drift: effectiveDrift,
      openQuestion: Boolean(effectiveQuestion),
      manualHelp: false,
      recovery: effectiveRecovery,
      topicChanged: Boolean(
        this.state.getActiveIntervention() &&
          (pluginResult.newlyCoveredPointIds?.length || pluginResult.chapterChangedTo),
      ),
      coveredPointIds: verdict.coveredPointIds,
    };

    const withdrawnDecision = this.controller.checkWithdrawals({
      sessionId: this.sessionId,
      state: this.state,
      context: this.context,
      signals,
      now,
    });
    if (withdrawnDecision) {
      this.dispatchWithdrawalIfAny(withdrawnDecision, now);
      this.emitStateAndProjection(now);
      return { segment, decision: withdrawnDecision };
    }

    if (
      verdict.interventionNeed === 'none' &&
      !effectiveQuestion &&
      !effectiveDrift &&
      !pluginResult.preferredTriggerKind
    ) {
      // Quiet fluent path: stay silent without unnecessary System 2 generation.
      this.emitStateAndProjection(now);
      return { segment };
    }

    const triggerKind: SlowReasoningTriggerKind = effectiveQuestion
      ? 'live_qa'
      : effectiveDrift
        ? 'drift'
        : pluginResult.preferredTriggerKind ??
          (verdict.cognitiveState === 'hesitating' ? 'hesitation' : 'omission');

    const requestedLevel = this.capLevel(
      verdict.recommendedLevel === 'L0'
        ? triggerKind === 'live_qa'
          ? 'L2'
          : 'L1'
        : verdict.recommendedLevel,
    );

    const queryText =
      effectiveQuestion ||
      expectedPoints
        .filter((p) => verdict.missingPointIds.includes(p.id))
        .map((p) => p.label)
        .join(' ') ||
      segment.text;

    const retrieved = await this.retrieval.search(queryText, this.context.getVerifiedActiveEvidence(), {
      topK: 3,
      minScore: 0.2,
    });

    if (effectiveQuestion) {
      this.plugin.onQuestionEvidence?.(segment.segmentId, effectiveQuestion, retrieved);
    }

    let s2Result;
    try {
      s2Result = await this.slowReasoning.synthesize(
        {
          requestId: `s2_${++this.s2Seq}_${now}`,
          sessionId: this.sessionId,
          scenarioId: this.plugin.scenarioId,
          contextVersion: this.state.getContextVersion(),
          timestamp: now,
          triggerKind,
          requestedLevel,
          activeGoal: targetCtx.goal,
          activeChapterId: targetCtx.chapterId,
          activeChapterTitle: targetCtx.chapterTitle,
          questionText: effectiveQuestion,
          missingPoints: expectedPoints
            .filter((p) => verdict.missingPointIds.includes(p.id))
            .map(({ id, label }) => ({ id, label })),
          recentSegments: this.context.getRecentSegments(6),
          retrievedEvidence: retrieved.map((r) => r.evidence),
          constraints: targetCtx.constraints,
          forbiddenClaims: targetCtx.forbiddenClaims,
          basedOnSegmentId: segment.segmentId,
        },
        signal,
      );
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        return { segment };
      }
      throw error;
    }

    const telemetryAfterS2 = this.state.recordTelemetry(
      'system2',
      s2Result.latencyMs,
      s2Result.usage,
      s2Result.backend,
      now,
    );
    this.send({ type: 'system2.candidate', payload: s2Result });
    this.send({ type: 'telemetry.updated', payload: telemetryAfterS2 });

    let finalDecision: ControllerDecision | undefined;
    if (s2Result.candidate) {
      this.state.upsertCandidate(s2Result.candidate, now);
      this.plugin.onCandidatePrepared?.(s2Result.candidate);
      const outcome = this.controller.evaluateCandidates({
        sessionId: this.sessionId,
        state: this.state,
        context: this.context,
        candidates: [s2Result.candidate, ...this.state.getPendingCandidates()],
        signals,
        now,
      });
      this.dispatchControllerOutcome(outcome, now);
      finalDecision = outcome.decision;
    }

    this.emitStateAndProjection(now);
    return { segment, ...(finalDecision ? { decision: finalDecision } : {}) };
  }

  /**
   * Evaluates a runtime tick (TTL expiry, chapter pace/overtime check, or post-silence gap check).
   * Strictly event-bounded: never executes unconditional per-second LLM polling on idle ticks.
   */
  async processTick(silenceDurationMs?: number): Promise<ControllerDecision | null> {
    const now = this.clock.now();
    const computedSilence = silenceDurationMs ?? this.context.getSilenceDurationMs(now);

    const tickSignals: ControllerSignalContext = {
      silenceMs: computedSilence,
      semanticGap: false,
      drift: false,
      openQuestion: false,
      manualHelp: false,
      recovery: false,
    };

    const withdrawal = this.controller.checkWithdrawals({
      sessionId: this.sessionId,
      state: this.state,
      context: this.context,
      signals: tickSignals,
      now,
    });
    if (withdrawal) {
      this.dispatchWithdrawalIfAny(withdrawal, now);
      this.emitStateAndProjection(now);
      return withdrawal;
    }

    const pluginTick =
      this.plugin.onTick?.(now, this.state.getContextVersion(), this.context.getLastSegmentId()) ?? {};
    if (pluginTick.extraObservations?.length) {
      for (const obs of pluginTick.extraObservations) {
        this.context.addObservation(obs);
      }
    }

    const lastSegId = this.context.getLastSegmentId();
    const pendingCandidates = [...this.state.getPendingCandidates()];
    const hasExplicitTrigger = Boolean(pluginTick.triggerCandidate) || pendingCandidates.length > 0;
    const isExplicitCallerTick = silenceDurationMs !== undefined;
    const firstPauseCheckForSegment =
      computedSilence >= 1_600 && this.lastEvaluatedSilenceSegId !== lastSegId;

    // Skip idle periodic background ticks with zero pending candidates/triggers to prevent per-second polling.
    if (!hasExplicitTrigger && !isExplicitCallerTick && !firstPauseCheckForSegment) {
      this.emitStateAndProjection(now);
      return null;
    }
    this.lastEvaluatedSilenceSegId = lastSegId;

    const tickEvt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'silence.tick',
      timestamp: now,
      source: 'runtime',
      payload: { silenceDurationMs: computedSilence },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send({ type: 'cognitive.event', payload: tickEvt });

    const targetCtx = this.plugin.getTargetContextSnapshot();
    const expectedPoints = this.plugin.getExpectedPoints();
    const verdict = await this.fastDecision.evaluate({
      sessionId: this.sessionId,
      scenarioId: this.plugin.scenarioId,
      contextVersion: this.state.getContextVersion(),
      timestamp: now,
      activeGoal: targetCtx.goal,
      activeChapterId: targetCtx.chapterId,
      activeChapterTitle: targetCtx.chapterTitle,
      expectedPoints,
      recentSegments: this.context.getRecentSegments(6),
      recentTextDigest: this.context.getRecentTextDigest(),
      silenceDurationMs: computedSilence,
      activeCandidate: this.state.getActiveCandidate() ?? undefined,
      activeIntervention: this.state.getActiveIntervention() ?? undefined,
    });
    const telemetry = this.state.recordTelemetry(
      'system1',
      verdict.latencyMs,
      verdict.usage,
      verdict.backend,
      now,
    );
    this.send({ type: 'system1.verdict', payload: verdict });
    this.send({ type: 'telemetry.updated', payload: telemetry });

    const candidateList: Candidate[] = [...pendingCandidates];
    if (pluginTick.triggerCandidate) {
      const ttl = 12_000;
      const paceCandidate: Candidate = {
        candidateId: `cand_tick_${now}`,
        sessionId: this.sessionId,
        level: this.capLevel(pluginTick.triggerCandidate.requestedLevel),
        title: pluginTick.triggerCandidate.title,
        cueText: pluginTick.triggerCandidate.cueText,
        ...(pluginTick.triggerCandidate.bullets ? { bullets: pluginTick.triggerCandidate.bullets } : {}),
        priority: pluginTick.triggerCandidate.priority,
        ttlMs: ttl,
        expiresAt: now + ttl,
        contextVersion: this.state.getContextVersion(),
        evidenceIds: pluginTick.triggerCandidate.evidenceIds ?? [],
        basedOnSegmentId: pluginTick.triggerCandidate.basedOnSegmentId,
        status: 'pending',
        createdAt: now,
        kind: pluginTick.triggerCandidate.kind === 'pace_overtime' ? 'pace_nudge' : 'omission_cue',
        grounded: true,
        triggerReason: pluginTick.triggerCandidate.reason,
        targetChapterId: pluginTick.triggerCandidate.targetChapterId,
        targetKeyPointId: pluginTick.triggerCandidate.targetKeyPointId,
      };
      this.state.upsertCandidate(paceCandidate, now);
      candidateList.unshift(paceCandidate);
    }

    if (candidateList.length === 0) {
      const decision = this.controller.evaluateCandidates({
        sessionId: this.sessionId,
        state: this.state,
        context: this.context,
        candidates: [
          {
            candidateId: `cand_probe_pause_${now}`,
            sessionId: this.sessionId,
            level: 'L1',
            title: 'Pause Probe',
            cueText: 'Continue when ready.',
            priority: 10,
            ttlMs: 1_000,
            expiresAt: now + 1_000,
            contextVersion: this.state.getContextVersion(),
            evidenceIds: [],
            basedOnSegmentId: lastSegId,
            status: 'pending',
            kind: 'omission_cue',
            grounded: true,
          },
        ],
        signals: {
          verdict,
          silenceMs: computedSilence,
          semanticGap: verdict.signals.semanticOmission,
          drift: verdict.signals.topicDrift,
          openQuestion: verdict.signals.openQuestion,
          manualHelp: false,
          recovery: verdict.recoveryDetected,
        },
        now,
      });
      this.send({ type: 'controller.decision', payload: decision.decision });
      this.emitStateAndProjection(now);
      return decision.decision;
    }

    const outcome = this.controller.evaluateCandidates({
      sessionId: this.sessionId,
      state: this.state,
      context: this.context,
      candidates: candidateList,
      signals: {
        verdict,
        silenceMs: computedSilence,
        semanticGap: verdict.signals.semanticOmission,
        drift: verdict.signals.topicDrift,
        openQuestion: verdict.signals.openQuestion,
        manualHelp: false,
        recovery: verdict.recoveryDetected,
      },
      now,
    });
    this.dispatchControllerOutcome(outcome, now);
    this.emitStateAndProjection(now);
    return outcome.decision;
  }

  /**
   * Direct candidate evaluation entry point through Controller (never bypasses grounding/TTL/version gates).
   */
  submitExternalCandidate(
    candidate: Candidate,
    signals: Partial<ControllerSignalContext> = {},
  ): ReturnType<InterventionController['evaluateCandidates']> {
    const now = this.clock.now();
    this.state.upsertCandidate(candidate, now);
    const outcome = this.controller.evaluateCandidates({
      sessionId: this.sessionId,
      state: this.state,
      context: this.context,
      candidates: [candidate],
      signals: {
        silenceMs: signals.silenceMs ?? 0,
        semanticGap: signals.semanticGap ?? false,
        drift: signals.drift ?? false,
        openQuestion: signals.openQuestion ?? false,
        manualHelp: signals.manualHelp ?? false,
        recovery: signals.recovery ?? false,
        allowedAuxiliaryNumbers: signals.allowedAuxiliaryNumbers,
      },
      now,
    });
    this.dispatchControllerOutcome(outcome, now);
    this.emitStateAndProjection(now);
    return outcome;
  }

  async requestManualHelp(input: { preferredLevel?: InterventionLevel; question?: string }): Promise<ControllerDecision> {
    const now = this.clock.now();
    const reqEvt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'user.manual_help',
      timestamp: now,
      source: 'user',
      payload: { preferredLevel: input.preferredLevel, question: input.question },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send({ type: 'cognitive.event', payload: reqEvt });

    const targetCtx = this.plugin.getTargetContextSnapshot();
    const expectedPoints = this.plugin.getExpectedPoints();
    const missingPoints = expectedPoints.filter((p) => !p.covered);
    const query =
      input.question?.trim() ||
      missingPoints.map((p) => p.label).join(' ') ||
      targetCtx.chapterTitle ||
      targetCtx.goal;

    const retrieved = await this.retrieval.search(query, this.context.getVerifiedActiveEvidence(), {
      topK: 3,
      minScore: 0.15,
    });

    const requestedLevel = this.capLevel(input.preferredLevel ?? 'L2');
    const s2Result = await this.slowReasoning.synthesize({
      requestId: `s2_${++this.s2Seq}_${now}`,
      sessionId: this.sessionId,
      scenarioId: this.plugin.scenarioId,
      contextVersion: this.state.getContextVersion(),
      timestamp: now,
      triggerKind: input.question ? 'live_qa' : 'manual_help',
      requestedLevel,
      activeGoal: targetCtx.goal,
      activeChapterId: targetCtx.chapterId,
      activeChapterTitle: targetCtx.chapterTitle,
      questionText: input.question,
      missingPoints: missingPoints.map(({ id, label }) => ({ id, label })),
      recentSegments: this.context.getRecentSegments(6),
      retrievedEvidence: retrieved.map((r) => r.evidence),
      constraints: targetCtx.constraints,
      forbiddenClaims: targetCtx.forbiddenClaims,
      basedOnSegmentId: this.context.getLastSegmentId(),
    });

    const telemetry = this.state.recordTelemetry(
      'system2',
      s2Result.latencyMs,
      s2Result.usage,
      s2Result.backend,
      now,
    );
    this.send({ type: 'system2.candidate', payload: s2Result });
    this.send({ type: 'telemetry.updated', payload: telemetry });

    if (!s2Result.candidate) {
      const outcome = this.controller.evaluateCandidates({
        sessionId: this.sessionId,
        state: this.state,
        context: this.context,
        candidates: [],
        signals: {
          silenceMs: 0,
          semanticGap: false,
          drift: false,
          openQuestion: Boolean(input.question),
          manualHelp: true,
          recovery: false,
        },
        now,
      });
      this.send({ type: 'controller.decision', payload: outcome.decision });
      this.emitStateAndProjection(now);
      return outcome.decision;
    }

    this.state.upsertCandidate(s2Result.candidate, now);
    const outcome = this.controller.evaluateCandidates({
      sessionId: this.sessionId,
      state: this.state,
      context: this.context,
      candidates: [s2Result.candidate],
      signals: {
        silenceMs: 0,
        semanticGap: true,
        drift: false,
        openQuestion: Boolean(input.question),
        manualHelp: true,
        recovery: false,
      },
      now,
    });
    this.dispatchControllerOutcome(outcome, now);
    this.emitStateAndProjection(now);
    return outcome.decision;
  }

  setChapter(chapterId: string): void {
    const now = this.clock.now();
    const info = this.plugin.onChapterChange?.(chapterId, now);
    this.context.updateChapter(chapterId, info?.chapterTitle, now);
    this.state.setChapter(chapterId, info?.chapterTitle, now, info?.contextBumped ?? true);
    const withdrawal = this.controller.checkWithdrawals({
      sessionId: this.sessionId,
      state: this.state,
      context: this.context,
      signals: {
        silenceMs: 0,
        semanticGap: false,
        drift: false,
        openQuestion: false,
        manualHelp: false,
        recovery: false,
      },
      now,
    });
    if (withdrawal) this.dispatchWithdrawalIfAny(withdrawal, now);

    const evt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'chapter.change',
      timestamp: now,
      source: 'user',
      payload: { chapterId, chapterTitle: info?.chapterTitle },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send({ type: 'cognitive.event', payload: evt });
    this.emitStateAndProjection(now);
  }

  invalidateContextVersion(): number {
    const now = this.clock.now();
    const nextVersion = this.state.bumpContextVersion(now);
    this.context.taskContext.contextVersion = nextVersion;
    this.context.taskContext.updatedAt = now;
    const withdrawal = this.controller.checkWithdrawals({
      sessionId: this.sessionId,
      state: this.state,
      context: this.context,
      signals: {
        silenceMs: 0,
        semanticGap: false,
        drift: false,
        openQuestion: false,
        manualHelp: false,
        recovery: false,
      },
      now,
    });
    if (withdrawal) this.dispatchWithdrawalIfAny(withdrawal, now);
    const evt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'context.updated',
      timestamp: now,
      source: 'user',
      payload: { contextVersion: nextVersion },
      confidence: 1,
      contextVersion: nextVersion,
    });
    this.send({ type: 'cognitive.event', payload: evt });
    this.emitStateAndProjection(now);
    return nextVersion;
  }

  pause(): void {
    const now = this.clock.now();
    this.context.session.status = 'paused';
    this.state.setSessionStatus('paused', now);
    this.send({ type: 'session.state', payload: { session: { ...this.context.session }, serverTime: now } });
    this.emitStateAndProjection(now);
  }

  resume(): void {
    const now = this.clock.now();
    this.context.session.status = 'active';
    this.state.setSessionStatus('active', now);
    this.send({ type: 'session.state', payload: { session: { ...this.context.session }, serverTime: now } });
    this.emitStateAndProjection(now);
  }

  setSilentMode(silentMode: boolean): void {
    const now = this.clock.now();
    this.context.session.silentMode = silentMode;
    this.state.setSilentMode(silentMode, now);
    if (silentMode && this.state.getActiveIntervention()) {
      const active = this.state.clearActiveIntervention('user_dismissed', now, false);
      if (active) {
        const decision: ControllerDecision = {
          decisionId: `dec_silent_${now}`,
          sessionId: this.sessionId,
          timestamp: now,
          contextVersion: this.state.getContextVersion(),
          selectedAction: 'withdraw',
          level: 'L0',
          candidateId: active.candidateId,
          interventionId: active.interventionId,
          intervention: active,
          withdrawalReason: 'user_dismissed',
          reason: 'Silent mode toggled on by user.',
          trace: {
            evaluatedAt: now,
            contextVersion: this.state.getContextVersion(),
            groundedChecked: true,
            evidenceCount: active.evidenceIds.length,
            cooldownRemainingMs: this.state.getCooldownRemainingMs(now),
            ceilingLevel: this.state.getMaxInterventionLevel(),
            silentMode: true,
            paused: this.state.getSessionStatus() === 'paused',
            signalsEvaluated: {
              silenceMs: 0,
              semanticGap: false,
              drift: false,
              openQuestion: false,
              manualHelp: false,
              recovery: false,
            },
            rulesApplied: ['silent_mode'],
          },
        };
        this.send({ type: 'controller.decision', payload: decision });
        this.send({
          type: 'intervention.withdrawn',
          payload: {
            sessionId: this.sessionId,
            interventionId: active.interventionId,
            candidateId: active.candidateId,
            reason: 'user_dismissed',
            decision,
            withdrawnAt: now,
          },
        });
      }
    }
    this.send({ type: 'session.state', payload: { session: { ...this.context.session }, serverTime: now } });
    this.emitStateAndProjection(now);
  }

  setCeiling(maxLevel: InterventionLevel): void {
    const now = this.clock.now();
    this.context.session.maxInterventionLevel = maxLevel;
    this.state.setMaxInterventionLevel(maxLevel, now);
    this.send({ type: 'session.state', payload: { session: { ...this.context.session }, serverTime: now } });
    this.emitStateAndProjection(now);
  }

  setViewMode(viewMode: ViewMode): void {
    const now = this.clock.now();
    this.context.session.viewMode = viewMode;
    this.send({ type: 'session.state', payload: { session: { ...this.context.session }, serverTime: now } });
    this.emitStateAndProjection(now);
  }

  dismissIntervention(input: { interventionId?: string; candidateId?: string; reason?: string }): ControllerDecision {
    const now = this.clock.now();
    const res = this.controller.dismiss({
      sessionId: this.sessionId,
      state: this.state,
      interventionId: input.interventionId,
      candidateId: input.candidateId,
      reason: input.reason,
      now,
    });
    if (res.withdrawn) {
      this.send({ type: 'controller.decision', payload: res.decision });
      this.send({
        type: 'intervention.withdrawn',
        payload: {
          sessionId: this.sessionId,
          interventionId: res.withdrawn.interventionId,
          candidateId: res.withdrawn.candidateId,
          reason: 'user_dismissed',
          decision: res.decision,
          withdrawnAt: now,
        },
      });
      this.plugin.onInterventionDismissed?.(res.withdrawn);
    } else {
      this.send({ type: 'controller.decision', payload: res.decision });
    }
    this.emitStateAndProjection(now);
    return res.decision;
  }

  recordFeedback(interventionId: string, feedback: InterventionFeedback): void {
    const now = this.clock.now();
    this.state.setInterventionFeedback(interventionId, feedback, now);
    const evt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'user.feedback',
      timestamp: now,
      source: 'user',
      payload: { interventionId, feedback },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send({ type: 'cognitive.event', payload: evt });
  }

  buildReflection(lambda = 2): TReflection {
    const now = this.clock.now();
    const stateSnap = this.state.snapshot({
      recentObservations: this.context.getRecentObservations(),
      recentSegments: this.context.getRecentSegments(),
      now,
    });
    return this.plugin.buildReflection({
      session: { ...this.context.session },
      state: stateSnap,
      events: this.eventBus.getEvents(this.sessionId),
      decisions: this.controller.getDecisions(),
      interventions: this.state.getInterventionHistory(),
      observations: this.context.getAllObservations(),
      segments: this.context.getAllSegments(),
      evidence: this.context.getAllEvidence(),
      lambda,
      now,
    });
  }

  end(lambda = 2): { outcome: Outcome; reflection: TReflection; endedAt: number; durationMs: number } {
    const now = this.clock.now();
    this.inFlightAbort?.abort();
    this.context.session.status = 'ended';
    this.context.session.endedAt = now;
    this.state.setSessionStatus('ended', now);

    const endEvt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'session.lifecycle',
      timestamp: now,
      source: 'runtime',
      payload: { action: 'ended' },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send({ type: 'cognitive.event', payload: endEvt });

    const reflection = this.buildReflection(lambda) as TReflection & {
      diagnosis?: { coverageRatio?: number; overallSummary?: string };
      utility?: {
        netUtilityScore: number;
        helpfulCount: number;
        distractingCount: number;
        lambda: number;
      };
    };

    const durationMs = Math.max(0, now - this.context.session.startedAt);
    const outcome: Outcome = {
      outcomeId: `out_${this.sessionId}_${now}`,
      sessionId: this.sessionId,
      scenarioId: this.plugin.scenarioId,
      completedAt: now,
      durationMs,
      utilityScore: reflection.utility?.netUtilityScore ?? 0,
      helpfulCount: reflection.utility?.helpfulCount ?? 0,
      interruptionCount: reflection.utility?.distractingCount ?? 0,
      lambda: reflection.utility?.lambda ?? lambda,
      coverageRatio: reflection.diagnosis?.coverageRatio ?? 1,
      summary: reflection.diagnosis?.overallSummary ?? 'Session completed.',
      telemetry: this.state.getTelemetry(),
    };

    return { outcome, reflection, endedAt: now, durationMs };
  }

  wipe(): { wipedAt: number; deletedMemoryCount: number } {
    const now = this.clock.now();
    this.inFlightAbort?.abort();
    this.context.wipeEphemeralData();
    this.eventBus.clearSession(this.sessionId);
    const deletedMemoryCount = this.memoryStore.wipeSession(this.sessionId);
    return { wipedAt: now, deletedMemoryCount };
  }
}
