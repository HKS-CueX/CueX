# CueX Product Metrics & Commercial Funnel Specification

> Companion to: [PRODUCT_VISION.md](./PRODUCT_VISION.md), [PRESENTATION_PRD.md](./PRESENTATION_PRD.md), and `docs/business/GTM_PLAN.md`  
> Telemetry Foundation: `@cuex/protocol` v2 (`TelemetryUsage`, `UsageRecord`, `Outcome`, `UtilitySummary`)  
> Honesty Standard: Distinguish **implemented runtime/eval metrics** (`[本地实测/协议支持]`) from **post-launch SaaS analytics** (`[上线后埋点待建]`).

---

## 1. North Star & Core Cognitive Quality Metrics

CueX rejects vanity metrics like "tokens generated per session" or "screen time." The primary product metric measures **cognitive assistance per unit of attention disrupted**:

| Metric ID | Formula / Definition | Target Direction | Provenance & Status |
| --- | --- | --- | --- |
| **Net Cognitive Utility ($V$)** | $V = H - \lambda I$ (default $\lambda = 2$, where $H$ = helpful/recovered interventions, $I$ = distracting/unwithdrawn interruptions) | Higher ($> 0$; higher on `L0` when fluent) | **Implemented** in `PresentationReflection.ts` & `eval-presentation.ts` |
| **False Intervention Rate (`FIR`)** | `(ungrounded_shown + pause_only_triggered + distracting_count) / max(1, live_sessions)` | $\approx 0\%$ (`pause_only` = `0` enforced by Controller) | **Implemented** in `InterventionController.ts` & offline eval |
| **Auto-Withdrawal Rate (`AWR`)** | `autoWithdrawCount / max(1, totalInterventionsShown)` (excluding explicit `user_dismissed`) | High on natural speaker recovery (`user_recovered` / `chapter_changed`) | **Implemented** in `PresentationRuntime.ts` |
| **Zero-Hallucination Grounding Rate** | `grounded_or_explicit_missing_notice / total_qa_interventions` | **$100\%$** (`ungrounded_evidence` blocked by Controller) | **Implemented** in `RetrievalProvider.ts` & `SlowReasoningAdapter.ts` |
| **Cue Reaction Latency ($T_{\text{cue}}$)** | `shownAt - triggerSegmentEndAt` (or `speech.final` -> `intervention.shown`) | Local S1/S2 fallback `< 150 ms`; Cloud S2 target `< 1,500 ms` | Tracked via `TelemetryUsage.latencyMs`; online cloud requires live benchmark |
| **Live-to-Rehearsal Closure Ratio** | `% of users running >= 1 weak-segment rehearsal or saving >= 1 Reflection insight before a Live event` | `>= 50%` during Event window | `[上线后埋点待建]` via `UsageRecord` & session mode |

---

## 2. User Activity & Free Funnel Taxonomy (`No Blurred MAU`)

To avoid inflated SaaS vanity counts, CueX enforces four mutually exclusive user population definitions synced across Engineering & Business models:

| Cohort Term | Strict Definition | Billing / Cost Relevance |
| --- | --- | --- |
| **`registeredUsers`** | Unique `UserAccount` records created (`createdAt` recorded) | Marketing top-of-funnel / onboarding baseline; zero ongoing compute cost if inactive |
| **`freeMau`** | Registered non-paying accounts with $\ge 1$ authenticated API or WebSocket action within rolling `30 days` | Includes browse/compile-only users (`DocumentExtractor` / `CompilerView`) |
| **`activeFreeUsers`** | Subset of `freeMau` initiating $\ge 1$ live or rehearsal `Session` consuming ASR/S1/S2 budget within rolling `30 days` | **Direct COGS driver** for Free subsidy allocation in `UNIT_ECONOMICS.md` |
| **`paidUsers`** | Accounts holding an active `Entitlement` for `event` (`14d` window) or `pro` (`30d` / `365d` cycle) (`Team` = `planned`) | Revenue-generating base used for direct contribution margin & churn analysis |

---

## 3. Mandatory 12-Stage Commercial & Product Funnel

Every stage defines an unambiguous **denominator**, **observation window**, **trigger event (`UsageRecord` / `EventEnvelope`)**, and **authoritative data source**:

| Stage | Funnel Step | Exact Ratio / Denominator | Observation Window | Authoritative Trigger Event | Primary Data Source |
| --- | --- | --- | --- | --- | --- |
| **1. Acquisition (Visitor -> Signup Visit)** | Landing / Demo CTA Click -> Signup Start | `signup_started / unique_landing_visitors` | Rolling `7 days` | `ui.cta.start_trial` (`[上线后埋点]`) | Web Analytics / Edge Access Log |
| **2. Registration (`registeredUsers`)** | Account Created | `accounts_created / signup_started` | `24 hours` from landing click | `auth.account.created` | SQLite `users` table (`UserAccount`) |
| **3. First Material Ingestion** | Upload / Paste / Sample Pack Load | `first_extract_users / registeredUsers` | `7 days` post-registration | `document_extract` (`status !== 'rejected'`) | `UsageRecord` (`usage_ledger`) |
| **4. Pack Compilation (`Aha Prep`)** | Compile Cue Sheet + Fact Whitelist + QA Cards | `first_compile_users / first_extract_users` | `24 hours` post-extract | `context_compile` (`PACK_SCHEMA_VERSION=2`) | SQLite `presentation_packs` + `usage_ledger` |
| **5. Fact Whitelist Verification** | User Reviews, Edits, or Locks $\ge 1$ Fact | `fact_verified_users / first_compile_users` | `48 hours` post-compile | `presentation.pack.fact_locked_or_confirmed` | SQLite `presentation_packs.data_json` (`userConfirmed`) |
| **6. First Rehearsal Boot (`Activation`)** | Consent Accepted & First Rehearsal Session > 2 min | `activated_rehearsal_users / first_compile_users` | `7 days` post-registration | `session.ended` (`mode='rehearsal' && durationSec>=120`) | SQLite `sessions` + `usage_ledger` |
| **7. First Reflection & Single-Point Rehearsal** | Views Reflection (`V = H - λI`) or Practices Weak Segment | `reflected_users / activated_rehearsal_users` | `24 hours` post-rehearsal | `reflection.viewed` / `rehearsal.weak_segment_started` | SQLite `session_reflections` |
| **8. Live Stage Delivery (`activeFreeUsers` / Live)** | Completes $\ge 1$ `live` Presentation Session | `live_completed_users / activated_rehearsal_users` | `14 days` post-activation | `session.ended` (`mode='live'`) | SQLite `sessions` (`mode='live'`) |
| **9. Free Quota Cap / Paywall Encounter** | Hits Free Minutes / Session Limit or Selects `Event`/`Pro` | `paywall_seen_users / activeFreeUsers` | Rolling `30 days` | `QUOTA_EXCEEDED` (`402`) or checkout preview | `usage_ledger` / `POST /api/billing/checkout-preview` |
| **10. Initial Paid Conversion (`Event` or `Pro`)** | Completes Payment Webhook / Entitlement Activation | `first_paid_users / registeredUsers` (and `/ paywall_seen_users`) | `30 days` post-registration | `payment.succeeded` (`PaymentWebhookEvent`) | SQLite `entitlements` + `billing_audit_log` |
| **11. Upgrade / Repeat Purchase (`Event` -> `Pro`)** | `Event` Buyer Upgrades to `Pro` OR Purchases 2nd `Event` | `(upgraded_to_pro + repeat_event) / event_buyers` | `90 days` post-1st `Event` | `entitlement_granted` (`PaymentWebhookEvent`) | SQLite `billing_audit_log` |
| **12. Retention & Net Revenue Retention (`D30/M3`)** | Active Paid Renewal Minus Refunds/Churn | `retained_m3_mrr / cohort_m0_mrr` | Monthly cohorts (`M1`, `M3`, `M6`) | `entitlement_granted` minus `refund_recorded` | SQLite `billing_audit_log` (`PaymentWebhookEvent`) |

---

## 4. Telemetry Cost & Usage Provenance Rules

To prevent the Phase 1 financial drift identified in [PHASE2_AUDIT.md §Q7, §Q9](../engineering/PHASE2_AUDIT.md), every product dashboard report MUST slice metrics by `TelemetryMeasurementSource` (`usageSource`):
- **`provider_reported`**: Exact prompt/output/cache tokens returned by live LLM or ASR provider response headers/metadata, billed into `TelemetryUsage.costFen`.
- **`local_rule_zero`**: Exact `0` cloud LLM cost for `HeuristicFastDecisionProvider`, `LexicalBm25RetrievalProvider`, `LocalSlowReasoningProvider`, and `TextOnlyAsr`.
- **`estimated`**: Clearly flagged client/heuristic approximation used only when upstream provider omits token counts (e.g., browser Web Speech minute estimation).

> Note: Product telemetry tracks aggregate operational funnel steps without persisting raw speaker transcripts inside marketing/analytics warehouses ([PRIVACY_DATA_MAP.md](../privacy/PRIVACY_DATA_MAP.md)).
