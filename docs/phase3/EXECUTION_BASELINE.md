# CueX Phase 3 Execution Baseline (`CueX Phase 3: Real Validation, Frontend Excellence & Commercial Delivery`)

> **Scope**: Phase 0 pre-execution baseline audit on branch `refactor/universal-runtime-presentation` prior to Phase 3 code/infra changes.  
> **Hygiene Rule**: Contains zero secrets, zero API keys, zero raw `$HOME` (`/Users/...`) absolute paths, and zero bare external host IP literals (`scripts/check-public-data.mjs` & `scripts/check-legacy-domain.mjs` clean).

---

## 1. Git & Repository Baseline

| Check / Ref | Observed Baseline (`2026-11-16`) |
| --- | --- |
| **Active Branch & Tracking** | `refactor/universal-runtime-presentation...origin/refactor/universal-runtime-presentation` (`git status --short --branch` clean at Phase 3 start) |
| **Current `HEAD`** | `7ad6ccb` — `feat(phase2): complete universal runtime engineering, sqlite storage, security, and commercialization suite` |
| **Recent History (`git log -n 4`)** | `7ad6ccb` (Phase 2 completion) -> `6804f5a` (`deliverables/cuex-final` & zip) -> `e2cb637` (Universal Cognitive Runtime & Presentation wedge) -> `96cd742` (`origin/main, main`: initial repository baseline) |
| **`origin/main` Status** | `96cd742` (untouched; `git fetch origin` clean) |
| **Cumulative Delta (`git diff --stat origin/main...HEAD`)** | `364 files changed, 47843 insertions(+), 24770 deletions(-)` |
| **Local Runtime Gitignore Coverage** | `.gitignore` ignores `.cuex-runtime/` (line 49), `.env` / `.env.*` excluding `!.env.example` (lines 39–41), `.taste-skill/` (line 37), and `.DS_Store` (lines 1, 21). |

---

## 2. Current Integration Audit & Verified Phase 3 Gaps

### 2.1 Speech Intake & ASR (`apps/server/src/voice/*`, `packages/protocol/src/audio.ts`)
- **Current Contract (`packages/protocol/src/audio.ts:20-32`)**:
  - `AsrBackendMode` supports only `'local_sherpa' | 'remote_sherpa' | 'browser_webspeech' | 'text_simulation'`.
  - `AsrCapabilityStatus` exposes `{ backend, mode, available, streaming, detail }` with no lifecycle state machine, GPU metadata, RTF metric, or fallback disclosure fields.
- **Current Server Behavior (`apps/server/src/voice/index.ts`, `GatewayServer.ts:116-121, 204-230, 1515-1547`)**:
  - `createAsrEngine()` routes `CUEX_ASR != real` to `TextOnlyAsr`, `CUEX_ASR_URL` to `RemoteSherpaAsr` (float32 WS for `sherpa-onnx` server), or `LocalSherpaAsr` (CPU `sherpa-onnx` zipformer).
  - `/ws` `audio.chunk` decodes base64 PCM16LE and forwards `pcm` to `asrStream.write(pcm)` while metering frame duration (`recordAsrMetrics()`).
- **Phase 3 Gap**:
  - No remote GPU ASR deployment (`infra/colab/**`), no `ColabAsrProvider` (`apps/server/src/voice/asr-colab.ts`) talking authenticated HTTPS/WSS (`<COLAB_ASR_HOST>:10086`), no `'colab_gpu'` mode, no 7-state lifecycle (`not_configured | starting | ready | degraded | disconnected | restarting | unavailable`), and no real Mandarin/bilingual WAV acceptance corpus.

### 2.2 LLM Gateway, System 1 & System 2 (`apps/server/src/system1/*`, `system2/*`, `runtime/providers/*`)
- **Current System 1 (`LlamaSystemOne.ts`, `FastDecisionAdapter.ts`)**:
  - `HeuristicFastDecisionProvider` executes deterministic local rules (`usageSource: 'local_rule_zero'`, `0` tokens, `costFen: 0`).
  - `LlamaFastDecisionProvider` (`CUEX_SYSTEM1=real`) connects solely to a local `llama.cpp` `/completion` slot (`CUEX_S1_URL`, default `http://127.0.0.1:18080`, `autotrust-jev9b.json` calibration metadata, `jev-v1` slot readout). Zero CPA gateway integration exists.
- **Current System 2 (`system2/config.ts`, `system2/run.ts`, `SlowReasoningAdapter.ts`)**:
  - Uses `@earendil-works/pi-ai` (`1.4.0`) + `@earendil-works/pi-agent-core` via `loadModelsJson()`, which reads **`$HOME/.prime/agent/models.json`** (`PRIME_MODELS_JSON`, default provider `'gpt-kanglives'`, default model `'gemini-3-flash'`).
  - **Hard Protocol Blocker (`system2/config.ts:20, 95-98`)**: Explicitly rejects `api !== 'openai-completions' && api !== 'anthropic-messages'`, throwing on `openai-responses`! Also hardcodes `MAX_OUTPUT_TOKENS = 1024`, which risks truncating structured output on reasoning models emitting `reasoning_tokens`.
- **Verified CPA Provider Config (`$HOME/.pi/agent/models.json`, sanitized inspection)**:
  - Provider entry `"gpt.kanglives.top"` (`baseUrl`: `https://gpt.kanglives.top/v1`) defines `63` models across `openai-responses` and `openai-completions`.
  - Confirmed target model **`gemini-4-hydrogen`** (`name: "Gemini 4 Hydrogen"`, `api: "openai-responses"`, `reasoning: true`, `contextWindow: 1048576`, `maxTokens: 65536`, `thinkingLevelMap: low | medium | high | xhigh`), supporting both `/v1/responses` and `/v1/chat/completions` and emitting `reasoning_tokens`.
- **Telemetry Accounting Gap (`packages/protocol/src/common.ts:34`, `reasoning.ts:10-21`, `SharedCognitiveStateStore.ts:383`)**:
  - `TelemetryUsageSource` currently only permits `'provider_reported' | 'local_rule_zero' | 'estimated'`.
  - When a real external LLM response omits token usage fields, `FastDecisionAdapter.ts:349` and `SlowReasoningAdapter.ts:416` risk collapsing `0`-token calls into `local_rule_zero` rather than `'provider_unreported'`, and `ProviderUsageRecord` lacks `reasoningTokens` and `correlationId`.

### 2.3 Presentation Compiler & Reflection (`apps/server/src/scenarios/presentation/`)
- **Compiler (`PresentationCompiler.ts:124`)**: `compilePresentationPack()` is currently 100% synchronous deterministic text splitting/regex classification (`splitSectionsFromRaw`, `splitCandidateFacts`, `classifyFactCategory`). No optional CPA LLM extraction or predicted Q&A generation is wired yet.
- **Reflection (`PresentationReflection.ts:109`)**: `buildPresentationReflection()` is 100% synchronous deterministic timeline, coverage, weak-segment, and `V = H - λI` utility assembly. No CPA LLM post-stage synthesis option is wired yet.
- **Invariant to Preserve**: Any Phase 3 CPA enhancement to Compiler and Reflection MUST preserve `locked: true` facts, `verified: true` `Evidence[]` provenance, explicit `missingInfoNotice` honesty, and unambiguous `local_rule_zero` fallback attribution when offline/disabled.

### 2.4 Web Client & Brand Tokens (`apps/web/`, `apps/web/vite.config.ts`)
- **Stack (`apps/web/package.json`)**: React `18.3.1`, TypeScript `5.6.3`, Tailwind CSS `3.4.16`, Radix UI (`Dialog`, `Slider`, `Tabs`, `Tooltip`), `lucide-react` `0.468.0`, Vite `6.0.1`, Vitest `5.0.5`.
- **Tokens & Static Assets (`apps/web/src/index.css:44-82`, `apps/web/vite.config.ts:6`)**:
  - Ground `#F8F7F3`, Surface `#FFFFFF`, Ink `#111318`, Amber `#E87A24` (System 1), Violet `#7C3AED` (System 2), Resolved `#1F6B52`.
  - Fonts (`Instrument Serif`, `Inter`, `JetBrains Mono`, `Noto Sans SC`, `Noto Serif SC`) and brand SVGs (`cuex-symbol-dimensional.svg`) resolve from `assets/` via `publicDir: path.resolve(__dirname, '../../assets')`. *(Observation: `vite build` currently copies the entire `assets/` directory into `dist/`, including non-web `assets/banners/` and `assets/hks/` folders unless selectively bundled/copied.)*
- **Views & Real-Time Audio Path**:
  - `App.tsx` manages `home` (`HomeView.tsx`), `compiler` (`CompilerView.tsx`), `stage` (`StageView.tsx`: `Focus` / `Split Strip` / `Inspector`), `reflection` (`ReflectionView.tsx`), `AccountPanel.tsx`, and `MemoryInspectorPanel.tsx`.
  - `AudioCapture.ts` captures mono PCM16LE 16 kHz frames via AudioWorklet; `BrowserSpeechRecognizer.ts` handles Web Speech API; `CueXWSClient.ts` handles `/ws` `serverSeq` reconnect deduplication.
- **Frontend UI Gaps**:
  - `Navbar.tsx:34-38` compresses runtime readiness to a binary string (`实时 LLM 引擎` vs `本地规则引擎`) without surfacing `colab_gpu` 7-state ASR lifecycle, GPU/model/RTF badge, `reasoningTokens`, or `'provider_unreported'` telemetry calibration.
  - Visual polish, keyboard micro-interactions, responsive ergonomics across `[1440, 1280, 1024, 768, 390, 360]` px, and empty/degraded states await systematic Playwright before/after audit against the 4 installed design skills.

---

## 3. Installed Frontend Design Skills Inventory

| Skill Name | Installed Location | Version / Notes | Key Mandates for CueX Phase 3 |
| --- | --- | --- | --- |
| **`design-taste-frontend`** | `$HOME/.agents/skills/design-taste-frontend/SKILL.md` | *tasteskill v2* (`references/app-screens.md`, `scripts/{draw,inspect,assets}.mjs`) | Keep existing brand palette & type (`draw.mjs --keep palette,type`); enforce app-screen restraint for workspace views (zero vanity ornaments/gradients/glows); verify in real browser with `inspect.mjs`. |
| **`frontend-design`** | `$HOME/.codex/skills/frontend-design/SKILL.md` | `references/{aesthetic-playbook,implementation-patterns}.md` | Cohesive editorial direction, `<= 2` accent colors, Grid macro + Flexbox micro layouts, AA+ contrast, semantic headings/ARIA, `prefers-reduced-motion`. |
| **`impeccable`** | `$HOME/.gemini/config/skills/impeccable/SKILL.md` | **v4.8.0** (Apache 2.0, `reference/{craft-floor,operate,new-work}.md`) | Differentiate surfaces cleanly by mode: **`Persuade`** (`HomeView`), **`Operate`** (`CompilerView`, `StageView`, `AccountPanel`, `MemoryInspectorPanel`), **`Read`** (`ReflectionView`); batch visual captures at exact target widths. |
| **`emil-design-eng`** | `$HOME/.agents/skills/emil-design-eng/SKILL.md` | Emil Kowalski Design Engineering | Zero animation on `100+/day` actions (keyboard shortcuts/cmd palette); custom `--ease-out` / `--ease-drawer`; UI transitions strictly `< 300ms` (`100–160ms` `:active` scale `0.97`, `125–200ms` popovers); never `transition: all` or `ease-in`. |

---

## 4. Existing `deliverables/cuex-final/` Inventory vs Phase 3 Additions

| Existing Path (`7ad6ccb`) | Type / Spec | Phase 3 Target Status & Required Additions |
| --- | --- | --- |
| `README.md`, `sbom-and-checksums.json` | Package index + SHA-256 SBOM | Update index & regenerate SBOM after Phase 3 deliverables land. |
| `brand/CueX-Brand-Guide.md`, `CueX-Cover.png` | Brand guide + `1920×1080` cover | Retain & verify alignment with redesigned UI screenshots. |
| `business/CueX-{Business-Plan,AI-Employee-Job-Spec,Business-Model-Canvas,Unit-Economics,BMC-and-Unit-Economics}.pdf` | Strict `8p / 1p / 1p / 1p / 2p` PDFs | Retain baseline; add Phase 3 real-world evidence citations if updated during Phase 4/5 commercial packaging. |
| `pitch/CueX-{BP.pdf,Demo-Script.md,Pitch-Script.md,Website-Copy.md}` | Pitch deck (`8p`) + scripts + web copy | Retain baseline; update `Demo-Script.md` / `Pitch-Script.md` in Phase 4/5 to reflect live Colab GPU ASR + CPA LLM + refined UI. |
| `evidence/{evaluation-results.md,token-usage-proof.png,verification.json}` | `6/6` offline `local_rule_zero` eval + verification manifest (`scannedFiles: 20`) | Keep offline deterministic CI benchmark clearly distinct; add real E2E evidence! |
| `previews/*.png` | Rendered PDF & cover previews (`12` PNGs) | Retain & verify after any final PDF re-export. |
| **Missing in `7ad6ccb`** | **Colab GPU ASR + CPA LLM + Real E2E Deliverables** | Phase 3 creates: `infra/colab/**` and `deliverables/cuex-final/mandatory/ai-employee-demo/{demo-pack/**,evidence/colab-asr-report.json,evidence/cpa-llm-report.json,evidence/real-e2e-validation.json}` plus Playwright visual verification reports. |
