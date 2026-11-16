# ADR-002: `CloudEvents`-Inspired `EventEnvelope<TPayload>` & Strict Schema Versioning

- **Status**: Accepted & Implemented (Stage A `@cuex/protocol` + Stage B Runtime Adoption)
- **Date**: `2026-11-16`
- **Audit Drivers**: [PHASE2_AUDIT.md §Q3, §Q4](../PHASE2_AUDIT.md#q4-websocket-reconnect-deduplication-sequencing--timeevent-invariants-缺失待-stage-b-落地-severity-p1)

## Context

Phase 1 protocols mixed wall-clock numeric epoch milliseconds (`ContextStore.ts:58`, `PresentationCompiler.ts:113`, `PresentationRuntime.ts:267`) with ISO-8601 strings (`MemoryStore.ts:86,124`), lacked explicit schema version constants on persisted artifacts (`packs.json` hardcoded `version: 1`), lacked runtime input/payload validators (`GatewayServer.ts:91,861` trusted `JSON.parse(...) as T`), and sent unsequenced WS messages without `idempotencyKey`, `correlationId`, or `serverSeq` reconnect deduplication.

## Decision

1. **Standardize Semantic Protocol & Artifact Versions (`packages/protocol/src/versions.ts`)**:
   - Export and embed `API_VERSION = '2026-11'`, `WS_PROTOCOL_VERSION = '2.0'`, `PACK_SCHEMA_VERSION = 2`, `EVIDENCE_SCHEMA_VERSION = 2`, `MEMORY_SCHEMA_VERSION = 2`, and `EVENT_ENVELOPE_VERSION = 1`.
   - Maintain `packages/protocol/compatibility/v1-to-v2.ts` with `toUtcIso8601()` and pack/memory/event upgraders so legacy v1 JSON snapshots migrate deterministically on load.
2. **Adopt a `CloudEvents 1.0.2`-Inspired `EventEnvelope<TPayload>`**:
   - Structure: `{ specVersion: '1.0', eventId, eventType, eventVersion, occurredAt, sessionId?, tenantId?, userId?, correlationId, causationId?, producer, traceId?, privacyClass, idempotencyKey?, payload }`.
   - Note: `CloudEvents 1.0.2` serves strictly as an architectural envelope reference for correlation, causation, and provenance tracing — not a compliance certification claim.
3. **Strict Time & Money Type Invariants**:
   - All wall-clock timestamps (`createdAt`, `updatedAt`, `occurredAt`, `startedAt`, `endedAt`, `expiresAt`, `timestamp`) MUST use **`UtcIso8601` strings** (`YYYY-MM-DDTHH:mm:ss.sssZ`).
   - All durations, latency metrics, offsets, TTLs, and cooldowns MUST remain numeric fields explicitly suffixed `*Ms` or `*Sec`.
   - All monetary values MUST use integer minor units (`MoneyAmount { amountFen: number; currency: 'CNY' }` validated with `Number.isSafeInteger`).
4. **Backward-Compatible WS Sequencing & Zero-Dependency Validators**:
   - Extend `ClientMessage` and `ServerMessage` with optional `envelope`, `idempotencyKey`, `correlationId`, and `serverSeq` so clients dedupe duplicate reconnect retries and track server event order.
   - Export zero-dependency runtime validators (`validate*`) returning `{ ok: true, value } | { ok: false, issues }` plus machine-readable JSON Schemas (`packages/protocol/schemas/*.schema.json`) and canonical sample fixtures (`examples/*.json`).

## Rejected Alternatives

- **Introducing `zod` / `ajv` into `@cuex/protocol`**: Rejected in Phase 2 to keep `packages/protocol` strictly zero-dependency (protecting `pnpm-lock.yaml` invariance, instant browser bundle size, and Node `--experimental-strip-types` native test speed).
- **Breaking WS v1 Clients Abruptly**: Rejected; keeping `envelope?`, `serverSeq?`, and `idempotencyKey?` progressive/upgradable alongside `v1-to-v2.ts` lets tests and clients migrate incrementally without breaking offline eval loops.

## Consequences

- **Positive**: Deterministic timestamp ordering across browser/Node/SQLite, crash-safe v1->v2 upgrader, safe WS reconnect handling, and unified `ApiErrorResponse` codes (`VALIDATION_ERROR`, `SCHEMA_VERSION_UNSUPPORTED`, etc.).
- **Trade-off**: Zero-dependency validators require disciplined maintenance alongside TypeScript types and JSON Schema mirrors inside `packages/protocol/test/`.
