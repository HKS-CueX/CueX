# CueX Architecture Overview (Universal Cognitive Runtime + Presentation Wedge)

> **Version Scope**: CueX Phase 3 (`@cuex/protocol` v2.1.0, `API_VERSION = '2026-11'`, `WS_PROTOCOL_VERSION = '2.0'`)  
> **Core Principle**: Domain-agnostic real-time **Universal Cognitive Runtime** (`apps/server/src/runtime/`) strictly decoupled from vertical **Scenario Plugins** (`apps/server/src/scenarios/`), backed by unified LLM routing (`CpaProviderAdapter`), GPU streaming ASR (`ColabAsrProvider`), SQLite WAL persistence, and a Warm Paper Daylight Web UI (`apps/web/`).

---

## 1. End-to-End System Topology

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Web Client (apps/web/src/) — Warm Paper Daylight (#F8F7F3) & Ledger UI     │
│  HomeView │ CompilerView │ StageView (Focus / Split Strip / Inspector)     │
│  ReflectionView │ AccountPanel │ MemoryInspectorPanel │ CueEdgeLight       │
│  AudioCapture (16kHz PCM16LE Worklet) + BrowserSpeechRecognizer + WSClient │
└───────────────────────────────▲───────────────────────┬────────────────────┘
                                │ REST (/api/*,/health) │ WSS/WS (/ws)
┌───────────────────────────────┴───────────────────────▼────────────────────┐
│ Gateway, Auth & Security Layer (apps/server/src/gateway/GatewayServer.ts)  │
│  AuthService (SHA-256 bearer) │ OriginGuard │ RateLimiter │ PromptGuard    │
│  PipelineTracker (serverSeq + idempotencyKey) │ MetricsCollector           │
├────────────────────────────────────────────────────────────────────────────┤
│ Persistence & Billing (apps/server/src/{storage,commercial}/)              │
│  SqliteRepository (node:sqlite WAL, .cuex-runtime/cuex.db)                 │
│  UsageLedger │ Entitlements (Free/Event/Pro; Team=Planned) │ SandboxPay    │
├────────────────────────────────────────────────────────────────────────────┤
│ Scenario Adapter Registry (apps/server/src/scenarios/)                     │
│  'presentation' = Implemented │ 'social'|'teaching'|'sales'|'custom'=Road  │
│  DocumentExtractor (bounded .pptx/.pdf/.md/.txt) │ PresentationCompiler    │
│  PresentationRuntimePlugin │ Reflection │ Weak-Segment Rehearsal           │
├────────────────────────────────────────────────────────────────────────────┤
│ Universal Cognitive Runtime (apps/server/src/runtime/)                     │
│  CognitiveRuntimeSession │ ContextStore (Evidence v2) │ CognitiveEventBus  │
│  SharedCognitiveStateStore │ LexicalBm25RetrievalProvider │ MemoryStore    │
│  InterventionController (L0–L3, 11 gates, 7 auto-withdrawal transitions)   │
├─────────────────────────────────┬──────────────────────────────────────────┤
│ Unified LLM Gateway (CPA)       │ Real-Time ASR Subsystem (voice/)         │
│  CpaProviderAdapter (CpaClient) │  ColabAsrProvider (wss/https :10086)     │
│   ├─ CpaFastDecisionProvider    │   -> Colab G4 RTX PRO 6000 Blackwell     │
│   ├─ CpaSlowReasoningProvider   │   -> FunAudioLLM/SenseVoiceSmall + VAD   │
│   ├─ enhanceCompiledPackWithCpa │  RemoteSherpaAsr / LocalSherpaAsr        │
│   └─ enhanceReflectionWithCpa   │  TextOnlyAsr (Web Speech / text_sim)     │
│  ProviderResilience (retry/CB)  │  7-State ColabAsrLifecycleState tracking │
│  Fallback -> local_rule_zero    │  Sample-scoped corrections.ts            │
└─────────────────────────────────┴──────────────────────────────────────────┘
```

*(Modular Boundary Check: `apps/server/src/runtime/` holds zero imports from `apps/server/src/scenarios/presentation/`.)*

---

## 2. Core Architectural Subsystems

### 2.1 `@cuex/protocol` v2.1.0 ([packages/protocol/](../packages/protocol/))
Shared schema, versioning, OpenAPI ([`openapi.yaml`](./api/openapi.yaml)), and AsyncAPI ([`asyncapi.yaml`](./api/asyncapi.yaml)) source of truth:
- **ASR Capability & Lifecycle**: `AsrBackendMode` (`'colab_gpu' | 'local_sherpa' | 'remote_sherpa' | 'browser_webspeech' | 'text_simulation'`) and 7-state `ColabAsrLifecycleState` (`'not_configured' | 'starting' | 'ready' | 'degraded' | 'disconnected' | 'restarting' | 'unavailable'`) carrying `gpuName`, `modelId`, `rtf`, `lastHealthCheckAt`, `fallbackActive`, and `fallbackReason`.
- **Honest Telemetry Accounting**: `TelemetryUsageSource` (`'provider_reported' | 'provider_unreported' | 'local_rule_zero' | 'estimated'`), `ProviderUsageRecord` (`inputTokens`, `outputTokens`, `cachedInputTokens`, `reasoningTokens`, `correlationId`), and tier breakdowns (`asr | system1 | system2 | compiler | reflection | retrieval`).
- **Interventions & Grounding**: `InterventionLevel` (`L0–L3`), `WithdrawalReason` (`7` typed transitions), and `Evidence` v2 (`sourceType`, `locationRef`, `contentHash`, `userConfirmed`, `verified`, `locked`, `lifecycle`).

### 2.2 Speech Intake & Colab GPU ASR ([`apps/server/src/voice/`](../apps/server/src/voice/index.ts), [`infra/colab/README.md`](../infra/colab/README.md))
- **`createAsrEngine()` Selection**:
  - `CUEX_ASR=fake` -> `TextOnlyAsr` (Browser `SpeechRecognition` or `speech.delta` text mode).
  - `CUEX_ASR=real` -> priority order: `ColabAsrProvider` (`CUEX_COLAB_ASR_URL` / `COLAB_ASR_URL`) -> `RemoteSherpaAsr` (`CUEX_ASR_URL`) -> `LocalSherpaAsr` (`CUEX_ASR_MODEL_DIR`).
- **`ColabAsrProvider` (`asr-colab.ts`)**:
  - Streams 16 kHz mono PCM16LE audio over Bearer-authenticated TLS WebSocket (`/v1/asr/stream`) and batch HTTPS (`/v1/asr/transcribe`), pinning the self-signed SAN certificate (`.cuex-runtime/colab-asr-cert.pem`), closing stale keep-alive sockets (`agent: false`, `Connection: 'close'`), and exposing `AsrStream.flush()` (`{"type":"flush"}`).
  - Tracks live 7-state health (`ready`, `degraded`, `restarting`, `unavailable`, etc.) with `fallbackActive: true` reported honestly on `GET /health`, `session.ready`, and `asr.status` whenever unreachable.
  - **Strict Separation Guarantee**: Colab hosts GPU ASR inference (`FunAudioLLM/SenseVoiceSmall` + `fsmn-vad`) **only** with zero raw audio persisted on disk; all cognitive reasoning runs exclusively on CueX's Node runtime server.

### 2.3 Unified CPA LLM Gateway & Dual-Process Cognitive Loop ([`CpaProviderAdapter.ts`](../apps/server/src/runtime/providers/CpaProviderAdapter.ts))
- **`CpaClient` & `ProviderResilience`**: Single external LLM client supporting `/v1/responses` and `/v1/chat/completions` (`CpaApiMode`: `'responses' | 'chat_completions' | 'auto'`), SSE `completeStreamText()`, non-retryable `4xx` fast-fail (`CpaHttpError`), bounded retry/circuit-breaker (`ProviderResilience`), secret redaction, explicit reasoning-token output budgets (`MIN_CPA_OUTPUT_TOKENS = 1024`, default `4096`), and `'provider_unreported'` attribution whenever upstream usage headers/fields are absent.
- **System 1 (`FastDecisionProvider`)**: `CpaFastDecisionProvider` (default `gemini-4-hydrogen` with `reasoningEffort: 'low'`) fuses fast intent/state features (`isPresenterGreetingText()` & omission/drift/question cues) and wraps cleanly in `FallbackFastDecisionProvider` -> `HeuristicFastDecisionProvider` (`local_rule_zero`).
- **System 2 (`SlowReasoningProvider`) & Grounding**: `LexicalBm25RetrievalProvider` retrieves active `verified` `Evidence[]` locally (`0` tokens). `CpaSlowReasoningProvider` synthesizes concise `L1–L3` cues citing verified `evidenceIds[]` or returns an explicit `missing_evidence_notice` (`grounded: false`) when evidence is absent; wraps in `FallbackSlowReasoningProvider` -> `LocalSlowReasoningProvider` (`local_rule_zero`).
- **Async Candidate Timing Guard**: `CognitiveRuntimeSession.reanchorCandidateLifetime()` shifts newly synthesized `Candidate` TTL forward by async System 2 inference latency so multi-second LLM calls do not expire immediately upon emission while keeping deterministic `ManualClock` unit tests invariant (`0 ms` shift).
- **Compiler & Reflection Enhancement**: `enhanceCompiledPackWithCpa()` and `enhanceReflectionWithCpa()` enrich pre-stage packs and post-stage summaries under strict unseen-number guards (`numbersIn()` validation) without overwriting `locked: true` facts or deterministic `V = H - λI` counts.

### 2.4 Independent `InterventionController`, Persistence & Frontend Client
- **11 Gates & 7 Auto-Withdrawals**: Every System 2 candidate enters as `pending`, must pass `L0–L3` ceilings, cooldowns, suppression windows, non-pause-only gating (`pause_only_without_gap`), `contextVersion` checks, and `verifyCandidateGrounding()`, and automatically withdraws on `user_recovered`, `topic_changed`, `chapter_changed`, `context_invalidated`, `candidate_expired`, `user_dismissed`, or `superseded`.
- **SQLite Persistence & Sovereignty**: `SqliteRepository` (`node:sqlite` WAL) enforces per-`userId` ownership isolation across sessions, packs, opt-in `userConfirmed === true` memories, `usage_ledger`, JSON/Markdown exports (`GET /api/account/export`), and wipe receipts (`DELETE /api/account/data` / `session.wipe`).
- **Web UI (`apps/web/`, [`DESIGN_SYSTEM.md`](./design/DESIGN_SYSTEM.md))**: Dual-surface architecture separating `HomeView` (`editorial-report`) from operational ledgers (`CompilerView`, `StageView`, `ReflectionView`, `AccountPanel`, `MemoryInspectorPanel`) on Warm Paper (`#F8F7F3`) with WCAG AA contrast (`--amber-ink #A84B07` at `5.72:1`), `0ms` keyboard stage controls (`Space/M/H/Esc`), `@media (prefers-reduced-motion: reduce)` (`0.001s`), and scoped `/fonts` + `/brand` asset serving (`vite.config.ts`).

---

## 3. Deep-Dive Architecture Documentation

| Document | Focus |
| --- | --- |
| [`architecture/UNIVERSAL_RUNTIME.md`](./architecture/UNIVERSAL_RUNTIME.md) | Event bus, `ContextStore`, `SharedCognitiveStateStore`, SQLite storage, and decoupling boundaries |
| [`architecture/SYSTEM_1_SYSTEM_2.md`](./architecture/SYSTEM_1_SYSTEM_2.md) | Dual-process cooperation loop, BM25 retrieval, fallback hierarchy, and KV/latency telemetry honesty |
| [`architecture/INTERVENTION_CONTROLLER.md`](./architecture/INTERVENTION_CONTROLLER.md) | `L0–L3` escalation state machine, multi-signal gating, and 7 automatic withdrawal transitions |
| [`architecture/DATA_MODEL.md`](./architecture/DATA_MODEL.md) | Entity schemas, `Evidence` v2 provenance, and SQLite relational tables |
| [`architecture/SCENARIO_ADAPTER.md`](./architecture/SCENARIO_ADAPTER.md) | `ScenarioRuntimePlugin` SPI (`presentation` live vs `social/teaching/sales/custom` roadmap) |
| [`design/DESIGN_SYSTEM.md`](./design/DESIGN_SYSTEM.md) | Color/type/motion tokens, dual surface discipline, and WCAG AA compliance rules |
| [`security/SECURITY_MODEL.md`](./security/SECURITY_MODEL.md) | Auth isolation, ZIP-bomb/PDF bounds, PromptGuard untrusted wrapping, and webhook checks |
| [`phase3/REAL_WORLD_VALIDATION_REPORT.md`](./phase3/REAL_WORLD_VALIDATION_REPORT.md) | Verified Colab GPU ASR, live CPA LLM, 14-scenario E2E, and 6-viewport UI/a11y results |
