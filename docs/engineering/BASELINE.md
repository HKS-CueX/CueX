# CueX Pre-Refactor Baseline Snapshot (`96cd742`)

> Status: P0 Engineering Baseline Audit (Read-Only Snapshot Before `refactor/universal-runtime-presentation` Implementation)

## 1. Repository Provenance & Git Baseline

| Item | Verified Baseline Value |
| --- | --- |
| Workspace Path | `<repo-root>/CueX` |
| Baseline Commit | `96cd742523d5b0fea5aafdb65944d421938a0a43` (`96cd742`) |
| Commit Date & Message | `2026-11-16 01:08:45 +0800` — `chore: initialize HKS-CueX repository` |
| Git Remote (`origin`) | `https://github.com/HKS-CueX/CueX.git` |
| Earlier Internal Provenance | Legacy internal references in pre-refactor docs/sub-branches (`ScH-CueX/CueX`, prior medical prototype dated around `2026-11-01` in legacy submission guides) |
| Workspace Package Manager | `pnpm@9.15.9` (`pnpm-workspace.yaml`: `packages/*`, `apps/*`) |
| Root `README.md` at `96cd742` | **Absent** (did not exist in commit `96cd742`) |
| Local Feature/Archive Branches Present | `main`, `legacy-backup`, `feat/hks-opc`, `codex/cuex-cinematic-brand`, `codex/scenario-synthesis-library`, `claude/greeting-1e9972`, `claude/product-business-analysis-5d9003` |

---

## 2. Repository Layout at Commit `96cd742`

| Path | Baseline Contents & Role | Tracked vs Ignored |
| --- | --- | --- |
| `packages/protocol/` | `@cuex/protocol`: 8 `.ts` files (`events.ts`, `controller.ts`, `scenario.ts`, `audio.ts`, `jev.ts`, `piagent.ts`, `library.ts`, `index.ts`) — hardcoded to medical rep visit state & JEV/PiAgent internals | Tracked |
| `apps/server/` | `@cuex/server`: Express-free raw Node `http` + `ws` server (`TurnController`, `WebSocketGateway`, `LlamaSystemOne`, `HeuristicSystemOne`, `PiSystemTwo`, `DoctorLinePrefetch`, `ANSHU_PACK`, `LibraryApi`, `voice/`) + `agents/doctors/{dr-chen,dr-li}` + 12 test files | Tracked (`agents/doctors/dr-synth-*/` ignored) |
| `apps/web/` | `@cuex/web`: Vite + React 18 + Tailwind + R3F/Three (`HomepageView`, `LiveTrainingView`, `ReviewView`, `ClinicalScaffoldingHUD`, `DoctorCanvas`, `DoctorBust`, `stage/*`) + 7 Playwright/node verification scripts | Tracked |
| `assets/` | `brand/` (CueX `X` vector marks & `brand-spec.md`), `fonts/`, `env/lebombo_1k.hdr`, `models/facecap*.glb` (3D doctor bust), `hks/.gitkeep` (empty) | Tracked (`assets/banners/` gitignored) |
| `infra/` | `windows/` (JEV LoRA, llama.cpp scripts, `s1_relay.py`, Sherpa ASR zh models + medical hotwords, Ming TTS scripts) & `deploy/` (`cuex.service.example`, `nginx.conf.example`) | Tracked |
| `scripts/` | `demo.mjs`, `browser-runtime.mjs`, `check-public-data.mjs`, `public-data-allowlist.json`, `s1-tunnel.sh`, `tts-*.mjs` | Tracked |
| `docs/` | `DEPLOYMENT.md`, `SCENARIO_LIBRARY.md`, `HKS_2026_SUBMISSION_GUIDE.md`, `HKS_2026_UNIVERSAL_SUBMISSION_GUIDE.md` + local gitignored `hks.md` & `怀客松2026_OPC模式创新赛道命题手册11.12docx.pdf` | Mixed (`DEPLOYMENT/SCENARIO/HKS_*` tracked; handbook files gitignored) |
| `ppt/` | `open-slide.config.ts`, dual slide decks (`cuex-hks/`, `cuex-hks-universal/`), dual doc-template builders (`build-hks-deliverables.mjs`, `build-hks-universal-deliverables.mjs`) | Tracked |
| `deliverables/` | `hks-2026/` (+ `hks-2026.zip`, ~42 MB) and `hks-2026-universal/` (+ `hks-2026-universal.zip`, ~43 MB) | Gitignored |

---

## 3. HKS 2026 Baseline & Honest Disclosure Boundaries

Per `docs/hks.md` (HKS 2026 hackathon schedule: `2026-11-14` to `2026-11-16`, submission freeze `11-16 13:00`) and the OPC Innovation Track brief (`docs/怀客松2026_OPC模式创新赛道命题手册11.12docx.pdf`):

1. **Allowed Pre-Race Assets**: Prior prototypes, ASR/TTS plumbing, brand guidelines, and model-adapter skeletons may be brought into the hackathon ONLY if pre-existing work vs. 48-hour competition output is explicitly separated without misrepresentation.
2. **Required OPC Track Deliverables**: An 8-element Business Model Canvas, a 1-page AI Employee Job Specification (`岗位职责` / `输入要求` / `交付成果` / `人工介入` / `验收标准`), a runnable product/agent demo, and grounded unit economics.
3. **Critical Audit Finding at `96cd742`**:
   - The **actual running codebase** at `96cd742` was still 100% a **medical sales-representative simulation trainer** centered on clinical visits for a fictional antihypertensive product (`安舒平` / `ANSHU-3`) with virtual nephrology/cardiology doctors (`陈主任` / `dr-chen`, `李主任` / `dr-li`), 3D `facecap.glb` head meshes, medical ASR corrections (`eGFR 30到60`, `收缩压`), and clinical scaffolding (`ClinicalScaffoldingHUD`).
   - Conversely, BOTH local `deliverables/hks-2026/` (pitching `CueX AI 演讲与答辩临场引导师`) and `deliverables/hks-2026-universal/` (pitching `CueX 通用快思考引擎 · OPC 全天候临场参谋`) were **slide decks and commercial PDFs generated from `ppt/`** whose core product features were **not yet implemented** in `apps/server`, `apps/web`, or `packages/protocol`.

---

## 4. What Was Actually Implemented vs. What Was Only Pitched at `96cd742`

| Capability | Status at `96cd742` | Evidence in Code / Files |
| --- | --- | --- |
| Medical Rep Visit Simulation (`ANSHU-3`, `dr-chen`, `dr-li`) | **Implemented (Legacy Domain)** | `apps/server/src/scenario/anshu.ts`, `TurnController.ts`, `DoctorTurnAgent.ts`, `ClinicalScaffoldingHUD.tsx` |
| 16 kHz PCM16LE AudioWorklet Mic Capture | **Implemented (Infra)** | `apps/web/src/core/audio/AudioCapture.ts`, `pcm-capture.worklet.js` |
| Local / Remote Sherpa ASR & Text Fallback | **Implemented (Infra, Medical Hotwords)** | `apps/server/src/voice/{asr-local,asr-remote,index}.ts` (with medical `ANSHU_ASR_CORRECTIONS`) |
| Single-Token `llama.cpp` System 1 Client & Heuristic Fallback | **Implemented (Medical-Hardcoded)** | `apps/server/src/system1/{LlamaSystemOne,HeuristicSystemOne}.ts` (hardcoded `c1/c2/c3/d1` questions + 120/80-char speech slice) |
| Shared Cross-Turn / Multi-Scenario KV Cache | **Not Implemented / Contradicted** | `apps/server/src/system1/EVAL.md` line 49 explicitly records generic `/completion` slots did NOT share KV state across slots (`--kv-unified` pools memory only); `PiSystemTwo` used separate cloud APIs |
| `PiSystemTwo` Cloud Agent Runner & Key Redaction | **Implemented (Medical Agents)** | `apps/server/src/system2/{PiSystemTwo,config,numbers}.ts` (`@earendil-works/pi-agent-core@1.4.0`, `redact()`) |
| Static Presentation & Universal Decks (`deliverables/hks-2026*`) | **Generated Slides/PDFs Only** | `ppt/slides/cuex-hks*/index.tsx`, `ppt/scripts/build-hks*.mjs`; no matching code in `apps/` |
| Domain-Agnostic Universal Cognitive Runtime | **Not Implemented** | Absent from `packages/protocol` and `apps/server` |
| Independent `InterventionController` (TTL, `contextVersion`, Auto-Withdraw) | **Not Implemented** | Replaced by turn-based `TurnController` tailored to clinical visit completion |
| CueX Presentation Pre-Stage Document Compiler (`.pptx`/`.pdf`/`.md`) | **Not Implemented** | Only medical `ScenarioSynthesizer` (`/api/scenarios` over medical `ANSHU` base pack) existed |
| Focus / Inspector Dual Views & Single-Point Rehearsal | **Not Implemented** | UI had 3 medical training views (`HomepageView`, `LiveTrainingView`, `ReviewView`) + 3D `DoctorBust` |
| Opt-in Memory Governance | **Not Implemented** | `apps/server/src/system2/doctors.ts` silently appended lines to `MEMORY.md` without user confirmation |
| Real Token Proof Screenshots (`tokenProofEmbedded`) | **Absent (`false`)** | Both `deliverables/hks-2026*/verification.json` record `"tokenProofEmbedded": false`; `assets/hks/` is empty |

This baseline snapshot motivates the `refactor/universal-runtime-presentation` build: purging the legacy medical domain completely, implementing a verifiable **Universal Cognitive Runtime** + **Scenario Adapter** + **CueX Presentation** end-to-end, and aligning all engineering, product, architecture, and business deliverables 100% with actual code.
