# CueX Presentation User Flows

> End-to-End Flows Grounded in `@cuex/protocol` v2 (`API_VERSION = '2026-11'`, `WS_PROTOCOL_VERSION = '2.0'`) Client/Server Events & REST Contracts

## Flow 0: Session Authentication & Entitlement Check (`Phase 2`)

```text
User opens HomeView
  ├── Request or switch local bearer session -> POST /api/auth/session
  │     Receives AuthSessionResponse { authenticated, token, user: UserAccount, sessionTokenExpiresAt, entitlements, usageSummary }
  └── Client attaches `Authorization: Bearer <token>` on all REST calls and `?token=<bearer>` on WS `/ws` upgrade
```

- All packs, sessions, reflections, memories, usage summaries, and exports are strictly scoped to `user.userId` (`401 UNAUTHORIZED` / `403 FORBIDDEN` on unauthorized access).
- Quota exhaustion triggers deterministic `402 QUOTA_EXCEEDED` (`ApiErrorResponse`) rather than silent drops or unbilled execution.

---

## Flow 1: Pre-Stage Material Extraction & Context Compilation

```text
User selects "CueX Presentation" -> Enters CompilerView
  │
  ├── [Optional Quick Start] Click "Load Sample: CueX Pitch Pack"
  │
  ├── [Upload / Paste Materials]
  │     Upload .pptx / .pdf / .md / .txt ──► POST /api/presentation/extract
  │     Server validates size + ZIP/Flate bounds (DocumentExtractor)
  │     Receives PresentationExtractResult (status: 'parsed' | 'unreadable' | 'rejected',
  │       extractedText, sections, warnings, unreadable?)
  │       ├─ If status === 'rejected' (ZIP-bomb/oversize/corrupt bounds) -> HTTP 400 VALIDATION_ERROR
  │       └─ If PDF scanned/unreadable -> UI displays explicit warning & paste fallback
  │
  ├── Fill Context Meta (title, sceneType, goal, audience, targetDurationSec, forbiddenClaims)
  │
  └── Click Compile ──► POST /api/presentation/compile (validates body, checks Entitlement)
        Receives PresentationContextPack (`schemaVersion = 2`, UTC ISO-8601 timestamps):
          A. CueSheet (thesis, hook, chapter transitions, CTA)
          B. FactWhitelist (facts[] linked to evidenceId) -> User reviews, edits, confirms, locks
          C. QACards (isPrediction: true explicit badge) + unpreparedGaps[]
          D. ProgressStructure (chapterNodes[] + keyPoints[])
        Optionally edit/lock facts ──► PATCH /api/presentation/packs/:packId
```

---

## Flow 2: Privacy Consent & Live Session Boot (`Rehearsal` or `Live`)

1. Presenter selects **彩排模式 (`rehearsal`)** or **正式演讲模式 (`live`)** and reviews the explicit **Microphone, Retention & Privacy Notice** (ASR routing mode, billing/backup/third-party retention boundaries per [CONSENT_FLOW.md](../privacy/CONSENT_FLOW.md), opt-in memory policy, and export/wipe capability).
2. Client opens WebSocket `/ws` (`?token=<bearer>`) and sends `session.start` carrying `idempotencyKey`, `correlationId`, and `privacyNoticeAccepted: true`:
   ```json
   {
     "type": "session.start",
     "idempotencyKey": "idem_start_01",
     "correlationId": "corr_sess_01",
     "payload": {
       "scenarioId": "presentation",
       "packId": "pack_cuex_demo_01",
       "mode": "live",
       "viewMode": "focus",
       "maxInterventionLevel": "L2",
       "silentMode": false,
       "privacyNoticeAccepted": true
     }
   }
   ```
3. Server validates quota (`Entitlement`), persists initial `Session` row in SQLite (`StorageRepository`), binds `ContextPack`, initializes `SharedCognitiveState` (`contextVersion = 1`), detects live ASR backend (`AsrCapabilityStatus`), records atomic `UsageRecord` reservation/start, and returns `session.ready` with monotonic `serverSeq = 1`.
4. Stage enters `Focus` by default (`Inspector` accessible via single top-bar toggle).

---

## Flow 3: Live Stage Loop — Speech, Minimum Necessary Intervention, Auto-Withdraw & Reconnect

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
  │      Server emits `intervention.shown` (`EventEnvelope`, `serverSeq++`) -> Focus renders minimal peripheral cue
  │
  ├──► Case D: Presenter recovers, clicks Dismiss, or switches chapter
  │      Controller -> 'withdraw' with explicit WithdrawalReason ('user_recovered' | 'chapter_changed' | 'user_dismissed' | ...)
  │      Server emits `intervention.withdrawn` -> Focus smoothly retracts the cue back to L0
  │
  └──► Case E: Transient WebSocket Drop & Reconnect
         Client reconnects via GET `/ws?token=<bearer>&sessionId=<id>&lastSeenSeq=<int>` + same `idempotencyKey` on pending commands
         Server invokes `reconcileBeforeReconnect()`, emits `session.ready`, deduplicates processed commands, and replays missed `ws_server` frames after `lastSeenSeq` once (omitting stale withdrawn cues).
```

---

## Flow 4: Live Q&A Grounding & Honest Missing-Info Boundary

1. Audience or interlocutor asks a question (`speaker: 'audience' | 'interlocutor'` or question intent recognized in `speech.delta`).
2. `CognitiveEventBus` dispatches `question.detected` wrapped in `EventEnvelope`, triggering `RetrievalProvider` against verified `Evidence[]` + confirmed `PresentationFactItem[]`.
3. Two deterministic branches:
   - **Matched Grounded Evidence**: System 2 produces a concise `L2`/`L3` candidate tagged with `grounded: true` and `evidenceIds[]`. `InterventionController` displays the cue if within ceiling (or on explicit `intervention.request_help`).
   - **No Confirmed Material Match**: System 2 sets `status: 'insufficient_evidence'` / `grounded: false` with explicit `ungroundedNotice` (`"未在已确认资料中找到相关证据，建议诚实说明边界或会后核实"`). Zero fabricated statistics reach the presenter's screen.

---

## Flow 5: Post-Stage Reflection, Rehearsal, Export & Sovereign Wipe

1. Presenter ends the talk -> client sends `session.end` -> server finalizes telemetry (`usageSource`, `costFen`), commits `UsageRecord` & `PresentationReflection` to SQLite, and emits `session.ended` (also queryable after restart via `GET /api/sessions/:id/reflection`).
2. Presenter inspects `ReflectionView`:
   - Reviews chronological timeline, `coverageRatio`, missed points, overtime chapters, unanswered Q&A, auto-withdraw counts, and `V = H - λI` utility breakdown.
   - Clicks any weak segment (`PresentationWeakSegment`) -> launches targeted `rehearsal` session (`rehearsal.ready`) seeded with isolated prompt & `Evidence[]`.
   - Reviews `memoryProposals[]`: accepts (`POST /api/memory`, requires `userConfirmed: true`), edits, or ignores; manages items via `MemoryInspectorPanel`.
   - **Data Export & Deletion**: Downloads full personal archive via `GET /api/account/export?format=json|markdown` (`UserDataExportBundle`) or triggers scoped deletion (`POST /api/sessions/:id/wipe`, `DELETE /api/sessions/:id`, or full sovereign wipe via `DELETE /api/account/data`) returning a `DataDeletionReceipt` (`deletedScopes`, `preservedRecords` such as `BillingAuditRecord` rows, and `thirdPartyCaveats`).
