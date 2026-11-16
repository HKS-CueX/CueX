# CueX Next — Refactor, Phase 2 & Phase 3 Changelog (`refactor/universal-runtime-presentation`)

> **Base Commit**: `96cd742523d5b0fea5aafdb65944d421938a0a43` (`main` — `chore: initialize HKS-CueX repository`)  
> **Prior Commits**: `e2cb6370a8df68f77440d6d0a09adaf4fa98d66f` (Phase 1), `6804f5a2788f809f3c8f466c612cdf1f5e65bfb4` (Deliverables Tracking), `7ad6ccb1caf4d8c6743bc0c22a3dcd981c719d04` (Phase 2)  
> **Target Branch**: `refactor/universal-runtime-presentation`  
> **Summary**: Phase 1 purged the legacy single-domain roleplay prototype (`历史单领域角色扮演原型 / 旧领域遗留模块`) and built the domain-agnostic **Universal Cognitive Runtime + CueX Presentation**; Phase 2 added SQLite persistence, multi-tenant auth/isolation, document hardening, commercial ledger/sandbox billing, CI/SBOM, and OpenAPI/AsyncAPI specs; Phase 3 added real Google Colab G4 GPU ASR (`FunAudioLLM/SenseVoiceSmall`), unified `CpaProviderAdapter` (`gemini-4-hydrogen`), a dual-track Warm Paper / Achromatic Ledger UI redesign (`6` viewports + WCAG AA), real end-to-end silent validation, and HKS mandatory & commercial deliverables packaging.

---

## 1. Protocol Layer & Shared Contracts (`packages/protocol/`)

- **Phase 1–2 Rebuild (`v2.0.0`)**: Replaced legacy roleplay schemas with `common.ts`, `entities.ts`, `state.ts`, `reasoning.ts`, `controller.ts`, `scenario.ts`, `presentation.ts`, `audio.ts`, `api.ts`, `events.ts`, `versions.ts`, `errors.ts` (`14` unified codes), `envelope.ts` (`EventEnvelope<TPayload>`), `commercial.ts`, `validation.ts`, `compatibility/v1-to-v2.ts`, `10` JSON Schemas, and `10` canonical examples.
- **Phase 3 Backward-Compatible Extensions (`v2.1.0`, `0` new npm dependencies)**:
  - `src/versions.ts` & `package.json`: Bumped package version to `2.1.0` and exported `PROTOCOL_PACKAGE_VERSION = '2.1.0'` (`API_VERSION = '2026-11'`, `WS_PROTOCOL_VERSION = '2.0'`).
  - `src/audio.ts` & `src/api.ts`: Exported 7-state `COLAB_ASR_LIFECYCLE_STATES` / `ColabAsrLifecycleState`, extended `AsrBackendMode` with `'colab_gpu'`, enriched `AsrCapabilityStatus` (`lifecycleState`, `gpuName`, `modelId`, `rtf`, `lastHealthCheckAt`, `fallbackActive`, `fallbackReason`), and added `LlmSubsystemHealthStatus` on `HealthStatusResponse`.
  - `src/common.ts`, `src/reasoning.ts`, `src/validation.ts`, `compatibility/v1-to-v2.ts`: Exported `TELEMETRY_USAGE_SOURCES` with `'provider_unreported'`, added optional `reasoningTokens` & `correlationId`, added runtime schemas/validators (`ColabAsrLifecycleStateSchema`, `AsrCapabilityStatusSchema`, `ProviderUsageRecordSchema`), updated `schemas/` & `examples/`, and synced `docs/api/{openapi,asyncapi}.yaml` (`13/13` tests pass).

---

## 2. Universal Runtime, Storage, Security, Real GPU ASR & Unified CPA Gateway (`apps/server/`, `infra/`, `scripts/`, `.github/`)

- **Phase 1–2 Foundation**: Removed legacy roleplay modules, 3D avatars, and retired speech-synthesis artifacts (`ADR-004`); built `storage/` (`StorageRepository`, `SqliteRepository` using `node:sqlite`, `migrations.ts`), `security/` (`AuthService`, `OriginGuard`, `PromptGuard`, `RateLimiter`), `observability/` (`Logger`, `MetricsCollector`), `pipeline/` (`PipelineTracker`), `commercial/` (`PlanCatalog`, `CommercialService`, `PaymentProviderAdapter` sandbox), hardened `DocumentExtractor`, `.github/workflows/ci.yml`, `scripts/{check-legacy-domain,db-backup-restore,generate-sbom}.mjs`.
- **Phase 3 Real Colab GPU ASR (`infra/colab/`, `apps/server/src/voice/asr-colab.ts`)**:
  - Deployed `FunAudioLLM/SenseVoiceSmall` + `funasr/fsmn-vad` on Google Colab G4 (`NVIDIA RTX PRO 6000 Blackwell Server Edition`, CUDA `13.0`) behind pinned self-signed SAN TLS (`.cuex-runtime/colab-asr-cert.pem`) and constant-time Bearer auth (`infra/colab/{start_asr.py,healthcheck.py,cuex-asr-deployment.ipynb,requirements.txt,README.md,.env.example}`, zero secrets, zero raw audio disk writes).
  - Implemented `ColabAsrProvider` (`asr-colab.ts`, `voice/types.ts` `flush()` support, `Connection: 'close'` keep-alive fix) with 7-state health checks, `/v1/asr/transcribe` batch & WSS `/v1/asr/stream` binary PCM16LE streaming, reconnect recovery, and honest `ASR_UNAVAILABLE` / `fallbackActive` surfacing.
- **Phase 3 Unified CPA LLM Gateway (`CpaProviderAdapter.ts` & `CognitiveRuntime.ts`)**:
  - Consolidated all real LLM tiers (`system1`, `system2`, `compiler`, `reflection`) into `CpaProviderAdapter.ts` (`DEFAULT_CPA_SYSTEM1_MODEL = 'gemini-4-hydrogen'`, `reasoningEffort: 'low'` for S1, `/v1/responses` + `/v1/chat/completions`, `completeStreamText` SSE, `CpaHttpError` 4xx fast-fail, `provider_reported` vs `provider_unreported` vs `local_rule_zero`).
  - Added presenter greeting guard (`isPresenterGreetingText()`), async S2 candidate lifetime re-anchoring (`reanchorCandidateLifetime`), and interim-partial S1 throttling in `CognitiveRuntime.ts`.
  - Added `apps/server/scripts/{validate-cpa-live.ts,validate-real-e2e.ts}` and new test suites (`colab-asr-provider.test.ts`, `cpa-provider.test.ts` — `34/34` tests pass across `12` server test files).

---

## 3. Web Frontend Redesign (`apps/web/`, `docs/design/`)

- **Phase 1–2 Baseline**: Warm Paper UI views, `CueXWSClient` `serverSeq` deduplication, `AccountPanel` multi-tenant usage/export/`DataDeletionReceipt`, and Playwright E2E.
- **Phase 3 Visual, Motion & Accessibility Overhaul**:
  - Audited with 4 design skills (`design-taste-frontend`, `frontend-design`, `impeccable`, `emil-design-eng`) into `docs/design/{FRONTEND_AUDIT,CUEX_DESIGN_BRIEF,DESIGN_SYSTEM,COMPONENT_INVENTORY,FRONTEND_QA_REPORT}.md`.
  - Updated `vite.config.ts` (`cuexScopedPublicAssets()` bundling `/fonts` & `/brand` only), `tailwind.config.js`, `index.css` (WCAG AA `--amber-ink #A84B07`, `--ink-3 #626774`, Emil `--ease-*` transitions, `prefers-reduced-motion: reduce` `0.001s` guard), `format.ts` (`'colab_gpu'` & `'provider_unreported'`).
  - Rebuilt `HomeView` (`The printed annual` + interactive `One Live Thing` widget), unified single `<nav>` in `Navbar`, refined `CompilerView`, `StageView` (restricted `CueEdgeLight` to `focus`, `colab_gpu` 7-state & telemetry inspector, `480px`/`520px` split-strip safety), `ReflectionView`, `AccountPanel`, and `MemoryInspectorPanel`.
  - Verified `10/10` Vitest (`web-helpers.test.ts` `7`, `presentation-reducer.test.ts` `3`), silent `--mute-audio` Playwright E2E (`1/1`), `42/42` 6-viewport layout checks (`0` overflow/`<11px`), and `9/9` ARIA landmarks.

---

## 4. Docs, Validation Reports, Mandatory Deliverables & Packaging (`docs/`, `ppt/`, `deliverables/`, `.gitignore`)

- **Phase 3 Documentation & Truth Alignment**: Added `docs/{ARCHITECTURE,PRODUCT_TRUTH_TABLE}.md`, `docs/phase3/{EXECUTION_BASELINE,IMPLEMENTATION_PLAN,RISK_REGISTER,REAL_WORLD_VALIDATION_REPORT}.md`, updated `README.md`, synced `docs/api/{openapi,asyncapi}.yaml`, and reconciled `docs/business/*.md`.
- **Mandatory & Commercial Deliverables (`deliverables/cuex-final/`, `ppt/`, `scripts/{generate-deliverables,verify-metrics-sync}.mjs`)**:
  - Generated 14-clip offline neural TTS+DSP audio corpus (`225.344 s`, `notLiveHumanRoomRecording: true`) + `demo-pack/`, sanitized `colab-asr-report.json`, `cpa-llm-report.json` (`cpa:<redacted-host>`), and `real-e2e-validation.json` (`cpa:<redacted-host>`).
  - Built mandatory `mandatory/business-model-canvas/` (**2p A4 landscape**), `mandatory/ai-employee-job-spec/` (**1p A4 portrait**), `mandatory/ai-employee-demo/`, `business/` (`CueX-Business-Plan.pdf` **8p**, `CueX-Unit-Economics.pdf` **1p** w/ `#12` CPA calibration, `CueX-Competitive-Analysis.pdf` **2p**, submission copy & scripts), `demo/token-usage-proof.png`, `assets/CueX-Cover.png` & `15` UI previews, `sbom-and-checksums.json`, and [`verification/{verification.json,test-report.md,SHA256SUMS.txt}`](../../deliverables/cuex-final/verification/test-report.md).
  - Added `*.pem` to `.gitignore`, verified clean non-self-referential `CueX-Universal-Presentation-Final.zip` (`deliverables/cuex-final/` & repo root), and verified zero legacy/public-data findings across working tree and staged index.
