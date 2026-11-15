# Pre-Refactor System Architecture (`96cd742`)

> Status: Historical Snapshot of Commit `96cd742` (Medical Sales-Rep Visit Trainer Prior to P1–P3 Refactor)

## 1. High-Level Runtime Topology at `96cd742`

```text
Browser (apps/web, Vite React + R3F 3D)
  ├── HomepageView / LiveTrainingView / ReviewView
  ├── AudioCapture (16kHz PCM16LE worklet) ──► WS /ws/session ──► WebSocketGateway
  ├── ClinicalScaffoldingHUD (full/minimal/faded)                        │
  ├── CueEdgeLight (only active when level === 'minimal')                ▼
  └── DoctorCanvas + DoctorBust (facecap.glb 3D + StreamAudioPlayer)   TurnController
                                                                         ├── TextOnlyAsr / LocalSherpaAsr / RemoteSherpaAsr
                                                                         ├── LlamaSystemOne (single-token medical q/a) / HeuristicSystemOne
                                                                         ├── DoctorLinePrefetch + PiSystemTwo (DoctorLineAgent / DoctorTurnAgent)
                                                                         ├── ANSHU_PACK + agents/doctors/{dr-chen,dr-li}/{PROFILE,MEMORY}.md
                                                                         └── SilentTts / LocalSherpaTts / EdgeTts / HttpTts (Ming)
```

---

## 2. Package-by-Package Breakdown (`96cd742`)

### 2.1 Protocol (`packages/protocol/src/`)
- **`scenario.ts`**: Defined medical `ScenarioBrief` (`product`, `audience`, `keyPoints`, `concerns`), `DoctorProfile` (`dr-chen` / `dr-li`), `TrainingStats`, `OutcomeSummary`, `ReviewAnalysis`.
- **`jev.ts`**: Defined `SystemOneContext`, `SystemOneQuestionId`, `SystemOneVerdict`, `SystemOneOutcome`, `SystemOneSnapshot`.
- **`controller.ts`**: Defined `DoctorSpeechState`, `FollowupTaskKind`, `FollowupCandidate`, `ConversationTurn`.
- **`events.ts`**: Defined clinical training WS events (`session.start` with `doctorId` / `scaffoldingLevel`, `session.opening`, `doctor.turn`, `doctor.audio`, `doctor.prefetch`, `scaffolding.changed`, `followup.candidate`, etc.).
- **`library.ts` & `piagent.ts`**: Defined `ExperienceItem`, `SynthesizedScenarioPack`, `PiAgentTrace`, `PiAgentToolCall`.
- **`audio.ts`**: Defined `AudioChunkPayload`, `AsrCorrection`, `TtsStatus`, `AsrPartialEvent`, `AsrFinalEvent`.

### 2.2 Server (`apps/server/src/`)
1. **Entrypoint (`index.ts`, `config.ts`, `contracts.ts`)**:
   - Loaded `ANSHU_PACK` directly (`scenario/anshu.ts`), initialized `LibraryStore` / `LibraryApi` (`/api/experiences`, `/api/scenarios`), served static files + `/health` + `/briefing` + WS `/ws/session`.
   - `config.ts` defaulted `CUEX_SYSTEM1`, `CUEX_SYSTEM2`, `CUEX_ASR`, and `CUEX_TTS` to `'fake'`, storing doctor profiles/memories in `CUEX_AGENTS_DIR` (`apps/server/agents/doctors` by default).
2. **Gateway & Turn Controller (`gateway/WebSocketGateway.ts`, `controller/TurnController.ts`, `controller/DoctorLinePrefetch.ts`)**:
   - `TurnController` (822 lines) orchestrated medical detailing visits rather than domain-agnostic real-time intervention.
   - `System 1` evaluated whether the rep was addressing `c1` (elderly starting dose), `c2` (eGFR 30–60 cohort), `c3` (eGFR < 30 restriction), or `d1` (unplanned product pitch).
   - `DoctorLinePrefetch` pre-generated doctor opening, retry, and closing lines via `DoctorLineAgent`; `TurnController` gated `DoctorTurnAgent` responses and `prepareFollowup` checks.
3. **System 1 (`system1/LlamaSystemOne.ts`, `HeuristicSystemOne.ts`, `dose.ts`, `autotrust-jev9b.json`, `probabilities.ts`)**:
   - Formatted prompts `[kind] noul\n[state] ... \n[question] ...` sent to `/completion` with `n_predict: 1`, JSON/verbalizer grammar, `cache_prompt: true`, `post_sampling_probs: true`, LoRA `scale: 1`, and calibrated token probabilities (`true`/`false`).
   - Truncated spoken context (`repSpeechSinceConcern.slice(-120)`, `recentSpeech.slice(-80)`).
   - **Documented KV Constraint (`system1/EVAL.md:49`)**: Cross-slot prefix sharing did not work on llama.cpp generic `/completion` (`--kv-unified` pooled storage without sharing computed recurrent prefix state across requests/slots).
   - `HeuristicSystemOne.ts` and `dose.ts` relied on Chinese regexes targeting `"75岁"`, `"2.5mg"`, `"eGFR 30到60"`, `"412"`, `"eGFR低于30"`, `"不建议"`.
4. **System 2 (`system2/PiSystemTwo.ts`, `DoctorTurnAgent.ts`, `DoctorLineAgent.ts`, `doctors.ts`, `config.ts`, `numbers.ts`, `spoken.ts`)**:
   - Used `@earendil-works/pi-agent-core@1.4.0` + `@earendil-works/pi-ai@1.4.0` (`openai-completions` and `anthropic-messages`) with `redact()` credential masking and `numbersIn()` numerical grounding guard in `prepareFollowup`.
   - `doctors.ts` loaded Markdown `PROFILE.md` and `MEMORY.md` files and automatically appended visit memory lines after every session without user confirmation.
5. **Voice & Library (`voice/`, `library/`)**:
   - `voice/` implemented working `LocalSherpaAsr` (`sherpa-onnx-node`), `RemoteSherpaAsr` (remote WS streaming), `TextOnlyAsr`, plus 4 TTS backends (`SilentTts`, `LocalSherpaTts`, `EdgeTts`, `HttpTts`).
   - `library/` stored rep `experiences` and synthesized variants of `ANSHU_PACK` via `ScenarioSynthesizer`.

### 2.3 Web Client (`apps/web/src/`)
- **Views**: `HomepageView.tsx`, `LiveTrainingView.tsx`, `ReviewView.tsx`, plus standalone `stage/` previews (`BriefingPanel.tsx`, `VisitPanel.tsx`, `ReviewPanel.tsx`).
- **3D & HUD**: `r3f/DoctorCanvas.tsx` + `DoctorBust.tsx` rendered `assets/models/facecap.glb` / `facecap-notex.glb` with HDR env lighting and synchronized audio lip/head motion; `ClinicalScaffoldingHUD.tsx` toggled `full`, `minimal`, and `faded` HUD hints; `CueEdgeLight.tsx` animated edge cues ONLY during `'minimal'` mode (`quiet | drift | focus | resolved`).
- **Drivers**: `ReplayDriver.ts` (static 68-second scripted replay from `lib/scenario.ts`) alongside `LiveWSDriver.ts` (live WebSocket client to `/ws/session`).

---

## 3. Structural Deficiencies Motivating Refactor

1. **Tight Domain Coupling**: Scenario logic, prompts, states, UI HUDs, 3D doctor busts, and ASR corrections were all hardcoded to one pharmaceutical drug-detailing scenario.
2. **Missing Intervention Controller Layer**: Decision timing, TTL expiry, context version invalidation, multi-signal hesitation vs. intentional pause separation, and explicit suppression/withdrawal policies were intertwined with turn-taking doctor responses instead of forming a standalone gated `InterventionController`.
3. **Simulated/Misaligned Commercial Story**: HKS submission decks described CueX Presentation and Universal Runtime features that did not exist in the `96cd742` repository.
4. **Uncontrolled Memory Persistence**: `doctors.ts` persisted `MEMORY.md` entries silently without user review, explicit scope, or delete controls.
5. **Heavy Unneeded Assets**: 3D doctor bust GLB files, `three` scene infrastructure for doctor faces, and dual conflicting `ppt/` HKS tracks bloated the workspace while obscuring CueX's core low-interference cognitive interface.
