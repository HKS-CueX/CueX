# CueX Frontend Visual, Engineering & UX Audit (`Phase 0 Baseline`)

- **Audit Date**: `2026-11-16`
- **Branch / Baseline Commit**: `refactor/universal-runtime-presentation` @ `7ad6ccb`
- **Audited Surface**: `apps/web/src/**`, `apps/web/index.html`, `apps/web/tailwind.config.js`, `assets/brand/**`, `assets/fonts/**`
- **Artifacts Captured**: `63` PNG screenshots across `47` viewport & state checks + DOM telemetry in `.cuex-runtime/screenshots/before/` (`audit-metrics.json`)
- **Mandatory Viewport Coverage**: `1440×900`, `1280×800`, `1024×768`, `768×1024`, `390×844`, `360×800`
- **Console / Page Errors During Baseline Capture**: `0` console errors, `0` uncaught page errors

---

## 1. Design Methodology & Installed Skill Sources

This audit synthesizes the rules, taste checks, motion engineering guidelines, and operational patterns from the four design skills installed in this environment:

1. **`design-taste-frontend` (`tasteskill v2`)**
   - **Installed Path**: `~/.agents/skills/design-taste-frontend/SKILL.md` & `references/app-screens.md`
   - **Source & Version**: GitHub `Leonxlnx/taste-skill` (`skills/taste-skill/SKILL.md`, folder hash `844f3cf223d25a29e75f7965d095a093938282df`; October 2026 study of `247` curated sites + `23` real product app screens)
   - **Key Rubric Applied**: Dual-track separation between **Editorial Page** (`HomeView`) and **App Screen** (`CompilerView`, `StageView`, `ReflectionView`, `AccountPanel`); elimination of `shadow` at rest, `micro-label` tracked uppercase eyebrows, icon-in-tinted-square cards, `panel-void`, `ragged-row`, orphan grid cells, `< 11px` text, placeholder data, and broken mobile/tablet frames.
2. **`frontend-design`**
   - **Installed Path**: `~/.codex/skills/frontend-design/SKILL.md` + `references/{aesthetic-playbook.md,implementation-patterns.md}`
   - **Source & License**: Local Codex skill (`MIT License, Copyright (c) 2026 Vipul Gupta`)
   - **Key Rubric Applied**: Cohesive editorial direction (`Warm Paper Daylight` `#F8F7F3`), explicit font loading & scale hierarchy, asymmetric grid structure without random empty voids, CSS custom properties, `prefers-reduced-motion` safety, semantic landmarks, and WCAG AA contrast.
3. **`impeccable`**
   - **Installed Path**: `~/.gemini/config/skills/impeccable/SKILL.md` + `reference/{craft-floor.md,operate.md}`
   - **Source & Version**: `version: 4.8.0` (`Apache 2.0`)
   - **Key Rubric Applied**: Surface mode discipline (**Persuade** on `HomeView` vs **Operate** on `CompilerView`/`StageView`/`ReflectionView`/`AccountPanel`), fixed `rem` scale on Operate surfaces, crisp empty/loading/error/disabled states, browser chrome theming (`::selection`, scrollbars, `:focus-visible`, `tabular-nums`), and refusal of boxed nested containers and decorative eyebrows.
4. **`emil-design-eng`**
   - **Installed Path**: `~/.agents/skills/emil-design-eng/SKILL.md`
   - **Source & Version**: GitHub `emilkowalski/skills` (`skills/emil-design-eng/SKILL.md`, folder hash `db7a20dc1d8ad26a0307dcb45ebc79fc372f5c69`)
   - **Key Rubric Applied**: Frequency-driven animation rules (zero animation on keyboard-initiated actions such as `Space`/`M`/`H`/`Esc`), explicit CSS property transitions (never `transition: all`), custom `ease-out` curves (`cubic-bezier(0.23, 1, 0.32, 1)`), duration `< 300ms`, interruptible CSS transitions over keyframes for dynamic intervention cues, `@media (hover: hover) and (pointer: fine)` gating, and GPU-only (`transform`, `opacity`) motion.

---

## 2. Automated Baseline Measurements (`lint.mjs` & Playwright DOM Telemetry)

### 2.1 `design-taste-frontend` Static Source Lint

Running `node ~/.agents/skills/design-taste-frontend/scripts/lint.mjs` across `apps/web/src` (`26` files):

- **Default (Page) Ruleset**: **`168 FAIL, 142 WARN`**
  - `FAIL [shadow]` (`27×`): `App.tsx:268,302`, `AccountPanel.tsx:606`, `button.tsx:11,15,16,17`, `StageView.tsx:624`, `HomeView.tsx:202,367`, etc.
  - `FAIL [hairline]` (`40×`): pervasive `border-b` / `divide-y` inside layout sections outside tables/forms.
  - `FAIL [mono]` (`93×`): heavy `font-mono` usage on prose labels, eyebrows, and metric descriptions rather than reserving monospace strictly for literal IDs/code/equations.
  - `FAIL [micro-label]` (`7×`): tracked uppercase micro-headers (`HomeView.tsx:113,205,303,351`, `CompilerView.tsx:433`, `ReflectionView.tsx:188`, `StageView.tsx:627`).
  - `FAIL [purple]` (`1×`): `apps/web/src/index.css:66` (`#7C3AED`) — **explicit CueX brand-identity exception** (System 2 Runtime Violet stroke of the crossed `X` mark).
  - `WARN [transition-all]` (`4×`): `button.tsx:7`, `tabs.tsx:29`, `HomeView.tsx:276`, `StageView.tsx:615`.
  - `WARN [glass]` (`3×`): `Navbar.tsx:44` (`backdrop-blur-md`), `App.tsx:267,301` (`backdrop-blur-[2px]`).
  - `WARN [bounce]` (`3×`): `Navbar.tsx:98`, `StageView.tsx:447,883` (`animate-pulse` status dots).
  - `WARN [h-screen]` (`2×`): `App.tsx:193` / `CompilerView.tsx:428` / `ReflectionView.tsx:183` (`min-h-screen` / `100vh` instead of `100dvh` / `min-h-dvh`).
  - `WARN [outlined-box]` (`122×`): nested 1px rounded borders where flat tone steps (`#FFFFFF` on `#F8F7F3` or `#F0EFE9`) should carry hierarchy.
- **App Screen (`--app`) Ruleset**: **`9 FAIL, 135 WARN`**
  - `FAIL [placeholder-data]` (`1×`): `apps/web/src/components/AccountPanel.tsx:445` uses `placeholder="speaker@example.com"`.
  - `FAIL [micro-label]` (`7×`), `FAIL [purple]` (`1×`, brand asset), plus the same `transition-all`, `glass`, `bounce`, `shadow`, and `mono` warnings.

### 2.2 Multi-Viewport Playwright Metrics (`audit-metrics.json`)

| View / State | Widths Tested | Document Overflow (`scrollWidth > clientWidth`) | Visually Clipped Regions? | Loaded Webfonts | Header Height (`1440 / 390`) | Sub-`11px` Text Nodes | Touch Targets `< 32px` |
|---|---|---|---|---|---|---|---|
| `HomeView` | `1440, 1280, 1024, 768, 390, 360` | `false` (hidden by root `overflow-x-hidden`!) | **YES (`768px` Navbar)** | All 5 loaded | `57px / 88px` | `24` (`390`: `23`) | `15` (`390`: `20`) |
| `CompilerView` (compiled) | `1440, 1280, 1024, 768, 390, 360` | `false` | **YES (`768px` Navbar, textarea clip)** | All 5 loaded | `57px / 88px` | `2` (`390`: `1`) | `10` (`390`: `15`) |
| `StageView` Focus (`L0` / active) | `1440, 1280, 1024, 768, 390, 360` | `false` | **YES (`768px` Navbar, Split-Strip title)** | All 5 loaded | `57px / 88px` | `3` (`390`: `2`) | `18` (`390`: `23`) |
| `StageView` Split-Strip | `1440, 1280, 768, 390, 360` | `false` | **YES (`1440` & `390` title `临场断点：为...`)** | All 5 loaded | `57px / 88px` | `3` | `15` (`390`: `23`) |
| `StageView` Inspector | `1440, 1280, 1024, 768, 390, 360` | `false` | **YES (`768px` Navbar)** | All 5 loaded | `57px / 88px` | **`39`** (`390`: `38`) | `8` (`390`: `13`) |
| `ReflectionView` | `1440, 1280, 1024, 768, 390, 360` | `false` | **YES (`768px` Navbar)** | All 5 loaded | `57px / 88px` | **`20`** (`390`: `19`) | `10` (`390`: `15`) |
| `AccountPanel` Drawer | `1440, 1280, 1024, 768, 390, 360` | `false` | **YES (2-line pill wraps, `userId` ellipsis)** | All 5 loaded | `57px / 88px` | **`21`** (`390`: `20`) | `11` (`390`: `16`) |

> [!IMPORTANT]
> **Critical Discovery (`App.tsx:193` + `Navbar.tsx:44-147`)**: `documentElement.scrollWidth` stayed equal to `clientWidth` only because `App.tsx:193` applies `overflow-x-hidden` on the root wrapper! Inspecting the actual `768px` screenshot (`home-768.png`) directly revealed that `Navbar` clips the `"个人记忆治理"` button on the right edge and squeezes the `"CueX"` wordmark at `768px`.

---

## 3. Pixel-Verified Findings Across Views & Breakpoints

### 3.1 `Navbar.tsx` & Global Shell (`home-768.png`, `home-390.png`, `compiler-compiled-390.png`)
- **P0 — `768px` Header Overflow Clipping (`home-768.png`)**: At `md` (`768px`), `Navbar` displays the brand mark, all 4 navigation buttons, the `本地规则引擎` status pill (`hidden md:inline-flex`), `CueX 演示演讲者 FREE`, AND `个人记忆治理` text simultaneously in one `flex-nowrap` row (`sm:flex-nowrap`). `"个人记忆治理"` is clipped off the right viewport border and `"CueX"` collapses behind the left nav button.
- **P1 — Frosted Glass Header Chrome (`Navbar.tsx:44`)**: Uses `bg-surface/95 backdrop-blur-md`; `app-screens.md` and `craft-floor.md` specify opaque flat surfaces (`bg-surface` or `bg-ground` with `1px` crisp edge).
- **P1 — Mobile Sub-32px Targets & Multi-Row Height (`home-390.png`)**: `15–23` interactive buttons per screen fall below `32px` height (far under the `44px` touch floor on `390px`/`360px`). Nav height jumps from `57px` to `88px` with thin hairline split.
- **P2 — Wordmark Asset Not Leveraged (`Navbar.tsx:53-65`, `assets/brand/cuex-wordmark.svg`)**: `Navbar` renders an inline React `Cue<span className="text-amber font-serif">X</span>` next to `cuex-symbol-dimensional.svg` (`brand-spec.md` notes `cuex-wordmark.svg` exists as a dedicated asset; either align `wordmark` cleanly with geometric `X` discipline or preserve `cuex-symbol-dimensional.svg` + neutral ink `CueX` without extra font mixing).

### 3.2 `HomeView.tsx` (`home-1440.png`, `home-1440-full.png`, `home-1024.png`, `home-390.png`, `home-360.png`)
- **P0 — Orphaned Line Wrap Inside Hero Graphic (`home-1440.png`, `home-1024.png`, `home-768.png`)**: Under the dimensional `X` symbol, `"System 1 × System 2"` breaks mid-term across two lines (`"System 1 × System"` / `"2"`).
- **P0 — Single-Character & Two-Line Pill Wrapping on Roadmap (`home-1440-full.png`, `home-1024.png`)**: In all 4 roadmap cards (`Social`, `Teaching`, `Sales`, `Custom`), the badge `"Planned · 路线图规划中 · 暂未开放实机"` wraps `"机"` alone onto a second line; at `1024px` `"Presentation 实机已就绪"` and `"X, 代表任意高压即时场景"` also break awkwardly mid-phrase (`"即\n时场景"`).
- **P1 — Repeated AI-Template Scaffolds (`home-1440-full.png`)**:
  - Tracked uppercase eyebrows sit above almost every heading (`CUEX · UNIVERSAL COGNITIVE COPILOT`, `DUAL-SYSTEM ARCHITECTURE`, `UNIVERSAL COGNITIVE RUNTIME`, `SCENARIO ADAPTER LAYER`).
  - Section 2 (`为什么独立 InterventionController 才是护城河`) relies on the exact stock **3 equal icon-in-tinted-square cards** (`<Zap />`, `<Brain />`, `<Minimize2 />`), and the `CueX Presentation` block immediately repeats another 3-column boxed card grid below it, followed by a 4-column roadmap card grid.
- **P1 — Mobile Narrow 3-Column Squeeze (`home-390.png`, `home-360.png`)**: The 3-column mini-strip (`System 1 · 琥珀流 | System 2 · 紫晶流 | V = H - λI`) squeezes 6 words per column at `360px` (`"System 2 · 紫晶\n流"`, `"以净有效介入衡量每\n次提示"`), while the 4 principle chips split `3 + 1` with an orphan chip.
- **P2 — `100vh` Usage (`App.tsx:193`, `index.css:102`)**: Uses `min-h-screen` / `min-height: 100vh` rather than `100dvh` (`min-h-dvh`).

### 3.3 `CompilerView.tsx` (`compiler-compiled-1440.png`, `compiler-facts-1440.png`, `compiler-qa-1440.png`, `compiler-compiled-390.png`)
- **P1 — Clipped Textarea Content in `CueSheet` (`compiler-compiled-1440.png`)**: `一句话核心论点` and `开场钩子` `<textarea>` controls clip their 3rd line (`"...上台、太容易打断思路"`) inside fixed small heights without comfortable line-height or auto-expansion.
- **P1 — Mobile Heading/Tag Collision (`compiler-compiled-390.png`)**: `"1. 材料导入与参数设\n定"` breaks `"定"` onto line 2 while `.pptx / .pdf / .md / .txt` wraps `.txt` onto line 2 beside it; `STAGE 01 / PRE-SESSION CONTEXT COMPILER` adds noisy eyebrow clutter.
- **P1 — Nested Bordered Containers & Sub-32px Fact Action Buttons**: `FactWhitelist` confirmation/lock/edit/delete icons use `h-7 w-7` (`28px`), tight on mobile and below `32px/44px` accessibility targets; provenance metadata uses `text-[10px]`.

### 3.4 `StageView.tsx` (`stage-focus-l0-1440.png`, `stage-focus-active-1440.png`, `stage-split-strip-1440.png`, `stage-split-strip-390.png`, `stage-inspector-1440.png`, `stage-inspector-360.png`)
- **P0 — `Split-Strip` Mode Desktop Stranding & Header Truncation (`stage-split-strip-1440.png`, `stage-split-strip-390.png`)**: On `1440px`, toggling `Split Strip` collapses the entire view into a `max-w-[440px]` centered column floating inside ~1000px of blank margins, truncating the active chapter title to `"临场断点：为..."`, squeezing chapter pills into narrow centered buttons, and inflating the `L2` cue into a tall 4-line paragraph block that pushes evidence & feedback below the initial viewport.
- **P1 — `L2` Cue Visual Weight & Redundant Nesting (`stage-focus-active-1440.png`)**: Instead of a peripheral-vision 2–6 character keyword capsule paired with a crisp grounded source line, the current `L2` card renders a full sentence (`"回到本节重点：传统长对话打断现场语言流与目光接触"`) inside 3 nested bordered containers (`outer stage` -> `amber box` -> `evidence pill chips`), increasing eye-scan friction.
- **P1 — Quiet `L0` Uncovered-Points Pill Noise (`stage-focus-l0-1440.png`)**: Pending chapter points are dumped as wrapping inline bordered pills (`event-driven System 1 + System 2...`) centered under `L0 · 正在持续理解`, distracting from a truly calm quiet stage.
- **P1 — `Inspector` Micro-Text & Boxed KPI Strip (`stage-inspector-1440.png`, `stage-inspector-360.png`)**: Contains **`39` DOM text nodes `< 11px`** (`text-[10px]`, `text-[9px]`) and 6 boxed metric cards instead of a single hairline-divided telemetry strip with `tabular-nums`. Missing upcoming Phase 1/2 **7-state Colab GPU ASR** badge (`not_configured | starting | ready | degraded | disconnected | restarting | unavailable`) and **`provider_unreported` / `reasoningTokens` / `correlationId`** CPA telemetry disclosures.
- **P1 — Pulsing Attention Dots (`StageView.tsx:447,883`, `Navbar.tsx:98`)**: Uses looping `animate-pulse` dots on calm L0 / recording indicators, violating `design-taste-frontend` (`[bounce]`) and calm peripheral-vision ergonomics.

### 3.5 `ReflectionView.tsx` (`reflection-1440.png`, `reflection-1440-full.png`, `reflection-360.png`)
- **P0 — Severe `panel-void` & Stretched Columns (`reflection-1440.png`)**: The left `V = H - λI` card (`NET UTILITY OBJECTIVE`) stretches to the height of the right `结构化诊断摘要` card (which holds an 8-item bullet list), creating ~`380px` of dead white void inside the score card. Simultaneously, the two adjacent inner cards (`超时章节` and `未准备/缺失事实问答`) stretch to match `遗漏关键点`, creating ~`260px` of empty white void in columns 2 and 3.
- **P0 — Orphan Grid Dead Space in Opt-in Memory Proposals (`reflection-1440-full.png`)**: When 1 `Opt-in Proposal` exists, placing it in a fixed multi-column grid leaves ~`66%` (`~850px`) of horizontal row emptiness on the right.
- **P1 — Raw Millisecond Timestamps on Timeline (`reflection-1440-full.png`, `reflection-360.png`)**: Timeline rows lead with opaque integers like `29912993:` instead of readable relative session offsets (`00:04`) with optional tabular telemetry.
- **P1 — Sub-`11px` Nodes & Mobile Button Wrapping (`reflection-360.png`)**: `20` sub-`11px` text nodes; at `360px` `"惩罚系数 λ:"` squeezes to 3 narrow stacked lines next to the `<select>` box.

### 3.6 `AccountPanel.tsx` (`account-plans-1440.png`, `account-plans-390.png`)
- **P0 — Placeholder Email (`AccountPanel.tsx:445`)**: Uses `speaker@example.com` (caught by `lint.mjs --app` `[placeholder-data]`).
- **P1 — Multi-Line Wrapped Plan Badges & Truncated Expiry (`account-plans-1440.png`, `account-plans-390.png`)**: `"Available · 沙盒可\n预览"`, `"Planned · 尚未开放\n购买"`, and `"定价假\n设"` wrap inside narrow pills; at `390px`, `令牌有效期至 1...` clips immediately after the first digit.

---

## 4. `emil-design-eng` Code & Interaction Review Table

Per `emil-design-eng/SKILL.md` review standards, every motion/interaction flaw identified in the baseline is itemized below:

| Before | After | Why |
|---|---|---|
| `button.tsx:7` & `tabs.tsx:29`: `transition-all` | `transition-[transform,background-color,border-color,color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]` | Avoids `transition: all` layout/paint side effects and gives crisp `<200ms` custom `ease-out` tactile response. |
| `HomeView.tsx:276` & `StageView.tsx:615`: `transition-all` on layout mode & cue preview containers | Explicit `transition-[opacity,background-color,border-color] duration-180 ease-[cubic-bezier(0.23,1,0.32,1)]` (no animated layout width/padding jumps) | Prevents multi-frame layout reflow jitter when toggling `Split Strip` or switching `L0–L3` preview states. |
| `Navbar.tsx:98` & `StageView.tsx:447,883`: infinite `animate-pulse` status dots | Static solid semantic indicator (`L0` resolved sage) or crisp border ring; reserve subtle slow breath strictly for `CueEdgeLight` `L1` | Continuous pulsing dots inside peripherals distract speakers (`>=100×` glance surface) and fail `lint.mjs [bounce]`. |
| `StageView.tsx` keyboard shortcuts (`Space`, `M`, `H`, `Esc`) toggle state inside animated containers | Keyboard-initiated actions apply immediate `0ms` state swap (mark `data-instant` or omit enter/exit delay); pointer/touch retains `150ms ease-out` press feedback (`scale(0.97)`) | Per `emil-design-eng`, never animate keyboard-initiated actions repeated frequently during a live talk. |
| `ui/button.tsx:11,15,16,17`: `shadow-sm` at rest + hover without `@media (hover: hover)` | Flat surface fill at rest (shadow reserved exclusively for floating overlays/dialogs) + `@media (hover: hover) and (pointer: fine)` hover elevation | Eliminates sticky hover artifacts on mobile (`390/360px`) and follows `app-screens.md` flat button system. |
| `App.tsx:268,302`: modal dialogs snap immediately centered with heavy `backdrop-blur-[2px]` | Clean opaque scrim (`bg-ink/35`, no blur) + `180ms ease-out` enter from `scale(0.96); opacity: 0` (`@starting-style` / CSS transition) | Eliminates `backdrop-blur` GPU cost while giving modals natural physical entry (`never scale(0)`). |
| `StageView.tsx` `CueEdgeLight` uses CSS keyframe `@keyframes cue-breathe` on `L2` active state too | Keep CSS transitions (`opacity` + `border-color`) for rapid interruptible `L2/L3 -> withdrawn` recovery; restrict slow breathe purely to `L1` edge cue | Rapidly interrupted `L2 -> user_recovered` cues must reverse smoothly mid-flight via CSS transitions instead of resetting keyframes. |

---

## 5. Prioritized Fix Backlog for Phase 2 UI Refactor

### P0 — Blocking Visual / Functional Defects (Fix First)
1. **Fix `768px` Navbar Clipping & Root Overflow Mask**: Remove silent `overflow-x-hidden` hiding horizontal issues on `App.tsx:193`; reorganize `Navbar.tsx` breakpoints (`sm/md/lg`) so brand, 4 nav destinations, account drawer, and memory drawer fit cleanly with `>= 44px` mobile targets and zero clipping at `768px`, `390px`, `360px`.
2. **Eliminate `ReflectionView` `panel-void` & Orphan Grid Dead Space**: Use `items-start` + balanced 2-column summary strip (`V = H - λI` integrated cleanly with metrics strip), collapsible/compact diagnosis lists (`遗漏关键点 / 超时章节 / 未准备问答`), and adaptive `1-col / 2-col / 3-col` grid for `Opt-in Proposals` matched to actual item count.
3. **Redesign `StageView` `Split Strip` Mode for Desktop & Mobile**: Anchor `split_strip` cleanly at desktop (non-centered `420px` presenter cue rail alongside compact progress/simulation column or dedicated corner stage dock) with zero chapter title truncation (`临场断点：为...`) and immediately visible `L2` cue + feedback buttons above the fold.
4. **Eliminate Wrapped Badges & Orphan Words Across `HomeView` / `AccountPanel`**: Shorten or `whitespace-nowrap` status tags (`Planned · 规划中` / concise secondary helper text), keep `"System 1 × System 2"` on one unbroken line, and fix `speaker@example.com` placeholder in `AccountPanel.tsx:445`.

### P1 — Design Craft, Peripheral-Vision Ergonomics & Phase 3 Feature Readiness
5. **Rebuild `HomeView` Around `The printed annual` Editorial System**: Adopt the `34%–42%` left-axis editorial rhythm, remove tracked uppercase eyebrows & 3-icon-square AI cards, replace Roadmap 4-card grid with interactive `Output index, live sheet` (`data-ui` preview), and close with inverted charcoal CTA + clean `cuex-wordmark.svg` footer.
6. **Elevate `StageView` `Focus` Peripheral Readability & Surface Phase 3 ASR/LLM Honesty**: Keep `L2` cues strictly concise (`2–6` chars/words primary pill + 1-line grounded reason), collapse nested simulation panels cleanly, remove sub-`11px` text in `Inspector`, integrate the 7-state `ColabAsrLifecycleState` status pill (`gpuName`, `modelId`, `rtf`, `fallbackActive`) and `CpaProviderAdapter` telemetry (`provider_unreported`, `reasoningTokens`, `correlationId`).
7. **Upgrade `CompilerView` Editing Ergonomics**: Auto-expanding `CueSheet` textareas, clean `>=32px` (desktop) / `>=44px` (mobile) Fact action buttons, flat surface hierarchy without 3x nested borders.

### P2 — Polish & Standards Hygiene
8. **Global Design Tokens & Motion Cleanup**: Replace `transition-all` with explicit CSS transitions, gate hover transforms with `@media (hover: hover)`, replace `min-h-screen` (`100vh`) with `min-h-dvh`, remove `backdrop-blur` & resting card `shadow-sm`, and bring all text `< 11px` up to `>= 12px` (`11px` hard floor strictly on rare compact code tags).
