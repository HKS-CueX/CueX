/**
 * Backward-compatible v1 -> v2 schema normalizers for persisted ContextPacks, Evidence, MemoryItems, Sessions, and Telemetry.
 */

import type { TelemetryUsage, TelemetryUsageSource } from '#src/common';
import type { ContextPack, Evidence, MemoryItem, Session } from '#src/entities';
import type { ClientMessage } from '#src/events';
import type { PresentationContextPack } from '#src/presentation';
import {
  EVIDENCE_SCHEMA_VERSION,
  MEMORY_SCHEMA_VERSION,
  PACK_SCHEMA_VERSION,
  createMoneyAmount,
  nowUtcIso8601,
} from '#src/versions';
import type { UtcIso8601 } from '#src/versions';

/**
 * Safely normalizes legacy numeric epoch ms, Date objects, or date strings into UTC ISO-8601.
 */
export function toUtcIso8601(value: unknown, fallback?: UtcIso8601): UtcIso8601 {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{10,16}$/.test(trimmed)) {
      const numeric = Number(trimmed);
      const ms = trimmed.length <= 10 ? numeric * 1000 : numeric;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return fallback ?? nowUtcIso8601();
}

export function normalizeEvidenceV1ToV2(
  raw: Record<string, unknown>,
  fallbackNow?: UtcIso8601,
): Evidence {
  const baseNow = fallbackNow ?? nowUtcIso8601();
  const timestamp = toUtcIso8601(raw.timestamp, baseNow);
  const createdAt = toUtcIso8601(raw.createdAt ?? raw.timestamp, timestamp);
  const updatedAt = toUtcIso8601(raw.updatedAt ?? raw.timestamp, createdAt);
  return {
    id: String(raw.id ?? ''),
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    text: String(raw.text ?? ''),
    source: String(raw.source ?? 'legacy_import'),
    ...(typeof raw.sourceType === 'string' ? { sourceType: raw.sourceType as Evidence['sourceType'] } : {}),
    ...(typeof raw.sourceDocumentId === 'string' ? { sourceDocumentId: raw.sourceDocumentId } : {}),
    ...(typeof raw.locationRef === 'string' ? { locationRef: raw.locationRef } : {}),
    ...(typeof raw.contentHash === 'string' ? { contentHash: raw.contentHash } : {}),
    ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
    ...(Array.isArray(raw.tags) ? { tags: raw.tags.map(String) } : {}),
    timestamp,
    createdAt,
    updatedAt,
    confidence: typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? raw.confidence : 0.8,
    scope: (raw.scope as Evidence['scope']) ?? 'session',
    privacyLevel: (raw.privacyLevel as Evidence['privacyLevel']) ?? 'session',
    userConfirmed: Boolean(raw.userConfirmed),
    verified: Boolean(raw.verified),
    locked: Boolean(raw.locked),
    lifecycle: (raw.lifecycle as Evidence['lifecycle']) ?? 'active',
  };
}

export function normalizeMemoryItemV1ToV2(
  raw: Record<string, unknown>,
  fallbackNow?: UtcIso8601,
): MemoryItem {
  const baseNow = fallbackNow ?? nowUtcIso8601();
  const createdAt = toUtcIso8601(raw.createdAt, baseNow);
  const updatedAt = toUtcIso8601(raw.updatedAt ?? raw.createdAt, createdAt);
  return {
    memoryId: String(raw.memoryId ?? ''),
    schemaVersion: MEMORY_SCHEMA_VERSION,
    ...(typeof raw.tenantId === 'string' ? { tenantId: raw.tenantId } : {}),
    ...(typeof raw.userId === 'string' ? { userId: raw.userId } : {}),
    scenarioId: (raw.scenarioId as MemoryItem['scenarioId']) ?? 'universal',
    category: (raw.category as MemoryItem['category']) ?? 'fact',
    title: String(raw.title ?? ''),
    content: String(raw.content ?? ''),
    ...(Array.isArray(raw.tags) ? { tags: raw.tags.map(String) } : {}),
    ...(typeof raw.sourceSessionId === 'string' ? { sourceSessionId: raw.sourceSessionId } : {}),
    userConfirmed: Boolean(raw.userConfirmed),
    privacyLevel: (raw.privacyLevel as MemoryItem['privacyLevel']) ?? 'local_private',
    scope: (raw.scope as MemoryItem['scope']) ?? 'global',
    createdAt,
    updatedAt,
  };
}

export function normalizeContextPackV1ToV2(
  raw: Record<string, unknown>,
  fallbackNow?: UtcIso8601,
): ContextPack {
  const baseNow = fallbackNow ?? nowUtcIso8601();
  const createdAt = toUtcIso8601(raw.createdAt, baseNow);
  const updatedAt = toUtcIso8601(raw.updatedAt ?? raw.createdAt, createdAt);
  const rawEvidence = Array.isArray(raw.evidence) ? raw.evidence : [];
  return {
    packId: String(raw.packId ?? ''),
    schemaVersion: PACK_SCHEMA_VERSION,
    ...(typeof raw.tenantId === 'string' ? { tenantId: raw.tenantId } : {}),
    ...(typeof raw.userId === 'string' ? { userId: raw.userId } : {}),
    scenarioId: (raw.scenarioId as ContextPack['scenarioId']) ?? 'presentation',
    title: String(raw.title ?? ''),
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    goal: String(raw.goal ?? ''),
    ...(typeof raw.audience === 'string' ? { audience: raw.audience } : {}),
    ...(typeof raw.targetDurationSec === 'number' ? { targetDurationSec: raw.targetDurationSec } : {}),
    constraints: Array.isArray(raw.constraints) ? raw.constraints.map(String) : [],
    forbiddenClaims: Array.isArray(raw.forbiddenClaims) ? raw.forbiddenClaims.map(String) : [],
    chapters: Array.isArray(raw.chapters) ? (raw.chapters as ContextPack['chapters']) : [],
    evidence: rawEvidence.map((item) =>
      normalizeEvidenceV1ToV2((item ?? {}) as Record<string, unknown>, updatedAt),
    ),
    createdAt,
    updatedAt,
    ...(typeof raw.metadata === 'object' && raw.metadata !== null
      ? { metadata: raw.metadata as Record<string, unknown> }
      : {}),
  };
}

export function normalizePresentationContextPackV1ToV2(
  raw: Record<string, unknown>,
  fallbackNow?: UtcIso8601,
): PresentationContextPack {
  const baseNow = fallbackNow ?? nowUtcIso8601();
  const createdAt = toUtcIso8601(raw.createdAt, baseNow);
  const updatedAt = toUtcIso8601(raw.updatedAt ?? raw.createdAt, createdAt);
  const rawEvidence = Array.isArray(raw.evidence) ? raw.evidence : [];
  const rawFacts = Array.isArray(raw.facts) ? raw.facts : [];
  const rawQaCards = Array.isArray(raw.qaCards) ? raw.qaCards : [];

  return {
    packId: String(raw.packId ?? ''),
    schemaVersion: PACK_SCHEMA_VERSION,
    ...(typeof raw.tenantId === 'string' ? { tenantId: raw.tenantId } : {}),
    ...(typeof raw.userId === 'string' ? { userId: raw.userId } : {}),
    scenarioId: 'presentation',
    title: String(raw.title ?? ''),
    sceneType: (raw.sceneType as PresentationContextPack['sceneType']) ?? 'general',
    goal: String(raw.goal ?? ''),
    audience: String(raw.audience ?? ''),
    targetDurationSec: typeof raw.targetDurationSec === 'number' ? raw.targetDurationSec : 300,
    cueSheet: raw.cueSheet as PresentationContextPack['cueSheet'],
    facts: rawFacts.map((item) => {
      const f = (item ?? {}) as Record<string, unknown>;
      return {
        id: String(f.id ?? ''),
        text: String(f.text ?? ''),
        category: (f.category as PresentationContextPack['facts'][number]['category']) ?? 'claim',
        source: String(f.source ?? ''),
        userConfirmed: Boolean(f.userConfirmed),
        locked: Boolean(f.locked),
        verified: Boolean(f.verified),
        evidenceId: String(f.evidenceId ?? ''),
        ...(typeof f.notes === 'string' ? { notes: f.notes } : {}),
      };
    }),
    qaCards: rawQaCards.map((item) => {
      const q = (item ?? {}) as Record<string, unknown>;
      return {
        id: String(q.id ?? ''),
        question: String(q.question ?? ''),
        rationale: String(q.rationale ?? ''),
        suggestedAnswer: String(q.suggestedAnswer ?? ''),
        keywords: Array.isArray(q.keywords) ? q.keywords.map(String) : [],
        evidenceIds: Array.isArray(q.evidenceIds) ? q.evidenceIds.map(String) : [],
        isPrediction: true as const,
        prepared: Boolean(q.prepared),
        ...(typeof q.gapNote === 'string' ? { gapNote: q.gapNote } : {}),
      };
    }),
    unpreparedGaps: Array.isArray(raw.unpreparedGaps) ? raw.unpreparedGaps.map(String) : [],
    progressNodes: Array.isArray(raw.progressNodes)
      ? (raw.progressNodes as PresentationContextPack['progressNodes'])
      : [],
    evidence: rawEvidence.map((item) =>
      normalizeEvidenceV1ToV2((item ?? {}) as Record<string, unknown>, updatedAt),
    ),
    forbiddenClaims: Array.isArray(raw.forbiddenClaims) ? raw.forbiddenClaims.map(String) : [],
    compiledBy: (raw.compiledBy as PresentationContextPack['compiledBy']) ?? 'local_compiler',
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
    ...(typeof raw.isSample === 'boolean' ? { isSample: raw.isSample } : {}),
    createdAt,
    updatedAt,
  };
}

export function normalizeSessionV1ToV2(
  raw: Record<string, unknown>,
  fallbackNow?: UtcIso8601,
): Session {
  const baseNow = fallbackNow ?? nowUtcIso8601();
  return {
    sessionId: String(raw.sessionId ?? ''),
    ...(typeof raw.tenantId === 'string' ? { tenantId: raw.tenantId } : {}),
    ...(typeof raw.userId === 'string' ? { userId: raw.userId } : {}),
    scenarioId: (raw.scenarioId as Session['scenarioId']) ?? 'presentation',
    status: (raw.status as Session['status']) ?? 'active',
    mode: String(raw.mode ?? 'rehearsal'),
    viewMode: (raw.viewMode as Session['viewMode']) ?? 'focus',
    startedAt: toUtcIso8601(raw.startedAt, baseNow),
    ...(raw.endedAt !== undefined ? { endedAt: toUtcIso8601(raw.endedAt, baseNow) } : {}),
    ...(typeof raw.contextPackId === 'string' ? { contextPackId: raw.contextPackId } : {}),
    silentMode: Boolean(raw.silentMode),
    maxInterventionLevel: (raw.maxInterventionLevel as Session['maxInterventionLevel']) ?? 'L3',
    privacyNoticeAccepted: Boolean(raw.privacyNoticeAccepted),
    ...(typeof raw.metadata === 'object' && raw.metadata !== null
      ? { metadata: raw.metadata as Record<string, unknown> }
      : {}),
  };
}

export function normalizeTelemetryUsageV1ToV2(
  raw: Record<string, unknown>,
  fallbackNow?: UtcIso8601,
): TelemetryUsage {
  const estimation = (raw.estimation ?? {}) as Record<string, unknown>;
  const source: TelemetryUsageSource =
    (raw.usageSource as TelemetryUsageSource) ??
    (estimation.source as TelemetryUsageSource) ??
    'local_rule_zero';
  const usingLocalFallback =
    typeof raw.usingLocalFallback === 'boolean'
      ? raw.usingLocalFallback
      : typeof estimation.usingLocalFallback === 'boolean'
        ? estimation.usingLocalFallback
        : source === 'local_rule_zero';
  const legacyCny = typeof estimation.estimatedCostCny === 'number' ? estimation.estimatedCostCny : 0;
  const costFen =
    typeof raw.costFen === 'number' && Number.isSafeInteger(raw.costFen)
      ? raw.costFen
      : Math.max(0, Math.round(legacyCny * 100));
  const latencyMs = typeof raw.latencyMs === 'number' && Number.isFinite(raw.latencyMs) ? raw.latencyMs : 0;

  return {
    sessionId: String(raw.sessionId ?? ''),
    updatedAt: toUtcIso8601(raw.updatedAt, fallbackNow),
    usageSource: source,
    inputTokens: typeof raw.inputTokens === 'number' ? Math.max(0, Math.trunc(raw.inputTokens)) : 0,
    outputTokens: typeof raw.outputTokens === 'number' ? Math.max(0, Math.trunc(raw.outputTokens)) : 0,
    cachedInputTokens:
      typeof raw.cachedInputTokens === 'number' ? Math.max(0, Math.trunc(raw.cachedInputTokens)) : 0,
    ...(typeof raw.reasoningTokens === 'number' && Number.isFinite(raw.reasoningTokens)
      ? { reasoningTokens: Math.max(0, Math.trunc(raw.reasoningTokens)) }
      : {}),
    totalTokens: typeof raw.totalTokens === 'number' ? Math.max(0, Math.trunc(raw.totalTokens)) : 0,
    modelCalls: typeof raw.modelCalls === 'number' ? Math.max(0, Math.trunc(raw.modelCalls)) : 0,
    retries: typeof raw.retries === 'number' ? Math.max(0, Math.trunc(raw.retries)) : 0,
    localRuleEvaluations:
      typeof raw.localRuleEvaluations === 'number'
        ? Math.max(0, Math.trunc(raw.localRuleEvaluations))
        : 0,
    latencyMs,
    latencyStats:
      typeof raw.latencyStats === 'object' && raw.latencyStats !== null
        ? (raw.latencyStats as TelemetryUsage['latencyStats'])
        : { avgMs: latencyMs, p95Ms: latencyMs, maxMs: latencyMs },
    ...(typeof raw.lastSystem1LatencyMs === 'number'
      ? { lastSystem1LatencyMs: raw.lastSystem1LatencyMs }
      : {}),
    ...(typeof raw.lastSystem2LatencyMs === 'number'
      ? { lastSystem2LatencyMs: raw.lastSystem2LatencyMs }
      : {}),
    degraded: typeof raw.degraded === 'boolean' ? raw.degraded : usingLocalFallback,
    usingLocalFallback,
    asrProvider: typeof raw.asrProvider === 'string' ? raw.asrProvider : 'text-only',
    asrDurationMs: typeof raw.asrDurationMs === 'number' ? Math.max(0, raw.asrDurationMs) : 0,
    costFen,
    cost: createMoneyAmount(costFen),
    estimation: {
      isEstimated: typeof estimation.isEstimated === 'boolean' ? estimation.isEstimated : source === 'estimated',
      source,
      usingLocalFallback,
      ...(typeof estimation.notes === 'string' ? { notes: estimation.notes } : {}),
    },
    ...(typeof raw.byTier === 'object' && raw.byTier !== null
      ? { byTier: raw.byTier as TelemetryUsage['byTier'] }
      : {}),
  };
}

export function normalizeClientMessageV1ToV2(raw: Record<string, unknown>): ClientMessage {
  const payload =
    typeof raw.payload === 'object' && raw.payload !== null
      ? ({ ...(raw.payload as Record<string, unknown>) })
      : {};
  if (raw.type === 'session.start' && typeof payload.contextPack === 'object' && payload.contextPack !== null) {
    const pack = payload.contextPack as Record<string, unknown>;
    payload.contextPack =
      pack.scenarioId === 'presentation' && 'cueSheet' in pack
        ? normalizePresentationContextPackV1ToV2(pack)
        : normalizeContextPackV1ToV2(pack);
  }
  return {
    ...(raw as Record<string, unknown>),
    payload,
  } as unknown as ClientMessage;
}
