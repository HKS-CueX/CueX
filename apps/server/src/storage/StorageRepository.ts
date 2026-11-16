import type {
  AccountUsageSummary,
  BillingAuditRecord,
  DataDeletionReceipt,
  Entitlement,
  EventEnvelopeMeta,
  MemoryItem,
  PlanId,
  PresentationContextPack,
  PresentationPackSummary,
  PresentationReflection,
  ScenarioId,
  Session,
  TelemetryUsage,
  UsageRecord,
  UserAccount,
  UserDataExportBundle,
  UtcIso8601,
} from '@cuex/protocol';

export interface AuthTokenRecord {
  tokenHash: string;
  userId: string;
  tenantId: string;
  createdAt: UtcIso8601;
  expiresAt: UtcIso8601;
  revokedAt?: UtcIso8601;
}

export interface SessionSummaryItem {
  sessionId: string;
  userId?: string;
  tenantId?: string;
  packId?: string;
  title?: string;
  scenarioId: ScenarioId;
  mode: string;
  status: Session['status'];
  startedAt: UtcIso8601;
  endedAt?: UtcIso8601;
  durationMs?: number;
  elapsedSec?: number;
  utilityScore?: number;
  coverageRatio?: number;
}

export interface StoredSessionRecord {
  session: Session;
  packTitle?: string;
  elapsedSec?: number;
  durationMs?: number;
  utilityScore?: number;
  coverageRatio?: number;
}

export interface StoredSessionEvent {
  sessionId: string;
  userId?: string;
  serverSeq: number;
  eventId: string;
  eventType: string;
  category: 'ws_server' | 'cognitive';
  occurredAt: UtcIso8601;
  correlationId?: string;
  payload: unknown;
}

export interface ReserveSessionQuotaParams {
  userId: string;
  tenantId: string;
  sessionId: string;
  idempotencyKey: string;
  periodStart: UtcIso8601;
  occurredAt: UtcIso8601;
  defaultMonthlyLimit: number;
}

export type ReserveSessionQuotaResult =
  | {
      ok: true;
      entitlement: Entitlement;
      usageRecord: UsageRecord;
      deduplicated: boolean;
    }
  | {
      ok: false;
      reason: string;
    };

export interface LegacyMigrationReport {
  packsMigrated: number;
  memoriesMigrated: number;
  backupFiles: string[];
  skippedAlreadyMigrated: boolean;
}

/**
 * Persistence abstraction decoupling CognitiveRuntime, Gateway, Memory, Pack, Auth, and Commercial modules
 * from concrete database engines (SQLite in Phase 2 -> PostgreSQL ready).
 */
export interface StorageRepository {
  init(): void;
  close(): void;
  ping(): boolean;
  withTransaction<T>(fn: () => T): T;

  // Users & Auth Tokens
  upsertUser(user: UserAccount): UserAccount;
  findUserById(userId: string): UserAccount | undefined;
  findUserByEmail(email: string): UserAccount | undefined;
  createAuthToken(record: AuthTokenRecord): void;
  findActiveAuthToken(tokenHash: string, nowIso: UtcIso8601): AuthTokenRecord | undefined;
  revokeAuthToken(tokenHash: string, revokedAt: UtcIso8601): boolean;

  // Presentation Packs
  listPackSummaries(userId?: string): PresentationPackSummary[];
  getPack(packId: string, userId?: string): PresentationContextPack | undefined;
  getPackOwner(packId: string): { userId?: string; isSample: boolean } | undefined;
  savePack(pack: PresentationContextPack, options?: { isSampleOverride?: boolean }): PresentationContextPack;

  // Opt-in Memories
  listMemories(filter?: {
    userId?: string;
    scenarioId?: ScenarioId | 'universal';
    sessionId?: string;
  }): MemoryItem[];
  getMemory(memoryId: string): MemoryItem | undefined;
  saveMemory(item: MemoryItem): MemoryItem;
  deleteMemory(memoryId: string): boolean;
  wipeSessionMemories(sessionId: string, userId?: string): number;

  // Sessions, Reflections & Sequenced Events
  saveSession(record: StoredSessionRecord): void;
  getSession(sessionId: string): StoredSessionRecord | undefined;
  listSessions(userId?: string, limit?: number): SessionSummaryItem[];
  saveReflection(reflection: PresentationReflection, userId?: string, tenantId?: string): void;
  getReflection(sessionId: string): PresentationReflection | undefined;
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
  }): void;
  listSessionEventsSince(sessionId: string, afterServerSeq: number, category?: 'ws_server' | 'cognitive'): StoredSessionEvent[];

  // Commercial Entitlements, UsageLedger & Billing Audit
  listEntitlements(userId: string): Entitlement[];
  upsertEntitlement(entitlement: Entitlement): Entitlement;
  reserveSessionQuotaAtomically(params: ReserveSessionQuotaParams): ReserveSessionQuotaResult;
  recordUsageIdempotent(
    record: UsageRecord,
    options?: { decrementLiveMinutes?: number; entitlementId?: string },
  ): { record: UsageRecord; deduplicated: boolean };
  listUsageRecords(userId: string, periodStart?: UtcIso8601): UsageRecord[];
  computeUsageSummary(params: {
    userId: string;
    tenantId: string;
    periodStart: UtcIso8601;
    periodEnd: UtcIso8601;
    activePlanId: PlanId;
    sessionsLimit: number | null;
    liveMinutesLimit: number | null;
    nowIso: UtcIso8601;
  }): AccountUsageSummary;
  appendBillingAuditIdempotent(
    record: BillingAuditRecord,
    idempotencyKey?: string,
  ): { record: BillingAuditRecord; deduplicated: boolean };
  listBillingAudit(userId: string): BillingAuditRecord[];
  saveTelemetryRecord(usage: TelemetryUsage, userId?: string): void;

  // Data Sovereignty
  exportUserData(user: UserAccount, usageSummary: AccountUsageSummary): UserDataExportBundle;
  wipeSessionData(params: {
    sessionId: string;
    userId?: string;
    tenantId?: string;
    requestedAt: UtcIso8601;
    completedAt: UtcIso8601;
  }): DataDeletionReceipt;
  wipeAccountData(params: {
    userId: string;
    tenantId: string;
    requestedAt: UtcIso8601;
    completedAt: UtcIso8601;
  }): DataDeletionReceipt;

  // Legacy Migration & Backup
  migrateLegacyJsonFiles(opts: {
    runtimeDir: string;
    packsDir?: string;
    memoryDir?: string;
    defaultUserId?: string;
    defaultTenantId?: string;
  }): LegacyMigrationReport;
  backupToFile(destinationPath: string): void;
  getMetadata(key: string): string | undefined;
  setMetadata(key: string, value: string): void;
}
