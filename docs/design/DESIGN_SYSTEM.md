# CueX Design System (`DESIGN_SYSTEM.md`)

- **Scope**: `apps/web/**` (CueX Universal Cognitive Copilot & `CueX Presentation`)
- **Primary Visual Language**: **Warm Paper Daylight (`#F8F7F3`)** editorial ground with high-contrast charcoal ink (`#111318`), paired selectively with **System 1 Amber (`#E87A24`)** and **System 2 Violet (`#7C3AED`)** cognitive signals.
- **Two Surface Modes**:
  1. **Editorial Overview (`HomeView`, `Footer`)** — Direction **`The printed annual`** (`editorial-report`): generous negative space, `34%–42%` left-column reading axis, run-in monograph blocks, live `data-ui` cognitive stage plate, inverted ink closure CTA.
  2. **Operational Product Screens (`CompilerView`, `StageView`, `ReflectionView`, `AccountPanel`, `MemoryInspectorPanel`)** — Style **`Achromatic ledger`** (`achromatic-ledger`): monochrome charcoal + Warm Paper chrome (`>=97%` neutral), reserving Amber/Violet strictly for real-time cognitive intervention tiers, grounding provenance, and live health states.

---

## 1. Brand Marks (`assets/brand/`)

| Asset | Purpose | Placement |
|---|---|---|
| `/brand/cuex-wordmark.svg` | Primary outlined `CueX` light-ground wordmark (`Instrument Serif` `Cue` + Amber/Violet `X`) | `Navbar`, `Footer` |
| `/brand/cuex-wordmark-light.svg` | Outlined wordmark for dark charcoal ground (`#111318`) | `HomeView` inverted closure CTA |
| `/brand/cuex-symbol-dimensional.svg` | Dimensional two-ribbon crossed `X` | Favicon, Hero dual-system stage, `StageView` subtle anchor |
| `/brand/cuex-symbol.svg` / `cuex-symbol-mono.svg` | Compact flat mark / monochrome emblem | Compact badges, print derivatives |

Do not invent non-brand hero illustrations, stock photographs, or multi-font inline `Cue<span>X</span>` approximations when SVG wordmarks apply.

---

## 2. Color Tokens & WCAG AA Contrast Rules

All CSS custom properties live in `apps/web/src/index.css` (`:root`) and bind to `apps/web/tailwind.config.js`:

| Token | CSS Variable | Hex | Contrast / Usage Discipline |
|---|---|---|---|
| Ground (Primary Canvas) | `--ground` | `#F8F7F3` | Primary page & stage canvas |
| Ground Step (Recessed) | `--ground-2` | `#F0EFE9` | Nested inputs, tab tracks, subtle surface steps without borders |
| Ground Step Strong | `--ground-3` | `#E6E4DC` | Slider tracks, disabled surface fills |
| Elevated Sheet | `--surface` | `#FFFFFF` | Cards, forms, cue sheets, modal panels (`1px solid var(--line)`, **no resting drop-shadow**) |
| Primary Ink | `--ink` | `#111318` | Body copy (`>=15:1` on `#F8F7F3`), primary `#111318` action fills |
| Secondary Ink | `--ink-2` | `#474B57` | Descriptions, labels, secondary copy (`>=7.5:1`) |
| Muted / Meta Ink | `--ink-3` | `#626774` | Captions, table headers, placeholders (`>=5.0:1` on `#FFFFFF`, `>=4.6:1` on `#F8F7F3`) |
| Hairline Divider | `--line` | `#E2DFD7` | `1px` borders, ledger row & strip dividers |
| Strong Control Edge | `--line-strong` | `#C9C5BA` | Quiet button outlines, interactive input borders |
| System 1 Amber | `--amber` | `#E87A24` | `L1/L2` fast pacing strokes, ambient edge glow |
| Amber Accessible Ink | `--amber-ink` | `#A84B07` | All Amber text labels & badge copy (`>=4.5:1` on `#FFFFFF` and `#FBF0E6`) |
| Amber Tint | `--amber-tint` | `#FBF0E6` | Subtle Amber status pills & selected row washes |
| System 2 Violet | `--violet` | `#7C3AED` | `System 2` runtime stroke & `L3` Q&A visual accent *(explicit CueX brand token)* |
| Violet Accessible Ink | `--violet-ink` | `#5B21B6` | All Violet text labels (`>=6.0:1`) |
| Violet Tint | `--violet-tint` | `#F1EBFE` | Evidence-backed Q&A badges & grounding highlights |
| Resolved Sage | `--resolved` / `--resolved-tint` | `#1F6B52` / `#E3F1EC` | Verified grounding, `user_recovered` automatic withdrawal, Colab ASR `ready` |
| Alert Rust | `--alert` / `--alert-tint` | `#B83B1D` / `#FCEEE9` | Missing evidence cautions, validation/request errors, destructive data wipe triggers |

---

## 3. Typography & Restraint Discipline

Self-hosted variable fonts served cleanly from `/fonts/*.ttf` (`assets/fonts/`):

- **Editorial Display (`HomeView` headlines & closure thesis only)**: `"Noto Serif SC", "Instrument Serif", Georgia, serif`
  - Hero `h1`: `clamp(2.25rem, 4.6vw, 4rem)`, `line-height: 1.12`, tight negative tracking (`-0.02em`), max `2` lines.
  - Section headers (`Persuade`): `24px–32px`, max `60ch`.
- **Product UI & Reading Copy (`Compiler`, `Stage`, `Reflection`, `Account`, forms)**: `"Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif`
  - Operate `h1`: `24px` (`text-2xl font-semibold`, zero `>32px` marketing hero inflation inside product views).
  - Card / section titles: `16px` (`font-semibold`).
  - Body, inputs, descriptions: `14px`–`15px`, line-height `1.55`–`1.65`, editorial measure `<= 65ch`.
  - **Size Floor**: `12px` (`text-xs`) standard minimum across UI metadata and badges; `11px` allowed strictly on compact code/telemetry pills; **zero `< 11px` text nodes anywhere in the DOM**.
- **Literal Math & Telemetry Only**: `"JetBrains Mono", monospace` + `.num { font-variant-numeric: tabular-nums }`.
  - Use monospace **only** for `V = H - λI`, protocol field names, session IDs, token counts, costs (`¥59.00`), timestamps (`00:04`), and latency values.
  - **Ban** `font-mono uppercase tracking-widest` eyebrows above prose headings.

---

## 4. Spacing, Surface Hierarchy & Iconography

- **Radius Scale**: `--r: 4px` base (`2px` tight micro-pills/tabs, `4px` controls/cards, `6px` dialogs). Avoid pill overload (`rounded-full` reserved strictly for 6–8px semantic status dots and peripheral cues).
- **Nesting & Borders (`<= 2` layers)**:
  - Outer canvas (`#F8F7F3`) -> sheet (`#FFFFFF`, `1px border-line`) -> recessed well (`#F0EFE9`, `border-0`). Never stack 3 nested `rounded border` boxes inside a card.
  - Prefer `1px` `divide-x` / `divide-y` hairline ledger strips (`achromatic-ledger`) over row-of-4 separate boxed KPI tiles.
- **Shadow Restraint**: `box-shadow: none` on all cards, buttons, tabs, and stage containers at rest. Elevation shadows apply **exclusively** to floating Radix Dialogs/Menus.
- **Icons**: Lucide React `16px–18px` (`1.75–2px` stroke) aligned uniformly on `items-center` baselines. Zero primary emoji icons (`🚀`, `🔥`, `💡`), and zero generic AI SaaS 3-equal icon-in-tinted-square feature cards.

---

## 5. Motion & Interaction Tokens (`emil-design-eng`)

Defined in `apps/web/src/index.css`:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
--dur-fast: 120ms;
--dur-ui: 180ms;
--dur-drawer: 240ms;
```

1. **Ban `transition-all`**: Always specify exact properties (`transition-[transform,background-color,border-color,color,opacity]`), avoiding multi-frame layout thrash.
2. **Tactile Press & Hover Discipline**:
   - Interactive buttons press smoothly with `active:scale-[0.97]` (`disabled:active:scale-100`) over `120ms var(--ease-out)`.
   - Hover lifts and tint shifts only apply behind `@media (hover: hover) and (pointer: fine)` so mobile taps never get stuck in hover state.
3. **Zero Keyboard Delay**: High-frequency Stage speaker shortcuts (`Space`, `M`, `H`, `Esc`) swap state immediately (`0ms`).
4. **Interruptible Cue State Transitions**: `L0 -> L1 -> L2 -> L3 -> withdrawn` overlays transition strictly via `opacity` and `transform` (`180ms var(--ease-out)`), cancelling cleanly mid-flight when `InterventionController` emits `withdraw (user_recovered)`.
5. **No Decorative Loops**: Remove all `animate-pulse` status dots. Keep subtle peripheral glow breathing exclusively on `CueEdgeLight` when `phase === 'l1_amber' || phase === 'l1_violet'`, disabling immediately under `@media (prefers-reduced-motion: reduce)`.

---

## 6. Accessibility, Layout Integrity & Breakpoints

- **Viewport Height**: Always use `min-h-dvh` / `max-h-[88dvh]` instead of `100vh` / `min-h-screen`.
- **Root Overflow Policy**: Do **not** mask horizontal bugs with root `overflow-x-hidden`. Every breakpoint must pass `scrollWidth <= clientWidth` truthfully with zero edge clipping.
- **Touch Targets**: `>= 36px` (`h-9`) default controls on desktop, `>= 32px` compact icon actions (`min-h-8 min-w-8`), `>= 44px` comfortable touch targets on `< 640px` mobile.
- **Focus & Selection**: Custom `::selection` in `--amber-tint` + `2px solid var(--ink)` `:focus-visible` outline (`outline-offset: 2px`).
- **Mandatory Verification Widths**: `1440×900`, `1280×800`, `1024×768`, `768×1024`, `390×844`, `360×800`.
