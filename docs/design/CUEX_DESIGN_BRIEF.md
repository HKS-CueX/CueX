# CueX Design Brief & System Architecture (`CUEX_DESIGN_BRIEF.md`)

- **Date**: `2026-11-16`
- **Target Scope**: `apps/web/**` Phase 2 UI Excellence Refactor (following Phase 0 baseline audit in [`FRONTEND_AUDIT.md`](./FRONTEND_AUDIT.md))
- **Brand Identity Source**: [`assets/brand/brand-spec.md`](../../assets/brand/brand-spec.md)

---

## 1. Art Direction Record (`design-taste-frontend` `draw.mjs --keep palette,type`)

CueX comprises **two distinct surface classes** using one shared brand palette and typography:
1. **Editorial Overview (`HomeView`)** — judged by `design-taste-frontend` **Page** rules + `impeccable` **Persuade** mode.
2. **Operational Product Screens (`CompilerView`, `StageView`, `ReflectionView`, `AccountPanel`, `MemoryInspectorPanel`)** — judged by `design-taste-frontend/references/app-screens.md` + `impeccable` **Operate** mode.

### 1.1 Page Track Direction Sheet (`.taste-skill/page/direction.json`)
- **Command Run**:
  `node ~/.agents/skills/design-taste-frontend/scripts/draw.mjs --sector ai-product --tone editorial --keep palette,type --sections showcase,how-it-works,features,about,cta,footer --direction editorial-report --out .taste-skill/page`
- **Direction Chosen**: **`The printed annual`** (`editorial-report`, `seed: 1171274034`)
- **Why This Fits CueX**: CueX is a serious cognitive systems product with dual-stream architecture (`System 1 × System 2`), real evaluation math (`V = H - λI`), and explicit capability boundaries (`Available` vs `Planned`). The printed annual lays a calm `34%–42%` vertical axis across the page where architecture claims, interactive `data-ui` interface plates, and boundary disclosures read like an edited monograph rather than a generic SaaS template.
- **Documented Redraws (`redraws: 2`)**:
  1. `section:cta` redrawn from `Three photographs, then a field` (`cta-photo-strip-then-field`) -> **`The idea again, inverted` (`cta-idea-restated-inverted`)**.
     - *Reason*: The dealt blueprint required three external stock photographs and a portrait photo; CueX has no external photography/team portraits and must not invent or fetch decorative stock photos. Flipping `#111318` ink ground against `#F8F7F3` paper typography delivers high-craft closure using CueX's own brand ink.
  2. `hero` redrawn from `Two-by-two board` -> **`Narrow talk, wide headline`**.
     - *Reason*: `Two-by-two board` required two greyscale editorial photographs. `Narrow talk, wide headline` maps the `34%` left column to CueX's concise positioning & primary action, and the right `66%` column to the large headline (`你的快思考外挂`) plus a live cropped `data-ui` stage fragment with an Amber accent figure (`V = H - λI`).
- **One Page Idea & Live Interaction**:
  - *Idea Sentence*: **On this page, CueX's `System 1 × System 2` arbitration boundary (`L0–L3 -> withdraw`) becomes an interactive typographic plate (`data-ui`) anchored on a `34%–42%` editorial axis.**
  - *One Live Thing*: The interactive `L0 / L1 / L2 / L3 / 主动退出` state preview plate built directly in `data-ui` HTML inside the hero right stage, updating edge hue, cue pill, grounded citation badge, and controller verdict immediately on click/tap.

### 1.2 App Screen Track Style Sheet (`.taste-skill/app/direction.json`)
- **Command Run**:
  `node ~/.agents/skills/design-taste-frontend/scripts/draw.mjs --app --kind devtools --theme light --keep palette,type --screens overview,builder,detail,settings,report --style achromatic-ledger --out .taste-skill/app`
- **Style Chosen**: **`Achromatic ledger`** (`achromatic-ledger`, `seed: 201260873`, `kind: devtools`, `theme: light`)
- **Why This Fits CueX**: During live speech (`StageView`), compiler verification (`CompilerView`), telemetry review (`Inspector`), and post-talk scoring (`ReflectionView`), color must never compete with peripheral vision. `Achromatic ledger` keeps >97% of the chrome pure charcoal ink on Warm Paper (`#F8F7F3`) and crisp `#FFFFFF` sheets, reserving Amber (`#E87A24`) and Violet (`#7C3AED`) strictly for real-time cognitive signals, active state indicators, and primary data elements.
- **Documented Redraw (`redraws: 1`) & Brand Allowance**:
  1. `shell` redrawn from `Open plane` (`240px` persistent sidebar) -> **Compact Horizontal Top Bar (`48px–52px`, `No sidebar` archetype in `app-screens.md` §3.1)** on Phase 2 implementation.
     - *Reason*: CueX has only four linear workflow destinations (`Home`, `Compiler`, `Stage`, `Reflection`) plus two utility drawers (`Account`, `Memory`). A `240px` left sidebar compresses the `StageView` peripheral-vision cue canvas and conflicts with compact `Split-Strip` presentation ergonomics. A single-row `52px` flat top bar (collapsing cleanly at `<=1023px` without clipping and folding at `<640px` into a balanced 2-row compact bar) preserves full-bleed stage geometry.
  2. **Inspector Allowance (`--allow purple` / `--allow mono` on literal telemetry/math)**: Documented explicit CueX brand exception for `System 2` Runtime Violet (`#7C3AED`) and literal `JetBrains Mono` strictly for IDs, token counts, latencies, ASR telemetry, and equations (`V = H - λI`), while banning `font-mono` from UI prose headings and eyebrows.

---

## 2. Preserved Brand & Design Tokens (`--keep palette,type`)

All colors stay faithful to `assets/brand/brand-spec.md` while tightening text contrast to pass WCAG AA (`>= 4.5:1`) everywhere:

| Role | Token | Value | Contrast / Usage Rule |
|---|---|---|---|
| **Ground (Primary Canvas)** | `--ground` | `#F8F7F3` | Warm Paper Daylight page background (`home`, `compiler`, `stage`, `reflection`) |
| **Ground Step (Recessed)** | `--ground-2` | `#F0EFE9` | Nested inputs, recessed tool wells, subtle surface separation without borders |
| **Elevated Sheet** | `--surface` | `#FFFFFF` | Primary work panels, cue cards, dialog surfaces (`1px solid var(--line)` OR tone step; never `shadow` at rest) |
| **Primary Ink** | `--ink` | `#111318` | All running text (`>=15:1` on `#F8F7F3`), primary CTA buttons (`#111318` fill, `#F8F7F3` ink) |
| **Secondary Ink** | `--ink-2` | `#474B57` | Descriptions, table sublines (`>=7.5:1` on `#FFFFFF` / `#F8F7F3`) |
| **Muted / Meta Ink** | `--ink-3` | `#626774` *(tightened from `#6B707D`)* | Captions, table headers, placeholders — reaches `>= 5.0:1` on `#FFFFFF` and `>= 4.6:1` on `#F8F7F3` |
| **Structural Line** | `--line` / `--line-strong` | `#E2DFD7` / `#C9C5BA` | `1px` table/panel edges (`border-line`), `control` outlines (`border-line-strong`) |
| **System 1 Amber** | `--amber` / `--amber-ink` / `--amber-tint` | `#E87A24` / `#A84B07` *(AA-safe)* / `#FBF0E6` | `L1/L2` fast pacing cues, edge halo, drift/omission pill ink |
| **System 2 Violet** | `--violet` / `--violet-ink` / `--violet-tint` | `#7C3AED` / `#5B21B6` / `#F1EBFE` | `System 2` deep grounding, `L3` Q&A evidence pill, brand crossed-`X` stroke |
| **Resolved Sage** | `--resolved` / `--resolved-tint` | `#1F6B52` / `#E3F1EC` | Verified grounding pass, automatic withdrawal, Colab ASR `ready` status |
| **Alert Rust** | `--alert` / `--alert-tint` | `#B83B1D` / `#FCEEE9` | Unrecoverable errors, missing Q&A evidence caution, destructive wipe triggers |

### Typography Architecture
Self-hosted local variable fonts from `assets/fonts/` (verified loaded via Playwright `document.fonts`):
- **Chinese & Brand Display (`HomeView` hero & section anchors only)**: `"Noto Serif SC"`, `"Instrument Serif"`, serif (`tracking: -0.02em` to `-0.03em`).
- **Operate UI & Body (`Compiler`, `Stage`, `Reflection`, `Account`, forms, buttons)**: `"Inter"`, `"Noto Sans SC"`, sans-serif. Never mix serif display typography into compact form labels, buttons, or Inspector metrics.
- **Literal Telemetry & Equations Only**: `"JetBrains Mono"`, monospace + `font-variant-numeric: tabular-nums`. Use `.num` (`tabular-nums` in `"Inter"`) on all UI counters, clocks (`00:00 / 07:00`), prices (`¥59.00`), and KPIs.
- **Scale & Hard Floors**:
  - **Editorial (`HomeView`)**: `h1` `clamp(2.25rem, 5.2vw, 4.25rem)` (`36px–68px`), max 2 lines; section headings `24px–32px`; body `16px` (`leading 1.6`, measure `<= 65ch`).
  - **Operate (`Compiler` / `Stage` / `Reflection`)**: page `h1` `24px` (`text-2xl font-semibold`, zero `>32px` hero bloat); card/section titles `16px` (`font-semibold`); body/inputs `14px`; meta/badges `12px` (`11px` strict absolute minimum — eliminate all `9px`/`10px` nodes).

---

## 3. Motion, Interaction & Accessibility Contract (`emil-design-eng` + `craft-floor`)

1. **Zero Keyboard Animation**: `StageView` shortcuts (`Space` pause/resume, `M` silent `L0`, `H` helpful/help, `Esc` dismiss hint) execute instantaneously (`0ms` CSS delay) so live speech control never feels sluggish.
2. **Interruptible Cue Transitions**: `L0 -> L1 -> L2 -> L3 -> withdrawn` overlays transition strictly via GPU-composited `transform` and `opacity` (`180ms cubic-bezier(0.23, 1, 0.32, 1)`), allowing mid-flight cancellation when the speaker recovers without keyframe jumps.
3. **Explicit Property Transitions Only**: Ban `transition-all` codebase-wide (`button.tsx`, `tabs.tsx`, `HomeView.tsx`, `StageView.tsx`). Name exact properties: `transition-[transform,background-color,border-color,color,opacity] duration-150`.
4. **Tactile Press & Hover Discipline**: Buttons apply `active:scale-[0.97]` on press (`120ms ease-out`); hover background/lift shifts wrap in `@media (hover: hover) and (pointer: fine)` CSS rules. Flat buttons carry no rest `shadow-sm`.
5. **No Decorative Loops**: Remove all `animate-pulse` status dots (`Navbar`, `StageView`). Only `CueEdgeLight` uses a low-opacity calm ambient breath strictly while `phase === 'l1_amber' || phase === 'l1_violet'` (and drops immediately under `prefers-reduced-motion: reduce`).
6. **Touch Targets & Viewport Height**: Use `min-h-dvh` instead of `100vh`/`min-h-screen`. Keep desktop control heights unified (`32px` / `36px` / `40px` tiers) and mobile touch targets `>= 44px` (`390px` / `360px`).

---

## 4. Concrete Phase 2 Refactor Blueprint (View by View)

### 4.1 `Navbar` & Global App Shell (`apps/web/src/components/layout/Navbar.tsx`, `App.tsx`)
- Remove `overflow-x-hidden` mask from root `App.tsx` wrapper so real horizontal overflow bugs surface cleanly in E2E and `inspect.mjs`.
- Replace `bg-surface/95 backdrop-blur-md` with crisp opaque `bg-surface border-b border-line`.
- **Responsive Breakpoint Arithmetic**:
  - `>= 1280px`: Single `56px` row: Brand (`cuex-symbol-dimensional.svg` + `CueX` + separator + tagline) | Centered 4-tab navigation (`首页概览`, `场前编译`, `场中协同`, `场后复盘`) | Compact Runtime/ASR pill + Account trigger (`name · plan`) + Memory button.
  - `768px–1279px` *(fixes `768px` clipping)*: Keep `px-4`, hide redundant tagline, collapse `Runtime` pill into compact `dot + status` tooltip badge or move inside Account/Stage summary, and show concise `记忆` label on `md` (`768px`) so all controls fit within `736px` inner width with `>=16px` breathing room and zero edge clipping.
  - `< 640px` (`390px` & `360px`): Row 1 (`48px`) = Logo + Account + Memory icon (`>=40–44px` tap target); Row 2 (`44px`) = 4-column equal-width segmented navigation strip with `whitespace-nowrap`.
- Update `Account` & `Memory` dialogs (`App.tsx`) to opaque `bg-ink/40` backdrop (no blur), clean `180ms ease-out` `scale(0.96) -> 1` entry transition, `max-h-[88dvh]`.

### 4.2 `HomeView.tsx` (`The printed annual` Page Track)
- **Remove all 4 tracked uppercase eyebrow labels** and **remove the 3 equal icon-in-square cards** (`<Zap />`, `<Brain />`, `<Minimize2 />`).
- **Hero (`Narrow talk, wide headline`)**:
  - 12-column editorial layout divided cleanly along the ~`34%–42%` axis (`lg:col-span-4` / `lg:col-span-8` on desktop, clean stacked flow on mobile).
  - Left column: CueX positioning statement (`在深度思考之外，接住当下。`), succinct 2-sentence explanation, primary dark `#111318` button (`进入 CueX Presentation 场前编译`) + quiet secondary trigger (`一键载入 CueX 路演演示包`), and a crisp 3-row tabular summary list (`System 1 · 琥珀流`, `System 2 · 紫晶流`, `V = H - λI` — never cramped into 3 tiny columns at `360px`).
  - Right column: Large `你的快思考外挂` `h1` (`Noto Serif SC`, max 2 lines) + integrated `data-ui` **Live Cognitive Stage Plate** showing the `cuex-symbol-dimensional.svg` crossed `X` mark (`System 1 × System 2` wrapped in `whitespace-nowrap`, never breaking `2` onto a second line!) alongside the interactive `L0 / L1 / L2 / L3 / 主动退出` live cue simulator and an Amber accent figure tile (`V = H - λI`).
- **Section 1 — Architecture Narrative (`Run-in column`)**: Replaces the 3 icon-square feature cards with an editorial `560ch`-aligned reading sequence (`为什么独立 InterventionController 才是护城河`) using bold run-in statements (`多信号联合触发` / `严格事实白名单` / `TTL 与主动撤回`) paired with clean `data-ui` micro-artifacts.
- **Section 2 — Scenario Showcase (`Output index, live sheet`)**:
  - Consolidates `CueX Presentation` (`Available · 已实机上线`) and the 4 planned scenarios (`Social`, `Teaching`, `Sales`, `Custom` — `Planned · 规划中`) into one interactive two-column index + live specification sheet (`data-testid="scenario-matrix"` preserved cleanly, keeping `scenario-card-<id>` & disabled `scenario-disabled-<id>` contracts for E2E honesty checks without 4 multi-line wrapped tiny cards!).
  - Keeps `12px+` `whitespace-nowrap` status tags (`Available` / `Planned`) so badges never break into single orphaned Chinese characters (`"机"`).
- **Section 3 — Runtime Honesty Strip + Inverted CTA Band (`The idea again, inverted`)**: Full-bleed `#111318` band with `#F8F7F3` display thesis (`在深度思考之外，接住当下。`), direct compiler launch link, and real backend health/account readout (`home-auth-strip`).
- **Footer (`Footer.tsx`)**: Grounded 3-column summary + `cuex-wordmark.svg` signature lockup.

### 4.3 `CompilerView.tsx` (`Operate` / `Builder`)
- Delete `STAGE 01 / PRE-SESSION CONTEXT COMPILER` uppercase eyebrow; start cleanly with `24px` `h1` (`场前编译 · 构建上下文与事实白名单`) + inline saved-pack selector + sample pack loader.
- Keep `<=2` nesting depth: outer page `#F8F7F3`, workspace cards `#FFFFFF` (`border-line`), inner form wells `#F0EFE9` (`border-0`) — eliminate 3-layer concentric rounded borders.
- Auto-expanding or `rows={3}`–`4` `CueSheet` textareas (`一句话核心论点`, `开场钩子`) so no 3rd line is clipped at `1440px`.
- Fix mobile `<section>` header layout (`1. 材料导入与参数设定` + file type label stacked cleanly on `< 480px` so `"定"` never wraps alone).
- Enlarge `FactWhitelist` row actions (`confirm`, `lock`, `edit`, `delete`) to `min-h-8 min-w-8` (`36px`/`44px` on touch devices) and provenance badges to `12px`.

### 4.4 `StageView.tsx` (`Focus`, `Split-Strip` & `Inspector`)
- **Focus Mode (`viewMode === 'focus'`, `layoutMode === 'full'`)**:
  - Single serene Focus Stage: Chapter & `tabular-nums` pace header (`00:00 / 07:00`, no `CURRENT CHAPTER` tracked eyebrow), central quiet `L0` sanctuary (calm resolved ring without `animate-pulse`, concise plain text list of up to 3 remaining points instead of pill soup), crisp `L2` peripheral-vision cue (`2–6` word/char giant headline + 1-line reason + single-line grounded provenance link instead of 3 nested borders), and unobtrusive `有效 (H)` / `打扰 (I)` / `忽略` bar.
  - Consolidate speech simulation & microphone controls into one flat unified dock below the cue card (avoid nested `text_simulation` card inside `ASR` card).
  - Surface Phase 1/2 **Real ASR & LLM Telemetry**:
    - Explicitly render `ColabAsrLifecycleState` (`not_configured | starting | ready | degraded | disconnected | restarting | unavailable`) + GPU/model/RTF/fallback badge (`asr.lifecycleState`, `asr.gpuName`, `asr.modelId`, `asr.rtf`, `asr.fallbackActive`, `asr.fallbackReason`).
    - Clearly distinguish `colab_gpu` / `sherpa_local` / `web_speech` / `text_simulation` without ever impersonating live mic input.
- **Split-Strip Mode (`layoutMode === 'split_strip'`) — Critical Ergonomics Fix**:
  - On desktop (`>= 768px`), render a dedicated **`420px` left/center-left Stage Companion Strip paired alongside a structured live chapter checklist & audio dock** (`grid-cols-[420px_minmax(0,1fr)]` in a compact `max-w-[920px]` frame) — OR dock the `420px` companion strip cleanly at top-left without truncating the active chapter title (`line-clamp-2` instead of ellipsis `"临场断点：为..."`) and keeping the `L2` cue compact (`<= 2` lines) so feedback & withdrawal controls always remain visible above the `800px` fold!
- **Inspector View (`viewMode === 'inspector'`)**:
  - Replace the 6 individual KPI boxes with **one horizontal hairline-divided `achromatic-ledger` telemetry strip** (`contextVersion`, `S1 P95 Latency`, `LLM Calls / Rule Fallbacks`, `Tokens & Cost`, `Usage Source`, `ASR Lifecycle`), using `tabular-nums` (`14px/24px`) and eliminating all `39` sub-`11px` text nodes (`>= 12px` across rows/labels, `11px` floor strictly on compact badges).
  - Display `provider_unreported` (`"供应商未返回用量（非 0 消耗）"`), `reasoningTokens`, `correlationId`, and Colab GPU health (`lastHealthCheckAt`, `rtf`, `fallbackReason`) faithfully once `@protocol-architect` / `@runtime-server` expose them.

### 4.5 `ReflectionView.tsx` & `AccountPanel.tsx` (`Report` & `Settings`)
- **`ReflectionView.tsx`**:
  - Eliminate `panel-void` in row 1: use `items-start` and restructure the top summary into a compact `achromatic-ledger` score header (`V = H - λI` + `H / I / 主动撤回 / 抑制冗余` + `λ` selector in a balanced top strip, followed cleanly by the structured diagnostic grid where `遗漏关键点`, `超时章节`, and `未准备问答` use compact divided list panels with natural content heights `items-start`, never stretched `260px` blank boxes!).
  - Replace raw millisecond timestamps (`29912993:`) on the session timeline with human-readable session offset (`00:04` `tabular-nums`, keeping `event_type` and muted telemetry aligned cleanly).
  - Size the `Opt-in Proposals` grid dynamically (`proposals.length === 1 ? 'grid-cols-1 max-w-2xl' : proposals.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'`) so zero orphan dead columns appear.
- **`AccountPanel.tsx`**:
  - Fix placeholder email `speaker@example.com` -> `speaker@cuex.local`.
  - Convert the 4 boxed usage tiles into a single divided `achromatic-ledger` usage strip (`1px` vertical hairline dividers).
  - Keep all Plan status badges (`Available`, `Planned`, `当前方案`) single-line `whitespace-nowrap`, move `"定价假设"` to a clear sub-caption instead of competing beside status badges, and give token expiry timestamps enough width so `390px` mobile never clips after the first character.

---

## 5. Verification Acceptance Criteria for Phase 2 UI Refactor

Every UI refactor PR against `apps/web/**` must pass ALL checks before merging:
1. `pnpm --filter @cuex/web typecheck && pnpm --filter @cuex/web test && pnpm --filter @cuex/web build` -> exit `0`.
2. `node ~/.agents/skills/design-taste-frontend/scripts/lint.mjs --app apps/web/src` -> `0 FAIL` (with explicit `--allow purple` / `taste-skill-ignore` annotations ONLY for CueX's documented System 2 Violet `#7C3AED` token and intentional `font-mono` equations/telemetry).
3. Multi-viewport Playwright sweep across **all 6 mandatory widths** (`1440×900`, `1280×800`, `1024×768`, `768×1024`, `390×844`, `360×800`) capturing AFTER screenshots into `.cuex-runtime/screenshots/after/` with:
   - `0` console errors, `0` page errors;
   - `0` horizontal overflows (`scrollWidth <= clientWidth`) AND verified zero visual header/element clipping at `768px`, `390px`, and `360px` via `read_file` pixel inspection;
   - `0` `panel-void` stretched blank regions and `0` sub-`11px` unreadable nodes;
   - Full `presentation-e2e.test.mjs` passing against real updated `@cuex/server` + Colab/CPA endpoints!
