# ADR-003: Multi-Tenant Session Auth, Atomic `UsageLedger` & Privacy Audit Boundary

- **Status**: Accepted & Implemented (Phase 2 Stage B)
- **Date**: `2026-11-16`
- **Audit Drivers**: [PHASE2_AUDIT.md §Q2, §Q6, §Q10](../PHASE2_AUDIT.md#q2-multi-tenant-authentication-authorization--resource-isolation-缺失待-stage-b-落地-severity-p0)

## Context

Phase 1 `CueXGatewayServer` (`GatewayServer.ts:280-420`) exposed `/api/presentation/packs`, `/api/memory`, and `/api/sessions/:id/*` with zero user identity, zero authorization checks, zero usage metering, and zero plan/quota enforcement. Furthermore, `/api/sessions/:id/wipe` deleted session runtime data without clarifying interactions with future commercial billing logs, offline SQLite backups, or external third-party ASR/LLM provider retention.

## Decision

1. **Tenant-Scoped Bearer Session Authentication**:
   - Introduce `UserAccount`, `AuthSessionResponse`, and opaque SHA-256 hashed bearer tokens persisted in `auth_tokens` (`Authorization: Bearer <token>` on REST; `?token=...` query/subprotocol on `/ws` upgrades).
   - In local dev/test mode (`CUEX_ENV=dev` with optional `CUEX_AUTH_REQUIRED=false`), allow single-click deterministic demo login while still enforcing `userId` ownership isolation across distinct users (`401 UNAUTHORIZED` / `403 FORBIDDEN`); in `CUEX_ENV=production`, auth enforcement is locked `true` fail-closed.
   - Every persisted pack, session, reflection, memory item, entitlement, and export is strictly keyed and filtered by `userId` (`tenantId?`).
2. **Atomic `Entitlement` & Idempotent `UsageLedger`**:
   - Define `PlanId = 'free' | 'event' | 'pro' | 'team'`, with **`Team` explicitly flagged `status: 'planned'`** until team RBAC & shared workspaces ship.
   - Enforce pre-session entitlement quota checks on `session.start` / `compile`, returning typed `QUOTA_EXCEEDED` errors rather than silent unlimited bypass.
   - Record all metered events (`UsageRecord`: session minutes, document compiles, Q&A lookups, rehearsal runs, ASR minutes, LLM token/cost attribution in `costFen`) atomically with `UNIQUE(user_id, idempotency_key)` so WS retries or crashes never double-bill.
3. **Honest Sandbox `PaymentProviderAdapter`**:
   - Provide `PaymentCheckoutPreviewRequest/Result` and signed `PaymentWebhookEvent` ingestion interfaces (`PAYMENT_NOT_CONFIGURED` cleanly surfaced when real WeChat Pay / Alipay merchant keys are unset). Never simulate live production merchant settlement or fake payment capture.
4. **Sovereign Privacy Wipe vs. Statutory Billing Audit Separation**:
   - Implement `GET /api/account/export` (`UserDataExportBundle`) and full deletion receipts (`DataDeletionReceipt`).
   - **Hard Disclosure Rule**: Executing `session.wipe` or account data deletion **immediately purges** local runtime transcripts, CognitiveEvents, Reflections, Packs, and `MemoryItem`s for that scope, **while preserving minimal anonymized/statutory `BillingAuditRecord` rows** (required for tax, refund, and anti-fraud ledger integrity), noting honestly that encrypted offline DB backups expire on rotation schedule and text/audio already dispatched to external 3rd-party LLM/ASR APIs cannot be recalled by CueX.

## Rejected Alternatives

- **Hard-Deleting `BillingAuditRecord` During User Wipe**: Rejected because deleting financial ledger & webhook audit rows breaks refund reconciliation, chargeback defense, and statutory tax recordkeeping. Separating operational PII/content (`sessions`, `memories`, `packs`) from minimal financial ledger `BillingAuditRecord` balances user privacy rights with commercial integrity.
- **Skipping Auth Until SaaS Launch**: Rejected because testing multi-tenant isolation, `QUOTA_EXCEEDED`, and ownership boundaries requires building `userId` scoping into `StorageRepository` schemas from Day 1 of Phase 2.

## Consequences

- **Positive**: Multi-tenant isolation verified in automated CI tests; real quota enforcement backing Free/Event/Pro packaging; honest compliance disclosure in `CONSENT_FLOW.md` and `DATA_RETENTION.md`.
- **Trade-off**: Existing Phase 1 clients and Playwright E2E scripts must attach a valid local auth session token in Stage B.
