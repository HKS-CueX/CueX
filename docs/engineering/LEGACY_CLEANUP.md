# Legacy Medical Domain Cleanup Inventory (`96cd742`)

> Scope: Complete inventory of pharmaceutical / clinical / virtual-doctor (`安舒平` / `ANSHU-3` / `dr-chen` / `dr-li`) assets, modules, scripts, and symbols tracked at baseline `96cd742` for deletion or rewrite, alongside explicit preservation boundaries.

## 1. Files Slated for Full Deletion

### 1.1 Protocol Package (`packages/protocol/src/`)
- `packages/protocol/src/jev.ts` — medical `SystemOneContext` / `repSpeechSinceConcern` / `c1,c2,c3,d1` schema
- `packages/protocol/src/piagent.ts` — `DoctorTurnAgent` / `PiAgentToolCall` medical schema
- `packages/protocol/src/library.ts` — medical `ExperienceItem` / `SynthesizedScenarioPack` schema

### 1.2 Server Domain Logic, Doctor Personas, Scripts & Tests (`apps/server/`)
- `apps/server/agents/doctors/dr-chen/{PROFILE.md,MEMORY.md}`
- `apps/server/agents/doctors/dr-li/{PROFILE.md,MEMORY.md}`
- `apps/server/src/scenario/anshu.ts` (`ANSHU_PACK` — `安舒平 / ANSHU-3` clinical detailing script & concern definitions)
- `apps/server/src/scenario/asr-corrections.ts` (`ANSHU_ASR_CORRECTIONS` — `eGFR 30到60`, `安舒平`, `收缩压`, `毫米汞柱`)
- `apps/server/src/controller/DoctorLinePrefetch.ts`
- `apps/server/src/conversation/visitIntent.ts` (`isExplicitFarewell` — `"陈主任再见"`, `"结束今天的拜访"`)
- `apps/server/src/system1/dose.ts` (`answersElderlyDose` — `"75岁"`, `"2.5mg"`)
- `apps/server/src/system1/autotrust-jev9b.json` (medical task verbalizer / calibration metadata tied to `c1/c2/c3/d1` unless replaced by neutral config)
- `apps/server/src/system2/doctors.ts` (`dr-chen` / `dr-li` profile & automatic unconfirmed `MEMORY.md` writer)
- `apps/server/src/system2/DoctorLineAgent.ts`
- `apps/server/src/system2/DoctorTurnAgent.ts`
- `apps/server/src/system2/concernText.ts`
- `apps/server/src/system2/linePrompt.ts`
- `apps/server/src/system2/fixtures.ts`, `prompt.ts`, `run.ts` (clinical agent prompts/fixtures)
- `apps/server/src/library/{LibraryApi.ts,LibraryStore.ts,ScenarioSynthesizer.ts}` (ANSHU scenario variants)
- `apps/server/scripts/asr-fixtures.ts`, `s1-eval.ts`, `s1-matrix.ts`, `s2-bench.ts`, `s2-lines.ts`, `s2-smoke.ts`, `voice-samples.ts` (medical fixtures & clinical benchmarks)
- `apps/server/test/*` medical test suites (`controller-gateway.test.ts`, `controller-turn.test.ts`, `live-driver.test.ts`, `scenario-library.test.ts`, `system1-cases.json`, `system1.test.ts`, `system2-budgets.test.ts`, `system2-turn.test.ts`, `voice-asr-corrections.test.ts`, `voice-flow.test.ts`)

### 1.3 Web UI, 3D Doctor Assets & Medical Tests (`apps/web/` & `assets/models/`)
- `assets/models/facecap.glb`, `assets/models/facecap-notex.glb`
- `apps/web/src/components/ClinicalScaffoldingHUD.tsx`
- `apps/web/src/components/LiveBriefing.tsx`
- `apps/web/src/components/LiveOutcome.tsx`
- `apps/web/src/components/ScenarioSynthesizerModal.tsx`
- `apps/web/src/components/r3f/DoctorBust.tsx`, `apps/web/src/components/r3f/DoctorCanvas.tsx`
- `apps/web/src/stage/{BriefingPanel.tsx,VisitPanel.tsx,ReviewPanel.tsx,panels.css,preview.tsx,visit-preview.html,visit-preview.tsx,visit.css}`
- `apps/web/src/lib/{scenario.ts,library.ts}` (68s static medical replay & medical experience library client)
- `apps/web/src/core/driver/ReplayDriver.ts` (68s static medical replay driver)
- `apps/web/test/{live-browser.test.mjs,live-conversation-server.ts,live-conversation.test.mjs,live-server.ts,scenario-library-browser.test.mjs,scenario-library-server.ts,stage-loop.test.mjs}`

### 1.4 Obsolete Documentation & Dual Competing Decks (`docs/`, `ppt/`)
- Deleted in P0/P2 docs purge:
  - `docs/SCENARIO_LIBRARY.md`
  - `docs/HKS_2026_SUBMISSION_GUIDE.md`
  - `docs/HKS_2026_UNIVERSAL_SUBMISSION_GUIDE.md`
- Consolidated/replaced in `ppt/`:
  - `ppt/slides/cuex-hks/index.tsx`, `ppt/slides/cuex-hks-universal/index.tsx`
  - `ppt/scripts/build-hks-deliverables.mjs`, `ppt/scripts/build-hks-universal-deliverables.mjs`
  - `ppt/scripts/hks-doc-templates.mjs`, `ppt/scripts/hks-universal-doc-templates.mjs`
- Archival target in P6 (after read-only audit & `cuex-final` build complete):
  - `deliverables/hks-2026/`, `deliverables/hks-2026.zip`, `deliverables/hks-2026-universal/`, `deliverables/hks-2026-universal.zip` -> moved to `.cuex-runtime/reference-archives/`.

---

## 2. Files Modified / Rewritten In-Place (Medical Symbols Stripped)

| File / Area | Legacy Symbols Removed | Target Replacement |
| --- | --- | --- |
| `packages/protocol/src/{audio,controller,events,scenario,index}.ts` + new modules | `doctorId`, `scaffoldingLevel`, `doctor.turn`, `doctor.audio`, `FollowupCandidate`, `VisitOutcome`, `AsrCorrection` medical rules | `Session`, `ContextPack`, `Evidence`, `Candidate`, `Intervention`, `SharedCognitiveState`, `ControllerDecision`, `ScenarioCapabilityDescriptor`, `Presentation*`, `ClientMessage`/`ServerMessage` |
| `apps/server/src/gateway/WebSocketGateway.ts` | `/ws/session`, `/briefing`, `/api/experiences`, `/api/scenarios` | `/ws`, `/health`, `/api/scenarios`, `/api/presentation/{extract,compile,packs}`, `/api/memory`, `/api/sessions/:id/reflection` |
| `apps/server/src/system1/{LlamaSystemOne,HeuristicSystemOne}.ts` | `c1/c2/c3/d1`, `repSpeechSinceConcern`, `answersElderlyDose`, medical verbalizer prompts | Domain-agnostic `FastDecisionProvider` (`FastDecisionInput -> FastDecisionVerdict`) |
| `apps/server/src/system2/PiSystemTwo.ts` | `DoctorLineAgent`, `DoctorTurnAgent`, `prepareFollowup` clinical tools | Domain-agnostic `SlowReasoningProvider` (`SlowReasoningCandidateRequest -> SlowReasoningCandidateResult`) preserving `config.ts` `redact()` & grounded citation checks |
| `apps/server/src/voice/{index,corrections,README}.ts` | `ANSHU_ASR_CORRECTIONS`, Ming medical TTS coupling | Neutral ASR backend (`LocalSherpaAsr`, `RemoteSherpaAsr`, `TextOnlyAsr`) exposing real `AsrCapabilityStatus` |
| `infra/windows/asr/{hotwords.txt,zh-hotwords.json,xasr-hotwords.json}` | Pharmaceutical & doctor hotwords | Domain-neutral / presentation vocabulary |
| `.env.example` & `scripts/public-data-allowlist.json` & `scripts/demo.mjs` | `CUEX_AGENTS_DIR=.../doctors`, `s2-smoke.ts` medical smoke test | `CUEX_MEMORY_DIR`, `CUEX_DATA_DIR`, neutral runtime vars & CueX Presentation launcher |
| `apps/web/src/{App.tsx,index.css,views/*,components/*,core/*}` | Clinical colors (`#d2461e` cinnabar / clinical stage), medical copy, `LiveWSDriver` doctor turns | Warm light CueX aesthetic (`#F8F7F3`, `#111318`, Amber `#E87A24` × Violet `#7C3AED`), `HomeView`, `CompilerView`, `StageView` (`Focus`/`Inspector`), `ReflectionView` |
| `docs/DEPLOYMENT.md` & root `README.md` | Medical visit setup, 3D doctor assets, `/ws/session` | Accurate `HKS-CueX/CueX` Presentation + Universal Runtime deployment & README |

---

## 3. Explicit Preservation Rules (DO NOT DELETE / DO NOT MODIFY WITHOUT CAUSE)

- **Competition Handbooks (Preserved in `docs/`)**: `docs/hks.md` and `docs/怀客松2026_OPC模式创新赛道命题手册11.12docx.pdf`.
- **Brand & Fonts (`assets/brand/`, `assets/fonts/`)**: CueX brand marks (`cuex-symbol*.svg`, `cuex-wordmark*.svg`, `x-dimensional.png`, `brand-spec.md`) and bundled typefaces (`Inter-VF`, `NotoSansSC-VF`, `NotoSerifSC-VF`, `InstrumentSerif-*`, `JetBrainsMono-VF`).
- **Protected Directories**: `.claude/` and `assets/banners/` (must remain untouched).
- **Historical P0 Engineering Audit Docs**: `docs/engineering/{BASELINE.md,CURRENT_ARCHITECTURE.md,AUDIT.md,LEGACY_CLEANUP.md,CHANGELOG.md}` intentionally document pre-refactor symbol names strictly as historical audit evidence.

---

## 4. Purge Verification Checklist (Executed in P6 QA Gate)

Every production code, active doc, and final deliverable directory MUST return **0 unexpected matches** for medical/legacy terms (`doctor`, `医药`, `医疗`, `临床`, `医药代表`, `安舒平`, `ANSHU`, `陈主任`, `李主任`, `dr-chen`, `dr-li`, `facecap`, `eGFR`, `收缩压`, `拜访`) across:
- `packages/protocol/`
- `apps/server/`
- `apps/web/`
- `ppt/`
- `infra/`
- `scripts/`
- `assets/`
- `README.md`, `docs/DEPLOYMENT.md`, `docs/product/`, `docs/architecture/`, `docs/business/`, `docs/engineering/MIGRATION_PLAN.md`
- `deliverables/cuex-final/`
