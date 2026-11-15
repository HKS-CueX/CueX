import { randomUUID } from 'node:crypto';
import {
  EVENT_ENVELOPE_VERSION,
  createEventEnvelope,
  nowUtcIso8601,
  type EventEnvelope,
  type EventEnvelopeMeta,
  type PrivacyClass,
  type UtcIso8601,
} from '@cuex/protocol';
import type { StorageRepository } from '../storage';

export const PIPELINE_STAGES = [
  'ingestion',
  'asr',
  'context_store',
  'event_bus',
  'fast_decision',
  'retrieval',
  'slow_reasoning',
  'controller',
  'delivery',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface PipelineStageTiming {
  stage: PipelineStage;
  count: number;
  totalDurationMs: number;
  lastDurationMs: number;
  lastAt: UtcIso8601;
}

export interface CreateTrackedEnvelopeInput<TPayload> {
  stage: PipelineStage;
  eventType: string;
  producer: string;
  payload: TPayload;
  sessionId?: string;
  tenantId?: string;
  userId?: string;
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  privacyClass?: PrivacyClass;
  idempotencyKey?: string;
  occurredAt?: UtcIso8601;
  persistCategory?: 'ws_server' | 'cognitive';
}

export interface TrackedEnvelopeResult<TPayload> {
  serverSeq: number;
  envelope: EventEnvelope<TPayload>;
  envelopeMeta: EventEnvelopeMeta;
}

/**
 * Coordinates the 9-stage Cognitive Pipeline with EventEnvelope correlation/causation metadata,
 * idempotency deduplication, monotonic per-session serverSeq numbering, and durable session_events storage.
 */
export class PipelineTracker {
  private readonly sessionSeq = new Map<string, number>();
  private readonly seenIdempotencyKeys = new Map<string, string[]>();
  private readonly stageTimings = new Map<PipelineStage, PipelineStageTiming>();

  constructor(
    private readonly repo?: StorageRepository,
    private readonly maxSeenKeysPerSession = 2_000,
  ) {}

  seedSessionSeq(sessionId: string): number {
    const existing = this.sessionSeq.get(sessionId);
    if (existing !== undefined) return existing;
    if (!this.repo) {
      this.sessionSeq.set(sessionId, 0);
      return 0;
    }
    const events = this.repo.listSessionEventsSince(sessionId, 0);
    const maxSeq = events.reduce((max, item) => Math.max(max, item.serverSeq), 0);
    this.sessionSeq.set(sessionId, maxSeq);
    return maxSeq;
  }

  nextServerSeq(sessionId: string): number {
    const current = this.seedSessionSeq(sessionId);
    const next = current + 1;
    this.sessionSeq.set(sessionId, next);
    return next;
  }

  getCurrentServerSeq(sessionId: string): number {
    return this.seedSessionSeq(sessionId);
  }

  /**
   * Returns true if this idempotency key has not yet been seen for the session (and records it).
   * Returns false when duplicate.
   */
  claimIdempotencyKey(sessionId: string, idempotencyKey?: string): boolean {
    if (!idempotencyKey || !idempotencyKey.trim()) return true;
    const clean = idempotencyKey.trim();
    let keys = this.seenIdempotencyKeys.get(sessionId);
    if (!keys) {
      keys = [];
      this.seenIdempotencyKeys.set(sessionId, keys);
    }
    if (keys.includes(clean)) {
      return false;
    }
    keys.push(clean);
    if (keys.length > this.maxSeenKeysPerSession) {
      keys.splice(0, keys.length - this.maxSeenKeysPerSession);
    }
    return true;
  }

  recordStageDuration(stage: PipelineStage, durationMs: number, atIso: UtcIso8601 = nowUtcIso8601()): void {
    const safeMs = Math.max(0, Math.round(durationMs));
    const current = this.stageTimings.get(stage);
    if (!current) {
      this.stageTimings.set(stage, {
        stage,
        count: 1,
        totalDurationMs: safeMs,
        lastDurationMs: safeMs,
        lastAt: atIso,
      });
      return;
    }
    current.count += 1;
    current.totalDurationMs += safeMs;
    current.lastDurationMs = safeMs;
    current.lastAt = atIso;
  }

  getStageSummary(): Record<PipelineStage, { count: number; avgDurationMs: number; lastDurationMs: number }> {
    const out = {} as Record<PipelineStage, { count: number; avgDurationMs: number; lastDurationMs: number }>;
    for (const stage of PIPELINE_STAGES) {
      const entry = this.stageTimings.get(stage);
      out[stage] = entry
        ? {
            count: entry.count,
            avgDurationMs: Number((entry.totalDurationMs / entry.count).toFixed(2)),
            lastDurationMs: entry.lastDurationMs,
          }
        : { count: 0, avgDurationMs: 0, lastDurationMs: 0 };
    }
    return out;
  }

  emitEnvelope<TPayload>(input: CreateTrackedEnvelopeInput<TPayload>): TrackedEnvelopeResult<TPayload> {
    const sessionKey = input.sessionId ?? '_global';
    const serverSeq = this.nextServerSeq(sessionKey);
    const occurredAt = input.occurredAt ?? nowUtcIso8601();
    const correlationId = input.correlationId ?? randomUUID();
    const traceId = input.traceId ?? correlationId;

    const envelope = createEventEnvelope<TPayload>({
      eventType: input.eventType,
      eventVersion: EVENT_ENVELOPE_VERSION,
      producer: input.producer,
      payload: input.payload,
      occurredAt,
      sessionId: input.sessionId,
      tenantId: input.tenantId,
      userId: input.userId,
      correlationId,
      causationId: input.causationId,
      traceId,
      privacyClass: input.privacyClass ?? 'session',
      idempotencyKey: input.idempotencyKey,
    });

    const { payload: _drop, ...envelopeMeta } = envelope;

    this.recordStageDuration(input.stage, 0, occurredAt);

    if (this.repo && input.sessionId && input.persistCategory) {
      this.repo.appendSessionEvent({
        sessionId: input.sessionId,
        userId: input.userId,
        serverSeq,
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        category: input.persistCategory,
        occurredAt: envelope.occurredAt,
        correlationId: envelope.correlationId,
        payload: input.payload,
        envelope: envelopeMeta,
      });
    }

    return {
      serverSeq,
      envelope,
      envelopeMeta,
    };
  }

  clearSession(sessionId: string): void {
    this.sessionSeq.delete(sessionId);
    this.seenIdempotencyKeys.delete(sessionId);
  }
}
