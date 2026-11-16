# CueX Data Model Specification (`@cuex/protocol` v2)

> Authoritative Source: `packages/protocol/src/` (`API_VERSION = '2026-11'`, `WS_PROTOCOL_VERSION = '2.0'`)  
> Detailed Dictionary & Lifecycle Catalog: [DATA_DICTIONARY.md](../data/DATA_DICTIONARY.md), [EVENT_CATALOG.md](../data/EVENT_CATALOG.md), [SCHEMA_VERSIONING.md](../data/SCHEMA_VERSIONING.md)

## 1. Universal Primitives (`common.ts`, `versions.ts`, `errors.ts`)

| Type | Values / Structure | Role |
| --- | --- | --- |
| **`UtcIso8601`** | `string` (`YYYY-MM-DDTHH:mm:ss.sssZ`) | Mandatory wall-clock timestamp format across stored/protocol records (`toUtcIso8601()` in `compatibility/v1-to-v2.ts`); durations remain `*Ms` / `*Sec` numbers. |
| **`MoneyAmount`** | `{ amountFen: number; currency: 'CNY' }` | Integer minor units (`Number.isSafeInteger`); replaces ambiguous floating yuan fields. |
| **`InterventionLevel`** | `'L0' \| 'L1' \| 'L2' \| 'L3'` | Progressive intervention hierarchy (`INTERVENTION_LEVEL_RANK`: `0..3`) |
| **`DEFAULT_UTILITY_LAMBDA`** | `2` | Default disruption multiplier $\lambda$ in $V = H - \lambda I$ |
| **`DataScope` / `PrivacyLevel`** | `'global' \| 'scenario' \| 'session' \| 'document'` & `'ephemeral' \| 'session' \| 'local_private' \| 'shared'` | Storage, export, and wipe boundaries |
| **`EvidenceLifecycle`** | `'draft' \| 'active' \| 'superseded' \| 'archived' \| 'revoked'` | Governs whether an evidence item can back live cues |
| **`TelemetryUsageSource`** | `'provider_reported' \| 'local_rule_zero' \| 'estimated'` | Separates real API usage headers, `0`-token local rules, and explicit estimates |
| **`TelemetryUsage`** | Includes `usageSource`, `inputTokens`, `outputTokens`, `cachedInputTokens`, `totalTokens`, `modelCalls`, `retries`, `localRuleEvaluations`, `latencyMs`, `latencyStats` (`avgMs`/`p95Ms`/`maxMs`), `degraded`, `usingLocalFallback`, `asrProvider`, `asrDurationMs`, `costFen`, `cost`, `estimation`, `byTier?` | Honest runtime telemetry & cost attribution |
| **`ApiErrorResponse`** | Structured `{ ok: false, error: { code, message, httpStatus, retryable, correlationId?, requestId?, timestamp, details? } }` | Unified REST & WS error codes (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `PAYMENT_NOT_CONFIGURED`, etc.) |

---

## 2. Core Universal Runtime Entities (`entities.ts` & `envelope.ts`)

### 2.1 Session, Context & Provenance-Rich Evidence
- **`Session`**: `sessionId`, `tenantId?`, `userId?`, `scenarioId`, `status` (`'initializing' | 'active' | 'paused' | 'ended'`), `mode`, `viewMode`, `startedAt` (`UtcIso8601`), `endedAt?`, `contextPackId?`, `silentMode`, `maxInterventionLevel`, `privacyNoticeAccepted`.
- **`TaskContext`**: active session objective (`taskId`, `goal`, `audience?`, `activeChapterId?`, `activeChapterTitle?`, `targetDurationSec?`, `elapsedSec?`, `constraints[]`, `forbiddenClaims?`, monotonic `contextVersion`).
- **`ContextPack`**: compiled scenario knowledge container (`packId`, `userId`, `scenarioId`, `schemaVersion = 2`, `title`, `goal`, `constraints[]`, `forbiddenClaims[]`, `chapters: ContextPackChapter[]`, `evidence: Evidence[]`, `createdAt`, `updatedAt`).
- **`Evidence`**: atomic groundable fact (`id`, `schemaVersion = 2`, `text`, `source`, `sourceType`, `sourceDocumentId?`, `locationRef?`, `contentHash?`, `timestamp`, `createdAt`, `updatedAt`, `confidence`, `scope`, `privacyLevel`, `userConfirmed`, `verified`, `locked`, `lifecycle`). System 2 candidates MUST cite verified `Evidence.id`s or mark `grounded: false`.

### 2.2 Events (`EventEnvelope`), Speech & Observations
- **`EventEnvelope<TPayload>`** (`envelope.ts`): `{ specVersion: '1.0', eventId, eventType, eventVersion, occurredAt, sessionId?, tenantId?, userId?, correlationId, causationId?, producer, traceId?, privacyClass, idempotencyKey?, payload }`. WS `ClientMessage`/`ServerMessage` attach optional `envelope`, `idempotencyKey`, `correlationId`, and monotonic `serverSeq` for reconnect dedup.
- **`TranscriptSegment`**: `segmentId`, `sessionId`, `speaker` (`'presenter' | 'audience' | 'interlocutor' | 'unknown'`), `text`, `delta`, `isFinal`, `confidence`, `startMs`, `endMs`, optional `source` (`TranscriptSource`), `chapterId`.
- **`Observation`**: structured detection emitted by runtime evaluators (`silence`, `pace_overtime`, `pace_fast`, `topic_drift`, `key_point_omission`, `audience_question`, `hesitation`, `recovery`, `manual_trigger`, `chapter_transition`).

### 2.3 Candidates, Interventions & Outcomes
- **`Candidate`**: prepared but unshown support proposal (`candidateId`, `level`, `title`, `cueText`, `bullets?`, `priority`, `ttlMs`, `expiresAt` [`UtcIso8601`], `contextVersion`, `evidenceIds[]`, `basedOnSegmentId`, `status`, `kind?`, `grounded?`, `missingEvidenceNotice?`, `withdrawalReason?`, `suppressedReason?`).
- **`Intervention`**: an approved candidate actually displayed (`interventionId`, `candidateId`, `level`, `title`, `cueText`, `bullets?`, `evidenceIds[]`, `grounded`, `shownAt` [`UtcIso8601`], `withdrawnAt?`, `withdrawalReason?`, `dismissedAt?`, `userFeedback?: 'helpful' | 'distracting'`).
- **`Outcome` & `Reflection`**: post-session `utilityScore`, `helpfulCount`, `interruptionCount`, `lambda`, `coverageRatio`, `telemetry`, plus `interventions[]`, `observations[]`, `memoryProposals[]`, `highlights[]`, `improvementFocuses[]`.

### 2.4 Opt-In Memory & Commercial Entities (`commercial.ts`)
- **`MemoryItem` / `MemoryProposal`**: `memoryId`, `userId`, `schemaVersion = 2`, `scenarioId`, `category`, `title`, `content`, `userConfirmed`, `privacyLevel`, `scope`, `createdAt`, `updatedAt`.
- **Auth, Quotas & Data Sovereignty (`commercial.ts`)**: `UserAccount`, `AuthSessionResponse`, `PlanId` (`free | event | pro | team`), `PlanStatus` (`active | planned`), `PlanDefinition`, `Entitlement`, `UsageRecord`, `AccountUsageSummary`, `BillingAuditRecord`, `PaymentCheckoutPreviewRequest/Result`, `PaymentWebhookEvent`, `UserDataExportBundle`, `DataDeletionReceipt`.

---

## 3. Shared State, Decision, Controller & Presentation Contracts
- **`SharedCognitiveState`**, **`FastDecisionVerdict`**, **`SlowReasoningCandidateResult`**, **`ControllerDecision`**, and **`PresentationExtractResult`** (`status: 'parsed' | 'unreadable' | 'rejected'`) / **`PresentationContextPack`** (`PACK_SCHEMA_VERSION = 2`) carry strict runtime validators (`validate*` in `validation.ts`) alongside JSON Schemas (`packages/protocol/schemas/*.schema.json`).
