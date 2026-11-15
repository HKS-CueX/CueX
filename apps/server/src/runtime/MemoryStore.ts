import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MemoryCreateInput, MemoryItem, MemoryPatchInput, ScenarioId } from '@cuex/protocol';

interface PersistedMemoryFile {
  version: 1;
  items: MemoryItem[];
}

/**
 * Persistent opt-in MemoryStore.
 * Strictly requires `userConfirmed === true` before saving any MemoryItem.
 * Supports full inspection, edit, individual deletion, and single-session wipe.
 */
export class MemoryStore {
  private readonly filePath: string;
  private items: MemoryItem[] = [];
  private seq = 0;

  constructor(memoryDir: string) {
    this.filePath = join(memoryDir, 'items.json');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.items = [];
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as PersistedMemoryFile;
      if (Array.isArray(parsed.items)) {
        this.items = parsed.items.filter((item) => item && item.userConfirmed === true);
        this.seq = this.items.length;
      }
    } catch {
      this.items = [];
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const payload: PersistedMemoryFile = { version: 1, items: this.items };
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    renameSync(tmpPath, this.filePath);
  }

  list(filter?: { scenarioId?: ScenarioId | 'universal'; sessionId?: string }): MemoryItem[] {
    return this.items
      .filter((item) => {
        if (filter?.scenarioId && item.scenarioId !== filter.scenarioId && item.scenarioId !== 'universal') {
          return false;
        }
        if (filter?.sessionId && item.sourceSessionId !== filter.sessionId) {
          return false;
        }
        return true;
      })
      .map((item) => ({ ...item }));
  }

  getConfirmedForScenario(scenarioId: ScenarioId): MemoryItem[] {
    return this.items
      .filter(
        (item) =>
          item.userConfirmed === true &&
          (item.scenarioId === scenarioId || item.scenarioId === 'universal') &&
          item.privacyLevel !== 'ephemeral',
      )
      .map((item) => ({ ...item }));
  }

  get(memoryId: string): MemoryItem | undefined {
    const found = this.items.find((item) => item.memoryId === memoryId);
    return found ? { ...found } : undefined;
  }

  create(input: MemoryCreateInput): MemoryItem {
    if (input.userConfirmed !== true) {
      throw new Error('MemoryStore requires explicit userConfirmed === true before saving.');
    }
    if (!input.title.trim() || !input.content.trim()) {
      throw new Error('MemoryItem title and content must be non-empty.');
    }
    const nowIso = new Date().toISOString();
    const item: MemoryItem = {
      memoryId: `mem_${Date.now()}_${++this.seq}`,
      scenarioId: input.scenarioId,
      category: input.category,
      title: input.title.trim(),
      content: input.content.trim(),
      tags: input.tags?.map((t) => t.trim()).filter(Boolean),
      sourceSessionId: input.sourceSessionId,
      userConfirmed: true,
      privacyLevel: input.privacyLevel,
      scope: input.scope,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.items.push(item);
    this.persist();
    return { ...item };
  }

  patch(memoryId: string, patch: MemoryPatchInput): MemoryItem | undefined {
    const idx = this.items.findIndex((item) => item.memoryId === memoryId);
    if (idx < 0) return undefined;
    if (patch.userConfirmed === false) {
      this.items.splice(idx, 1);
      this.persist();
      return undefined;
    }
    const current = this.items[idx];
    const updated: MemoryItem = {
      ...current,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.content !== undefined ? { content: patch.content.trim() } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags.map((t) => t.trim()).filter(Boolean) } : {}),
      ...(patch.privacyLevel !== undefined ? { privacyLevel: patch.privacyLevel } : {}),
      ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      userConfirmed: true,
      updatedAt: new Date().toISOString(),
    };
    this.items[idx] = updated;
    this.persist();
    return { ...updated };
  }

  delete(memoryId: string): boolean {
    const prevLen = this.items.length;
    this.items = this.items.filter((item) => item.memoryId !== memoryId);
    if (this.items.length === prevLen) return false;
    this.persist();
    return true;
  }

  wipeSession(sessionId: string): number {
    const prevLen = this.items.length;
    this.items = this.items.filter((item) => item.sourceSessionId !== sessionId);
    const removed = prevLen - this.items.length;
    if (removed > 0) this.persist();
    return removed;
  }
}
