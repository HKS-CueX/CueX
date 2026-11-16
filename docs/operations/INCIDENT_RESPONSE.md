# CueX Incident Response Playbook

> Scope: Triage, Containment, Fallback Kill-Switches, Communication, and Postmortem Governance for `CueX` (`apps/server`, `apps/web`, `node:sqlite`).  
> Escalation Hierarchy: **`P0` (Critical Outage / Security Breach)** -> **`P1` (Degraded Core / Tenant Risk)** -> **`P2` (Non-Blocking Defect)** -> **`P3` (Minor Ops Issue)**

---

## 1. Severity Classification & Target Response

| Severity | Definition & Examples | Acknowledge SLA | Mitigation Strategy |
| --- | --- | --- | --- |
| **`P0`** | Cross-tenant data exposure, secret/key compromise, complete Gateway downtime (`GET /health` `503`), SQLite corruption, or unmitigated upload DoS crash. | **Immediate (`<= 15 min`)** | Isolate host/nginx traffic immediately; rotate credentials; restore verified snapshot (`BACKUP_AND_RECOVERY.md`). |
| **`P1`** | Cloud LLM or Remote ASR outage affecting live sessions, payment webhook failures, rate-limit false positives, or sustained `5xx` > 1%. | **`<= 30 min`** | Activate built-in **Deterministic Local Kill-Switches** (`CUEX_SYSTEM1=fake` / `CUEX_SYSTEM2=fake` / `CUEX_ASR=fake`) so live stage stays calm (`L0` + local heuristics) without dropping WebSockets. |
| **`P2`** | Single document parser format regression (`.pdf`/`.pptx`), non-blocking UI glitch, or CI build failure on non-prod branch. | **`<= 4 business hours`** | Hotfix PR gated by full CI suite (`TEST_STRATEGY.md`). |
| **`P3`** | Telemetry counter rounding discrepancy, doc typo, or minor visual alignment defect. | **Next planned sprint** | Track in standard engineering backlog. |

---

## 2. Standard Containment & Graceful-Degradation Switches

CueX's architecture enforces deterministic offline fallbacks so external AI failures NEVER crash active presenter sessions:

1. **Upstream Cloud LLM Outage (`PiSlowReasoningProvider` failing/throttling)**:
   - Automatic per-request fallback (`FallbackSlowReasoningProvider`) activates immediately on timeout.
   - If sustained outage occurs, set `CUEX_SYSTEM2=fake` in service env and reload (`systemctl restart cuex` or container rollout) to disable external LLM calls cleanly while preserving `LocalSlowReasoningProvider` grounded evidence lookup at `0` cost.
2. **Remote ASR / GPU System 1 Failure (`RemoteSherpaAsr` or `LlamaSystemOne` unreachable)**:
   - Set `CUEX_SYSTEM1=fake` (`HeuristicFastDecisionProvider`) and `CUEX_ASR=fake` (`TextOnlyAsr`), allowing `apps/web` `BrowserSpeechRecognizer` or manual `speech.delta` to continue operating while surfacing truthful `AsrCapabilityStatus` notices (`ASR_TEXT_ONLY`) in UI.
3. **Upload Parser Abuse / Flood (`DocumentExtractor`)**:
   - Tighten Nginx `client_max_body_size`, adjust `CUEX_MAX_UPLOAD_MB` / `CUEX_RATE_LIMIT_RPM`, and monitor HTTP error counts via `GET /api/observability/summary`.
4. **Secret Leak or Unauthorized Token Exposure**:
   - Rotate leaked `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `CUEX_WEBHOOK_SECRET` immediately; revoke active `auth_tokens` rows in `cuex.db` (`DELETE FROM auth_tokens;` or set `revoked_at`) to force re-authentication; run `pnpm check:public-data` across repo & recent commits.
5. **Payment Webhook Anomalies**:
   - Clear `CUEX_WEBHOOK_SECRET` so `SandboxPaymentProviderAdapter` reverts safely to `501 PAYMENT_NOT_CONFIGURED` rather than honoring unverified webhook payloads.

---

## 3. Incident Lifecycle & Blameless Postmortem

1. **Detect & Declare**: Identify failing alert (`OBSERVABILITY.md`) or user report; assign Incident Commander & log start UTC timestamp (`UtcIso8601`).
2. **Contain First**: Stop blast radius via kill-switches, rate limits, or rollback. Preserve WAL/DB snapshots before destructive recovery steps.
3. **Verify Recovery**: Probe `/health`, run smoke `compile` + WS `session.start` + `GET /api/sessions/:id/reflection`, and verify error rate returns to baseline.
4. **Postmortem (`<= 48 hours` for `P0`/`P1`)**: Record root cause, timeline, exact customer/billing impact, why tests missed it, and concrete `REQ-*` / regression test tickets to prevent recurrence.
