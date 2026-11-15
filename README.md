# CueX — 你的快思考外挂

> **在深度思考之外，接住当下。**  
> Domain-agnostic **Universal Cognitive Runtime** + **Scenario Adapter**, launching with **CueX Presentation** as the first live operational wedge (`HKS-CueX/CueX`).

---

## What CueX Solves

Most AI systems live inside **System 2**: you pause what you are doing, switch windows, read paragraphs, and lose eye contact with the moment. High-stakes spoken delivery—startup pitches, thesis defenses, academic talks—breaks if an assistant keeps talking or flashing chat walls.

CueX acts as a **minimum-necessary-intervention cognitive copilot**:
- **Stay Quiet (`L0`) by Default**: Fluent delivery and intentional rhetorical pauses stay completely undisturbed.
- **Progressive Peripheral Cues (`L1 -> L2 -> L3`)**: Gentle Amber/Violet edge light (`L1`) -> 2–6 character peripheral keyword (`L2`) -> brief grounded scaffold card (`L3`).
- **Automatic Withdrawal**: Prompts disappear automatically when the speaker recovers, changes topic/chapter, expires TTL, invalidates context, or dismisses (`7` typed withdrawal transitions).
- **Zero-Hallucination Grounding**: Every factual/numeric hint must cite user-confirmed `Evidence` from the pre-stage compiler; absent answers trigger an explicit missing-evidence notice instead of fabricated statistics.
- **Multi-Tenant Auth, Persistence & Data Sovereignty**: Stateful `node:sqlite` WAL storage (`.cuex-runtime/cuex.db`), SHA-256 bearer sessions with per-user ownership isolation, atomic `usage_ledger` metering, opt-in `userConfirmed === true` memories, JSON/Markdown export (`UserDataExportBundle`), and synchronous wipe receipts (`DataDeletionReceipt`).

---

## Implemented Scope vs. Roadmap (Honest Status)

| Component / Scenario | Current Status | Details |
| --- | --- | --- |
| **Universal Cognitive Runtime & Gateway** (`apps/server/src/{runtime,gateway,storage,security,commercial,observability,pipeline}/`) | **Implemented (`Phase 2`)** | `CognitiveRuntimeSession`, `ContextStore`, `CognitiveEventBus`, `SharedCognitiveStateStore`, `LexicalBm25RetrievalProvider`, `InterventionController` (11 gates / 7 withdrawals), `PipelineTracker` (`serverSeq` + idempotency), `SqliteStorageRepository` (`node:sqlite` WAL migrations), `AuthService`, `RateLimiter`, `OriginGuard`, `PromptGuard`, `CommercialService` + `SandboxPaymentProviderAdapter`, `MetricsCollector`, opt-in `MemoryStore`. |
| **CueX Presentation** (`apps/server/src/scenarios/presentation/`, `apps/web/`) | **Implemented (`Phase 2`)** | Bounded `.pptx`/`.pdf`/`.md`/`.txt` `DocumentExtractor`, `PresentationCompiler` (`CueSheet`, lockable `FactWhitelist`, AI-predicted `QACards` tagged `isPrediction: true`, `ProgressNodes`), `Focus` / `Split Strip` / `Inspector` stage views, grounded Q&A fallback, `ReflectionView` (`V = H - λI`), single-point rehearsal, `AccountPanel` (`Plans` with `Team=Planned`, sandbox checkout preview, usage ledger, export & wipe). |
| **System 1 / System 2 / ASR Modes** | **Implemented with Local Fallback** | Runs zero-token locally out of the box (`CUEX_SYSTEM1=fake`, `CUEX_SYSTEM2=fake`, `CUEX_ASR=fake`) or connects optional `llama.cpp` System 1, `pi-ai` System 2, local/remote `sherpa-onnx` ASR (`local_sherpa` / `remote_sherpa`), and browser Web Speech API (`browser_webspeech` / `text_simulation`). |
| **Offline Cognitive Benchmark (`eval-presentation.ts`)** | **Verified Deterministic Eval** | `.cuex-runtime/eval-latest.json` (`2026-11-15T20:51:30.737Z`): `6/6` cases passed (`100%` precision, `0%` false intervention, `100%` withdrawal accuracy, `avgMs: 0.75`, `p50Ms: 0.46`, `p95Ms: 1.57`, `13` local rule evals, `0` tokens, `local_rule_zero`). *Explicitly offline deterministic rules — not GPU/cloud LLM throughput.* |
| **`CueX Social` · `Teaching` · `Sales` · `Custom` & Desktop Overlay** | **Roadmap Only** | Defined in `@cuex/protocol` (`status: 'roadmap'`); backend rejects live execution (`SCENARIO_NOT_IMPLEMENTED`); desktop always-on-top overlay scoped post-Web. |

---

## Repository Architecture

```text
packages/protocol/     Shared @cuex/protocol v2.0.0 contracts, validators, errors, schemas/, examples/, v1-to-v2 upgrader
apps/server/           Universal Runtime, Presentation adapter, Gateway HTTP + WS (/ws), SQLite WAL storage, Auth, Commercial & Observability
apps/web/              Warm-light CueX UI (HomeView, CompilerView, StageView Focus/Split-Strip/Inspector, ReflectionView, AccountPanel)
docs/
  ├── api/             openapi.yaml (OpenAPI 3.2.1) & asyncapi.yaml (AsyncAPI 3.1.0)
  ├── architecture/    UNIVERSAL_RUNTIME.md, SYSTEM_1_SYSTEM_2.md, INTERVENTION_CONTROLLER.md, DATA_MODEL.md, SCENARIO_ADAPTER.md
  ├── data/            DATA_PIPELINE.md, DATA_DICTIONARY.md, EVENT_CATALOG.md, SCHEMA_VERSIONING.md
  ├── security/        SECURITY_MODEL.md
  ├── privacy/         PRIVACY_DATA_MAP.md, DATA_RETENTION.md, CONSENT_FLOW.md
  ├── operations/      DEPLOYMENT.md, OBSERVABILITY.md, INCIDENT_RESPONSE.md, BACKUP_AND_RECOVERY.md
  ├── product/         PRODUCT_VISION.md, PRESENTATION_PRD.md, USER_FLOWS.md, PRODUCT_METRICS.md
  ├── engineering/     PHASE2_{AUDIT,PLAN,RISK_REGISTER}.md, DECISIONS/ADR-001..004.md, TEST_STRATEGY.md, RELEASE_PROCESS.md + historical archive
  ├── business/        BUSINESS_MODEL.md, UNIT_ECONOMICS.md, COMPETITIVE_ANALYSIS.md, CUSTOMER_VALIDATION.md, GTM_PLAN.md, PRICING_AND_PACKAGING.md, ROADMAP.md
  └── DEPLOYMENT.md    Quickstart & links to operational runbooks
scripts/               demo.mjs, db-backup-restore.mjs, check-public-data.mjs, check-legacy-domain.mjs, generate-sbom.mjs
.github/workflows/     ci.yml (typecheck, protocol/server/web tests, build, eval, Playwright E2E, guards, audit, SBOM)
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
1. Authenticate via `POST /api/auth/session` (automatic dev session or explicit demo identity switcher in `AccountPanel`) and click **一键载入 CueX 路演演示包** (`pack_cuex_demo_01`) or upload a `.pptx`, `.pdf`, `.md`, or `.txt` document (`<= 15 MB`).
2. Confirm/lock facts in the Fact Whitelist, accept the Microphone & Privacy Notice (`privacyNoticeAccepted: true`), and launch **`Focus`**, **`Split Strip`**, or **`Inspector`** mode (`rehearsal` or `live`).
3. Speak via Browser Web Speech (`SpeechRecognition`), Sherpa audio streaming, or text simulation controls to observe `L0–L3` intervention gating, automatic withdrawal, grounded Q&A lookup, post-session **`ReflectionView`** (`V = H - λI`), JSON/Markdown export (`GET /api/account/export`), and session/account wipe (`DataDeletionReceipt`).

---

## Verification, Backup & Hygiene Commands

```bash
pnpm typecheck                                                  # Workspace TypeScript check (@cuex/protocol, @cuex/server, @cuex/web)
pnpm --filter @cuex/protocol test                               # Protocol validator, JSON Schema, & v1->v2 compatibility tests
CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test             # Server unit, controller, persistence, security & commercial isolation tests
pnpm --filter @cuex/web test                                    # Web reducer & helper unit tests (Vitest)
pnpm build                                                      # Workspace production bundle build
CUEX_SYSTEM1=fake CUEX_SYSTEM2=fake CUEX_ASR=fake pnpm --filter @cuex/server eval
                                                                # Deterministic 6-case Presentation benchmark (.cuex-runtime/eval-latest.*)
node --test apps/web/test/presentation-e2e.test.mjs             # Headless Playwright browser E2E test against built server & web
pnpm db:backup --self-test                                      # Online WAL-safe SQLite backup/restore & integrity self-test
pnpm check:public-data && pnpm check:legacy                     # Secret/PII/local-path guard & legacy-domain/TTS guard
node scripts/generate-sbom.mjs --output .cuex-runtime/sbom-and-checksums.json
                                                                # Zero-dep SBOM & SHA-256 artifact checksums
```

---

## Pre-Race Baseline Disclosure (HKS 2026)

Consistent with HKS 2026 OPC Track transparency rules: prior to the hackathon branch (`refactor/universal-runtime-presentation` from baseline commit `96cd742`), the repository held an earlier vertical dialogue training prototype from which only domain-neutral engineering infrastructure (browser PCM16 audio capture worklet, Sherpa ASR transport scaffolding, `pi-ai` provider credential redaction helpers, and CueX brand SVG marks/fonts) was retained or adapted. All Universal Cognitive Runtime abstractions, `InterventionController` policies, `@cuex/protocol` schemas, SQLite WAL storage/auth/quota layers, Presentation compiler/stage/reflection workflows, Web client views, and evaluation harnesses were designed and implemented during the CueX Next refactor. Full commit-level provenance and audit matrices live in [BASELINE.md](docs/engineering/BASELINE.md) and [AUDIT.md](docs/engineering/AUDIT.md).
