# CueX Test Strategy (8-Layer Test Pyramid)

> Scope: Automated Quality & Verification Governance across `@cuex/protocol`, `@cuex/server`, `@cuex/web`, Commercial Metrics Sync, SQLite Backup Drills, and Security/Domain Hygiene.  
> Execution Mode Rule: Distinguish **Deterministic Offline CI Gates** from **External Hardware / Cloud Smoke Tests** so offline mocks never masquerade as physical device benchmarks.

---

## 1. The 8-Layer Test Pyramid

| Layer | Name & Target | Tools / Commands | Blocking CI? | What It Proves / Honesty Scope |
| --- | --- | --- | --- | --- |
| **1. Static Type & Schema Contracts** | TypeScript strict compilation across workspace packages | `pnpm typecheck` (`packages/protocol`, `apps/server`, `apps/web`) | **Yes** | Zero type drift across `@cuex/protocol` v2, `@cuex/server`, and `@cuex/web` (`UtcIso8601`, `MoneyAmount`, `EventEnvelope`). |
| **2. Security, Privacy & Legacy Domain Hygiene** | Automated scanners over repo & deliverables | `pnpm check:public-data` (`scripts/check-public-data.mjs`) + `pnpm check:legacy` (`scripts/check-legacy-domain.mjs`) + `pnpm audit --audit-level=high` | **Yes** | Zero committed secrets/keys, zero local personal paths, zero reintroduced legacy vertical-domain or retired TTS code/doc drift, zero unpatched high CVEs. |
| **3. Protocol Validator & `v1 -> v2` Unit Tests** | `packages/protocol/test/*.test.ts` (`schemas-and-examples`, `v1-to-v2-compatibility`, `validation`, `versions-and-envelope`) | `pnpm --filter @cuex/protocol test` | **Yes** | Strict runtime validator acceptance/rejection (`validate*`), `toUtcIso8601()` edge cases, integer `amountFen` guards, JSON Schema & example alignment. |
| **4. Server Unit, Persistence, Security & Billing Isolation** | `apps/server/test/*.test.ts` (10 suites covering API contract, WS E2E, memory/reflection, doc compiler, quota/billing, retrieval/providers, controller, scenario conformance, security/isolation, migration/backup) | `CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test` + `pnpm db:backup --self-test` | **Yes** | `InterventionController` 11-gate + 7 auto-withdraw rules, `LexicalBm25RetrievalProvider` grounding, `node:sqlite` restart & backup integrity, cross-tenant `401/403`, ZIP-bomb `DocumentExtractor` rejection, rate limiting, `usage_ledger` idempotency, HMAC webhooks, and export/wipe receipts. |
| **5. Web Client Reducer & Helper Tests** | `apps/web/test/{presentation-reducer.test.ts,web-helpers.test.ts}` | `pnpm --filter @cuex/web test` | **Yes** | Client state reducer transitions (`L0–L3`, withdrawal exit, `serverSeq` reconnect dedup, upload pre-validation, error mapping, UTC formatting). |
| **6. Cognitive Behavior & Utility Eval Harness** | `apps/server/scripts/eval-presentation.ts` | `CUEX_SYSTEM1=fake CUEX_SYSTEM2=fake CUEX_ASR=fake pnpm --filter @cuex/server eval` | **Yes** | Deterministic 6-case benchmark verifying $V = H - \lambda I$, pause-only suppression (`0` false interventions), auto-withdrawal on recovery/chapter shift, live Q&A grounding & missing-evidence notice. **Explicitly deterministic local logic — not GPU/cloud LLM score.** |
| **7. End-to-End Headless Browser (`Playwright`)** | `apps/web/test/presentation-e2e.test.mjs` | Real built Web + Server (`pnpm build` + `node --test apps/web/test/presentation-e2e.test.mjs`) | **Yes** | Real browser flow covering `HomeView` / `CompilerView` / `StageView` (`Focus` + `Split Strip` + `Inspector`) / `ReflectionView` / `AccountPanel` isolation, plans, sandbox checkout, JSON/Markdown export, session wipe, and desktop/mobile zero-overflow layouts. |
| **8. Commercial Sync, Supply Chain & External Hardware Smoke** | `ppt/scripts/verify-metrics-sync.mjs`, `scripts/generate-sbom.mjs`, external GPU/Sherpa smoke | `npm --prefix ppt run verify:sync` + `node scripts/generate-sbom.mjs --output .cuex-runtime/sbom-and-checksums.json` (**CI/Release**); real `llama.cpp` / Sherpa ONNX / Cloud LLM (**Manual Pre-Release**) | **Sync/SBOM: Yes; Real HW: Pre-Prod Manual** | Prevents doc/slide metric drift; produces SHA-256 SBOM; separately validates real GPU System 1, native ONNX ASR, and cloud S2 before production launch. |

---

## 2. Anti-Flakiness & Test Integrity Rules

1. **Zero Skipped or Relaxed Assertions on Release**: Any check skipped due to absent external hardware/credentials MUST be logged explicitly and CANNOT count toward green release pass claims (`TEST_REPORT.md` separates offline CI suites from manual hardware runs).
2. **Ephemeral Isolation**: All automated DB/backup tests use unique `os.tmpdir()` SQLite paths ([BACKUP_AND_RECOVERY.md](../operations/BACKUP_AND_RECOVERY.md)) cleaned up on exit.
3. **Negative & Boundary Cases Required**: Every `P0`/`P1` risk (`RISK-01`..`RISK-11`) requires explicit negative verification (crafted ZIP bomb, tampered webhook signature, cross-user `packId` read, unconfirmed memory write, duplicate `idempotencyKey`, WS reconnect replay after disconnect, legacy term & public-data guards).
