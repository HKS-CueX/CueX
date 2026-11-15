# CueX Next Refactor & Migration Plan

> Target Branch: `refactor/universal-runtime-presentation` (branched from `main` at `96cd742`)  
> Positioning: **CueX** (通用认知外挂 · Universal Cognitive Runtime + Scenario Adapter) with **CueX Presentation** as the first fully implemented live scenario.

## 1. Architectural Shift Summary

| Dimension | Legacy Baseline (`96cd742`, see [BASELINE.md](./BASELINE.md)) | Target Architecture (CueX Next) |
| --- | --- | --- |
| Core Abstraction | Single hardcoded vertical dialogue loop (`TurnController`) | Domain-agnostic **Universal Cognitive Runtime** (`CognitiveRuntimeSession`, `ContextStore`, `CognitiveEventBus`, `SharedCognitiveStateStore`, `InterventionController`, `MemoryStore`) decoupled from scenario plugins |
| Scenario Support | Single hardcoded pre-race demo scenario | Pluggable **Scenario Adapter Layer** (`ScenarioRegistry`): `presentation` (`implemented`) + explicit `roadmap` descriptors (`social`, `teaching`, `sales`, `custom`) |
| Intervention Policy | Coupled inside dialogue turn controller + legacy HUD modes (`full/minimal/faded`) | Independent **`InterventionController`** enforcing `L0–L3`, TTL expiry, monotonic `contextVersion` checks, grounding verification, multi-signal hesitation/omission/drift gating, cooldowns, dismissal suppression, and **7 typed automatic withdrawal reasons** |
| System 1 & System 2 | Legacy fixed-question single-token loop + scripted turn agents | Model-agnostic `FastDecisionProvider` (`LlamaFastDecisionProvider` / `HeuristicFastDecisionProvider`) + `SlowReasoningProvider` (`PiSlowReasoningProvider` / `LocalSlowReasoningProvider`) with `LexicalBm25RetrievalProvider` and honest telemetry |
| User Memory | Automatic unconfirmed file writes after sessions | Opt-in `MemoryStore` (`userConfirmed === true` required), inspectable/editable/deletable via REST + UI (`MemoryInspectorPanel`) |
| Document & Context Prep | Legacy pack synthesizer over hardcoded domain template | Real `DocumentExtractor` (`.md`, `.txt`, `.pptx` via `node:zlib` + XML parsing, best-effort `.pdf` with readability warnings) + grounded `PresentationCompiler` (`CueSheet`, lockable `FactWhitelist`, `QACards` flagged `isPrediction: true`, `ProgressStructure`) |
| Presenter Experience | Legacy 3D avatar stage + turn review scorecard | Clean CueX warm light aesthetic (`#F8F7F3`, Amber `#E87A24` × Violet `#7C3AED`), **Focus** (peripheral-legible) vs **Inspector** (real telemetry/events), and post-session **Reflection** + **Single-Point Rehearsal** (`V = H - λI`) |
| Telemetry & Cost Claims | Unverified 95.9% margin / shared cross-slot KV claim | Honest per-tier `TelemetryUsage` (exact model tokens or `0` for local fallback, `measurementSource`) + 10-component unit economics model |

---

## 2. Execution Phases & Ownership

### P0 — Baseline Audit & Legacy Doc Purge (`auditor-docs`)
- Produce honest baseline engineering documentation: `BASELINE.md`, `CURRENT_ARCHITECTURE.md`, `AUDIT.md`, `LEGACY_CLEANUP.md`, `MIGRATION_PLAN.md`.
- Delete obsolete docs: `docs/SCENARIO_LIBRARY.md`, `docs/HKS_2026_SUBMISSION_GUIDE.md`, `docs/HKS_2026_UNIVERSAL_SUBMISSION_GUIDE.md`.

### P1 — Branch Setup & `@cuex/protocol` Redesign (`protocol-architect`)
- Branch `refactor/universal-runtime-presentation` cleanly from `main` (`96cd742`).
- Purge legacy domain schemas listed in [LEGACY_CLEANUP.md](./LEGACY_CLEANUP.md).
- Ship domain-agnostic contracts in `packages/protocol/src/`: `common.ts`, `scenario.ts`, `controller.ts`, `entities.ts`, `state.ts`, `reasoning.ts`, `audio.ts`, `presentation.ts`, `api.ts`, `events.ts`, `index.ts`.

### P2 — Universal Cognitive Runtime & Presentation Backend (`runtime-server`)
- Remove all legacy domain personas, scripts, domain ASR corrections, tests, and 3D avatar meshes inventoried in [LEGACY_CLEANUP.md](./LEGACY_CLEANUP.md).
- Build Universal Runtime (`apps/server/src/runtime/`):
  - `CognitiveRuntimeSession`, `ContextStore`, `CognitiveEventBus`, `SharedCognitiveStateStore`, `InterventionController`, `MemoryStore`, `LexicalBm25RetrievalProvider`.
  - Model-agnostic `FastDecisionAdapter` (`LlamaSystemOne` + deterministic `HeuristicFastDecisionProvider`), `SlowReasoningAdapter` (`pi-ai` runner + `LocalSlowReasoningProvider`), and honest `voice/` ASR (`LocalSherpaAsr`, `RemoteSherpaAsr`, `TextOnlyAsr`).
- Build Scenario Adapter Layer (`apps/server/src/scenarios/`):
  - `ScenarioRegistry` (`presentation` = `implemented`; `social`/`teaching`/`sales`/`custom` = `roadmap`).
  - `DocumentExtractor`, `PresentationCompiler`, `PresentationPackStore`, `PresentationPolicies`, `PresentationRuntimePlugin`, `PresentationReflection` (`V = H - λI`, default `λ = 2`), plus sample CueX Presentation pack (`pack_cuex_demo_01`).
- Expose REST & WS `/ws` (`/ws/session` alias) endpoints matching `@cuex/protocol`, add unit/integration tests (`CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test`), and add reproducible `apps/server/scripts/eval-presentation.ts`.

### P3 — CueX Presentation Web Application (`presentation-web`)
- Remove all legacy stage UI components, R3F avatar canvases, and static scripted replay drivers listed in [LEGACY_CLEANUP.md](./LEGACY_CLEANUP.md).
- Preserve CueX warm-light Amber × Violet `X` identity across 4 workflows:
  - `HomeView` (Universal Copilot philosophy + implemented `Presentation` + honest `roadmap` cards)
  - `CompilerView` (`.pptx/.pdf/.md/.txt` upload + CueX sample pack + privacy disclosure + editable/lockable Fact Whitelist, AI-predicted QA Cards, Cue Sheet, Progress Structure)
  - `StageView` (`Focus` peripheral HUD with L0–L3 + auto-withdraw + `H/I` feedback vs `Inspector` live runtime telemetry; `AudioCapture`, optional `BrowserSpeechRecognizer` with honest status badge, plus clearly labeled text simulation)
  - `ReflectionView` (timeline, diagnosis, single-point weak-segment rehearsal, opt-in Memory governance via `MemoryInspectorPanel`)
- Verify typecheck, production Vite build, Vitest unit tests, and Playwright E2E suite (`apps/web/test/presentation-e2e.test.mjs`).

### P4 — Product, Architecture, Business & Unified Deliverables (`auditor-docs` & `biz-deliverables`)
- Author `docs/product/*`, `docs/architecture/*`, `docs/DEPLOYMENT.md`, and root `README.md` (`auditor-docs`), strictly aligned with implemented backend/frontend symbols.
- Run verified competitor research, rebuild `docs/business/{BUSINESS_MODEL,UNIT_ECONOMICS,COMPETITIVE_ANALYSIS,ROADMAP}.md` with 10-component economics + measured eval telemetry, unify `ppt/` to `cuex-final`, and generate all PDFs, markdown scripts, token evidence graphics, and previews under `deliverables/cuex-final/` (`biz-deliverables`).

### P5 & P6 — Alignment Gate, Full Verification, Archival & Local Commit (`auditor-docs`, `qa-verifier`)
- Alignment Gate: Cross-check every doc claim, file path, symbol name, WS/REST route, and ASR/KV-cache disclosure against actual compiled code.
- QA Verification: Confirm zero unintended legacy domain terms across active code/docs/deliverables, run `pnpm typecheck`, `pnpm build`, offline server tests, `eval-presentation.ts`, Playwright E2E, visual PDF/PNG inspection, archive legacy `deliverables/hks-2026*` to `.cuex-runtime/reference-archives/`, package `CueX-Universal-Presentation-Final.zip`, run `check-public-data.mjs --staged`, write `TEST_REPORT.md` & `CHANGELOG.md`, and commit cleanly on `refactor/universal-runtime-presentation`.
