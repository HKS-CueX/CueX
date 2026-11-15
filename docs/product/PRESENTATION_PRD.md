# CueX Presentation — Product Requirements Document (PRD)

> Status: Live First Wedge (`ScenarioId = 'presentation'`, `status: 'implemented'`)  
> Target Users: Founders / OPC principals pitching (`pitch`), thesis/project defense speakers (`defense`), researchers (`academic`), keynote speakers (`keynote`), and general presenters (`general`).

## 1. Product Scope & Non-Goals

### In Scope (`implemented`)
1. **Pre-Stage Context Compiler (`CompilerView`)**: Upload `.pptx`, `.pdf`, `.md`, `.txt` or paste notes; extract structured text transparently; compile a **Cue Sheet**, an editable/lockable **Fact Whitelist**, AI-predicted **Q&A Cards** (explicitly tagged `isPrediction: true`), and chapter **Progress Structure**; provide a built-in CueX sample presentation pack for immediate live testing.
2. **During-Stage Live Copilot (`StageView`)**: Dual-view live execution supporting **Rehearsal (`rehearsal`)** and **Live (`live`)** modes across **Focus (`focus`)** and **Inspector (`inspector`)** views, driven by progressive `L0–L3` intervention gating, automatic withdrawal, manual overrides, and live Q&A evidence retrieval.
3. **Post-Stage Reflection & Memory Governance (`ReflectionView`)**: Session timeline, missed/overtime/unanswered-Q&A diagnosis, `V = H - λI` utility calculation, single-point weak-segment rehearsal, and explicit opt-in memory governance (`GET`/`POST`/`PATCH`/`DELETE`).

### Explicit Non-Goals (Honesty Boundaries)
- Non-presentation scenarios (`social`, `teaching`, `sales`, `custom`) are documented roadmap adapters (`status: 'roadmap'`) and MUST NOT simulate fake live execution.
- Audio TTS voice synthesis (speaking back to the user in ear/speaker during talks) is intentionally excluded from Presentation live runtime to avoid acoustic collision with the presenter's speech.
- ASR quality and System 1/2 usage are always reported truthfully (`local_sherpa` / `remote_sherpa` / `browser_webspeech` / `text_simulation`, and `provider_reported` / `local_rule_zero` / `estimated` telemetry).

---

## 2. Core Functional Requirements

### FR-1: Pre-Stage Context Compiler
- **Input Support (`PresentationExtractInput` / `PresentationCompileInput`)**:
  - `.md` / `.txt`: direct UTF-8 ingestion and section splitting.
  - `.pptx`: genuine archive/XML parsing over slide text and speaker notes (`ppt/slides/slide*.xml`, `notesSlides`), emitting structured `ExtractedPresentationSection[]`.
  - `.pdf`: best-effort stream/text extraction with explicit `warnings[]` and `unreadable: true` notice when scanned/image-only or encrypted rather than silently failing.
- **Four Structured Artifacts (`PresentationContextPack`)**:
  - **A. Cue Sheet (`PresentationCueSheet`)**: title, `oneLineThesis`, `audienceHook`, `targetDurationSec`, chapter list (`coreMessage`, `transitionCue`, `mustMentionFactIds`), `closingCallToAction`, and `forbiddenClaims`.
  - **B. Fact Whitelist (`PresentationFactItem[]`)**: extracted claims/metrics/milestones/boundaries linked to `Evidence.id`, with `source`, `userConfirmed`, `locked`, and `verified`. Users can add, edit, confirm, lock, or delete items; locked facts cannot be overwritten by synthesis.
  - **C. Predicted Q&A Cards (`PresentationQACard[]`)**: strictly marked `isPrediction: true` with `question`, `rationale`, `suggestedAnswer`, `keywords`, `evidenceIds`, `prepared`, plus pack-level `unpreparedGaps[]`. Never presented as confirmed facts.
  - **D. Progress Structure (`PresentationProgressNode[]`)**: ordered chapters with `targetDurationSec` and `keyPoints[]` for live pace & omission tracking.
- **Sample Pack & Privacy Gate**:
  - One-click loading of a complete CueX presentation sample pack (`isSample: true`).
  - Explicit Microphone & Local/Cloud Processing Privacy Notice (`privacyNoticeAccepted: true` required before `session.start`).

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

### FR-5: Focus vs. Inspector Dual Views (`ViewMode`)
- **`focus`（演讲者极简视角）**: Clean warm-light stage showing only chapter/timer bar, `L1` edge glow, `L2/L3` peripheral hint when active, minimal controls (`暂停监听`, `静音待命 L0`, `主动求助`, `收起提示`, ceiling `L0–L3`), and subtle post-hint `有效 (H)` / `打扰 (I)` micro-feedback buttons. Smoothly animates hint exit on withdrawal.
- **`inspector`（开发与评测透视视角）**: Live, non-fabricated telemetry & trace stream showing `AsrCapabilityStatus` (exact active ASR pipeline + clearly separated text simulation controls), `SharedCognitiveState` (`contextVersion`, `attentionSignal`, `openGapLabels`), `FastDecisionVerdict` + latency, `SlowReasoningCandidateResult` + `evidenceIds`, `ControllerDecision` rules/traces (`suppressReason` / `withdrawalReason`), and `TelemetryUsage` (tokens, cache, model calls, local fallback count).

### FR-6: Post-Stage Reflection, Single-Point Rehearsal & Memory Governance
- **Timeline & Diagnosis (`PresentationReflection`)**: chronological `PresentationTimelineEvent[]` (speech segments, chapter switches, shown/withdrawn/dismissed hints, Q&A moments), `coverageRatio`, `missedPoints`, `overtimeChapters`, `unansweredQuestions`, `driftCount`, `autoWithdrawCount`, and `UtilitySummary` (`V = H - λI`).
- **Single-Point Weak-Segment Rehearsal (`PresentationWeakSegment`, `rehearsal.start`)**: presenter selects any weak/missed/overtime/Q&A item -> enters focused single-segment rehearsal seeded with its `promptText`, `targetPointLabels`, and `supportingEvidence[]` -> receives real runtime evaluation without re-running the entire deck.
- **Opt-In Memory Governance (`MemoryItem[]` / `MemoryProposal[]`)**: post-session proposals (pacing habits, preferred phrasing, recurring Q&A patterns) default to `status: 'pending'` and NEVER persist unless the user confirms (`userConfirmed: true`). Full `GET` / `PATCH` / `DELETE` controls plus per-session wipe (`session.wipe`).
