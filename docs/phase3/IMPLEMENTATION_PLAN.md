# CueX Phase 3 Implementation Plan (`CueX Phase 3: Real Validation, Frontend Excellence & Commercial Delivery`)

> **Baseline Reference**: Commit `7ad6ccb` on branch `refactor/universal-runtime-presentation` ([EXECUTION_BASELINE.md](./EXECUTION_BASELINE.md)).  
> **Non-Negotiable Rule**: Offline deterministic `CUEX_TEST_OFFLINE=1` CI suites (`local_rule_zero`) and live Colab GPU ASR + CPA LLM end-to-end tests remain strictly separated in telemetry, docs, and test reports.

---

## 1. Swarm Ownership & Disjoint Workstreams

| Role | Exclusive Owned Paths (Phase 3) | Primary Deliverables |
| --- | --- | --- |
| **`@auditor-docs`** | `docs/phase3/{EXECUTION_BASELINE,IMPLEMENTATION_PLAN,RISK_REGISTER,REAL_WORLD_VALIDATION_REPORT}.md`, root `README.md`, `docs/DEPLOYMENT.md`, `docs/engineering/*` (excluding `TEST_REPORT.md` & `CHANGELOG.md`), `docs/operations/*`, `docs/product/*`, `docs/architecture/*` | Phase 0 baseline/plan/risk docs -> Phase 2 Real-World Validation Report -> Phase 4/5 final docs sync |
| **`@protocol-architect`** | `packages/protocol/**`, `docs/api/{openapi,asyncapi}.yaml` | `@cuex/protocol` v2.1.0 extensions (`ColabAsrLifecycleState`, `colab_gpu` `AsrCapabilityStatus`, `provider_unreported`, `reasoningTokens`, `correlationId`) + OpenAPI/AsyncAPI sync |
| **`@colab-asr`** | `infra/colab/**`, `deliverables/cuex-final/mandatory/ai-employee-demo/demo-pack/**`, `.../evidence/colab-asr-report.json` | Colab G4 GPU ASR deployment (`:10086` HTTPS + WSS, Bearer auth, benchmarked SOTA ASR), reproducible notebook, >=12 WAV Mandarin/bilingual corpus, `colab-asr-report.json` |
| **`@runtime-server`** | `apps/server/**`, `deliverables/cuex-final/mandatory/ai-employee-demo/evidence/{cpa-llm-report,real-e2e-validation}.json` | Unified `CpaProviderAdapter` (sole LLM route across S1, S2, Compiler, Reflection), `ColabAsrProvider` (`asr-colab.ts`), `GatewayServer` 7-state ASR + `provider_unreported` telemetry, real validation suites |
| **`@presentation-web`** | `.cuex-runtime/screenshots/{before,after}/**`, `docs/design/{FRONTEND_AUDIT,CUEX_DESIGN_BRIEF}.md`, `apps/web/**` | Phase 0 BEFORE captures across 6 widths + `draw.mjs` brief -> Phase 3 frontend redesign (`Home`, `Compiler`, `Stage`, `Reflection`, `AccountPanel`, `MemoryInspectorPanel`, 7-state ASR/CPA telemetry UI) + AFTER Playwright E2E |
| **`@biz-deliverables`** | `docs/business/**`, `ppt/**`, `deliverables/cuex-final/**` (outside `mandatory/ai-employee-demo/`) | Phase 4/5 commercial & pitch sync incorporating verified Colab GPU + CPA real telemetry without inflating hypothetical claims |
| **`@qa-verifier`** | `docs/engineering/{TEST_REPORT,CHANGELOG}.md`, `/CueX-Universal-Presentation-Final.zip`, local Git commit on `refactor/universal-runtime-presentation` | Final independent QA sweep (offline CI + sanitized real reports + SBOM + zip + staged/working hygiene checks) |

---

## 2. Phase Gate Sequence & Technical Specifications

### Phase 0 — Research, Baseline Capture & Protocol Contracts *(In Progress)*
- **`@auditor-docs`**: Inspect git state, ASR/S1/S2/Compiler/Reflection/UI integration seams, sanitized `$HOME/.pi/agent/models.json`, 4 installed frontend skills, and `deliverables/cuex-final/`; publish `EXECUTION_BASELINE.md`, `IMPLEMENTATION_PLAN.md`, `RISK_REGISTER.md`.
- **`@protocol-architect`**: Backward-compatibly extend `@cuex/protocol` (v2.1.0):
  1. `ColabAsrLifecycleStateSchema` (`'not_configured' | 'starting' | 'ready' | 'degraded' | 'disconnected' | 'restarting' | 'unavailable'`).
  2. `AsrCapabilityStatusSchema` adding `'colab_gpu'` mode plus optional `lifecycleState`, `gpuName`, `modelId`, `rtf`, `lastHealthCheckAt`, `fallbackActive`, `fallbackReason`.
  3. `ProviderUsageRecordSchema` adding `'provider_unreported'` to `usageSource` plus optional `reasoningTokens`, `correlationId`.
  4. Sync `docs/api/{openapi,asyncapi}.yaml` and verify `pnpm --filter @cuex/protocol test && pnpm --filter @cuex/protocol build`.
- **`@presentation-web`**: Capture BEFORE screenshots in `.cuex-runtime/screenshots/before/` across `[1440, 1280, 1024, 768, 390, 360]`, run `design-taste-frontend` `draw.mjs --keep palette,type`, and publish `docs/design/FRONTEND_AUDIT.md` & `CUEX_DESIGN_BRIEF.md`.

### Phase 1 — Parallel Infrastructure: Colab GPU ASR (Workstream A) & CPA Backend (Workstream B)
- **Workstream A (`@colab-asr`)**:
  1. Re-adopt active G4 GPU assignment cleanly into `colab-cli` (`name="cuex-asr"`) without duplicating or stopping the VM; capture `nvidia-smi` hardware/VRAM telemetry.
  2. Configure `sshd` (`127.0.0.1:2222`), SSH key auth, and `frpc 0.71.1` tunnel (`10080` SSH, `10086` HTTPS/WSS ASR, `10010` UDP/TCP); verify remote access without committing keys/tokens/raw IPs.
  3. Benchmark 2 GPU Mandarin+English ASR stacks (e.g., FunASR `iic/SenseVoiceSmall` + FSMN-VAD vs `faster-whisper large-v3-turbo` / `paraformer-zh-streaming`) for load time, warmup, first-segment latency, final latency, RTF, VRAM, and CER; select winner on measured data.
  4. Ship `infra/colab/{start_asr.py,healthcheck.py,requirements.txt,.env.example,README.md,cuex-asr-deployment.ipynb}` enforcing Bearer auth (`401` on invalid token), ephemeral self-signed TLS cert (`SAN` saved ONLY to gitignored `.cuex-runtime/colab-asr-cert.pem`), request/size guards, zero audio disk retention, `/health`, `/ready`, `/v1/asr/transcribe`, and `/v1/asr/stream` (WSS PCM16LE 16 kHz).
  5. Build `>= 12` 16 kHz mono PCM16 WAV test corpus in `deliverables/cuex-final/mandatory/ai-employee-demo/demo-pack/audio/` (neural Mandarin voices + real acoustic/pace/filler/noise/drift/Q&A variants + ground-truth transcripts + transparent synthesis disclosure) and record `colab-asr-report.json`.
- **Workstream B (`@runtime-server`, after `@protocol-architect` build)**:
  1. Implement central `CpaProviderAdapter` (`CPA_BASE_URL`, `CPA_API_KEY`, `CPA_SYSTEM1_MODEL`, `CPA_SYSTEM2_MODEL`, `CPA_TIMEOUT_MS`, optional opt-in dev loader from `$HOME/.pi/agent/models.json` with secret redaction) supporting `/v1/responses` (`openai-responses`) and `/v1/chat/completions`, accounting `reasoning_tokens` cleanly (never starving output via tiny `max_tokens`), and reporting `'provider_unreported'` whenever real responses lack usage fields.
  2. Wire `CpaProviderAdapter` as the **sole** LLM gateway across System 1 LLM, System 2 grounded reasoning, Compiler optional LLM assist (preserving `locked: true` facts), and Reflection optional LLM assist, while retaining explicit `local_rule_zero` fallback behavior.
  3. Implement `ColabAsrProvider` (`apps/server/src/voice/asr-colab.ts`) against port `10086` HTTPS/WSS with explicit 7-state lifecycle tracking and honest `fallbackActive` / `fallbackReason` reporting.

### Phase 2 — Real End-to-End Validation & Sanitized Evidence Report
- **`@runtime-server` + `@colab-asr` -> `@auditor-docs`**:
  - Execute live integration testing pairing Colab GPU ASR (`colab_gpu`) + CPA LLM (`gemini-4-hydrogen` / configured CPA models) + `CueXGatewayServer` HTTP/WS + SQLite persistence across rehearsal, live omission/drift/pause-suppression, Q&A grounding, missing-evidence refusal, and reflection flows.
  - Persist sanitized evidence to `deliverables/cuex-final/mandatory/ai-employee-demo/evidence/{colab-asr-report,cpa-llm-report,real-e2e-validation}.json`.
  - **`@auditor-docs`** audits raw evidence JSONs and authors `docs/phase3/REAL_WORLD_VALIDATION_REPORT.md` strictly matching observed numbers, latencies, CER/RTF, token/cost counts, and honest caveats.

### Phase 3 — Frontend Excellence & 6-Width Visual Verification
- **`@presentation-web`** *(only after Phase 0 design brief & Phase 1 backend/protocol contracts lock)*:
  - Elevate all surfaces cleanly by Impeccable mode (`HomeView` Persuade, `CompilerView`/`StageView`/`AccountPanel`/`MemoryInspectorPanel` Operate, `ReflectionView` Read) using Emil Kowalski motion discipline (`< 300ms`, custom `--ease-out`, `:active` feedback) and taste-skill app-screen rules.
  - Surface real 7-state `colab_gpu` ASR badge/GPU/RTF status, CPA model indicator, `reasoningTokens`, and `'provider_unreported'` telemetry disclosure accurately without fabricating runtime metrics.
  - Verify `pnpm --filter @cuex/web typecheck`, `test`, `build`, Playwright E2E, and AFTER screenshots across `[1440, 1280, 1024, 768, 390, 360]`.

### Phase 4 & Phase 5 — Docs, Commercial Bundle & Independent Final QA
- **`@auditor-docs`** & **`@biz-deliverables`**: Sync `README.md`, `docs/DEPLOYMENT.md`, `docs/engineering/*`, `docs/operations/*`, `docs/business/*`, `ppt/**`, and `deliverables/cuex-final/` with verified Phase 3 telemetry and runbooks.
- **`@qa-verifier`**: Re-run full offline suite (`typecheck`, `build`, protocol/server/web tests, E2E, `eval`, `db-backup-restore --self-test`), hygiene gates (`check-public-data.mjs --staged`, `check-legacy-domain.mjs --staged`), `verify:sync`, SBOM, PDF page checks, ZIP repackaging, `TEST_REPORT.md` & `CHANGELOG.md`, and local commit on `refactor/universal-runtime-presentation`.
