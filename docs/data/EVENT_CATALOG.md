# CueX Event Catalog (`EventEnvelope` & WebSocket v2)

> Authoritative Source: `packages/protocol/src/{envelope,events,controller,audio,entities}.ts` & `apps/server/src/gateway/GatewayServer.ts`  
> Envelope Standard: `CloudEvents 1.0.2`-inspired structural specification (`EVENT_ENVELOPE_VERSION = 1`, `WS_PROTOCOL_VERSION = '2.0'`) — architecture reference, not third-party certification.

---

## 1. Canonical `EventEnvelope<TPayload>` Structure

Every internal `EventPipeline` event and sequenced WebSocket delivery record conforms to `EventEnvelope<TPayload>`:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `specVersion` | `'1.0'` | Yes | Envelope spec constant aligned with CloudEvents v1 structure. |
| `eventId` | `string` | Yes | Unique event identifier (`evt_<uuid>`). |
| `eventType` | `string` | Yes | Dotted canonical type (e.g., `session.ready`, `intervention.shown`, `intervention.withdrawn`). |
| `eventVersion` | `number` | Yes | Payload schema version (`EVENT_ENVELOPE_VERSION = 1`). |
| `occurredAt` | `UtcIso8601` | Yes | UTC ISO-8601 emission timestamp (`YYYY-MM-DDTHH:mm:ss.sssZ`). |
| `sessionId` | `string` | Optional | Active runtime session ID. |
| `tenantId` | `string` | Optional | Workspace/tenant scope. |
| `userId` | `string` | Optional | Authenticated owning `UserAccount.userId`. |
| `correlationId` | `string` | Yes | Request/session-flow trace key connecting WS commands -> S1/S2 -> Controller -> Output. |
| `causationId` | `string` | Optional | Immediate upstream `eventId` triggering this event. |
| `producer` | `string` | Yes | Emitting module (`cuex-gateway`, `cuex-runtime`, etc.). |
| `traceId` | `string` | Optional | Distributed trace correlation ID. |
| `privacyClass` | `'public' \| 'session' \| 'user_private' \| 'restricted' \| 'billing_audit'` | Yes | Controls persistence, redaction, and retention policy (`envelope.ts`). |
| `idempotencyKey` | `string` | Optional | Client or producer deduplication key preventing duplicate side effects / quota charges. |
| `payload` | `TPayload` | Yes | Typed event body. |

---

## 2. WebSocket v2 Transport Messages (`/ws`)

`GatewayServer.ts` accepts WebSocket upgrades strictly on `/ws` authenticated by `?token=<bearer>` (or `Authorization: Bearer <token>`).  
Optional outbound/inbound envelope metadata fields: `envelope?: EventEnvelopeMeta`, `idempotencyKey?`, `correlationId?`, `clientSeq?`, and monotonic **`serverSeq?: number`** on outbound `ServerMessage`s.  
**Reconnect Replay**: Connect with `GET /ws?token=<bearer>&sessionId=<id>&lastSeenSeq=<int>`. The server invokes `reconcileBeforeReconnect()`, emits `session.ready`, and replays persisted `ws_server` events after `lastSeenSeq` once while skipping inactive `intervention.shown` cards.

### 2.1 Client -> Server (`ClientMessage`)
| `type` | Required `payload` Fields | Idempotency / Auth / Runtime Rules |
| --- | --- | --- |
| `ping` | `t` (`number`) | Keepalive probe; returns `pong`. |
| `session.start` | `scenarioId`, `mode` (`rehearsal \| live`), `privacyNoticeAccepted` (`true`), optional `packId`, `contextPack`, `viewMode`, `maxInterventionLevel`, `silentMode`, `rehearsalTarget` | Requires valid authenticated user, implemented scenario (`presentation`), and atomic `Entitlement` quota reservation (`402 QUOTA_EXCEEDED`); deduplicated by `idempotencyKey`. |
| `session.pause` | `sessionId` | Transitions active runtime to `paused` and blocks autonomous interventions (`session_paused`). |
| `session.resume` | `sessionId` | Resumes a `paused` active runtime session. *(Socket reconnect uses upgrade query `?sessionId=&lastSeenSeq=` rather than a separate WS frame.)* |
| `session.silent` | `sessionId`, `silentMode` (`boolean`) | Toggles `L0` silence lock immediately (`silent_mode`). |
| `session.stop` / `session.end` | `sessionId`, optional `reason` (`completed \| user_requested \| aborted`) | Finalizes `Outcome`, saves `Session` + `PresentationReflection` + `TelemetryUsage` + ASR `UsageRecord` to SQLite, emits `session.ended`. |
| `session.wipe` | `sessionId` | Purges runtime session + SQLite runtime tables + session-linked memories immediately; emits `session.wiped`. |
| `rehearsal.start` | `sourceSessionId`, `packId`, `weakSegmentId`, `chapterId`, optional `sessionId` | Starts ownership-checked isolated single-point rehearsal from stored reflection (`rehearsal.ready`). |
| `audio.chunk` | `format` (`pcm16 \| opus`), `sampleRate` (`>0`), `channels` (`>=1`), `data` (`base64`), `timestamp`, optional `sessionId`, `speaker` | Streams audio into Sherpa ASR stream; emits `session.error` (`ASR_TEXT_ONLY`) cleanly when `TextOnlyAsr` is active. |
| `speech.delta` | `text`, `isFinal` (`boolean`), optional `sessionId`, `speaker`, `confidence`, `startMs`, `endMs`, `source` (`browser_webspeech \| text_simulation \| external_asr`) | Primary text/WebSpeech input; runs scoped demo hotword fix + System 1 / withdrawal checks. |
| `chapter.set` | `sessionId`, `chapterId` | Updates active chapter, bumps `contextVersion`, triggers `chapter_changed` withdrawals. |
| `view.mode` | `sessionId`, `viewMode` (`focus \| inspector`) | Switches UI telemetry & inspection mode (`Focus` / `Split Strip` vs `Inspector`). |
| `intervention.set_ceiling` | `sessionId`, `maxLevel` (`L0..L3`) | Constrains maximum allowed intervention level. |
| `intervention.request_help` | `sessionId`, optional `preferredLevel`, `question` | Manual override bypassing suppression/cooldown (still enforcing grounding). |
| `intervention.dismiss` | `sessionId`, optional `interventionId`, `candidateId`, `reason` | Dismisses active cue (`user_dismissed`) and starts `dismissSuppressionMs` (`45_000 ms`) window. |
| `intervention.feedback` | `sessionId`, `interventionId`, `feedback` (`helpful \| distracting`), optional `note` | Updates live $H$ / $I$ utility counters. |

### 2.2 Server -> Client (`ServerMessage`, sequenced with `serverSeq`)
- **`pong`**, **`session.ready`** (`session`, `serverTime`, `scenario`, `asrStatus`, `initialState`, `presentationState?`), **`session.state`** (`session`, `serverTime`), **`session.ended`** (`sessionId`, `endedAt`, `durationMs`, `outcome`, `reflection?`), **`session.wiped`** (`sessionId`, `wipedAt`), **`rehearsal.ready`**, **`asr.status`**, **`asr.transcript`**, **`cognitive.event`**, **`cognitive.state`**, **`system1.verdict`**, **`system2.candidate`**, **`controller.decision`**, **`intervention.shown`**, **`intervention.withdrawn`**, **`presentation.progress`**, **`telemetry.updated`**, **`session.error`** (`code`, `message`, `sessionId?`, `retryable?`).

---

## 3. Domain Cognitive & Controller Enumerations

### Internal `CognitiveEvent` Types (`entities.ts`)
`session.lifecycle`, `speech.partial`, `speech.final`, `silence.tick`, `topic.shift`, `chapter.change`, `question.detected`, `omission.detected`, `drift.detected`, `recovery.detected`, `user.manual_help`, `user.dismiss_hint`, `user.feedback`, `user.mode_change`, `candidate.prepared`, `intervention.shown`, `intervention.withdrawn`, `context.updated`.

### All 7 Automatic Withdrawal Reasons (`WithdrawalReason`)
1. `user_recovered` — Speaker fluently resumed or stated the missing point.
2. `topic_changed` — Topic naturally shifted cleanly past the stale cue.
3. `chapter_changed` — Presentation progressed to another chapter.
4. `context_invalidated` — `contextVersion` incremented mid-display.
5. `candidate_expired` — Candidate TTL (`12_000 ms`) or max display horizon (`24_000 ms`) elapsed.
6. `user_dismissed` — User explicitly dismissed the active hint.
7. `superseded` — Higher-priority grounded cue preempted it.

### Controller Suppression Reasons (`ControllerSuppressReason`)
`session_paused`, `silent_mode`, `stale_context_version`, `candidate_expired`, `ungrounded_evidence`, `pause_only_without_gap`, `no_semantic_need`, `user_already_recovering`, `ceiling_exceeded`, `user_dismissed_suppression`, `cooldown_active`, `lower_priority`.
