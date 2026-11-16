# CueX Multi-Environment Deployment Runbook

> Canonical Deployment Guide for **`CueX`** (`@cuex/protocol` + `@cuex/server` + `@cuex/web`)  
> Environment Matrix: **`development`** | **`test`** | **`staging`** | **`production`**  
> Authoritative Config Loader: `apps/server/src/config.ts` (`loadServerConfig`)  
> Related Templates: `.env.example`, `infra/deploy/cuex.service.example`, `infra/deploy/nginx.conf.example`

---

## 1. Environment Differentiation Matrix

| Dimension | `development` (Localhost) | `test` (Automated CI / Local Offline) | `staging` (Pre-Prod Verification) | `production` (Customer-Facing) |
| --- | --- | --- | --- | --- |
| **`CUEX_ENV` / Mode** | `development` (`pnpm demo`) | `test` (`CUEX_TEST_OFFLINE=1 pnpm test`) | `staging` (`node`/`tsx` behind TLS Nginx) | `production` (hardened systemd + TLS Nginx) |
| **SQLite Path (`CUEX_SQLITE_PATH`)** | `.cuex-runtime/cuex.db` | Ephemeral `os.tmpdir()` per test run | `/var/lib/cuex-staging/cuex.db` (WAL + encrypted backup) | `/var/lib/cuex/cuex.db` (WAL + hot `VACUUM INTO` backups) |
| **Auth Policy (`CUEX_AUTH_REQUIRED`)** | `true` default (dev session bootstrap via `POST /api/auth/session`) | `true` (per-user isolation tested across tokens) | `true` (strict origin + bearer token) | **`true` enforced at startup** (`config.ts` throws if `false` in `production`) |
| **Allowed `Origin`s** | Loopback (`127.0.0.1` / `localhost`) | Loopback ephemeral ports | Explicit staging origin (`CUEX_ALLOWED_ORIGINS`) | Strict production HTTPS domain (`CUEX_ALLOWED_ORIGINS`) |
| **System 1 / System 2** | `fake` default (or optional local `llama.cpp` / API key) | Strictly `fake` (`0` external cost, deterministic) | Staging cloud/GPU keys with rate caps | Configured cloud S2 / local S1 with `Fallback*Provider` safety |
| **ASR Mode (`CUEX_ASR`)** | `fake` (`TextOnlyAsr` + Web Speech / text sim) or `real` (`local_sherpa` / `remote_sherpa`) | Strictly `fake` (`TextOnlyAsr`) | Configured Sherpa / test endpoint | Local/Remote Sherpa or Web Speech (`AsrCapabilityStatus` truthful) |
| **Billing / Webhook** | Sandbox preview (`CUEX_WEBHOOK_SECRET` unset -> `501 PAYMENT_NOT_CONFIGURED`) | Sandbox / signed HMAC webhook tests | Merchant **sandbox** webhook secret | Official WeChat Pay / Alipay merchant keys (`501 PAYMENT_NOT_CONFIGURED` until set) |

---

## 2. Prerequisites & Quick Local Build

- **Node.js `>= 22.19`** (built-in `node:sqlite` + native TypeScript test support verified on Node 26)
- **`pnpm@9.15.9`**

```bash
git clone https://github.com/HKS-CueX/CueX.git
cd CueX
cp .env.example .env
pnpm install --frozen-lockfile
pnpm build
pnpm demo
```

- Web UI (`development`): `http://127.0.0.1:5173`
- Server Gateway: `http://127.0.0.1:8765` (`GET /health`, `/api/*`, WS `/ws`)

---

## 3. Authoritative Environment Variables (`.env.example` & `apps/server/src/config.ts`)

> Note (`ADR-004`): Legacy external speech-synthesis environment variables and scripts are retired and removed; live CueX Presentation never synthesizes spoken audio.

| Variable | Default / Example | Environment Scope & Purpose |
| --- | --- | --- |
| `CUEX_ENV` | `development` | `development \| test \| staging \| production` (falls back from `NODE_ENV` if unset) |
| `HOST` / `PORT` | `127.0.0.1` / `8765` | Bind loopback behind Nginx reverse proxy in staging/prod |
| `CUEX_RUNTIME_DIR` | `.cuex-runtime` | Root directory for runtime data (`CUEX_SQLITE_PATH`, legacy migration backups, eval logs) |
| `CUEX_SQLITE_PATH` | `.cuex-runtime/cuex.db` | Authoritative `node:sqlite` WAL database file (`migrations.ts`) |
| `CUEX_MEMORY_DIR` / `CUEX_PACKS_DIR` | `.cuex-runtime/memory`, `.cuex-runtime/packs` | Legacy Stage 1 JSON import sources (migrated cleanly once into SQLite with `.bak` backups) |
| `CUEX_AUTH_REQUIRED` | `true` | Enforce bearer token auth on protected routes; **cannot be `false` when `CUEX_ENV=production`** |
| `CUEX_AUTH_TOKEN_TTL_HOURS` | `24` | Expiration TTL for issued `auth_tokens` SHA-256 records |
| `CUEX_ALLOWED_ORIGINS` | *(empty -> loopback in dev)* | Comma-separated `Origin` allowlist enforced by `OriginGuard.ts` |
| `CUEX_RATE_LIMIT_RPM` | `120` | Sliding-window RPM limit per bucket (`auth`, `webhook`, `api`, `ws`) |
| `CUEX_MAX_UPLOAD_MB` | `15` | Max `.pptx`/`.pdf`/`.md`/`.txt` document upload size (`DocumentExtractor`) |
| `CUEX_RETENTION_DAYS` | `90` | Configured data retention policy horizon metadata |
| `CUEX_SYSTEM1` / `CUEX_S1_*` | `fake` | `fake` (deterministic heuristic) or `real` (`LlamaSystemOne` URL/key/model/tokens) |
| `CUEX_SYSTEM2` / `CUEX_S2_*` | `fake` | `fake` (local grounded synthesizer) or `real` (`PiSlowReasoningProvider` via OpenAI/Anthropic API) |
| `CUEX_ASR` / `CUEX_ASR_*` | `fake` | `fake` (`TextOnlyAsr`) or `real` (`local_sherpa` model dir / `remote_sherpa` `CUEX_ASR_REMOTE_WS_URL`) |
| `CUEX_COOLDOWN_MS` / `CUEX_CANDIDATE_TTL_MS` | `15000` / `12000` | `InterventionController` pacing & expiry defaults |
| `CUEX_DISMISS_SUPPRESSION_MS` / `CUEX_HESITATION_SILENCE_MS` | `45000` / `1600` | Dismissal suppression window & pause trigger threshold |
| `CUEX_UTILITY_LAMBDA` | `2` | Default disruption multiplier $\lambda$ in $V = H - \lambda I$ |
| `CUEX_WEBHOOK_SECRET` | *(unset -> sandbox)* | HMAC-SHA256 signing secret for `POST /api/billing/webhook*`; webhooks return `501 PAYMENT_NOT_CONFIGURED` if unset |

---

## 4. Production Hardening Checklist (`staging` & `production`)

1. **Systemd & Reverse Proxy**: Deploy via `infra/deploy/cuex.service.example` (non-root user, loopback `127.0.0.1:8765`) behind Nginx (`infra/deploy/nginx.conf.example`: TLS 1.2+, `client_max_body_size 20m`, WebSocket Upgrade headers on `/ws`, `proxy_read_timeout >= 3600s` for long talks).
2. **External GPU / Cloud Model Boundary**: Local `llama.cpp` GPU servers (`infra/windows/`) and native Sherpa C++ ONNX weights are **external runtime dependencies** not included in CI; validate `GET /health` after starting external bridges.
3. **Pre-Cutover Verification**: Always run `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:public-data`, `pnpm check:legacy`, `pnpm --filter @cuex/server eval`, `node --test apps/web/test/presentation-e2e.test.mjs`, and verify `pnpm db:backup` snapshot + restore drill ([BACKUP_AND_RECOVERY.md](./BACKUP_AND_RECOVERY.md)) before enabling live customer traffic.
