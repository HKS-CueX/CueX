# CueX Next — Refactor Changelog (`refactor/universal-runtime-presentation`)

> **Base Commit**: `96cd742523d5b0fea5aafdb65944d421938a0a43` (`main` — `chore: initialize HKS-CueX repository`)  
> **Target Branch**: `refactor/universal-runtime-presentation`  
> **Summary**: Complete domain purge of the legacy pharmaceutical detailing simulator (`安舒平 / ANSHU-3`, virtual doctors `dr-chen`/`dr-li`), architectural rebuild into a domain-agnostic **Universal Cognitive Runtime + Scenario Adapter**, full end-to-end implementation of the first live wedge **`CueX Presentation`**, and unification of engineering/product/business deliverables.

---

## 1. Protocol Layer (`packages/protocol/`)

- **Removed**: `jev.ts`, `piagent.ts`, `library.ts` and all pharmaceutical / virtual-doctor WS events.
- **Added / Rebuilt**:
  - `common.ts`: `InterventionLevel` (`L0`–`L3`), `DEFAULT_UTILITY_LAMBDA` (`2`), `DataScope`, `PrivacyLevel`, `EvidenceLifecycle`, `TelemetryUsage` (distinguishing `provider_reported`, `local_rule_zero`, `estimated`).
  - `entities.ts`: `Session`, `TaskContext`, `ContextPack`, `Evidence`, `CognitiveEvent`, `Observation`, `TranscriptSegment`, `Candidate`, `Intervention`, `MemoryItem` (opt-in `userConfirmed`), `MemoryProposal`, `Outcome`, `Reflection`.
  - `state.ts` & `reasoning.ts`: `SharedCognitiveState` (monotonic `contextVersion`), `FastDecisionInput`, `FastDecisionVerdict`, `SlowReasoningCandidateRequest`, `SlowReasoningCandidateResult` (`grounded`, `evidenceIds[]`).
  - `controller.ts`: `WithdrawalReason` (7 typed reasons), `ControllerAction`, `ControllerSuppressReason`, `ControllerDecision`, `ControllerInspectionTrace`.
  - `scenario.ts`: `ScenarioId`, `SCENARIO_CAPABILITY_DESCRIPTORS` (`presentation` = `'implemented'`; `social`, `teaching`, `sales`, `custom` = `'roadmap'`).
  - `presentation.ts`, `api.ts`, `audio.ts`, `events.ts`, `index.ts`: full Presentation compiler/live/reflection contracts and typed HTTP/WS (`ClientMessage` / `ServerMessage`) unions.

---

## 2. Universal Cognitive Runtime, Presentation Server & Infra (`apps/server/`, `infra/`, `scripts/`, `assets/`)

- **Purged**:
  - `apps/server/agents/doctors/**`, `src/scenario/{anshu,asr-corrections}.ts`, `src/controller/{TurnController,DoctorLinePrefetch}.ts`, `src/conversation/visitIntent.ts`, `src/system1/{dose,HeuristicSystemOne,JevFastDecider}.ts`, `src/system2/{doctors,DoctorLineAgent,DoctorTurnAgent,concernText,linePrompt,fixtures,prompt,PiAgentRunner,PiSystemTwo}.ts`, `src/library/*`, `src/fakes/engines.ts`, `src/contracts.ts`, legacy `scripts/*` and `test/*`.
  - `assets/models/facecap*.glb` and medical hotwords (`infra/windows/asr/*hotwords*.json`, `zh-2025-06-30.json`, `xasr-480ms.json`).
  - Cleaned legacy `doctor`/clinical wording from `infra/windows/tts/*`, `infra/deploy/{nginx.conf.example,cuex.service.example}`, `assets/brand/brand-spec.md`, `.env.example`, `.gitignore`, `package.json`, `scripts/{demo.mjs,tts-ssh-bridge.mjs,public-data-allowlist.json}`.
- **Added / Rebuilt**:
  - `apps/server/src/runtime/`: `CognitiveRuntime.ts`, `ContextStore.ts`, `EventBus.ts`, `SharedCognitiveStateStore.ts`, `InterventionController.ts`, `RetrievalProvider.ts` (bilingual BM25 + `verifyCandidateGrounding`), `MemoryStore.ts` (opt-in `userConfirmed === true` + session wipe), and `providers/{FastDecisionAdapter,SlowReasoningAdapter}.ts` (preserving `LlamaSystemOne` & `system2/config.ts` `redact()` + `numbersIn()`).
  - `apps/server/src/scenarios/`: `ScenarioRegistry.ts`, `presentation/{DocumentExtractor,PresentationCompiler,PresentationPackStore,PresentationPolicies,PresentationReflection,PresentationRuntime,samplePack}.ts`.
  - `apps/server/src/gateway/`: `GatewayServer.ts` (`/health`, `/api/scenarios`, `/api/presentation/*`, `/api/memory*`, `/api/sessions/:id/*`, WS `/ws` & `/ws/session`) and `healthProbe.ts`.
  - `apps/server/scripts/eval-presentation.ts` & 5 clean test suites in `apps/server/test/`.

---

## 3. Web Frontend (`apps/web/`)

- **Purged**: `ClinicalScaffoldingHUD.tsx`, `LiveBriefing.tsx`, `LiveOutcome.tsx`, `ScenarioSynthesizerModal.tsx`, `r3f/{DoctorBust,DoctorCanvas,SemanticFieldCanvas}.tsx`, `stage/*`, `StreamAudioPlayer.ts`, `ReplayDriver.ts`, `LiveWSDriver.ts`, `lib/{library,scenario,types}.ts`, legacy views & 7 medical tests, plus unused 3D/puppeteer deps from `apps/web/package.json`.
- **Added / Rebuilt**:
  - Warm Paper Daylight (`#F8F7F3`) + Amber/Violet `X` interface: `HomeView.tsx` (interactive `L0–L3`/withdraw preview + honest roadmap matrix), `CompilerView.tsx` (`.pptx/.pdf/.md/.txt` extract, sample pack, 4-tab `CueSheet`/`FactWhitelist`/`QACards`/`ProgressStructure`, privacy consent), `StageView.tsx` (`Focus` & `Inspector` dual views, `CueEdgeLight`, PCM16 `AudioCapture` + `BrowserSpeechRecognizer` + clearly labeled text simulation, Q&A missing-evidence alert), `ReflectionView.tsx` (`V = H - λI`, weak-segment single-point rehearsal, opt-in `MemoryProposal` + `MemoryInspectorPanel`, session wipe).
  - Tests: `apps/web/test/presentation-reducer.test.ts` (Vitest) & `apps/web/test/presentation-e2e.test.mjs` (Playwright Chromium E2E).

---

## 4. Documentation, Slides & Final Deliverables (`docs/`, `README.md`, `ppt/`, `deliverables/`)

- **Deleted Obsolete Docs & Dual Competing Decks**: `docs/{SCENARIO_LIBRARY,HKS_2026_SUBMISSION_GUIDE,HKS_2026_UNIVERSAL_SUBMISSION_GUIDE}.md`, `ppt/slides/cuex-hks*`, `ppt/scripts/{build-hks*,hks-doc-templates*}.mjs`.
- **Added Unified Documentation Tree**:
  - Root & Ops: `README.md`, `docs/DEPLOYMENT.md`
  - Product: `docs/product/{PRODUCT_VISION,PRESENTATION_PRD,USER_FLOWS}.md`
  - Architecture: `docs/architecture/{UNIVERSAL_RUNTIME,SYSTEM_1_SYSTEM_2,INTERVENTION_CONTROLLER,DATA_MODEL,SCENARIO_ADAPTER}.md`
  - Engineering: `docs/engineering/{BASELINE,CURRENT_ARCHITECTURE,AUDIT,LEGACY_CLEANUP,MIGRATION_PLAN,TEST_REPORT,CHANGELOG}.md`
  - Business: `docs/business/{BUSINESS_MODEL,UNIT_ECONOMICS,COMPETITIVE_ANALYSIS,ROADMAP}.md`
- **Unified Deliverables (`ppt/slides/cuex-final/`, `deliverables/cuex-final/`, `CueX-Universal-Presentation-Final.zip`)**:
  - Single `npm --prefix ppt run export:final` build outputting 8-page BP (`CueX-BP.pdf` & `CueX-Business-Plan.pdf`), 1-page A4 Job Spec, 1-page BMC, 1-page Unit Economics, 2-page A4 landscape combined BMC & Unit Economics, brand cover (`CueX-Cover.png`), real eval/cost chart (`token-usage-proof.png`), scripts (`CueX-Pitch-Script.md`, `CueX-Demo-Script.md`, `CueX-Website-Copy.md`), `evaluation-results.md`, `verification.json`, and 12 PNG previews.
  - Archived `deliverables/hks-2026*` into `.cuex-runtime/reference-archives/` (gitignored) and updated `.gitignore` (removed obsolete `apps/server/agents/doctors/dr-synth-*/`; tracked `deliverables/cuex-final/` and `/CueX-Universal-Presentation-Final.zip` on `refactor/universal-runtime-presentation` while ignoring other `deliverables/*`, `*.zip`, and `.cuex-runtime/`).
