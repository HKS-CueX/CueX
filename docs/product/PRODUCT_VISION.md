# CueX Product Vision

> **CueX — 你的快思考外挂**  
> **在深度思考之外，接住当下。**

## 1. Product Philosophy

Most AI tools are designed for **System 2 (slow, deliberate, turn-based work)**: you stop talking, open a chat box, type a multi-sentence prompt, wait for several paragraphs of prose, and read line-by-line.

In **high-stakes live scenes**—roadshows, thesis defenses, academic talks, customer conversations, live teaching—stopping to read a chatbot breaks presence. What a speaker actually needs is **a low-interference cognitive copilot ("fast-thinking prosthetic")**:

1. **Continuous Understanding (持续理解)**: Listen to speech and track current goals, chapter progress, confirmed facts, and open questions in real time.
2. **Timely Support (适时提示)**: Surface help only when cognitive friction or factual omission is genuinely detected—not on arbitrary timers or naive silence thresholds alone.
3. **Minimum Necessary Intervention (最小必要干预)**: Say the least amount needed to unstick the human speaker (`L0` Silence -> `L1` Edge Signal -> `L2` 2–6 char Keyword -> `L3` Short 2–3 Bullet Scaffold).
4. **Active Withdrawal (主动退出)**: Disappear the moment the human recovers, finishes the point, changes topic/chapter, or dismisses the hint.
5. **Strict Grounding & Controllable Memory (事实零幻觉 & 可控记忆)**: Never invent numbers, citations, or product promises during live Q&A; explicitly flag missing source materials and persist cross-session personal habits only with explicit user confirmation.

---

## 2. Core Optimization Target: Net Cognitive Utility

Traditional assistants measure "how much text the AI produced." CueX optimizes the inverse—how smoothly the user handles the moment with minimal interruption:

$$V = H - \lambda I \quad (\text{default } \lambda = 2)$$

- **$H$ (Helpful Interventions)**: Interventions rated helpful by the user or confirmed to assist recovery/coverage cleanly without interrupting flow.
- **$I$ (Interruptive / Distracting Interventions)**: Interventions rated distracting, ignored past staleness without withdrawal, or firing ungrounded noise.
- **$\lambda$ (Disruption Penalty Multiplier, default `2`)**: Being needlessly loud in a live speech costs roughly twice as much cognitive load as staying quiet helps. Therefore **`L0` Silence is the default winning state**.

---

## 3. Architecture Strategy: Universal Cognitive Runtime + First Wedge

CueX avoids both extremes:
- We are **not** a one-off hardcoded vertical prompt script that has to be rebuilt from scratch for every scene.
- We are **not** a vague "everything copilot" without a working, testable wedge.

Instead, CueX is built as a **two-layer platform**:

1. **Universal Cognitive Runtime (`@cuex/protocol` + `apps/server/src/runtime/`)**:
   - Domain-agnostic context graph (`TaskContext`, `ContextPack`, verified `Evidence[]`, opt-in `MemoryItem[]`).
   - Event-driven `EventBus` (`CognitiveEvent`) and atomic `SharedCognitiveState` with monotonic `contextVersion`.
   - Decoupled **System 1 (Fast Decision)**, **System 2 (Slow Grounded Synthesis)**, and lexical/pluggable **Retrieval**.
   - An independent, auditable **`InterventionController`** enforcing ceilings, TTLs, cooldowns, suppression, grounding verification, and automatic withdrawal.
2. **Scenario Adapter Layer + First Wedge (`CueX Presentation`)**:
   - **Implemented Now (`status: 'implemented'`)**: **CueX Presentation · 演讲与答辩临场引导** — complete pre-stage Context Compiler (`.pptx/.pdf/.md/.txt`), during-stage `Focus` vs `Inspector` views, grounded live Q&A fallback, and post-stage Reflection + Single-Point Rehearsal + Memory Governance.
   - **Explicitly Roadmap (`status: 'roadmap'`, not live-runnable yet)**: `CueX Social`, `CueX Teaching`, `CueX Sales`, and `CueX Custom` adapters, defined cleanly in `@cuex/protocol` (`SCENARIO_CAPABILITY_DESCRIPTORS`) as future extensions sharing the same Universal Runtime and Controller invariants.

---

## 4. Brand Identity & Aesthetic Direction

- **Surface & Ink**: Warm paper light ground (`#F8F7F3`), crisp editorial ink (`#111318`), hairline borders, generous whitespace—never dark neon glass clutter that pulls eye focus away from an audience.
- **Crossed `X` Dual-Stream Visual Metaphor**: Amber (`#E87A24`) representing fast situational impulse (System 1) intersecting Violet (`#7C3AED`) representing structured memory & evidence (System 2), meeting briefly at the moment of intervention and receding back to calm peripheral white space.
