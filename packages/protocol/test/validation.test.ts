import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EVIDENCE_SCHEMA_VERSION,
  MEMORY_SCHEMA_VERSION,
  PACK_SCHEMA_VERSION,
  validateAuthSessionInput,
  validateClientMessage,
  validateContextPack,
  validateEvidence,
  validateMemoryConfirmInput,
  validateMemoryItem,
  validateMemoryPatchInput,
  validatePaymentCheckoutPreviewRequest,
  validatePaymentWebhookEvent,
  validatePresentationCompileInput,
  validatePresentationContextPack,
  validatePresentationExtractInput,
  validatePresentationPackPatchInput,
  validateTelemetryUsage,
  validateUsageRecord,
} from '#src/index';

const NOW = '2026-11-16T04:00:00.000Z';

test('REST validators accept valid payloads and reject malformed payloads', () => {
  assert.equal(
    validatePresentationExtractInput({ filename: 'deck.pptx', contentBase64: 'UEsDB' }).ok,
    true,
  );
  assert.equal(validatePresentationExtractInput({ filename: 'deck.pptx' }).ok, false);

  assert.equal(
    validatePresentationCompileInput({
      title: 'CueX Pitch',
      sceneType: 'pitch',
      goal: 'Explain cognitive copilot',
      audience: 'Judges',
      targetDurationSec: 300,
      rawMaterials: 'Slide 1 content',
    }).ok,
    true,
  );
  assert.equal(
    validatePresentationCompileInput({
      title: '',
      sceneType: 'invalid',
      goal: '',
      audience: 'Judges',
      targetDurationSec: -5,
      rawMaterials: 'x',
    }).ok,
    false,
  );

  assert.equal(
    validatePresentationPackPatchInput({
      title: 'Updated Title',
      qaCards: [
        {
          id: 'qa_1',
          question: 'How does withdrawal work?',
          rationale: 'Core guard',
          suggestedAnswer: 'Controller checks recovery.',
          keywords: ['Controller'],
          evidenceIds: ['ev_1'],
          isPrediction: true,
          prepared: true,
        },
      ],
    }).ok,
    true,
  );

  const badQaPatch = validatePresentationPackPatchInput({
    qaCards: [
      {
        id: 'qa_1',
        question: 'Q',
        suggestedAnswer: 'A',
        evidenceIds: [],
        isPrediction: false,
        prepared: true,
      },
    ],
  });
  assert.equal(badQaPatch.ok, false);

  assert.equal(
    validateMemoryConfirmInput({
      scenarioId: 'presentation',
      category: 'preference',
      title: 'Keep L2 brief',
      content: 'Use max 6 chars in L2',
      userConfirmed: true,
      privacyLevel: 'local_private',
      scope: 'global',
    }).ok,
    true,
  );

  const unconfirmedMemory = validateMemoryConfirmInput({
    scenarioId: 'presentation',
    category: 'preference',
    title: 'Keep L2 brief',
    content: 'Use max 6 chars in L2',
    userConfirmed: false,
    privacyLevel: 'local_private',
    scope: 'global',
  });
  assert.equal(unconfirmedMemory.ok, false);

  assert.equal(validateMemoryPatchInput({ title: 'Updated' }).ok, true);
  assert.equal(validateAuthSessionInput({ displayName: 'Presenter' }).ok, true);
  assert.equal(
    validatePaymentCheckoutPreviewRequest({
      planId: 'pro',
      billingCycle: 'monthly',
      paymentChannel: 'sandbox',
    }).ok,
    true,
  );
  assert.equal(
    validatePaymentWebhookEvent({
      eventId: 'wh_1',
      provider: 'sandbox',
      eventType: 'payment.succeeded',
      userId: 'usr_1',
      planId: 'pro',
      amount: { amountFen: 5900, currency: 'CNY' },
      idempotencyKey: 'idem_wh_1',
      occurredAt: NOW,
    }).ok,
    true,
  );
  assert.equal(
    validatePaymentWebhookEvent({
      eventId: 'wh_2',
      provider: 'wechat_pay',
      eventType: 'payment.succeeded',
      userId: 'usr_1',
      planId: 'pro',
      amount: { amountFen: 59.5, currency: 'CNY' },
      idempotencyKey: 'idem_wh_2',
      occurredAt: '2026-11-16',
    }).ok,
    false,
  );
});

test('Entity validators verify Evidence, ContextPack, PresentationContextPack, MemoryItem, TelemetryUsage, UsageRecord', () => {
  const validEvidence = {
    id: 'ev_1',
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    text: 'Verified slide point',
    source: 'deck.pptx',
    sourceDocumentId: 'doc_1',
    locationRef: 'slide:1',
    contentHash: 'abc123',
    timestamp: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    confidence: 0.95,
    scope: 'document',
    privacyLevel: 'session',
    userConfirmed: true,
    verified: true,
    locked: true,
    lifecycle: 'active',
  };
  assert.equal(validateEvidence(validEvidence).ok, true);
  assert.equal(validateEvidence({ ...validEvidence, timestamp: 1763265600000 }).ok, false);

  assert.equal(
    validateContextPack({
      packId: 'pack_1',
      schemaVersion: PACK_SCHEMA_VERSION,
      scenarioId: 'presentation',
      title: 'Pack',
      goal: 'Goal',
      constraints: [],
      forbiddenClaims: [],
      chapters: [],
      evidence: [validEvidence],
      createdAt: NOW,
      updatedAt: NOW,
    }).ok,
    true,
  );

  assert.equal(
    validatePresentationContextPack({
      packId: 'pack_p1',
      schemaVersion: PACK_SCHEMA_VERSION,
      scenarioId: 'presentation',
      title: 'Deck',
      sceneType: 'pitch',
      goal: 'Pitch CueX',
      audience: 'Judges',
      targetDurationSec: 300,
      cueSheet: {
        title: 'Deck',
        sceneType: 'pitch',
        oneLineThesis: 'Thesis',
        audienceHook: 'Hook',
        targetDurationSec: 300,
        chapters: [],
        closingCallToAction: 'CTA',
        forbiddenClaims: [],
      },
      facts: [
        {
          id: 'f_1',
          text: 'Verified slide point',
          category: 'claim',
          source: 'deck.pptx',
          userConfirmed: true,
          locked: true,
          verified: true,
          evidenceId: 'ev_1',
        },
      ],
      qaCards: [],
      unpreparedGaps: [],
      progressNodes: [],
      evidence: [validEvidence],
      forbiddenClaims: [],
      compiledBy: 'local_compiler',
      warnings: [],
      createdAt: NOW,
      updatedAt: NOW,
    }).ok,
    true,
  );

  assert.equal(
    validateMemoryItem({
      memoryId: 'mem_1',
      schemaVersion: MEMORY_SCHEMA_VERSION,
      scenarioId: 'presentation',
      category: 'style',
      title: 'Concise bullets',
      content: 'Prefer <= 3 bullets',
      userConfirmed: true,
      privacyLevel: 'local_private',
      scope: 'global',
      createdAt: NOW,
      updatedAt: NOW,
    }).ok,
    true,
  );

  assert.equal(
    validateTelemetryUsage({
      sessionId: 'sess_1',
      updatedAt: NOW,
      usageSource: 'local_rule_zero',
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
      modelCalls: 0,
      retries: 0,
      localRuleEvaluations: 6,
      latencyMs: 4.2,
      latencyStats: { avgMs: 0.7, p95Ms: 1.2, maxMs: 1.2 },
      degraded: false,
      usingLocalFallback: true,
      asrProvider: 'text_simulation',
      asrDurationMs: 0,
      costFen: 0,
      cost: { amountFen: 0, currency: 'CNY' },
      estimation: { isEstimated: false, source: 'local_rule_zero', usingLocalFallback: true },
    }).ok,
    true,
  );

  assert.equal(
    validateUsageRecord({
      id: 'ur_1',
      userId: 'usr_1',
      sessionId: 'sess_1',
      usageType: 'system1_eval',
      quantity: 1,
      unit: 'count',
      occurredAt: NOW,
      idempotencyKey: 'idem_ur_1',
      source: 'runtime/system1',
      costFen: 0,
    }).ok,
    true,
  );
});

test('validateClientMessage handles envelope/idempotency metadata and rejects unknown message types', () => {
  const startMsg = validateClientMessage({
    type: 'session.start',
    idempotencyKey: 'idem_start_1',
    correlationId: 'corr_start_1',
    clientSeq: 1,
    envelope: {
      specVersion: '1.0',
      eventId: 'ev_1',
      eventType: 'session.start',
      eventVersion: 1,
      occurredAt: NOW,
      correlationId: 'corr_start_1',
      producer: 'cuex-web',
      privacyClass: 'session',
    },
    payload: {
      scenarioId: 'presentation',
      mode: 'rehearsal',
      privacyNoticeAccepted: true,
    },
  });
  assert.equal(startMsg.ok, true);

  assert.equal(
    validateClientMessage({
      type: 'intervention.feedback',
      payload: { sessionId: 'sess_1', interventionId: 'int_1', feedback: 'helpful' },
    }).ok,
    true,
  );

  assert.equal(
    validateClientMessage({
      type: 'unknown.command',
      payload: {},
    }).ok,
    false,
  );
});
