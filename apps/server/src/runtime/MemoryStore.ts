import path from 'node:path';
import {
  MEMORY_SCHEMA_VERSION,
  nowUtcIso8601,
  type MemoryCreateInput,
  type MemoryItem,
  type MemoryPatchInput,
  type ScenarioId,
} from '@cuex/protocol';
import { SqliteRepository, type StorageRepository } from '../storage';

let memSeq = 0;

/**
 * Persistent opt-in Memory Store backed by StorageRepository (SQLite in Phase 2).
 * NEVER writes memories automatically unless `userConfirmed === true`.
 */
export class MemoryStore {
  private readonly repo: StorageRepository;
  private readonly ownsRepo: boolean;

  constructor(dirOrRepo: string | StorageRepository) {
    if (typeof dirOrRepo === 'string') {
      const dbPath =
        dirOrRepo === ':memory:' ? ':memory:' : path.join(dirOrRepo, 'cuex-memory.sqlite');
      const sqlite = new SqliteRepository(dbPath);
      sqlite.init();
      if (dirOrRepo !== ':memory:') {
        sqlite.migrateLegacyJsonFiles({
          runtimeDir: dirOrRepo,
          memoryDir: dirOrRepo,
        });
      }
      this.repo = sqlite;
      this.ownsRepo = true;
    } else {
      this.repo = dirOrRepo;
      this.ownsRepo = false;
    }
  }

  close(): void {
    if (this.ownsRepo) {
      this.repo.close();
    }
  }

  list(filter?: {
    userId?: string;
    scenarioId?: ScenarioId | 'universal';
    sourceSessionId?: string;
  }): MemoryItem[] {
    return this.repo.listMemories({
      userId: filter?.userId,
      scenarioId: filter?.scenarioId,
      sessionId: filter?.sourceSessionId,
    });
  }

  getConfirmedForScenario(scenarioId: ScenarioId, userId?: string): MemoryItem[] {
    return this.repo
      .listMemories({ userId })
      .filter(
        (item) =>
          item.userConfirmed &&
          (item.scenarioId === scenarioId || item.scenarioId === 'universal' || item.scope === 'global'),
      );
  }

  get(memoryId: string): MemoryItem | undefined {
    return this.repo.getMemory(memoryId);
  }

  create(
    input: MemoryCreateInput & { userId?: string; tenantId?: string },
  ): MemoryItem {
    if (input.userConfirmed !== true) {
      throw new Error('Privacy rule: MemoryItem can only be persisted when userConfirmed === true.');
    }
    const now = nowUtcIso8601();
    const item: MemoryItem = {
      memoryId: `mem_${Date.now()}_${++memSeq}`,
      schemaVersion: MEMORY_SCHEMA_VERSION,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      scenarioId: input.scenarioId,
      category: input.category,
      title: input.title.trim(),
      content: input.content.trim(),
      tags: input.tags?.map((t) => t.trim()).filter(Boolean) ?? [],
      sourceSessionId: input.sourceSessionId,
      userConfirmed: true,
      privacyLevel: input.privacyLevel,
      scope: input.scope,
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.saveMemory(item);
  }

  patch(memoryId: string, patch: MemoryPatchInput): MemoryItem | undefined {
    const current = this.repo.getMemory(memoryId);
    if (!current) return undefined;

    if (patch.userConfirmed === false) {
      this.repo.deleteMemory(memoryId);
      return undefined;
    }

    const updated: MemoryItem = {
      ...current,
      schemaVersion: MEMORY_SCHEMA_VERSION,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.content !== undefined ? { content: patch.content.trim() } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.privacyLevel !== undefined ? { privacyLevel: patch.privacyLevel } : {}),
      ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      userConfirmed: true,
      updatedAt: nowUtcIso8601(),
    };
    return this.repo.saveMemory(updated);
  }

  delete(memoryId: string): boolean {
    return this.repo.deleteMemory(memoryId);
  }

  wipeSession(sessionId: string, userId?: string): number {
    return this.repo.wipeSessionMemories(sessionId, userId);
  }
}
