# CueX 最终交付套件（Unified Presentation & Commercial Suite）

> **统一定位**：**CueX —— 你的快思考外挂（Universal Cognitive Runtime）** × 首个商业落地场景 **`CueX Presentation（演讲与答辩临场引导师）`**  
> **赛队署名**：记性好了一点 · 怀客松 2026 OPC 模式创新赛道  
> **数据口径铁律**：严格遵循 **6 类独立评测分账**，区分 **`[Cat 1 本地实测 Eval]`**、**`[Cat 2 Provider 契约隔离测试]`**、**`[Cat 3/4 Colab GPU ASR + CPA gemini-4-hydrogen 实机全链路]`**、**`[Cat 5 浏览器静默 QA]`**、**`[云端公开费率 + 模型估算]`** 与 **`[商业假设 / Cat 6 Planned]`**（零真实真人会议室队列、零真实实单收费、零伪造控制台账单）。

---

## 一、强制提交件目录索引（Mandatory Deliverables）

| 路径 | 交付名称 | 页数 / 版式 | 核心内容说明 |
| :--- | :--- | :--- | :--- |
| `mandatory/business-model-canvas/CueX-Business-Model-Canvas.pdf` | **商业模式画布与怀客松 8 要素** | **严格 2 页 A4 横版** | P1：9 宫格规范画布与 10 项全成本速览；P2：证据分层隔离（含 Cat 1 & Phase 3 Cat 3/4 实测锁定）与 Osterwalder → 怀客松 8 要素对照；源文件见 `mandatory/business-model-canvas/source/` |
| `mandatory/ai-employee-job-spec/CueX-AI-Employee-Job-Specification.pdf` | **AI 数字员工岗位说明书** | **严格 1 页 A4 竖版** | `演讲与答辩临场引导师`（12 项强制字段全覆盖，含 `6/6` Eval `0.88ms`、Colab `52.57ms` ASR、`14/14` Section 5.2 及 `/wipe` 主权）；源文件见 `mandatory/ai-employee-job-spec/source/` |
| [`mandatory/ai-employee-demo/README.md`](mandatory/ai-employee-demo/README.md) | **AI 员工实机演示完整包** | 实操脚本 + 脱敏 Runbook + 语料 + 遥测 JSON | 含 `demo-script.md`、`operator-runbook.md`、`demo-pack/`（14 条 `16kHz` WAV 总计 `225.344s` TTS+DSP 可控语料、`notLiveHumanRoomRecording: true`）与 `evidence/` |

---

## 二、商业计划、财务、竞品与演讲实操索引

| 路径 | 交付名称 | 规格 | 核心内容说明 |
| :--- | :--- | :--- | :--- |
| `business/CueX-Business-Plan.pdf` / `pitch/CueX-BP.pdf` | **商业计划书 / 路演 Deck** | **严格 8 页 16:9** | P1 品牌定位 → P2 痛点 → P3 Presentation 实机界面 → P4 通用运行时（Colab + CPA 实测）→ P5 商业模式 → P6 单位经济与 `#12` 校准 → P7 愿景 `X` → P8 诚实进度（同源文字见 [`business/CueX-Business-Plan.md`](business/CueX-Business-Plan.md)） |
| `business/CueX-Unit-Economics.pdf` & [`business/CueX-Unit-Economics.md`](business/CueX-Unit-Economics.md) | **单位经济模型** | **严格 1 页 A4 横版** | 10 项全成本拆解、5+1 种 ASR 路由、微信/支付宝分渠道与退款损耗、三情景及 **12 项敏感性检验**（含 `#12` CPA 思维链从严校准：`46,357` tok -> Pro `80.2%` / `66` 场） |
| `business/CueX-Competitive-Analysis.pdf` / `.html` / [`.md`](business/CueX-Competitive-Analysis.md) | **竞品与壁垒核验报告** | **严格 2 页 A4 横版** | 联网核验 Poised AI（`2026-10-08/09` 停服）、Cluely、PromptSmart、Yoodli、PPT Speaker Coach、Final Round AI、Otter/Read、听悟/妙记、Gamma/Pitch 及 CueX 五重防线 |
| [`business/CueX-Website-Submission-Copy.md`](business/CueX-Website-Submission-Copy.md) | **怀客松官网提交文案** | 结构化填报文案 | 同步对齐 `pitch/CueX-Website-Copy.md` |
| [`business/CueX-Pitch-Script.md`](business/CueX-Pitch-Script.md) | **5 分钟路演逐字稿 & Q&A** | `05:00` 严格分段 | 含已锁定实机指标、商业假设边界与高风险问答防线（同步 `pitch/CueX-Pitch-Script.md`） |
| [`demo/CueX-Demo-Script.md`](demo/CueX-Demo-Script.md) & `demo/token-usage-proof.png` | **75–90s 实机演示 & Token 证明图** | 脚本 + `1600×960` 脱敏凭证图 | 4 幕 Warm Paper UI 实操（`pitch/CueX-Demo-Script.md` 同步）；`token-usage-proof.png`（兼置 `evidence/`）脱敏呈现 `cpa-llm-report.v2`（`cpa:<redacted-host>`, `costFen: 0`）、Colab ASR 与 `#12` 校准 |
| `assets/CueX-Cover.png` & [`assets/previews/`](assets/previews/) | **主封面图 & Phase 3 UI 截图集** | `1920×1080` PNG + 15 张视口截图 | `assets/CueX-Cover.png`（兼置 `brand/` 与 `previews/cover.png`）；15 张 `ui-*.png` 来自 `--mute-audio` 浏览器视觉 QA |
| [`evidence/evaluation-results.md`](evidence/evaluation-results.md) & [`evidence/verification.json`](evidence/verification.json) | **评测核验与同步证明** | JSON / Markdown | 完整 6 类评测对照与自动生成脚本验收清单 |

---

## 三、关联核心架构与商业文档

- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) & [`docs/PRODUCT_TRUTH_TABLE.md`](../../docs/PRODUCT_TRUTH_TABLE.md)：系统全架构入口与能力边界唯一真值表。
- [`docs/phase3/REAL_WORLD_VALIDATION_REPORT.md`](../../docs/phase3/REAL_WORLD_VALIDATION_REPORT.md)：Colab GPU ASR + 统一 CPA 网关 + 14/14 E2E + UI QA 全量技术核验报告。
- [`docs/business/UNIT_ECONOMICS.md`](../../docs/business/UNIT_ECONOMICS.md) & [`docs/business/BUSINESS_MODEL.md`](../../docs/business/BUSINESS_MODEL.md)：10 项全成本数学底座、5+1 ASR 路由、12 项敏感性检验与 8 要素闭环模型。

---

## 四、一键复现与同步校验命令

```bash
# 重新生成全套 metrics、PPT/PDF 商业交付与脱敏凭证图
node scripts/generate-deliverables.mjs

# 校验全仓指标同源一致性、PDF 严格页数及公共安全/旧领域规范
node scripts/verify-metrics-sync.mjs
node scripts/check-legacy-domain.mjs
node scripts/check-public-data.mjs
```
