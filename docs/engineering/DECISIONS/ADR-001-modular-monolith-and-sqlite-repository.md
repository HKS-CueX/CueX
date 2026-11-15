# ADR-001: Modular Monolith & Built-in `node:sqlite` `StorageRepository`

- **Status**: Accepted & Implemented (Phase 2 Stage B)
- **Date**: `2026-11-16`
- **Audit Drivers**: [PHASE2_AUDIT.md §Q1](../PHASE2_AUDIT.md#q1-durable-persistence-across-process-restarts-缺失待-stage-b-落地-severity-p0), [RISK-02](../PHASE2_RISK_REGISTER.md)

## Context

In Phase 1 (`6804f5a`), `CueXGatewayServer` (`apps/server/src/gateway/GatewayServer.ts:150`) stored live and completed sessions solely inside an in-memory `Map`, while `PresentationPackStore` (`packs.json`) and `MemoryStore` (`items.json`) rewrote whole JSON files synchronously. Any server restart wipes live sessions and reflections (`GET /api/sessions/:id/reflection`), and concurrent mutations lack ACID transactional isolation.

At the same time, CueX currently targets single-node deployment (`1` OPC / early beta Node >= 22 instance, sub-second WS cognitive turn latency, offline reproducible dev/CI runs via `pnpm test` with zero external Docker daemon dependencies).

## Decision

1. **Preserve the Modular Monolith Runtime Topology**: Keep `@cuex/protocol`, `apps/server` (Gateway + Universal Cognitive Runtime + Scenario Adapter Layer), and `apps/web` inside a single deployable workspace rather than splitting into premature microservices.
2. **Introduce a `StorageRepository` Port + `SqliteStorageRepository` Implementation (`node:sqlite`)**:
   - Define repository interfaces cleanly inside `apps/server/src/storage/` covering the implemented Stage B SQLite schema (`users`, `auth_tokens`, `presentation_packs`, `sessions`, `session_reflections`, `session_events`, `memories`, `entitlements`, `usage_ledger`, `billing_audit_log`, `telemetry_records`, `system_metadata`, and `schema_migrations`, with evidence vectors stored cleanly inside `presentation_packs` JSON payload and session metrics inside `telemetry_records`/`session_reflections`).
   - Back the default implementation with Node.js built-in **`node:sqlite` (`DatabaseSync`)** enabled with **`PRAGMA journal_mode = WAL;`**, `PRAGMA foreign_keys = ON;`, explicit SQL schema migration versioning, and zero external npm native compilation steps (`pnpm-lock.yaml` stays minimal and deterministic on Node 22+/26).
3. **Define a Clean PostgreSQL Migration Path (Phase 3 / Scale Trigger)**:
   - Keep SQL queries standard ANSI/SQLite-compatible inside `StorageRepository` without leaking SQLite-specific types into `CognitiveRuntimeSession` or `ScenarioRegistry`, enabling a drop-in `PostgresStorageRepository` once multi-instance horizontal scaling (>100 concurrent WebSocket nodes or managed multi-region HA) becomes necessary.

## Rejected Alternatives

- **Kafka / RabbitMQ + Redis Cluster + Kubernetes + Microservices Split**: Rejected as severe over-engineering for an OPC/seed-stage single-node real-time copilot. Adding distributed network hops between System 1, Retrieval, `InterventionController`, and WebSocket transport increases live cue latency (`<= 500 ms` target), introduces operational failure modes, and breaks offline reproducible CI (`pnpm test`).
- **Continuing Flat JSON File Stores**: Rejected due to lost sessions on restart, `O(N)` full-file rewrites, missing foreign-key integrity between `Evidence`/`Session`/`UsageRecord`, and lack of idempotency transactions.

## Consequences

- **Positive**: Zero extra infrastructure dependencies for `pnpm demo` and CI; durable sessions/reflections/packs/ledgers across restarts; atomic `UsageLedger` idempotency keys (`UNIQUE(user_id, idempotency_key)`).
- **Trade-off**: Single-writer WAL SQLite assumes vertical single-host deployment (`infra/deploy/cuex.service.example`) during seed/early SaaS stage; multi-node active-active scaling requires swapping `StorageRepository` to PostgreSQL + sticky WebSocket routing.
