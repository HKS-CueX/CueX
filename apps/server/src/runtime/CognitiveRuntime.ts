import { randomUUID } from 'node:crypto';
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
  type UtcIso8601,
  type ViewMode,
} from '@cuex/protocol';
import type { PipelineStage, PipelineTracker } from '../pipeline';
import { ContextStore } from './ContextStore';
import { CognitiveEventBus } from './EventBus';
import { InterventionController, type ControllerSignalContext } from './InterventionController';
import type { MemoryStore } from './MemoryStore';
import { SharedCognitiveStateStore } from './SharedCognitiveStateStore';
import { isoToMs, msToIso } from './time';
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
  userId?: string;
  tenantId?: string;
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
  pipeline?: PipelineTracker;
  emitMessage?: (msg: ServerMessage) => void;
}

/**
 * Domain-agnostic Cognitive Runtime Session Coordinator.
 * Wires EventBus -> ContextStore -> SharedCognitiveStateStore -> S1/Retrieval/S2 -> InterventionController
 * with EventEnvelope correlation, monotonic serverSeq, and privacy/isolation scoping.
 */
export class CognitiveRuntimeSession<TState = Record<string, unknown>, TReflection = unknown> {
  readonly sessionId: string;
  readonly userId?: string;
  readonly tenantId?: string;
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
  private readonly pipeline?: PipelineTracker;
  private readonly emitMessage?: (msg: ServerMessage) => void;
  private readonly asrStatus: AsrCapabilityStatus;

  private s2Seq = 0;
  private inFlightAbort?: AbortController;
  private lastEvaluatedSilenceSegId?: string;

  constructor(opts: CognitiveRuntimeSessionOptions<TState, TReflection>) {
    this.sessionId = opts.sessionId;
    this.userId = opts.userId;
    this.tenantId = opts.tenantId;
    this.plugin = opts.plugin;
    this.fastDecision = opts.fastDecision;
    this.slowReasoning = opts.slowReasoning;
    this.retrieval = opts.retrieval;
    this.controller = opts.controller;
    this.memoryStore = opts.memoryStore;
    this.clock = opts.clock ?? systemClock;
    this.pipeline = opts.pipeline;
    this.emitMessage = opts.emitMessage;
    this.asrStatus = opts.asrStatus;

    const nowMs = this.clock.now();
    const startedIso = msToIso(nowMs);
    const session: Session = {
      sessionId: opts.sessionId,
      ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
      ...(opts.userId ? { userId: opts.userId } : {}),
      scenarioId: opts.plugin.scenarioId,
      status: 'active',
      mode: opts.mode,
      viewMode: opts.viewMode,
      startedAt: startedIso,
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
      updatedAt: startedIso,
    };

    const confirmedMemories = opts.memoryStore.getConfirmedForScenario(
      opts.plugin.scenarioId,
      opts.userId,
    );

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
      asrProvider: opts.asrStatus.backend,
      now: nowMs,
    });

    const correlationId = randomUUID();
    const startEvt = this.eventBus.emit({
      sessionId: opts.sessionId,
      eventType: 'session.lifecycle',
      timestamp: nowMs,
      source: 'runtime',
      payload: { action: 'started', mode: opts.mode },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send({ type: 'cognitive.event', payload: startEvt }, {
      stage: 'ingestion',
      correlationId,
      occurredAt: startedIso,
      persistCategory: 'cognitive',
    });
  }

  private send(
    msg: ServerMessage,
    meta?: {
      stage?: PipelineStage;
      correlationId?: string;
      causationId?: string;
      occurredAt?: UtcIso8601;
      persistCategory?: 'ws_server' | 'cognitive';
    },
  ): void {
    if (!this.pipeline) {
      this.emitMessage?.(msg);
      return;
    }
    const tracked = this.pipeline.emitEnvelope({
      stage: meta?.stage ?? 'delivery',
      eventType: msg.type,
      producer: 'cuex-runtime',
      payload: msg.payload,
      sessionId: this.sessionId,
      tenantId: this.tenantId,
      userId: this.userId,
      correlationId: meta?.correlationId ?? msg.correlationId,
      causationId: meta?.causationId,
      occurredAt: meta?.occurredAt,
      persistCategory: meta?.persistCategory ?? 'ws_server',
    });
    const enriched: ServerMessage = {
      ...msg,
      serverSeq: tracked.serverSeq,
      correlationId: tracked.envelope.correlationId,
      envelope: tracked.envelopeMeta,
    } as ServerMessage;
    this.emitMessage?.(enriched);
  }

  private emitStateAndProjection(nowMs: number, correlationId?: string): void {
    const nowIso = msToIso(nowMs);
    const scenarioState = this.plugin.getProjection(
      this.state.snapshot({
        recentObservations: this.context.getRecentObservations(),
        recentSegments: this.context.getRecentSegments(),
        now: nowMs,
      }),
      nowMs,
    ) as Record<string, unknown>;

    const fullSnapshot = this.state.snapshot({
      recentObservations: this.context.getRecentObservations(),
      recentSegments: this.context.getRecentSegments(),
      scenarioState,
      now: nowMs,
    });
    this.send(
      { type: 'cognitive.state', payload: fullSnapshot },
      { stage: 'delivery', correlationId, occurredAt: nowIso },
    );
    if (this.plugin.scenarioId === 'presentation') {
      this.send(
        {
          type: 'presentation.progress',
          payload: scenarioState as never,
        },
        { stage: 'delivery', correlationId, occurredAt: nowIso },
      );
    }
  }

  private dispatchWithdrawalIfAny(
    decision: ControllerDecision | null,
    nowMs: number,
    correlationId?: string,
  ): boolean {
    if (!decision || decision.selectedAction !== 'withdraw' || !decision.intervention) return false;
    const nowIso = msToIso(nowMs);
    this.send(
      { type: 'controller.decision', payload: decision },
      { stage: 'controller', correlationId, occurredAt: nowIso },
    );
    this.send(
      {
        type: 'intervention.withdrawn',
        payload: {
          sessionId: this.sessionId,
          interventionId: decision.intervention.interventionId,
          candidateId: decision.candidateId,
          reason: decision.withdrawalReason ?? 'user_recovered',
          decision,
          withdrawnAt: nowIso,
        },
      },
      { stage: 'delivery', correlationId, occurredAt: nowIso },
    );
    this.plugin.onInterventionWithdrawn?.(
      decision.intervention,
      decision.withdrawalReason ?? 'user_recovered',
    );
    const evt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'intervention.withdrawn',
      timestamp: nowMs,
      source: 'controller',
      payload: {
        interventionId: decision.intervention.interventionId,
        reason: decision.withdrawalReason,
      },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send(
      { type: 'cognitive.event', payload: evt },
      { stage: 'event_bus', correlationId, occurredAt: nowIso, persistCategory: 'cognitive' },
    );
    return true;
  }

  private dispatchControllerOutcome(
    outcome: ReturnType<InterventionController['evaluateCandidates']>,
    nowMs: number,
    correlationId?: string,
  ): void {
    const nowIso = msToIso(nowMs);
    if (outcome.supersededDecision && outcome.supersededWithdrawn) {
      this.dispatchWithdrawalIfAny(outcome.supersededDecision, nowMs, correlationId);
    }
    this.send(
      { type: 'controller.decision', payload: outcome.decision },
      { stage: 'controller', correlationId, occurredAt: nowIso },
    );
    if (outcome.shown) {
      this.send(
        {
          type: 'intervention.shown',
          payload: {
            sessionId: this.sessionId,
            intervention: outcome.shown,
            decision: outcome.decision,
          },
        },
        { stage: 'delivery', correlationId, occurredAt: nowIso },
      );
      this.plugin.onInterventionShown?.(outcome.shown);
      const evt = this.eventBus.emit({
        sessionId: this.sessionId,
        eventType: 'intervention.shown',
        timestamp: nowMs,
        source: 'controller',
        payload: {
          interventionId: outcome.shown.interventionId,
          level: outcome.shown.level,
          grounded: outcome.shown.grounded,
        },
        confidence: 1,
        contextVersion: this.state.getContextVersion(),
      });
      this.send(
        { type: 'cognitive.event', payload: evt },
        { stage: 'event_bus', correlationId, occurredAt: nowIso, persistCategory: 'cognitive' },
      );
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
    correlationId?: string;
    audioDurationMs?: number;
  }): Promise<{
    segment: ReturnType<ContextStore['recordSegment']>;
    decision?: ControllerDecision;
  }> {
    const nowMs = input.endMs ?? this.clock.now();
    const nowIso = msToIso(nowMs);
    const correlationId = input.correlationId ?? randomUUID();
    const trimmed = input.text.trim();
    if (!trimmed) {
      throw new Error('Empty speech text cannot be ingested.');
    }

    const segment = this.context.recordSegment({
      speaker: input.speaker ?? 'presenter',
      text: trimmed,
      isFinal: input.isFinal,
      confidence: input.confidence ?? 0.94,
      startMs: input.startMs ?? Math.max(nowMs - 900, this.context.getStartedAtMs()),
      endMs: nowMs,
      source: input.source ?? 'text_simulation',
      chapterId: this.context.taskContext.activeChapterId,
    });

    if (input.audioDurationMs && input.audioDurationMs > 0) {
      this.state.recordAsrMetrics({
        provider: segment.source ?? this.asrStatus.backend,
        durationMs: input.audioDurationMs,
        nowMs,
      });
    }

    this.send(
      {
        type: 'asr.transcript',
        payload: {
          segment,
          asrStatus: this.asrStatus,
        },
      },
      { stage: 'asr', correlationId, occurredAt: nowIso },
    );

    const speechEvt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: segment.isFinal ? 'speech.final' : 'speech.partial',
      timestamp: nowMs,
      source: segment.source ?? 'text_simulation',
      payload: {
        segmentId: segment.segmentId,
        speaker: segment.speaker,
        text: segment.text,
      },
      confidence: segment.confidence,
      contextVersion: this.state.getContextVersion(),
    });
    this.send(
      { type: 'cognitive.event', payload: speechEvt },
      { stage: 'event_bus', correlationId, occurredAt: nowIso, persistCategory: 'cognitive' },
    );

    const pluginResult = this.plugin.onSegment?.(segment, nowMs, this.state.getContextVersion()) ?? {};
    if (pluginResult.chapterChangedTo) {
      this.context.updateChapter(
        pluginResult.chapterChangedTo,
        pluginResult.chapterChangedTitle,
        nowMs,
      );
      this.state.setChapter(
        pluginResult.chapterChangedTo,
        pluginResult.chapterChangedTitle,
        nowMs,
        false,
      );
      if (pluginResult.contextBumped) {
        this.state.bumpContextVersion(nowMs);
      }
      const chEvt = this.eventBus.emit({
        sessionId: this.sessionId,
        eventType: 'chapter.change',
        timestamp: nowMs,
        source: 'scenario_plugin',
        payload: {
          chapterId: pluginResult.chapterChangedTo,
          title: pluginResult.chapterChangedTitle,
        },
        confidence: 1,
        contextVersion: this.state.getContextVersion(),
      });
      this.send(
        { type: 'cognitive.event', payload: chEvt },
        { stage: 'context_store', correlationId, occurredAt: nowIso, persistCategory: 'cognitive' },
      );
    }

    if (pluginResult.extraObservations?.length) {
      for (const obs of pluginResult.extraObservations) {
        this.context.addObservation(obs);
      }
    }

    // Real/remote System 1 models should evaluate finalized speech endpoints (`isFinal: true`) rather
    // than blocking behind every ~450ms partial transcript, while still enabling instant local captions
    // and deterministic self-recovery/chapter-change withdrawal on partials.
    if (!segment.isFinal && this.fastDecision.mode !== 'local_fallback') {
      const activeIv = this.state.getActiveIntervention();
      if (activeIv) {
        const partialWithdraw = this.controller.checkWithdrawals({
          sessionId: this.sessionId,
          state: this.state,
          context: this.context,
          signals: {
            silenceMs: 0,
            semanticGap: false,
            drift: false,
            openQuestion: false,
            manualHelp: false,
            recovery: Boolean(pluginResult.directRecoveryDetected),
            topicChanged: Boolean(pluginResult.newlyCoveredPointIds?.length || pluginResult.chapterChangedTo),
            coveredPointIds: pluginResult.newlyCoveredPointIds,
          },
          now: nowMs,
        });
        if (partialWithdraw) {
          this.dispatchWithdrawalIfAny(partialWithdraw, nowMs, correlationId);
          this.emitStateAndProjection(nowMs, correlationId);
          return { segment, decision: partialWithdraw };
        }
      }
      this.emitStateAndProjection(nowMs, correlationId);
      return { segment };
    }

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
          timestamp: nowIso,
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

    const postS1NowMs = this.clock.now();
    const postS1NowIso = msToIso(postS1NowMs);
    this.pipeline?.recordStageDuration('fast_decision', verdict.latencyMs, postS1NowIso);
    const verdictUsage = verdict.usage ? { ...verdict.usage, correlationId } : undefined;
    const verdictWithCorr = verdictUsage ? { ...verdict, usage: verdictUsage } : verdict;
    const telemetryAfterS1 = this.state.recordTelemetry(
      'system1',
      verdict.latencyMs,
      verdictUsage,
      verdict.backend,
      postS1NowMs,
    );
    this.send(
      { type: 'system1.verdict', payload: verdictWithCorr },
      { stage: 'fast_decision', correlationId, occurredAt: postS1NowIso },
    );
    this.send(
      { type: 'telemetry.updated', payload: telemetryAfterS1 },
      { stage: 'fast_decision', correlationId, occurredAt: postS1NowIso },
    );

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
    this.state.setAttentionAndGaps(attentionSignal, gapLabels, postS1NowMs);

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
      now: postS1NowMs,
    });
    if (withdrawnDecision) {
      this.dispatchWithdrawalIfAny(withdrawnDecision, postS1NowMs, correlationId);
      this.emitStateAndProjection(postS1NowMs, correlationId);
      return { segment, decision: withdrawnDecision };
    }

    if (
      verdict.interventionNeed === 'none' &&
      !effectiveQuestion &&
      !effectiveDrift &&
      !pluginResult.preferredTriggerKind
    ) {
      this.emitStateAndProjection(postS1NowMs, correlationId);
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

    const retrievalStart = performance.now();
    const retrieved = await this.retrieval.search(queryText, this.context.getVerifiedActiveEvidence(), {
      topK: 3,
      minScore: 0.2,
    });
    this.pipeline?.recordStageDuration('retrieval', performance.now() - retrievalStart, postS1NowIso);

    if (effectiveQuestion) {
      this.plugin.onQuestionEvidence?.(segment.segmentId, effectiveQuestion, retrieved);
    }

    const preS2NowMs = this.clock.now();
    const preS2NowIso = msToIso(preS2NowMs);
    let s2Result;
    try {
      s2Result = await this.slowReasoning.synthesize(
        {
          requestId: `s2_${++this.s2Seq}_${preS2NowMs}`,
          sessionId: this.sessionId,
          scenarioId: this.plugin.scenarioId,
          contextVersion: this.state.getContextVersion(),
          timestamp: preS2NowIso,
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

    const postS2NowMs = this.clock.now();
    const postS2NowIso = msToIso(postS2NowMs);
    this.pipeline?.recordStageDuration('slow_reasoning', s2Result.latencyMs, postS2NowIso);
    const anchoredCandidate = s2Result.candidate
      ? this.reanchorCandidateLifetime(s2Result.candidate, preS2NowMs, postS2NowMs)
      : undefined;
    const s2Usage = s2Result.usage ? { ...s2Result.usage, correlationId } : undefined;
    const s2ResultWithCorr = {
      ...s2Result,
      ...(anchoredCandidate ? { candidate: anchoredCandidate } : {}),
      ...(s2Usage ? { usage: s2Usage } : {}),
    };
    const telemetryAfterS2 = this.state.recordTelemetry(
      'system2',
      s2Result.latencyMs,
      s2Usage,
      s2Result.backend,
      postS2NowMs,
    );
    this.send(
      { type: 'system2.candidate', payload: s2ResultWithCorr },
      { stage: 'slow_reasoning', correlationId, occurredAt: postS2NowIso },
    );
    this.send(
      { type: 'telemetry.updated', payload: telemetryAfterS2 },
      { stage: 'slow_reasoning', correlationId, occurredAt: postS2NowIso },
    );

    let finalDecision: ControllerDecision | undefined;
    if (anchoredCandidate) {
      this.state.upsertCandidate(anchoredCandidate, postS2NowMs);
      this.plugin.onCandidatePrepared?.(anchoredCandidate);
      const outcome = this.controller.evaluateCandidates({
        sessionId: this.sessionId,
        state: this.state,
        context: this.context,
        candidates: [anchoredCandidate, ...this.state.getPendingCandidates()],
        signals,
        now: postS2NowMs,
      });
      this.dispatchControllerOutcome(outcome, postS2NowMs, correlationId);
      finalDecision = outcome.decision;
      this.lastEvaluatedSilenceSegId = segment.segmentId;
    }

    this.emitStateAndProjection(postS2NowMs, correlationId);
    return { segment, ...(finalDecision ? { decision: finalDecision } : {}) };
  }

  /**
   * Evaluates a runtime tick (TTL expiry, chapter pace/overtime check, or post-silence gap check).
   * Strictly event-bounded: never executes unconditional per-second LLM polling on idle ticks.
   */
  async processTick(silenceDurationMs?: number): Promise<ControllerDecision | null> {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    const correlationId = randomUUID();
    const computedSilence = silenceDurationMs ?? this.context.getSilenceDurationMs(nowMs);

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
      now: nowMs,
    });
    if (withdrawal) {
      this.dispatchWithdrawalIfAny(withdrawal, nowMs, correlationId);
      this.emitStateAndProjection(nowMs, correlationId);
      return withdrawal;
    }

    const pluginTick =
      this.plugin.onTick?.(nowMs, this.state.getContextVersion(), this.context.getLastSegmentId()) ?? {};
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

    if (!hasExplicitTrigger && !isExplicitCallerTick && !firstPauseCheckForSegment) {
      this.emitStateAndProjection(nowMs, correlationId);
      return null;
    }
    this.lastEvaluatedSilenceSegId = lastSegId;

    const tickEvt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'silence.tick',
      timestamp: nowMs,
      source: 'runtime',
      payload: { silenceDurationMs: computedSilence },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send(
      { type: 'cognitive.event', payload: tickEvt },
      { stage: 'event_bus', correlationId, occurredAt: nowIso, persistCategory: 'cognitive' },
    );

    const targetCtx = this.plugin.getTargetContextSnapshot();
    const expectedPoints = this.plugin.getExpectedPoints();
    const needsFastEval =
      this.fastDecision.mode === 'local_fallback' ||
      isExplicitCallerTick ||
      firstPauseCheckForSegment;

    let verdict;
    if (needsFastEval) {
      verdict = await this.fastDecision.evaluate({
        sessionId: this.sessionId,
        scenarioId: this.plugin.scenarioId,
        contextVersion: this.state.getContextVersion(),
        timestamp: nowIso,
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
      const tickVerdictUsage = verdict.usage ? { ...verdict.usage, correlationId } : undefined;
      const tickVerdictWithCorr = tickVerdictUsage ? { ...verdict, usage: tickVerdictUsage } : verdict;
      const telemetry = this.state.recordTelemetry(
        'system1',
        verdict.latencyMs,
        tickVerdictUsage,
        verdict.backend,
        nowMs,
      );
      this.send(
        { type: 'system1.verdict', payload: tickVerdictWithCorr },
        { stage: 'fast_decision', correlationId, occurredAt: nowIso },
      );
      this.send(
        { type: 'telemetry.updated', payload: telemetry },
        { stage: 'fast_decision', correlationId, occurredAt: nowIso },
      );
    }

    const candidateList: Candidate[] = [...pendingCandidates];
    if (pluginTick.triggerCandidate) {
      const ttl = 12_000;
      const paceCandidate: Candidate = {
        candidateId: `cand_tick_${nowMs}`,
        sessionId: this.sessionId,
        level: this.capLevel(pluginTick.triggerCandidate.requestedLevel),
        title: pluginTick.triggerCandidate.title,
        cueText: pluginTick.triggerCandidate.cueText,
        ...(pluginTick.triggerCandidate.bullets ? { bullets: pluginTick.triggerCandidate.bullets } : {}),
        priority: pluginTick.triggerCandidate.priority,
        ttlMs: ttl,
        expiresAt: msToIso(nowMs + ttl),
        contextVersion: this.state.getContextVersion(),
        evidenceIds: pluginTick.triggerCandidate.evidenceIds ?? [],
        basedOnSegmentId: pluginTick.triggerCandidate.basedOnSegmentId,
        status: 'pending',
        createdAt: nowIso,
        kind: pluginTick.triggerCandidate.kind === 'pace_overtime' ? 'pace_nudge' : 'omission_cue',
        grounded: true,
        triggerReason: pluginTick.triggerCandidate.reason,
        targetChapterId: pluginTick.triggerCandidate.targetChapterId,
        targetKeyPointId: pluginTick.triggerCandidate.targetKeyPointId,
      };
      this.state.upsertCandidate(paceCandidate, nowMs);
      candidateList.unshift(paceCandidate);
    }

    if (candidateList.length === 0) {
      if (!verdict) {
        this.emitStateAndProjection(nowMs, correlationId);
        return null;
      }
      const hasSemanticTrigger =
        verdict.signals.semanticOmission || verdict.signals.topicDrift || verdict.signals.openQuestion;
      const probeCandidates: Candidate[] = hasSemanticTrigger
        ? []
        : [
            {
              candidateId: `cand_probe_pause_${nowMs}`,
              sessionId: this.sessionId,
              level: 'L1',
              title: 'Pause Probe',
              cueText: 'Continue when ready.',
              priority: 10,
              ttlMs: 1_000,
              expiresAt: msToIso(nowMs + 1_000),
              contextVersion: this.state.getContextVersion(),
              evidenceIds: [],
              basedOnSegmentId: lastSegId,
              status: 'pending',
              kind: 'omission_cue',
              grounded: true,
            },
          ];
      const decision = this.controller.evaluateCandidates({
        sessionId: this.sessionId,
        state: this.state,
        context: this.context,
        candidates: probeCandidates,
        signals: {
          verdict,
          silenceMs: computedSilence,
          semanticGap: verdict.signals.semanticOmission,
          drift: verdict.signals.topicDrift,
          openQuestion: verdict.signals.openQuestion,
          manualHelp: false,
          recovery: verdict.recoveryDetected,
        },
        now: nowMs,
      });
      this.send(
        { type: 'controller.decision', payload: decision.decision },
        { stage: 'controller', correlationId, occurredAt: nowIso },
      );
      this.emitStateAndProjection(nowMs, correlationId);
      return decision.decision;
    }

    const outcome = this.controller.evaluateCandidates({
      sessionId: this.sessionId,
      state: this.state,
      context: this.context,
      candidates: candidateList,
      signals: {
        ...(verdict ? { verdict } : {}),
        silenceMs: computedSilence,
        semanticGap: verdict ? verdict.signals.semanticOmission : Boolean(pluginTick.triggerCandidate),
        drift: verdict ? verdict.signals.topicDrift : false,
        openQuestion: verdict ? verdict.signals.openQuestion : false,
        manualHelp: false,
        recovery: verdict ? verdict.recoveryDetected : false,
      },
      now: nowMs,
    });
    this.dispatchControllerOutcome(outcome, nowMs, correlationId);
    this.emitStateAndProjection(nowMs, correlationId);
    return outcome.decision;
  }

  /**
   * Direct candidate evaluation entry point through Controller (never bypasses grounding/TTL/version gates).
   */
  submitExternalCandidate(
    candidate: Candidate,
    signals: Partial<ControllerSignalContext> = {},
  ): ReturnType<InterventionController['evaluateCandidates']> {
    const nowMs = this.clock.now();
    this.state.upsertCandidate(candidate, nowMs);
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
      now: nowMs,
    });
    this.dispatchControllerOutcome(outcome, nowMs);
    this.emitStateAndProjection(nowMs);
    return outcome;
  }

  async requestManualHelp(input: {
    preferredLevel?: InterventionLevel;
    question?: string;
    correlationId?: string;
  }): Promise<ControllerDecision> {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    const correlationId = input.correlationId ?? randomUUID();

    const reqEvt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'user.manual_help',
      timestamp: nowMs,
      source: 'user',
      payload: { preferredLevel: input.preferredLevel, question: input.question },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send(
      { type: 'cognitive.event', payload: reqEvt },
      { stage: 'ingestion', correlationId, occurredAt: nowIso, persistCategory: 'cognitive' },
    );

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
      requestId: `s2_${++this.s2Seq}_${nowMs}`,
      sessionId: this.sessionId,
      scenarioId: this.plugin.scenarioId,
      contextVersion: this.state.getContextVersion(),
      timestamp: nowIso,
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

    const postS2NowMs = this.clock.now();
    const postS2NowIso = msToIso(postS2NowMs);
    const anchoredCandidate = s2Result.candidate
      ? this.reanchorCandidateLifetime(s2Result.candidate, nowMs, postS2NowMs)
      : undefined;
    const manualS2Usage = s2Result.usage ? { ...s2Result.usage, correlationId } : undefined;
    const manualS2WithCorr = {
      ...s2Result,
      ...(anchoredCandidate ? { candidate: anchoredCandidate } : {}),
      ...(manualS2Usage ? { usage: manualS2Usage } : {}),
    };
    const telemetry = this.state.recordTelemetry(
      'system2',
      s2Result.latencyMs,
      manualS2Usage,
      s2Result.backend,
      postS2NowMs,
    );
    this.send(
      { type: 'system2.candidate', payload: manualS2WithCorr },
      { stage: 'slow_reasoning', correlationId, occurredAt: postS2NowIso },
    );
    this.send(
      { type: 'telemetry.updated', payload: telemetry },
      { stage: 'slow_reasoning', correlationId, occurredAt: postS2NowIso },
    );

    if (!anchoredCandidate) {
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
        now: postS2NowMs,
      });
      this.send(
        { type: 'controller.decision', payload: outcome.decision },
        { stage: 'controller', correlationId, occurredAt: postS2NowIso },
      );
      this.emitStateAndProjection(postS2NowMs, correlationId);
      return outcome.decision;
    }

    this.state.upsertCandidate(anchoredCandidate, postS2NowMs);
    const outcome = this.controller.evaluateCandidates({
      sessionId: this.sessionId,
      state: this.state,
      context: this.context,
      candidates: [anchoredCandidate],
      signals: {
        silenceMs: 0,
        semanticGap: true,
        drift: false,
        openQuestion: Boolean(input.question),
        manualHelp: true,
        recovery: false,
      },
      now: postS2NowMs,
    });
    this.dispatchControllerOutcome(outcome, postS2NowMs, correlationId);
    this.emitStateAndProjection(postS2NowMs, correlationId);
    return outcome.decision;
  }

  /**
   * Shifts newly synthesized candidate TTL forward by async System 2 inference latency so a slow
   * remote LLM call never returns an already-expired candidate while preserving ManualClock tests.
   */
  private reanchorCandidateLifetime(
    candidate: Candidate,
    preSynthesisMs: number,
    postSynthesisMs: number,
  ): Candidate {
    const elapsedMs = Math.max(0, postSynthesisMs - preSynthesisMs);
    if (elapsedMs === 0) return candidate;
    const createdMs = isoToMs(candidate.createdAt, preSynthesisMs);
    const expiresMs = isoToMs(candidate.expiresAt, 0);
    if (expiresMs <= createdMs) return candidate;
    const ttlMs = candidate.ttlMs > 0 ? candidate.ttlMs : expiresMs - createdMs;
    return {
      ...candidate,
      createdAt: msToIso(postSynthesisMs),
      expiresAt: msToIso(postSynthesisMs + ttlMs),
    };
  }

  setChapter(chapterId: string, correlationId?: string): void {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    const info = this.plugin.onChapterChange?.(chapterId, nowMs);
    this.context.updateChapter(chapterId, info?.chapterTitle, nowMs);
    this.state.setChapter(chapterId, info?.chapterTitle, nowMs, info?.contextBumped ?? true);
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
      now: nowMs,
    });
    if (withdrawal) this.dispatchWithdrawalIfAny(withdrawal, nowMs, correlationId);

    const evt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'chapter.change',
      timestamp: nowMs,
      source: 'user',
      payload: { chapterId, chapterTitle: info?.chapterTitle },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send(
      { type: 'cognitive.event', payload: evt },
      { stage: 'context_store', correlationId, occurredAt: nowIso, persistCategory: 'cognitive' },
    );
    this.emitStateAndProjection(nowMs, correlationId);
  }

  invalidateContextVersion(correlationId?: string): number {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    const nextVersion = this.state.bumpContextVersion(nowMs);
    this.context.taskContext.contextVersion = nextVersion;
    this.context.taskContext.updatedAt = nowIso;
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
      now: nowMs,
    });
    if (withdrawal) this.dispatchWithdrawalIfAny(withdrawal, nowMs, correlationId);
    const evt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'context.updated',
      timestamp: nowMs,
      source: 'user',
      payload: { contextVersion: nextVersion },
      confidence: 1,
      contextVersion: nextVersion,
    });
    this.send(
      { type: 'cognitive.event', payload: evt },
      { stage: 'context_store', correlationId, occurredAt: nowIso, persistCategory: 'cognitive' },
    );
    this.emitStateAndProjection(nowMs, correlationId);
    return nextVersion;
  }

  pause(correlationId?: string): void {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    this.context.session.status = 'paused';
    this.state.setSessionStatus('paused', nowMs);
    this.send(
      { type: 'session.state', payload: { session: { ...this.context.session }, serverTime: nowIso } },
      { stage: 'delivery', correlationId, occurredAt: nowIso },
    );
    this.emitStateAndProjection(nowMs, correlationId);
  }

  resume(correlationId?: string): void {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    this.context.session.status = 'active';
    this.state.setSessionStatus('active', nowMs);
    this.send(
      { type: 'session.state', payload: { session: { ...this.context.session }, serverTime: nowIso } },
      { stage: 'delivery', correlationId, occurredAt: nowIso },
    );
    this.emitStateAndProjection(nowMs, correlationId);
  }

  setSilentMode(silentMode: boolean, correlationId?: string): void {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    this.context.session.silentMode = silentMode;
    this.state.setSilentMode(silentMode, nowMs);
    if (silentMode && this.state.getActiveIntervention()) {
      const active = this.state.clearActiveIntervention('user_dismissed', nowMs, false);
      if (active) {
        const decision: ControllerDecision = {
          decisionId: `dec_silent_${nowMs}`,
          sessionId: this.sessionId,
          timestamp: nowIso,
          contextVersion: this.state.getContextVersion(),
          selectedAction: 'withdraw',
          level: 'L0',
          candidateId: active.candidateId,
          interventionId: active.interventionId,
          intervention: active,
          withdrawalReason: 'user_dismissed',
          reason: 'Silent mode toggled on by user.',
          trace: {
            evaluatedAt: nowIso,
            contextVersion: this.state.getContextVersion(),
            groundedChecked: true,
            evidenceCount: active.evidenceIds.length,
            cooldownRemainingMs: this.state.getCooldownRemainingMs(nowMs),
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
        this.send(
          { type: 'controller.decision', payload: decision },
          { stage: 'controller', correlationId, occurredAt: nowIso },
        );
        this.send(
          {
            type: 'intervention.withdrawn',
            payload: {
              sessionId: this.sessionId,
              interventionId: active.interventionId,
              candidateId: active.candidateId,
              reason: 'user_dismissed',
              decision,
              withdrawnAt: nowIso,
            },
          },
          { stage: 'delivery', correlationId, occurredAt: nowIso },
        );
      }
    }
    this.send(
      { type: 'session.state', payload: { session: { ...this.context.session }, serverTime: nowIso } },
      { stage: 'delivery', correlationId, occurredAt: nowIso },
    );
    this.emitStateAndProjection(nowMs, correlationId);
  }

  setCeiling(maxLevel: InterventionLevel, correlationId?: string): void {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    this.context.session.maxInterventionLevel = maxLevel;
    this.state.setMaxInterventionLevel(maxLevel, nowMs);
    this.send(
      { type: 'session.state', payload: { session: { ...this.context.session }, serverTime: nowIso } },
      { stage: 'delivery', correlationId, occurredAt: nowIso },
    );
    this.emitStateAndProjection(nowMs, correlationId);
  }

  setViewMode(viewMode: ViewMode, correlationId?: string): void {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    this.context.session.viewMode = viewMode;
    this.send(
      { type: 'session.state', payload: { session: { ...this.context.session }, serverTime: nowIso } },
      { stage: 'delivery', correlationId, occurredAt: nowIso },
    );
    this.emitStateAndProjection(nowMs, correlationId);
  }

  dismissIntervention(
    input: { interventionId?: string; candidateId?: string; reason?: string },
    correlationId?: string,
  ): ControllerDecision {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    const res = this.controller.dismiss({
      sessionId: this.sessionId,
      state: this.state,
      interventionId: input.interventionId,
      candidateId: input.candidateId,
      reason: input.reason,
      now: nowMs,
    });
    if (res.withdrawn) {
      this.send(
        { type: 'controller.decision', payload: res.decision },
        { stage: 'controller', correlationId, occurredAt: nowIso },
      );
      this.send(
        {
          type: 'intervention.withdrawn',
          payload: {
            sessionId: this.sessionId,
            interventionId: res.withdrawn.interventionId,
            candidateId: res.withdrawn.candidateId,
            reason: 'user_dismissed',
            decision: res.decision,
            withdrawnAt: nowIso,
          },
        },
        { stage: 'delivery', correlationId, occurredAt: nowIso },
      );
      this.plugin.onInterventionDismissed?.(res.withdrawn);
    } else {
      this.send(
        { type: 'controller.decision', payload: res.decision },
        { stage: 'controller', correlationId, occurredAt: nowIso },
      );
    }
    this.emitStateAndProjection(nowMs, correlationId);
    return res.decision;
  }

  recordFeedback(interventionId: string, feedback: InterventionFeedback, correlationId?: string): void {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    this.state.setInterventionFeedback(interventionId, feedback, nowMs);
    const evt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'user.feedback',
      timestamp: nowMs,
      source: 'user',
      payload: { interventionId, feedback },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send(
      { type: 'cognitive.event', payload: evt },
      { stage: 'event_bus', correlationId, occurredAt: nowIso, persistCategory: 'cognitive' },
    );
  }

  buildReflection(lambda = 2): TReflection {
    const nowMs = this.clock.now();
    const stateSnap = this.state.snapshot({
      recentObservations: this.context.getRecentObservations(),
      recentSegments: this.context.getRecentSegments(),
      now: nowMs,
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
      now: nowMs,
    });
  }

  /**
   * Used by WS reconnect (?sessionId=&lastSeenSeq=) to withdraw expired cues before state hydration.
   */
  reconcileBeforeReconnect(): void {
    const nowMs = this.clock.now();
    const withdrawal = this.controller.checkWithdrawals({
      sessionId: this.sessionId,
      state: this.state,
      context: this.context,
      signals: {
        silenceMs: this.context.getSilenceDurationMs(nowMs),
        semanticGap: false,
        drift: false,
        openQuestion: false,
        manualHelp: false,
        recovery: false,
      },
      now: nowMs,
    });
    if (withdrawal) {
      this.dispatchWithdrawalIfAny(withdrawal, nowMs);
    }
  }

  end(lambda = 2, correlationId?: string): {
    outcome: Outcome;
    reflection: TReflection;
    endedAt: UtcIso8601;
    durationMs: number;
  } {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    this.inFlightAbort?.abort();
    this.context.session.status = 'ended';
    this.context.session.endedAt = nowIso;
    this.state.setSessionStatus('ended', nowMs);

    const endEvt = this.eventBus.emit({
      sessionId: this.sessionId,
      eventType: 'session.lifecycle',
      timestamp: nowMs,
      source: 'runtime',
      payload: { action: 'ended' },
      confidence: 1,
      contextVersion: this.state.getContextVersion(),
    });
    this.send(
      { type: 'cognitive.event', payload: endEvt },
      { stage: 'event_bus', correlationId, occurredAt: nowIso, persistCategory: 'cognitive' },
    );

    const reflection = this.buildReflection(lambda) as TReflection & {
      diagnosis?: { coverageRatio?: number; overallSummary?: string };
      utility?: {
        netUtilityScore: number;
        helpfulCount: number;
        distractingCount: number;
        lambda: number;
      };
    };

    const durationMs = Math.max(0, nowMs - this.context.getStartedAtMs());
    const outcome: Outcome = {
      outcomeId: `out_${this.sessionId}_${nowMs}`,
      sessionId: this.sessionId,
      scenarioId: this.plugin.scenarioId,
      completedAt: nowIso,
      durationMs,
      utilityScore: reflection.utility?.netUtilityScore ?? 0,
      helpfulCount: reflection.utility?.helpfulCount ?? 0,
      interruptionCount: reflection.utility?.distractingCount ?? 0,
      lambda: reflection.utility?.lambda ?? lambda,
      coverageRatio: reflection.diagnosis?.coverageRatio ?? 1,
      summary: reflection.diagnosis?.overallSummary ?? 'Session completed.',
      telemetry: this.state.getTelemetry(),
    };

    return { outcome, reflection, endedAt: nowIso, durationMs };
  }

  wipe(): { wipedAt: UtcIso8601; deletedMemoryCount: number } {
    const nowMs = this.clock.now();
    const nowIso = msToIso(nowMs);
    this.inFlightAbort?.abort();
    this.context.wipeEphemeralData();
    this.eventBus.clearSession(this.sessionId);
    const deletedMemoryCount = this.memoryStore.wipeSession(this.sessionId, this.userId);
    return { wipedAt: nowIso, deletedMemoryCount };
  }
}
