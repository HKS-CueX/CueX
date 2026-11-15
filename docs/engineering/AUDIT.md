# Deep Engineering & Deliverable Audit (`96cd742` vs. HKS Deliverables)

> Purpose: Honest comparison across `96cd742` source code, `deliverables/hks-2026/`, `deliverables/hks-2026-universal/`, and competition rules — plus the Retain / Modify / Rewrite / Delete matrix used for CueX Next.

## 1. Three-Way Comparison: Codebase vs. `hks-2026` vs. `hks-2026-universal`

| Dimension | Actual Code (`96cd742`) | `deliverables/hks-2026/` (+ `hks-2026.zip`, 42M) | `deliverables/hks-2026-universal/` (+ `hks-2026-universal.zip`, 43M) | Audit Verdict |
| --- | --- | --- | --- | --- |
| **Core Narrative** | Medical sales rep detailing trainer (`安舒平` vs `dr-chen`) | `AI 演讲与答辩临场引导师` (Presentation vertical focus) | `通用快思考引擎 · OPC 全天候临场参谋` (General horizontal engine across Presentation/Sales/Interview/Tutor) | **Fragmented**: Two incompatible decks, neither implemented in `apps/`. Resolved cleanly via **Universal Cognitive Runtime + `CueX Presentation` First Wedge**. |
| **Live Runtime Implementation** | Medical `TurnController` + `ANSHU_PACK` | Pitched Presentation cue sheet, rehearsal & Q&A, no live code | Pitched zero-script universal cross-scenario cards, no live code | **Gap**: Both deliverables pitched features absent at `96cd742`. |
| **Brand & Positioning** | Clinical daylight palette (`#ecede8`, cinnabar `#d2461e`, sage `#28604f`), `assets/brand/` already defines Amber × Violet `X` (`CueX`) | Presentation-only assistant framing | Universal fast-thinking engine; claimed uncopyable KV-cache moat | **Consolidate**: Adopt `CueX — 你的快思考外挂` / `在深度思考之外，接住当下。` using Amber (`#E87A24`) × Violet (`#7C3AED`) on warm light `#F8F7F3`. |
| **KV Cache & Token Claims** | `EVAL.md:49` states generic `/completion` slots do NOT share KV state; `System 1` sliced last 120/80 chars; `System 2` used separate cloud APIs | Claimed ~1.1万 tokens/场 & 95.9% margin on ¥59/mo (`tokenProofEmbedded: false`) | Claimed "shared KV Cache across whole conversation + 1-token Jev decision" (`tokenProofEmbedded: false`) | **Overstated / Contradicted**: Cannot claim shared cross-scenario/cross-slot KV cache or "99% savings" or "95.9% SaaS margin" from LLM-only token estimates. |
| **Verification & Artifacts** | Only `assets/hks/.gitkeep` exists | 8p BP + 1p Job Spec + 2p BMC/Bill + PNG previews (`tokenProofEmbedded: false`) | Same structure, Universal wording (`tokenProofEmbedded: false`) | Both guides (`官网提交文案与封版核查清单.md`) explicitly flagged missing `token-usage-proof.png`! |
| **Utility Metric `V = H - λI`** | Not computed in code | Appeared conceptually | Highlighted as intervention metric | **Adopt & Implement Real Computation** in `PresentationReflection` (`default λ = 2`). |
| **Pre-Race Disclosure** | Medical code at `96cd742` | Disclosed `2026-11-01` clinical-dialogue prototype (`ScH-CueX/CueX`) | Disclosed `2026-11-01` clinical-dialogue prototype (`ScH-CueX/CueX`) | Keep disclosure factual, concise, and subordinate — never misrepresent pre-race medical code as Presentation work. |

---

## 2. Specific Claims Fact-Check

| Claim in HKS Materials | Audit Verdict | Actual Finding |
| --- | --- | --- |
| "CueX 演讲与答辩临场引导师 / 通用场景卡片已可实机演示" | **False at `96cd742`** | Only the medical `安舒平` rep simulator ran at `96cd742`; `.pptx`/`.pdf` presentation compilation and Focus/Inspector views did not exist. |
| "System 1 与多场景共享完整上下文 KV Cache，只输出单个判断 token" | **Contradicted by `EVAL.md`** | `LlamaSystemOne` DID request `n_predict: 1` with `cache_prompt: true` (for medical prompts truncated to 120/80 chars), **but** `apps/server/src/system1/EVAL.md:49` documents that llama.cpp `/completion` slots did NOT share computed prefix state, and `PiSystemTwo` used separate `pi-ai` HTTP/REST calls with zero shared cache with System 1. |
| "95.9% 订阅算力毛利率 / ~1.1万 Tokens ≈ ¥0.12/场" | **Incomplete & Unverified** | Measured only raw estimated LLM token cost; excluded ASR, document extraction, retrieval indexing, post-session reflection, cloud servers, payment fees, and support. Furthermore `verification.json` showed `tokenProofEmbedded: false`. |
| "无需提前准备提词稿，临时上场也能用" (`hks-2026-universal`) | **Overpromised** | Grounded factual intervention still requires verified `Evidence[]` / user-confirmed context; without source materials, CueX can assist with structural nudges or surface an explicit missing-evidence notice, never fabricate facts. |
| "竞争对手竞品缺陷与定价对比" | **Unverified at `96cd742`** | Prior `ppt/` decks contained static competitor assertions without cited live web verification. Must be re-verified via web sources in `COMPETITIVE_ANALYSIS.md`. |

---

## 3. Codebase Retain / Modify / Rewrite / Delete Matrix

| Module / Area | Baseline Path (`96cd742`) | Decision | Rationale |
| --- | --- | --- | --- |
| Brand Vector Marks & Fonts | `assets/brand/*`, `assets/fonts/*` | **RETAIN** | Clean CueX Amber × Violet `X` identity (`brand-spec.md`, SVGs, fonts). |
| Public-Data Secret Scanner | `scripts/check-public-data.mjs` | **RETAIN** | Prevents accidental API key/credential commits; keep `allowlist` clean. |
| Live Browser PCM Audio Capture | `apps/web/src/core/audio/AudioCapture.ts`, `pcm-capture.worklet.js` | **RETAIN / ADAPT** | Solid 16 kHz mono PCM16LE worklet pipeline; adapt for Presenter speech stream. |
| ASR Engine Adapters | `apps/server/src/voice/{asr-local,asr-remote,index,sherpa,wav}.ts` | **ADAPT** | Reusable Sherpa local/remote/text ASR plumbing; remove medical hotwords/corrections and surface honest `AsrCapabilityStatus`. |
| System 1 Llama Adapter | `apps/server/src/system1/LlamaSystemOne.ts` + `HeuristicSystemOne.ts` | **REWRITE (Keep Interface Idea)** | Keep optional `llama.cpp` fast-decision adapter architecture (`CUEX_SYSTEM1=real|fake`), purge medical `c1/c2/c3/d1` & `dose.ts`, replace with domain-agnostic `FastDecisionInput -> FastDecisionVerdict`. |
| System 2 Pi Runner & Config | `apps/server/src/system2/{PiSystemTwo,config,numbers}.ts` | **REWRITE / REUSE HELPERS** | Keep `config.ts` credential `redact()` helper, `@earendil-works/pi-ai` provider normalization, and `numbersIn()` numerical guard; purge `doctors.ts`, `DoctorLineAgent`, `DoctorTurnAgent`. |
| Ambient Edge Signal UI | `apps/web/src/components/CueEdgeLight.tsx` | **ADAPT** | Strong L1 peripheral signal concept; unlock for `Focus` view L1 edge glow using CueX Amber/Violet styling. |
| Protocol Package | `packages/protocol/src/*` | **REWRITE** | Purge `jev.ts`, `piagent.ts`, `library.ts`, medical fields; replace with Universal Cognitive Runtime + Controller + Scenario Adapter + Presentation + WS protocol. |
| Turn Controller | `apps/server/src/controller/TurnController.ts` | **REWRITE** | Replace clinical visit turn-taking with Universal `ContextStore`, `EventBus`, `SharedCognitiveStateStore`, and independent gated `InterventionController`. |
| Scenario & Presentation | `apps/server/src/scenario/anshu.ts`, `library/*` | **REWRITE** | Delete medical `ANSHU_PACK` & synthesizer; build `ScenarioRegistry` (`presentation` implemented; `social/teaching/sales/custom` roadmap) + `DocumentExtractor` (`.pptx`/`.pdf`/`.md`/`.txt`) + `PresentationCompiler` + `PresentationRuntime` + `PresentationReflection` + opt-in `MemoryStore`. |
| Web Views & 3D Bust | `apps/web/src/views/*`, `ClinicalScaffoldingHUD`, `DoctorCanvas`, `DoctorBust`, `stage/*` | **DELETE & REWRITE** | Purge 3D doctor busts (`facecap*.glb`), medical HUD, static replay driver; build `HomeView`, `CompilerView`, `StageView` (`Focus` & `Inspector`), and `ReflectionView`. |
| Medical Assets & Doctors | `apps/server/agents/doctors/**`, `assets/models/facecap*.glb` | **DELETE** | Zero place in domain-agnostic CueX Next; reduces repo bloat and medical domain leakage. |
| Dual Competing HKS Decks & Docs | `ppt/slides/cuex-hks*`, `ppt/scripts/build-hks*`, `docs/SCENARIO_LIBRARY.md`, `docs/HKS_*` | **DELETE / REPLACE** | Delete obsolete 3 docs in `docs/`; consolidate `ppt/` into one unified `cuex-final` build targeting `deliverables/cuex-final/`; archive `deliverables/hks-2026*` once read-only audit concludes. |
| TTS Pipeline (`tts-edge`, `tts-http`, `tts-local`, Ming) | `apps/server/src/voice/tts-*.ts`, `infra/windows/tts/**` | **DECOMMISSION / PURGE FROM LIVE FLOW** | CueX Presentation assists a human speaker visually via L0–L3 peripheral cues rather than synthesizing spoken doctor replies; strip medical TTS scripts from live runtime (`SilentTts`/removal). |
