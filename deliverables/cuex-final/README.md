# CueX — 统一最终商业与演示交付包（CueX Final Deliverables）

> **团队名称**：记性好了一点  
> **赛道**：怀客松 2026（HKS 2026）· OPC 模式创新赛道  
> **代码分支**：`refactor/universal-runtime-presentation`  
> **唯一统一口径**：本文档集严格对齐重构后代码库（**CueX 通用实时认知运行时底座 + 首个商业切口 `CueX Presentation（演讲与答辩临场引导师）`**），彻底废除历史相互冲突的双版本演示材料与早期单领域残余内容。

---

## 1. 交付目录结构索引

| 路径 | 文档/资产名称 | 格式与页数标准 | 核心内容与用途 |
| :--- | :--- | :--- | :--- |
| `brand/CueX-Brand-Guide.md` | **统一品牌与视觉规范** | Markdown | 暖纸浅色基调（`#F8F7F3`）、Amber × Violet 交汇 `X` 规范、排版字体与反杂乱准则 |
| `brand/CueX-Cover.png` | **品牌主视觉封面** | `1920×1080` PNG | 官网提交主封面图，匹配 `assets/banners/cuex-rollup-20261115-v4/preview.png` 视觉语言 |
| `pitch/CueX-BP.pdf` | **核心商业计划书（Pitch 版）** | **严格 8 页** (16:9) | P1 品牌定位 → P2 痛点 → P3 Presentation → P4 通用运行时 → P5 商业模式 → P6 单位经济 → P7 愿景 X → P8 团队与计划 |
| `business/CueX-Business-Plan.pdf` | **核心商业计划书（归档版）** | **严格 8 页** (16:9) | 与 `pitch/CueX-BP.pdf` 完全同源一致 |
| `business/CueX-AI-Employee-Job-Spec.pdf` | **AI 员工工作说明书** | **严格 1 页 A4** | 标题《演讲与答辩临场引导师》，完整覆盖「岗位职责 / 输入要求 / 交付成果 / 人工介入 / 验收标准」五大模块 |
| `business/CueX-Business-Model-Canvas.pdf` | **八要素商业画布** | **严格 1 页 A4 横版** | 完整串联目标客户、痛点、价值主张、交付、定价假设、10 项全成本、渠道与壁垒 |
| `business/CueX-Unit-Economics.pdf` | **单位经济模型一页纸** | **严格 1 页 A4 横版** | 推翻旧版 95.9% 纯 Token 虚高口径，展示 10 项全成本拆解（含 5 种 ASR 与分渠道支付/退款）、三情景与 11 项敏感性结论 |
| `business/CueX-BMC-and-Unit-Economics.pdf` | **商业画布与单位经济合订本** | **严格 2 页 A4 横版** | P1 = 八要素商业画布，P2 = 单位经济账本（同步满足赛道单合订件与分拆件提交口径） |
| `pitch/CueX-Website-Copy.md` | **官网提交文本** | Markdown | 可直接粘贴的赛事报名、简介、架构与透明边界字段 |
| `pitch/CueX-Pitch-Script.md` | **5 分钟路演逐字稿** | Markdown | 精确匹配 8 段 05:00 计时轴 + 2 分钟评委高压 Q&A 备答 |
| `pitch/CueX-Demo-Script.md` | **75–90 秒实机演示脚本** | Markdown | 严格对应 `apps/web` 当前已实现界面与真实交互流（零虚构功能） |
| `evidence/token-usage-proof.png` | **真实评测与成本透明图** | `1600×960` PNG | 基于 `eval-presentation.ts` 实测数据与公开云端费率建模，明确标注 `[本地实测 Eval + 云端建模]` |
| `evidence/evaluation-results.md` | **自动化评测证据报告** | Markdown | 记录完整运行命令、真实指标、自动撤回与探索性 `V = H − λI` 核对数据 |
| `evidence/verification.json` | **封版自动检验清单** | JSON | 核验所有生成件存在性、严格页数校验与数据状态标签 |
| `previews/` | **全量高分渲染预览图** | PNG | 包含 `bp-p1..p8.png`、`job-spec-p1.png`、`bmc-p1.png`、`unit-economics-p1.png` 与 `cover.png` |

---

## 2. 核心关联战略文档（`docs/business/`）

- [`docs/business/BUSINESS_MODEL.md`](../../docs/business/BUSINESS_MODEL.md)：首切定位、P1–P3 目标客群、八要素画布与分层定价假设。
- [`docs/business/UNIT_ECONOMICS.md`](../../docs/business/UNIT_ECONOMICS.md)：10 项全成本核算体系、5 种 ASR 模式、微信/支付宝分渠道与退款规则及 11 项敏感性检验。
- [`docs/business/COMPETITIVE_ANALYSIS.md`](../../docs/business/COMPETITIVE_ANALYSIS.md)：经 `2026-11-16` 联网核查的 7 大外部竞品事实对比（PromptSmart、Poised、Yoodli、Final Round AI、Cluely、Otter/Read、PowerPoint Coach/Gamma/Pitch、通义听悟/飞书妙记）。
- [`docs/business/CUSTOMER_VALIDATION.md`](../../docs/business/CUSTOMER_VALIDATION.md) / [`GTM_PLAN.md`](../../docs/business/GTM_PLAN.md) / [`PRICING_AND_PACKAGING.md`](../../docs/business/PRICING_AND_PACKAGING.md)：`第 1 轮 20–30 名 → 第 2 轮扩展至 30–50 人` 种子验证体系、12 阶段转化漏斗与配额降级边界。
- [`docs/business/ROADMAP.md`](../../docs/business/ROADMAP.md)：按阶段推进的诚实工程与商业化演进路线图。
