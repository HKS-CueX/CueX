# CueX Consent, Export & Data Sovereignty Flows

> Related Contracts: `packages/protocol/src/{events,entities,commercial}.ts` (`privacyNoticeAccepted`, `userConfirmed`, `UserDataExportBundle`, `DataDeletionReceipt`)  
> Related Policies: [PRIVACY_DATA_MAP.md](./PRIVACY_DATA_MAP.md) & [DATA_RETENTION.md](./DATA_RETENTION.md)

---

## 1. Mandatory Pre-Execution Consent Gates

CueX enforces two explicit hard consent gates in runtime code—neither can be bypassed by URL parameters or silent defaults:

### Gate 1: Live Microphone & Context Processing Consent (`privacyNoticeAccepted`)
- **UI Location**: `CompilerView` / pre-stage launcher in `apps/web` before sending WS `session.start`.
- **Protocol Enforcement**: `session.start` requires `privacyNoticeAccepted: true`. In `GatewayServer.ts`, omitting or setting `false` rejects session startup cleanly (`session.error` with code `VALIDATION_ERROR`).
- **Required User Disclosures Shown Before Acceptance**:
  1. Which ASR backend is active (`local_sherpa` local vs `remote_sherpa` vs `browser_webspeech` vs `text_simulation`).
  2. Whether System 2 (`CUEX_SYSTEM2`) executes locally (`local_rule_zero`) or sends compact `PromptGuard`-delimited transcript + retrieved `Evidence` slices to a configured cloud LLM API.
  3. Notice that **raw PCM audio is never saved to disk**, **session wipe removes CueX local state immediately**, while **`billing_audit_log`, encrypted backups until rotation, and prior 3rd-party API calls** follow separate policies ([DATA_RETENTION.md](./DATA_RETENTION.md)).

### Gate 2: Explicit Opt-In Cross-Session Memory Consent (`userConfirmed === true`)
- **UI Location**: `ReflectionView` (`MemoryProposal` review cards) & `MemoryInspectorPanel`.
- **Protocol & Runtime Enforcement**:
  - `PresentationReflection.ts` produces post-session `MemoryProposal[]` with `status: 'pending'`. Nothing writes automatically to SQLite `memories`.
  - `POST /api/memory` validates `userConfirmed === true`; any request without explicit `true` returns `HTTP 400` (`VALIDATION_ERROR`). `SqliteStorageRepository.saveMemory` additionally enforces `userConfirmed === true` at the database layer.
  - Users can inspect (`GET /api/memory`), edit (`PATCH /api/memory/:id`), or delete (`DELETE /api/memory/:id`) any saved item at any time.

---

## 2. Machine-Readable & Markdown Data Export (`GET /api/account/export`)

Authenticated users can request a portable snapshot of all CueX-held personal & cognitive records:
- **Route**: `GET /api/account/export?format=json|markdown` (default `json`; requires valid `Authorization: Bearer <token>`).
- **JSON Output (`UserDataExportBundle`)**:
  - `exportId`, `exportedAt` (`UtcIso8601`), `schemaVersion` (`2`)
  - `user` (`UserAccount`)
  - `entitlements[]` (`Entitlement`) & `usageSummary` (`AccountUsageSummary`)
  - `usageRecords[]` (`UsageRecord`) & `billingAuditRecords[]` (`BillingAuditRecord`)
  - `packs[]` (owned `PresentationContextPack`s + `Evidence[]`)
  - `memories[]` (`MemoryItem`s)
  - `reflections[]` (`PresentationReflection`s)
- **Markdown Output (`format=markdown`)**: Returns human-readable `text/markdown; charset=utf-8` archive report.
- **Authorization**: Strictly scoped to authenticated `authenticatedUser.userId` (`401 UNAUTHORIZED` if token missing/expired).

---

## 3. Scoped Session Wipe & Account Deletion (`DataDeletionReceipt`)

1. **Single-Session Wipe (`POST /api/sessions/:id/wipe`, `DELETE /api/sessions/:id`, or WS `session.wipe`)**:
   - Verifies session ownership (`assertOwnership`, `403 FORBIDDEN` on cross-user target).
   - Stops timers, clears active `PipelineTracker` & `MetricsCollector` session handles, and closes ASR stream immediately.
   - Executes transactional SQLite cleanup: deletes `session_events`, `session_reflections`, `telemetry_records`, `sessions`, and session-linked `memories` (`source_session_id`), while unlinking `usage_ledger.session_id = NULL` for billing quota integrity.
   - Emits WS `session.wiped` (on WS path) or HTTP `200 DataDeletionReceipt` detailing `deletedScopes`, `preservedRecords`, and `thirdPartyCaveats`.
2. **Full Account Data Erasure (`DELETE /api/account/data`)**:
   - Deletes owned rows in `sessions`, `presentation_packs`, `memories`, `session_reflections`, `session_events`, `telemetry_records`, `usage_ledger`, and `auth_tokens`.
   - Revokes active `entitlements` (`status = 'revoked'`) and records a minimal `account_wiped` marker in `billing_audit_log`.
   - Returns HTTP `200 DataDeletionReceipt` enumerating all erased counts alongside preserved `billing_audit_logs` and `thirdPartyCaveats`.
