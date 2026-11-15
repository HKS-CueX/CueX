import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  ContextPack,
  Evidence,
  PresentationContextPack,
  PresentationPackPatchInput,
  PresentationPackSummary,
} from '@cuex/protocol';
import { SAMPLE_PACK_ID, SAMPLE_PRESENTATION_PACK } from './samplePack';

interface PersistedPacksFile {
  version: 1;
  packs: PresentationContextPack[];
}

export function toPackSummary(pack: PresentationContextPack): PresentationPackSummary {
  return {
    packId: pack.packId,
    title: pack.title,
    sceneType: pack.sceneType,
    targetDurationSec: pack.targetDurationSec,
    factCount: pack.facts.length,
    qaCount: pack.qaCards.length,
    chapterCount: pack.cueSheet.chapters.length,
    ...(pack.isSample ? { isSample: true } : {}),
    updatedAt: pack.updatedAt,
  };
}

export function toUniversalContextPack(pack: PresentationContextPack): ContextPack {
  return {
    packId: pack.packId,
    scenarioId: 'presentation',
    title: pack.title,
    description: pack.cueSheet.oneLineThesis,
    goal: pack.goal,
    audience: pack.audience,
    targetDurationSec: pack.targetDurationSec,
    constraints: pack.cueSheet.chapters.map(
      (ch) => `章节「${ch.title}」目标 ${ch.targetDurationSec}s：${ch.coreMessage}`,
    ),
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
    evidence: pack.evidence.map((e) => ({ ...e })),
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
  };
}

/**
 * Atomic JSON store for compiled Presentation Context Packs + built-in CueX sample pack.
 */
export class PresentationPackStore {
  private readonly filePath: string;
  private readonly packs = new Map<string, PresentationContextPack>();

  constructor(packsDir: string) {
    this.filePath = join(packsDir, 'packs.json');
    this.packs.set(SAMPLE_PACK_ID, structuredClone(SAMPLE_PRESENTATION_PACK));
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as PersistedPacksFile;
      if (Array.isArray(parsed.packs)) {
        for (const pack of parsed.packs) {
          if (pack?.packId) {
            this.packs.set(pack.packId, pack);
          }
        }
      }
    } catch {
      // Keep built-in sample pack on corrupted file.
    }
    if (!this.packs.has(SAMPLE_PACK_ID)) {
      this.packs.set(SAMPLE_PACK_ID, structuredClone(SAMPLE_PRESENTATION_PACK));
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const payload: PersistedPacksFile = {
      version: 1,
      packs: [...this.packs.values()],
    };
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    renameSync(tmpPath, this.filePath);
  }

  listSummaries(): PresentationPackSummary[] {
    return [...this.packs.values()]
      .sort((a, b) => (a.isSample ? -1 : b.isSample ? 1 : b.updatedAt.localeCompare(a.updatedAt)))
      .map(toPackSummary);
  }

  get(packId: string): PresentationContextPack | undefined {
    const found = this.packs.get(packId);
    return found ? structuredClone(found) : undefined;
  }

  getDefaultPack(): PresentationContextPack {
    return structuredClone(this.packs.get(SAMPLE_PACK_ID) ?? SAMPLE_PRESENTATION_PACK);
  }

  save(pack: PresentationContextPack): PresentationContextPack {
    const clone = structuredClone(pack);
    this.packs.set(clone.packId, clone);
    this.persist();
    return structuredClone(clone);
  }

  patch(packId: string, patchInput: PresentationPackPatchInput): PresentationContextPack | undefined {
    const existing = this.packs.get(packId);
    if (!existing) return undefined;

    const nowMs = Date.now();
    const updatedFacts = patchInput.facts
      ? patchInput.facts.map((incoming) => {
          const prev = existing.facts.find((f) => f.id === incoming.id);
          // Respect prior lock unless explicitly toggled off.
          if (prev?.locked && incoming.locked !== false && incoming.text !== prev.text) {
            return { ...prev };
          }
          return { ...incoming };
        })
      : existing.facts;

    // Synchronize FactWhitelist edits into Evidence[] cleanly.
    const existingEvidenceMap = new Map(existing.evidence.map((ev) => [ev.id, ev]));
    const syncedEvidence: Evidence[] = updatedFacts.map((fact) => {
      const priorEv = existingEvidenceMap.get(fact.evidenceId);
      return {
        id: fact.evidenceId,
        title: priorEv?.title ?? fact.text.slice(0, 32),
        text: fact.text,
        source: fact.source,
        sourceType: priorEv?.sourceType ?? (fact.userConfirmed ? 'user_input' : 'compiler_extracted'),
        timestamp: nowMs,
        confidence: fact.userConfirmed ? 1 : priorEv?.confidence ?? 0.9,
        scope: priorEv?.scope ?? 'session',
        privacyLevel: priorEv?.privacyLevel ?? 'session',
        userConfirmed: fact.userConfirmed,
        verified: fact.verified,
        lifecycle: 'active',
        locked: fact.locked,
        tags: priorEv?.tags,
      };
    });

    // Retain any additional supporting Evidence not bound directly to a deleted fact row unless revoked.
    for (const ev of existing.evidence) {
      if (!syncedEvidence.some((s) => s.id === ev.id)) {
        syncedEvidence.push(ev);
      }
    }

    const updatedQaCards = (patchInput.qaCards ?? existing.qaCards).map((card) => ({
      ...card,
      isPrediction: true as const,
    }));

    const updated: PresentationContextPack = {
      ...existing,
      ...(patchInput.title !== undefined ? { title: patchInput.title.trim() } : {}),
      ...(patchInput.goal !== undefined ? { goal: patchInput.goal.trim() } : {}),
      ...(patchInput.audience !== undefined ? { audience: patchInput.audience.trim() } : {}),
      ...(patchInput.targetDurationSec !== undefined
        ? { targetDurationSec: patchInput.targetDurationSec }
        : {}),
      ...(patchInput.cueSheet !== undefined ? { cueSheet: patchInput.cueSheet } : {}),
      ...(patchInput.forbiddenClaims !== undefined
        ? { forbiddenClaims: [...patchInput.forbiddenClaims] }
        : {}),
      facts: updatedFacts,
      qaCards: updatedQaCards,
      evidence: syncedEvidence,
      updatedAt: new Date(nowMs).toISOString(),
    };

    this.packs.set(packId, updated);
    this.persist();
    return structuredClone(updated);
  }
}
