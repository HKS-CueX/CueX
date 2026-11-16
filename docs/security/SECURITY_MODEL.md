# CueX Security Model & Threat Controls

> Governance Disclaimer: This document maps CueX's architecture, code controls, and verification suites to **`OWASP ASVS 5.0.0` strictly as an internal engineering verification reference — NOT a third-party security audit, accreditation, or certification.**  
> Audit Basis: [PHASE2_AUDIT.md](../engineering/PHASE2_AUDIT.md) (`Q2`, `Q3`, `Q5`, `Q6`, `Q8`, `Q11`)

---

## 1. Trust Boundaries & Attack Surfaces

1. **Boundary A — Browser Client (`apps/web`) <-> Gateway (`apps/server`)**: Untrusted REST payloads (`compile`, `extract`, `memory`, `billing`), WebSocket frames (`/ws`), `Origin` headers, and uploaded binaries (`.pptx`, `.pdf`, `.md`, `.txt`).
2. **Boundary B — Tenant A <-> Tenant B (`StorageRepository` / `node:sqlite`)**: Cross-user reads/writes/deletions on packs, sessions, reflections, memories, entitlements, and usage exports.
3. **Boundary C — Payment Provider Webhooks <-> Billing Engine**: Untrusted inbound HTTP webhook requests attempting spoofed subscription activation or replay attacks.
4. **Boundary D — Gateway <-> Upstream Model/ASR Providers**: Outbound credentials (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / Sherpa remote WS), untrusted document text / speaker transcripts entering System 2 prompts (prompt injection risk), and secret exposure in logs/traces.
5. **Boundary E — Source Tree & Supply Chain**: Secrets, personal local paths, legacy domain terms or retired external speech-synthesis dependencies (`ADR-004`), and build provenance.

---

## 2. Concrete Threat Mitigations & Code Controls

| Threat | Severity | Concrete Control & File/Module Location | Verification Test |
| --- | --- | --- | --- |
| **ZIP Bomb / Inflate OOM DoS via `.pptx` or `.pdf`** (`RISK-01`) | `P0` | `GatewayServer.ts` enforces HTTP body byte limits (`CUEX_MAX_UPLOAD_MB=15` default); `DocumentExtractor.ts` validates magic bytes/MIME, blocks path traversal/XXE, caps ZIP entries (`<= 512`), sets bounded `maxOutputLength` on `inflateRawSync`/`inflateSync`, limits cumulative uncompressed size & compression ratio, returning `status: 'rejected'` (`VALIDATION_ERROR`). | `apps/server/test/presentation-doc-compiler.test.ts` (ZIP bomb, ratio, oversized entry, magic bytes). |
| **Cross-Tenant IDOR / Unauthorized Wipe** (`RISK-03`) | `P0` | `AuthService.ts` validates SHA-256 hashed bearer tokens stored in SQLite `auth_tokens` (`POST /api/auth/session`, TTL `CUEX_AUTH_TOKEN_TTL_HOURS=24`, fail-closed in `CUEX_ENV=production`) and calls `assertOwnership()` across packs, memory, sessions, reflections, export, and wipes (`401`/`403`). | `apps/server/test/security-and-isolation.test.ts` (`401 UNAUTHORIZED` / `403 FORBIDDEN`). |
| **SQL Injection (`node:sqlite`)** | `P0` | `SqliteStorageRepository` (`SqliteRepository.ts`) uses parameterized prepared statements exclusively; zero raw string SQL interpolation of user input. | `apps/server/test/storage-migration-backup.test.ts` & code inspection. |
| **Malformed Input & API/WS Burst Abuse** (`RISK-04`) | `P1` | Zero-dep `validate*` guards (`@cuex/protocol/src/validation.ts`) + `validateClientMessage()` reject malformed inputs (`400 VALIDATION_ERROR` / `session.error`) before business logic; `RateLimiter.ts` enforces per-bucket sliding-window limits returning `429 RATE_LIMITED` + `Retry-After`. | `packages/protocol/test/validation.test.ts` & `apps/server/test/security-and-isolation.test.ts`. |
| **Prompt Injection & Hallucinated Metrics in Uploaded Slides / Live Speech** | `P1` | `PromptGuard.ts` (`sanitizeUntrustedText`, `wrapUntrustedPromptBlock`) isolates untrusted transcript/doc blocks in `<untrusted_data>` tags; `verifyCandidateGrounding()` (`RetrievalProvider.ts`) & `SlowReasoningAdapter.ts` block `forbiddenClaims[]` and unconfirmed numbers, surfacing `missingEvidenceNotice` on missing answers. | `apps/server/test/retrieval-and-providers.test.ts` & `eval-presentation.ts`. |
| **Spoofed Payment Webhooks / Replay Double Billing** | `P1` | `SandboxPaymentProviderAdapter` verifies HMAC-SHA256 signature (`x-cuex-signature` / `x-webhook-signature`) via `timingSafeEqual` and enforces unique `idempotencyKey` in SQLite `billing_audit_log` & `usage_ledger`. Without `CUEX_WEBHOOK_SECRET`, webhooks return `501 PAYMENT_NOT_CONFIGURED`. | `apps/server/test/reliability-and-quota.test.ts` & `api-contract.test.ts`. |
| **Secret Leakage in Logs, Repo & LLM Output** | `P1` | `Logger.ts` (`redactLogText`, `redactLogValue`) & `system2/config.ts` (`redact()`) scrub API keys and bearer tokens before log/error serialization; `scripts/check-public-data.mjs` blocks keys, phones, private IPs, and host workstation home-directory paths; `.env` stays gitignored. | `node scripts/check-public-data.mjs` in CI (`check-public-data`). |
| **Cross-Site WebSocket Hijacking (CSWSH) / CORS Abuse** | `P1` | `OriginGuard.ts` validates `Origin` on HTTP and `/ws` upgrades (`CUEX_ALLOWED_ORIGINS` in staging/prod; loopback allowlist in local dev; `403 FORBIDDEN` on rejected origin). | `apps/server/test/security-and-isolation.test.ts` origin rejection test. |

---

## 3. OWASP ASVS 5.0.0 Verification Mapping *(Engineering Reference Only)*

| ASVS 5.0.0 Chapter / Area | Control Requirement | CueX Implementation Control | Verification Status |
| --- | --- | --- | --- |
| **V1 — Architecture, Design & Threat Modeling** | Explicit trust boundaries, decoupled policy gatekeeper, documented security architecture | Modular monolith + `StorageRepository` (`ADR-001`), sole `InterventionController` gatekeeper, `SECURITY_MODEL.md` & `PHASE2_RISK_REGISTER.md` | **Stage B landed & verified** |
| **V2 / V3 — Authentication & Session Management** | Authenticated session tokens, expiration, revocation, production fail-closed | SHA-256 hashed bearer tokens in SQLite `auth_tokens`, configurable TTL (`CUEX_AUTH_TOKEN_TTL_HOURS=24`), logout revocation, `CUEX_AUTH_REQUIRED` locked `true` in `production` | **Stage B landed & verified** |
| **V4 — Access Control** | Deny by default; enforce per-object ownership checks | `assertOwnership()` + `user_id` scoping across packs, sessions, reflections, memories, export, and wipes (`401`/`403`) | **Stage B landed & verified** |
| **V5 — Validation, Sanitization & Encoding** | Strict positive schema validation, decompression bomb limits, output encoding | `@cuex/protocol` `validate*` guards, `PromptGuard.ts`, `DocumentExtractor` ZIP/PDF `maxOutputLength` & ratio/entry caps, React JSX escaping | **Stage B landed & verified** |
| **V6 / V8 — Cryptography & Data Protection** | Secure hashing, TLS in transit, secret redaction, minimal PII retention | `SHA-256` token/content hashing, HMAC-SHA256 `timingSafeEqual` webhook verification, `redact()` / `redactLogText()`, synchronous wipes + `DATA_RETENTION.md` | **Stage B landed & verified** |
| **V10 / V11 — Business Logic & Anti-Automation** | Enforce quota & idempotency invariants against race conditions & floods | Atomic transactional SQLite `reserveSessionQuotaAtomically()`, `usage_ledger` idempotency keys (`402 QUOTA_EXCEEDED`), HTTP/WS `RateLimiter` (`429`) | **Stage B landed & verified** |
| **V12 / V14 — File Handling & Configuration Hygiene** | Restrict file parsers, remove dead network endpoints, lockfile integrity, SBOM | Bounded `.pptx`/`.pdf` parser (`DocumentExtractor`), retired external speech-synthesis endpoints & scripts removed in Stage B (`ADR-004`), `pnpm install --frozen-lockfile`, `generate-sbom.mjs`, `check-legacy-domain.mjs`, `pnpm audit` | **Stage B landed & verified** |
| **V16 — Security Logging & Error Handling** | Non-leaking unified error envelopes; trace correlation without secret dump | Unified `ApiErrorResponse` codes (`errors.ts`), redacted `StructuredLogger` + `MetricsCollector` (`GET /api/observability/summary`) | **Stage B landed & verified** |
