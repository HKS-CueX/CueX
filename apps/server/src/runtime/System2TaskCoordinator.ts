import type {
  Candidate,
  ControllerDecision,
  ServerMessage,
  SlowReasoningCandidateRequest,
  SlowReasoningCandidateResult,
  SlowReasoningTriggerKind,
  System2Guidance,
  UtcIso8601,
} from '@cuex/protocol';
import type { PipelineStage } from '../pipeline';
import type { ContextStore } from './ContextStore';
import type { ControllerSignalContext, InterventionController } from './InterventionController';
import type { SharedCognitiveStateStore } from './SharedCognitiveStateStore';
import { isoToMs, msToIso } from './time';
import type { RuntimeClock, ScenarioRuntimePlugin, SlowReasoningProvider } from './types';

export type S2StaleCancelReason =
  | 'chapter_changed'
  | 'user_recovered'
  | 'context_changed'
  | 'preempted'
  | 'session_ended';

export interface System2ScheduledTaskInput {
  request: SlowReasoningCandidateRequest;
  signals: ControllerSignalContext;
  turnSeq: number;
  correlationId: string;
}

interface ActiveS2Flight {
  taskId: string;
  input: System2ScheduledTaskInput;
  priority: number;
  abortController: AbortController;
  cancelledAsStale: boolean;
  staleRecorded: boolean;
  promise: Promise<ControllerDecision | undefined>;
}

export interface System2TaskCoordinatorDeps<TState = unknown, TReflection = unknown> {
  sessionId: string;
  clock: RuntimeClock;
  state: SharedCognitiveStateStore;
  context: ContextStore;
  controller: InterventionController;
  plugin: ScenarioRuntimePlugin<TState, TReflection>;
  slowReasoning: SlowReasoningProvider;
  send: (
    msg: ServerMessage,
    meta?: {
      stage?: PipelineStage;
      correlationId?: string;
      causationId?: string;
      occurredAt?: UtcIso8601;
      persistCategory?: 'ws_server' | 'cognitive';
    },
  ) => void;
  onOutcome: (
    outcome: ReturnType<InterventionController['evaluateCandidates']>,
    nowMs: number,
    correlationId: string,
  ) => void;
  onEmitState: (nowMs: number, correlationId: string) => void;
}

function priorityForTrigger(kind: SlowReasoningTriggerKind): number {
  switch (kind) {
    case 'manual_help':
      return 100;
    case 'live_qa':
      return 90;
    case 'omission':
      return 60;
    case 'hesitation':
      return 58;
    case 'drift':
      return 55;
    case 'pace_overtime':
    default:
      return 40;
  }
}

/**
 * 异步 System 2 任务协调器（双向认知黑板的核心并发引擎）。
 * 彻底解耦 System 1 与 System 2 的取消域：
 * 1) S1 现场节拍绝不阻塞等待远程慢思考；
 * 2) 高频连说触发单飞合并防抖（s2Coalesced）；
 * 3) 高优先级 live_qa / manual_help 抢占低优先级遗漏/偏离任务；
 * 4) 说话人自愈、切章或上下文版本变化立即取消过期在途任务并丢弃迟到结果（s2CancelledAsStale）；
 * 5) S2 完成后写入递增 revision 的 System2Guidance 至共享黑板并推送 `system2.guidance` 事件。
 */
export class System2TaskCoordinator<TState = unknown, TReflection = unknown> {
  private inFlight?: ActiveS2Flight;
  private pendingInput?: System2ScheduledTaskInput;
  private disposed = false;
  private staleCutoffTurnSeq = 0;
  private taskSeq = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(private readonly deps: System2TaskCoordinatorDeps<TState, TReflection>) {}

  hasInFlightOrPending(): boolean {
    return Boolean(this.inFlight || this.pendingInput);
  }

  /**
   * 异步调度一次 System 2 深度推理与策略指导合成；返回当前在途/新起任务的可选等待句柄。
   * 在异步模式下调用方可立刻返回，不阻塞 S1。
   */
  schedule(input: System2ScheduledTaskInput): Promise<ControllerDecision | undefined> {
    if (this.disposed) return Promise.resolve(undefined);
    const nowMs = this.deps.clock.now();
    this.deps.state.recordS2Dispatch(nowMs);
    const incomingPriority = priorityForTrigger(input.request.triggerKind);

    if (this.inFlight) {
      const shouldPreempt =
        incomingPriority > this.inFlight.priority ||
        input.request.contextVersion > this.inFlight.input.request.contextVersion;
      if (shouldPreempt) {
        this.markTaskStale(this.inFlight, nowMs);
        this.inFlight = undefined;
        // 若此前积压的低优先级队列也已过时，直接丢弃并计入 stale。
        if (this.pendingInput && priorityForTrigger(this.pendingInput.request.triggerKind) < incomingPriority) {
          this.pendingInput = undefined;
          this.deps.state.recordS2CancelledAsStale(nowMs);
        }
        return this.launch(input, incomingPriority);
      }

      // 同级或更低优先级请求合并到单槽位等待队列，防止连说期间无意义堆叠慢调用。
      this.pendingInput = input;
      this.deps.state.recordS2Coalesced(nowMs);
      return this.inFlight.promise;
    }

    return this.launch(input, incomingPriority);
  }

  /**
   * 当对话自愈（user_recovered）、切章或上下文版本更新时取消在途及排队的过期 System 2 任务。
   */
  cancelStale(reason: S2StaleCancelReason, nowMs = this.deps.clock.now()): void {
    const currentTurn = this.deps.state.getTurnSeq();
    if (reason === 'user_recovered' || reason === 'chapter_changed' || reason === 'context_changed') {
      this.staleCutoffTurnSeq = Math.max(this.staleCutoffTurnSeq, currentTurn);
    }

    if (this.pendingInput) {
      const pendingIsUrgent =
        this.pendingInput.request.triggerKind === 'live_qa' ||
        this.pendingInput.request.triggerKind === 'manual_help';
      if (reason !== 'user_recovered' || !pendingIsUrgent) {
        this.pendingInput = undefined;
        this.deps.state.recordS2CancelledAsStale(nowMs);
      }
    }

    if (this.inFlight) {
      const inFlightIsUrgent =
        this.inFlight.input.request.triggerKind === 'live_qa' ||
        this.inFlight.input.request.triggerKind === 'manual_help';
      if (reason !== 'user_recovered' || !inFlightIsUrgent) {
        this.markTaskStale(this.inFlight, nowMs);
        this.inFlight = undefined;
      }
    }

    this.resolveIdleIfEmpty();
  }

  /** 会话结束或擦除时彻底销毁协调器并中止所有未完成异步任务。 */
  dispose(nowMs = this.deps.clock.now()): void {
    this.disposed = true;
    this.cancelStale('session_ended', nowMs);
  }

  /** 等待当前及合并队列中的所有 System 2 任务执行完毕（供单测与显式同步场景使用）。 */
  async waitForIdle(timeoutMs = 15_000): Promise<void> {
    if (!this.inFlight && !this.pendingInput) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.idleWaiters.indexOf(onIdle);
        if (idx >= 0) this.idleWaiters.splice(idx, 1);
        reject(new Error(`System2TaskCoordinator waitForIdle timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const onIdle = () => {
        clearTimeout(timer);
        resolve();
      };
      this.idleWaiters.push(onIdle);
    });
  }

  private resolveIdleIfEmpty(): void {
    if (!this.inFlight && !this.pendingInput) {
      for (const fn of this.idleWaiters.splice(0, this.idleWaiters.length)) {
        fn();
      }
    }
  }

  private markTaskStale(task: ActiveS2Flight, nowMs: number): void {
    task.cancelledAsStale = true;
    if (!task.staleRecorded) {
      task.staleRecorded = true;
      this.deps.state.recordS2CancelledAsStale(nowMs);
    }
    task.abortController.abort();
  }

  private launch(
    input: System2ScheduledTaskInput,
    priority: number,
  ): Promise<ControllerDecision | undefined> {
    const abortController = new AbortController();
    const taskId = `s2task_${++this.taskSeq}_${this.deps.clock.now()}`;
    const flight: ActiveS2Flight = {
      taskId,
      input,
      priority,
      abortController,
      cancelledAsStale: false,
      staleRecorded: false,
      promise: Promise.resolve(undefined),
    };
    this.inFlight = flight;
    flight.promise = this.executeFlight(flight);
    return flight.promise;
  }

  private async executeFlight(flight: ActiveS2Flight): Promise<ControllerDecision | undefined> {
    const preS2NowMs = this.deps.clock.now();
    const preS2Iso = msToIso(preS2NowMs);
    const request: SlowReasoningCandidateRequest = {
      ...flight.input.request,
      timestamp: preS2Iso,
      basedOnTurnSeq: flight.input.turnSeq,
    };

    try {
      const s2Result = await this.deps.slowReasoning.synthesize(request, flight.abortController.signal);
      const postS2NowMs = this.deps.clock.now();
      const postS2Iso = msToIso(postS2NowMs);

      const staleContext =
        this.disposed ||
        flight.cancelledAsStale ||
        flight.abortController.signal.aborted ||
        request.contextVersion !== this.deps.state.getContextVersion() ||
        (flight.input.turnSeq < this.staleCutoffTurnSeq &&
          request.triggerKind !== 'live_qa' &&
          request.triggerKind !== 'manual_help');

      if (staleContext) {
        if (!flight.staleRecorded) {
          flight.staleRecorded = true;
          this.deps.state.recordS2CancelledAsStale(postS2NowMs);
        }
        return undefined;
      }

      const decision = this.commitValidResult(s2Result, flight.input, preS2NowMs, postS2NowMs, postS2Iso);
      return decision;
    } catch (error) {
      const errNowMs = this.deps.clock.now();
      if (
        this.disposed ||
        flight.cancelledAsStale ||
        flight.abortController.signal.aborted ||
        (error as Error)?.name === 'AbortError'
      ) {
        if (!flight.staleRecorded) {
          flight.staleRecorded = true;
          this.deps.state.recordS2CancelledAsStale(errNowMs);
        }
        return undefined;
      }
      // 保留会话稳定性：即使下游未捕捉异常也不崩溃事件循环。
      return undefined;
    } finally {
      if (this.inFlight === flight) {
        this.inFlight = undefined;
      }
      if (!this.disposed && this.pendingInput) {
        const next = this.pendingInput;
        this.pendingInput = undefined;
        // 丢弃上下文版本已过期的合并排队项。
        if (next.request.contextVersion !== this.deps.state.getContextVersion()) {
          this.deps.state.recordS2CancelledAsStale(this.deps.clock.now());
          this.resolveIdleIfEmpty();
        } else {
          this.launch(next, priorityForTrigger(next.request.triggerKind));
        }
      } else {
        this.resolveIdleIfEmpty();
      }
    }
  }

  private commitValidResult(
    s2Result: SlowReasoningCandidateResult,
    input: System2ScheduledTaskInput,
    preS2NowMs: number,
    postS2NowMs: number,
    postS2Iso: UtcIso8601,
  ): ControllerDecision | undefined {
    const { correlationId } = input;
    this.deps.state.recordS2Completed(s2Result.latencyMs, postS2NowMs);

    const anchoredCandidate = s2Result.candidate
      ? this.reanchorCandidateLifetime(s2Result.candidate, preS2NowMs, postS2NowMs)
      : undefined;

    const s2Usage = s2Result.usage ? { ...s2Result.usage, correlationId } : undefined;
    const s2ResultWithCorr: SlowReasoningCandidateResult = {
      ...s2Result,
      ...(anchoredCandidate ? { candidate: anchoredCandidate } : {}),
      ...(s2Usage ? { usage: s2Usage } : {}),
    };

    const telemetryAfterS2 = this.deps.state.recordTelemetry(
      'system2',
      s2Result.latencyMs,
      s2Usage,
      s2Result.backend,
      postS2NowMs,
    );
    this.deps.send(
      { type: 'system2.candidate', payload: s2ResultWithCorr },
      { stage: 'slow_reasoning', correlationId, occurredAt: postS2Iso },
    );
    this.deps.send(
      { type: 'telemetry.updated', payload: telemetryAfterS2 },
      { stage: 'slow_reasoning', correlationId, occurredAt: postS2Iso },
    );

    if (s2Result.guidance) {
      const committedGuidance = this.deps.state.commitSystem2Guidance(
        {
          ...s2Result.guidance,
          basedOnTurnSeq: input.turnSeq,
          staleAfterTurnSeq: input.turnSeq + 3,
          correlationId,
        },
        postS2NowMs,
      );
      if (committedGuidance) {
        this.deps.send(
          { type: 'system2.guidance', payload: committedGuidance },
          { stage: 'slow_reasoning', correlationId, occurredAt: postS2Iso },
        );
      }
    }

    let finalDecision: ControllerDecision | undefined;
    if (anchoredCandidate) {
      this.deps.state.upsertCandidate(anchoredCandidate, postS2NowMs);
      this.deps.plugin.onCandidatePrepared?.(anchoredCandidate);
      const outcome = this.deps.controller.evaluateCandidates({
        sessionId: this.deps.sessionId,
        state: this.deps.state,
        context: this.deps.context,
        candidates: [anchoredCandidate, ...this.deps.state.getPendingCandidates()],
        signals: input.signals,
        now: postS2NowMs,
      });
      this.deps.onOutcome(outcome, postS2NowMs, correlationId);
      finalDecision = outcome.decision;
    }

    this.deps.onEmitState(postS2NowMs, correlationId);
    return finalDecision;
  }

  /**
   * 按实际异步 S2 耗时顺延新生成 Candidate 的显示 TTL，确保慢思考不会返回“刚出生即过期”的提示，
   * 同时在 ManualClock 静态时钟单测中（elapsedMs === 0）保持零偏移确定性。
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
}
