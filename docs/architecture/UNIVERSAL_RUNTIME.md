# Universal Cognitive Runtime Architecture

> Package & Module Boundary: `@cuex/protocol` (`packages/protocol/src/`) + `apps/server/src/runtime/`  
> First Implemented Scenario Plugin: `apps/server/src/scenarios/presentation/` (`CueX Presentation`)

## 1. Architectural Layering

CueX strictly decouples domain-agnostic cognitive orchestration (`apps/server/src/runtime/`) from vertical scenario adapters (`apps/server/src/scenarios/`):

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Web Client (apps/web/src/) — Warm-Light CueX Editorial UI               │
│  HomeView │ CompilerView │ StageView (Focus / Inspector) │ Reflection   │
└───────────────────────────────▲───────────────────────┬─────────────────┘
                                │ REST (/api/*,/health) │ WS (/ws, /ws/session)
┌───────────────────────────────┴───────────────────────▼─────────────────┐
│ Gateway Layer (apps/server/src/gateway/GatewayServer.ts)                │
│  CueXGatewayServer + healthProbe.ts                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ Scenario Adapter Layer (apps/server/src/scenarios/)                     │
│  ScenarioRegistry (`presentation`=implemented; others=roadmap)          │
│  Presentation: DocumentExtractor │ PresentationCompiler │ PackStore     │
│                PresentationRuntimePlugin │ Policies │ Reflection        │
├─────────────────────────────────────────────────────────────────────────┤
│ Universal Cognitive Runtime (apps/server/src/runtime/)                  │
│  ├── CognitiveRuntimeSession (CognitiveRuntime.ts)                      │
│  ├── ContextStore (ContextStore.ts)                                     │
│  ├── CognitiveEventBus (EventBus.ts)                                    │
│  ├── SharedCognitiveStateStore (SharedCognitiveStateStore.ts)           │
│  ├── FastDecisionAdapter / SlowReasoningAdapter / LexicalBm25Retrieval  │
│  ├── InterventionController (InterventionController.ts)                 │
│  └── MemoryStore (MemoryStore.ts — opt-in userConfirmed === true)       │
└─────────────────────────────────────────────────────────────────────────┘
```

*(Decoupling check: `apps/server/src/runtime/` contains zero imports from `scenarios/presentation/`.)*

---

## 2. Core Universal Runtime Subsystems (`apps/server/src/runtime/`)

### 2.1 `CognitiveRuntimeSession` (`CognitiveRuntime.ts`)
- Coordinates active session lifecycle (`initializing` -> `active` / `paused` -> `ended` / `wiped`), binds `ScenarioRuntimePlugin`, and cancels superseded in-flight reasoning via `AbortController` whenever newer finalized speech arrives (`ingestSpeech`).
- Evaluates withdrawal rules *before* waking System 2 when recovery or chapter transitions occur.

### 2.2 `ContextStore` (`ContextStore.ts`)
- Holds active `TaskContext`, bound `ContextPack`, `Evidence[]`, real-time `Observation[]`, and `TranscriptSegment[]`.
- Enforces provenance (`source`, `sourceType`), verification flags (`userConfirmed`, `verified`, `locked`), `lifecycle` (`draft | active | superseded | archived | revoked`), `scope`, and `privacyLevel`.
- Automatically ingests scenario/universal confirmed `MemoryItem` records whose `category === 'fact'` as verified active `Evidence` (`mem_ev_<memoryId>`).

### 2.3 `CognitiveEventBus` (`EventBus.ts`)
- Event-driven dispatch over typed `CognitiveEvent` payloads (`session.lifecycle`, `speech.partial`, `speech.final`, `silence.tick`, `chapter.change`, `question.detected`, `omission.detected`, `drift.detected`, `recovery.detected`, `user.manual_help`, `user.dismiss_hint`, `user.feedback`, `user.mode_change`, `candidate.prepared`, `intervention.shown`, `intervention.withdrawn`, `context.updated`).
- Avoids periodic blind full-history LLM polling; System 1/Retrieval/System 2 execute only when concrete transcript/state signals arrive.

### 2.4 `SharedCognitiveStateStore` (`SharedCognitiveStateStore.ts`)
- Atomic truth store maintaining:
  - Monotonic `contextVersion` (`bumpContextVersion`)
  - `activeGoal`, `activeChapterId`, `activeChapterTitle`, `constraints[]`
  - `attentionSignal` & `openGapLabels[]`
  - Active `Intervention` & pending/historical `Candidate` map
  - `cooldownUntilMs` and keyed `SuppressionEntry[]`
  - Per-tier cumulative `TelemetryUsage` (`asr`, `system1`, `system2`, `compiler`, `reflection`, `retrieval`).

### 2.5 `LexicalBm25RetrievalProvider` (`RetrievalProvider.ts`)
- Bilingual CJK bigram + Latin/numeric tokenizer (`tokenizeBilingual`, `computeTermOverlap`) plus BM25 scoring over `verified && lifecycle === 'active'` `Evidence[]`, supporting an optional pluggable `EmbeddingScorer` fusion hook.
- Also exposes `verifyCandidateGrounding()` to verify numeric claims against cited `Evidence` and check `forbiddenClaims[]`.

### 2.6 `InterventionController` (`InterventionController.ts`)
- Dedicated policy gatekeeper sitting strictly between System 2 candidate creation and client delivery; enforces `L0–L3`, ceilings, cooldowns, suppressions, TTL expiry, `contextVersion` matching, evidence grounding, non-pause-only triggers, and all 7 `WithdrawalReason` transitions. (See [INTERVENTION_CONTROLLER.md](./INTERVENTION_CONTROLLER.md).)

### 2.7 `MemoryStore` (`MemoryStore.ts`)
- Persists user-confirmed memory to `<runtimeDir>/memory/items.json` (`CUEX_MEMORY_DIR` override) via atomic temp-file writes.
- Rejects any creation request unless `userConfirmed === true`. Supports filtered `list()`, `getConfirmedForScenario()`, `patch()`, individual `delete()`, and full session wipe (`wipeSession`).

### 2.8 Voice & ASR Layer (`apps/server/src/voice/`)
- Exposes `LocalSherpaAsr` (`sherpa-onnx-node`), `RemoteSherpaAsr` (`ws://` Sherpa streaming), and `TextOnlyAsr` (`CUEX_ASR=fake`).
- Always publishes truthful `AsrCapabilityStatus` via `/health`, `session.ready`, and `asr.status`. When `TextOnlyAsr` is active, binary `audio.chunk` frames return `ASR_TEXT_ONLY` while Browser Web Speech (`source: 'browser_webspeech'`) and text simulation (`source: 'text_simulation'`) stream over WS `speech.delta` with non-medical `SAMPLE_ASR_CORRECTIONS` normalization (`correctAsrText`).
