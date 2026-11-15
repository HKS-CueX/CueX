# CueX Presentation User Flows

> End-to-End Flows Grounded in `@cuex/protocol` Client/Server Events & REST Contracts

## Flow 1: Pre-Stage Material Extraction & Context Compilation

```text
User opens HomeView -> Selects "CueX Presentation" -> Enters CompilerView
  │
  ├── [Optional Quick Start] Click "Load Sample: CueX Pitch Pack"
  │
  ├── [Upload / Paste Materials]
  │     Upload .pptx / .pdf / .md / .txt ──► POST /api/presentation/extract
  │     Receives PresentationExtractResult (extractedText, sections, warnings, unreadable?)
  │       └─ If PDF scanned/unreadable -> UI displays explicit warning & paste fallback
  │
  ├── Fill Context Meta (title, sceneType, goal, audience, targetDurationSec, forbiddenClaims)
  │
  └── Click Compile ──► POST /api/presentation/compile
        Receives PresentationContextPack:
          A. CueSheet (thesis, hook, chapter transitions, CTA)
          B. FactWhitelist (facts[] linked to evidenceId) -> User reviews, edits, confirms, locks
          C. QACards (isPrediction: true explicit badge) + unpreparedGaps[]
          D. ProgressStructure (chapterNodes[] + keyPoints[])
        Optionally edit/lock facts ──► PATCH /api/presentation/packs/:packId
```

---

## Flow 2: Privacy Consent & Live Session Boot (`Rehearsal` or `Live`)

1. Presenter selects **彩排模式 (`rehearsal`)** or **正式演讲模式 (`live`)** and reviews the explicit **Microphone & Privacy Notice** (audio streaming mode, local/cloud processing notice, opt-in memory policy, and instant session wipe capability).
2. Client opens WebSocket `/ws` and sends `session.start`:
   ```ts
   {
     type: 'session.start',
     payload: {
       scenarioId: 'presentation',
       packId,
       mode: 'rehearsal' | 'live',
       viewMode: 'focus' | 'inspector',
       maxInterventionLevel: 'L2' | 'L3' | ...,
       silentMode: false,
       privacyNoticeAccepted: true
     }
   }
   ```
3. Server binds `ContextPack`, initializes `SharedCognitiveState` (`contextVersion = 1`), detects live ASR backend (`AsrCapabilityStatus`), and returns `session.ready`.
4. Stage enters `Focus` by default (`Inspector` accessible via single top-bar toggle).

---

## Flow 3: Live Stage Loop — Speech, Minimum Necessary Intervention & Auto-Withdraw

```text
Presenter speaks (16kHz PCM audio.chunk OR Browser SpeechRecognition / Text Simulation speech.delta)
  │
  ├──► Case A: Fluent speech covering chapter key points
  │      System 1 -> cognitiveState: 'fluent' / 'on_track', interventionNeed: 'none'
  │      Controller -> 'stay_silent' (L0). Focus view stays clean and calm.
  │
  ├──► Case B: Short rhetorical pause WITHOUT semantic omission/drift
  │      Controller evaluates signalsEvaluated -> semanticGap: false, drift: false
  │      Controller -> 'stay_silent', suppressReason: 'pause_only_without_gap'
  │
  ├──► Case C: Key-point omission, pace overtime, or topic drift detected
  │      System 1 -> 'trigger_l1' / 'trigger_l2' / 'prepare_candidate'
  │      System 2 -> synthesizes grounded Candidate referencing confirmed evidenceIds
  │      Controller checks: !silentMode && !paused && ceiling OK && !cooldown && valid TTL/contextVersion && grounded
  │      Controller -> 'show_l1_edge' (L1 Amber/Violet glow) OR 'show_l2_keyword' (2–6 char cue)
  │      Server emits `intervention.shown` -> Focus renders minimal peripheral cue
  │
  └──► Case D: Presenter recovers & says the missing concept / clicks Dismiss / switches chapter
         System 1 or state transition detects recovery / chapter change
         Controller -> 'withdraw' with explicit WithdrawalReason ('user_recovered' | 'chapter_changed' | 'user_dismissed' | ...)
         Server emits `intervention.withdrawn` -> Focus smoothly retracts the cue back to L0
```

---

## Flow 4: Live Q&A Grounding & Honest Missing-Info Boundary

1. Audience or interlocutor asks a question (`speaker: 'audience'` or question intent recognized in `speech.delta`).
2. `EventBus` records `question.detected`, bumps state evaluation, and triggers `RetrievalProvider` against verified `Evidence[]` + confirmed `PresentationFactItem[]`.
3. Two deterministic branches:
   - **Matched Grounded Evidence**: System 2 produces a concise `L2`/`L3` candidate tagged with `grounded: true` and `evidenceIds[]`. `Controller` shows the cue if within ceiling (or on manual help request `intervention.request_help`).
   - **No Confirmed Material Match**: System 2 sets `status: 'insufficient_evidence'` / `grounded: false` with explicit `ungroundedNotice` / `missingInfoNotice` (`"未在已确认资料中找到相关证据，建议诚实说明边界或会后核实"`). Zero fabricated statistics reach the presenter's screen.

---

## Flow 5: Post-Stage Reflection, Single-Point Rehearsal & Memory Governance

1. Presenter ends the talk -> client sends `session.end` -> server emits `session.ended` with full `Outcome` and `PresentationReflection` (also fetchable via `GET /api/sessions/:id/reflection`).
2. Presenter inspects `ReflectionView`:
   - Reviews chronological timeline, coverage ratio, missed key points, overtime chapters, unanswered Q&A, auto-withdraw counts, and `V = H - λI` utility breakdown (`UtilitySummary`).
   - Clicks any weak segment (`PresentationWeakSegment`) -> client starts a targeted session (`session.start` with `rehearsalTarget` or `rehearsal.start`) -> server emits `rehearsal.ready` with isolated prompt & supporting `Evidence[]` so only that segment is practiced.
   - Reviews `memoryProposals[]`: chooses `Accept` (creates `MemoryItem` with `userConfirmed: true` via `POST /api/memory`), `Edit`, or `Ignore`; or uses the Memory panel to inspect/patch/delete saved items (`GET`/`PATCH`/`DELETE /api/memory/:id`) or run `session.wipe` to purge session records immediately.
