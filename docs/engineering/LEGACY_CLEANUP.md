# Legacy Domain Cleanup Inventory (`96cd742`)

> **[Historical Engineering Archive — Isolated from Active Product Docs]**  
> Scope: Complete Phase 1 purge & rewrite inventory covering **历史单领域角色扮演原型 / 旧领域遗留模块** tracked at baseline `96cd742`, alongside explicit preservation boundaries. Specific pre-refactor domain proper nouns, scenario names, and persona labels are neutralized below.

## 1. Files Slated for Full Deletion (Executed in Phase 1)

### 1.1 Protocol Package (`packages/protocol/src/`)
- `packages/protocol/src/jev.ts` — legacy 4-slot (`c1,c2,c3,d1`) System 1 context schema
- `packages/protocol/src/piagent.ts` — legacy turn-agent & `PiAgentToolCall` schema
- `packages/protocol/src/library.ts` — legacy `ExperienceItem` / `SynthesizedScenarioPack` schema

### 1.2 Server Legacy Domain Logic, Persona Stores, Scripts & Tests (`apps/server/`)
- Legacy roleplay agent profile & memory directories (`apps/server/agents/...`, 2 built-in persona directories removed)
- Legacy single-domain scenario pack (`apps/server/src/scenario/...`, 2 files) and `apps/server/src/conversation/` intent helper
- Legacy roleplay prefetch module (`apps/server/src/controller/`) and `TurnController.ts`
- Legacy hardcoded heuristic helper (`dose.ts`), `HeuristicSystemOne.ts`, `JevFastDecider.ts` (note: `autotrust-jev9b.json` calibration metadata remains targeted in Phase 2 neutralization unless replaced by neutral config)
- Legacy persona loader, line/turn agents, concern/prompt helpers, fixtures, and `PiSystemTwo.ts` in `apps/server/src/system2/`
- Legacy `apps/server/src/library/{LibraryApi.ts,LibraryStore.ts,ScenarioSynthesizer.ts}`
- Legacy fixtures/benchmarks (`asr-fixtures.ts`, `s1-eval.ts`, `s1-matrix.ts`, `s2-bench.ts`, `s2-lines.ts`, `s2-smoke.ts`, `voice-samples.ts`, etc.)
- `apps/server/test/*` legacy roleplay test suites (`controller-gateway.test.ts`, `controller-turn.test.ts`, `live-driver.test.ts`, `scenario-library.test.ts`, `system1-cases.json`, `system1.test.ts`, `system2-budgets.test.ts`, `system2-turn.test.ts`, `voice-asr-corrections.test.ts`, `voice-flow.test.ts`)

### 1.3 Web UI, 3D Avatar Assets & Legacy Tests (`apps/web/` & `assets/models/`)
- Legacy 3D head mesh `.glb` assets under `assets/models/`
- Legacy vertical HUD, briefing/outcome/synthesizer modals, and R3F 3D avatar components under `apps/web/src/components/`
- Legacy preview directory `apps/web/src/stage/` (8 files)
- `apps/web/src/lib/{scenario.ts,library.ts}` (68s static legacy replay & experience library client)
- `apps/web/src/core/driver/ReplayDriver.ts` (68s static legacy replay driver)
- 7 legacy Playwright/node verification scripts in `apps/web/test/`

### 1.4 Obsolete Documentation & Dual Competing Decks (`docs/`, `ppt/`)
- Deleted in Phase 1 docs purge:
  - `docs/SCENARIO_LIBRARY.md`
  - `docs/HKS_2026_SUBMISSION_GUIDE.md`
  - `docs/HKS_2026_UNIVERSAL_SUBMISSION_GUIDE.md`
- Consolidated/replaced in `ppt/`:
  - `ppt/slides/cuex-hks/index.tsx`, `ppt/slides/cuex-hks-universal/index.tsx`
  - `ppt/scripts/build-hks-deliverables.mjs`, `ppt/scripts/build-hks-universal-deliverables.mjs`
  - `ppt/scripts/hks-doc-templates.mjs`, `ppt/scripts/hks-universal-doc-templates.mjs`
- Archival target after read-only audit & `cuex-final` build complete:
  - `deliverables/hks-2026/`, `deliverables/hks-2026.zip`, `deliverables/hks-2026-universal/`, `deliverables/hks-2026-universal.zip` -> moved to `.cuex-runtime/reference-archives/`.

---

## 2. Files Modified / Rewritten In-Place (Legacy Symbols Stripped)

| File / Area | Legacy Symbols Removed | Target Replacement |
| --- | --- | --- |
| `packages/protocol/src/*` | Legacy persona ID, scaffolding level, turn/audio/prefetch events, `FollowupCandidate`, roleplay outcome, domain ASR rules | Domain-agnostic `Session`, `ContextPack`, `Evidence`, `Candidate`, `Intervention`, `SharedCognitiveState`, `ControllerDecision`, `ScenarioCapabilityDescriptor`, `Presentation*`, `ClientMessage`/`ServerMessage` (upgraded with Phase 2 `EventEnvelope` & validation) |
| `apps/server/src/gateway/` | `/ws/session` sole path, `/briefing`, `/api/experiences`, `/api/scenarios` | `/ws` (`/ws/session` alias), `/health`, `/api/scenarios`, `/api/presentation/{extract,compile,packs}`, `/api/memory`, `/api/sessions/:id/reflection` + Phase 2 auth/usage/export routes |
| `apps/server/src/system1/` | `c1/c2/c3/d1` domain rules, turn-sliced speech fields, hardcoded keyword helpers | Domain-agnostic `FastDecisionProvider` (`FastDecisionInput -> FastDecisionVerdict`) |
| `apps/server/src/system2/` | Legacy turn/line roleplay agents & follow-up tools | Domain-agnostic `SlowReasoningProvider` (`SlowReasoningCandidateRequest -> SlowReasoningCandidateResult`) preserving `config.ts` `redact()` & grounded citation checks |
| `apps/server/src/voice/` | Legacy domain ASR correction map, dead audio-synthesis coupling | Neutral ASR backend (`LocalSherpaAsr`, `RemoteSherpaAsr`, `TextOnlyAsr`) exposing real `AsrCapabilityStatus`; retire dead speech synthesis (`ADR-004`) |
| `infra/windows/asr/*hotwords*` | Legacy domain hotwords | Domain-neutral / presentation vocabulary |
| `.env.example`, `scripts/public-data-allowlist.json`, `scripts/demo.mjs` | Legacy `CUEX_AGENTS_DIR` & roleplay smoke script | `CUEX_MEMORY_DIR`, `CUEX_PACKS_DIR`, neutral runtime vars & CueX Presentation launcher |
| `apps/web/src/` | Legacy palette/HUD copy & `LiveWSDriver` turn loop | Warm light CueX aesthetic (`#F8F7F3`, `#111318`, Amber `#E87A24` × Violet `#7C3AED`), `HomeView`, `CompilerView`, `StageView` (`Focus`/`Inspector`), `ReflectionView` |
| `docs/DEPLOYMENT.md` & root `README.md` | Legacy roleplay setup, 3D avatar assets, `/ws/session` only | Accurate `HKS-CueX/CueX` Presentation + Universal Runtime deployment & README |

---

## 3. Explicit Preservation Rules (DO NOT DELETE / DO NOT MODIFY WITHOUT CAUSE)

- **Competition Handbooks (Preserved in `docs/`)**: `docs/hks.md` and `docs/怀客松2026_OPC模式创新赛道命题手册11.12docx.pdf`.
- **Brand & Fonts (`assets/brand/`, `assets/fonts/`)**: CueX brand marks (`cuex-symbol*.svg`, `cuex-wordmark*.svg`, `x-dimensional.png`, `brand-spec.md`) and bundled typefaces (`Inter-VF`, `NotoSansSC-VF`, `NotoSerifSC-VF`, `InstrumentSerif-*`, `JetBrainsMono-VF`).
- **Protected Directories**: `.claude/` and `assets/banners/` (must remain untouched).
- **Historical Engineering Archive**: `docs/engineering/{BASELINE,CURRENT_ARCHITECTURE,AUDIT,LEGACY_CLEANUP,MIGRATION_PLAN}.md` are explicitly tagged `[Historical Engineering Archive — Isolated from Active Product Docs]` and retain structural audit facts in domain-neutralized form.

---

## 4. Purge Verification Checklist

Every production code, active doc, and final deliverable directory MUST pass automated `node scripts/check-legacy-domain.mjs` and `node scripts/check-public-data.mjs` checks with **0 findings** across:
- `packages/protocol/`
- `apps/server/`
- `apps/web/`
- `ppt/`
- `infra/`
- `scripts/`
- `assets/`
- `README.md`, `docs/` (excluding protected competition handbooks if applicable), and `deliverables/cuex-final/`
