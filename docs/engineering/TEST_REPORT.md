# CueX Next — Phase 2 Verification & QA Test Report

> **Branch**: `refactor/universal-runtime-presentation` (branched from `main` commit `96cd742523d5b0fea5aafdb65944d421938a0a43`)  
> **Phase 1 Commits**: `e2cb6370a8df68f77440d6d0a09adaf4fa98d66f` (Phase 1 refactor), `6804f5a2788f809f3c8f466c612cdf1f5e65bfb4` (track unified `deliverables/cuex-final` & root ZIP)  
> **Verification Timestamp (UTC)**: `2026-11-15T21:09:07.360Z` (Local CST `2026-11-16 05:11+08:00`)  
> **Verifier**: `qa-verifier` (Independent Phase 6 QA Gate, post-all-edits)

---

## 1. Executive Summary

| Gate | Status | Result Summary |
| --- | --- | --- |
| **Branch Safety** | **PASS** | `git branch --show-current` -> `refactor/universal-runtime-presentation` (`main` untouched at `96cd742`) |
| **Frozen Lockfile Install** | **PASS** | `pnpm install --frozen-lockfile` — exit `0`, `Scope: all 4 workspace projects`, `Lockfile is up to date` (`386ms`, `pnpm v9.15.9`) |
| **Workspace Typecheck** | **PASS** | `pnpm typecheck` (`packages/protocol`, `apps/server`, `apps/web`) — exit `0`, `0` errors |
| **Web Production Build** | **PASS** | `pnpm build` (`tsc && vite build`) — exit `0`, `1678` modules transformed in `1.21s` |
| **Protocol Contract Tests** | **PASS** | `pnpm --filter @cuex/protocol test` — exit `0`, `12/12` passed, `0` failed, `0` skipped (`139.47ms`) |
| **Server Offline Test Suite** | **PASS** | `CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test` — exit `0`, `23/23` passed across `10` files, `0` failed, `0` skipped (`856.02ms`) |
| **Web Unit Tests** | **PASS** | `pnpm --filter @cuex/web test` (`Vitest v5.0.5`) — exit `0`, `9/9` passed across `2` files, `0` failed, `0` skipped (`120ms`) |
| **Presentation Eval Benchmark** | **PASS** | `pnpm --filter @cuex/server eval` — exit `0`, `6/6` passed (`precision=1`, `falseInterventionRate=0`, `withdrawalAccuracy=1`, `V=+3`, `avg 0.76ms`, `P95 1.63ms`) |
| **Playwright Browser E2E** | **PASS** | `node --test apps/web/test/presentation-e2e.test.mjs` — exit `0`, `1/1` passed (`5853.12ms` test / `6105.36ms` total), `0` console/page errors |
| **SQLite Backup/Restore Self-Test** | **PASS** | `node scripts/db-backup-restore.mjs --self-test` — exit `0`, checksum `009276f575db76cb212366c5359c1e6936ea8f8936360e6beac0335490f6545e` |
| **Legacy Domain & TTS Guard** | **PASS** | `node scripts/check-legacy-domain.mjs` & `--staged` — exit `0`, `0` findings across working tree and Git index |
| **Metrics & Deliverables Sync** | **PASS** | `npm --prefix ppt run verify:sync` — exit `0` (`ok: true`, `scannedFiles: 20`, `errors: []`, `warnings: []`) |
| **SBOM, PDFs, Previews & ZIP** | **PASS** | `generate-sbom.mjs` (`workspaces=5`, `components=751`, `artifacts=112`); `6` PDFs (`8/8/1/1/1/2` p); PNG previews inspected; ZIP rebuilt (`34` zip entries / `28` files) |
| **Dependency Vulnerability Audit** | **DISCLOSED** | `pnpm audit` exits `1` (`1 low` advisory `GHSA-73rr-hh4g-fpgx` in `apps/server > diff@8.0.2`); `pnpm audit --audit-level=high` exits `0` |
| **Public-Data Secret/Path Scan** | **PASS** | `node scripts/check-public-data.mjs --staged` & working tree — exit `0`, `0` findings |

---

## 2. Full Engineering Build & Test Results (Post-All-Edits)

### 2.1 Lockfile, Typecheck & Production Build
- **`pnpm install --frozen-lockfile`** (exit code `0`, `386ms`, `pnpm v9.15.9`):
  - `Scope: all 4 workspace projects` — `Lockfile is up to date, resolution step is skipped` (`Already up to date`).
- **`pnpm typecheck`** (exit code `0`):
  - `packages/protocol`: `tsc --noEmit` (`993ms`) — `0` errors
  - `apps/server`: `tsc --noEmit` (`1.3s`) — `0` errors
  - `apps/web`: `tsc --noEmit` (`1.3s`) — `0` errors
- **`pnpm build`** (exit code `0`):
  - `apps/web`: `tsc && vite build` (`1.21s`, `1678 modules transformed`)
  - Outputs: `dist/index.html` (`0.83 kB`), `dist/assets/index-Cu53hHiV.css` (`28.72 kB`), `dist/assets/index-C6gV0oJ5.js` (`443.14 kB`)

### 2.2 Protocol Tests (`@cuex/protocol`)
Command: `pnpm --filter @cuex/protocol test` (`node --experimental-strip-types --test test/*.test.ts`, exit code `0`, duration `139.47ms`):
- `12 / 12` passed, `0` failed, `0` skipped across 4 suites (`schemas-and-examples.test.ts`, `v1-to-v2-compatibility.test.ts`, `validation.test.ts`, `versions-and-envelope.test.ts`):
  - JSON Schema draft 2020-12 parsing (`10` schema files) & canonical JSON examples validation (`10` example payloads)
  - `toUtcIso8601` conversion and v1 -> v2 backward-compatible normalizers
  - REST payload, Entity (`Evidence`, `ContextPack`, `PresentationContextPack`, `MemoryItem`, `TelemetryUsage`, `UsageRecord`), and WS `ClientMessage` runtime validators
  - `2026-11` / `WS 2.0` / schema v2 constants, safe integer `MoneyAmount { amountFen, currency: 'CNY' }`, strict UTC ISO-8601 validation, `EventEnvelope` helper/validator, and all `14` unified `API_ERROR_CODES`

### 2.3 Server Unit & Integration Tests (`@cuex/server`)
Command: `CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test` (`tsx --test test/*.test.ts`, exit code `0`, duration `856.02ms`):
- `23 / 23` passed, `0` failed, `0` skipped across `10` test files:
  1. `REST API contract covers all v2 routes, unified ApiErrorResponse errors, 501 webhook unconfigured, and protocol validators` (`47.73ms`)
  2. `CueXGatewayServer HTTP API and WebSocket /ws live presentation & rehearsal flow` (`57.79ms`)
  3. `CueXGatewayServer streams PCM16 audio.chunk frames when streaming ASR engine is active` (`8.18ms`)
  4. `MemoryStore enforces explicit userConfirmed opt-in and supports CRUD and session wipe` (`7.98ms`)
  5. `computeUtilitySummary computes V = H - λI honestly for explicit feedback, dismissals, and recovery withdrawals` (`0.18ms`)
  6. `DocumentExtractor extracts .pptx slides, speaker notes, .md, and marks unreadable .pdf honestly` (`2.09ms`)
  7. `PresentationCompiler preserves grounded facts without fabricating numbers and PresentationPackStore enforces locks` (`30.10ms`)
  8. `ProviderResilience enforces bounded retries, timeout AbortController, circuit breaker, and honest degraded fallback` (`131.18ms`)
  9. `Gateway enforces atomic free monthly quota (402 QUOTA_EXCEEDED), HMAC webhook upgrade/refund idempotency, WS resume & reconnect replay` (`36.05ms`)
  10. `LexicalBm25RetrievalProvider ranks bilingual evidence accurately and returns empty on unrelated query` (`1.98ms`)
  11. `LexicalBm25RetrievalProvider supports pluggable EmbeddingScorer fusion` (`0.89ms`)
  12. `LlamaFastDecisionProvider calls generic completion API and falls back cleanly when offline` (`56.52ms`)
  13. `Controller rejects pause-only ticks without semantic gaps` (`7.26ms`)
  14. `Controller blocks ungrounded fabricated numbers and forbidden claims` (`3.27ms`)
  15. `Controller enforces TTL expiry, contextVersion mismatch, L0-L3 ceiling, and silent mode` (`3.20ms`)
  16. `Controller executes automatic withdrawal across user_recovered, context_invalidated, chapter_changed, candidate_expired, and user_dismissed suppression` (`4.38ms`)
  17. `ScenarioRegistry exposes presentation as implemented and roadmap scenarios honestly` (`1.01ms`)
  18. `PresentationRuntimePlugin conforms across multi-chapter pace, omission, Q&A grounding, ungrounded gap, rehearsal, and reflection` (`17.14ms`)
  19. `Auth, multi-tenant isolation (401/403), CORS/WS OriginGuard, and 429 RateLimiter enforce security boundaries` (`34.41ms`)
  20. `DocumentExtractor rejects path traversal, ZIP bombs, XXE/ENTITY XML, encrypted PDFs, bad magic bytes, and NUL bytes` (`4.34ms`)
  21. `PromptGuard, OriginGuard production wildcard block, RateLimiter, and StructuredLogger secret redaction` (`0.26ms`)
  22. `SqliteRepository enables WAL & foreign keys, runs versioned migrations, and migrates legacy v1 JSON with backups idempotently` (`5.14ms`)
  23. `SQLite backup/verify/restore script roundtrips real database and account export/delete preserves billing_audit_log` (`226.70ms`)

### 2.4 Web Unit Tests & Playwright Browser E2E (`@cuex/web`)
- **`pnpm --filter @cuex/web test`** (`vitest run test/presentation-reducer.test.ts test/web-helpers.test.ts`, exit code `0`, `120ms`):
  - `2 / 2` test files, `9 / 9` tests passed (`presentation-reducer.test.ts`: `3` tests; `web-helpers.test.ts`: `6` tests), `0` failed, `0` skipped.
- **`node --test apps/web/test/presentation-e2e.test.mjs`** (exit code `0`, `5853.12ms` test / `6105.36ms` duration):
  - `1 / 1` Playwright Chromium end-to-end suite passed (`0` failed, `0` skipped, `0` console/page errors), covering `HomeView` (`Available` vs `Planned` scenarios) -> `CompilerView` (`.md` extract, demo pack load, `FactWhitelist` provenance & lock, `QACards` prediction badges, privacy consent) -> `StageView` (`Focus`, `Split Strip`, `Inspector`, `L0` silent, drift -> `H` feedback -> `user_recovered` withdrawal, ungrounded Q&A honesty banner, `ControllerDecision` logs) -> `ReflectionView` (`V = H - λI`, weak-segment single-point rehearsal, `MemoryInspectorPanel`) -> `AccountPanel` (User A/B multi-tenant isolation, `PlanCatalog` alignment with `Pro ¥59.00` sandbox checkout preview and `Team` disabled, `Live` mode startup on User B, JSON/Markdown export, account wipe returning `DataDeletionReceipt` preserving `billing_audit_logs`) -> `1280×800`, `1920×1080`, and `420×900` zero horizontal overflow assertions.

### 2.5 Backup & Restore Self-Test
- **`node scripts/db-backup-restore.mjs --self-test`** (exit code `0`):
  - Output: `{"selfTest":"passed","checksum":"009276f575db76cb212366c5359c1e6936ea8f8936360e6beac0335490f6545e","counts":{"sample_items":1}}`

---

## 3. Reproducible Benchmark Verification (`eval-presentation.ts`)

Command: `pnpm --filter @cuex/server eval` (`apps/server/scripts/eval-presentation.ts`, writes gitignored `.cuex-runtime/eval-latest.{json,md}`, exit code `0`):

- **Latest QA Run (`generatedAt: 2026-11-15T21:09:07.360Z`)**:
  - **Mode**: `system1="local-heuristic-s1 (local_fallback)"`, `system2="local-grounded-synthesizer (local_fallback)"`
  - **Cases**: `6 / 6` passed (`passRate = 1`)
  - **Metrics**: `avgLatencyMs = 0.76 ms`, `p50LatencyMs = 0.46 ms`, `p95LatencyMs = 1.63 ms`, `precision = 1`, `falseInterventionRate = 0`, `withdrawalAccuracy = 1`, `totalNetUtilityV = 3` (`V = H - λI (λ = 2)`)
  - **Telemetry**: `inputTokens = 0`, `outputTokens = 0`, `cachedInputTokens = 0`, `totalTokens = 0`, `modelCalls = 0`, `retries = 0`, `localRuleEvaluations = 13`, `costFen = 0`, `degradedSessions = 0`, `measurementSource = "local_rule_zero"`
  - **Per-Case Breakdown**:
    - `case_1_fluent_quiet`: `PASS`, `1.63ms`, `shown=0`, `V=0`
    - `case_2_pause_suppression`: `PASS`, `0.71ms`, `shown=0`, `suppressed=1 (pause_only_without_gap)`, `V=0`
    - `case_3_drift_recovery_withdraw`: `PASS`, `1.13ms`, `shown=1`, `withdrawn=1/1 (user_recovered)`, `V=+1`
    - `case_4_grounded_qa`: `PASS`, `0.35ms`, `shown=1 (ev_sample_7)`, `V=+1`
    - `case_5_ungrounded_qa_honesty`: `PASS`, `0.30ms`, `shown=1 (grounded=false + missingEvidenceNotice)`, `V=+1`
    - `case_6_grounding_guard_and_chapter_withdraw`: `PASS`, `0.46ms`, `shown=1`, `suppressed=1 (ungrounded_evidence)`, `withdrawn=1/1 (chapter_changed)`, `V=0`

### Cross-Check vs. Business & Deliverable Docs (`UNIT_ECONOMICS.md`, `evaluation-results.md`, `ppt/scripts/cuex-final-metrics.json`)
- Verified via `npm --prefix ppt run verify:sync` -> exit `0` (`ok: true`, `scannedFiles: 20`, `errors: []`, `warnings: []`, `metricsGeneratedAt: "2026-11-15T21:09:07.360Z"`).
- All numbers match verbatim across `.cuex-runtime/eval-latest.json`, `ppt/scripts/cuex-final-metrics.json`, `docs/business/{UNIT_ECONOMICS,BUSINESS_MODEL,GTM_PLAN}.md`, `deliverables/cuex-final/evidence/{evaluation-results.md,token-usage-proof.png,verification.json}`, `deliverables/cuex-final/pitch/CueX-Pitch-Script.md`, `deliverables/cuex-final/business/CueX-AI-Employee-Job-Spec.pdf`, and `deliverables/cuex-final/pitch/CueX-BP.pdf`.
- `PlanCatalog.ts`, `PRICING_AND_PACKAGING.md`, `UNIT_ECONOMICS.md`, and `cuex-final-metrics.json` are aligned 100%: `Free ¥0` (`2` sessions/mo × `10` min = `20m` cloud ASR), `Event ¥29` (`14d` / `120m`), `Pro ¥59/mo` or `¥499/yr` (`240m/mo`), `Team ¥199/seat/mo` (`status: 'planned'`), with `maxAffordableSessionsPerProMonth` (`29 / 85 / 211`) and explicit `companyBreakeven.status = "UNMODELED"`.

---

## 4. Security, Legacy Guard, Supply Chain & Dependency Audit

1. **Legacy Domain & Retired TTS Guard (`node scripts/check-legacy-domain.mjs` & `--staged`)**:
   - Exit `0`: `0 legacy domain or retired TTS references` across working tree and staged Git index.
   - **Runtime Decoupling (`rg -n "scenarios/presentation" apps/server/src/runtime/`)**: `0` matches.
2. **Public-Data Hygiene Scan (`node scripts/check-public-data.mjs --staged` & working tree)**:
   - Exit `0`: `0` secret, credential, IP, or personal local home-directory path findings.
3. **Dependency Vulnerability Audit (`pnpm audit`)**:
   - **`pnpm audit`** (unfiltered): exits `1` — `1 vulnerabilities found`, `Severity: 1 low`:
     - Package: `diff@8.0.2` (`apps/server > diff@8.0.2`, transitive dependency; patched `>=8.0.3`, advisory `GHSA-73rr-hh4g-fpgx` — `jsdiff` DoS in `parsePatch` and `applyPatch`).
   - **`pnpm audit --audit-level=high`**: exits `0` (`0` moderate/high/critical advisories; matches `.github/workflows/ci.yml` gate).
4. **SBOM & Artifact Provenance (`node scripts/generate-sbom.mjs`)**:
   - Generated [`deliverables/cuex-final/sbom-and-checksums.json`](../../deliverables/cuex-final/sbom-and-checksums.json): `workspaces=5`, `components=751`, `artifacts=112`, `lockfileVersion=9.0`, `0` personal paths.

---

## 5. Deliverables, PDF Page Counts, Visual Inspection & Packaging Status

### 5.1 Legacy Archival, SBOM Inclusion & ZIP Packaging
- Legacy pre-refactor deliverables (`hks-2026*`) remain archived under gitignored `.cuex-runtime/reference-archives/`.
- [`deliverables/cuex-final/`](../../deliverables/cuex-final/README.md) (`28` tracked files including `sbom-and-checksums.json`) and repository-root [`CueX-Universal-Presentation-Final.zip`](../../CueX-Universal-Presentation-Final.zip) (`~19M`, `34` ZIP entries excluding `.DS_Store` and `.cuex-runtime/`) are tracked via `.gitignore` exceptions (`!deliverables/cuex-final/`, `!/CueX-Universal-Presentation-Final.zip`) on `refactor/universal-runtime-presentation`.

### 5.2 PDF Page Count & Geometry Verification (`pdf-lib`)
| Artifact | Expected | Observed Pages & Size | Status |
| --- | --- | --- | --- |
| `deliverables/cuex-final/pitch/CueX-BP.pdf` | `8` pages | `8` pages (`1440×810` pt, 16:9) | **PASS** |
| `deliverables/cuex-final/business/CueX-Business-Plan.pdf` | `8` pages | `8` pages (`1440×810` pt, 16:9) | **PASS** |
| `deliverables/cuex-final/business/CueX-AI-Employee-Job-Spec.pdf` | `1` page A4 | `1` page (`595×840` pt, A4 portrait) | **PASS** |
| `deliverables/cuex-final/business/CueX-Business-Model-Canvas.pdf` | `1` page A4 landscape | `1` page (`842×594` pt, A4 landscape) | **PASS** |
| `deliverables/cuex-final/business/CueX-Unit-Economics.pdf` | `1` page A4 landscape | `1` page (`842×594` pt, A4 landscape) | **PASS** |
| `deliverables/cuex-final/business/CueX-BMC-and-Unit-Economics.pdf` | `2` pages A4 landscape | `2` pages (`842×594` pt, A4 landscape) | **PASS** |

### 5.3 Visual Inspection (`read_file`)
Visually verified regenerated assets (`brand/CueX-Cover.png`, `evidence/token-usage-proof.png`, `previews/bp-p6.png`, `previews/bp-p8.png`, `previews/job-spec-p1.png`, `previews/bmc-p1.png`, `previews/unit-economics-p1.png`): Warm Paper `#F8F7F3` editorial layout, crisp Amber × Violet `X` identity, synced `0.76 / 1.63 ms` eval telemetry, zero overlapping or clipped text.

---

## 6. Known Gaps & Honesty Boundaries

1. **Offline Test Mode vs. External AI/ASR/Payment Gateways**: Automated tests and `eval-presentation.ts` ran under offline deterministic engines (`CUEX_SYSTEM1=fake`, `CUEX_SYSTEM2=fake`, `CUEX_ASR=fake`). Live external `llama-server` / cloud LLM / remote Sherpa ASR inference accuracy is not tested offline (`未验证` against live GPU endpoints); `PaymentProviderAdapter` runs as `SandboxUnconfiguredPaymentProvider` (`501 PAYMENT_NOT_CONFIGURED` / `liveCheckoutAvailable: false`) until merchant secrets are configured.
2. **PDF Scanned-Image Limitation**: `DocumentExtractor` extracts text streams best-effort and enforces ZIP-bomb, path-traversal, XXE/`<!ENTITY`, magic-byte, NUL-byte, and encrypted-PDF rejections; image-only scanned PDFs return `extractionStatus: 'unreadable'` rather than invoking external OCR.
3. **Roadmap Scenarios**: `social`, `teaching`, `sales`, and `custom` remain typed `SCENARIO_CAPABILITY_DESCRIPTORS` (`status: 'roadmap'`); `ScenarioRegistry.assertRunnable()` rejects execution.
4. **Commercial Metrics & Dependency Low Advisory**: Pricing tiers, CAC/LTV, and 10-component cloud unit economics remain transparent modeled hypotheses (`0` real paid merchant orders; `companyBreakeven` unmodeled). Transitive `diff@8.0.2` carries 1 `low` advisory (`GHSA-73rr-hh4g-fpgx`, `pnpm audit --audit-level=high` passes).

---

## 7. Mandatory Verification Summary (14 Questions)

1. **原有工程是什么状态？** — `[已验证]`  
   基线提交 `96cd742`（`2026-11-16 01:08:45 +0800`）是面向旧单领域（虚构降压场景角色扮演）的训练原型，包含旧角色记忆目录、3D 头像与角色回复控制器，缺少根 `README.md`；通用内核、SQLite 持久化、多租户隔离、CI/API 契约与演讲场景尚未实现（详见 [BASELINE.md](./BASELINE.md) 与 [PHASE2_AUDIT.md](./PHASE2_AUDIT.md)）。
2. **清理了哪些旧业务？** — `[已实现 / 已验证]`  
   Phase 1–2 彻底清理了旧单领域角色扮演协议（`jev.ts`、`piagent.ts`、`library.ts`）、服务端角色代理与脚本/测试、前端 3D 头像/旧 HUD 与回放驱动、`assets/models/` `.glb` 模型、旧域名热词，并在 Phase 2 按 `ADR-004` 彻底移除已退役语音合成（TTS）模块（`apps/server/src/voice/` 退役语音合成文件、`apps/server/scripts/` 退役服务脚本、退役 root 脚本、`infra/windows/tts/**`、无效 `three` overrides 与废弃语音包依赖）并中和历史文档专有名词；`node scripts/check-legacy-domain.mjs` 与 `--staged` 均返回 `0` 命中。
3. **哪些模块被保留？** — `[已实现 / 已验证]`  
   保留并升级领域无关底座：浏览器 16 kHz PCM16LE 采集（`apps/web/src/core/audio/{AudioCapture.ts,pcm-capture.worklet.js}`）、Sherpa 本地/远端流式 ASR 传输层（`apps/server/src/voice/{asr-local,asr-remote,sherpa,wav}.ts`）、`LlamaSystemOne` `/completion` 单 token 客户端、`system2/config.ts` 的 `redact()` 与 `numbers.ts` 的 `numbersIn()`、`scripts/check-public-data.mjs` 与 `assets/brand/*`、`assets/fonts/*`。
4. **哪些模块被重写与新建？** — `[已实现 / 已验证]`  
   升级 `@cuex/protocol` 至 `v2.0.0`（`API_VERSION='2026-11'`、`WS_PROTOCOL_VERSION='2.0'`、`EventEnvelope`、`MoneyAmount`、14 个统一错误码、运行时 `validate*`、10 个 JSON Schemas 与示例、`v1-to-v2` 兼容层）；服务端新建 `storage/`（`StorageRepository` + `SqliteRepository` + `migrations`）、`security/`（`AuthService`、`OriginGuard`、`PromptGuard`、`RateLimiter`）、`observability/`（`Logger`、`MetricsCollector`）、`pipeline/`（`PipelineTracker`）、`commercial/`（`PlanCatalog`、`CommercialService`、`PaymentProviderAdapter`）与 `ProviderResilience`；前端新增 `AccountPanel.tsx`、`validation.ts` 与 `Split Strip` 视图；工程侧新增 `.github/workflows/ci.yml`、`scripts/{check-legacy-domain,db-backup-restore,generate-sbom}.mjs`、`docs/api/{openapi,asyncapi}.yaml` 与全套工程/安全/隐私/运维/商业文档。
5. **Universal Runtime 实现了什么？** — `[已实现 / 已验证]`  
   实现了与具体场景 `0` 耦合的通用认知运行时（`ContextStore`、`EventBus`、`SharedCognitiveStateStore`、`LexicalBm25RetrievalProvider`、`InterventionController`、`MemoryStore`、`PipelineTracker`、`ProviderResilience`），由 `SqliteRepository`（`node:sqlite` WAL + 外键 + `schema_migrations`）提供跨重启持久化和多租户隔离，并通过 `EventEnvelope` 与 monotonic `serverSeq` 串联 9 段认知链路。
6. **Presentation 实际实现了什么？** — `[已实现 / 已验证]`  
   端到端实现了唯一 `status: 'implemented'` 的 `CueX Presentation` 场景：安全加固版 `DocumentExtractor`（magic-byte、15MB 上限、路径穿越/ZIP 炸弹/XXE/加密 PDF/NUL 拦截、`unreadable/rejected` 诚实状态）与 `PresentationCompiler`（锁定事实不可覆盖、AI 预测 `isPrediction` 与 `unpreparedGaps` 分离）；场中 `rehearsal`/`live` 双模式与 `Focus`/`Split Strip`/`Inspector` 视图、热键与 `aria-live` 无障碍支持；场后 `PresentationReflection`（`V = H - λI`）与跨用户会话历史、数据导出和账单日志保留式销毁回执。
7. **System 1 / System 2 如何协作？** — `[已实现 / 已验证（离线规则与弹性恢复路径）；未连外网 GPU 实机]`  
   语音或状态变化由 `EventBus` 触发 `FastDecisionProvider` 先判别流畅/恢复/缺口/偏题/提问；顺畅或自愈时直接 `L0` 或撤回；仅当确认有语义缺口/提问/主动求助时先检索已核验 `Evidence[]`，再经受 `PromptGuard` 隔离与 `ProviderResilience`（有限重试 + 超时 `AbortController` + 熔断降级标记）保护的 `SlowReasoningProvider` 生成带 `evidenceIds` 的 `Candidate` 并提交 `InterventionController`。
8. **Controller 如何决定提示与撤回？** — `[已实现 / 已验证]`  
   `InterventionController` 作为 System 2 通往界面的唯一门控，校验 `session_paused`、`silent_mode`、`stale_context_version`、`candidate_expired`、`ungrounded_evidence`、`pause_only_without_gap`、`user_already_recovering`、`ceiling_exceeded`（`L0–L3`）、`user_dismissed_suppression`、`cooldown_active` 与优先级抢占；并在满足 7 类 `WithdrawalReason` 时自动撤回，重连时由服务端过滤已过期或已撤回提示避免复现。
9. **端到端流程是否真正跑通？** — `[已实现 / 已验证]`  
   是。离线引擎下 `apps/server/test/gateway-ws-e2e.test.ts` 与 Playwright Chromium E2E（`apps/web/test/presentation-e2e.test.mjs`）均已完整跑通多账户切换与隔离、`Home -> Compiler -> Stage (Focus/Split Strip/Inspector, Rehearsal + User B Live) -> Reflection (V=H-λI, 单点重练) -> Account (Pro ¥59.00 沙盒预览, Team 禁用, 导出, DataDeletionReceipt)` 及 `1280×800` / `1920×1080` / `420×900` 响应式校验。
10. **测试通过率如何？** — `[已验证]`  
    最终 QA 全量重跑全绿：`pnpm install --frozen-lockfile` exit `0`；`pnpm typecheck` exit `0`；`pnpm build` exit `0`；`@cuex/protocol` **12/12**；`@cuex/server` **23/23**；`@cuex/web` **9/9**；`eval-presentation.ts` **6/6**；Playwright E2E **1/1**；`db-backup-restore.mjs --self-test` 通过；`check-legacy-domain.mjs` 与 `check-public-data.mjs` **0 findings**；`npm --prefix ppt run verify:sync` **0 errors**；`pnpm audit` 检出 `1` 项 `low` 级别间接依赖告警（`diff@8.0.2`，`--audit-level=high` exit `0`）。
11. **目前还有哪些缺陷与边界？** — `[已验证 / 诚实边界]`  
    (1) 自动化与 eval 默认运行离线规则路径，外网真实 GPU/云端 LLM 与实时商业微信/支付宝收单网关尚未接入生产密钥（`PaymentProviderAdapter` 处于 `liveCheckoutAvailable: false` 沙盒门控）；(2) 扫描版/纯图片 PDF 诚实返回 `unreadable` 警告而不调用外部 OCR；(3) `social`/`teaching`/`sales`/`custom` 仅停留在注册表 `roadmap` 占位；(4) 存在 1 项上游传递依赖低危告警 `diff@8.0.2` (`GHSA-73rr-hh4g-fpgx`)，未触发高危阻塞。
12. **哪些商业指标是真实数据，哪些只是预测？** — `[已验证]`  
    - **真实本地实测（`[本地实测 Eval (local_rule_zero)]`）**：`eval-presentation.ts` `6/6` 通过、`precision = 100.0%`、`falseInterventionRate = 0.0%`、`withdrawalAccuracy = 100.0%`、`V = +3`（`λ = 2`）、`localRuleEvaluations = 13`、`0` LLM tokens、均值 `0.76 ms` / P50 `0.46 ms` / P95 `1.63 ms`。
    - **云端公开费率与商业预测（`[云端公开费率]` / `[模型估算]` / `[商业假设]`）**：单场 25m 云端 `43,748` tokens、单场 LLM `¥0.098`、全变动成本 `¥0.612`、`Free ¥0 (2×10m=20m)` / `Event ¥29 (120m)` / `Pro ¥59/mo (¥499/yr, 240m)` / `Team ¥199/席位/mo (Planned)`、`maxAffordableSessionsPerProMonth = 85`（Base）、Pro 直接贡献率 `83.8%`（SaaS `92.2%`）、Event `87.3%`、11 项敏感性矩阵及 `companyBreakeven = UNMODELED` 均为公开费率与商业假设建模，尚无真实收费流水。
13. **BP 与商业材料是否与当前代码一致？** — `[已验证]`  
    一致。`npm --prefix ppt run verify:sync` 已自动核验 `20` 份商业/交付文件与最新 `.cuex-runtime/eval-latest.json`（`2026-11-15T21:09:07.360Z`）及 `PlanCatalog.ts`（`Free 2×10m` / `Event ¥29` / `Pro ¥59/¥499` / `Team ¥199 Planned`）完全对齐，`errors: []`。
14. **最终交付物在哪里？** — `[已实现 / 已验证]`  
    - 目录交付包：[`deliverables/cuex-final/`](../../deliverables/cuex-final/README.md)（含 `brand/`、`pitch/`、`business/`、`evidence/`、`previews/` 及 [`sbom-and-checksums.json`](../../deliverables/cuex-final/sbom-and-checksums.json)，共 `28` 个文件，已在 `refactor/universal-runtime-presentation` 分支通过 `.gitignore` 跟踪）
    - 打包归档 ZIP：[`CueX-Universal-Presentation-Final.zip`](../../CueX-Universal-Presentation-Final.zip)（仓库根目录，`~19 MB`，`34` ZIP 条目，`.DS_Store` 与 `.cuex-runtime/` 已排除，在 `refactor/universal-runtime-presentation` 跟踪）
    - 历史参考归档：`.cuex-runtime/reference-archives/`（保持 `.gitignore` 忽略）
    - 工程与商业文档：`README.md`、`docs/{api,architecture,business,data,engineering,operations,privacy,product,security}/` 及 `.github/workflows/ci.yml`
