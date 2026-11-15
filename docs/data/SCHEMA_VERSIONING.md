# CueX Schema Versioning & Compatibility Policy

> Source of Truth: `packages/protocol/src/versions.ts` & `packages/protocol/compatibility/v1-to-v2.ts`  
> Policy Reference: [ADR-002](../engineering/DECISIONS/ADR-002-event-envelope-and-schema-versioning.md)

---

## 1. Authoritative Version Constants (`Phase 2`)

| Constant | Value | Scope | Change Trigger |
| --- | --- | --- | --- |
| `API_VERSION` | `'2026-11'` | REST API contract (`openapi.yaml` & `HealthStatusResponse`) | Breaking endpoint/payload change or quarterly API cut |
| `WS_PROTOCOL_VERSION` | `'2.0'` | WebSocket `/ws` bidirectional framing (`EventEnvelope` + `serverSeq` + `idempotencyKey`) | Breaking WS message contract change |
| `PACK_SCHEMA_VERSION` | `2` | Persisted `ContextPack` / `PresentationContextPack` JSON & SQLite blobs | Structural change to CueSheet, Facts, QACards, or ProgressNodes |
| `EVIDENCE_SCHEMA_VERSION` | `2` | `Evidence` records (`contentHash`, `sourceDocumentId`, `UtcIso8601` timestamps, `schemaVersion`) | Addition/mutation of required provenance fields |
| `MEMORY_SCHEMA_VERSION` | `2` | Persisted `MemoryItem` records (`userId`, `schemaVersion`, `UtcIso8601` timestamps) | Change in scope, category, or ownership contract |
| `EVENT_ENVELOPE_VERSION` | `1` | `EventEnvelope<TPayload>` structure (`specVersion: '1.0'`) | Change in outer envelope routing/trace fields |

---

## 2. Backward Compatibility & `v1 -> v2` Normalization Rules

1. **Additive Evolution Within a Version**:
   - Adding **optional** fields to existing REST responses, WS payloads, or JSON schemas does NOT bump major schema version constants.
   - Removing, renaming, or changing the type/semantics of an existing required field requires incrementing the relevant `*SCHEMA_VERSION` constant and adding a migration adapter.
2. **Legacy Phase 1 (`v1`) Timestamp & Entity Upgrader (`v1-to-v2.ts`)**:
   - **Numeric Epoch ms -> `UtcIso8601`**: Phase 1 stores (`packs.json` `version: 1`, epoch `startedAt` / `endedAt` / `timestamp`) are upgraded deterministically on read via `toUtcIso8601(value)`. Invalid/corrupt non-finite values fail fast cleanly rather than silently storing `1970-01-01` or `NaN`.
   - **Pack & Memory Upgrade (`migrateLegacyJsonFiles`)**: Legacy `packs.json` and `memory/items.json` are backed up first to `.cuex-runtime/legacy-backups/` with `.bak` extensions, normalized to v2 preserving existing `userConfirmed` flags (never auto-promoting unconfirmed records), imported into SQLite inside an atomic transaction, and flagged via `system_metadata` (`legacy_json_migrated_v1 = '1'`).
   - **Unsupported Future Versions**: Payloads failing runtime schema/version validation fail fast with `VALIDATION_ERROR` (`400`) or `SCHEMA_VERSION_UNSUPPORTED` (`422`) per `packages/protocol/src/errors.ts`.

---

## 3. SQLite Schema Migration Discipline (`ADR-001`)

- Versioned forward SQL migrations in `apps/server/src/storage/migrations.ts` (`001_core_domain`, `002_commercial_and_telemetry`) run sequentially and idempotently on startup inside atomic transactions tracked in SQLite table `schema_migrations`.
- Migrations execute before `GatewayServer` begins accepting HTTP or WebSocket traffic.
- Destructive column drops require an intermediate additive migration + verified backup snapshot via `pnpm db:backup` ([BACKUP_AND_RECOVERY.md](../operations/BACKUP_AND_RECOVERY.md)).

---

## 4. Machine-Readable Schemas & Contract Testing

- JSON Schema mirrors live under `packages/protocol/schemas/*.schema.json` alongside OpenAPI (`docs/api/openapi.yaml` `3.2.1`) and AsyncAPI (`docs/api/asyncapi.yaml` `3.1.0`).
- Every change modifying `packages/protocol/src/` MUST update the matching schema/contract artifacts and pass `pnpm --filter @cuex/protocol test` + root `pnpm typecheck` in `.github/workflows/ci.yml`.
