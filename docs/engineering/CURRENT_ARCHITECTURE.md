# Pre-Refactor System Architecture (`96cd742`)

> **[Historical Engineering Archive — Isolated from Active Product Docs]**  
> Status: Historical Snapshot of Commit `96cd742` (**历史单领域角色扮演原型 / 旧领域遗留模块** Prior to `refactor/universal-runtime-presentation`).  
> Legacy domain-specific scenario names and persona proper nouns are neutralized into generic engineering descriptors.

## 1. High-Level Runtime Topology at `96cd742`

```text
Browser (apps/web, Vite React + R3F 3D)
  ├── HomepageView / LiveTrainingView / ReviewView
  ├── AudioCapture (16kHz PCM16LE worklet) ──► WS /ws/session ──► WebSocketGateway
  ├── Legacy Vertical HUD (full/minimal/faded)                         │
  ├── CueEdgeLight (only active when level === 'minimal')              ▼
  └── Legacy 3D Avatar Canvas (mesh .glb + StreamAudioPlayer)       TurnController
                                                                       ├── TextOnlyAsr / LocalSherpaAsr / RemoteSherpaAsr
                                                                       ├── LlamaSystemOne (single-token 4-slot) / HeuristicSystemOne
                                                                       ├── Legacy Prefetch + PiSystemTwo (LineAgent / TurnAgent)
                                                                       ├── Legacy Domain Scenario Pack + 2 Persona Markdown Profiles
                                                                       └── Silent / LocalSherpa / Edge / Http Speech Output Modules
```

---

## 2. Package-by-Package Breakdown (`96cd742`)

### 2.1 Protocol (`packages/protocol/src/`)
- **`scenario.ts`**: Defined legacy single-domain roleplay brief (`product`, `audience`, `keyPoints`, `concerns`), legacy persona profile, `TrainingStats`, `OutcomeSummary`, `ReviewAnalysis`.
- **`jev.ts`**: Defined `SystemOneContext`, `SystemOneQuestionId`, `SystemOneVerdict`, `SystemOneOutcome`, `SystemOneSnapshot`.
- **`controller.ts`**: Defined legacy counterparty speech state, `FollowupTaskKind`, `FollowupCandidate`, `ConversationTurn`.
- **`events.ts`**: Defined legacy roleplay training WS events (`session.start` with persona ID / scaffolding level, `session.opening`, counterparty turn/audio/prefetch events, `scaffolding.changed`, `followup.candidate`, etc.).
- **`library.ts` & `piagent.ts`**: Defined `ExperienceItem`, `SynthesizedScenarioPack`, `PiAgentTrace`, `PiAgentToolCall`.
- **`audio.ts`**: Defined `AudioChunkPayload`, `AsrCorrection`, audio status, `AsrPartialEvent`, `AsrFinalEvent`.

### 2.2 Server (`apps/server/src/`)
1. **Entrypoint (`index.ts`, `config.ts`, `contracts.ts`)**:
   - Loaded the legacy single-domain pack directly, initialized `LibraryStore` / `LibraryApi` (`/api/experiences`, `/api/scenarios`), served static files + `/health` + `/briefing` + WS `/ws/session`.
   - `config.ts` defaulted `CUEX_SYSTEM1`, `CUEX_SYSTEM2`, `CUEX_ASR`, and audio synthesis env flags to `'fake'`, storing legacy persona profile/memory directories via `CUEX_AGENTS_DIR`.
2. **Gateway & Turn Controller (`gateway/WebSocketGateway.ts`, `controller/TurnController.ts`, legacy prefetch module)**:
   - `TurnController` (822 lines) orchestrated legacy single-domain roleplay dialogue turns rather than domain-agnostic real-time intervention.
   - `System 1` evaluated four hardcoded boolean/rule checkpoints (`c1`, `c2`, `c3`, `d1`) tailored to that single script.
   - Prefetch agent pre-generated opening, retry, and closing lines via `PiSystemTwo`; `TurnController` gated turn responses and follow-up checks.
3. **System 1 (`system1/LlamaSystemOne.ts`, `HeuristicSystemOne.ts`, legacy regex helper, `autotrust-jev9b.json`, `probabilities.ts`)**:
   - Formatted prompts `[kind] noul\n[state] ... \n[question] ...` sent to `/completion` with `n_predict: 1`, JSON/verbalizer grammar, `cache_prompt: true`, `post_sampling_probs: true`, LoRA `scale: 1`, and calibrated token probabilities (`true`/`false`).
   - Truncated spoken context (`recentSpeech.slice(-80)` / turn-specific 120-char slice).
   - **Documented KV Constraint (`system1/EVAL.md:49`)**: Cross-slot prefix sharing did not work on `llama.cpp` generic `/completion` (`--kv-unified` pooled storage without sharing computed recurrent prefix state across requests/slots).
   - `HeuristicSystemOne.ts` and legacy helper rules relied on hardcoded Chinese keyword/quantity regexes tied strictly to the pre-refactor script.
4. **System 2 (`system2/PiSystemTwo.ts`, legacy turn/line agents, persona loader, `config.ts`, `numbers.ts`, `spoken.ts`)**:
   - Used `@earendil-works/pi-agent-core@1.4.0` + `@earendil-works/pi-ai@1.4.0` (`openai-completions` and `anthropic-messages`) with `redact()` credential masking and `numbersIn()` numerical grounding guard in follow-up preparation.
   - Persona loader read Markdown `PROFILE.md` / `MEMORY.md` files and automatically appended unconfirmed session memory lines after every session without user confirmation.
5. **Voice & Library (`voice/`, `library/`)**:
   - `voice/` implemented working `LocalSherpaAsr` (`sherpa-onnx-node`), `RemoteSherpaAsr` (remote WS streaming), `TextOnlyAsr`, plus 4 audio synthesis adapters (legacy output path incompatible with CueX Presentation).
   - `library/` stored `experiences` and synthesized domain variants of the single legacy pack via `ScenarioSynthesizer`.

### 2.3 Web Client (`apps/web/src/`)
- **Views**: `HomepageView.tsx`, `LiveTrainingView.tsx`, `ReviewView.tsx`, plus standalone `stage/` previews (`BriefingPanel.tsx`, legacy turn panel, `ReviewPanel.tsx`).
- **3D & HUD**: Legacy R3F canvas + head-mesh component rendered `.glb` avatar meshes with HDR env lighting and synchronized audio lip/head motion; legacy scaffolding HUD toggled `full`, `minimal`, and `faded` hints; `CueEdgeLight.tsx` animated edge cues ONLY during `'minimal'` mode (`quiet | drift | focus | resolved`).
- **Drivers**: `ReplayDriver.ts` (static 68-second scripted replay) alongside `LiveWSDriver.ts` (live WebSocket client to `/ws/session`).

---

## 3. Structural Deficiencies Motivating Refactor

1. **Tight Domain Coupling**: Scenario logic, prompts, states, UI HUDs, 3D avatar meshes, and ASR hotword corrections were all hardcoded to one legacy single-domain roleplay scenario.
2. **Missing Intervention Controller Layer**: Decision timing, TTL expiry, context version invalidation, multi-signal hesitation vs. intentional pause separation, and explicit suppression/withdrawal policies were intertwined with turn-taking dialogue responses instead of forming a standalone gated `InterventionController`.
3. **Simulated/Misaligned Commercial Story**: Pre-refactor HKS submission decks described CueX Presentation and Universal Runtime features that did not exist in the `96cd742` repository.
4. **Uncontrolled Memory Persistence**: Legacy persona loader persisted Markdown memory entries silently without user review, explicit scope, or delete controls.
5. **Heavy Unneeded Assets**: 3D head mesh GLB files, `three` scene infrastructure, and dual conflicting `ppt/` HKS tracks bloated the workspace while obscuring CueX's core low-interference cognitive interface.
