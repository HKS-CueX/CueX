import test from 'node:test';
import assert from 'node:assert/strict';

import {
  API_ERROR_CODES,
  API_VERSION,
  EVIDENCE_SCHEMA_VERSION,
  EVENT_ENVELOPE_VERSION,
  MEMORY_SCHEMA_VERSION,
  PACK_SCHEMA_VERSION,
  WS_PROTOCOL_VERSION,
  createApiErrorResponse,
  createEventEnvelope,
  createMoneyAmount,
  isSafeMoneyAmount,
  isUtcIso8601,
  validateEventEnvelope,
} from '#src/index';

test('schema & protocol version constants match 2026-11 v2 contract', () => {
  assert.equal(API_VERSION, '2026-11');
  assert.equal(WS_PROTOCOL_VERSION, '2.0');
  assert.equal(PACK_SCHEMA_VERSION, 2);
  assert.equal(EVIDENCE_SCHEMA_VERSION, 2);
  assert.equal(MEMORY_SCHEMA_VERSION, 2);
  assert.equal(EVENT_ENVELOPE_VERSION, 1);
});

test('MoneyAmount enforces integer Fen minor units and rejects floats/negatives', () => {
  const valid = createMoneyAmount(2900);
  assert.deepEqual(valid, { amountFen: 2900, currency: 'CNY' });
  assert.equal(isSafeMoneyAmount(valid), true);
  assert.equal(isSafeMoneyAmount({ amountFen: 29.5, currency: 'CNY' }), false);
  assert.equal(isSafeMoneyAmount({ amountFen: -100, currency: 'CNY' }), false);
  assert.equal(isSafeMoneyAmount({ amountFen: 100, currency: 'USD' }), false);
  assert.throws(() => createMoneyAmount(12.34), RangeError);
});

test('isUtcIso8601 enforces strict UTC ISO-8601 strings and valid calendar dates', () => {
  assert.equal(isUtcIso8601('2026-11-16T04:00:00.000Z'), true);
  assert.equal(isUtcIso8601('2026-11-16T04:00:00Z'), true);
  assert.equal(isUtcIso8601('2026-11-16T04:00:00+08:00'), false);
  assert.equal(isUtcIso8601('2026-02-30T04:00:00.000Z'), false);
  assert.equal(isUtcIso8601(1763265600000), false);
});

test('createEventEnvelope produces valid CloudEvents-inspired envelope verified by validateEventEnvelope', () => {
  const envelope = createEventEnvelope({
    eventType: 'intervention.shown',
    producer: 'cuex-runtime/controller',
    sessionId: 'sess_123',
    tenantId: 'tenant_1',
    userId: 'usr_1',
    idempotencyKey: 'idem_001',
    payload: { interventionId: 'int_1', level: 'L2' },
  });

  assert.equal(envelope.specVersion, '1.0');
  assert.equal(envelope.eventVersion, 1);
  assert.equal(envelope.privacyClass, 'session');
  assert.equal(isUtcIso8601(envelope.occurredAt), true);
  assert.ok(envelope.eventId.length > 0);
  assert.equal(envelope.correlationId, envelope.eventId);

  const validated = validateEventEnvelope(envelope);
  assert.equal(validated.ok, true);
});

test('createApiErrorResponse covers all unified error codes cleanly', () => {
  assert.equal(API_ERROR_CODES.length, 14);
  for (const code of API_ERROR_CODES) {
    const res = createApiErrorResponse({ code, message: `Error ${code}`, correlationId: 'corr_1' });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, code);
    assert.equal(isUtcIso8601(res.error.timestamp), true);
    assert.ok(res.error.httpStatus >= 400 && res.error.httpStatus <= 599);
  }
});
