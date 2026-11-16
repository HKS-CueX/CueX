import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EVIDENCE_SCHEMA_VERSION,
  MEMORY_SCHEMA_VERSION,
  PACK_SCHEMA_VERSION,
  isUtcIso8601,
  normalizeClientMessageV1ToV2,
  normalizeContextPackV1ToV2,
  normalizeEvidenceV1ToV2,
  normalizeMemoryItemV1ToV2,
  normalizePresentationContextPackV1ToV2,
  normalizeSessionV1ToV2,
  normalizeTelemetryUsageV1ToV2,
  toUtcIso8601,
  validateContextPack,
  validateEvidence,
  validateMemoryItem,
  validatePresentationContextPack,
  validateTelemetryUsage,
} from '#src/index';

const EPOCH_MS = 1763265600000;

test('toUtcIso8601 converts legacy epoch ms, Date, and numeric strings into strict UTC ISO-8601', () => {
  const fromMs = toUtcIso8601(EPOCH_MS);
  assert.equal(isUtcIso8601(fromMs), true);
  assert.equal(fromMs, new Date(EPOCH_MS).toISOString());

  const fromStr = toUtcIso8601(String(EPOCH_MS));
  assert.equal(fromStr, fromMs);

  const fromDate = toUtcIso8601(new Date(EPOCH_MS));
  assert.equal(fromDate, fromMs);
});

test('v1 -> v2 normalizers produce records passing v2 runtime validators', () => {
  const v1Evidence = {
    id: 'ev_legacy_1',
    text: 'Legacy verified fact',
    source: 'slides.md',
    timestamp: EPOCH_MS,
    confidence: 0.9,
    scope: 'document',
    privacyLevel: 'session',
    userConfirmed: true,
    verified: true,
    lifecycle: 'active',
  };
  const v2Evidence = normalizeEvidenceV1ToV2(v1Evidence);
  assert.equal(v2Evidence.schemaVersion, EVIDENCE_SCHEMA_VERSION);
  assert.equal(v2Evidence.locked, false);
  assert.equal(validateEvidence(v2Evidence).ok, true);

  const v1Memory = {
    memoryId: 'mem_legacy_1',
    scenarioId: 'presentation',
    category: 'fact',
    title: 'Memory Title',
    content: 'Memory Content',
    userConfirmed: true,
    privacyLevel: 'local_private',
    scope: 'global',
    createdAt: EPOCH_MS,
    updatedAt: EPOCH_MS,
  };
  const v2Memory = normalizeMemoryItemV1ToV2(v1Memory);
  assert.equal(v2Memory.schemaVersion, MEMORY_SCHEMA_VERSION);
  assert.equal(validateMemoryItem(v2Memory).ok, true);

  const v1Pack = {
    packId: 'pack_legacy_1',
    scenarioId: 'presentation',
    title: 'Legacy Pack',
    goal: 'Goal',
    constraints: [],
    forbiddenClaims: [],
    chapters: [],
    evidence: [v1Evidence],
    createdAt: EPOCH_MS,
    updatedAt: EPOCH_MS,
  };
  const v2Pack = normalizeContextPackV1ToV2(v1Pack);
  assert.equal(v2Pack.schemaVersion, PACK_SCHEMA_VERSION);
  assert.equal(validateContextPack(v2Pack).ok, true);

  const v1PresentationPack = {
    ...v1Pack,
    sceneType: 'pitch',
    audience: 'Investors',
    targetDurationSec: 300,
    cueSheet: {
      title: 'Legacy Pack',
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
        text: 'Legacy verified fact',
        category: 'claim',
        source: 'slides.md',
        userConfirmed: true,
        locked: false,
        verified: true,
        evidenceId: 'ev_legacy_1',
      },
    ],
    qaCards: [
      {
        id: 'qa_1',
        question: 'Q?',
        rationale: 'R',
        suggestedAnswer: 'A',
        keywords: ['A'],
        evidenceIds: ['ev_legacy_1'],
        prepared: true,
      },
    ],
    unpreparedGaps: [],
    progressNodes: [],
    compiledBy: 'local_compiler',
    warnings: [],
  };
  const v2PresentationPack = normalizePresentationContextPackV1ToV2(v1PresentationPack);
  assert.equal(v2PresentationPack.schemaVersion, PACK_SCHEMA_VERSION);
  assert.equal(v2PresentationPack.qaCards[0].isPrediction, true);
  assert.equal(validatePresentationContextPack(v2PresentationPack).ok, true);

  const v2Session = normalizeSessionV1ToV2({
    sessionId: 'sess_legacy',
    scenarioId: 'presentation',
    status: 'active',
    mode: 'rehearsal',
    viewMode: 'focus',
    startedAt: EPOCH_MS,
    silentMode: false,
    maxInterventionLevel: 'L3',
    privacyNoticeAccepted: true,
  });
  assert.equal(isUtcIso8601(v2Session.startedAt), true);

  const v2Telemetry = normalizeTelemetryUsageV1ToV2({
    sessionId: 'sess_legacy',
    updatedAt: EPOCH_MS,
    inputTokens: 100,
    outputTokens: 20,
    cachedInputTokens: 0,
    totalTokens: 120,
    modelCalls: 1,
    localRuleEvaluations: 2,
    latencyMs: 42,
    estimation: {
      isEstimated: false,
      source: 'provider_reported',
      usingLocalFallback: false,
      estimatedCostCny: 0.05,
    },
  });
  assert.equal(v2Telemetry.costFen, 5);
  assert.deepEqual(v2Telemetry.cost, { amountFen: 5, currency: 'CNY' });
  assert.equal(validateTelemetryUsage(v2Telemetry).ok, true);

  const v2ClientMsg = normalizeClientMessageV1ToV2({
    type: 'session.start',
    payload: {
      scenarioId: 'presentation',
      mode: 'rehearsal',
      privacyNoticeAccepted: true,
      contextPack: v1PresentationPack,
    },
  });
  assert.equal(v2ClientMsg.type, 'session.start');
  if (v2ClientMsg.type === 'session.start' && v2ClientMsg.payload.contextPack) {
    assert.equal(validatePresentationContextPack(v2ClientMsg.payload.contextPack).ok, true);
  }
});
