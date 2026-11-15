# CueX Deployment & Operations Guide

> Repository: `HKS-CueX/CueX` (`refactor/universal-runtime-presentation`)  
> Runtime: **Universal Cognitive Runtime** + **CueX Presentation** (`apps/server` + `apps/web` + `@cuex/protocol`)

## 1. Prerequisites

| Dependency | Version / Notes | Required For |
| --- | --- | --- |
| Node.js | `>= 22.19` (`apps/server/package.json`) | Core server & Playwright/tsx tooling |
| pnpm | `9.15.9` (`packageManager`) | Workspace dependency & script management |
| Sherpa-ONNX (optional) | Native `sherpa-onnx-node` + model via `voice-fetch-asr-model.sh` or external `ws://` server | Real server-side PCM16 streaming ASR (`CUEX_ASR=real`) |
| `llama-server` (optional) | OpenAI/llama.cpp `/completion` endpoint (`CUEX_S1_URL`) | Real System 1 fast token classifier (`CUEX_SYSTEM1=real`) |
| LLM API Key (optional) | OpenAI-compatible or Anthropic provider (`CUEX_S2_*` or `PRIME_MODELS_JSON`) | Real System 2 `pi-ai` synthesis (`CUEX_SYSTEM2=real`) |

> By default (`CUEX_SYSTEM1=fake`, `CUEX_SYSTEM2=fake`, `CUEX_ASR=fake`), CueX runs **100% locally with zero paid API keys** using deterministic System 1 rules, BM25 evidence retrieval, grounded local System 2 synthesis, and Browser Web Speech / Text Simulation over WebSocket `speech.delta`.

---

## 2. Quick Local Startup

### Option A: One-Command Local Demo Orchestrator
From the repository root:
```bash
pnpm install
pnpm demo
```
*(Starts health probe -> `@cuex/server` on `http://127.0.0.1:8765` -> `@cuex/web` Vite dev server on `http://127.0.0.1:5173` via `scripts/demo.mjs`.)*

### Option B: Separate Server & Web Terminals
```bash
# Terminal 1 — Universal Cognitive Runtime & Presentation API/WS Server
pnpm --filter @cuex/server dev

# Terminal 2 — Vite React Web Client (proxies /api, /ws, /health to 127.0.0.1:8765)
pnpm --filter @cuex/web dev
```
Open `http://127.0.0.1:5173/` and click **一键载入 CueX 路演演示包** in `HomeView` (or **载入示例：CueX 路演演示包** in `CompilerView`) to load the built-in CueX pitch pack (`pack_cuex_demo_01`).

---

## 3. Environment Configuration (`.env`)

Copy `.env.example` to `.env` before overriding defaults:

```ini
HOST=127.0.0.1
PORT=8765

# Engine Modes ('fake' = deterministic local 0-token rules; 'real' = external engine + local fallback)
CUEX_SYSTEM1=fake
CUEX_SYSTEM2=fake
CUEX_ASR=fake

# Persistent Local Runtime Storage (defaults to <repo>/.cuex-runtime/*)
# CUEX_RUNTIME_DIR=/absolute/path/to/.cuex-runtime
# CUEX_MEMORY_DIR=/absolute/path/to/memory
# CUEX_PACKS_DIR=/absolute/path/to/packs

# Controller Guardrails (defaults shown)
# CUEX_COOLDOWN_MS=15000
# CUEX_CANDIDATE_TTL_MS=12000
# CUEX_DISMISS_SUPPRESSION_MS=45000
# CUEX_HESITATION_SILENCE_MS=1600
# CUEX_UTILITY_LAMBDA=2
```

### Enabling Real AI / ASR Backends
1. **Real System 1 (`CUEX_SYSTEM1=real`)**:
   - Configure `CUEX_S1_URL=http://127.0.0.1:18080`, `CUEX_S1_FORMAT=jev-v1` (or `chat` / `jevstyle-v1`), `CUEX_S1_TIMEOUT_MS=1460`.
   - If the upstream endpoint goes offline, `FallbackFastDecisionProvider` automatically degrades to `HeuristicFastDecisionProvider`.
2. **Real System 2 (`CUEX_SYSTEM2=real`)**:
   - Configure `CUEX_S2_PROVIDER`, `CUEX_S2_BASE_URL`, `CUEX_S2_MODEL`, `CUEX_S2_API_KEY` (or `PRIME_MODELS_JSON`). Supports `openai-completions` and `anthropic-messages`.
   - Secrets stay enclosed in `loadS2Runtime()` and error strings pass through `redact()`. Missing credentials cleanly degrade to `LocalSlowReasoningProvider`.
3. **Real Server-Side ASR (`CUEX_ASR=real`)**:
   - **Local Sherpa**: Run `apps/server/scripts/voice-fetch-asr-model.sh` or set `CUEX_ASR_MODEL_DIR` / `CUEX_MODEL_DIR`.
   - **Remote Sherpa WS**: Set `CUEX_ASR_URL=ws://127.0.0.1:6006`.
   - When `CUEX_ASR=fake`, `TextOnlyAsr` rejects raw binary `audio.chunk` with `ASR_TEXT_ONLY`, while Browser Web Speech API (`browser_webspeech`) and text simulation (`text_simulation`) work directly over WS `speech.delta`.

---

## 4. Build, Verification & Benchmark Commands

```bash
# Workspace TypeScript check
pnpm typecheck

# Production web bundle (outputs to apps/web/dist)
pnpm build

# Offline server test suite (controller, document extractor, retrieval, memory, WS E2E)
CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test

# Deterministic Presentation evaluation benchmark (outputs .cuex-runtime/eval-latest.{json,md})
pnpm --filter @cuex/server eval

# Frontend reducer tests & Playwright browser E2E
pnpm --filter @cuex/web exec vitest run test/presentation-reducer.test.ts
node --test apps/web/test/presentation-e2e.test.mjs

# Public-data secret check
node scripts/check-public-data.mjs
```

---

## 5. Production Static + Reverse-Proxy Notes

`CueXGatewayServer` (`apps/server/src/gateway/GatewayServer.ts`) serves **API + WebSocket traffic only** (`/health`, `/api/*`, `/ws`, `/ws/session` alias). In production:

1. Build frontend assets with `pnpm build` -> serve `apps/web/dist/` via Nginx/Caddy (SPA fallback `try_files $uri $uri/ /index.html;`).
2. Proxy both WebSocket upgrade (`/ws` and `/ws/session`) and REST routes (`/health`, `/api/`) to `http://127.0.0.1:8765` (reference template: `infra/deploy/nginx.conf.example`, configured with `location ~ ^/ws(/session)?$` and `client_max_body_size 20m` for up to 15 MB base64 Presentation uploads).
3. Start the backend service directly (or via `infra/deploy/cuex.service.example`):
   ```bash
   cd apps/server && NODE_ENV=production node --env-file=../../.env --import tsx src/index.ts
   ```
