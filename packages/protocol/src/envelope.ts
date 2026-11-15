/**
 * CloudEvents 1.0.2-inspired EventEnvelope for CueX Runtime events and WS correlation.
 */

import { EVENT_ENVELOPE_VERSION, nowUtcIso8601 } from '#src/versions';
import type { UtcIso8601 } from '#src/versions';

export type PrivacyClass =
  | 'public'
  | 'session'
  | 'user_private'
  | 'restricted'
  | 'billing_audit';

export interface EventEnvelopeMeta {
  specVersion: '1.0';
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: UtcIso8601;
  sessionId?: string;
  tenantId?: string;
  userId?: string;
  correlationId: string;
  causationId?: string;
  producer: string;
  traceId?: string;
  privacyClass: PrivacyClass;
  idempotencyKey?: string;
}

export interface EventEnvelope<TPayload = Record<string, unknown>> extends EventEnvelopeMeta {
  payload: TPayload;
}

export interface CreateEventEnvelopeInput<TPayload> {
  eventType: string;
  producer: string;
  payload: TPayload;
  eventVersion?: number;
  eventId?: string;
  occurredAt?: UtcIso8601;
  sessionId?: string;
  tenantId?: string;
  userId?: string;
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  privacyClass?: PrivacyClass;
  idempotencyKey?: string;
}

function generateUuidV4(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  const part = (n: number) => Array.from({ length: n }, hex).join('');
  return `${part(2)}-${hex()}-4${hex().slice(1)}-${((8 + Math.floor(Math.random() * 4)).toString(16))}${hex().slice(1)}-${part(3)}`;
}

export function createEventEnvelope<TPayload>(
  input: CreateEventEnvelopeInput<TPayload>,
): EventEnvelope<TPayload> {
  const eventId = input.eventId ?? generateUuidV4();
  return {
    specVersion: '1.0',
    eventId,
    eventType: input.eventType,
    eventVersion: input.eventVersion ?? EVENT_ENVELOPE_VERSION,
    occurredAt: input.occurredAt ?? nowUtcIso8601(),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
    correlationId: input.correlationId ?? eventId,
    ...(input.causationId !== undefined ? { causationId: input.causationId } : {}),
    producer: input.producer,
    ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
    privacyClass: input.privacyClass ?? 'session',
    ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    payload: input.payload,
  };
}
