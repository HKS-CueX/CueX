import type { DatabaseSync } from 'node:sqlite';
import { nowUtcIso8601 } from '@cuex/protocol';

export interface SqliteMigration {
  version: string;
  description: string;
  sql: string;
}

export const SQLITE_MIGRATIONS: readonly SqliteMigration[] = [
  {
    version: '001_core_domain',
    description: 'Users, auth tokens, presentation packs, sessions, reflections, events, and memories',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        email TEXT,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        auth_mode TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

      CREATE TABLE IF NOT EXISTS auth_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

      CREATE TABLE IF NOT EXISTS presentation_packs (
        storage_key TEXT PRIMARY KEY,
        pack_id TEXT NOT NULL,
        user_id TEXT,
        tenant_id TEXT,
        scenario_id TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        is_sample INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL,
        scene_type TEXT NOT NULL,
        target_duration_sec INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_packs_pack_id ON presentation_packs(pack_id);
      CREATE INDEX IF NOT EXISTS idx_packs_owner ON presentation_packs(user_id, tenant_id, updated_at);

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT,
        tenant_id TEXT,
        pack_id TEXT,
        pack_title TEXT,
        scenario_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        view_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        silent_mode INTEGER NOT NULL DEFAULT 0,
        max_intervention_level TEXT NOT NULL,
        privacy_notice_accepted INTEGER NOT NULL DEFAULT 1,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_ms INTEGER,
        elapsed_sec INTEGER,
        utility_score REAL,
        coverage_ratio REAL,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(user_id, tenant_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS session_reflections (
        session_id TEXT PRIMARY KEY,
        user_id TEXT,
        tenant_id TEXT,
        pack_id TEXT NOT NULL,
        utility_score REAL NOT NULL,
        coverage_ratio REAL NOT NULL,
        generated_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reflections_owner ON session_reflections(user_id, generated_at DESC);

      CREATE TABLE IF NOT EXISTS session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_id TEXT,
        server_seq INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        category TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        correlation_id TEXT,
        payload_json TEXT NOT NULL,
        UNIQUE(session_id, server_seq)
      );
      CREATE INDEX IF NOT EXISTS idx_session_events_lookup ON session_events(session_id, server_seq);

      CREATE TABLE IF NOT EXISTS memories (
        memory_id TEXT PRIMARY KEY,
        user_id TEXT,
        tenant_id TEXT,
        scenario_id TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        source_session_id TEXT,
        user_confirmed INTEGER NOT NULL DEFAULT 1,
        privacy_level TEXT NOT NULL,
        scope TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        tags_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_owner ON memories(user_id, tenant_id, scenario_id);
      CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(source_session_id);
    `,
  },
  {
    version: '002_commercial_and_telemetry',
    description: 'Entitlements, idempotent usage ledger, billing audit logs, and telemetry snapshots',
    sql: `
      CREATE TABLE IF NOT EXISTS entitlements (
        entitlement_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL,
        granted_at TEXT NOT NULL,
        expires_at TEXT,
        remaining_sessions INTEGER,
        remaining_live_minutes INTEGER,
        source TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entitlements_owner ON entitlements(user_id, tenant_id, status);

      CREATE TABLE IF NOT EXISTS usage_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT,
        session_id TEXT,
        entitlement_id TEXT,
        usage_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        cost_fen INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage_ledger(user_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_ledger(session_id);

      CREATE TABLE IF NOT EXISTS billing_audit_log (
        audit_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        plan_id TEXT,
        amount_fen INTEGER,
        currency TEXT NOT NULL DEFAULT 'CNY',
        provider TEXT NOT NULL,
        external_transaction_id TEXT,
        idempotency_key TEXT UNIQUE,
        occurred_at TEXT NOT NULL,
        retention_note TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_billing_audit_user ON billing_audit_log(user_id, occurred_at DESC);

      CREATE TABLE IF NOT EXISTS telemetry_records (
        record_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT,
        updated_at TEXT NOT NULL,
        usage_source TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        model_calls INTEGER NOT NULL DEFAULT 0,
        retries INTEGER NOT NULL DEFAULT 0,
        local_rule_evals INTEGER NOT NULL DEFAULT 0,
        latency_ms REAL NOT NULL DEFAULT 0,
        cost_fen INTEGER NOT NULL DEFAULT 0,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_records(session_id);
      CREATE INDEX IF NOT EXISTS idx_telemetry_user ON telemetry_records(user_id);

      CREATE TABLE IF NOT EXISTS system_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

export function applySqliteMigrations(db: DatabaseSync): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set<string>(
    (
      db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all() as Array<{
        version: string;
      }>
    ).map((row) => row.version),
  );

  const newlyApplied: string[] = [];
  for (const migration of SQLITE_MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)',
      ).run(migration.version, migration.description, nowUtcIso8601());
      db.exec('COMMIT');
      newlyApplied.push(migration.version);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return newlyApplied;
}
