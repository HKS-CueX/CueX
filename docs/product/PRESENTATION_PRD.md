# CueX Presentation — Product Requirements Document (PRD)

> Status: Live First Wedge (`ScenarioId = 'presentation'`, `status: 'implemented'`) | Phase 2 Target (`API_VERSION = '2026-11'`, `WS_PROTOCOL_VERSION = '2.0'`)  
> Target Users: Founders / OPC principals pitching (`pitch`), thesis/project defense speakers (`defense`), researchers (`academic`), keynote speakers (`keynote`), and general presenters (`general`).

## 1. Product Scope & Non-Goals

### In Scope (`[Phase 2 已实现]`)
1. **Pre-Stage Context Compiler (`CompilerView`)**: Upload `.pptx`, `.pdf`, `.md`, `.txt` or paste notes; extract structured text transparently with bounded decompression security (`parsed | unreadable | rejected`); compile a **Cue Sheet**, an editable/lockable **Fact Whitelist**, AI-predicted **Q&A Cards** (explicitly tagged `isPrediction: true`), and chapter **Progress Structure**; provide a built-in CueX sample presentation pack (`pack_cuex_demo_01`) for immediate live testing.
2. **During-Stage Live Copilot (`StageView`)**: Multi-view live execution supporting **Rehearsal (`rehearsal`)** and **Live (`live`)** modes across **Focus (`focus`)**, compact **Split Strip** narrow strip layout, and **Inspector (`inspector`)** views, driven by progressive `L0–L3` intervention gating, automatic withdrawal, manual overrides, `?sessionId=&lastSeenSeq=` reconnect deduplication (`serverSeq` + `idempotencyKey`), and live Q&A evidence retrieval.
3. **Post-Stage Reflection, Data Sovereignty & Memory Governance (`ReflectionView`)**: Session timeline, missed/overtime/unanswered-Q&A diagnosis, `V = H - λI` utility calculation, single-point weak-segment rehearsal, durable SQLite persistence across restarts (`ADR-001`), opt-in memory governance (`GET`/`POST`/`PATCH`/`DELETE`), machine-readable/Markdown export (`GET /api/account/export`), and scoped wipe (`DataDeletionReceipt`).
4. **Multi-Tenant Identity, Quotas & Billing Sandbox (`ADR-003`)**: Bearer session auth, per-user isolation, Free/Event/Pro `Entitlement` checks (`Team` strictly `planned`), atomic `usage_ledger` accounting, and preview checkout sandbox (`501 PAYMENT_NOT_CONFIGURED` on unconfigured webhooks).

### Explicit Non-Goals (Honesty Boundaries)
- Non-presentation scenarios (`social`, `teaching`, `sales`, `custom`) are documented roadmap adapters (`status: 'roadmap'`) and MUST NOT simulate fake live execution.
- Audio TTS voice synthesis (speaking back to the user in ear/speaker during talks) is permanently excluded and decommissioned (`ADR-004`) to avoid acoustic collision with the presenter's speech.
- ASR quality and System 1/2 usage are always reported truthfully (`local_sherpa` / `remote_sherpa` / `browser_webspeech` / `text_simulation`, and `provider_reported` / `local_rule_zero` / `estimated` telemetry).
- Always-on-top OS desktop overlay (`Tauri`/`Electron`) is scoped to post-Web commercial Phase 3 (`PRODUCT_VISION.md §4`), not Phase 2 Web release.

---

## 2. Core Functional Requirements

### FR-1: Pre-Stage Context Compiler & Security Bounds
- **Input Support (`PresentationExtractInput` / `PresentationCompileInput`)**:
  - `.md` / `.txt`: direct UTF-8 ingestion and section splitting.
  - `.pptx`: genuine archive/XML parsing over slide text and speaker notes (`ppt/slides/slide*.xml`, `notesSlides`), emitting structured `ExtractedPresentationSection[]`. Phase 2 enforces strict ZIP entry-count caps, per-entry and cumulative `maxOutputLength` decompression bounds, and compression-ratio limits to block ZIP bombs (`status: 'rejected'`, `VALIDATION_ERROR`).
  - `.pdf`: best-effort stream/text extraction with `maxOutputLength` caps on Flate streams plus explicit `warnings[]` and `status: 'unreadable'` (`unreadable: true`) notice when scanned/image-only or encrypted rather than silently failing.
- **Four Structured Artifacts (`PresentationContextPack`, `PACK_SCHEMA_VERSION = 2`)**:
  - **A. Cue Sheet (`PresentationCueSheet`)**: title, `oneLineThesis`, `audienceHook`, `targetDurationSec`, chapter list (`coreMessage`, `transitionCue`, `mustMentionFactIds`), `closingCallToAction`, and `forbiddenClaims`.
  - **B. Fact Whitelist (`PresentationFactItem[]`)**: extracted claims/metrics/milestones/boundaries linked to `Evidence.id` (`EVIDENCE_SCHEMA_VERSION = 2`, `contentHash?`, `sourceDocumentId?`, `locationRef?`), with `source`, `userConfirmed`, `locked`, and `verified`. Locked facts cannot be overwritten by synthesis.
  - **C. Predicted Q&A Cards (`PresentationQACard[]`)**: strictly marked `isPrediction: true` with `question`, `rationale`, `suggestedAnswer`, `keywords`, `evidenceIds`, `prepared`, plus pack-level `unpreparedGaps[]`. Never presented as confirmed facts.
  - **D. Progress Structure (`PresentationProgressNode[]`)**: ordered chapters with `targetDurationSec` and `keyPoints[]` for live pace & omission tracking.
- **Sample Pack & Privacy Gate**:
  - One-click loading of the built-in CueX sample pack (`isSample: true`). Sample ASR hotword corrections are scoped strictly to sample packs rather than leaking globally into user decks.
  - Explicit Microphone, Processing & Retention Privacy Notice (`privacyNoticeAccepted: true` required before `session.start`).

### FR-2: Progressive Intervention Hierarchy (`L0`–`L3`)
- **`L0` (Silence / Standby)**: Zero foreground overlay. Presenter is fluent, on-track, pausing purposefully, or already recovering.
- **`L1` (Peripheral Edge Signal)**: Subtle Amber/Violet edge breathing light (`CueEdgeLight`) signaling gentle pace or transition attention without words.
- **`L2` (Peripheral Keyword Pill)**: Short 2–6 character keyword cue (e.g., missed concept anchor or grounded numeric keyword), legible via peripheral vision in <0.5s.
- **`L3` (Concise Rescue Scaffold)**: Compact card (title + cue + 2–3 brief bullets), gated behind stricter confidence/omission/open-Q&A thresholds or explicit `intervention.request_help`.

### FR-3: Multi-Signal Intervention Controller & Automatic Withdrawal
- System 2 proposals NEVER bypass the `InterventionController`.
- **Multi-Signal Judgment**: Combines silence/pause duration WITH semantic omission, topic drift, open question detection, confidence, and recovery trend. A short silence alone WITHOUT a semantic gap (`pause_only_without_gap`) MUST be suppressed.
- **Guardrails & User Controls**:
  - Respects `silentMode` (`L0` lock), `paused` state, user `maxInterventionLevel` ceiling, inter-hint cooldown, and dismissal suppression.
  - Rejects candidates whose `ttlMs` has expired (`candidate_expired`), whose `contextVersion` is stale (`stale_context_version`), or whose claims lack grounded `evidenceIds` (`ungrounded_evidence`).
- **7 Mandatory Automatic Withdrawal Reasons (`WithdrawalReason`)**:
  1. `user_recovered` — presenter naturally resumes coherent flow or covers the point.
  2. `topic_changed` — speaker shifts to a new valid focus.
  3. `chapter_changed` — presentation advances to another chapter (`chapter.set` or progress transition).
  4. `context_invalidated` — underlying context/pack version updates mid-flight.
  5. `candidate_expired` — active intervention TTL expires.
  6. `user_dismissed` — presenter dismisses the hint (activates cooldown/topic suppression).
  7. `superseded` — a higher-priority grounded intervention (e.g., urgent Q&A answer) replaces it.

### FR-4: Grounded Live Q&A Fallback
- When an audience/interlocutor question (`speaker: 'audience' | 'interlocutor'` or detected Q&A phrasing) arrives:
  1. Runtime searches confirmed `Evidence[]` and `facts` (lexical/BM25 `RetrievalProvider`).
  2. **If Grounded Match Found**: prepares `L2`/`L3` candidate citing exact `evidenceIds[]` (`grounded: true`), surfacing concise grounded data/talking points.
  3. **If Absent from Confirmed Materials**: NEVER fabricates numbers or promises; surfaces an explicit `missingInfoNotice` / `missing_evidence_notice` (`grounded: false`) advising honest boundary framing.

### FR-5: Focus, Split Strip vs. Inspector Views (`ViewMode`)
- **`focus` / `splitStrip`（演讲者极简视角 & 窄条陪讲模式）**: Clean warm-light stage showing only chapter/timer bar, `L1` edge glow, `L2/L3` peripheral hint when active, minimal controls (`暂停监听` / `session.pause`, `静音待命 L0` / `session.silent`, `主动求助`, `收起提示`, ceiling `L0–L3`), keyboard shortcuts (`Space`/`M`/`H`/`Esc` with input-field guard), `aria-live="polite"`, and `Split Strip` compact layout for side-by-side slide sharing.
- **`inspector`（开发与评测透视视角）**: Live, non-fabricated telemetry & trace stream showing `AsrCapabilityStatus`, `SharedCognitiveState` (`contextVersion`, `attentionSignal`, `openGapLabels`), `FastDecisionVerdict` + latency, `SlowReasoningCandidateResult` + `evidenceIds`, `ControllerDecision` traces (`suppressReason` / `withdrawalReason`), `EventEnvelope` correlation IDs, unified error badges, and `TelemetryUsage` (`usageSource`, `costFen`, `latencyStats`).

### FR-6: Post-Stage Reflection, Rehearsal, Auth Quotas & Data Sovereignty
- **Durable Timeline & Diagnosis (`PresentationReflection`)**: Survived across server restarts via `node:sqlite` (`SqliteStorageRepository`, `session_reflections`), containing chronological timeline, `coverageRatio`, `missedPoints`, `overtimeChapters`, `unansweredQuestions`, `driftCount`, `autoWithdrawCount`, and `UtilitySummary` (`V = H - λI`).
- **Single-Point Weak-Segment Rehearsal (`PresentationWeakSegment`, `rehearsal.start`)**: presenter selects any weak item -> runs isolated segment practice.
- **Entitlement & Metering (`ADR-003`)**: Server checks active user entitlement before compilation/live runtime; records idempotent `UsageRecord` rows.
- **Opt-In Memory & Sovereign Export/Wipe**: `MemoryProposal[]` default `status: 'pending'` (`userConfirmed: true` required). Users can inspect/patch/delete memories, export all owned data (`UserDataExportBundle`), and execute scoped wipes (`DataDeletionReceipt` detailing cleared tables vs preserved `BillingAuditRecord` rows and upstream caveats).
