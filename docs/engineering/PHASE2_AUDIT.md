# CueX Phase 2 Engineering & Commercial Truth Audit

> Branch Audited: `refactor/universal-runtime-presentation` (`HEAD = 6804f5a` at audit start, branched from `main = 96cd742`)  
> Audit Date: `2026-11-16`  
> Scope: Rigorous Stage-A verification against **11 mandatory audit questions**, separating `[已实现]`, `[仅接口/本地降级]`, and `[缺失/待 Stage B 落地]` with exact file/line evidence and `P0`–`P3` severity ratings.

---

## Executive Summary

Phase 1 (`e2cb637` / `6804f5a`) successfully removed the legacy single-domain roleplay code, built the decoupled **Universal Cognitive Runtime** + **`CueX Presentation`** end-to-end demo (`13/13` server tests, `6/6` offline eval, `2/2` web reducer tests, Playwright E2E), and aligned initial docs/deliverables. However, transforming CueX from a **single-machine localhost hackathon/demo runtime** into a **production-grade, auditable multi-tenant SaaS & verifiable open-source engineering platform** reveals **3 `P0` blockers**, **7 `P1` high-priority gaps**, and **1 `P2` boundary refinement**:

| Severity | Count | Summary of Findings |
| --- | --- | --- |
| **`P0` (Blocker)** | 3 | (1) Ephemeral in-memory session storage + unversioned JSON file writes (`GatewayServer.ts:150`, `PresentationPackStore.ts:66`, `MemoryStore.ts:31`); (2) Zero multi-tenant authentication or ownership isolation (`GatewayServer.ts:280-420`); (3) Unbounded `inflateRawSync` / `inflateSync` decompression in `.pptx`/`.pdf` parsing (`DocumentExtractor.ts:75-77,314-316` — ZIP-bomb / OOM vector). |
| **`P1` (High)** | 7 | (4) Missing HTTP/WS rate limiting, runtime validators & standardized `ApiErrorResponse` (`GatewayServer.ts:91,288-418,484-869`); (5) Missing WS reconnect dedup / `serverSeq` / `EventEnvelope` & mixed epoch/ISO timestamps (`GatewayServer.ts:558-875`, `ContextStore.ts:58`, `MemoryStore.ts:86`); (6) Missing server-enforced `Entitlement` / `UsageLedger` / billing sandbox; (7) Unit economics misnomer (`breakevenSessionsPro` at `compute-unit-economics.mjs:163`), uniform `0.6%` payment fee assumption (`:49`), and `20–30` vs `30–50` cohort drift (`BUSINESS_MODEL.md:75` vs `ROADMAP.md:42`); (8) Dead TTS modules (`voice/tts-*.ts`, `msedge-tts`, `infra/windows/tts/**`) & legacy calibration filenames/docs needing neutralization (`LlamaSystemOne.ts:11`, Phase 1 `docs/engineering/*`); (9) Missing `UserDataExportBundle` + undocumented privacy wipe carve-outs (`GatewayServer.ts:379-395`); (10) Missing `.github/workflows/ci.yml`, `docs/api/{openapi,asyncapi}.yaml`, automated legacy scanner, SBOM, and Security/Privacy/Ops/Test docs. |
| **`P2` (Medium)** | 1 | Global `SAMPLE_ASR_CORRECTIONS` applied unconditionally in `GatewayServer.ts:637,651` regardless of pack, plus clarifying offline fake-mode eval vs hardware ASR/LLM verification boundaries. |

---

## Detailed Responses to the 11 Mandatory Audit Questions

### Q1. Durable Persistence Across Process Restarts (`[缺失/待 Stage B 落地]`, Severity: `P0`)
- **Audit Question**: Does runtime session state, cognitive telemetry, context packs, and reflections survive server restarts and concurrent writes safely?
- **Observed Evidence**:
  - `apps/server/src/gateway/GatewayServer.ts:150`: `private readonly sessions = new Map<string, SessionArchiveEntry>();` keeps all active and ended sessions, live `SharedCognitiveState`, `Candidate`/`Intervention` logs, and `PresentationReflection` objects strictly in Node process heap. Restarting the server wipes `GET /api/sessions/:id/reflection` (`GatewayServer.ts:397-415`) cleanly into `404`.
  - `apps/server/src/scenarios/presentation/PresentationPackStore.ts:12-15,66,93-100`: Persists compiled packs into a single monolithic JSON file (`packs.json`, `version: 1`) via full-file `JSON.stringify` + temp-file `renameSync`.
  - `apps/server/src/runtime/MemoryStore.ts:31,45`: Same monolithic JSON pattern (`items.json`). No transactional locking across multiple requests/processes, no `Session`/`Evidence`/`Outcome`/`UsageRecord` tables, and no schema migration runner.
- **Remediation**: Implement `StorageRepository` backed by Node's built-in `node:sqlite` (WAL mode + SQL migrations + explicit `PACK_SCHEMA_VERSION = 2` / `MEMORY_SCHEMA_VERSION = 2`) per [ADR-001](./DECISIONS/ADR-001-modular-monolith-and-sqlite-repository.md).

### Q2. Multi-Tenant Authentication, Authorization & Resource Isolation (`[缺失/待 Stage B 落地]`, Severity: `P0`)
- **Audit Question**: Are users isolated from reading, patching, deleting, or wiping another user's packs, sessions, reflections, and memories?
- **Observed Evidence**:
  - `apps/server/src/gateway/GatewayServer.ts:280-420` & `ws` connection upgrade: REST endpoints (`/api/presentation/packs/:packId`, `/api/memory/:id`, `/api/sessions/:id/wipe`, `/api/sessions/:id/reflection`) and WebSocket `/ws` (`/ws/session`) inspect no `Authorization: Bearer <token>`, perform no session/user ownership check, and rely solely on localhost `Origin` checks (`isAllowedOrigin`).
  - `PresentationPackStore` and `MemoryStore` contain no `userId` or `tenantId` ownership foreign key.
- **Remediation**: Add `UserAccount`, bearer session auth (`POST /api/auth/session` / local dev token helper + `Authorization` middleware), and strict `userId` ownership scoping on all persisted queries/mutations per [ADR-003](./DECISIONS/ADR-003-multi-tenant-auth-and-usage-ledger.md).

### Q3. Rate Limiting, Runtime Schema Validation & Unified Error Contract (`[缺失/待 Stage B 落地]`, Severity: `P1`)
- **Audit Question**: Are REST and WS inputs validated at runtime against malformed payloads/floods, and do errors conform to a typed contract?
- **Observed Evidence**:
  - `apps/server/src/gateway/GatewayServer.ts:91,861`: Both HTTP JSON requests (`readJsonBody`) and WS messages (`ws.on('message')`) cast `JSON.parse(...)` directly into TypeScript types (`as T`, `as ClientMessage`) with zero runtime schema validation (e.g., invalid types, missing required fields, negative durations, non-integer counts pass straight into runtime logic).
  - No HTTP per-route or WS per-connection token-bucket rate limiter exists anywhere in `GatewayServer.ts`.
  - Error shapes diverge: HTTP returns `{ error: string }` (`GatewayServer.ts:288,314,324,342,357,371,404,411,418`), while WS `sendError()` emits ad-hoc string codes (`PRIVACY_CONSENT_REQUIRED`, `SCENARIO_NOT_IMPLEMENTED`, `ASR_STREAM_ERROR`, `NO_ACTIVE_SESSION`, `INVALID_JSON`, `MESSAGE_ERROR` at lines `484-869`).
- **Remediation**: Adopt zero-dep `validate*` runtime validators and unified `ApiErrorResponse` codes (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, etc.) in `@cuex/protocol` v2, enforced in `GatewayServer` alongside sliding-window/token-bucket rate limits.

### Q4. WebSocket Reconnect Deduplication, Sequencing & Time/Event Invariants (`[缺失/待 Stage B 落地]`, Severity: `P1`)
- **Audit Question**: Can clients reconnect cleanly without duplicating side effects, and are timestamps/events consistently structured across modules?
- **Observed Evidence**:
  - `apps/server/src/gateway/GatewayServer.ts:558-875`: Each WS connection binds an isolated closure (`activeRuntime`); closing the socket immediately calls `stopTimers()` + `closeAsrStream()` (`:877-880`). There is no `serverSeq` sequence counter on `ServerMessage`, no client `idempotencyKey` deduplication cache, and no `EventEnvelope<TPayload>`.
  - Mixed wall-clock time representations: `ContextStore.ts:58` converts `updatedAt` to numeric `Date.now()` fallback; `PresentationCompiler.ts:113` and `PresentationRuntime.ts:267` emit epoch ms numbers (`atMs`), whereas `MemoryStore.ts:86,124` emits `new Date().toISOString()` UTC strings.
- **Remediation**: Standardize wall-clock fields on `UtcIso8601` strings (with `compatibility/v1-to-v2.ts` `toUtcIso8601()` normalizer and `*Ms`/`*Sec` strictly for durations), wrap domain events in `EventEnvelope<TPayload>`, and add `serverSeq` + `idempotencyKey` replay protection per [ADR-002](./DECISIONS/ADR-002-event-envelope-and-schema-versioning.md).

### Q5. Document Upload Bounds & `.pptx` ZIP-Bomb / `.pdf` Safety (`[部分实现 — 存在高危缺口]`, Severity: `P0`)
- **Audit Question**: Does `DocumentExtractor.ts` guard against ZIP bombs, oversized compressed streams, path issues, and unreadable PDFs safely?
- **Observed Evidence**:
  - **Working Honesty (`[已实现]`)**: `DocumentExtractor.ts:275-296,337-350` checks `%PDF-` header, rejects `/Encrypt` PDFs (`unreadable: true`), and flags `< 12` readable characters with explicit scanned-PDF warnings rather than hallucinating content.
  - **Critical Security Gap (`[缺失]`, `P0`)**:
    - `DocumentExtractor.ts:40-81` (`readZipEntries`) iterates `totalEntries` (16-bit up to 65,535) and calls **`inflateRawSync(slice)` (`:77`) with NO `maxOutputLength`**, NO entry count cap, NO per-entry or cumulative decompressed size cap, and NO compression-ratio bound. A tiny crafted `.pptx` (under the 15 MB HTTP JSON limit) can decompress into hundreds of megabytes or gigabytes in memory, crashing the Node process (DoS).
    - `DocumentExtractor.ts:314-316` (`extractPdf`) calls **`inflateSync(rawBytes)` with NO `maxOutputLength`** or stream cap.
    - Minor bug observed at `DocumentExtractor.ts:324`: `if (contentStr && contentStr.includes('Tj') || contentStr.includes('TJ'))` omits grouping parentheses (harmless for `''`, buggy operator precedence in spirit).
- **Remediation**: Enforce strict entry count limit, per-entry and cumulative `maxOutputLength` in `inflateRawSync`/`inflateSync`, max compression-ratio cap, and explicit extraction status (`'parsed' | 'unreadable' | 'rejected'`) returning `VALIDATION_ERROR` / `rejected` on abuse payloads.

### Q6. Server-Enforced Commercial Entitlements, Usage Metering & Billing Sandbox (`[缺失/待 Stage B 落地]`, Severity: `P1`)
- **Audit Question**: Are Free/Event/Pro quotas, usage telemetry billing, and payment webhooks implemented cleanly on the server, or only described in business slides?
- **Observed Evidence**:
  - Zero `Entitlement`, `UsageRecord`, `UsageLedger`, `PaymentCheckoutPreview`, or webhook verification code existed in Phase 1 `apps/server/` or `packages/protocol/`.
  - `UNIT_ECONOMICS.md` and `ppt/` slides described `Free` (`30 min`/month or 1 session), `Event` (`¥29` / 14 days / 6 rehearsals + 1 live), `Pro` (`¥59/mo`, `¥499/yr`, 600 min/month), and `Team`, but nothing prevented unlimited free usage or tracked per-user consumption against plans.
- **Remediation**: Implement `@cuex/protocol` commercial contracts (`PlanId`, `PlanStatus: 'active' | 'planned'` marking `Team` strictly planned), atomic SQLite `Entitlement` + `UsageLedger` enforcement with idempotent `UsageRecord` writes, and an explicit sandbox `PaymentProviderAdapter` returning `PAYMENT_NOT_CONFIGURED` / preview state when live merchant credentials are absent ([ADR-003](./DECISIONS/ADR-003-multi-tenant-auth-and-usage-ledger.md)).

### Q7. Commercial & Financial Truth Audit (`breakevenSessionsPro` Misnomer, Payment Fees, Seed Cohort Drift) (`[存在模型缺陷 — Phase 2 B1 同步修复]`, Severity: `P1`)
- **Audit Question**: Are the Phase 1 unit economics calculations and commercial claims free of formula misnomers, hidden fee assumptions, and cross-document contradictions?
- **Observed Evidence**:
  - **`breakevenSessionsPro` Misnomer**: `ppt/scripts/compute-unit-economics.mjs:163,275,346,418,433,446` and `ppt/scripts/cuex-final-metrics.json:83,104,125` assigned `maxSessionsHeadroom` (how many monthly Pro sessions fit inside `¥59` before direct contribution turns negative) to a key named **`breakevenSessionsPro`**. That is **session cost-headroom (`maxAffordableSessionsPerProMonth`)**, NOT company breakeven! Fixed R&D labor, marketing, and base overhead were unmodeled.
  - **Uniform `0.6%` Fee Assumption**: `compute-unit-economics.mjs:49,88,396`, `docs/business/UNIT_ECONOMICS.md:33,51,71`, and `docs/business/BUSINESS_MODEL.md:46,76` used a single universal `0.6%` payment rate without separating WeChat Pay vs Alipay official merchant rate structures or modeling refund rate sensitivity.
  - **Seed-Cohort Contradiction**: `docs/business/BUSINESS_MODEL.md:75` committed to recruiting **`30–50 名`** target users in Stage 1, whereas `docs/business/ROADMAP.md:42` committed to **`20–30 位`** in the exact same first validation batch.
  - **Metrics/Funnel Coverage**: Needed explicit Free funnel distinction (`registeredUsers` vs `freeMau` vs `activeFreeUsers` vs `paidUsers`), LTV/CAC caveats, all 5 ASR modes, 11 sensitivity sweeps, and explicit `[本地实测 Eval]` / `[云端公开费率]` / `[模型估算]` / `[商业假设]` provenance tags.
- **Remediation**: Owned by `@biz-deliverables` in parallel Phase 2 Stage A/B1 (`#39`): rename to `maxAffordableSessionsPerProMonth`, add explicit `companyBreakeven` disclosure, verify WeChat/Alipay fees live via web search, unify cohort (`第 1 轮 20–30 名 -> 第 2 轮 30–50 名`), and enforce automated `verify-metrics-sync.mjs`.

### Q8. Dead TTS Modules & Legacy Domain/Calibration Neutralization (`[部分残留 — Stage A/B 彻底清理]`, Severity: `P1`)
- **Audit Question**: Are there unused pre-refactor TTS modules, legacy model metadata names, or literal historical single-domain roleplay strings lingering in code, scripts, or docs?
- **Observed Evidence**:
  - **Dead TTS Infrastructure**: `CueX Presentation` never synthesizes spoken audio (`GatewayServer.ts` does not import TTS), yet dead TTS artifacts remain active in workspace:
    - `apps/server/package.json:20` (`"msedge-tts": "2.1.1"`)
    - `apps/server/src/voice/tts-{edge,http,local}.ts` and `apps/server/src/voice/index.ts:11-13,162-196`
    - `apps/server/scripts/voice-tts-server.ts`
    - `scripts/{demo-remote-tts,tts-ssh-bridge,tts-tunnel,tts-ssh-config,tts-startup.test}.mjs`
    - `infra/windows/tts/{serve_ming.py,start-ming.ps1,ssh_request.py,README.md}` and `.env.example:9` (`CUEX_TTS=fake`)
  - **Legacy S1 Metadata Naming**: `apps/server/src/system1/LlamaSystemOne.ts:11-87`, `autotrust-jev9b.json`, and `infra/windows/{Start-SystemOne.ps1,models.json,jev-downloads.json}` still use `autotrust/JEV-9B` / `jev-v1` identifiers inherited from the pre-refactor prototype.
  - **Historical Docs Leakage**: Phase 1 `docs/engineering/{BASELINE,CURRENT_ARCHITECTURE,AUDIT,LEGACY_CLEANUP,MIGRATION_PLAN}.md` retained literal legacy single-domain product names, quantitative study parameters, and persona proper nouns from commit `96cd742` as baseline examples. (Neutralized in Phase 2 Stage A with `[Historical Engineering Archive — Isolated from Active Product Docs]` headers and generic `历史单领域角色扮演原型 / 旧领域遗留模块` descriptors; `TEST_REPORT.md` & `CHANGELOG.md` are owned by `qa-verifier`).
- **Remediation**: Neutralized historical engineering docs immediately in Stage A; execute [ADR-004](./DECISIONS/ADR-004-legacy-neutralization-and-tts-retirement.md) in Stage B (`apps/` & `scripts/` & `infra/`) guarded by `scripts/check-legacy-domain.mjs`.

### Q9. ASR, Dual-Process Telemetry & KV-Cache Honesty Boundaries (`[已实现并需局部收口]`, Severity: `P2`)
- **Audit Question**: Does the runtime report ASR backends, System 1/2 usage, and KV-cache behavior truthfully, without sample-pack leaks or unverified hardware claims?
- **Observed Evidence**:
  - **Honest Core (`[已实现]`)**: `CognitiveRuntime` / `SharedCognitiveStateStore` separates `provider_reported` vs `local_rule_zero` tokens (`0` fabricated cached tokens); `EVAL.md:49` & `SYSTEM_1_SYSTEM_2.md` explicitly reject cross-slot / cross-scenario shared KV cache claims.
  - **Refinements Needed (`P2`)**:
    1. `GatewayServer.ts:637,651` applies `correctAsrText(rawText, SAMPLE_ASR_CORRECTIONS)` to *all* sessions even when running custom user decks rather than `pack_cuex_demo_01`! Should scope sample hotword corrections strictly to the sample pack or pack-declared vocabulary.
    2. `eval-presentation.ts` executes deterministic offline fake providers (`CUEX_SYSTEM1=fake`, `CUEX_SYSTEM2=fake`); real Sherpa ONNX / cloud LLM / `llama.cpp` GPU execution must remain distinctly tagged (`[外部硬件/API 未在本 CI 实测]`) rather than conflated with offline CI passes.
    3. Add explicit `usageSource` & `costFen` attribution on `TelemetryUsage` for auditable cost accounting.
- **Remediation**: Fix `SAMPLE_ASR_CORRECTIONS` scoping and upgrade `TelemetryUsage` fields in Stage B.

### Q10. Privacy Wipe, User Data Export & Third-Party Processing Transparency (`[部分实现 — 待补导出与诚实告知]`, Severity: `P1`)
- **Audit Question**: Can users inspect, export, and delete their data end-to-end, and do disclosures honestly explain what `session.wipe` cannot erase?
- **Observed Evidence**:
  - **Working Controls (`[已实现]`)**: `MemoryStore.create` rejects unconfirmed items (`GatewayServer.ts:341-344`); `/api/sessions/:id/wipe` (`:379-395`) and WS `session.wipe` (`:838-854`) remove runtime memory and session-tied `MemoryItem`s.
  - **Gaps (`P1`)**:
    1. No machine-readable export endpoint (`GET /api/account/export` -> `UserDataExportBundle`) exists.
    2. Current notices lack explicit disclosure of 3 hard boundaries: (a) statutory/anti-fraud `BillingAuditRecord` rows remain retained even after user account/session wipe ([ADR-003](./DECISIONS/ADR-003-multi-tenant-auth-and-usage-ledger.md)), (b) offline encrypted SQLite backups retain snapshots until backup rotation expiry, and (c) audio/text already transmitted to external cloud ASR/LLM providers during a live session are governed by third-party retention policies and cannot be remotely recalled by local `wipe`.
- **Remediation**: Ship `UserDataExportBundle` + `DataDeletionReceipt` contracts (`@cuex/protocol` v2) and endpoints in Stage B, backed by `docs/privacy/{PRIVACY_DATA_MAP,DATA_RETENTION,CONSENT_FLOW}.md`.

### Q11. Missing Machine-Readable API Specs, CI/CD Pipeline, SBOM & Operational Runbooks (`[缺失 — Stage A/B 落地]`, Severity: `P1`)
- **Audit Question**: Are REST/WS contracts machine-verified (`OpenAPI`/`AsyncAPI`), automatically gated in CI/CD with supply-chain checks, and supported by operational/security documentation?
- **Observed Evidence**:
  - `.github/workflows/` directory does not exist; `docs/api/openapi.yaml` and `docs/api/asyncapi.yaml` do not exist; `scripts/generate-sbom.mjs` and `scripts/check-legacy-domain.mjs` do not exist (though `scripts/check-public-data.mjs` already scans secrets/paths/phones).
  - Security (`OWASP ASVS 5.0.0` verification mapping), Privacy Retention Matrix, Incident/Backup/Observability Ops guides, 8-layer Test Strategy, and Release/DORA process docs were absent after Phase 1.
- **Remediation**: Author OpenAPI 3.1 + AsyncAPI 3.0 specs + Security/Privacy/Ops/Engineering docs (`@auditor-docs`), ship CI/CD + `check-legacy-domain.mjs` + `generate-sbom.mjs` (`@protocol-architect`), and enforce full CI validation in Stage C.
