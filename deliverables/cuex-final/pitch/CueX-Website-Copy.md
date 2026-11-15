# CueX 竞赛官网提交文案（Website Submission Copy）

> 所有项目描述严格对齐 `refactor/universal-runtime-presentation` 分支真实实现状态：已端到端实现 **Universal Cognitive Runtime 内核 + `CueX Presentation（演讲与答辩临场引导师）` 第一商业切口**；`Social / Teaching / Sales / Custom` 处于场景协议注册与路线图阶段；商业定价与单位经济均为标注清晰的商业假设与建模测算。

---

## 1. 比赛报名与作品提交字段（可直接复制）

### 1.1 作品名称
**CueX — Universal Cognitive Runtime（你的快思考外挂）**  
*首切场景已落地：`CueX Presentation（演讲与答辩临场引导师）`*

### 1.2 参赛团队信息
- **团队名称**：记性好了一点
- **赛道选择**：OPC 模式创新赛道

### 1.3 一句话简介（≤ 45 字）
**在深度思考之外，接住当下。以“最小必要干预”实时接住演讲与答辩临场的低分心快思考外挂。**

### 1.4 产品痛点与核心方案（200–350 字精简版）
创业者路演、研究生毕业答辩与专业讲者汇报时，往往面临“死背逐字稿僵硬、传统提词器遇即兴问答即失灵、常规 AI 副驾驶不断弹窗塞满长段文字反噬注意力”的三重困境。人类临场真正需要的不是一个替自己背书的聊天框，而是一位懂克制、能兜底的“快思考外挂”。

**CueX** 构建了基于**最小必要干预（Minimum Necessary Intervention）**的通用实时认知运行时：**平时保持 `L0` 静默不打扰；讲者节奏偏离或遗漏关键数据时按风险依次触发 `L1` 边缘轻信号、`L2` 关键词锚点卡或 `L3` 强纠偏提示，并在讲者自行接回话题或语境变更时自动撤回（Auto-Withdraw）**。

本次比赛聚焦首个商业化垂直切口 **`CueX Presentation（演讲与答辩临场引导师）`**，已打通上台前 `.pptx/.pdf/.md/.txt` 多格式讲稿编译（提取带溯源依据的 `Evidence[]` 与章节锚点）-> 台上 **Focus 极简临场视图 / Inspector 实时透明调试视图**（流式语音识别 + 单点可控彩排 + `L0–L3` 分级干预与自动撤回）-> 散场后 **`V = H - λI`（`λ = 2`）量化复盘与人工审批记忆沉淀**全链路。

### 1.5 技术亮点与架构说明
1. **通用认知运行时内核（Universal Cognitive Runtime）**：完全解耦 `ContextStore`（统一上下文状态与单调递增值版本号）、`EventBus`、`SharedCognitiveStateStore` 与独立门控 `InterventionController`（`TTL` 超时清理、打断惩罚门控与 7 类精准自动撤回原因），不将特定行业话术写死在核心引擎中。
2. **双系统协作与事实防幻觉编译**：上台前将讲者原始 `.pptx/.pdf/.md` 提取解析为带原文定位依据的 `Evidence[]`；台上以高敏捷 `System 1` 快判定配合可选 `System 2` 依据检索生成，结合 `numbersIn` 数值一致性与真实依据引用约束，显著降低临场提示“脱离讲稿瞎编”的风险。
3. **可插拔场景适配器契约（Scenario Adapter Contract）**：通过 `@cuex/protocol` 统一定义场景标准接口；目前已完整交付 `presentation` 适配器（支持演讲/路演/学术/答辩场景参数化编译），`social`、`teaching`、`sales`、`custom` 四类场景已完成协议注册与阶段路线图设计。
4. **AI 效用量化与用户主权治理**：在业内少数落地可复现计算公式 **`V = H - λI`**（有效帮助增益减去 `λ=2` 倍打断惩罚），并强制记忆写入经用户人工逐条审批且支持 `/api/sessions/:id/wipe` 一键全擦除。

### 1.6 商业模式与闭环逻辑
- **目标客群梯队**：**P1** OPC 一人公司主理人/创业者（路演、B2B 提案）-> **P2** 高校硕博研究生（毕业/开题答辩、学术会议）-> **P3** 专业讲师/技术布道者/顾问团队。
- **定价假设（尚未形成商业营收）**：
  - `CueX Free`（¥0，严格限额体验包，防范免费云端算力损耗）；
  - `CueX Event`（¥19–39 / 场，单场答辩/路演低摩擦破冰产品）；
  - `CueX Pro`（¥59 / 月 或 ¥499 / 年，高频讲者核心订阅）；
  - `CueX Team`（¥199 / 席位 / 月，*规划中*）。
- **诚实透明的 10 项单位经济模型**：拒绝将纯 LLM token 费用宣传为 SaaS 总成本，完整核算文档解析、流式 ASR、System 1/2 推理、前缀缓存、证据检索、赛后复盘、云基础设施、支付通道（0.6%）及免费用户摊销，基准测算付费订阅与事件单包均具备健康正向直接毛利贡献（详见《单位经济模型》与 BP 第 6 页）。

### 1.7 赛前基础与本次比赛增量透明声明
- 团队于 `2026-11-01` 曾完成一个单领域早期语音对练原型，积累了 16 kHz 浏览器端 AudioWorklet 采集、Sherpa ASR 接口与双系统调用封装骨架。
- **本次比赛期间全新重构与研发交付**：彻底剥离历史窄场景代码，完成 `@cuex/protocol` 通用协议设计、`Universal Cognitive Runtime` 与 `InterventionController` 独立门控引擎、`CueX Presentation` 文档编译器（`.pptx/.pdf/.md/.txt`）、Focus/Inspector 双视图交互前端、`V = H - λI` 量化复盘评估管线以及全新统一品牌和商业资产体系。

---

## 2. 本次最终交付包资产清单（对应 `deliverables/cuex-final/`）

| 序号 | 文件路径 | 核心用途 |
| :---: | :--- | :--- |
| 1 | `deliverables/cuex-final/brand/CueX-Cover.png` | 16:9 官网首页大图与封面视觉（Amber × Violet 交汇 `X`，暖纸底 `#F8F7F3`） |
| 2 | `deliverables/cuex-final/pitch/CueX-BP.pdf` | **8 页完整商业计划书**（与 `business/CueX-Business-Plan.pdf` 内容同源一致） |
| 3 | `deliverables/cuex-final/business/CueX-AI-Employee-Job-Spec.pdf` | **1 页 A4 《演讲与答辩临场引导师 AI 员工工作说明书》**（含 5 大强制模块） |
| 4 | `deliverables/cuex-final/business/CueX-BMC-and-Unit-Economics.pdf` | **2 页 A4 横版**（P1 八要素商业画布 + P2 十项全链路单位经济模型，另附两张单页独立 PDF） |
| 5 | `deliverables/cuex-final/pitch/CueX-Pitch-Script.md` | 5 分钟路演逐字稿（精确对应 P1–P8 时间轴与 2 分钟 Q&A 备答） |
| 6 | `deliverables/cuex-final/pitch/CueX-Demo-Script.md` | 75–90 秒真实产品实机演示脚本（严格匹配实际界面与功能） |
| 7 | `deliverables/cuex-final/evidence/token-usage-proof.png` | 基于真实本地 `eval-presentation.ts` 遥测与云端费率建模的成本透明可视化证明图 |
