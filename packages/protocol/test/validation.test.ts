import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AsrCapabilityStatusSchema,
  COLAB_ASR_LIFECYCLE_STATES,
  ColabAsrLifecycleStateSchema,
  DualSystemCollaborationMetricsSchema,
  EVIDENCE_SCHEMA_VERSION,
  HealthStatusResponseSchema,
  MEMORY_SCHEMA_VERSION,
  PACK_SCHEMA_VERSION,
  ProviderUsageRecordSchema,
  S1ObservationSnapshotSchema,
  ServerEventSchema,
  System2GuidanceSchema,
  WS_ATTACH_ROLES,
  WsAttachRoleSchema,
  WsAttachStateSchema,
  createWsRolePolicy,
  validateAsrCapabilityStatus,
  validateAuthSessionInput,
  validateClientMessage,
  validateContextPack,
  validateDualSystemCollaborationMetrics,
  validateEvidence,
  validateHealthStatusResponse,
  validateMemoryConfirmInput,
  validateMemoryItem,
  validateMemoryPatchInput,
  validatePaymentCheckoutPreviewRequest,
  validatePaymentWebhookEvent,
  validatePresentationCompileInput,
  validatePresentationContextPack,
  validatePresentationExtractInput,
  validatePresentationPackPatchInput,
  validateProviderUsageRecord,
  validateS1ObservationSnapshot,
  validateServerEvent,
  validateSystem2Guidance,
  validateTelemetryUsage,
  validateUsageRecord,
  validateWsAttachState,
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

test('Phase 3 schemas validate Colab GPU ASR lifecycle/capability and honest provider usage', () => {
  assert.deepEqual(COLAB_ASR_LIFECYCLE_STATES, [
    'not_configured',
    'starting',
    'ready',
    'degraded',
    'disconnected',
    'restarting',
    'unavailable',
  ]);
  for (const state of COLAB_ASR_LIFECYCLE_STATES) {
    assert.equal(ColabAsrLifecycleStateSchema.safeParse(state).success, true);
  }
  assert.equal(ColabAsrLifecycleStateSchema.safeParse('sleeping').success, false);
  assert.throws(() => ColabAsrLifecycleStateSchema.parse('sleeping'), TypeError);

  const colabStatus = {
    backend: 'colab-gpu-asr',
    mode: 'colab_gpu',
    available: true,
    streaming: true,
    detail: 'Colab G4 streaming active',
    lifecycleState: 'ready',
    gpuName: 'NVIDIA L4',
    modelId: 'iic/SenseVoiceSmall',
    rtf: 0.08,
    lastHealthCheckAt: NOW,
    fallbackActive: false,
  };
  assert.equal(validateAsrCapabilityStatus(colabStatus).ok, true);
  assert.equal(AsrCapabilityStatusSchema.safeParse(colabStatus).success, true);
  assert.equal(
    AsrCapabilityStatusSchema.safeParse({
      ...colabStatus,
      lifecycleState: 'invalid_state',
    }).success,
    false,
  );
  assert.equal(
    AsrCapabilityStatusSchema.safeParse({
      ...colabStatus,
      lastHealthCheckAt: '2026-11-16T04:00:00+08:00',
    }).success,
    false,
  );

  const unreportedUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    modelCalls: 1,
    usageSource: 'provider_unreported',
    degraded: false,
    provider: 'cpa-gateway',
    model: 'gemini-4-hydrogen',
    correlationId: 'corr_cpa_unreported_1',
  };
  assert.equal(validateProviderUsageRecord(unreportedUsage).ok, true);
  assert.equal(ProviderUsageRecordSchema.safeParse(unreportedUsage).success, true);
  assert.equal(
    ProviderUsageRecordSchema.safeParse({
      ...unreportedUsage,
      reasoningTokens: -5,
    }).success,
    false,
  );

  assert.equal(
    validateTelemetryUsage({
      sessionId: 'sess_cpa_1',
      updatedAt: NOW,
      usageSource: 'provider_unreported',
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      modelCalls: 1,
      retries: 0,
      localRuleEvaluations: 0,
      latencyMs: 320,
      latencyStats: { avgMs: 320, p95Ms: 320, maxMs: 320 },
      degraded: false,
      usingLocalFallback: false,
      asrProvider: 'colab-gpu-asr',
      asrDurationMs: 4200,
      costFen: 0,
      cost: { amountFen: 0, currency: 'CNY' },
      estimation: { isEstimated: false, source: 'provider_unreported', usingLocalFallback: false },
    }).ok,
    true,
  );
});

test('v2.2.0 双系统协同黑板、脱敏健康归因与 Companion 多订阅契约校验', () => {
  const validGuidance = {
    guidanceId: 'guid_1',
    sessionId: 'sess_1',
    revision: 2,
    contextVersion: 1,
    basedOnTurnSeq: 4,
    staleAfterTurnSeq: 9,
    issuedAtMs: 1763265600000,
    expiresAtMs: 1763265630000,
    issuedAt: NOW,
    expiresAt: '2026-11-16T04:00:30.000Z',
    targetChapterId: 'ch_1',
    targetChapterTitle: '核心架构',
    focusDirective: '回应评委关于延迟拆解的问题后再回到主线。',
    strategyHints: ['仅引用已验证实测数据'],
    recommendedBias: 'qa_grounding',
    preferredLevel: 'L2',
    evidenceAnchors: ['ev_1'],
    grounded: true,
    reasoningEffort: 'medium',
    provider: 'cpa',
    model: 'gemini-4-hydrogen',
  };
  assert.equal(validateSystem2Guidance(validGuidance).ok, true);
  assert.equal(System2GuidanceSchema.safeParse(validGuidance).success, true);
  assert.equal(
    System2GuidanceSchema.safeParse({ ...validGuidance, revision: 0 }).success,
    false,
  );
  assert.equal(
    System2GuidanceSchema.safeParse({
      ...validGuidance,
      expiresAtMs: validGuidance.issuedAtMs - 10,
    }).success,
    false,
  );

  const validObs = {
    turnSeq: 4,
    observedAtMs: 1763265599800,
    observedAt: NOW,
    decisionType: 'noul',
    selectedSlot: 3,
    label: 'question_detected',
    calibratedConfidence: 0.78,
    margin: 0.21,
    entropy: 0.62,
    escalationReason: 'live_qa_low_margin',
    escalatedToS2: true,
    latencyMs: 36.5,
    degraded: false,
    providerKind: 'colab_jev',
    model: 'autotrust/JEV-27B',
    promptFormat: 'jev-v1',
    calibrated: true,
    guidanceAppliedRevision: 1,
  };
  assert.equal(validateS1ObservationSnapshot(validObs).ok, true);
  assert.equal(S1ObservationSnapshotSchema.safeParse(validObs).success, true);
  assert.equal(
    S1ObservationSnapshotSchema.safeParse({ ...validObs, calibratedConfidence: 1.4 }).success,
    false,
  );

  const validMetrics = {
    s1Evaluations: 12,
    s1Escalations: 3,
    s2AsyncDispatches: 3,
    s2Completed: 2,
    s2CancelledAsStale: 1,
    s2Coalesced: 1,
    guidanceRevisionsIssued: 2,
    guidanceAppliedCount: 8,
    guidanceExpiredOrOverridden: 1,
    s1P50LatencyMs: 32.0,
    s2P95LatencyMs: 1620,
    updatedAt: NOW,
  };
  assert.equal(validateDualSystemCollaborationMetrics(validMetrics).ok, true);
  assert.equal(DualSystemCollaborationMetricsSchema.safeParse(validMetrics).success, true);
  assert.equal(
    DualSystemCollaborationMetricsSchema.safeParse({ ...validMetrics, s2Completed: -1 }).success,
    false,
  );

  assert.deepEqual(WS_ATTACH_ROLES, ['primary', 'companion']);
  assert.equal(WsAttachRoleSchema.safeParse('companion').success, true);
  assert.equal(WsAttachRoleSchema.safeParse('spectator').success, false);

  const companionPolicy = createWsRolePolicy('companion');
  assert.equal(companionPolicy.canCaptureMic, false);
  assert.equal(companionPolicy.canControlSession, false);
  assert.equal(companionPolicy.canViewInspector, true);
  assert.equal(companionPolicy.canInteractWithCues, true);
  assert.equal(createWsRolePolicy('primary').canInteractWithCues, true);

  const attachState = {
    sessionId: 'sess_1',
    lastSeenSeq: 19,
    role: 'companion',
    activePrimaryConnected: true,
    canCaptureMic: false,
    companionCount: 1,
    rolePolicy: companionPolicy,
  };
  assert.equal(validateWsAttachState(attachState).ok, true);
  assert.equal(WsAttachStateSchema.safeParse(attachState).success, true);
  assert.equal(
    WsAttachStateSchema.safeParse({
      ...attachState,
      rolePolicy: { ...companionPolicy, canInteractWithCues: 'yes' },
    }).success,
    false,
  );

  assert.equal(
    validateClientMessage({
      type: 'session.attach',
      payload: { sessionId: 'sess_1', lastSeenSeq: 19, role: 'companion' },
    }).ok,
    true,
  );
  assert.equal(
    validateClientMessage({
      type: 'session.attach',
      payload: { sessionId: 'sess_1', role: 'invalid_role' },
    }).ok,
    false,
  );

  const guidanceEvent = {
    type: 'system2.guidance',
    serverSeq: 20,
    correlationId: 'corr_s2_1',
    payload: validGuidance,
  };
  assert.equal(validateServerEvent(guidanceEvent).ok, true);
  assert.equal(ServerEventSchema.safeParse(guidanceEvent).success, true);
  assert.equal(
    validateServerEvent({
      type: 'session.attach_state',
      serverSeq: 21,
      payload: attachState,
    }).ok,
    true,
  );
  assert.equal(
    ServerEventSchema.safeParse({
      type: 'system2.guidance',
      payload: { guidanceId: '' },
    }).success,
    false,
  );

  const healthPayload = {
    ok: true,
    service: 'cuex-server',
    version: '2.2.0',
    apiVersion: '2026-11',
    wsProtocolVersion: '2.0',
    timestamp: NOW,
    asr: {
      backend: 'colab-gpu-asr',
      mode: 'colab_gpu',
      available: true,
      streaming: true,
      detail: 'SenseVoiceSmall + FSMN-VAD ready',
      lifecycleState: 'ready',
      modelId: 'iic/SenseVoiceSmall + FSMN-VAD',
      fallbackActive: false,
    },
    system1: {
      backend: 'colab-jev-s1',
      mode: 'real',
      healthy: true,
      provider: 'colab-jev',
      model: 'autotrust/JEV-27B',
      promptFormat: 'jev-v1',
      calibrated: true,
      fallbackActive: false,
      degraded: false,
      lastHealthCheckAt: NOW,
    },
    system2: {
      backend: 'cpa-gateway',
      mode: 'real',
      healthy: true,
      provider: 'cpa',
      model: 'gemini-4-hydrogen',
      reasoningEffort: 'medium',
      compilerModel: 'gemini-4-hydrogen',
      reflectionModel: 'gemini-4-hydrogen',
      fallbackActive: false,
      degraded: false,
      lastHealthCheckAt: NOW,
    },
    dualSystemMetrics: validMetrics,
  };
  assert.equal(validateHealthStatusResponse(healthPayload).ok, true);
  assert.equal(HealthStatusResponseSchema.safeParse(healthPayload).success, true);
});
