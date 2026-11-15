# CueX Next — Refactor & Phase 2 Changelog (`refactor/universal-runtime-presentation`)

> **Base Commit**: `96cd742523d5b0fea5aafdb65944d421938a0a43` (`main` — `chore: initialize HKS-CueX repository`)  
> **Phase 1 Commits**: `e2cb6370a8df68f77440d6d0a09adaf4fa98d66f`, `6804f5a2788f809f3c8f466c612cdf1f5e65bfb4`  
> **Target Branch**: `refactor/universal-runtime-presentation`  
> **Summary**: Phase 1 purged the legacy single-domain roleplay prototype (`历史单领域角色扮演原型 / 旧领域遗留模块`) and built the domain-agnostic **Universal Cognitive Runtime + CueX Presentation** MVP; Phase 2 hardened shared protocol v2.0 contracts, SQLite persistence, multi-tenant auth/isolation, document & prompt security, commercial entitlement/usage ledger + sandbox billing, unified OpenAPI/AsyncAPI specs, CI/CD + SBOM automation, and externally verified commercial/unit-economics deliverables.

---

## 1. Protocol Layer & Shared Contracts (`packages/protocol/`)

- **Phase 1 Rebuild**: Removed legacy roleplay schemas (`jev.ts`, `piagent.ts`, `library.ts`) and rebuilt domain-agnostic protocol modules (`common.ts`, `entities.ts`, `state.ts`, `reasoning.ts`, `controller.ts`, `scenario.ts`, `presentation.ts`, `audio.ts`, `api.ts`, `events.ts`, `index.ts`).
- **Phase 2 v2.0.0 Contracts & Validation (`0` new npm dependencies)**:
  - Added `src/versions.ts` (`API_VERSION = '2026-11'`, `WS_PROTOCOL_VERSION = '2.0'`, schema version constants `2`, `EVENT_ENVELOPE_VERSION = 1`, `UtcIso8601`, safe integer `MoneyAmount { amountFen, currency: 'CNY' }`).
  - Added `src/errors.ts` (`14` unified `API_ERROR_CODES`, `ERROR_HTTP_STATUS`, `createApiErrorResponse`).
  - Added `src/envelope.ts` (`CloudEvents 1.0.2`-inspired `EventEnvelope<TPayload>`, `PrivacyClass`, `createEventEnvelope`).
  - Added `src/commercial.ts` (`UserAccount`, `AuthSessionResponse`, `PlanDefinition`, `Entitlement`, `UsageRecord`, `AccountUsageSummary`, `BillingAuditRecord`, `PaymentCheckoutPreview*`, `PaymentWebhookEvent`, `UserDataExportBundle`, `DataDeletionReceipt`).
  - Added `src/validation.ts` (zero-dependency runtime `validate*` guards, `isUtcIso8601`, `isSafeMoneyAmount`) & `compatibility/v1-to-v2.ts` (`toUtcIso8601` & legacy payload normalizers).
  - Added `schemas/*.schema.json` (`10` draft 2020-12 JSON Schemas), `examples/*.example.json` (`10` canonical payloads), `#src/*`/`#compat/*` subpath exports, and `test/*.test.ts` (`4` Node native TypeScript suites, `12/12` pass).

---

## 2. Universal Runtime, Storage, Security, Commercial Backend & Infra (`apps/server/`, `infra/`, `scripts/`, `.github/`)

- **Phase 1 Purge**: Removed all legacy single-domain roleplay agents, scripts, tests, 3D avatar meshes (`assets/models/*.glb`), and vertical hotwords while preserving universal PCM16 capture, Sherpa ASR (`voice/{asr-local,asr-remote,sherpa,wav}.ts`), `LlamaSystemOne` `/completion` client, `redact()`, `numbersIn()`, and `check-public-data.mjs`.
- **Phase 2 Dead Speech-Synthesis (TTS) Retirement (`ADR-004`)**:
  - Retired incompatible speech-synthesis server/client files (`apps/server/src/voice/` retired speech-synthesis files, `apps/server/scripts/` retired synthesis service script), root synthesis bridge/tunnel/demo scripts, and Windows speech-synthesis infra (`infra/windows/tts/**`).
  - Removed obsolete speech-synthesis & `three` entries from `.env.example`, root `package.json`, `apps/server/package.json`, and synced `pnpm-lock.yaml` (`pnpm install --frozen-lockfile` exits `0`).
- **Phase 2 Persistence, Security, Pipeline, Observability & Commercial Backend**:
  - `apps/server/src/storage/`: `StorageRepository` interface, `SqliteRepository` (`node:sqlite` `DatabaseSync`, WAL, `foreign_keys = ON`, `withTransaction()`), `migrations.ts` (`schema_migrations`, idempotent legacy v1 JSON migration with backup), plus `scripts/db-backup-restore.mjs` (`backup`/`restore`/`verify`/`--self-test`).
  - `apps/server/src/security/`: `AuthService` (SHA-256 bearer auth, `401/403` multi-tenant ownership enforcement on packs, sessions, memories, exports, wipes), `OriginGuard` (strict CORS/WS origin validation), `PromptGuard` (data-only prompt delimiters & schema validation), and `RateLimiter` (`429 + Retry-After`).
  - `DocumentExtractor` & `PresentationCompiler` hardening: magic-byte checks, `15 MB` size limit, ZIP entry/compression-ratio guards against ZIP bombs, path-traversal/NUL-byte/XXE/`<!ENTITY`/encrypted-PDF rejections (`unreadable`/`rejected`), and immutable `locked: true` Fact Whitelist enforcement.
  - `apps/server/src/pipeline/` & `providers/ProviderResilience.ts`: `EventEnvelope` 9-stage trace tracking, monotonic `serverSeq`, client `idempotencyKey` dedup, reconnect cue reconciliation (never re-emitting expired/withdrawn cues), bounded retries, `AbortController` timeouts, and circuit-breaker degraded state reporting.
  - `apps/server/src/observability/`: redacted `Logger` & `MetricsCollector` exposing `/api/observability/summary`.
  - `apps/server/src/commercial/`: `PlanCatalog` (`Free ¥0 / 2 sessions / 20m cloud ASR`, `Event ¥29 / 14d / 120m`, `Pro ¥59/mo · ¥499/yr / 240m`, `Team ¥199/seat/mo planned`), atomic `Entitlement` & `UsageLedger`, `PaymentProviderAdapter` sandbox + HMAC webhook verification (`501 PAYMENT_NOT_CONFIGURED` when secret unset), JSON/Markdown `export`, and `DataDeletionReceipt` preserving minimized `billing_audit_log`.
  - Added `.github/workflows/ci.yml`, `scripts/check-legacy-domain.mjs` (`--staged` + working-tree guard), and `scripts/generate-sbom.mjs` (`sbom-and-checksums.json`); expanded `apps/server/test/` to `10` test files (`23/23` pass).

---

## 3. Web Frontend (`apps/web/`)

- **Phase 1 Rebuild**: Removed legacy 3D avatar/HUD/replay views & unused 3D/puppeteer deps; built Warm Paper Daylight (`#F8F7F3`) + Amber/Violet `X` `HomeView`, `CompilerView`, `StageView`, and `ReflectionView`.
- **Phase 2 Hardening & Commercial UX**:
  - Updated `src/lib/{api,format,validation}.ts`, `CueXWSClient.ts`, `presentationSession.ts`, and `usePresentationSession.ts` to `@cuex/protocol` v2.0.0 (`UtcIso8601` browser-local formatting, unified `ApiErrorResponse` handling, Bearer auth persistence & profile switching, `serverSeq` reconnect deduplication, `15 MB`/type pre-upload checks).
  - Updated `CompilerView.tsx` (`AbortController` upload cancel/retry, `unreadable/rejected` warning cards, `locationRef`/`contentHash` provenance, `locked` edit/delete guards, `AI 预测` & `unpreparedGaps` cards) and `StageView.tsx` (`Focus` / `Split Strip` narrow companion toggle, keyboard shortcuts `Space`/`M`/`H`/`Esc`, `aria-live="polite"`, honest `text_simulation` / degraded banners, `Inspector` telemetry & `CognitiveEvent` timeline).
  - Added `src/components/AccountPanel.tsx` & updated `Navbar.tsx` / `ReflectionView.tsx` (multi-user switch, server `PlanCatalog` & `Pro ¥59.00` sandbox checkout preview with `Team` disabled, `UsageLedger`, session history, JSON/Markdown export, `DataDeletionReceipt`, `420×900` zero horizontal overflow).
  - Aligned `apps/web/package.json` `postcss` (`^8.4.49`) and expanded tests (`web-helpers.test.ts` + `presentation-reducer.test.ts` `9/9` pass; Playwright `presentation-e2e.test.mjs` covering `1280×800`, `1920×1080`, `420×900` & `User B` Live mode pass).

---

## 4. Documentation, Contracts, Slides & Final Deliverables (`docs/`, `ppt/`, `deliverables/`)

- **Historical Doc Neutralization**: Isolated and neutralized all pre-refactor domain proper nouns across `docs/engineering/{BASELINE,CURRENT_ARCHITECTURE,AUDIT,LEGACY_CLEANUP,MIGRATION_PLAN}.md` (`[Historical Engineering Archive — Isolated from Active Product Docs]`).
- **Complete Engineering, API, Security, Privacy, Operations & Product Docs**:
  - Updated `README.md`, `docs/DEPLOYMENT.md`, `docs/product/{PRODUCT_VISION,PRESENTATION_PRD,USER_FLOWS,PRODUCT_METRICS}.md`, `docs/architecture/*`, and added `docs/api/{openapi.yaml,asyncapi.yaml}` (`OpenAPI 3.2.1` & `AsyncAPI 3.1.0`), `docs/data/{DATA_PIPELINE,DATA_DICTIONARY,EVENT_CATALOG,SCHEMA_VERSIONING}.md`, `docs/security/SECURITY_MODEL.md` (`OWASP ASVS 5.0.0` reference), `docs/privacy/{PRIVACY_DATA_MAP,DATA_RETENTION,CONSENT_FLOW}.md`, `docs/operations/{OBSERVABILITY,INCIDENT_RESPONSE,BACKUP_AND_RECOVERY,DEPLOYMENT}.md`, and `docs/engineering/{PHASE2_AUDIT,PHASE2_PLAN,PHASE2_RISK_REGISTER,TEST_STRATEGY,RELEASE_PROCESS,TEST_REPORT,CHANGELOG}.md` + `DECISIONS/ADR-001..004.md`.
- **External Competitive Research, Unit Economics Fix & Single-Source Deliverables**:
  - Updated `docs/business/` (`COMPETITIVE_ANALYSIS.md` with 7 categories + WeChat/Alipay official rules via `search_web`, `UNIT_ECONOMICS.md`, `BUSINESS_MODEL.md`, `ROADMAP.md`, and new `CUSTOMER_VALIDATION.md`, `GTM_PLAN.md`, `PRICING_AND_PACKAGING.md`); unified seed cohorts (`第 1 轮 20–30 人 -> 第 2 轮 30–50 人`) and renamed `maxAffordableSessionsPerProMonth` (`companyBreakeven: UNMODELED`).
  - Re-locked `ppt/scripts/cuex-final-metrics.json` (`2026-11-15T21:09:07.360Z`), added `ppt/scripts/verify-metrics-sync.mjs` (`20` files verified), rebuilt [`deliverables/cuex-final/`](../../deliverables/cuex-final/README.md) (`28` files incl. `sbom-and-checksums.json`, tracked via `.gitignore`) and [`CueX-Universal-Presentation-Final.zip`](../../CueX-Universal-Presentation-Final.zip) (`34` ZIP entries, tracked via `.gitignore`), while keeping `.cuex-runtime/reference-archives/` gitignored.
