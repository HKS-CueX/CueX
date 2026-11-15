import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  createMoneyAmount,
  normalizeMemoryItemV1ToV2,
  normalizePresentationContextPackV1ToV2,
  nowUtcIso8601,
  type AccountUsageSummary,
  type BillingAuditRecord,
  type DataDeletionReceipt,
  type Entitlement,
  type EventEnvelopeMeta,
  type MemoryItem,
  type PlanId,
  type PresentationContextPack,
  type PresentationPackSummary,
  type PresentationReflection,
  type ScenarioId,
  type Session,
  type TelemetryUsage,
  type UsageRecord,
  type UserAccount,
  type UserDataExportBundle,
  type UtcIso8601,
} from '@cuex/protocol';
import { applySqliteMigrations } from './migrations';
import type {
  AuthTokenRecord,
  LegacyMigrationReport,
  ReserveSessionQuotaParams,
  ReserveSessionQuotaResult,
  SessionSummaryItem,
  StorageRepository,
  StoredSessionEvent,
  StoredSessionRecord,
} from './StorageRepository';

const THIRD_PARTY_WIPE_CAVEATS = [
  '若会话期间曾启用云端推理或外部 ASR 服务，已发出的历史请求受对应第三方服务留存策略约束，无法通过本地擦除远程撤回。',
  '在备份保留周期内的离线加密数据库快照中可能仍存在历史副本，随周期轮转过期后清除。',
];

function escapeSqlLiteral(val: string): string {
  return `'${val.replace(/'/g, "''")}'`;
}

function toSummary(pack: PresentationContextPack): PresentationPackSummary {
  return {
    packId: pack.packId,
    schemaVersion: pack.schemaVersion,
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

/**
 * Built-in `node:sqlite` implementation of StorageRepository with WAL mode, foreign keys,
 * atomic transactions, and multi-tenant isolation.
 */
export class SqliteRepository implements StorageRepository {
  private db?: DatabaseSync;
  private inTransaction = false;

  constructor(readonly dbPath: string) {}

  private requireDb(): DatabaseSync {
    if (!this.db) {
      this.init();
    }
    return this.db!;
  }

  init(): void {
    if (this.db) return;
    if (this.dbPath !== ':memory:') {
      mkdirSync(dirname(this.dbPath), { recursive: true });
    }
    const db = new DatabaseSync(this.dbPath);
    if (this.dbPath !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL;');
    }
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA busy_timeout = 5000;');
    applySqliteMigrations(db);
    this.db = db;
  }

  close(): void {
    if (!this.db) return;
    try {
      this.db.close();
    } finally {
      this.db = undefined;
    }
  }

  ping(): boolean {
    try {
      const row = this.requireDb().prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
      return row?.ok === 1;
    } catch {
      return false;
    }
  }

  withTransaction<T>(fn: () => T): T {
    const db = this.requireDb();
    if (this.inTransaction) {
      return fn();
    }
    db.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  // ---------------- Users & Auth ----------------

  upsertUser(user: UserAccount): UserAccount {
    const db = this.requireDb();
    db.prepare(
      `INSERT INTO users (user_id, tenant_id, email, display_name, role, auth_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         tenant_id = excluded.tenant_id,
         email = excluded.email,
         display_name = excluded.display_name,
         role = excluded.role,
         auth_mode = excluded.auth_mode,
         updated_at = excluded.updated_at`,
    ).run(
      user.userId,
      user.tenantId,
      user.email ?? null,
      user.displayName,
      user.role,
      user.authMode,
      user.createdAt,
      user.updatedAt,
    );
    return { ...user };
  }

  findUserById(userId: string): UserAccount | undefined {
    const row = this.requireDb()
      .prepare('SELECT * FROM users WHERE user_id = ?')
      .get(userId) as Record<string, unknown> | undefined;
    return row ? this.mapUserRow(row) : undefined;
  }

  findUserByEmail(email: string): UserAccount | undefined {
    const row = this.requireDb()
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1')
      .get(email) as Record<string, unknown> | undefined;
    return row ? this.mapUserRow(row) : undefined;
  }

  private mapUserRow(row: Record<string, unknown>): UserAccount {
    return {
      userId: String(row.user_id),
      tenantId: String(row.tenant_id),
      ...(row.email ? { email: String(row.email) } : {}),
      displayName: String(row.display_name),
      role: row.role as UserAccount['role'],
      authMode: row.auth_mode as UserAccount['authMode'],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  createAuthToken(record: AuthTokenRecord): void {
    this.requireDb()
      .prepare(
        `INSERT INTO auth_tokens (token_hash, user_id, tenant_id, created_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.tokenHash,
        record.userId,
        record.tenantId,
        record.createdAt,
        record.expiresAt,
        record.revokedAt ?? null,
      );
  }

  findActiveAuthToken(tokenHash: string, nowIso: UtcIso8601): AuthTokenRecord | undefined {
    const row = this.requireDb()
      .prepare(
        `SELECT * FROM auth_tokens
         WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
      )
      .get(tokenHash, nowIso) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      tokenHash: String(row.token_hash),
      userId: String(row.user_id),
      tenantId: String(row.tenant_id),
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      ...(row.revoked_at ? { revokedAt: String(row.revoked_at) } : {}),
    };
  }

  revokeAuthToken(tokenHash: string, revokedAt: UtcIso8601): boolean {
    const res = this.requireDb()
      .prepare('UPDATE auth_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .run(revokedAt, tokenHash);
    return Number(res.changes) > 0;
  }

  // ---------------- Presentation Packs ----------------

  listPackSummaries(userId?: string): PresentationPackSummary[] {
    const db = this.requireDb();
    if (userId) {
      const rows = db
        .prepare(
          `SELECT storage_key, user_id, data_json FROM presentation_packs
           WHERE user_id = ? OR (is_sample = 1 AND user_id IS NULL)
           ORDER BY is_sample DESC, updated_at DESC`,
        )
        .all(userId) as Array<{ storage_key: string; user_id: string | null; data_json: string }>;
      // Prefer per-user override when a user has patched a built-in sample pack.
      const byPackId = new Map<string, PresentationContextPack>();
      for (const row of rows) {
        const pack = JSON.parse(row.data_json) as PresentationContextPack;
        const existing = byPackId.get(pack.packId);
        if (!existing || row.user_id === userId) {
          byPackId.set(pack.packId, pack);
        }
      }
      return [...byPackId.values()].map(toSummary);
    }

    const rows = db
      .prepare(
        `SELECT data_json FROM presentation_packs
         WHERE user_id IS NULL
         ORDER BY is_sample DESC, updated_at DESC`,
      )
      .all() as Array<{ data_json: string }>;
    return rows.map((row) => toSummary(JSON.parse(row.data_json) as PresentationContextPack));
  }

  getPack(packId: string, userId?: string): PresentationContextPack | undefined {
    const db = this.requireDb();
    if (userId) {
      const overrideKey = `${userId}::${packId}`;
      const overrideRow = db
        .prepare('SELECT data_json FROM presentation_packs WHERE storage_key = ?')
        .get(overrideKey) as { data_json: string } | undefined;
      if (overrideRow) {
        return JSON.parse(overrideRow.data_json) as PresentationContextPack;
      }
      const ownedRow = db
        .prepare('SELECT data_json FROM presentation_packs WHERE pack_id = ? AND user_id = ? LIMIT 1')
        .get(packId, userId) as { data_json: string } | undefined;
      if (ownedRow) {
        return JSON.parse(ownedRow.data_json) as PresentationContextPack;
      }
      const sampleRow = db
        .prepare(
          'SELECT data_json FROM presentation_packs WHERE pack_id = ? AND is_sample = 1 AND user_id IS NULL LIMIT 1',
        )
        .get(packId) as { data_json: string } | undefined;
      return sampleRow ? (JSON.parse(sampleRow.data_json) as PresentationContextPack) : undefined;
    }

    const row = db
      .prepare('SELECT data_json FROM presentation_packs WHERE storage_key = ? OR pack_id = ? LIMIT 1')
      .get(packId, packId) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as PresentationContextPack) : undefined;
  }

  getPackOwner(packId: string): { userId?: string; isSample: boolean } | undefined {
    const row = this.requireDb()
      .prepare(
        `SELECT user_id, is_sample FROM presentation_packs
         WHERE storage_key = ? OR pack_id = ?
         ORDER BY (storage_key = ?) DESC, is_sample ASC
         LIMIT 1`,
      )
      .get(packId, packId, packId) as { user_id: string | null; is_sample: number } | undefined;
    if (!row) return undefined;
    return {
      ...(row.user_id ? { userId: row.user_id } : {}),
      isSample: row.is_sample === 1,
    };
  }

  savePack(
    pack: PresentationContextPack,
    options?: { isSampleOverride?: boolean },
  ): PresentationContextPack {
    const db = this.requireDb();
    const storageKey =
      options?.isSampleOverride && pack.userId ? `${pack.userId}::${pack.packId}` : pack.packId;
    const json = JSON.stringify(pack);
    db.prepare(
      `INSERT INTO presentation_packs (
         storage_key, pack_id, user_id, tenant_id, scenario_id, schema_version,
         is_sample, title, scene_type, target_duration_sec, data_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(storage_key) DO UPDATE SET
         title = excluded.title,
         scene_type = excluded.scene_type,
         target_duration_sec = excluded.target_duration_sec,
         schema_version = excluded.schema_version,
         data_json = excluded.data_json,
         updated_at = excluded.updated_at`,
    ).run(
      storageKey,
      pack.packId,
      pack.userId ?? null,
      pack.tenantId ?? null,
      pack.scenarioId,
      pack.schemaVersion,
      pack.isSample ? 1 : 0,
      pack.title,
      pack.sceneType,
      pack.targetDurationSec,
      json,
      pack.createdAt,
      pack.updatedAt,
    );
    return structuredClone(pack);
  }

  // ---------------- Memories ----------------

  listMemories(filter?: {
    userId?: string;
    scenarioId?: ScenarioId | 'universal';
    sessionId?: string;
  }): MemoryItem[] {
    const clauses: string[] = ['user_confirmed = 1'];
    const args: Array<string> = [];
    if (filter?.userId) {
      clauses.push('user_id = ?');
      args.push(filter.userId);
    }
    if (filter?.scenarioId) {
      clauses.push('(scenario_id = ? OR scenario_id = ?)');
      args.push(filter.scenarioId, 'universal');
    }
    if (filter?.sessionId) {
      clauses.push('source_session_id = ?');
      args.push(filter.sessionId);
    }
    const sql = `SELECT * FROM memories WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`;
    const rows = this.requireDb().prepare(sql).all(...args) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapMemoryRow(row));
  }

  getMemory(memoryId: string): MemoryItem | undefined {
    const row = this.requireDb()
      .prepare('SELECT * FROM memories WHERE memory_id = ?')
      .get(memoryId) as Record<string, unknown> | undefined;
    return row ? this.mapMemoryRow(row) : undefined;
  }

  saveMemory(item: MemoryItem): MemoryItem {
    if (item.userConfirmed !== true) {
      throw new Error('StorageRepository refuses to persist unconfirmed MemoryItem.');
    }
    this.requireDb()
      .prepare(
        `INSERT INTO memories (
           memory_id, user_id, tenant_id, scenario_id, category, title, content,
           source_session_id, user_confirmed, privacy_level, scope, schema_version,
           tags_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(memory_id) DO UPDATE SET
           category = excluded.category,
           title = excluded.title,
           content = excluded.content,
           privacy_level = excluded.privacy_level,
           scope = excluded.scope,
           schema_version = excluded.schema_version,
           tags_json = excluded.tags_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        item.memoryId,
        item.userId ?? null,
        item.tenantId ?? null,
        item.scenarioId,
        item.category,
        item.title,
        item.content,
        item.sourceSessionId ?? null,
        1,
        item.privacyLevel,
        item.scope,
        item.schemaVersion,
        JSON.stringify(item.tags ?? []),
        item.createdAt,
        item.updatedAt,
      );
    return structuredClone(item);
  }

  deleteMemory(memoryId: string): boolean {
    const res = this.requireDb().prepare('DELETE FROM memories WHERE memory_id = ?').run(memoryId);
    return Number(res.changes) > 0;
  }

  wipeSessionMemories(sessionId: string, userId?: string): number {
    const res = userId
      ? this.requireDb()
          .prepare('DELETE FROM memories WHERE source_session_id = ? AND user_id = ?')
          .run(sessionId, userId)
      : this.requireDb()
          .prepare('DELETE FROM memories WHERE source_session_id = ?')
          .run(sessionId);
    return Number(res.changes);
  }

  private mapMemoryRow(row: Record<string, unknown>): MemoryItem {
    const tags = JSON.parse(String(row.tags_json ?? '[]')) as string[];
    return {
      memoryId: String(row.memory_id),
      schemaVersion: Number(row.schema_version),
      ...(row.tenant_id ? { tenantId: String(row.tenant_id) } : {}),
      ...(row.user_id ? { userId: String(row.user_id) } : {}),
      scenarioId: row.scenario_id as MemoryItem['scenarioId'],
      category: row.category as MemoryItem['category'],
      title: String(row.title),
      content: String(row.content),
      ...(tags.length > 0 ? { tags } : {}),
      ...(row.source_session_id ? { sourceSessionId: String(row.source_session_id) } : {}),
      userConfirmed: Number(row.user_confirmed) === 1,
      privacyLevel: row.privacy_level as MemoryItem['privacyLevel'],
      scope: row.scope as MemoryItem['scope'],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  // ---------------- Sessions, Reflections & Events ----------------

  saveSession(record: StoredSessionRecord): void {
    const s = record.session;
    const nowIso = nowUtcIso8601();
    this.requireDb()
      .prepare(
        `INSERT INTO sessions (
           session_id, user_id, tenant_id, pack_id, pack_title, scenario_id,
           mode, view_mode, status, silent_mode, max_intervention_level,
           privacy_notice_accepted, started_at, ended_at, duration_ms, elapsed_sec,
           utility_score, coverage_ratio, data_json, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           pack_title = COALESCE(excluded.pack_title, sessions.pack_title),
           view_mode = excluded.view_mode,
           status = excluded.status,
           silent_mode = excluded.silent_mode,
           max_intervention_level = excluded.max_intervention_level,
           ended_at = excluded.ended_at,
           duration_ms = excluded.duration_ms,
           elapsed_sec = excluded.elapsed_sec,
           utility_score = COALESCE(excluded.utility_score, sessions.utility_score),
           coverage_ratio = COALESCE(excluded.coverage_ratio, sessions.coverage_ratio),
           data_json = excluded.data_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        s.sessionId,
        s.userId ?? null,
        s.tenantId ?? null,
        s.contextPackId ?? null,
        record.packTitle ?? null,
        s.scenarioId,
        s.mode,
        s.viewMode,
        s.status,
        s.silentMode ? 1 : 0,
        s.maxInterventionLevel,
        s.privacyNoticeAccepted ? 1 : 0,
        s.startedAt,
        s.endedAt ?? null,
        record.durationMs ?? null,
        record.elapsedSec ?? null,
        record.utilityScore ?? null,
        record.coverageRatio ?? null,
        JSON.stringify(record),
        nowIso,
      );
  }

  getSession(sessionId: string): StoredSessionRecord | undefined {
    const row = this.requireDb()
      .prepare('SELECT data_json FROM sessions WHERE session_id = ?')
      .get(sessionId) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as StoredSessionRecord) : undefined;
  }

  listSessions(userId?: string, limit = 50): SessionSummaryItem[] {
    const db = this.requireDb();
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    const rows = userId
      ? (db
          .prepare(
            `SELECT session_id, user_id, tenant_id, pack_id, pack_title, scenario_id, mode, status,
                    started_at, ended_at, duration_ms, elapsed_sec, utility_score, coverage_ratio
             FROM sessions WHERE user_id = ?
             ORDER BY started_at DESC LIMIT ?`,
          )
          .all(userId, safeLimit) as Array<Record<string, unknown>>)
      : (db
          .prepare(
            `SELECT session_id, user_id, tenant_id, pack_id, pack_title, scenario_id, mode, status,
                    started_at, ended_at, duration_ms, elapsed_sec, utility_score, coverage_ratio
             FROM sessions
             ORDER BY started_at DESC LIMIT ?`,
          )
          .all(safeLimit) as Array<Record<string, unknown>>);

    return rows.map((r) => ({
      sessionId: String(r.session_id),
      ...(r.user_id ? { userId: String(r.user_id) } : {}),
      ...(r.tenant_id ? { tenantId: String(r.tenant_id) } : {}),
      ...(r.pack_id ? { packId: String(r.pack_id) } : {}),
      ...(r.pack_title ? { title: String(r.pack_title) } : {}),
      scenarioId: r.scenario_id as ScenarioId,
      mode: String(r.mode),
      status: r.status as Session['status'],
      startedAt: String(r.started_at),
      ...(r.ended_at ? { endedAt: String(r.ended_at) } : {}),
      ...(typeof r.duration_ms === 'number' ? { durationMs: r.duration_ms } : {}),
      ...(typeof r.elapsed_sec === 'number' ? { elapsedSec: r.elapsed_sec } : {}),
      ...(typeof r.utility_score === 'number' ? { utilityScore: r.utility_score } : {}),
      ...(typeof r.coverage_ratio === 'number' ? { coverageRatio: r.coverage_ratio } : {}),
    }));
  }

  saveReflection(reflection: PresentationReflection, userId?: string, tenantId?: string): void {
    this.requireDb()
      .prepare(
        `INSERT INTO session_reflections (
           session_id, user_id, tenant_id, pack_id, utility_score, coverage_ratio, generated_at, data_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           utility_score = excluded.utility_score,
           coverage_ratio = excluded.coverage_ratio,
           generated_at = excluded.generated_at,
           data_json = excluded.data_json`,
      )
      .run(
        reflection.sessionId,
        userId ?? null,
        tenantId ?? null,
        reflection.packId,
        reflection.utility.netUtilityScore,
        reflection.diagnosis.coverageRatio,
        reflection.generatedAt,
        JSON.stringify(reflection),
      );
  }

  getReflection(sessionId: string): PresentationReflection | undefined {
    const row = this.requireDb()
      .prepare('SELECT data_json FROM session_reflections WHERE session_id = ?')
      .get(sessionId) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as PresentationReflection) : undefined;
  }

  appendSessionEvent(params: {
    sessionId: string;
    userId?: string;
    serverSeq: number;
    eventId: string;
    eventType: string;
    category: 'ws_server' | 'cognitive';
    occurredAt: UtcIso8601;
    correlationId?: string;
    payload: unknown;
    envelope?: EventEnvelopeMeta;
  }): void {
    this.requireDb()
      .prepare(
        `INSERT OR IGNORE INTO session_events (
           session_id, user_id, server_seq, event_id, event_type, category,
           occurred_at, correlation_id, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.sessionId,
        params.userId ?? null,
        params.serverSeq,
        params.eventId,
        params.eventType,
        params.category,
        params.occurredAt,
        params.correlationId ?? null,
        JSON.stringify(params.payload),
      );
  }

  listSessionEventsSince(
    sessionId: string,
    afterServerSeq: number,
    category?: 'ws_server' | 'cognitive',
  ): StoredSessionEvent[] {
    const db = this.requireDb();
    const rows = category
      ? (db
          .prepare(
            `SELECT * FROM session_events
             WHERE session_id = ? AND category = ? AND server_seq > ?
             ORDER BY server_seq ASC`,
          )
          .all(sessionId, category, afterServerSeq) as Array<Record<string, unknown>>)
      : (db
          .prepare(
            `SELECT * FROM session_events
             WHERE session_id = ? AND server_seq > ?
             ORDER BY server_seq ASC`,
          )
          .all(sessionId, afterServerSeq) as Array<Record<string, unknown>>);

    return rows.map((row) => ({
      sessionId: String(row.session_id),
      ...(row.user_id ? { userId: String(row.user_id) } : {}),
      serverSeq: Number(row.server_seq),
      eventId: String(row.event_id),
      eventType: String(row.event_type),
      category: row.category as StoredSessionEvent['category'],
      occurredAt: String(row.occurred_at),
      ...(row.correlation_id ? { correlationId: String(row.correlation_id) } : {}),
      payload: JSON.parse(String(row.payload_json)),
    }));
  }

  // ---------------- Commercial & Quota ----------------

  listEntitlements(userId: string): Entitlement[] {
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM entitlements WHERE user_id = ?
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, granted_at DESC`,
      )
      .all(userId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      entitlementId: String(r.entitlement_id),
      userId: String(r.user_id),
      tenantId: String(r.tenant_id),
      planId: r.plan_id as PlanId,
      status: r.status as Entitlement['status'],
      grantedAt: String(r.granted_at),
      ...(r.expires_at ? { expiresAt: String(r.expires_at) } : {}),
      remainingSessions:
        typeof r.remaining_sessions === 'number' ? r.remaining_sessions : null,
      remainingLiveMinutes:
        typeof r.remaining_live_minutes === 'number' ? r.remaining_live_minutes : null,
      source: r.source as Entitlement['source'],
    }));
  }

  upsertEntitlement(entitlement: Entitlement): Entitlement {
    this.requireDb()
      .prepare(
        `INSERT INTO entitlements (
           entitlement_id, user_id, tenant_id, plan_id, status, granted_at,
           expires_at, remaining_sessions, remaining_live_minutes, source
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(entitlement_id) DO UPDATE SET
           status = excluded.status,
           expires_at = excluded.expires_at,
           remaining_sessions = excluded.remaining_sessions,
           remaining_live_minutes = excluded.remaining_live_minutes`,
      )
      .run(
        entitlement.entitlementId,
        entitlement.userId,
        entitlement.tenantId,
        entitlement.planId,
        entitlement.status,
        entitlement.grantedAt,
        entitlement.expiresAt ?? null,
        entitlement.remainingSessions ?? null,
        entitlement.remainingLiveMinutes ?? null,
        entitlement.source,
      );
    return { ...entitlement };
  }

  reserveSessionQuotaAtomically(params: ReserveSessionQuotaParams): ReserveSessionQuotaResult {
    return this.withTransaction(() => {
      const db = this.requireDb();
      const existingUsage = db
        .prepare('SELECT * FROM usage_ledger WHERE idempotency_key = ?')
        .get(params.idempotencyKey) as Record<string, unknown> | undefined;

      const rankEntitlement = (e: Entitlement): number => {
        if (e.remainingSessions === null) return 10;
        if (e.planId === 'team') return 4;
        if (e.planId === 'pro') return 3;
        if (e.planId === 'event') return 2;
        return 1;
      };

      const entitlements = this.listEntitlements(params.userId);
      let active = entitlements
        .filter((e) => e.status === 'active' && (!e.expiresAt || e.expiresAt > params.occurredAt))
        .sort((a, b) => rankEntitlement(b) - rankEntitlement(a))[0];

      if (!active) {
        const exhausted = entitlements
          .filter(
            (e) =>
              e.status === 'exhausted' &&
              (!e.expiresAt || e.expiresAt > params.occurredAt) &&
              (e.planId !== 'free' || e.grantedAt >= params.periodStart),
          )
          .sort((a, b) => rankEntitlement(b) - rankEntitlement(a))[0];

        if (exhausted) {
          if (existingUsage) {
            return {
              ok: true,
              entitlement: exhausted,
              usageRecord: this.mapUsageRow(existingUsage),
              deduplicated: true,
            };
          }
          return {
            ok: false,
            reason: `当前方案（${exhausted.planId}）本月可用会话配额已用尽，请切换方案或等待下个计费周期。`,
          };
        }

        active = this.upsertEntitlement({
          entitlementId: `ent_${params.userId}_free_${params.periodStart.slice(0, 7)}`,
          userId: params.userId,
          tenantId: params.tenantId,
          planId: 'free',
          status: 'active',
          grantedAt: params.occurredAt,
          remainingSessions: params.defaultMonthlyLimit,
          remainingLiveMinutes: 20,
          source: 'default_free',
        });
      }

      if (existingUsage) {
        return {
          ok: true,
          entitlement: active,
          usageRecord: this.mapUsageRow(existingUsage),
          deduplicated: true,
        };
      }

      if (active.remainingSessions !== null && active.remainingSessions <= 0) {
        return {
          ok: false,
          reason: `当前方案（${active.planId}）本月可用会话配额已用尽，请切换方案或等待下个计费周期。`,
        };
      }

      const nextRemaining =
        active.remainingSessions !== null ? Math.max(0, active.remainingSessions - 1) : null;
      const nextStatus: Entitlement['status'] =
        nextRemaining === 0 ? 'exhausted' : active.status;

      db.prepare(
        `UPDATE entitlements SET remaining_sessions = ?, status = ? WHERE entitlement_id = ?`,
      ).run(nextRemaining, nextStatus, active.entitlementId);

      const record: UsageRecord = {
        id: `use_${randomUUID()}`,
        userId: params.userId,
        tenantId: params.tenantId,
        sessionId: params.sessionId,
        entitlementId: active.entitlementId,
        usageType: 'session_started',
        quantity: 1,
        unit: 'count',
        occurredAt: params.occurredAt,
        idempotencyKey: params.idempotencyKey,
        source: 'gateway_session_start',
        costFen: 0,
      };
      this.insertUsageRow(record);

      return {
        ok: true,
        entitlement: {
          ...active,
          remainingSessions: nextRemaining,
          status: nextStatus,
        },
        usageRecord: record,
        deduplicated: false,
      };
    });
  }

  recordUsageIdempotent(
    record: UsageRecord,
    options?: { decrementLiveMinutes?: number; entitlementId?: string },
  ): { record: UsageRecord; deduplicated: boolean } {
    return this.withTransaction(() => {
      const existing = this.requireDb()
        .prepare('SELECT * FROM usage_ledger WHERE idempotency_key = ?')
        .get(record.idempotencyKey) as Record<string, unknown> | undefined;
      if (existing) {
        return { record: this.mapUsageRow(existing), deduplicated: true };
      }
      this.insertUsageRow(record);
      if (options?.decrementLiveMinutes && options.decrementLiveMinutes > 0 && options.entitlementId) {
        this.requireDb()
          .prepare(
            `UPDATE entitlements
             SET remaining_live_minutes = CASE
               WHEN remaining_live_minutes IS NULL THEN NULL
               WHEN remaining_live_minutes - ? < 0 THEN 0
               ELSE remaining_live_minutes - ?
             END
             WHERE entitlement_id = ?`,
          )
          .run(options.decrementLiveMinutes, options.decrementLiveMinutes, options.entitlementId);
      }
      return { record: { ...record }, deduplicated: false };
    });
  }

  private insertUsageRow(record: UsageRecord): void {
    this.requireDb()
      .prepare(
        `INSERT INTO usage_ledger (
           id, user_id, tenant_id, session_id, entitlement_id, usage_type,
           quantity, unit, occurred_at, idempotency_key, source, cost_fen, metadata_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.userId,
        record.tenantId ?? null,
        record.sessionId ?? null,
        record.entitlementId ?? null,
        record.usageType,
        record.quantity,
        record.unit,
        record.occurredAt,
        record.idempotencyKey,
        record.source,
        record.costFen ?? 0,
        record.metadata ? JSON.stringify(record.metadata) : null,
      );
  }

  listUsageRecords(userId: string, periodStart?: UtcIso8601): UsageRecord[] {
    const db = this.requireDb();
    const rows = periodStart
      ? (db
          .prepare(
            'SELECT * FROM usage_ledger WHERE user_id = ? AND occurred_at >= ? ORDER BY occurred_at DESC',
          )
          .all(userId, periodStart) as Array<Record<string, unknown>>)
      : (db
          .prepare('SELECT * FROM usage_ledger WHERE user_id = ? ORDER BY occurred_at DESC')
          .all(userId) as Array<Record<string, unknown>>);
    return rows.map((row) => this.mapUsageRow(row));
  }

  private mapUsageRow(row: Record<string, unknown>): UsageRecord {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      ...(row.tenant_id ? { tenantId: String(row.tenant_id) } : {}),
      ...(row.session_id ? { sessionId: String(row.session_id) } : {}),
      ...(row.entitlement_id ? { entitlementId: String(row.entitlement_id) } : {}),
      usageType: row.usage_type as UsageRecord['usageType'],
      quantity: Number(row.quantity),
      unit: row.unit as UsageRecord['unit'],
      occurredAt: String(row.occurred_at),
      idempotencyKey: String(row.idempotency_key),
      source: String(row.source),
      costFen: Number(row.cost_fen ?? 0),
      ...(row.metadata_json ? { metadata: JSON.parse(String(row.metadata_json)) as Record<string, unknown> } : {}),
    };
  }

  computeUsageSummary(params: {
    userId: string;
    tenantId: string;
    periodStart: UtcIso8601;
    periodEnd: UtcIso8601;
    activePlanId: PlanId;
    sessionsLimit: number | null;
    liveMinutesLimit: number | null;
    nowIso: UtcIso8601;
  }): AccountUsageSummary {
    const rows = this.listUsageRecords(params.userId, params.periodStart);
    let sessionsUsed = 0;
    let liveAudioMs = 0;
    let totalTokensUsed = 0;
    let totalCostFen = 0;
    for (const r of rows) {
      if (r.usageType === 'session_started') sessionsUsed += r.quantity;
      if (r.usageType === 'live_audio_ms') liveAudioMs += r.quantity;
      if (r.unit === 'tokens') totalTokensUsed += r.quantity;
      totalCostFen += r.costFen ?? 0;
    }
    return {
      userId: params.userId,
      tenantId: params.tenantId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      activePlanId: params.activePlanId,
      sessionsUsed,
      sessionsLimit: params.sessionsLimit,
      liveMinutesUsed: Number((liveAudioMs / 60_000).toFixed(2)),
      liveMinutesLimit: params.liveMinutesLimit,
      totalTokensUsed,
      totalCostFen,
      totalCost: createMoneyAmount(totalCostFen),
      updatedAt: params.nowIso,
    };
  }

  appendBillingAuditIdempotent(
    record: BillingAuditRecord,
    idempotencyKey?: string,
  ): { record: BillingAuditRecord; deduplicated: boolean } {
    return this.withTransaction(() => {
      const db = this.requireDb();
      if (idempotencyKey) {
        const existing = db
          .prepare('SELECT * FROM billing_audit_log WHERE idempotency_key = ?')
          .get(idempotencyKey) as Record<string, unknown> | undefined;
        if (existing) {
          return { record: this.mapBillingAuditRow(existing), deduplicated: true };
        }
      }
      db.prepare(
        `INSERT INTO billing_audit_log (
           audit_id, user_id, tenant_id, event_type, plan_id, amount_fen,
           currency, provider, external_transaction_id, idempotency_key, occurred_at, retention_note
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.auditId,
        record.userId,
        record.tenantId,
        record.eventType,
        record.planId ?? null,
        record.amount?.amountFen ?? null,
        record.amount?.currency ?? 'CNY',
        record.provider,
        record.externalTransactionId ?? null,
        idempotencyKey ?? null,
        record.occurredAt,
        record.retentionNote,
      );
      return { record: { ...record }, deduplicated: false };
    });
  }

  listBillingAudit(userId: string): BillingAuditRecord[] {
    const rows = this.requireDb()
      .prepare('SELECT * FROM billing_audit_log WHERE user_id = ? ORDER BY occurred_at DESC')
      .all(userId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapBillingAuditRow(row));
  }

  private mapBillingAuditRow(row: Record<string, unknown>): BillingAuditRecord {
    return {
      auditId: String(row.audit_id),
      userId: String(row.user_id),
      tenantId: String(row.tenant_id),
      eventType: row.event_type as BillingAuditRecord['eventType'],
      ...(row.plan_id ? { planId: row.plan_id as PlanId } : {}),
      ...(typeof row.amount_fen === 'number'
        ? { amount: createMoneyAmount(row.amount_fen) }
        : {}),
      provider: row.provider as BillingAuditRecord['provider'],
      ...(row.external_transaction_id
        ? { externalTransactionId: String(row.external_transaction_id) }
        : {}),
      occurredAt: String(row.occurred_at),
      retentionNote: String(row.retention_note),
    };
  }

  saveTelemetryRecord(usage: TelemetryUsage, userId?: string): void {
    const recordId = `tel_${usage.sessionId}`;
    this.requireDb()
      .prepare(
        `INSERT INTO telemetry_records (
           record_id, session_id, user_id, updated_at, usage_source,
           input_tokens, output_tokens, cached_input_tokens, total_tokens,
           model_calls, retries, local_rule_evals, latency_ms, cost_fen, data_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(record_id) DO UPDATE SET
           updated_at = excluded.updated_at,
           usage_source = excluded.usage_source,
           input_tokens = excluded.input_tokens,
           output_tokens = excluded.output_tokens,
           cached_input_tokens = excluded.cached_input_tokens,
           total_tokens = excluded.total_tokens,
           model_calls = excluded.model_calls,
           retries = excluded.retries,
           local_rule_evals = excluded.local_rule_evals,
           latency_ms = excluded.latency_ms,
           cost_fen = excluded.cost_fen,
           data_json = excluded.data_json`,
      )
      .run(
        recordId,
        usage.sessionId,
        userId ?? null,
        usage.updatedAt,
        usage.usageSource,
        usage.inputTokens,
        usage.outputTokens,
        usage.cachedInputTokens,
        usage.totalTokens,
        usage.modelCalls,
        usage.retries,
        usage.localRuleEvaluations,
        usage.latencyMs,
        usage.costFen,
        JSON.stringify(usage),
      );
  }

  // ---------------- Data Sovereignty ----------------

  exportUserData(user: UserAccount, usageSummary: AccountUsageSummary): UserDataExportBundle {
    const db = this.requireDb();
    const packRows = db
      .prepare('SELECT data_json FROM presentation_packs WHERE user_id = ? ORDER BY updated_at DESC')
      .all(user.userId) as Array<{ data_json: string }>;
    const reflectionRows = db
      .prepare('SELECT data_json FROM session_reflections WHERE user_id = ? ORDER BY generated_at DESC')
      .all(user.userId) as Array<{ data_json: string }>;

    return {
      exportId: `exp_${randomUUID()}`,
      exportedAt: nowUtcIso8601(),
      schemaVersion: 2,
      user: { ...user },
      entitlements: this.listEntitlements(user.userId),
      usageSummary,
      usageRecords: this.listUsageRecords(user.userId),
      billingAuditRecords: this.listBillingAudit(user.userId),
      packs: packRows.map((r) => JSON.parse(r.data_json) as PresentationContextPack),
      memories: this.listMemories({ userId: user.userId }),
      reflections: reflectionRows.map((r) => JSON.parse(r.data_json) as PresentationReflection),
    };
  }

  wipeSessionData(params: {
    sessionId: string;
    userId?: string;
    tenantId?: string;
    requestedAt: UtcIso8601;
    completedAt: UtcIso8601;
  }): DataDeletionReceipt {
    return this.withTransaction(() => {
      const db = this.requireDb();
      const memDeleted = this.wipeSessionMemories(params.sessionId, params.userId);
      const eventsRes = db
        .prepare('DELETE FROM session_events WHERE session_id = ?')
        .run(params.sessionId);
      const reflRes = db
        .prepare('DELETE FROM session_reflections WHERE session_id = ?')
        .run(params.sessionId);
      const telRes = db
        .prepare('DELETE FROM telemetry_records WHERE session_id = ?')
        .run(params.sessionId);
      // Unlink session reference while keeping usage_ledger rows for quota integrity.
      db.prepare('UPDATE usage_ledger SET session_id = NULL WHERE session_id = ?').run(params.sessionId);
      const sessRes = db
        .prepare('DELETE FROM sessions WHERE session_id = ?')
        .run(params.sessionId);

      const auditCount = params.userId
        ? Number(
            (
              db
                .prepare('SELECT COUNT(*) AS cnt FROM billing_audit_log WHERE user_id = ?')
                .get(params.userId) as { cnt: number }
            ).cnt,
          )
        : 0;

      void eventsRes;
      return {
        receiptId: `del_${randomUUID()}`,
        userId: params.userId ?? 'local',
        tenantId: params.tenantId ?? 'local',
        requestedAt: params.requestedAt,
        completedAt: params.completedAt,
        deletedScopes: [
          { scope: 'sessions', deletedCount: Number(sessRes.changes) },
          { scope: 'reflections', deletedCount: Number(reflRes.changes) },
          { scope: 'memories', deletedCount: memDeleted },
          { scope: 'telemetry', deletedCount: Number(telRes.changes) },
        ],
        preservedRecords: [
          {
            category: 'billing_audit_logs',
            count: auditCount,
            reason: '计费配额与账务合规对账记录依据最小化留存策略保留。',
            retentionPolicy: '最小化账务审计记录按财税合规周期留存，不含演讲正文或隐私记忆。',
          },
        ],
        thirdPartyCaveats: [...THIRD_PARTY_WIPE_CAVEATS],
      };
    });
  }

  wipeAccountData(params: {
    userId: string;
    tenantId: string;
    requestedAt: UtcIso8601;
    completedAt: UtcIso8601;
  }): DataDeletionReceipt {
    return this.withTransaction(() => {
      const db = this.requireDb();
      const eventsRes = db
        .prepare(
          `DELETE FROM session_events WHERE user_id = ?
           OR session_id IN (SELECT session_id FROM sessions WHERE user_id = ?)`,
        )
        .run(params.userId, params.userId);
      void eventsRes;

      const reflCount = Number(
        db.prepare('DELETE FROM session_reflections WHERE user_id = ?').run(params.userId).changes,
      );
      const sessCount = Number(
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(params.userId).changes,
      );
      const packCount = Number(
        db.prepare('DELETE FROM presentation_packs WHERE user_id = ?').run(params.userId).changes,
      );
      const memCount = Number(
        db.prepare('DELETE FROM memories WHERE user_id = ?').run(params.userId).changes,
      );
      const telCount = Number(
        db.prepare('DELETE FROM telemetry_records WHERE user_id = ?').run(params.userId).changes,
      );
      const usageCount = Number(
        db.prepare('DELETE FROM usage_ledger WHERE user_id = ?').run(params.userId).changes,
      );
      const tokCount = Number(
        db.prepare('DELETE FROM auth_tokens WHERE user_id = ?').run(params.userId).changes,
      );

      db.prepare("UPDATE entitlements SET status = 'revoked' WHERE user_id = ?").run(params.userId);

      this.appendBillingAuditIdempotent({
        auditId: `aud_${randomUUID()}`,
        userId: params.userId,
        tenantId: params.tenantId,
        eventType: 'account_wiped',
        provider: 'manual',
        occurredAt: params.completedAt,
        retentionNote: '账户业务数据已擦除，仅保留最小化账务合规审计日志（不含演讲稿、音频或记忆正文）。',
      });

      const auditCount = Number(
        (
          db
            .prepare('SELECT COUNT(*) AS cnt FROM billing_audit_log WHERE user_id = ?')
            .get(params.userId) as { cnt: number }
        ).cnt,
      );

      return {
        receiptId: `del_${randomUUID()}`,
        userId: params.userId,
        tenantId: params.tenantId,
        requestedAt: params.requestedAt,
        completedAt: params.completedAt,
        deletedScopes: [
          { scope: 'sessions', deletedCount: sessCount },
          { scope: 'packs', deletedCount: packCount },
          { scope: 'memories', deletedCount: memCount },
          { scope: 'reflections', deletedCount: reflCount },
          { scope: 'telemetry', deletedCount: telCount },
          { scope: 'usage_records', deletedCount: usageCount },
          { scope: 'auth_tokens', deletedCount: tokCount },
        ],
        preservedRecords: [
          {
            category: 'billing_audit_logs',
            count: auditCount,
            reason: '依据财税及反欺诈合规要求保留最小化账务与配额事件摘要。',
            retentionPolicy: '不包含文档原文、ASR 转写、Prompt 或确认记忆正文。',
          },
        ],
        thirdPartyCaveats: [...THIRD_PARTY_WIPE_CAVEATS],
      };
    });
  }

  // ---------------- Legacy JSON Migration & Backup ----------------

  migrateLegacyJsonFiles(opts: {
    runtimeDir: string;
    packsDir?: string;
    memoryDir?: string;
    defaultUserId?: string;
    defaultTenantId?: string;
  }): LegacyMigrationReport {
    if (this.getMetadata('legacy_json_migrated_v1') === '1') {
      return { packsMigrated: 0, memoriesMigrated: 0, backupFiles: [], skippedAlreadyMigrated: true };
    }

    const packsFile = opts.packsDir ? join(opts.packsDir, 'packs.json') : join(opts.runtimeDir, 'packs', 'packs.json');
    const memoryFile = opts.memoryDir ? join(opts.memoryDir, 'items.json') : join(opts.runtimeDir, 'memory', 'items.json');
    const backupDir = join(opts.runtimeDir, 'legacy-backups');
    const backupFiles: string[] = [];
    const stamp = nowUtcIso8601().replace(/[:.]/g, '-');

    let packsMigrated = 0;
    let memoriesMigrated = 0;

    this.withTransaction(() => {
      if (existsSync(packsFile)) {
        mkdirSync(backupDir, { recursive: true });
        const bak = join(backupDir, `packs-${stamp}.json.bak`);
        copyFileSync(packsFile, bak);
        backupFiles.push(bak);
        try {
          const parsed = JSON.parse(readFileSync(packsFile, 'utf8')) as { packs?: Array<Record<string, unknown>> };
          for (const rawPack of parsed.packs ?? []) {
            if (!rawPack || typeof rawPack.packId !== 'string') continue;
            if (rawPack.isSample === true && rawPack.packId === 'pack_cuex_demo_01') continue;
            const v2Pack = normalizePresentationContextPackV1ToV2(rawPack);
            if (!v2Pack.userId && opts.defaultUserId) v2Pack.userId = opts.defaultUserId;
            if (!v2Pack.tenantId && opts.defaultTenantId) v2Pack.tenantId = opts.defaultTenantId;
            this.savePack(v2Pack);
            packsMigrated += 1;
          }
        } catch {
          // Leave malformed legacy JSON backed up safely without crashing server startup.
        }
      }

      if (existsSync(memoryFile)) {
        mkdirSync(backupDir, { recursive: true });
        const bak = join(backupDir, `memory-items-${stamp}.json.bak`);
        copyFileSync(memoryFile, bak);
        backupFiles.push(bak);
        try {
          const parsed = JSON.parse(readFileSync(memoryFile, 'utf8')) as { items?: Array<Record<string, unknown>> };
          for (const rawMem of parsed.items ?? []) {
            if (!rawMem || rawMem.userConfirmed !== true || typeof rawMem.memoryId !== 'string') continue;
            const v2Mem = normalizeMemoryItemV1ToV2(rawMem);
            if (!v2Mem.userId && opts.defaultUserId) v2Mem.userId = opts.defaultUserId;
            if (!v2Mem.tenantId && opts.defaultTenantId) v2Mem.tenantId = opts.defaultTenantId;
            this.saveMemory(v2Mem);
            memoriesMigrated += 1;
          }
        } catch {
          // Safe fallback with backup preserved.
        }
      }

      this.setMetadata('legacy_json_migrated_v1', '1');
    });

    return {
      packsMigrated,
      memoriesMigrated,
      backupFiles,
      skippedAlreadyMigrated: false,
    };
  }

  backupToFile(destinationPath: string): void {
    const db = this.requireDb();
    if (this.dbPath !== ':memory:') {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    }
    mkdirSync(dirname(destinationPath), { recursive: true });
    const tmpDest = `${destinationPath}.${process.pid}.${Date.now()}.tmp`;
    db.exec(`VACUUM INTO ${escapeSqlLiteral(tmpDest)}`);
    renameSync(tmpDest, destinationPath);
  }

  getMetadata(key: string): string | undefined {
    const row = this.requireDb()
      .prepare('SELECT value FROM system_metadata WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMetadata(key: string, value: string): void {
    this.requireDb()
      .prepare(
        `INSERT INTO system_metadata (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, nowUtcIso8601());
  }
}
