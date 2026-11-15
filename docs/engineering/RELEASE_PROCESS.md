# CueX Release Engineering & Supply Chain Governance

> Governance Disclaimer: Supply-chain controls follow **`SLSA 1.2`** (Build Track / Source Provenance) and **`DORA`** delivery metrics **strictly as internal engineering practice references — NOT third-party certifications or compliance attestations.**

---

## 1. Supply Chain Security (`SLSA 1.2` Alignment Reference)

| Control Pillar | CueX Implementation | Verification Artifact |
| --- | --- | --- |
| **Source Integrity & Protected Branch Discipline** | Clean feature/refactor branch (`refactor/universal-runtime-presentation`) branched from `main` (`96cd742`), reviewed PRs/swarm QA gate prior to merge. | Git commit log & `PHASE2_PLAN.md` traceability |
| **Deterministic Locked Dependencies** | `packageManager: "pnpm@9.15.9"`, `pnpm-lock.yaml`, CI uses `pnpm install --frozen-lockfile`. Unused unofficial external speech-synthesis package retired and removed in Stage B (`ADR-004`). | `.github/workflows/ci.yml` + `pnpm audit --audit-level=high` |
| **Scripted Automated Build (`CI-Isolated`)** | Dedicated GitHub Actions workflow (`.github/workflows/ci.yml`, `permissions: contents: read`) executing typecheck, multi-layer tests, production bundle build, eval, E2E, public-data & legacy guards. | GitHub Actions Run Logs & Uploaded Artifacts |
| **SBOM & SHA-256 Artifact Checksums** | `node scripts/generate-sbom.mjs` parses `pnpm-lock.yaml`, workspace manifests, current Git revision, and key build/protocol/deliverable SHA-256 digests. | `deliverables/cuex-final/sbom-and-checksums.json` |

---

## 2. Mandatory Pre-Release Gate Checklist

No build may be promoted from `staging` to `production` (or packaged as an official release bundle) unless **all 8 items** pass at `HEAD`:

1. `pnpm typecheck` exits `0` across `@cuex/protocol`, `@cuex/server`, `@cuex/web`.
2. `pnpm --filter @cuex/protocol test` + `CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test` + `pnpm --filter @cuex/web test` pass `100%` (zero skipped assertions in CI scope).
3. `pnpm build` succeeds cleanly.
4. `CUEX_SYSTEM1=fake CUEX_SYSTEM2=fake CUEX_ASR=fake pnpm --filter @cuex/server eval` passes all cognitive cases (`V = H - λI`, zero pause-only false cues).
5. `node --test apps/web/test/presentation-e2e.test.mjs` passes cleanly against built bundle, and `pnpm db:backup --self-test` exits `0`.
6. `pnpm check:public-data` (`node scripts/check-public-data.mjs`) and `pnpm check:legacy` (`node scripts/check-legacy-domain.mjs`) both return `0` findings.
7. `npm --prefix ppt run verify:sync` passes cleanly (if commercial/deliverable templates touched) & `node scripts/generate-sbom.mjs --output .cuex-runtime/sbom-and-checksums.json` writes fresh checksums.
8. `docs/engineering/TEST_REPORT.md`, `CHANGELOG.md`, and `docs/api/{openapi,asyncapi}.yaml` reflect exact `HEAD` commit & results.

---

## 3. DORA 5 Metrics Operational Tracking *(Post-Deployment Operations)*

*(DORA — DevOps Research and Assessment — tracks engineering delivery & runtime reliability continuously once staging/production cadence stabilizes.)*

| DORA Metric | CueX Operational Definition | Source Signal | Initial Target Baseline (Seed/Beta SaaS) |
| --- | --- | --- | --- |
| **1. Deployment Frequency** | Frequency of validated commits promoted cleanly to `staging` / `production` | Git release tags + CI CD workflow runs | Weekly controlled releases (`>= 1 / week`) |
| **2. Lead Time for Changes** | Median time from merged PR on release branch to verified `production` health pass | GitHub PR merge timestamp -> prod `/health` timestamp | `< 24 hours` for tested fixes |
| **3. Change Failure Rate (`CFR`)** | `%` of `production` deployments requiring hotfix, emergency kill-switch (`INCIDENT_RESPONSE.md`), or rollback within 48h | Incident tickets + rollback tags | `< 10%` |
| **4. Failed Deployment Recovery Time (`MTTR`)** | Median elapsed time from `P0`/`P1` deployment regression alert to verified recovery | Alert open -> verified `/health` + E2E smoke green | `< 30 minutes` (`BACKUP_AND_RECOVERY.md`) |
| **5. Operational Reliability** | Sustained availability & low WS/API error rate (`Observability` SLO: `/health` uptime & `< 0.5%` HTTP `5xx`) | `cuex.http.requests.total`, `/health` synthetic probe | `>= 99.5%` active live stage availability |

---

## 4. Schema & Versioning Cutover Discipline

- Bump `API_VERSION` (`2026-11`), `WS_PROTOCOL_VERSION` (`2.0`), or `*SCHEMA_VERSION` (`SCHEMA_VERSIONING.md`) whenever backward-incompatible contract changes land.
- Run SQLite WAL hot snapshot (`VACUUM INTO`, `BACKUP_AND_RECOVERY.md`) strictly **before** executing schema migrations on `staging` or `production`.
