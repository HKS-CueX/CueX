# CueX Next Refactor & Migration Plan

> **[Historical Engineering Archive — Isolated from Active Product Docs]**  
> This document records the Phase 1 architectural refactor plan (`96cd742 -> 6804f5a`) onto `refactor/universal-runtime-presentation`. For the active Phase 2 productionization roadmap (persistence, auth, schema v2, observability, commercial guardrails), see [PHASE2_PLAN.md](./PHASE2_PLAN.md).

> Target Branch: `refactor/universal-runtime-presentation` (branched from `main` at `96cd742`)  
> Positioning: **CueX** (通用认知外挂 · Universal Cognitive Runtime + Scenario Adapter) with **CueX Presentation** as the first fully implemented live scenario.

## 1. Architectural Shift Summary

| Dimension | Legacy Baseline (`96cd742`, see [BASELINE.md](./BASELINE.md)) | Target Architecture (CueX Next Phase 1) |
| --- | --- | --- |
| Core Abstraction | Single hardcoded vertical dialogue loop (`TurnController`, 历史单领域角色扮演原型) | Domain-agnostic **Universal Cognitive Runtime** (`CognitiveRuntimeSession`, `ContextStore`, `CognitiveEventBus`, `SharedCognitiveStateStore`, `InterventionController`, `MemoryStore`) decoupled from scenario plugins |
| Scenario Support | Single hardcoded pre-race prototype scenario | Pluggable **Scenario Adapter Layer** (`ScenarioRegistry`): `presentation` (`implemented`) + explicit `roadmap` descriptors (`social`, `teaching`, `sales`, `custom`) |
| Intervention Policy | Coupled inside dialogue turn controller + legacy HUD modes (`full/minimal/faded`) | Independent **`InterventionController`** enforcing `L0–L3`, TTL expiry, monotonic `contextVersion` checks, grounding verification, multi-signal hesitation/omission/drift gating, cooldowns, dismissal suppression, and **7 typed automatic withdrawal reasons** |
| System 1 & System 2 | Legacy fixed-question single-token loop + scripted turn agents | Model-agnostic `FastDecisionProvider` (`LlamaFastDecisionProvider` / `HeuristicFastDecisionProvider`) + `SlowReasoningProvider` (`PiSlowReasoningProvider` / `LocalSlowReasoningProvider`) with `LexicalBm25RetrievalProvider` and honest telemetry |
| User Memory | Automatic unconfirmed file writes after sessions | Opt-in `MemoryStore` (`userConfirmed === true` required), inspectable/editable/deletable via REST + UI (`MemoryInspectorPanel`) |
| Document & Context Prep | Legacy pack synthesizer over hardcoded domain template | Real `DocumentExtractor` (`.md`, `.txt`, `.pptx` via `node:zlib` + XML parsing, best-effort `.pdf` with readability warnings) + grounded `PresentationCompiler` (`CueSheet`, lockable `FactWhitelist`, `QACards` flagged `isPrediction: true`, `ProgressStructure`) |
| Presenter Experience | Legacy 3D avatar stage + turn review scorecard | Clean CueX warm light aesthetic (`#F8F7F3`, Amber `#E87A24` × Violet `#7C3AED`), **Focus** (peripheral-legible) vs **Inspector** (real telemetry/events), and post-session **Reflection** + **Single-Point Rehearsal** (`V = H - λI`) |
| Telemetry & Cost Claims | Unverified 95.9% margin / shared cross-slot KV claim | Honest per-tier `TelemetryUsage` (exact model tokens or `0` for local fallback, `measurementSource`) + 10-component unit economics model |

---

## 2. Phase 1 Execution Waves & Ownership (Completed at `e2cb637` / `6804f5a`)

### P0 — Baseline Audit & Legacy Doc Purge (`auditor-docs`)
- Produced baseline engineering documentation: `BASELINE.md`, `CURRENT_ARCHITECTURE.md`, `AUDIT.md`, `LEGACY_CLEANUP.md`, `MIGRATION_PLAN.md` (subsequently neutralized in Phase 2 to isolate legacy domain terms).
- Deleted obsolete docs: `docs/SCENARIO_LIBRARY.md`, `docs/HKS_2026_SUBMISSION_GUIDE.md`, `docs/HKS_2026_UNIVERSAL_SUBMISSION_GUIDE.md`.

### P1 — Branch Setup & `@cuex/protocol` Redesign (`protocol-architect`)
- Branched `refactor/universal-runtime-presentation` cleanly from `main` (`96cd742`).
- Purged legacy domain schemas (`jev.ts`, `piagent.ts`, `library.ts`) and shipped domain-agnostic contracts in `packages/protocol/src/`.

### P2 — Universal Cognitive Runtime & Presentation Backend (`runtime-server`)
- Removed legacy domain stores, personas, benchmarks, tests, and 3D avatar meshes inventoried in [LEGACY_CLEANUP.md](./LEGACY_CLEANUP.md).
- Built Universal Runtime (`apps/server/src/runtime/`) + Scenario Adapter Layer (`apps/server/src/scenarios/`) + REST/WS `GatewayServer.ts` + offline `eval-presentation.ts`.

### P3 — CueX Presentation Web Application (`presentation-web`)
- Built `HomeView`, `CompilerView`, `StageView` (`Focus` / `Inspector`), `ReflectionView`, `MemoryInspectorPanel`, and Playwright E2E suite.

### P4–P6 — Product/Business Alignment, Verification & Commit (`auditor-docs`, `biz-deliverables`, `qa-verifier`)
- Authored unified docs, rebuilt `ppt/cuex-final` deliverables, verified build/tests/eval/public-data checks, archived `deliverables/hks-2026*` to `.cuex-runtime/reference-archives/`, and committed cleanly on `refactor/universal-runtime-presentation` (`e2cb637`, `6804f5a`).

For Phase 2 architecture hardening (SQLite `StorageRepository`, `EventEnvelope`, schema v2, multi-tenant auth, `UsageLedger`, `Entitlement`, CI/CD, security/privacy/ops docs, and commercial model fixes), see [PHASE2_PLAN.md](./PHASE2_PLAN.md).
