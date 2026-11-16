# CueX Next 前端重设计与 QA 终验报告（FRONTEND QA REPORT）

**范围**：`apps/web/src/**`（`HomeView`、`CompilerView`、`StageView`、`ReflectionView`、`Navbar`、`Footer`、`AccountPanel`、`MemoryInspectorPanel`、`CueEdgeLight`、`index.css`、`tailwind.config.js`、`App.tsx`）
**分支**：`refactor/universal-runtime-presentation`
**音频安全规范**：全部浏览器与回归脚本均以 Chromium `--mute-audio` 静默参数执行，零真实麦克风/扬声器外放干扰。

---

## 1. 四套已安装设计技能的来源、版本与不重叠贡献

| 技能名称 | 来源与版本 / 标识 | 本次任务中的非重叠职责与实际产出 |
| --- | --- | --- |
| **`design-taste-frontend`** | `tasteskill v2`（`Leonxlnx/taste-skill`，目录指纹 `844f3cf223d25a29e75f7965d095a093938282df`） | 定义“展示页（`editorial-report` / `The printed annual`）”与“应用工作台（`achromatic-ledger`）”双轨布局边界；执行 `lint.mjs` 反 AI 模板检查，强制 `>= 11px` 字号下限，清除静态卡片阴影、微缩标签、右侧留白黑洞与失衡栅格行。 |
| **`frontend-design`** | `Vipul Gupta`（MIT License，2026 Codex skill） | 守护 Warm Paper Daylight（`#F8F7F3`）暖白纸墨美学与字族配对（`Instrument Serif` + `Noto Serif SC` 展示标题、`Inter` + `Noto Sans SC` 正文、`JetBrains Mono` 指标刻度），保障语义化 `<header>/<nav>/<main>/<footer>` 地标与 WCAG AA 对比度及 `prefers-reduced-motion` 兜底。 |
| **`impeccable`** | `SKILL.md v4.8.0` / 内置 CLI `v0.1.18`（Apache 2.0） | 划分“说服浏览面（Home）”与“高频操作面（Compiler / Stage / Reflection）”密度上限与嵌套层级（`<= 2` 层卡片嵌套）、固定 `rem` 尺度，并通过静态与真实浏览器 URL `detect` 审计定位并清除占位符低对比度、预启动嵌套边框及装饰性 `01 / 02 / 03` 编号标签。 |
| **`emil-design-eng`** | `emilkowalski/skills`（目录指纹 `db7a20dc1d8ad26a0307dcb45ebc79fc372f5c69`） | 实施零 `transition-all` 显式属性过渡与 `cubic-bezier(0.23, 1, 0.32, 1)` `< 250ms` 交互动效；`Space` / `M` / `H` / `Esc` 快捷键保持 `0ms` 即时响应；`@media (hover: hover)` 隔离桌面悬停态、`active:scale-[0.97]` 按压反馈及基于 GPU `opacity/transform` 的可打断提示撤场动画。 |

---

## 2. 核心设计、交互与可访问性改造清单（Before / After / Why）

| Before（重设计前实测问题） | After（终版实现） | Why（设计工程与可用性依据） |
| --- | --- | --- |
| **展示型落地页与三阶段工作台样式混杂**：`HomeView` 与 `Compiler/Stage/Reflection` 混用同款圆角描边大卡片，`Home` 出现 `24` 处 `< 11px` 文本，`Inspector` 出现 `39` 处 `< 11px` 文本。 | 建立双轨视觉架构：`HomeView` 采用暖白纸墨社论网格与分隔排印；`Compiler/Stage/Reflection` 采用单层 `surface` 分区与表格账本；全视图 `< 11px` 文本降至 `0` 处。 | 对齐 `design-taste-frontend` 与 `impeccable` 的“浏览说服面 vs 高频操作面”分离原则，避免阅读疲劳并保证全视口可读性（`>= 11px`）。 |
| **导航栏与按钮对比度及触控缺陷**：`variant="amber"` 按钮白字配 `#E87A24` 对比度仅 `2.90:1`（未达 WCAG AA）；`768px` 平板端双排导航触发裁切；`Navbar` 与 Hero `CueStagePlate` 按钮带慢速背景渐变。 | 新增高对比语义墨色 `--amber-ink: #A84B07`（白字对比度提升至 `5.72:1`）；`Navbar` 收敛为单一 `<nav aria-label="主导航">`；移除慢速背景过渡，`active:scale-[0.97]` 仅在可交互态瞬时反馈。 | 满足 WCAG 2.1 AA（`>= 4.5:1`）可辨识性，杜绝平板断点导航栏裁切，让主导航与演播室控件在高压操作下做到零延迟响应。 |
| **场中 `StageView` 缺少地标与焦点可及性**：4 个 `stage-*` 实测态 `h1` 均为 `null`；提示撤场依赖通用过渡；边缘光 `CueEdgeLight` 在 `Inspector` 模式下也未受限；模拟输入框缺少 `aria-label` 与错误 `role="alert"`。 | `StageView` 闲置门控与演播态统一由单一 `<main>` 包裹并提供唯一 `<h1>`；`CueEdgeLight` 严格限定仅在 `focus` 视角激活；麦克风告警显式声明 `role="alert"`；模拟器输入补全 `aria-label`。 | 保障屏幕阅读器与键盘用户在舞台高压场景下不丢失上下文焦点，同时防止 `Inspector` 开发者视角受到边缘光效干扰。 |
| **移动端与窄副屏横向拥挤**：`ReflectionView` Token/UsageSource `<Badge>` 在 `360–390px` 下换行失衡；`Stage` 章节切换按钮在窄屏堆叠过高；切换路由后偶发停留在前页滚动深度，导致 `390px` `Focus` 截屏失焦。 | Token 徽章拆分为自适应多枚胶囊，章节条改为 `flex sm:flex-wrap overflow-x-auto` 移动端横向轻滑；`App.tsx` 在 `navigate()` 时立即执行 `window.scrollTo({ top: 0, behavior: 'auto' })`；480px Focus 与 520px Split-Strip 副屏均 `0px` 溢出。 | 适配演讲者在讲台副屏（480–520px 分屏窗口）与移动端单手快速查看的需求，消除切页视口错位。 |
| **占位符与诊断日志诚实性不足**：默认灰色 `placeholder`（`#9ca3af`）对比度约 `2.4:1`；`Stage` 原始片段/时间线偶现 `epoch` 时间戳或未归零偏移；旧版英文文案含 `effortless` 等模板词；`Stage` 预启动存在双层描边嵌套卡片。 | `index.css` 显式规定 `input::placeholder, textarea::placeholder { color: var(--ink-3); opacity: 1 }`（对比度 `>= 5.28:1`）；`formatTimelineOffset` 统一格式化为 `00:00` 相对时间；去除 `effortless` 与 `01 / 02 / 03` 编号标签；`StageView` 预启动区移除内层 `border-line`。 | 响应 `impeccable detect` 实时审计发现的所有非预期可访问性与嵌套告警，并确保每条状态文案都忠实反映本地/远端后端真实态。 |
| **表单与抽屉无障碍标注缺失**：`AccountPanel`、`MemoryInspectorPanel`、`CompilerView` 文件上传与必填星号缺乏显式关联，且上传区缺 `focus-within:ring-2`。 | 为 `auth-switch-{name,email,tenant}` 绑定 `htmlFor/id`，为账单与记忆录入控件补齐 `aria-label`，上传标签增加 `focus-within:ring-2`，必填 `*` 使用高对比 `text-amber-ink`。 | 在“零静默失败、零不可聚焦控件”前提下完成 `inputsWithoutName: []` 全量清除。 |
| **动效与 `prefers-reduced-motion` 兼容**：旧版存在无保护过渡与持续脉冲风险。 | 全局仅对 `opacity / transform / color / border-color / box-shadow` 应用 `< 250ms` `cubic-bezier(0.23, 1, 0.32, 1)` 缓动；`@media (prefers-reduced-motion: reduce)` 将动画与过渡时长压降至 `0.001s` 并保持可见态（`opacity: 1`）。 | 遵循 `emil-design-eng` 高频工具直觉响应准则，保护前庭敏感用户并保证静态减动效环境下提示词卡百分百可见。 |

---

## 3. 六视口矩阵（Before vs After）与源码规范对比

覆盖桌面宽屏、笔记本、平板与窄手机共 6 个标准视口：`1440×900`、`1280×800`、`1024×768`、`768×1024`、`390×844`、`360×800`。

### 3.1 自动化浏览器视口与排版测量汇总

| 维度 | Before（重设计前基准：`.cuex-runtime/screenshots/before/audit-metrics.json` + 视觉抽检） | After（终版实测：`capture-after.mjs` + `qa-a11y-resilience.mjs`） |
| --- | --- | --- |
| **视口覆盖检查数** | `47` 项（含 `home`、`compiler-compiled`、`stage-focus-l0`、`stage-focus-active`、`stage-split-strip`、`stage-inspector`、`reflection`、`account-overview`） | `42` 项布局/字体检查（全部 6 视口核心旅程 + 分屏/标签抽检）+ `9` 项地标/无障碍路由检查 |
| **水平溢出（`scrollWidth > clientWidth`）** | JSON `overflowX: false`（`768px` 等处存在视觉层导航裁切与局部堆叠拥挤） | **`0 / 42` 溢出**（`overflows: []`，含 `480×800` Focus 与 `520×900` Split-Strip 副屏均为 `overflow: false`） |
| **顶栏按钮越界裁切（`headerRightClipped`）** | `768px` 平板视觉存在导航挤出与多行换行隐患 | **`0 / 42` 裁切**（`headerClipped: []`） |
| **`< 11px` 文本节点数（`sub11pxTextNodes`）** | `Home`: `24` (`1440/768`) / `23` (`390`)；`Compiler`: `2` / `1`；`Stage Focus/Active/Split`: `3` / `2`；`Stage Inspector`: **`39`** (`1440/768`) / **`38`** (`390`)；`Reflection`: `20` / `19`；`Account Overview`: `21` / `20` | **`0 / 42` 违例**（全视口 `sub11Issues: []`） |
| **页内唯一主标题 `<h1>`** | `stage-focus-l0`、`stage-focus-active`、`stage-split-strip`、`stage-inspector` 全视口 `h1: null` | **`9 / 9` 状态稳定 `h1Count: 1`**（`home`、`compiler_empty/compiled`、`stage_idle/focus/inspector`、`reflection`、`memory/account_drawer`） |
| **坏图 / 运行时错误** | 控制台 `0` / 页面错误 `0` | **`brokenImages: 0`**、**`consoleErrors: 0`**、**`pageErrors: 0`** |

### 3.2 `design-taste-frontend` 源码静态检查（`lint.mjs`）对比

| 检查目标 | Before 基准 | After 终版 |
| --- | --- | --- |
| 落地页 `apps/web/src/views/HomeView.tsx` | `168 FAIL, 142 WARN`（旧整包页面基线） | **`0 FAIL, 0 WARN`**（`No banned patterns in source`） |
| 工作台 8 文件（`--app` 模式：`CompilerView`、`StageView`、`ReflectionView`、`Navbar`、`Footer`、`AccountPanel`、`MemoryInspectorPanel`、`CueEdgeLight`） | `9 FAIL, 135 WARN` | **`0 FAIL, 87 WARN`**（其中 `2` 条为 `CompilerView.tsx` 中 `lucide-react` 图标名 `Unlock` 触发词匹配，其余 `85` 条为工作台有意保留的等宽数字与时间戳/证据 ID `font-mono`） |

---

## 4. WCAG AA 对比度实测清单

| 颜色组合（前景 / 背景） | 应用语义 | 实测对比度 | AA 合规结论（Normal `>= 4.5:1`） |
| --- | --- | --- | --- |
| `#111318` / `#F8F7F3` (`--ink` / `--ground`) | 纸面主文字、标题 | **17.33:1** | PASS |
| `#111318` / `#FFFFFF` (`--ink` / `--surface`) | 卡片与账本正文 | **18.58:1** | PASS |
| `#474B57` / `#F8F7F3` (`--ink-2` / `--ground`) | 次级说明与引导语 | **8.12:1** | PASS |
| `#626774` / `#F8F7F3` (`--ink-3` / `--ground`) | 辅助刻度、Placeholder 提示词 | **5.28:1** | PASS |
| `#626774` / `#FFFFFF` (`--ink-3` / `--surface`) | 卡片内辅助标注、Input Placeholder | **5.66:1** | PASS |
| `#626774` / `#F0EFE9` (`--ink-3` / `--surface-muted`) | 浅灰底区域次要文本 | **4.91:1** | PASS |
| `#A84B07` / `#F8F7F3` (`--amber-ink` / `--ground`) | 琥珀强调文字、必填 `*`、降级提示 | **5.33:1** | PASS |
| `#A84B07` / `#FBF0E6` (`--amber-ink` / `--amber-tint`) | 琥珀胶囊与提示横幅内文字 | **5.09:1** | PASS |
| `#FFFFFF` / `#A84B07` (`variant="amber"` 实心按钮) | 琥珀主动作按钮（从旧 `#E87A24` `2.90:1` 修复） | **5.72:1** | PASS |
| `#7C3AED` / `#F8F7F3` (`--violet` / `--ground`) | System 2 品牌紫点缀 | **5.32:1** | PASS |
| `#5B21B6` / `#F1EBFE` (`--violet-ink` / `--violet-tint`) | System 2 状态胶囊文本 | **7.72:1** | PASS |
| `#FFFFFF` / `#7C3AED` (实心紫晶标签/按钮) | 紫晶反白文本 | **5.70:1** | PASS |
| `#1F6B52` / `#E3F1EC` (`--resolved` / `--resolved-tint`) | 已就绪 / 已确认状态胶囊 | **5.50:1** | PASS |
| `#FFFFFF` / `#1F6B52` (`--resolved` 反白) | 绿底反白标签 | **6.40:1** | PASS |
| `#B83B1D` / `#FCEEE9` (`--danger` / `--danger-tint`) | 告警与阻断提示标签 | **5.04:1** | PASS |

---

## 5. 可访问性、键盘操作、动效降级与异常/边界状态实测

所有测试均在最后一次源码编辑后重新执行（`--mute-audio` 无声浏览器上下文）：

1. **地标、标题与表单可达性（`qa-a11y-resilience.mjs`，9/9 状态全部 PASS）**：
   - `home`、`memory_drawer_empty`、`account_drawer`、`compiler_empty`、`compiler_compiled`、`stage_idle_empty_gate`、`stage_focus_active`、`stage_inspector`、`reflection` 均具备 `hasHeader: true`、`hasNav: true`、`hasMain: true`、`hasFooter: true`、`h1Count: 1`、`inputsWithoutName: []`、`overflow: false`。
2. **键盘与快捷键导航（`qa-a11y-resilience.mjs`，全部 PASS）**：
   - 抽屉/弹窗 `Tab` 焦点可达与 `Esc` 关闭：`true`。
   - Radix `Tabs` 方向键（`ArrowRight`）切换：`true`。
   - `StageView` 演讲快捷键：`M`（静默模式切换 `true`）、`Space`（暂停/继续采样 `true`）、`H`（请求 L2/L3 辅助 `true`）、`Escape`（退让当前提示 `true`）。
3. **`prefers-reduced-motion: reduce` 动效降级（`qa-a11y-resilience.mjs`，PASS）**：
   - 边缘光环计算时长：`haloAnimationDuration: "0.001s"`、`haloTransitionDuration: "0.001s"`。
   - 提示词卡保持可见与不透明：`cardVisible: true`、`cardOpacity: "1"`。
4. **边界与容错状态验证（`qa-a11y-resilience.mjs`，全部 PASS）**：
   - **错误态（`errorAlert`）**：失败提交渲染 `role="alert"` 内联告警横幅（`rendered: true`，提交按钮解除禁用可立即重试）。
   - **加载态转成功态（`loadingThenSuccess`）**：编译请求期间触发按钮呈禁用态（`disabledWhileLoading: true`），返回后成功渲染 `compiled-pack-panel`（`renderedCompiledPack: true`）。
   - **降级态（`degradedAndNarrowFocus`）**：在未配置 Colab ASR 时，Inspector 与顶部态显式展示降级披露面板（`degradedDisclosureRendered: true`），不伪造在线状态。
   - **超长双语文本与窄屏副屏（`480×800` / `520×900`）**：`narrow480` Focus 视口 `scrollWidth === 480`（`overflow: false`）；`narrow520` Split-Strip 视口 `scrollWidth === 520`（`overflow: false`）；超长中英文标题无横向溢出（`longTitleNoOverflow: true`）。
   - **后端断连 / 503 降级（`offline503`）**：首页仍稳定挂载 `<main>`（`hasMain: true`），导航状态如实提示 `navStatus: "后端检测中"` 而非白屏崩溃。
5. **`impeccable detect`（v0.1.18）静态 + 真实浏览器 URL 终检**：
   - **源码静态审计**（`impeccable detect apps/web/src --json`）：`0` 错误、`0` `nested-cards`、`0` `numbered-section-labels`、`0` `placeholder` 问题；仅存 `3` 条已记录于设计规范的自带字体 `overused-font` 提示（`Instrument Serif` ×2、`Inter` ×1）。
   - **真实后端 + Vite 活体页面扫描**（覆盖 `?view=home`、`?view=compiler`、`?view=stage`、`?view=reflection` 于 `1280×800` 与 `390×844`）：`0` `script-error`、`0` `low-contrast`、`0` `nested-cards`、`0` `numbered-section-labels`、`0` `overflow`、`0` `tiny-text`；全量仅保留预计内的 `overused-font`（正文基座 `Inter` + `Noto Sans SC` 90%–98%）及 `390×844` `?view=home` 1 条 `unbalanced-heading` 建议项（`advisory: true`）。

---

## 6. 最终构建、单元测试与端到端回归结果

全部以下命令均于最后一次 `apps/web/src/**` 代码编辑之后执行并通过：

| 检查项 | 命令 | 实测输出 |
| --- | --- | --- |
| TypeScript 类型检查 | `pnpm --filter @cuex/web typecheck` | Exit `0`（`tsc --noEmit` 零报错） |
| Vitest 单元测试 | `pnpm --filter @cuex/web test` | Exit `0`（`2` 个文件 `10 / 10` 用例通过：`web-helpers.test.ts` 7/7、`presentation-reducer.test.ts` 3/3） |
| Vite 生产构建 | `pnpm --filter @cuex/web build` | Exit `0`（`dist/assets/index-fAC-7k0x.js` `460.47 kB` / gzip `137.18 kB`；`dist/assets/index-CQC4VBVK.css` `31.14 kB` / gzip `6.94 kB`） |
| Playwright 离线端到端回归 | `CUEX_TEST_OFFLINE=1 node --test apps/web/test/presentation-e2e.test.mjs` | Exit `0`（`1 / 1` 全流程通过：`Home -> Compiler -> Stage Focus/Split-Strip/Inspector -> Reflection -> Account Isolation/Plans/Export/Wipe`，耗时 `5105.30ms`，0 跳过） |

---

## 7. Phase 4 交付物可用的最新截图清单

以下截图均由最后一次前端源码定稿后在 `.cuex-runtime/screenshots/` 重新渲染生成，可直接供 PPT 与交付报告选用（路径均相对仓库根目录）：

| 场景类别 | 桌面主视角（1440×900） | 移动 / 窄屏视角 |
| --- | --- | --- |
| **首页 Landing** | `.cuex-runtime/screenshots/after/home-1440.png`<br>`.cuex-runtime/screenshots/after/home-1440-full.png` | `.cuex-runtime/screenshots/after/home-390.png` |
| **场前 Compiler（导播/事实/QA）** | `.cuex-runtime/screenshots/after/compiler-cuesheet-1440.png`<br>`.cuex-runtime/screenshots/after/compiler-facts-1440.png`<br>`.cuex-runtime/screenshots/after/compiler-qa-1440.png` | `.cuex-runtime/screenshots/after/compiler-cuesheet-390.png` |
| **场中 Focus（L0 / L2 / Split-Strip）** | `.cuex-runtime/screenshots/after/stage-focus-l0-1440.png`<br>`.cuex-runtime/screenshots/after/stage-focus-l2-1440.png`<br>`.cuex-runtime/screenshots/after/stage-split-strip-1440.png` | `.cuex-runtime/screenshots/after/stage-focus-l0-390.png`<br>`.cuex-runtime/screenshots/qa/narrow-focus-480.png`（480px 副屏）<br>`.cuex-runtime/screenshots/qa/narrow-split-strip-520.png`（520px 分屏条） |
| **场中 Inspector（含降级诚实披露）** | `.cuex-runtime/screenshots/after/stage-inspector-1440.png`<br>`.cuex-runtime/screenshots/qa/degraded-inspector-1440.png` | `.cuex-runtime/screenshots/after/stage-inspector-390.png` |
| **场后 Reflection 与数据治理抽屉** | `.cuex-runtime/screenshots/after/reflection-1440.png`<br>`.cuex-runtime/screenshots/after/memory-drawer-1440.png`<br>`.cuex-runtime/screenshots/after/account-drawer-1440.png` | `.cuex-runtime/screenshots/after/reflection-390.png` |
