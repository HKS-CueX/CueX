# CueX Backup & Recovery Runbook (`node:sqlite` WAL)

> Persistence Target: `SqliteStorageRepository` (`apps/server/src/storage/`, `cuex.db`, [ADR-001](../engineering/DECISIONS/ADR-001-modular-monolith-and-sqlite-repository.md))  
> CLI Tooling: **`scripts/db-backup-restore.mjs`** (`pnpm db:backup`)  
> Privacy Synchronization: Must adhere to [DATA_RETENTION.md](../privacy/DATA_RETENTION.md) regarding deletion tombstones & backup rotation caps.

---

## 1. Recovery Objectives (Single-Node Production Target)

| Metric | Target | Notes |
| --- | --- | --- |
| **RPO (Recovery Point Objective)** | **`<= 15 minutes`** (or `<= 24 hours` for daily snapshot tier) | Configured via scheduled hot snapshots (`pnpm db:backup backup ...`) using `PRAGMA wal_checkpoint(TRUNCATE)` + `VACUUM INTO`, shipped to encrypted object storage. |
| **RTO (Recovery Time Objective)** | **`<= 30 minutes`** | Automated SHA-256 & `PRAGMA integrity_check` verification + service swap on single-node host. |
| **Backup Retention Window** | **`7–30 days`** rolling encrypted rotation | Aligned strictly with `DATA_RETENTION.md` Row #8 carve-out disclosure. |

---

## 2. Safe Online Backup & Verification Procedure (`scripts/db-backup-restore.mjs`)

> **CRITICAL RULE**: NEVER copy raw `.db` files using plain `cp` while `apps/server` is running in WAL mode without consolidating WAL frames—doing so risks split `-wal` / `-shm` state corruption!

Use the built-in zero-external-CLI Node (`node:sqlite`) script `scripts/db-backup-restore.mjs` (`pnpm db:backup`), which executes `PRAGMA wal_checkpoint(TRUNCATE);`, creates a transactionally consistent `VACUUM INTO` snapshot, runs `PRAGMA integrity_check`, and writes a `.sha256.json` checksum manifest alongside the snapshot:

```bash
# 1. Create a verified WAL-consolidated snapshot + SHA-256 manifest (.sha256.json)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DB_PATH="${CUEX_SQLITE_PATH:-.cuex-runtime/cuex.db}"
SNAPSHOT="/var/backups/cuex/cuex-${STAMP}.db"

pnpm db:backup backup --db "$DB_PATH" --out "$SNAPSHOT"

# 2. Verify SQLite integrity on any snapshot or live database
pnpm db:backup verify --db "$SNAPSHOT"

# 3. Run the automated temporary-DB round-trip backup/restore self-test
pnpm db:backup --self-test

# Encrypt snapshot + manifest with host/KMS public key or age/gpg before off-host upload; NEVER store plaintext backups publicly.
```

---

## 3. Restore & Deletion Tombstone Replay Procedure

1. **Stop Write Traffic Cleanly**:
   - Place reverse proxy in maintenance mode (`503`) and stop `cuex` service (`systemctl stop cuex`).
2. **Quarantine Corrupt State**:
   - Move existing `.db`, `-wal`, `-shm` files to a timestamped quarantine directory for forensic inspection.
3. **Decrypt, Verify & Restore via `scripts/db-backup-restore.mjs`**:
   - Decrypt verified snapshot and matching `.sha256.json` manifest into staging path, then run:
     ```bash
     pnpm db:backup restore --backup /var/backups/cuex/cuex-YYYYMMDDTHHMMSSZ.db --db "${CUEX_SQLITE_PATH:-.cuex-runtime/cuex.db}"
     ```
   - `restore` checks optional `.sha256.json` checksum, runs `PRAGMA integrity_check`, replaces target `.db`, and cleans stale `-wal`/`-shm` sidecar files.
   - Verify schema migration state in SQLite `schema_migrations` (`001_core_domain`, `002_commercial_and_telemetry`).
4. **Reapply Deletion Tombstones *(Privacy Alignment)***:
   - Before reopening user traffic, replay any recorded account/session deletion tombstone IDs (`DataDeletionReceipt` records created between snapshot time and incident time) so wiped users' packs/sessions/memories do NOT resurrect silently after a rollback!
5. **Restart & Smoke-Verify**:
   - Start `@cuex/server` -> migrations run cleanly -> verify `GET /health`, test auth session lookup, test existing reflection `GET`, and reopen Nginx traffic.

---

## 4. Scheduled Restore Drill (`Monthly / Release Cadence`)

- Run `pnpm db:backup --self-test` in CI/pre-release checks, and at least once per release cycle (`staging`) restore the latest encrypted backup into an isolated scratch path, verify `PRAGMA integrity_check === 'ok'`, boot `@cuex/server` against it, and verify `GET /api/presentation/packs` + `GET /api/sessions/:id/reflection` return intact records.
