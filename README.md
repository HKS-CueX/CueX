# CueX — 你的快思考外挂

> **在深度思考之外，接住当下。**  
> Domain-agnostic **Universal Cognitive Runtime** + **Scenario Adapter**, launching with **CueX Presentation** as the first live operational wedge (`HKS-CueX/CueX`), backed by unified CPA LLM routing (`CpaProviderAdapter`), Google Colab GPU streaming ASR (`ColabAsrProvider`), SQLite WAL storage, and a WCAG-AA Warm Paper Daylight web UI.

---

## What CueX Solves

Most AI systems force users into **System 2**: pausing speech, reading full paragraphs, and losing audience eye contact. High-stakes live delivery—startup pitches, thesis defenses, academic talks—breaks the moment a copilot keeps talking or flooding the screen.

CueX acts as a **minimum-necessary-intervention cognitive copilot**:
- **Stay Quiet (`L0`) by Default**: Fluent speech and intentional rhetorical pauses stay completely undisturbed.
- **Progressive Peripheral Cues (`L1 -> L2 -> L3`)**: Subtle Amber/Violet peripheral glow (`L1`) -> 2–6 character keyword anchor (`L2`) -> compact grounded rescue scaffold (`L3`).
- **Automatic Withdrawal**: Prompts disappear automatically when the speaker recovers, changes topic or chapter, invalidates context, expires TTL, dismisses, or is superseded (`7` typed `WithdrawalReason` transitions).
- **Zero-Hallucination Grounding**: Every factual/numeric cue must cite user-confirmed `Evidence` from pre-stage compilation; ungrounded Q&A queries return an explicit `missing_evidence_notice` (`grounded: false`) rather than inventing numbers.
- **Multi-Tenant Auth, Persistence & Data Sovereignty**: Stateful `node:sqlite` WAL storage (`.cuex-runtime/cuex.db`), SHA-256 bearer sessions with per-user ownership isolation, atomic `usage_ledger` metering, opt-in `userConfirmed === true` memories, JSON/Markdown export (`UserDataExportBundle`), and synchronous wipe receipts (`DataDeletionReceipt`).

---

## Implemented Scope vs. Roadmap (Truth Summary)

For the full capability matrix, exclusions, and telemetry rules, see [docs/PRODUCT_TRUTH_TABLE.md](docs/PRODUCT_TRUTH_TABLE.md).

| Component / Scenario | Current Status | Verified Implementation Details |
| --- | --- | --- |
| **Universal Cognitive Runtime & Gateway** (`apps/server/src/{runtime,gateway,storage,security,commercial,observability,pipeline}/`) | **Implemented (`Phase 3`)** | `@cuex/protocol` v2.1.0, `CognitiveRuntimeSession` (with `reanchorCandidateLifetime`), `ContextStore`, `CognitiveEventBus`, `SharedCognitiveStateStore`, `LexicalBm25RetrievalProvider`, `InterventionController` (11 gates / 7 withdrawals), `PipelineTracker` (`serverSeq` + idempotency), `SqliteRepository` (`node:sqlite` WAL), `AuthService`, `CommercialService` + `SandboxPaymentProviderAdapter`, opt-in `MemoryStore`. |
| **CueX Presentation** (`apps/server/src/scenarios/presentation/`, `apps/web/`) | **Implemented (`Phase 3`)** | Bounded `.pptx`/`.pdf`/`.md`/`.txt` `DocumentExtractor`, `PresentationCompiler` + optional CPA extraction (`locked: true` preserved), Warm Paper editorial `HomeView` + ledger `CompilerView` / `StageView` (`Focus` / `Split Strip` / `Inspector`) / `ReflectionView` (`V = H - λI`), single-point rehearsal, WCAG AA contrast (`#A84B07` `5.72:1`), `0ms` keyboard stage shortcuts (`Space`/`M`/`H`/`Esc`), `AccountPanel` (`Plans` with `Team=Planned`), `MemoryInspectorPanel`. |
| **Speech Recognition (`ASR`) Modes** | **Implemented (`colab_gpu` + Fallbacks)** | `CUEX_ASR=real` + `CUEX_COLAB_ASR_URL` connects `ColabAsrProvider` (`https/wss :10086`, pinned SAN TLS + Bearer auth, 7-state `ColabAsrLifecycleState`, `AsrStream.flush()`) to Colab G4 **`FunAudioLLM/SenseVoiceSmall` + `fsmn-vad`** (`52.57 ms` avg infer, `0.00327` RTF). Also supports `RemoteSherpaAsr`, `LocalSherpaAsr`, `BrowserSpeechRecognizer`, and default zero-dep `TextOnlyAsr` (`CUEX_ASR=fake`). |
| **System 1 / System 2 / Compiler / Reflection LLMs** | **Implemented (`CpaProviderAdapter` + `local_rule_zero` Fallback)** | `CUEX_SYSTEM1=real` / `CUEX_SYSTEM2=real` route via unified `CpaClient` (`/v1/responses` & `/v1/chat/completions`, default `gemini-4-hydrogen` with `reasoningEffort: 'low'` for S1) + `ProviderResilience` (bounded retry, fast-fail `4xx`, circuit breaker). Tracks `provider_reported`, `provider_unreported`, and deterministic offline `local_rule_zero` (`0` tokens). |
| **`CueX Social` · `Teaching` · `Sales` · `Custom` & Desktop Overlay** | **Roadmap Only** | Defined in `@cuex/protocol` (`status: 'roadmap'`); backend rejects live execution (`SCENARIO_NOT_IMPLEMENTED`); desktop always-on-top overlay is scoped post-Web. |
| **Audio TTS Reply Back-Channel** | **Permanently Excluded** | Decommissioned (`ADR-004`, checked by `scripts/check-legacy-domain.mjs`) to prevent acoustic collision during live speech. |

---

## Strictly Separated Evaluation Summary (6 Categories)

CueX never mixes deterministic CI metrics with live GPU/LLM benchmarks or unconducted field studies ([Phase 3 Validation Report](docs/phase3/REAL_WORLD_VALIDATION_REPORT.md) · [Frontend QA Report](docs/design/FRONTEND_QA_REPORT.md)):

| # | Evaluation Category | Authority Source | Verified Quantitative Result | Scope / Honesty Disclosure |
| :---: | --- | --- | --- | --- |
| **1** | **Deterministic Unit & Offline Eval** | `CUEX_TEST_OFFLINE=1` server/protocol/web suites + `.cuex-runtime/eval-latest.json` (`2026-11-15T21:09:07.360Z`) | Server `34/34` pass (`0` fail, `0` skipped); Web Vitest `10/10` pass; 6-case Presentation eval **`6/6` pass** (`100%` precision, `0%` false trigger, `100%` withdrawal, `0.76 ms` avg / `1.63 ms` P95, `13` local rule evals, `V = +3`). | `local_rule_zero` deterministic clock & rules (`0` LLM tokens, `0` network latency). |
| **2** | **Provider Contract & Fault Simulation** | `cpa-llm-report.json` (`mockContractMatrix`, `isolatedFromLiveTelemetry: true`) + `qa-a11y-resilience.mjs` | **6/6 backend resilience contracts PASS**: `401`/`403` fast-fail + redaction, `429` retry recovery, `503` circuit-breaker (`local_rule_zero` fallback), malformed JSON guard, `stale_context_version` + dedup, `provider_unreported` (`0/0`); UI degraded/`503` checks PASS. | Uses local HTTP fault stubs / Playwright route mocks isolated from live CPA counters. |
| **3** | **Real CPA LLM** | [`cpa-llm-report.json`](deliverables/cuex-final/mandatory/ai-employee-demo/evidence/cpa-llm-report.json) (`v2`, `2026-11-15T23:29:37.171Z`) via `validate-cpa-live.ts` | **`18/18` live checks PASS** (`+ 3` intentional negative `400`/timeout/abort checks = `21` total calls). Head-to-head S1 benchmark: **`gemini-4-hydrogen` (`low`) `6/6` (`100%`, P50 `4,162 ms`)** vs `gemini-3.5-flash-lite` `4/6` (`66.67%`). Canonical `gemini-4-hydrogen` session (`12` calls): **`15,399` tokens (`7,126` reasoning)** `provider_reported`. | Upstream CPA reports token counts without billing rates (`costFen: 0`); live reasoning latency (`1.89–13.37 s`) motivated `reanchorCandidateLifetime`. |
| **4** | **Real Colab GPU ASR + Gateway E2E** | [`colab-asr-report.json`](deliverables/cuex-final/mandatory/ai-employee-demo/evidence/colab-asr-report.json) (`2026-11-15T22:08:28.644Z`) & [`real-e2e-validation.json`](deliverables/cuex-final/mandatory/ai-employee-demo/evidence/real-e2e-validation.json) (`v2`, `2026-11-15T23:27:42.641Z`) | Live G4 `RTX PRO 6000 Blackwell` `SenseVoiceSmall`: **`14/14` clips (`225.344 s`)**, **`52.57 ms` avg / `89.59 ms` P95**, **`0.00327` RTF**, `0.0867` mean clip CER, `401` auth, WSS drop recovery. Gateway E2E: **`14/14` Section 5.2 scenarios PASS** (`llm_compiler` `21` facts/`6` Q&A, `clip_14` `4,351` tokens, `400/201/200/200` sovereignty, `13,000 ms` TTL expiry, WS drop recovery, `80 ms` CPA timeout fallback). | **Corpus caveat (`notLiveHumanRoomRecording: true`)**: uses offline neural macOS TTS WAV + DSP clips with `silentValidationOnly: true` (`zeroSpeakerOutputConfirmed: true`), NOT live human room microphones. |
| **5** | **Browser E2E, Visual Layout & A11y** | `CUEX_TEST_OFFLINE=1 node --test apps/web/test/presentation-e2e.test.mjs` + [`FRONTEND_QA_REPORT.md`](docs/design/FRONTEND_QA_REPORT.md) | Playwright E2E **`1/1` pass (`5,105.30 ms`)**. **`42/42` captures across 6 viewports** (`1440..360` + `480/520` sidecars) = `0` overflow / `0` clipped / `0` `<11px` / `0` console errors; `9/9` landmarks & inputs; keyboard/`prefers-reduced-motion: reduce` (`0.001s`); `HomeView.tsx` `0 FAIL, 0 WARN`. | Runs against `CUEX_SYSTEM1/2/ASR=fake` backend in `--mute-audio` headless Chromium. |
| **6** | **Real-User Observation & Longitudinal Data** | `docs/business/CUSTOMER_VALIDATION.md` | **PLANNED / NOT YET CONDUCTED** | Zero live human speaker trials, paying customers, or empirical `λ = 2` field calibrations completed yet (`Round 1 20–30 -> Round 2 30–50` planned). |

---

## Repository Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the complete system diagram and module contracts.

```text
packages/protocol/     Shared @cuex/protocol v2.1.0 contracts, validators, errors, schemas/, examples/, v1-to-v2 upgrader
apps/server/           Universal Runtime, CpaProviderAdapter, ColabAsrProvider, Presentation adapter, Gateway HTTP/WS, SQLite WAL, Auth & Commercial
apps/web/              Warm Paper Daylight UI (HomeView, CompilerView, StageView Focus/Split-Strip/Inspector, ReflectionView, AccountPanel, MemoryInspectorPanel)
infra/colab/           Google Colab G4 GPU ASR server (start_asr.py, healthcheck.py, dual-model benchmark, notebook, README.md)
docs/
  ├── ARCHITECTURE.md               Top-level Phase 3 system architecture entrypoint
  ├── PRODUCT_TRUTH_TABLE.md        Capability, 6-category evaluation, and honesty truth table
  ├── api/                          openapi.yaml (OpenAPI 3.2.1) & asyncapi.yaml (AsyncAPI 3.1.0)
  ├── architecture/                 UNIVERSAL_RUNTIME.md, SYSTEM_1_SYSTEM_2.md, INTERVENTION_CONTROLLER.md, DATA_MODEL.md, SCENARIO_ADAPTER.md
  ├── design/                       FRONTEND_AUDIT.md, CUEX_DESIGN_BRIEF.md, DESIGN_SYSTEM.md, COMPONENT_INVENTORY.md, FRONTEND_QA_REPORT.md
  ├── phase3/                       EXECUTION_BASELINE.md, IMPLEMENTATION_PLAN.md, RISK_REGISTER.md, REAL_WORLD_VALIDATION_REPORT.md
  ├── data/ & security/ & privacy/  Schema dictionary, threat model, consent, retention & data sovereignty specs
  ├── operations/ & product/        Deployment, observability, backup/recovery, PRD, metrics & user flows
  ├── engineering/ & business/      Baseline provenance, ADRs, strategy, business plan & unit economics
  └── DEPLOYMENT.md                 Quickstart & links to operational runbooks
scripts/                            demo.mjs, db-backup-restore.mjs, check-public-data.mjs, check-legacy-domain.mjs, generate-sbom.mjs
```

---

## Quick Start (Zero External Keys Required)

```bash
# 1. Install workspace dependencies (Node >= 22.19, pnpm 9.15.9)
cp .env.example .env
pnpm install --frozen-lockfile

# 2. Launch both API/WS server (127.0.0.1:8765) and Vite web client (127.0.0.1:5173)
pnpm demo
# (Or run in two terminals: `pnpm dev:server` and `pnpm dev:web`)
```

Then open **`http://127.0.0.1:5173/`**:
1. Authenticate via `POST /api/auth/session` (automatic dev session or explicit demo switcher in `AccountPanel`) and click **一键载入 CueX 路演演示包** (`pack_cuex_demo_01`) or upload a `.pptx`, `.pdf`, `.md`, or `.txt` document (`<= 15 MB`).
2. Confirm/lock key facts in the Fact Whitelist, accept the Microphone & Privacy Notice (`privacyNoticeAccepted: true`), and launch **`Focus`**, **`Split Strip`**, or **`Inspector`** mode (`rehearsal` or `live`).
3. Speak via Browser Web Speech (`SpeechRecognition`), Colab/Sherpa audio streaming, or text controls to observe `L0–L3` intervention gating, automatic withdrawal, grounded Q&A lookup, post-stage **`ReflectionView`** (`V = H - λI`), JSON/Markdown export (`GET /api/account/export`), and session/account wipe (`DataDeletionReceipt`).

---

## Verification, Real Validation & Hygiene Commands

```bash
# Offline deterministic checks & Chromium E2E (--mute-audio, zero external keys)
pnpm typecheck
pnpm --filter @cuex/protocol test
CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test
pnpm --filter @cuex/web test
pnpm build
CUEX_SYSTEM1=fake CUEX_SYSTEM2=fake CUEX_ASR=fake pnpm --filter @cuex/server eval
CUEX_TEST_OFFLINE=1 node --test apps/web/test/presentation-e2e.test.mjs

# Live Colab GPU ASR & Live CPA LLM + Full Gateway E2E (requires gitignored .cuex-runtime/.env.phase3.local; silent WAV mode)
python3 infra/colab/healthcheck.py --env-file .cuex-runtime/.env.phase3.local --verify-auth
CPA_DEV_MODELS_LOADER=1 pnpm --filter @cuex/server exec tsx scripts/validate-cpa-live.ts
CPA_DEV_MODELS_LOADER=1 pnpm --filter @cuex/server exec tsx scripts/validate-real-e2e.ts

# Backup self-test, public-data hygiene, legacy-domain guard & SBOM
pnpm db:backup --self-test
pnpm check:public-data && pnpm check:legacy
node scripts/generate-sbom.mjs --output .cuex-runtime/sbom-and-checksums.json
```

---

## Pre-Race Baseline Disclosure (HKS 2026)

Consistent with HKS 2026 OPC Track transparency rules: prior to the hackathon branch (`refactor/universal-runtime-presentation` from baseline commit `96cd742`), the repository held an earlier vertical dialogue prototype from which only domain-neutral engineering scaffolding (browser PCM16 capture worklet, Sherpa ASR transport scaffolding, credential redaction helpers, and CueX SVG marks/fonts) was retained or adapted. All Universal Cognitive Runtime abstractions, `InterventionController` policies, `@cuex/protocol` v2.1.0 schemas, `ColabAsrProvider` & `CpaProviderAdapter` stacks, SQLite WAL storage/auth/quota layers, Presentation workflows, Warm Paper Web client views, and evaluation harnesses were built on this branch. Full provenance lives in [BASELINE.md](docs/engineering/BASELINE.md) and [AUDIT.md](docs/engineering/AUDIT.md).
