# CueX Component Inventory (`COMPONENT_INVENTORY.md`)

Inventories every UI primitive, layout shell component, global drawer, and product view in `apps/web/src/`, documenting variants, states, accessibility contracts, `data-testid` hooks, and Phase 3 wiring boundaries.

---

## 1. Foundational Primitives (`apps/web/src/components/ui/`)

| Component | File | Variants & Sizes | States & Rules |
|---|---|---|---|
| `Button` | `ui/button.tsx` | `variant`: `default`, `quiet`, `ghost`, `link`, `amber`, `violet`, `resolved`, `alert`<br>`size`: `default` (`h-9` / `min-h-[40px]` mobile), `sm` (`h-8`), `lg` (`h-11`), `icon` (`h-9 w-9`) | Zero resting `shadow-sm`; explicit `transition-[transform,background-color,border-color,color,opacity] duration-150`; `active:scale-[0.97] disabled:active:scale-100`; hover rules scoped safely. |
| `Badge` | `ui/badge.tsx` | `variant`: `default`, `secondary`, `outline`, `amber`, `violet`, `resolved`, `alert` | `whitespace-nowrap`, minimum `12px` (`text-xs`) text floor so multi-word status tags never split orphaned single CJK characters across 2 lines. |
| `Tabs` / `TabsList` / `TabsTrigger` | `ui/tabs.tsx` | Horizontal segmented tabs on `bg-ground-2` | Explicit property transition (`duration-150`); active tab uses crisp `bg-surface border border-line-strong text-ink` instead of `shadow-sm` + `ring`. |
| `Slider` | `ui/slider.tsx` | Radix continuous slider | Comfortable vertical hit area (`py-3 sm:py-2`); hairline bordered thumb (`border-ink bg-surface`, no resting shadow). |

---

## 2. Shell & Brand Components (`apps/web/src/components/`)

| Component | Purpose | States & Breakpoints | Key `data-testid` Contracts |
|---|---|---|---|
| `Navbar` | `components/layout/Navbar.tsx` | Sticky opaque `bg-surface border-b border-line` (no `backdrop-blur`).<br>• `>=1280px`: Brand lockup (`cuex-wordmark.svg`) + tagline + 4 tabs + Runtime pill + Account + Memory.<br>• `768px–1279px` (`md`/`lg`): Hides verbose tagline (`xl:inline`) & collapses memory text smoothly at `md` (`记忆` / `个人记忆治理` at `lg:`) so `768px` fits with zero right-edge clipping.<br>• `<768px` (`390px`/`360px`): Row 1 (`48px` Brand + Account + Memory), Row 2 (`44px` 4-col equal grid with `min-h-[44px]` touch tabs). Zero `animate-pulse` dots. | `nav-home`, `nav-compiler`, `nav-stage`, `nav-reflection`, `nav-health-badge`, `open-account-drawer`, `open-memory-drawer` |
| `Footer` | `components/layout/Footer.tsx` | Monochrome `bg-ground-2/60 border-t border-line`; renders `/brand/cuex-wordmark.svg`, core intervention commitments, privacy boundaries, and `>=36px` quick-nav triggers (`>=12px` typography). | — |
| `CueEdgeLight` | `components/CueEdgeLight.tsx` | Fixed peripheral light edge frame (`pointer-events: none`) supporting `quiet`, `l1_amber`, `l1_violet`, `l2_active`, `withdrawn`, `paused`. Ambient breath runs strictly during `L1` (`prefers-reduced-motion` static fallback); rapid recovery dissolves smoothly via CSS opacity transitions. | `cue-edge-light` |
| `AccountPanel` | `components/AccountPanel.tsx` | 4-tab console (`account`, `plans`, `sessions`, `privacy`) inside Radix Dialog.<br>• Replaces invalid `*-soft`/`danger` Tailwind classes with `--alert` / `--amber-tint` / `--violet-tint` / `--resolved-tint`.<br>• Uses `achromatic-ledger` 4-col divided usage strip.<br>• `PlanCard` keeps `whitespace-nowrap` status badges (`Available`, `Planned`, `当前方案`) and places pricing hypothesis caption cleanly below price.<br>• Replaces `speaker@example.com` placeholder with clean descriptive prompt. | `account-panel`, `account-user-name`, `account-refresh-btn`, `account-tab-{account,plans,sessions,privacy}`, `auth-switch-{form,name,email,tenant,submit}`, `auth-rotate-btn`, `account-usage-summary`, `payment-channel-select`, `pro-cycle-select`, `plan-card-*`, `plan-status-*`, `preview-checkout-*`, `checkout-preview-result`, `usage-ledger-list`, `session-history-{list,empty,item-*}`, `inspect-session-*`, `delete-session-*`, `history-deletion-receipt`, `export-{json,md}-btn`, `export-preview`, `confirm-account-wipe-checkbox`, `wipe-account-data-btn`, `account-deletion-receipt` |
| `MemoryInspectorPanel` | `components/MemoryInspectorPanel.tsx` | Inspect, create, confirm, patch, and delete opt-in `MemoryItem` records with privacy scopes (`/api/memory`). *(Refined in Part 2 alongside Reflection integration.)* | `memory-inspector`, `memory-add-toggle`, `memory-delete-*` |

---

## 3. Product Views (`apps/web/src/views/`)

### 3.1 `HomeView.tsx` — Public Overview & Product Monograph (Phase 3 Part 1)
- **Layout Track**: `The printed annual` (`editorial-report`).
- **Composed Public Sections**:
  1. **Hero (`Narrow talk, wide headline`)**: `34%–42%` left axis (`在深度思考之外，接住当下。`, 2-sentence overview, primary CTA, crisp 3-row System 1/2 + `V = H - λI` ledger) paired with `62%` right stage (`你的快思考外挂` `Noto Serif SC` headline + **"One Live Thing"** interactive `L0 / L1 / L2 / L3 / 主动退出` cognitive-restraint simulator plate with live `cuex-symbol-dimensional.svg` and utility score indicator).
  2. **How It Works & Cognitive Restraint Architecture (`Run-in column`)**: Replaces 3 icon-in-square cards with editorial run-in claims + 3-stage operational pipeline (`场前 Compiler` / `场中 Focus × Inspector` / `场后 Reflection & Memory`).
  3. **Scenario Showcase (`Output index, live sheet`, `data-testid="scenario-matrix"`)**: Primary `CueX Presentation` (`Available`) specification card (`scenario-card-presentation`) + non-wrapping `Planned · 路线图规划中` roadmap rows (`scenario-card-{social,teaching,sales,custom}` with disabled `scenario-disabled-*` buttons).
  4. **Pricing & Commercial Boundaries**: Honest 4-tier ledger (`Free ¥0`, `Event ¥29 / 单场 14 天`, `Pro ¥59 / 月 · ¥499 / 年`, `Team ¥199 · Planned`) flagged `isCommercialHypothesis` with direct jump to `AccountPanel`.
  5. **Trust, Privacy, Runtime Health & FAQ**: Explicit disclosure of microphone opt-in, zero disk audio storage, truthful token metering, and live runtime/account readout (`home-auth-strip`).
  6. **Inverted Closure Band (`The idea again, inverted`)**: High-contrast `#111318` ground with `/brand/cuex-wordmark-light.svg` & `#F8F7F3` display CTA.

### 3.2 `CompilerView.tsx` — Pre-Session Context Compiler *(Phase 3 Part 2)*
- Upload/extract (`.pptx`, `.pdf`, `.md`, `.txt`), sample deck loader, interactive **A. CueSheet**, **B. FactWhitelist** (confirm/lock/edit/delete), **C. AI Predicted Q&A Cards**, **D. Chapter Structure**, explicit mic privacy consent, Rehearsal/Live launch.
- Key contracts: `file-upload-input`, `file-validation-error`, `extract-result`, `load-sample-pack-btn`, `compiled-pack-panel`, `tab-{facts,qa,...}`, `fact-whitelist`, `fact-provenance-*`, `new-fact-input`, `add-fact-btn`, `fact-item-*`, `fact-{edit,delete}-*`, `qa-cards-panel`, `privacy-consent-checkbox`, `launch-{rehearsal,live}-btn`.

### 3.3 `StageView.tsx` — Live Focus / Split-Strip / Inspector *(Phase 3 Part 2)*
- Dual view (`focus` vs `inspector`) + `split_strip` presenter rail + real mic AudioWorklet (`AudioCapture`), Web Speech API (`BrowserSpeechRecognizer`), labeled `text_simulation`, and Phase 3 **7-state Colab GPU ASR (`ColabAsrLifecycleState`)** + **`provider_unreported` / `reasoningTokens` / `correlationId`** telemetry disclosures.
- Key contracts: `stage-workspace`, `focus-view` (`data-layout`), `layout-mode-toggle`, `asr-simulation-banner`, `runtime-degraded-banner`, `focus-cue-stage`, `focus-silent-state`, `focus-l0-quiet`, `focus-active-intervention`, `focus-withdrawn-banner`, `missing-evidence-warning`, `feedback-helpful-btn`, `sim-{speaker-select,speech-input,speech-submit}`, `view-toggle-inspector`, `inspector-view`, `inspector-{usage-source,cost,events}`, `controller-decision-row`, `end-session-btn`, `wipe-session-btn`, `session-wiped-notice`.

### 3.4 `ReflectionView.tsx` — Post-Session Utility & Weak-Segment Rehearsal *(Phase 3 Part 2)*
- Balanced top `V = H - λI` utility header, compact diagnostic lists (`遗漏关键点`, `超时章节`, `未准备问答` without stretched `panel-void`), readable `MM:SS` timeline offsets, dynamic-column Opt-in Memory Proposals, and Single-Point Rehearsal launcher.
- Key contracts: `reflection-view`, `utility-score-card`, `utility-formula-note`, `reflection-timeline`, `single-point-rehearsal`, `start-single-rehearsal-btn`.
