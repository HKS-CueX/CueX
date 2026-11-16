# CueX Final Visual & Brand Assets Index

本目录集中存放 **CueX（你的快思考外挂）** 经 Phase 3 前端终验并真实截图的视觉资产与品牌规范件。所有产品截图均在最后一次源码定稿后由无声浏览器（Chromium `--mute-audio`）于 `apps/web` 实际渲染采集；模拟注入态与实测态均严格区分标明。

## 1. Brand Marks & Cover (`assets/brand/`)

| 文件 | 用途 | 视觉规范 |
| --- | --- | --- |
| `cuex-symbol-dimensional.svg` | CueX 交叉 `X` 矢量标识 | Amber `#E87A24` × Violet `#7C3AED` 交叉张力与中心聚焦节点 |
| `CueX-Cover.png` | 1920×1080 横版产品封面（同步自 `../../brand/CueX-Cover.png`） | Warm Paper Daylight `#F8F7F3`、WCAG AA `--amber-ink #A84B07`、实时认知 X 运行时图谱与真实 UI 缩略导览 |

> 完整色彩、字体与排版规范见 [`../brand/CueX-Brand-Guide.md`](../brand/CueX-Brand-Guide.md)。

## 2. Curated Product UI Previews (`assets/previews/`)

全部截图均经过 6 视口自动化校验（`1440/1280/1024/768/390/360`，0 溢出、0 顶栏裁切、0 `<11px` 文本）。

### 2.1 对外落地页与移动适配
- `ui-home-1440.png` — 首页落地页（1440×900，Warm Paper 社论排印 + 可交互「One Live Thing」实时分阶干预组件）
- `ui-home-390.png` — 首页落地页移动端（390×844）

### 2.2 场前编译器（Pre-Stage Compiler）
- `ui-compiler-cuesheet-1440.png` — 一页式结构化导播单、材料导入（15 MB `.pptx/.pdf/.md/.txt`）与麦克风显式知情同意门控
- `ui-compiler-facts-1440.png` — 事实白名单（`FactWhitelist` 确认锁定态）与禁止编造红线
- `ui-compiler-qa-1440.png` — AI 预测评审追问（显式标记「非已确认事实」与证据绑定数量）

### 2.3 场中实时协同（Live Stage：Focus / Split-Strip / Inspector）
- `ui-stage-focus-l0-1440.png` — Focus 极简视角 L0 静默理解态（默认不打扰，提示流畅推进与待覆盖要点）
- `ui-stage-focus-l2-1440.png` — Focus 极简视角 L2 关键词胶囊态（2–6 字高可读余光提示 + 可核验事实来源与微反馈按钮）
- `ui-stage-split-strip-1440.png` — Split-Strip 精简伴随条分栏视角（左侧极简提示条 + 右侧输入/仿真控制条）
- `ui-stage-inspector-1440.png` — Inspector 诊断透视视角（如实展示 `ASR`、`System 1/2` 引擎状态、`InterventionController` 仲裁日志、`SharedCognitiveState` 与真实计量口径 `usageSource`）

### 2.4 场后复盘与个人记忆隐私治理
- `ui-reflection-1440.png` — 场后复盘主视图（净有效介入评分 `V = H − λI`、结构化诊断摘要、全流程时间线、单点重练引导）
- `ui-memory-drawer-1440.png` — 个人记忆控制面板（默认 Opt-in 门控：未点击「允许写入」绝不持久化）
- `ui-account-drawer-1440.png` — 账户隔离（Bearer Session Token / `tenantId`）、套餐权益与数据一键导出/销毁控制台

### 2.5 QA 边界态与窄副屏实测（显式标明测试属性）
- `ui-qa-narrow-focus-480.png` — 480×800 讲台窄副屏 Focus 视图（`0px` 横向溢出）
- `ui-qa-narrow-split-strip-520.png` — 520×900 讲台窄副屏 Split-Strip 视图
- `ui-qa-degraded-inspector-1440.png` — **[QA Fault-Injection Simulation]** Playwright 模拟注入 Colab ASR 心跳超时降级时，Inspector 的诚实降级横幅与本地回退披露界面（用于验证前端异常披露逻辑，非生产真实宕机记录）
