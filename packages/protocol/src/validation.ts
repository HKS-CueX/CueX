/**
 * Zero-dependency strict runtime schema validators for @cuex/protocol.
 */

import {
  ASR_BACKEND_MODES,
  COLAB_ASR_LIFECYCLE_STATES,
  type AsrBackendMode,
  type AsrCapabilityStatus,
  type ColabAsrLifecycleState,
} from '#src/audio';
import type {
  MemoryCreateInput,
  MemoryPatchInput,
} from '#src/api';
import type {
  AuthSessionCreateInput,
  PaymentCheckoutPreviewRequest,
  PaymentWebhookEvent,
  UsageRecord,
} from '#src/commercial';
import { PLAN_IDS } from '#src/commercial';
import {
  TELEMETRY_USAGE_SOURCES,
  type DataScope,
  type EvidenceLifecycle,
  type InterventionLevel,
  type PrivacyLevel,
  type TelemetryUsage,
  type TelemetryUsageSource,
} from '#src/common';
import type {
  ContextPack,
  Evidence,
  MemoryCategory,
  MemoryItem,
  TranscriptSpeaker,
} from '#src/entities';
import type { EventEnvelope, EventEnvelopeMeta, PrivacyClass } from '#src/envelope';
import type { ClientMessage } from '#src/events';
import type {
  PresentationCompileInput,
  PresentationContextPack,
  PresentationExtractInput,
  PresentationFactItem,
  PresentationMode,
  PresentationPackPatchInput,
  PresentationQACard,
  PresentationSceneType,
  ViewMode,
} from '#src/presentation';
import type { ProviderUsageRecord } from '#src/reasoning';
import type { ScenarioId } from '#src/scenario';
import type { MoneyAmount, UtcIso8601 } from '#src/versions';

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

const UTC_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const INTERVENTION_LEVELS = new Set<InterventionLevel>(['L0', 'L1', 'L2', 'L3']);
const DATA_SCOPES = new Set<DataScope>(['global', 'scenario', 'session', 'document']);
const PRIVACY_LEVELS = new Set<PrivacyLevel>(['ephemeral', 'session', 'local_private', 'shared']);
const PRIVACY_CLASSES = new Set<PrivacyClass>([
  'public',
  'session',
  'user_private',
  'restricted',
  'billing_audit',
]);
const EVIDENCE_LIFECYCLES = new Set<EvidenceLifecycle>([
  'draft',
  'active',
  'superseded',
  'archived',
  'revoked',
]);
const MEMORY_CATEGORIES = new Set<MemoryCategory>([
  'preference',
  'terminology',
  'fact',
  'pacing_habit',
  'qa_pattern',
  'style',
]);
const SCENARIO_IDS = new Set<ScenarioId>(['presentation', 'social', 'teaching', 'sales', 'custom']);
const PRESENTATION_MODES = new Set<PresentationMode>(['rehearsal', 'live']);
const VIEW_MODES = new Set<ViewMode>(['focus', 'inspector']);
const SCENE_TYPES = new Set<PresentationSceneType>([
  'pitch',
  'defense',
  'academic',
  'keynote',
  'general',
]);
const TRANSCRIPT_SPEAKERS = new Set<TranscriptSpeaker>([
  'presenter',
  'audience',
  'interlocutor',
  'unknown',
]);
const TELEMETRY_SOURCES = new Set<TelemetryUsageSource>(TELEMETRY_USAGE_SOURCES);
const COLAB_LIFECYCLE_STATE_SET = new Set<ColabAsrLifecycleState>(COLAB_ASR_LIFECYCLE_STATES);
const ASR_BACKEND_MODE_SET = new Set<AsrBackendMode>(ASR_BACKEND_MODES);
const USAGE_TYPES = new Set<UsageRecord['usageType']>([
  'session_started',
  'live_audio_ms',
  'document_extract',
  'context_compile',
  'system1_eval',
  'system2_synthesis',
  'reflection_generated',
  'memory_write',
]);
const USAGE_UNITS = new Set<UsageRecord['unit']>(['count', 'ms', 'tokens', 'bytes']);
const PLAN_ID_SET = new Set<string>(PLAN_IDS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function addIssue(issues: ValidationIssue[], path: string, message: string, code = 'invalid_type'): void {
  issues.push({ path, message, code });
}

function succeedOrFail<T>(value: T, issues: ValidationIssue[]): ValidationResult<T> {
  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

export function isUtcIso8601(value: unknown): value is UtcIso8601 {
  if (typeof value !== 'string' || !UTC_ISO_RE.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  const datePart = value.slice(0, 10);
  return new Date(parsed).toISOString().slice(0, 10) === datePart;
}

export function isSafeMoneyAmount(value: unknown): value is MoneyAmount {
  if (!isPlainObject(value)) return false;
  return (
    value.currency === 'CNY' &&
    typeof value.amountFen === 'number' &&
    Number.isSafeInteger(value.amountFen) &&
    value.amountFen >= 0
  );
}

export function validateMoneyAmount(
  value: unknown,
  path = 'amount',
  opts?: { allowNegative?: boolean },
): ValidationResult<MoneyAmount> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, path, 'Expected MoneyAmount object');
    return { ok: false, issues };
  }
  if (value.currency !== 'CNY') {
    addIssue(issues, `${path}.currency`, "currency must be 'CNY'", 'invalid_enum');
  }
  if (typeof value.amountFen !== 'number' || !Number.isSafeInteger(value.amountFen)) {
    addIssue(issues, `${path}.amountFen`, 'amountFen must be a safe integer', 'invalid_integer');
  } else if (!opts?.allowNegative && value.amountFen < 0) {
    addIssue(issues, `${path}.amountFen`, 'amountFen must be >= 0', 'out_of_range');
  }
  return succeedOrFail(value as unknown as MoneyAmount, issues);
}

function validateEnvelopeMetaInternal(
  value: unknown,
  pathPrefix: string,
  issues: ValidationIssue[],
): void {
  if (!isPlainObject(value)) {
    addIssue(issues, pathPrefix, 'Expected EventEnvelopeMeta object');
    return;
  }
  if (value.specVersion !== '1.0') {
    addIssue(issues, `${pathPrefix}.specVersion`, "specVersion must be '1.0'", 'invalid_literal');
  }
  if (!isNonEmptyString(value.eventId)) {
    addIssue(issues, `${pathPrefix}.eventId`, 'eventId must be a non-empty string', 'required');
  }
  if (!isNonEmptyString(value.eventType)) {
    addIssue(issues, `${pathPrefix}.eventType`, 'eventType must be a non-empty string', 'required');
  }
  if (!isNonNegativeInt(value.eventVersion) || value.eventVersion < 1) {
    addIssue(issues, `${pathPrefix}.eventVersion`, 'eventVersion must be a positive integer');
  }
  if (!isUtcIso8601(value.occurredAt)) {
    addIssue(issues, `${pathPrefix}.occurredAt`, 'occurredAt must be a UTC ISO-8601 string', 'invalid_datetime');
  }
  if (!isNonEmptyString(value.correlationId)) {
    addIssue(issues, `${pathPrefix}.correlationId`, 'correlationId must be a non-empty string', 'required');
  }
  if (!isNonEmptyString(value.producer)) {
    addIssue(issues, `${pathPrefix}.producer`, 'producer must be a non-empty string', 'required');
  }
  if (!PRIVACY_CLASSES.has(value.privacyClass as PrivacyClass)) {
    addIssue(issues, `${pathPrefix}.privacyClass`, 'Invalid privacyClass', 'invalid_enum');
  }
  for (const optionalStr of ['sessionId', 'tenantId', 'userId', 'causationId', 'traceId', 'idempotencyKey']) {
    if (value[optionalStr] !== undefined && typeof value[optionalStr] !== 'string') {
      addIssue(issues, `${pathPrefix}.${optionalStr}`, `${optionalStr} must be a string`);
    }
  }
}

export function validateEventEnvelope<TPayload = Record<string, unknown>>(
  value: unknown,
  payloadValidator?: (payload: unknown) => ValidationResult<TPayload>,
): ValidationResult<EventEnvelope<TPayload>> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected EventEnvelope object');
    return { ok: false, issues };
  }
  validateEnvelopeMetaInternal(value, '$', issues);
  if (value.payload === undefined) {
    addIssue(issues, 'payload', 'payload is required', 'required');
  } else if (payloadValidator) {
    const res = payloadValidator(value.payload);
    if (!res.ok) {
      for (const issue of res.issues) {
        issues.push({
          ...issue,
          path: issue.path === '$' ? 'payload' : `payload.${issue.path}`,
        });
      }
    }
  }
  return succeedOrFail(value as unknown as EventEnvelope<TPayload>, issues);
}

export function validatePresentationExtractInput(
  value: unknown,
): ValidationResult<PresentationExtractInput> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected object');
    return { ok: false, issues };
  }
  if (!isNonEmptyString(value.filename)) {
    addIssue(issues, 'filename', 'filename must be a non-empty string', 'required');
  }
  if (value.mimeType !== undefined && typeof value.mimeType !== 'string') {
    addIssue(issues, 'mimeType', 'mimeType must be a string');
  }
  if (value.contentBase64 !== undefined && typeof value.contentBase64 !== 'string') {
    addIssue(issues, 'contentBase64', 'contentBase64 must be a string');
  }
  if (value.textContent !== undefined && typeof value.textContent !== 'string') {
    addIssue(issues, 'textContent', 'textContent must be a string');
  }
  if (typeof value.contentBase64 !== 'string' && typeof value.textContent !== 'string') {
    addIssue(issues, '$', 'Either contentBase64 or textContent must be provided', 'required');
  }
  return succeedOrFail(value as unknown as PresentationExtractInput, issues);
}

export function validatePresentationCompileInput(
  value: unknown,
): ValidationResult<PresentationCompileInput> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected object');
    return { ok: false, issues };
  }
  if (value.packId !== undefined && !isNonEmptyString(value.packId)) {
    addIssue(issues, 'packId', 'packId must be a non-empty string when provided');
  }
  if (!isNonEmptyString(value.title)) {
    addIssue(issues, 'title', 'title must be a non-empty string', 'required');
  }
  if (!SCENE_TYPES.has(value.sceneType as PresentationSceneType)) {
    addIssue(issues, 'sceneType', 'Invalid sceneType', 'invalid_enum');
  }
  if (value.mode !== undefined && !PRESENTATION_MODES.has(value.mode as PresentationMode)) {
    addIssue(issues, 'mode', 'mode must be rehearsal or live', 'invalid_enum');
  }
  if (!isNonEmptyString(value.goal)) {
    addIssue(issues, 'goal', 'goal must be a non-empty string', 'required');
  }
  if (typeof value.audience !== 'string') {
    addIssue(issues, 'audience', 'audience must be a string', 'required');
  }
  if (!isFiniteNumber(value.targetDurationSec) || value.targetDurationSec <= 0) {
    addIssue(issues, 'targetDurationSec', 'targetDurationSec must be > 0', 'out_of_range');
  }
  if (typeof value.rawMaterials !== 'string') {
    addIssue(issues, 'rawMaterials', 'rawMaterials must be a string', 'required');
  }
  for (const listField of ['sourceFilenames', 'keyFactsInput', 'forbiddenClaims']) {
    if (value[listField] !== undefined) {
      if (!Array.isArray(value[listField]) || value[listField].some((item) => typeof item !== 'string')) {
        addIssue(issues, listField, `${listField} must be an array of strings`);
      }
    }
  }
  if (value.useSamplePack !== undefined && typeof value.useSamplePack !== 'boolean') {
    addIssue(issues, 'useSamplePack', 'useSamplePack must be a boolean');
  }
  return succeedOrFail(value as unknown as PresentationCompileInput, issues);
}

function validateFactItem(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isPlainObject(value)) {
    addIssue(issues, path, 'Expected PresentationFactItem object');
    return;
  }
  if (!isNonEmptyString(value.id)) addIssue(issues, `${path}.id`, 'id is required', 'required');
  if (!isNonEmptyString(value.text)) addIssue(issues, `${path}.text`, 'text is required', 'required');
  if (!isNonEmptyString(value.source)) addIssue(issues, `${path}.source`, 'source is required', 'required');
  if (!isNonEmptyString(value.evidenceId)) {
    addIssue(issues, `${path}.evidenceId`, 'evidenceId is required', 'required');
  }
  for (const boolField of ['userConfirmed', 'locked', 'verified']) {
    if (typeof value[boolField] !== 'boolean') {
      addIssue(issues, `${path}.${boolField}`, `${boolField} must be boolean`);
    }
  }
}

function validateQACard(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isPlainObject(value)) {
    addIssue(issues, path, 'Expected PresentationQACard object');
    return;
  }
  if (!isNonEmptyString(value.id)) addIssue(issues, `${path}.id`, 'id is required', 'required');
  if (!isNonEmptyString(value.question)) {
    addIssue(issues, `${path}.question`, 'question is required', 'required');
  }
  if (typeof value.suggestedAnswer !== 'string') {
    addIssue(issues, `${path}.suggestedAnswer`, 'suggestedAnswer must be string');
  }
  if (value.isPrediction !== true) {
    addIssue(issues, `${path}.isPrediction`, 'isPrediction must strictly equal true', 'invalid_literal');
  }
  if (typeof value.prepared !== 'boolean') {
    addIssue(issues, `${path}.prepared`, 'prepared must be boolean');
  }
  if (!Array.isArray(value.evidenceIds) || value.evidenceIds.some((e) => typeof e !== 'string')) {
    addIssue(issues, `${path}.evidenceIds`, 'evidenceIds must be an array of strings');
  }
}

export function validatePresentationPackPatchInput(
  value: unknown,
): ValidationResult<PresentationPackPatchInput> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected object');
    return { ok: false, issues };
  }
  if (value.title !== undefined && !isNonEmptyString(value.title)) {
    addIssue(issues, 'title', 'title must be non-empty when provided');
  }
  if (value.goal !== undefined && typeof value.goal !== 'string') {
    addIssue(issues, 'goal', 'goal must be a string');
  }
  if (value.audience !== undefined && typeof value.audience !== 'string') {
    addIssue(issues, 'audience', 'audience must be a string');
  }
  if (
    value.targetDurationSec !== undefined &&
    (!isFiniteNumber(value.targetDurationSec) || value.targetDurationSec <= 0)
  ) {
    addIssue(issues, 'targetDurationSec', 'targetDurationSec must be > 0');
  }
  if (value.facts !== undefined) {
    if (!Array.isArray(value.facts)) {
      addIssue(issues, 'facts', 'facts must be an array');
    } else {
      value.facts.forEach((f, idx) => validateFactItem(f, `facts[${idx}]`, issues));
    }
  }
  if (value.qaCards !== undefined) {
    if (!Array.isArray(value.qaCards)) {
      addIssue(issues, 'qaCards', 'qaCards must be an array');
    } else {
      value.qaCards.forEach((q, idx) => validateQACard(q, `qaCards[${idx}]`, issues));
    }
  }
  if (
    value.forbiddenClaims !== undefined &&
    (!Array.isArray(value.forbiddenClaims) || value.forbiddenClaims.some((s) => typeof s !== 'string'))
  ) {
    addIssue(issues, 'forbiddenClaims', 'forbiddenClaims must be an array of strings');
  }
  return succeedOrFail(value as PresentationPackPatchInput, issues);
}

export function validateMemoryCreateInput(
  value: unknown,
  opts?: { requireConfirmed?: boolean },
): ValidationResult<MemoryCreateInput> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected object');
    return { ok: false, issues };
  }
  if (value.scenarioId !== 'universal' && !SCENARIO_IDS.has(value.scenarioId as ScenarioId)) {
    addIssue(issues, 'scenarioId', 'Invalid scenarioId', 'invalid_enum');
  }
  if (!MEMORY_CATEGORIES.has(value.category as MemoryCategory)) {
    addIssue(issues, 'category', 'Invalid memory category', 'invalid_enum');
  }
  if (!isNonEmptyString(value.title)) {
    addIssue(issues, 'title', 'title must be a non-empty string', 'required');
  }
  if (!isNonEmptyString(value.content)) {
    addIssue(issues, 'content', 'content must be a non-empty string', 'required');
  }
  if (typeof value.userConfirmed !== 'boolean') {
    addIssue(issues, 'userConfirmed', 'userConfirmed must be boolean', 'required');
  } else if (opts?.requireConfirmed && value.userConfirmed !== true) {
    addIssue(
      issues,
      'userConfirmed',
      'userConfirmed must be true before persisting MemoryItem',
      'consent_required',
    );
  }
  if (!PRIVACY_LEVELS.has(value.privacyLevel as PrivacyLevel)) {
    addIssue(issues, 'privacyLevel', 'Invalid privacyLevel', 'invalid_enum');
  }
  if (!DATA_SCOPES.has(value.scope as DataScope)) {
    addIssue(issues, 'scope', 'Invalid scope', 'invalid_enum');
  }
  if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some((t) => typeof t !== 'string'))) {
    addIssue(issues, 'tags', 'tags must be an array of strings');
  }
  return succeedOrFail(value as unknown as MemoryCreateInput, issues);
}

export function validateMemoryConfirmInput(value: unknown): ValidationResult<MemoryCreateInput> {
  return validateMemoryCreateInput(value, { requireConfirmed: true });
}

export function validateMemoryPatchInput(value: unknown): ValidationResult<MemoryPatchInput> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected object');
    return { ok: false, issues };
  }
  if (value.title !== undefined && !isNonEmptyString(value.title)) {
    addIssue(issues, 'title', 'title must be non-empty when provided');
  }
  if (value.content !== undefined && !isNonEmptyString(value.content)) {
    addIssue(issues, 'content', 'content must be non-empty when provided');
  }
  if (value.category !== undefined && !MEMORY_CATEGORIES.has(value.category as MemoryCategory)) {
    addIssue(issues, 'category', 'Invalid category', 'invalid_enum');
  }
  if (value.privacyLevel !== undefined && !PRIVACY_LEVELS.has(value.privacyLevel as PrivacyLevel)) {
    addIssue(issues, 'privacyLevel', 'Invalid privacyLevel', 'invalid_enum');
  }
  if (value.scope !== undefined && !DATA_SCOPES.has(value.scope as DataScope)) {
    addIssue(issues, 'scope', 'Invalid scope', 'invalid_enum');
  }
  if (value.userConfirmed !== undefined && typeof value.userConfirmed !== 'boolean') {
    addIssue(issues, 'userConfirmed', 'userConfirmed must be boolean');
  }
  if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some((t) => typeof t !== 'string'))) {
    addIssue(issues, 'tags', 'tags must be an array of strings');
  }
  return succeedOrFail(value as MemoryPatchInput, issues);
}

export function validateAuthSessionInput(value: unknown): ValidationResult<AuthSessionCreateInput> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected object');
    return { ok: false, issues };
  }
  for (const field of ['displayName', 'email', 'tenantId', 'inviteCode']) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      addIssue(issues, field, `${field} must be a string`);
    }
  }
  return succeedOrFail(value as AuthSessionCreateInput, issues);
}

export function validatePaymentCheckoutPreviewRequest(
  value: unknown,
): ValidationResult<PaymentCheckoutPreviewRequest> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected object');
    return { ok: false, issues };
  }
  if (!PLAN_ID_SET.has(String(value.planId))) {
    addIssue(issues, 'planId', 'Invalid planId', 'invalid_enum');
  }
  if (!['one_time_14d', 'monthly', 'annual'].includes(String(value.billingCycle))) {
    addIssue(issues, 'billingCycle', 'Invalid billingCycle', 'invalid_enum');
  }
  if (!['sandbox', 'wechat_pay', 'alipay'].includes(String(value.paymentChannel))) {
    addIssue(issues, 'paymentChannel', 'Invalid paymentChannel', 'invalid_enum');
  }
  if (value.couponCode !== undefined && typeof value.couponCode !== 'string') {
    addIssue(issues, 'couponCode', 'couponCode must be a string');
  }
  return succeedOrFail(value as unknown as PaymentCheckoutPreviewRequest, issues);
}

export function validatePaymentWebhookEvent(
  value: unknown,
): ValidationResult<PaymentWebhookEvent> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected object');
    return { ok: false, issues };
  }
  if (!isNonEmptyString(value.eventId)) addIssue(issues, 'eventId', 'eventId is required', 'required');
  if (!['sandbox', 'wechat_pay', 'alipay'].includes(String(value.provider))) {
    addIssue(issues, 'provider', 'Invalid provider', 'invalid_enum');
  }
  if (!['payment.succeeded', 'payment.refunded', 'subscription.cancelled'].includes(String(value.eventType))) {
    addIssue(issues, 'eventType', 'Invalid eventType', 'invalid_enum');
  }
  if (!isNonEmptyString(value.userId)) addIssue(issues, 'userId', 'userId is required', 'required');
  if (!PLAN_ID_SET.has(String(value.planId))) {
    addIssue(issues, 'planId', 'Invalid planId', 'invalid_enum');
  }
  const amountRes = validateMoneyAmount(value.amount, 'amount');
  if (!amountRes.ok) issues.push(...amountRes.issues);
  if (!isNonEmptyString(value.idempotencyKey)) {
    addIssue(issues, 'idempotencyKey', 'idempotencyKey is required', 'required');
  }
  if (!isUtcIso8601(value.occurredAt)) {
    addIssue(issues, 'occurredAt', 'occurredAt must be UTC ISO-8601', 'invalid_datetime');
  }
  return succeedOrFail(value as unknown as PaymentWebhookEvent, issues);
}

export function validateEvidence(value: unknown, path = '$'): ValidationResult<Evidence> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, path, 'Expected Evidence object');
    return { ok: false, issues };
  }
  const prefix = path === '$' ? '' : `${path}.`;
  if (!isNonEmptyString(value.id)) addIssue(issues, `${prefix}id`, 'id is required', 'required');
  if (!isNonNegativeInt(value.schemaVersion) || value.schemaVersion < 1) {
    addIssue(issues, `${prefix}schemaVersion`, 'schemaVersion must be a positive integer');
  }
  if (!isNonEmptyString(value.text)) addIssue(issues, `${prefix}text`, 'text is required', 'required');
  if (!isNonEmptyString(value.source)) addIssue(issues, `${prefix}source`, 'source is required', 'required');
  for (const dt of ['timestamp', 'createdAt', 'updatedAt']) {
    if (!isUtcIso8601(value[dt])) {
      addIssue(issues, `${prefix}${dt}`, `${dt} must be a UTC ISO-8601 string`, 'invalid_datetime');
    }
  }
  if (!isFiniteNumber(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    addIssue(issues, `${prefix}confidence`, 'confidence must be within [0, 1]');
  }
  if (!DATA_SCOPES.has(value.scope as DataScope)) {
    addIssue(issues, `${prefix}scope`, 'Invalid scope', 'invalid_enum');
  }
  if (!PRIVACY_LEVELS.has(value.privacyLevel as PrivacyLevel)) {
    addIssue(issues, `${prefix}privacyLevel`, 'Invalid privacyLevel', 'invalid_enum');
  }
  if (!EVIDENCE_LIFECYCLES.has(value.lifecycle as EvidenceLifecycle)) {
    addIssue(issues, `${prefix}lifecycle`, 'Invalid lifecycle', 'invalid_enum');
  }
  for (const boolField of ['userConfirmed', 'verified', 'locked']) {
    if (typeof value[boolField] !== 'boolean') {
      addIssue(issues, `${prefix}${boolField}`, `${boolField} must be boolean`);
    }
  }
  return succeedOrFail(value as unknown as Evidence, issues);
}

export function validateContextPack(value: unknown): ValidationResult<ContextPack> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected ContextPack object');
    return { ok: false, issues };
  }
  if (!isNonEmptyString(value.packId)) addIssue(issues, 'packId', 'packId is required', 'required');
  if (!isNonNegativeInt(value.schemaVersion) || value.schemaVersion < 1) {
    addIssue(issues, 'schemaVersion', 'schemaVersion must be a positive integer');
  }
  if (!SCENARIO_IDS.has(value.scenarioId as ScenarioId)) {
    addIssue(issues, 'scenarioId', 'Invalid scenarioId', 'invalid_enum');
  }
  if (!isNonEmptyString(value.title)) addIssue(issues, 'title', 'title is required', 'required');
  if (!isNonEmptyString(value.goal)) addIssue(issues, 'goal', 'goal is required', 'required');
  if (!Array.isArray(value.constraints)) addIssue(issues, 'constraints', 'constraints must be an array');
  if (!Array.isArray(value.forbiddenClaims)) {
    addIssue(issues, 'forbiddenClaims', 'forbiddenClaims must be an array');
  }
  if (!Array.isArray(value.chapters)) addIssue(issues, 'chapters', 'chapters must be an array');
  if (!Array.isArray(value.evidence)) {
    addIssue(issues, 'evidence', 'evidence must be an array');
  } else {
    value.evidence.forEach((ev, idx) => {
      const res = validateEvidence(ev, `evidence[${idx}]`);
      if (!res.ok) issues.push(...res.issues);
    });
  }
  if (!isUtcIso8601(value.createdAt)) {
    addIssue(issues, 'createdAt', 'createdAt must be UTC ISO-8601', 'invalid_datetime');
  }
  if (!isUtcIso8601(value.updatedAt)) {
    addIssue(issues, 'updatedAt', 'updatedAt must be UTC ISO-8601', 'invalid_datetime');
  }
  return succeedOrFail(value as unknown as ContextPack, issues);
}

export function validatePresentationContextPack(
  value: unknown,
): ValidationResult<PresentationContextPack> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected PresentationContextPack object');
    return { ok: false, issues };
  }
  if (!isNonEmptyString(value.packId)) addIssue(issues, 'packId', 'packId is required', 'required');
  if (!isNonNegativeInt(value.schemaVersion) || value.schemaVersion < 1) {
    addIssue(issues, 'schemaVersion', 'schemaVersion must be a positive integer');
  }
  if (value.scenarioId !== 'presentation') {
    addIssue(issues, 'scenarioId', "scenarioId must be 'presentation'", 'invalid_literal');
  }
  if (!isNonEmptyString(value.title)) addIssue(issues, 'title', 'title is required', 'required');
  if (!SCENE_TYPES.has(value.sceneType as PresentationSceneType)) {
    addIssue(issues, 'sceneType', 'Invalid sceneType', 'invalid_enum');
  }
  if (!isNonEmptyString(value.goal)) addIssue(issues, 'goal', 'goal is required', 'required');
  if (!isFiniteNumber(value.targetDurationSec) || value.targetDurationSec <= 0) {
    addIssue(issues, 'targetDurationSec', 'targetDurationSec must be > 0');
  }
  if (!isPlainObject(value.cueSheet)) {
    addIssue(issues, 'cueSheet', 'cueSheet must be an object');
  }
  if (!Array.isArray(value.facts)) {
    addIssue(issues, 'facts', 'facts must be an array');
  } else {
    value.facts.forEach((f, idx) => validateFactItem(f, `facts[${idx}]`, issues));
  }
  if (!Array.isArray(value.qaCards)) {
    addIssue(issues, 'qaCards', 'qaCards must be an array');
  } else {
    value.qaCards.forEach((q, idx) => validateQACard(q, `qaCards[${idx}]`, issues));
  }
  if (!Array.isArray(value.progressNodes)) {
    addIssue(issues, 'progressNodes', 'progressNodes must be an array');
  }
  if (!Array.isArray(value.evidence)) {
    addIssue(issues, 'evidence', 'evidence must be an array');
  } else {
    value.evidence.forEach((ev, idx) => {
      const res = validateEvidence(ev, `evidence[${idx}]`);
      if (!res.ok) issues.push(...res.issues);
    });
  }
  if (!isUtcIso8601(value.createdAt)) {
    addIssue(issues, 'createdAt', 'createdAt must be UTC ISO-8601', 'invalid_datetime');
  }
  if (!isUtcIso8601(value.updatedAt)) {
    addIssue(issues, 'updatedAt', 'updatedAt must be UTC ISO-8601', 'invalid_datetime');
  }
  return succeedOrFail(value as unknown as PresentationContextPack, issues);
}

export function validateMemoryItem(value: unknown): ValidationResult<MemoryItem> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected MemoryItem object');
    return { ok: false, issues };
  }
  if (!isNonEmptyString(value.memoryId)) {
    addIssue(issues, 'memoryId', 'memoryId is required', 'required');
  }
  if (!isNonNegativeInt(value.schemaVersion) || value.schemaVersion < 1) {
    addIssue(issues, 'schemaVersion', 'schemaVersion must be a positive integer');
  }
  if (value.scenarioId !== 'universal' && !SCENARIO_IDS.has(value.scenarioId as ScenarioId)) {
    addIssue(issues, 'scenarioId', 'Invalid scenarioId', 'invalid_enum');
  }
  if (!MEMORY_CATEGORIES.has(value.category as MemoryCategory)) {
    addIssue(issues, 'category', 'Invalid category', 'invalid_enum');
  }
  if (!isNonEmptyString(value.title)) addIssue(issues, 'title', 'title is required', 'required');
  if (!isNonEmptyString(value.content)) addIssue(issues, 'content', 'content is required', 'required');
  if (typeof value.userConfirmed !== 'boolean') {
    addIssue(issues, 'userConfirmed', 'userConfirmed must be boolean');
  }
  if (!PRIVACY_LEVELS.has(value.privacyLevel as PrivacyLevel)) {
    addIssue(issues, 'privacyLevel', 'Invalid privacyLevel', 'invalid_enum');
  }
  if (!DATA_SCOPES.has(value.scope as DataScope)) {
    addIssue(issues, 'scope', 'Invalid scope', 'invalid_enum');
  }
  if (!isUtcIso8601(value.createdAt)) {
    addIssue(issues, 'createdAt', 'createdAt must be UTC ISO-8601', 'invalid_datetime');
  }
  if (!isUtcIso8601(value.updatedAt)) {
    addIssue(issues, 'updatedAt', 'updatedAt must be UTC ISO-8601', 'invalid_datetime');
  }
  return succeedOrFail(value as unknown as MemoryItem, issues);
}

export function validateTelemetryUsage(value: unknown): ValidationResult<TelemetryUsage> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected TelemetryUsage object');
    return { ok: false, issues };
  }
  if (!isNonEmptyString(value.sessionId)) {
    addIssue(issues, 'sessionId', 'sessionId is required', 'required');
  }
  if (!isUtcIso8601(value.updatedAt)) {
    addIssue(issues, 'updatedAt', 'updatedAt must be UTC ISO-8601', 'invalid_datetime');
  }
  if (!TELEMETRY_SOURCES.has(value.usageSource as TelemetryUsageSource)) {
    addIssue(issues, 'usageSource', 'Invalid usageSource', 'invalid_enum');
  }
  for (const intField of [
    'inputTokens',
    'outputTokens',
    'cachedInputTokens',
    'totalTokens',
    'modelCalls',
    'retries',
    'localRuleEvaluations',
    'costFen',
  ]) {
    if (!isNonNegativeInt(value[intField])) {
      addIssue(issues, intField, `${intField} must be a non-negative safe integer`);
    }
  }
  if (!isFiniteNumber(value.latencyMs) || value.latencyMs < 0) {
    addIssue(issues, 'latencyMs', 'latencyMs must be >= 0');
  }
  if (!isFiniteNumber(value.asrDurationMs) || value.asrDurationMs < 0) {
    addIssue(issues, 'asrDurationMs', 'asrDurationMs must be >= 0');
  }
  if (typeof value.asrProvider !== 'string') {
    addIssue(issues, 'asrProvider', 'asrProvider must be a string');
  }
  if (typeof value.degraded !== 'boolean') {
    addIssue(issues, 'degraded', 'degraded must be a boolean');
  }
  if (typeof value.usingLocalFallback !== 'boolean') {
    addIssue(issues, 'usingLocalFallback', 'usingLocalFallback must be a boolean');
  }
  const costRes = validateMoneyAmount(value.cost, 'cost');
  if (!costRes.ok) issues.push(...costRes.issues);
  if (!isPlainObject(value.latencyStats)) {
    addIssue(issues, 'latencyStats', 'latencyStats must be an object');
  } else {
    for (const metric of ['avgMs', 'p95Ms', 'maxMs']) {
      if (!isFiniteNumber(value.latencyStats[metric]) || (value.latencyStats[metric] as number) < 0) {
        addIssue(issues, `latencyStats.${metric}`, `${metric} must be >= 0`);
      }
    }
  }
  if (value.reasoningTokens !== undefined && !isNonNegativeInt(value.reasoningTokens)) {
    addIssue(issues, 'reasoningTokens', 'reasoningTokens must be a non-negative safe integer');
  }
  return succeedOrFail(value as unknown as TelemetryUsage, issues);
}

export function validateUsageRecord(value: unknown): ValidationResult<UsageRecord> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected UsageRecord object');
    return { ok: false, issues };
  }
  if (!isNonEmptyString(value.id)) addIssue(issues, 'id', 'id is required', 'required');
  if (!isNonEmptyString(value.userId)) addIssue(issues, 'userId', 'userId is required', 'required');
  if (!USAGE_TYPES.has(value.usageType as UsageRecord['usageType'])) {
    addIssue(issues, 'usageType', 'Invalid usageType', 'invalid_enum');
  }
  if (!isFiniteNumber(value.quantity) || value.quantity < 0) {
    addIssue(issues, 'quantity', 'quantity must be >= 0');
  }
  if (!USAGE_UNITS.has(value.unit as UsageRecord['unit'])) {
    addIssue(issues, 'unit', 'Invalid unit', 'invalid_enum');
  }
  if (!isUtcIso8601(value.occurredAt)) {
    addIssue(issues, 'occurredAt', 'occurredAt must be UTC ISO-8601', 'invalid_datetime');
  }
  if (!isNonEmptyString(value.idempotencyKey)) {
    addIssue(issues, 'idempotencyKey', 'idempotencyKey is required', 'required');
  }
  if (!isNonEmptyString(value.source)) addIssue(issues, 'source', 'source is required', 'required');
  if (value.costFen !== undefined && !isNonNegativeInt(value.costFen)) {
    addIssue(issues, 'costFen', 'costFen must be a non-negative safe integer');
  }
  return succeedOrFail(value as unknown as UsageRecord, issues);
}

export function validateClientMessage(value: unknown): ValidationResult<ClientMessage> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected ClientMessage object');
    return { ok: false, issues };
  }
  if (!isNonEmptyString(value.type)) {
    addIssue(issues, 'type', 'type is required', 'required');
    return { ok: false, issues };
  }
  if (!isPlainObject(value.payload)) {
    addIssue(issues, 'payload', 'payload must be an object', 'required');
    return { ok: false, issues };
  }
  if (value.envelope !== undefined) {
    validateEnvelopeMetaInternal(value.envelope, 'envelope', issues);
  }
  if (value.idempotencyKey !== undefined && typeof value.idempotencyKey !== 'string') {
    addIssue(issues, 'idempotencyKey', 'idempotencyKey must be a string');
  }
  if (value.correlationId !== undefined && typeof value.correlationId !== 'string') {
    addIssue(issues, 'correlationId', 'correlationId must be a string');
  }
  if (value.clientSeq !== undefined && !isNonNegativeInt(value.clientSeq)) {
    addIssue(issues, 'clientSeq', 'clientSeq must be a non-negative safe integer');
  }

  const p = value.payload;
  const requireSessionId = () => {
    if (!isNonEmptyString(p.sessionId)) {
      addIssue(issues, 'payload.sessionId', 'sessionId is required', 'required');
    }
  };

  switch (value.type) {
    case 'session.start':
      if (!SCENARIO_IDS.has(p.scenarioId as ScenarioId)) {
        addIssue(issues, 'payload.scenarioId', 'Invalid scenarioId', 'invalid_enum');
      }
      if (!PRESENTATION_MODES.has(p.mode as PresentationMode)) {
        addIssue(issues, 'payload.mode', 'mode must be rehearsal or live', 'invalid_enum');
      }
      if (p.viewMode !== undefined && !VIEW_MODES.has(p.viewMode as ViewMode)) {
        addIssue(issues, 'payload.viewMode', 'Invalid viewMode', 'invalid_enum');
      }
      if (
        p.maxInterventionLevel !== undefined &&
        !INTERVENTION_LEVELS.has(p.maxInterventionLevel as InterventionLevel)
      ) {
        addIssue(issues, 'payload.maxInterventionLevel', 'Invalid maxInterventionLevel', 'invalid_enum');
      }
      if (typeof p.privacyNoticeAccepted !== 'boolean') {
        addIssue(issues, 'payload.privacyNoticeAccepted', 'privacyNoticeAccepted must be boolean');
      }
      break;
    case 'session.stop':
    case 'session.pause':
    case 'session.resume':
    case 'session.end':
    case 'session.wipe':
      requireSessionId();
      break;
    case 'session.silent':
      requireSessionId();
      if (typeof p.silentMode !== 'boolean') {
        addIssue(issues, 'payload.silentMode', 'silentMode must be boolean');
      }
      break;
    case 'audio.chunk':
      if (p.format !== 'pcm16' && p.format !== 'opus') {
        addIssue(issues, 'payload.format', "format must be 'pcm16' or 'opus'");
      }
      if (!isFiniteNumber(p.sampleRate) || p.sampleRate <= 0) {
        addIssue(issues, 'payload.sampleRate', 'sampleRate must be > 0');
      }
      if (!isFiniteNumber(p.channels) || p.channels < 1) {
        addIssue(issues, 'payload.channels', 'channels must be >= 1');
      }
      if (typeof p.data !== 'string') {
        addIssue(issues, 'payload.data', 'data must be base64 string');
      }
      if (!isFiniteNumber(p.timestamp)) {
        addIssue(issues, 'payload.timestamp', 'timestamp must be numeric frame timestamp');
      }
      break;
    case 'speech.delta':
      if (typeof p.text !== 'string') addIssue(issues, 'payload.text', 'text must be string');
      if (typeof p.isFinal !== 'boolean') addIssue(issues, 'payload.isFinal', 'isFinal must be boolean');
      if (p.speaker !== undefined && !TRANSCRIPT_SPEAKERS.has(p.speaker as TranscriptSpeaker)) {
        addIssue(issues, 'payload.speaker', 'Invalid speaker', 'invalid_enum');
      }
      break;
    case 'chapter.set':
      requireSessionId();
      if (!isNonEmptyString(p.chapterId)) {
        addIssue(issues, 'payload.chapterId', 'chapterId is required', 'required');
      }
      break;
    case 'intervention.request_help':
      requireSessionId();
      if (
        p.preferredLevel !== undefined &&
        !INTERVENTION_LEVELS.has(p.preferredLevel as InterventionLevel)
      ) {
        addIssue(issues, 'payload.preferredLevel', 'Invalid preferredLevel', 'invalid_enum');
      }
      break;
    case 'intervention.dismiss':
      requireSessionId();
      break;
    case 'intervention.set_ceiling':
      requireSessionId();
      if (!INTERVENTION_LEVELS.has(p.maxLevel as InterventionLevel)) {
        addIssue(issues, 'payload.maxLevel', 'Invalid maxLevel', 'invalid_enum');
      }
      break;
    case 'intervention.feedback':
      requireSessionId();
      if (!isNonEmptyString(p.interventionId)) {
        addIssue(issues, 'payload.interventionId', 'interventionId is required', 'required');
      }
      if (p.feedback !== 'helpful' && p.feedback !== 'distracting') {
        addIssue(issues, 'payload.feedback', "feedback must be 'helpful' or 'distracting'");
      }
      break;
    case 'rehearsal.start':
      if (!isNonEmptyString(p.sourceSessionId)) {
        addIssue(issues, 'payload.sourceSessionId', 'sourceSessionId is required', 'required');
      }
      if (!isNonEmptyString(p.packId)) {
        addIssue(issues, 'payload.packId', 'packId is required', 'required');
      }
      if (!isNonEmptyString(p.weakSegmentId)) {
        addIssue(issues, 'payload.weakSegmentId', 'weakSegmentId is required', 'required');
      }
      if (!isNonEmptyString(p.chapterId)) {
        addIssue(issues, 'payload.chapterId', 'chapterId is required', 'required');
      }
      break;
    case 'view.mode':
      requireSessionId();
      if (!VIEW_MODES.has(p.viewMode as ViewMode)) {
        addIssue(issues, 'payload.viewMode', "viewMode must be 'focus' or 'inspector'");
      }
      break;
    case 'ping':
      if (!isFiniteNumber(p.t)) {
        addIssue(issues, 'payload.t', 't must be a finite number');
      }
      break;
    default:
      addIssue(issues, 'type', `Unsupported ClientMessage type: ${String(value.type)}`, 'unknown_type');
      break;
  }
  return succeedOrFail(value as unknown as ClientMessage, issues);
}

export interface ProtocolSchema<T> {
  validate(value: unknown): ValidationResult<T>;
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: ValidationIssue[] } };
  parse(value: unknown): T;
}

function createProtocolSchema<T>(
  validator: (value: unknown) => ValidationResult<T>,
): ProtocolSchema<T> {
  return {
    validate: validator,
    safeParse(value: unknown) {
      const result = validator(value);
      return result.ok
        ? { success: true, data: result.value }
        : { success: false, error: { issues: result.issues } };
    },
    parse(value: unknown): T {
      const result = validator(value);
      if (!result.ok) {
        const first = result.issues[0];
        throw new TypeError(
          `Schema validation failed at ${first?.path ?? '$'}: ${first?.message ?? 'invalid payload'}`,
        );
      }
      return result.value;
    },
  };
}

export function validateColabAsrLifecycleState(
  value: unknown,
): ValidationResult<ColabAsrLifecycleState> {
  const issues: ValidationIssue[] = [];
  if (
    typeof value !== 'string' ||
    !COLAB_LIFECYCLE_STATE_SET.has(value as ColabAsrLifecycleState)
  ) {
    addIssue(
      issues,
      '$',
      `lifecycleState must be one of: ${COLAB_ASR_LIFECYCLE_STATES.join(', ')}`,
      'invalid_enum',
    );
  }
  return succeedOrFail(value as ColabAsrLifecycleState, issues);
}

export const ColabAsrLifecycleStateSchema: ProtocolSchema<ColabAsrLifecycleState> & {
  readonly values: typeof COLAB_ASR_LIFECYCLE_STATES;
} = {
  values: COLAB_ASR_LIFECYCLE_STATES,
  ...createProtocolSchema(validateColabAsrLifecycleState),
};

export function validateAsrCapabilityStatus(
  value: unknown,
): ValidationResult<AsrCapabilityStatus> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected AsrCapabilityStatus object');
    return { ok: false, issues };
  }
  if (!isNonEmptyString(value.backend)) {
    addIssue(issues, 'backend', 'backend is required', 'required');
  }
  if (typeof value.mode !== 'string' || !ASR_BACKEND_MODE_SET.has(value.mode as AsrBackendMode)) {
    addIssue(
      issues,
      'mode',
      `mode must be one of: ${ASR_BACKEND_MODES.join(', ')}`,
      'invalid_enum',
    );
  }
  if (typeof value.available !== 'boolean') {
    addIssue(issues, 'available', 'available must be a boolean');
  }
  if (typeof value.streaming !== 'boolean') {
    addIssue(issues, 'streaming', 'streaming must be a boolean');
  }
  if (typeof value.detail !== 'string') {
    addIssue(issues, 'detail', 'detail must be a string');
  }
  if (
    value.lifecycleState !== undefined &&
    !COLAB_LIFECYCLE_STATE_SET.has(value.lifecycleState as ColabAsrLifecycleState)
  ) {
    addIssue(
      issues,
      'lifecycleState',
      `lifecycleState must be one of: ${COLAB_ASR_LIFECYCLE_STATES.join(', ')}`,
      'invalid_enum',
    );
  }
  if (value.gpuName !== undefined && typeof value.gpuName !== 'string') {
    addIssue(issues, 'gpuName', 'gpuName must be a string');
  }
  if (value.modelId !== undefined && typeof value.modelId !== 'string') {
    addIssue(issues, 'modelId', 'modelId must be a string');
  }
  if (value.rtf !== undefined && (!isFiniteNumber(value.rtf) || value.rtf < 0)) {
    addIssue(issues, 'rtf', 'rtf must be a finite number >= 0');
  }
  if (value.lastHealthCheckAt !== undefined && !isUtcIso8601(value.lastHealthCheckAt)) {
    addIssue(issues, 'lastHealthCheckAt', 'lastHealthCheckAt must be UTC ISO-8601', 'invalid_datetime');
  }
  if (value.fallbackActive !== undefined && typeof value.fallbackActive !== 'boolean') {
    addIssue(issues, 'fallbackActive', 'fallbackActive must be a boolean');
  }
  if (value.fallbackReason !== undefined && typeof value.fallbackReason !== 'string') {
    addIssue(issues, 'fallbackReason', 'fallbackReason must be a string');
  }
  return succeedOrFail(value as unknown as AsrCapabilityStatus, issues);
}

export const AsrCapabilityStatusSchema: ProtocolSchema<AsrCapabilityStatus> & {
  readonly modes: typeof ASR_BACKEND_MODES;
  readonly lifecycleStates: typeof COLAB_ASR_LIFECYCLE_STATES;
} = {
  modes: ASR_BACKEND_MODES,
  lifecycleStates: COLAB_ASR_LIFECYCLE_STATES,
  ...createProtocolSchema(validateAsrCapabilityStatus),
};

export function validateProviderUsageRecord(
  value: unknown,
): ValidationResult<ProviderUsageRecord> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) {
    addIssue(issues, '$', 'Expected ProviderUsageRecord object');
    return { ok: false, issues };
  }
  for (const intField of ['inputTokens', 'outputTokens', 'cachedInputTokens', 'modelCalls']) {
    if (!isNonNegativeInt(value[intField])) {
      addIssue(issues, intField, `${intField} must be a non-negative safe integer`);
    }
  }
  if (!TELEMETRY_SOURCES.has(value.usageSource as TelemetryUsageSource)) {
    addIssue(
      issues,
      'usageSource',
      `usageSource must be one of: ${TELEMETRY_USAGE_SOURCES.join(', ')}`,
      'invalid_enum',
    );
  }
  for (const optIntField of ['reasoningTokens', 'retries', 'costFen']) {
    if (value[optIntField] !== undefined && !isNonNegativeInt(value[optIntField])) {
      addIssue(issues, optIntField, `${optIntField} must be a non-negative safe integer`);
    }
  }
  if (value.degraded !== undefined && typeof value.degraded !== 'boolean') {
    addIssue(issues, 'degraded', 'degraded must be a boolean');
  }
  if (value.provider !== undefined && typeof value.provider !== 'string') {
    addIssue(issues, 'provider', 'provider must be a string');
  }
  if (value.model !== undefined && typeof value.model !== 'string') {
    addIssue(issues, 'model', 'model must be a string');
  }
  if (value.correlationId !== undefined && !isNonEmptyString(value.correlationId)) {
    addIssue(issues, 'correlationId', 'correlationId must be a non-empty string');
  }
  return succeedOrFail(value as unknown as ProviderUsageRecord, issues);
}

export const ProviderUsageRecordSchema: ProtocolSchema<ProviderUsageRecord> & {
  readonly usageSources: typeof TELEMETRY_USAGE_SOURCES;
} = {
  usageSources: TELEMETRY_USAGE_SOURCES,
  ...createProtocolSchema(validateProviderUsageRecord),
};
