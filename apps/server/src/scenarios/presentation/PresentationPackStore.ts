import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  EVIDENCE_SCHEMA_VERSION,
  PACK_SCHEMA_VERSION,
  nowUtcIso8601,
  type ContextPack,
  type Evidence,
  type PresentationContextPack,
  type PresentationFactItem,
  type PresentationPackPatchInput,
  type PresentationPackSummary,
} from '@cuex/protocol';
import { SqliteRepository, type StorageRepository } from '../../storage';
import { SAMPLE_PACK_ID, SAMPLE_PRESENTATION_PACK } from './samplePack';

export function toPackSummary(pack: PresentationContextPack): PresentationPackSummary {
  return {
    packId: pack.packId,
    schemaVersion: pack.schemaVersion,
    title: pack.title,
    sceneType: pack.sceneType,
    targetDurationSec: pack.targetDurationSec,
    factCount: pack.facts.length,
    qaCount: pack.qaCards.length,
    chapterCount: pack.progressNodes.length,
    isSample: pack.isSample,
    updatedAt: pack.updatedAt,
  };
}

export function toUniversalContextPack(pack: PresentationContextPack): ContextPack {
  return {
    packId: pack.packId,
    schemaVersion: pack.schemaVersion,
    ...(pack.tenantId ? { tenantId: pack.tenantId } : {}),
    ...(pack.userId ? { userId: pack.userId } : {}),
    scenarioId: 'presentation',
    title: pack.title,
    goal: pack.goal,
    audience: pack.audience,
    targetDurationSec: pack.targetDurationSec,
    constraints: [`Target total duration ${pack.targetDurationSec}s`, `Audience: ${pack.audience}`],
    forbiddenClaims: [...pack.forbiddenClaims],
    chapters: pack.progressNodes.map((node) => ({
      id: node.chapterId,
      title: node.title,
      order: node.order,
      targetDurationSec: node.targetDurationSec,
      keyPoints: node.keyPoints.map((kp) => ({
        id: kp.id,
        label: kp.label,
        required: true,
      })),
    })),
    evidence: pack.evidence.map((item) => ({ ...item })),
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    metadata: {
      sceneType: pack.sceneType,
      isSample: pack.isSample,
    },
  };
}

function syncEvidenceFromFacts(
  existingEvidence: Evidence[],
  facts: PresentationFactItem[],
  nowIso: string,
): Evidence[] {
  const existingMap = new Map(existingEvidence.map((item) => [item.id, item]));
  return facts.map((fact) => {
    const prev = existingMap.get(fact.evidenceId);
    const contentHash = createHash('sha256').update(fact.text, 'utf8').digest('hex').slice(0, 16);
    if (prev) {
      return {
        ...prev,
        schemaVersion: EVIDENCE_SCHEMA_VERSION,
        text: fact.text,
        source: fact.source,
        locationRef: prev.locationRef ?? fact.source,
        contentHash,
        userConfirmed: fact.userConfirmed,
        verified: fact.verified,
        locked: fact.locked,
        lifecycle: fact.verified ? 'active' : 'draft',
        timestamp: nowIso,
        updatedAt: nowIso,
      };
    }
    return {
      id: fact.evidenceId,
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      title: fact.text.slice(0, 28),
      text: fact.text,
      source: fact.source,
      sourceType: fact.userConfirmed ? 'user_input' : 'compiler_extracted',
      locationRef: fact.source,
      contentHash,
      timestamp: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      confidence: fact.userConfirmed ? 1 : 0.9,
      scope: 'session',
      privacyLevel: 'session',
      userConfirmed: fact.userConfirmed,
      verified: fact.verified,
      locked: fact.locked,
      lifecycle: fact.verified ? 'active' : 'draft',
    };
  });
}

function mergeFactsPreservingLocked(
  existingFacts: PresentationFactItem[],
  incomingFacts: PresentationFactItem[],
): PresentationFactItem[] {
  const incomingById = new Map(incomingFacts.map((f) => [f.id, f]));
  const merged: PresentationFactItem[] = [];
  const handledIds = new Set<string>();

  for (const prev of existingFacts) {
    const next = incomingById.get(prev.id);
    if (prev.locked) {
      // Never delete or overwrite locked fact text; only permit explicit unlock when text is unchanged.
      const explicitlyUnlockedSameText =
        next !== undefined && next.locked === false && next.text.trim() === prev.text.trim();
      merged.push(
        explicitlyUnlockedSameText
          ? { ...prev, locked: false }
          : { ...prev, locked: true, verified: true, userConfirmed: true },
      );
      handledIds.add(prev.id);
    } else if (next) {
      merged.push({ ...next });
      handledIds.add(prev.id);
    }
  }

  for (const item of incomingFacts) {
    if (!handledIds.has(item.id)) {
      merged.push({ ...item });
    }
  }

  return merged;
}

/**
 * Persistent Presentation Context Pack store backed by StorageRepository (SQLite in Phase 2).
 * Seeds built-in CueX sample pack idempotently and protects `locked: true` facts from deletion/overwrite.
 */
export class PresentationPackStore {
  private readonly repo: StorageRepository;
  private readonly ownsRepo: boolean;

  constructor(dirOrRepo: string | StorageRepository) {
    if (typeof dirOrRepo === 'string') {
      const dbPath =
        dirOrRepo === ':memory:' ? ':memory:' : path.join(dirOrRepo, 'cuex-packs.sqlite');
      const sqlite = new SqliteRepository(dbPath);
      sqlite.init();
      if (dirOrRepo !== ':memory:') {
        sqlite.migrateLegacyJsonFiles({
          runtimeDir: dirOrRepo,
          packsDir: dirOrRepo,
        });
      }
      this.repo = sqlite;
      this.ownsRepo = true;
    } else {
      this.repo = dirOrRepo;
      this.ownsRepo = false;
    }

    if (!this.repo.getPack(SAMPLE_PRESENTATION_PACK.packId)) {
      this.repo.savePack(structuredClone(SAMPLE_PRESENTATION_PACK));
    }
  }

  close(): void {
    if (this.ownsRepo) {
      this.repo.close();
    }
  }

  listSummaries(userId?: string): PresentationPackSummary[] {
    return this.repo.listPackSummaries(userId);
  }

  getOwner(packId: string): { userId?: string; isSample: boolean } | undefined {
    return this.repo.getPackOwner(packId);
  }

  get(packId: string, userId?: string): PresentationContextPack | undefined {
    return this.repo.getPack(packId, userId);
  }

  getDefaultPack(userId?: string): PresentationContextPack {
    return this.get(SAMPLE_PACK_ID, userId) ?? structuredClone(SAMPLE_PRESENTATION_PACK);
  }

  save(pack: PresentationContextPack, opts?: { isSampleOverride?: boolean }): PresentationContextPack {
    const normalized: PresentationContextPack = {
      ...structuredClone(pack),
      schemaVersion: PACK_SCHEMA_VERSION,
    };
    return this.repo.savePack(normalized, opts);
  }

  patch(
    packId: string,
    patch: PresentationPackPatchInput,
    actor?: { userId?: string; tenantId?: string },
  ): PresentationContextPack | undefined {
    const current = this.get(packId, actor?.userId);
    if (!current) return undefined;

    const nowIso = nowUtcIso8601();
    const nextFacts = patch.facts
      ? mergeFactsPreservingLocked(current.facts, patch.facts)
      : current.facts;
    const nextForbidden = patch.forbiddenClaims ?? current.forbiddenClaims;
    const nextEvidence = patch.facts
      ? syncEvidenceFromFacts(current.evidence, nextFacts, nowIso)
      : current.evidence;

    const updated: PresentationContextPack = {
      ...current,
      schemaVersion: PACK_SCHEMA_VERSION,
      ...(current.isSample && actor?.userId ? { userId: actor.userId, tenantId: actor.tenantId } : {}),
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.goal !== undefined ? { goal: patch.goal.trim() } : {}),
      ...(patch.audience !== undefined ? { audience: patch.audience.trim() } : {}),
      ...(patch.targetDurationSec !== undefined ? { targetDurationSec: patch.targetDurationSec } : {}),
      ...(patch.cueSheet !== undefined ? { cueSheet: patch.cueSheet } : {}),
      facts: nextFacts,
      qaCards: patch.qaCards ?? current.qaCards,
      forbiddenClaims: nextForbidden,
      evidence: nextEvidence,
      updatedAt: nowIso,
    };
    updated.cueSheet = {
      ...updated.cueSheet,
      forbiddenClaims: [...nextForbidden],
    };

    const isSampleOverride = Boolean(current.isSample && actor?.userId);
    return this.save(updated, { isSampleOverride });
  }
}
