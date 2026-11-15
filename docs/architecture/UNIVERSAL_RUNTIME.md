# Universal Cognitive Runtime Architecture

> Package & Module Boundary: `@cuex/protocol` v2 (`packages/protocol/src/`) + `apps/server/src/runtime/` + Stage B `storage/` & `billing/` ([ADR-001](../engineering/DECISIONS/ADR-001-modular-monolith-and-sqlite-repository.md))  
> First Implemented Scenario Plugin: `apps/server/src/scenarios/presentation/` (`CueX Presentation`)

## 1. Architectural Layering

CueX strictly decouples domain-agnostic cognitive orchestration (`apps/server/src/runtime/`) from vertical scenario adapters (`apps/server/src/scenarios/`):

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Web Client (apps/web/src/) — Warm-Light CueX Editorial UI               │
│  HomeView │ CompilerView │ StageView (Focus / Inspector) │ Reflection   │
└───────────────────────────────▲───────────────────────┬─────────────────┘
                                │ REST (/api/*,/health) │ WS (/ws)
┌───────────────────────────────┴───────────────────────▼─────────────────┐
│ Gateway & Auth Layer (apps/server/src/gateway/GatewayServer.ts)         │
│  AuthService │ RateLimiter │ OriginGuard │ Validate* │ OpenAPI/AsyncAPI │
├─────────────────────────────────────────────────────────────────────────┤
│ Persistence, Pipeline & Commercial (storage/, pipeline/, commercial/)    │
│  SqliteStorageRepository (cuex.db WAL) │ PipelineTracker │ Commercial   │
├─────────────────────────────────────────────────────────────────────────┤
│ Scenario Adapter Layer (apps/server/src/scenarios/)                     │
│  ScenarioRegistry (`presentation`=implemented; others=roadmap)          │
│  Presentation: DocumentExtractor (bounded) │ Compiler │ PackStore       │
│                PresentationRuntimePlugin │ Policies │ Reflection        │
├─────────────────────────────────────────────────────────────────────────┤
│ Universal Cognitive Runtime (apps/server/src/runtime/)                  │
│  ├── CognitiveRuntimeSession (CognitiveRuntime.ts)                      │
│  ├── ContextStore (ContextStore.ts)                                     │
│  ├── CognitiveEventBus (EventBus.ts — EventEnvelope<TPayload>)          │
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
- Holds active `TaskContext`, bound `ContextPack`, `Evidence[]` (`EVIDENCE_SCHEMA_VERSION = 2`), real-time `Observation[]`, and `TranscriptSegment[]`.
- Enforces provenance (`source`, `sourceType`, `sourceDocumentId`, `contentHash`, `locationRef`), verification flags (`userConfirmed`, `verified`, `locked`), `lifecycle` (`draft | active | superseded | archived | revoked`), `scope`, and `privacyLevel`.
- Automatically ingests scenario/universal confirmed `MemoryItem` records whose `category === 'fact'` as verified active `Evidence` (`mem_ev_<memoryId>`).

### 2.3 `CognitiveEventBus` (`EventBus.ts`)
- Event-driven dispatch over typed `EventEnvelope<TPayload>` payloads (`CloudEvents 1.0.2`-inspired correlation, causation, `UtcIso8601` `occurredAt`, `privacyClass`, and `idempotencyKey`; see [EVENT_CATALOG.md](../data/EVENT_CATALOG.md)).
- Avoids periodic blind full-history LLM polling; System 1/Retrieval/System 2 execute only when concrete transcript/state signals arrive.

### 2.4 `SharedCognitiveStateStore` (`SharedCognitiveStateStore.ts`)
- Atomic truth store maintaining monotonic `contextVersion`, `activeGoal`, `activeChapterId`, `constraints[]`, `attentionSignal`, `openGapLabels[]`, active `Intervention`, pending `Candidate` map, `cooldownUntilMs`, `SuppressionEntry[]`, and per-tier `TelemetryUsage` (`usageSource`, tokens, cache, latency, `costFen`).

### 2.5 `LexicalBm25RetrievalProvider` (`RetrievalProvider.ts`)
- Bilingual CJK bigram + Latin/numeric tokenizer (`tokenizeBilingual`, `computeTermOverlap`) plus BM25 scoring over `verified && lifecycle === 'active'` `Evidence[]`, supporting an optional pluggable `EmbeddingScorer` fusion hook.
- Also exposes `verifyCandidateGrounding()` to verify numeric claims against cited `Evidence` and check `forbiddenClaims[]`.

### 2.6 `InterventionController` (`InterventionController.ts`)
- Dedicated policy gatekeeper sitting strictly between System 2 candidate creation and client delivery; enforces `L0–L3`, ceilings, cooldowns, suppressions, TTL expiry, `contextVersion` matching, evidence grounding, non-pause-only triggers, and all 7 `WithdrawalReason` transitions. (See [INTERVENTION_CONTROLLER.md](./INTERVENTION_CONTROLLER.md).)

### 2.7 `StorageRepository`, `MemoryStore` & Data Sovereignty (`ADR-001`, `ADR-003`)
- Persists user accounts, tokens (`auth_tokens`), packs (`presentation_packs`), sessions, events (`session_events`), reflections (`session_reflections`), memories (`memories`), entitlements, usage ledger (`usage_ledger`), and billing audits (`billing_audit_log`) inside **`SqliteStorageRepository` (`node:sqlite` WAL, `.cuex-runtime/cuex.db`)** scoped by owning `userId`.
- Rejects any memory write unless `userConfirmed === true`. Supports filtered list, patch, delete, scoped `session.wipe` / `DELETE /api/account/data` (`DataDeletionReceipt`), and JSON/Markdown export (`GET /api/account/export`).

### 2.8 Voice & ASR Layer (`apps/server/src/voice/`)
- Exposes `LocalSherpaAsr`, `RemoteSherpaAsr`, and `TextOnlyAsr`, paired with browser `AudioCapture` / `BrowserSpeechRecognizer` and text simulation (and `ADR-004` retirement of dead speech-synthesis modules).
- Always publishes truthful `AsrCapabilityStatus` via `/health`, `session.ready`, and `asr.status`. Sample pack hotword corrections apply only when running the sample pack (`RISK-09`).
