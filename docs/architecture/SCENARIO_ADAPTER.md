# Scenario Adapter Layer Architecture

> Contract Source: `packages/protocol/src/scenario.ts`, `packages/protocol/src/presentation.ts`  
> Implementation: `apps/server/src/scenarios/ScenarioRegistry.ts`, `apps/server/src/scenarios/presentation/`

## 1. Adapter Contract & Registry Enforcement

`ScenarioRegistry` (`apps/server/src/scenarios/ScenarioRegistry.ts`) wraps `SCENARIO_CAPABILITY_DESCRIPTORS` and exposes `assertRunnable(id)`. Only adapters with `status: 'implemented'` can launch a live runtime session; selecting any `'roadmap'` adapter raises `ScenarioNotImplementedError` (`HTTP 400` / WS `SCENARIO_NOT_IMPLEMENTED`) so unimplemented domains are never simulated as working features.

| `ScenarioId` | Display Name | Status | Capabilities & Notes |
| --- | --- | --- | --- |
| `presentation` | `CueX Presentation · 演讲与答辩临场引导` | **`implemented`** | Full `.pptx/.pdf/.md/.txt` compile, `rehearsal`/`live`, live Q&A grounding, L0–L3 controller, auto-withdrawal, single-point rehearsal, opt-in memory governance. |
| `social` | `CueX Social · 高频社交与人际破冰` | **`roadmap`** | All capability flags `false`; blocked from `session.start`. Planned multi-turn boundary & voiceprint privacy filtering. |
| `teaching` | `CueX Teaching · 课堂讲授与互动引导` | **`roadmap`** | All capability flags `false`; blocked from `session.start`. Planned syllabus graph compilation. |
| `sales` | `CueX Sales · 商业谈判与方案沟通` | **`roadmap`** | All capability flags `false`; blocked from `session.start`. Planned pricing/compliance whitelist & dual-speaker channel handling. |
| `custom` | `CueX Custom · 自定义场景适配器` | **`roadmap`** | All capability flags `false`; blocked from `session.start`. Planned declarative Adapter SDK. |

---

## 2. `ScenarioRuntimePlugin` Interface (`apps/server/src/runtime/types.ts`)

Every runnable Scenario Adapter implements `ScenarioRuntimePlugin<TState, TReflection>`:
- `scenarioId` binding
- `onSegment(segment, now, contextVersion)` -> returns covered points, chapter transition triggers, drift/question observations, or recovery hints
- `onTick(now, silenceMs, contextVersion)` -> evaluates time/pace conditions (e.g., overtime nudges)
- `onChapterChange(chapterId, now)` -> updates domain chapter timers cleanly
- `onInterventionShown` / `onInterventionWithdrawn` -> records timeline interventions
- `getTargetContextSnapshot()` / `getExpectedPoints()` -> feeds `FastDecisionInput`
- `getProjection(state, now)` -> produces `PresentationLiveState` for `cognitive.state.scenarioState` & `presentation.progress`
- `buildReflection(outcome, state, telemetry, utility)` -> constructs `PresentationReflection`

---

## 3. `CueX Presentation` Module Implementation (`apps/server/src/scenarios/presentation/`)

| Module | Concrete Responsibility |
| --- | --- |
| `DocumentExtractor.ts` | Parses `.md` / `.txt` directly, unpacks `.pptx` archives via native `node:zlib` (`readZipEntries`, `inflateRawSync`, DrawingML `<a:p>`/`<a:t>` over `slide*.xml` + speaker `notesSlides`), and performs best-effort `.pdf` text operator/Flate extraction while setting `unreadable: true` + `warnings[]` on scanned/encrypted PDFs. |
| `PresentationCompiler.ts` | Generates `PresentationContextPack`: `CueSheet` (thesis, hook, chapter transitions, CTA), `FactWhitelist` (`PresentationFactItem[]` linked to `Evidence.id`, editable/lockable, zero invented numbers), `QACards` (`isPrediction: true` explicit + `unpreparedGaps[]`), and `ProgressStructure`. |
| `PresentationPackStore.ts` + `samplePack.ts` | Persists packs under `<runtimeDir>/packs` (`CUEX_PACKS_DIR`) and preloads `SAMPLE_PRESENTATION_PACK` (`pack_cuex_demo_01` about CueX itself) with `ev_sample_*` verified evidence items. |
| `PresentationPolicies.ts` | Implements `evaluateChapterPace`, `matchChapterKeyPoints`, and `detectNextChapterTransition`. |
| `PresentationRuntime.ts` | Implements `PresentationRuntimePlugin` tracking live chapter durations, pace (`on_pace | slightly_fast | slightly_behind | overtime`), missed key points, active drift, Q&A records, and `toUniversalContextPack()`. |
| `PresentationReflection.ts` | Computes `computeUtilitySummary()` (`V = H - λI`), builds chronological `PresentationTimelineEvent[]`, generates `PresentationDiagnosis` + `PresentationWeakSegment[]` for single-point rehearsal, and emits pending opt-in `MemoryProposal[]`. |
