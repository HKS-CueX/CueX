# CueX 统一品牌与视觉规范（Brand & Visual Guide）

> **统一原则**：彻底淘汰早期原型期残余的冷灰绿视觉风格（`#ECEDE7`）与互搏的双版本视觉体系，将官方易拉宝海报（`assets/banners/cuex-rollup-20261115-v4/preview.png`）、`assets/brand/` 矢量资产、Web 临场产品界面、8 页商业计划书（`CueX-BP.pdf`）与商业画布文档统一至同一视觉语言。

---

## 1. 品牌内核与标准口号

- **品牌标识**：**CueX**（`Cue` = 适时提示；`X` = 任意真实交互场景变量）
- **核心定位**：**CueX — Universal Cognitive Runtime（你的快思考外挂）**
- **主标语（Hero Tagline）**：**「在深度思考之外，接住当下。」**（*Catch the moment beyond deep thinking.*）
- **副标语 / 机制阐释**：**「X，代表任意场景。持续理解 · 适时提示」**
- **首切商业场景名**：**`CueX Presentation`（演讲与答辩临场引导师）**
- **参赛团队名**：**记性好了一点**

---

## 2. 色彩系统（Warm Paper Daylight + Amber × Violet Crossed `X`）

拒绝一切廉价的“AI 黑底霓虹紫/毛玻璃发光卡片”套路，以**温润纸感浅色底（Warm Paper Daylight）**降低高专注临场场景的视觉刺激，仅用 **琥珀橙（Amber）** 与 **紫罗兰（Violet）** 双色流线代表“人类当下表达流 × 系统实时理解流”的交汇。

| 角色 Role | 名称 | Hex 色值 | 使用规范与场景 |
| :--- | :--- | :--- | :--- |
| **主背景地面（Warm Light Ground）** | `Warm Paper` | `#F8F7F3` | 所有封面、PPT 页面、印刷一页纸、Web 默认背景与海报主底色；绝对禁止冷灰绿 `#ECEDE7` 或纯黑夜店霓虹风。 |
| **卡片/次级底面（Surface Tint）** | `Soft Cream` | `#FFFFFF` / `#F2EFE7` | 信息卡面、表格表头底色、代码块与图注容器。 |
| **主墨色（Primary Ink）** | `Charcoal Ink` | `#111318` | 一级大标题、正文字号、核心指标数字；保证高对比可读性（WCAG AAA）。 |
| **次级文字（Muted Ink）** | `Slate Ink` | `#555863` / `#6F727D` | 副标题、说明标注、页眉页脚、边界声明。 |
| **细线边框（Hairline Border）** | `Paper Hairline` | `#D9D6CE` | 1px 网格线、分割线、表格边线与徽章描边（保持克制，不堆阴影）。 |
| **信号主色 A（Amber 流线）** | `Cue Amber` | `#E87A24` / `#FF7A2F` | 代表“人的表达流 / 临场节奏锚点 / `L1` 轻提示与重点高亮”；`#FF7A2F` 用于矢量光带、封面交汇粒子与图表主线。 |
| **信号主色 B（Violet 流线）** | `Runtime Violet` | `#7C3AED` / `#8E8CFF` | 代表“Universal Runtime 后台理解流 / `System 2` 与 `Evidence` 依据”；`#8E8CFF` 用于矢量渐变与交汇双翼。 |
| **克制功能色（Semantic Signals）** | `Sage Pass` / `Alert Rust` | `#246A4D` / `#C94A2A` | 仅用于评测通过、自动撤回状态或高风险 `L3` 强干预标注；不可大面积铺底。 |

---

## 3. 核心符号：Amber × Violet 交汇 `X`

- **源文件资产**：[`assets/brand/cuex-symbol.svg`](../../../assets/brand/cuex-symbol.svg)、[`assets/brand/cuex-symbol-dimensional.svg`](../../../assets/brand/cuex-symbol-dimensional.svg)、[`assets/brand/cuex-symbol-mono.svg`](../../../assets/brand/cuex-symbol-mono.svg)、[`assets/brand/cuex-wordmark.svg`](../../../assets/brand/cuex-wordmark.svg)
- **几何语义**：两条呈交叉态势的流体丝带构成 `X`——**Amber 丝带（左前上 -> 右下）**象征讲者在当下的真实语流与呼吸节奏；**Violet 丝带（左下 -> 右后上）**象征认知运行时在后台的持续理解与依据对齐；两股流线**仅在最必要的交汇点轻触相接**，呼应 `L0–L3` 最小必要干预与 `X = 演讲 / 社交 / 讲课 / 销售培训` 的横向延展性。
- **排印禁忌**：
  1. 不拉伸、不压扁、不添加外发光（Drop Shadow / Neon Glow）遮蔽边缘细节；
  2. 浅色底（`#F8F7F3`）统一使用高纯度 Amber × Violet 彩色版或 `#111318` 单色版；
  3. 四向辐射场景标注时，保持清晰留白与优雅微弧连线，风格对齐 `assets/banners/cuex-rollup-20261115-v4/preview.png`。

---

## 4. 字体排印规范（Typography）

仓库 [`assets/fonts/`](../../../assets/fonts/) 已内置开源字体文件，确保 Web、Open-Slide 导出与 Playwright PDF 渲染跨平台一致、无缺字：

| 用途 | 首选字体 | 备用回退 | 排版尺度建议（16:9 演示 / A4 文档） |
| :--- | :--- | :--- | :--- |
| **品牌词与英文衬线展示标题** | `Instrument Serif` | Georgia / serif | 封面 `CueX` Wordmark 与重大哲学句（如 `X` 象征宣言） |
| **中文主标题 / 重磅展示汉字** | `Noto Serif SC` / `Noto Sans SC` Bold | PingFang SC / Source Han | P1–P8 幻灯主标题 `38–54px`，字距 `-0.02em` |
| **中文正文与卡片阐释** | `Noto Sans SC` | PingFang SC / sans-serif | 幻灯卡片正文 `15–18px`，行高 `1.45–1.55`；A4 文档 `10–11pt` |
| **数据、协议符号、Token 与公式** | `JetBrains Mono` | SF Mono / monospace | 统一开启 `tabular-nums`，确保表格数字、公式 `V = H - λI` 与时间戳垂直对齐 |

---

## 5. 与产品界面的统一设计原则（克制、可信、零视觉噪点）

1. **克制留白即信号**：无论在 `CueX Presentation` 的 `Focus` 临场视图，还是 BP 幻灯片与 A4 一页纸中，留白率必须维持清晰呼吸感（建议幻灯片有效信息占版面 ≤ 65%），绝不用装饰性小标签、渐变胶囊或伪 3D 仪表盘塞满版面。
2. **证据优先于口号**：所有量化数值一律附带真实来源标识（`[本地实测 Eval]`、`[云端公开费率]`、`[商业假设]`），不模糊混用“已实测数据”与“商业预测”。
3. **跨载体同源一致**：封面 `CueX-Cover.png`、易拉宝海报 `preview.png`、8 页 `CueX-BP.pdf`、A4 单页《AI 员工工作说明书》、两页《商业画布与单位经济》以及 Web 端页面共享同一色板、字体与 `X` 品牌叙事。
