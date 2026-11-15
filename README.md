# CueX — 你的快思考外挂

> **在深度思考之外，接住当下。**  
> Domain-agnostic **Universal Cognitive Runtime** + **Scenario Adapter**, launching with **CueX Presentation** as the first live operational wedge (`HKS-CueX/CueX`).

---

## What CueX Solves

Most AI systems live inside **System 2**: you pause what you are doing, switch windows, read paragraphs, and lose eye contact with the moment. High-stakes spoken delivery—startup pitches, thesis defenses, academic talks—breaks if an assistant keeps talking or flashing chat walls.

CueX acts as a **minimum-necessary-intervention cognitive copilot**:
- **Stay Quiet (`L0`) by Default**: Fluent delivery and intentional rhetorical pauses stay completely undisturbed.
- **Progressive Peripheral Cues (`L1 -> L2 -> L3`)**: Gentle Amber/Violet edge light (`L1`) -> 2–6 character peripheral keyword (`L2`) -> brief grounded scaffold card (`L3`).
- **Automatic Withdrawal**: Prompts disappear automatically when the speaker recovers, changes topic/chapter, expires TTL, or dismisses (`7` typed withdrawal transitions).
- **Zero-Hallucination Grounding**: Every factual/numeric hint must cite user-confirmed `Evidence` from the pre-stage compiler; absent answers trigger an explicit missing-evidence notice instead of fabricated statistics.
- **Opt-In Memory Governance**: Nothing persists across sessions unless explicitly confirmed (`userConfirmed: true`), with full inspect/edit/delete and single-session wipe controls.

---

## Implemented Scope vs. Roadmap (Honest Status)

| Component / Scenario | Current Status | Details |
| --- | --- | --- |
| **Universal Cognitive Runtime** (`apps/server/src/runtime/`) | **Implemented** | `CognitiveRuntimeSession`, `ContextStore`, `CognitiveEventBus`, `SharedCognitiveStateStore`, `LexicalBm25RetrievalProvider`, independent `InterventionController`, opt-in `MemoryStore` |
| **CueX Presentation** (`apps/server/src/scenarios/presentation/`, `apps/web/`) | **Implemented** | `.pptx`/`.pdf`/`.md`/`.txt` document extraction, Context Compiler (Cue Sheet, lockable Fact Whitelist, AI-predicted Q&A Cards, Progress Structure), `Focus` vs `Inspector` live stage, grounded Q&A fallback, Reflection (`V = H - λI`), Single-Point Rehearsal |
| **System 1 / System 2 / ASR Modes** | **Implemented with Local Fallback** | Works zero-token locally out of the box (`CUEX_SYSTEM1/2/ASR=fake`) or connects optional `llama.cpp` System 1, `pi-ai` System 2, local/remote `sherpa-onnx` ASR, and browser Web Speech API |
| **`CueX Social` · `Teaching` · `Sales` · `Custom`** | **Roadmap Only** | Explicitly defined in `SCENARIO_CAPABILITY_DESCRIPTORS` (`status: 'roadmap'`); backend rejects live execution (`ScenarioNotImplementedError`) until adapters are built |

---

## Repository Architecture

```text
packages/protocol/     Shared TypeScript contracts (@cuex/protocol): Universal entities, Controller, WS/REST, Presentation
apps/server/           Universal Cognitive Runtime, Presentation adapter, voice/ASR adapters, HTTP + WS Gateway (/ws)
apps/web/              Warm-light CueX UI (HomeView, CompilerView, StageView Focus/Inspector, ReflectionView)
docs/
  ├── product/         PRODUCT_VISION.md, PRESENTATION_PRD.md, USER_FLOWS.md
  ├── architecture/    UNIVERSAL_RUNTIME.md, SYSTEM_1_SYSTEM_2.md, INTERVENTION_CONTROLLER.md, DATA_MODEL.md, SCENARIO_ADAPTER.md
  ├── engineering/     BASELINE.md, CURRENT_ARCHITECTURE.md, AUDIT.md, LEGACY_CLEANUP.md, MIGRATION_PLAN.md
  ├── business/        BUSINESS_MODEL.md, UNIT_ECONOMICS.md, COMPETITIVE_ANALYSIS.md, ROADMAP.md
  └── DEPLOYMENT.md    Local/production setup, optional real S1/S2/ASR wiring, and verification commands
```

---

## Quick Start (Zero External Keys Required)

```bash
# 1. Install workspace dependencies (Node >= 22.19, pnpm 9.15.9)
pnpm install

# 2. Launch both API/WS server (:8765) and Vite web client (:5173)
pnpm demo
# (Or run in two terminals: `pnpm dev:server` and `pnpm dev:web`)
```

Then open **`http://127.0.0.1:5173/`**:
1. Click **一键载入 CueX 路演演示包** in `HomeView` (or **载入示例：CueX 路演演示包** in `CompilerView`) to load `pack_cuex_demo_01`, or upload a `.pptx`, `.pdf`, `.md`, or `.txt` file.
2. Confirm/lock facts in the Fact Whitelist, accept the privacy & audio notice, and launch **`Focus`** or **`Inspector`** mode (`rehearsal` or `live`).
3. Speak via Browser Web Speech (`SpeechRecognition`) or send speech segments via the simulation controls in `StageView` to observe `L0–L3` intervention gating, automatic withdrawal (`user_recovered`, `chapter_changed`, etc.), grounded Q&A lookup, and post-session **`ReflectionView`** (`V = H - λI`).

---

## Verification & Benchmark Commands

```bash
pnpm typecheck                                                  # Workspace TypeScript verification
pnpm build                                                      # Web production bundle check
CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test            # Universal Runtime, Controller, Compiler, Memory & WS tests
pnpm --filter @cuex/server eval                                 # Deterministic 6-case Presentation benchmark (.cuex-runtime/eval-latest.*)
pnpm --filter @cuex/web exec vitest run test/presentation-reducer.test.ts
node --test apps/web/test/presentation-e2e.test.mjs               # Browser Playwright E2E flow
```

---

## Pre-Race Baseline Disclosure (HKS 2026)

Consistent with HKS 2026 OPC Track transparency rules: prior to the hackathon branch (`refactor/universal-runtime-presentation` from baseline commit `96cd742`), the repository held an earlier domain-specific dialogue training prototype from which only domain-neutral engineering infrastructure (browser PCM16 audio capture worklet, Sherpa ASR transport scaffolding, `pi-ai` provider credential redaction helpers, and CueX brand SVG marks/fonts) was retained or adapted. All Universal Cognitive Runtime abstractions, `InterventionController` policies, `@cuex/protocol` schemas, Presentation compiler/stage/reflection workflows, and benchmark harnesses were designed and implemented during the CueX Next refactor. Full commit-level provenance and audit matrices are documented in [BASELINE.md](docs/engineering/BASELINE.md) and [AUDIT.md](docs/engineering/AUDIT.md).
