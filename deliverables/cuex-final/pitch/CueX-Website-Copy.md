# CueX 竞赛官网提交文案（Website Submission Copy）

> **口径声明**：本文案针对怀客松 2026 官网「我的作品」提交字段（见 `docs/hks.md` §7.2 与 OPC 命题手册）对齐 **Phase 3/4 已锁定实机遥测与重构后 Warm Paper UI**：严格区分 `6` 类评测维度，不虚构任何线下真人会议室录音或商业营收。

---

## 一、官网可直接复制提交字段（HKS 2026 Official Submission Fields）

### 1.1 作品名称（≤ 30 字建议）
**CueX — 在深度思考之外，接住当下** *(通用实时认知外挂 · 首切 `CueX Presentation`)*

### 1.2 参赛团队与赛道
- **团队名称**：记性好了一点
- **赛道**：OPC 模式创新赛道

### 1.3 一句话简介（30 字以内，可直接填入）
**在深度思考之外，接住当下。以最小必要干预实时接住演讲答辩的认知外挂。** *(29 汉字，含标点 34 字符；超严控 30 字版：`你的快思考外挂：平时静默不打扰，卡壳偏航时最小干预即刻自动撤回。`)*

### 1.4 项目介绍：解决什么问题、给谁用、怎么做的
- **解决什么问题**：
  创业者路演、硕博答辩与专业汇报时面临三重断层——① **传统提词器**只能线性滚屏，遇评委临时插话追问立即失效；② **常规实时 AI 副驾驶**动辄生成大段文本抢占屏幕视线，并存在无根据编造核心商业/学术数字的幻觉风险；③ **通用会议纪要**仅负责“散场后整理”，救不了台上 1–3 秒的卡壳断点。
- **给谁用（优先级分层 `[商业假设]`）**：
  **P1** OPC 一人公司主理人、早期融资路演创始人；**P2** 高校硕博开题、预答辩及毕业答辩研究生；**P3** 职业讲师、售前解决方案架构师（先通过 `20–30 → 30–50` 种子队列验证闭环）。
- **怎么做的（已完整端到端实现的 `CueX Presentation` 工作流）**：
  1. **台前编译与人工锁事实**：导入 `.pptx / .pdf / .md / .txt` 材料包，提取带原文编号 `Evidence[]`、章节推进图谱与预演 Q&A，支持开演前手工锁定核心数字不可篡改（`locked: true`）。
  2. **台上“L0 静默 + L1–L3 克制触发 + 自动撤回”**：采用极低噪的 `Achromatic ledger` / 暖纸浅色界面；演讲顺畅时 **L0 零字静默**；仅当检测到遗漏要点、卡顿或偏航并经 `InterventionController` 五重门控放行后，推送 `L1` 边缘微光或 `L2` 极短锚点（≤6–8 字）；**一旦讲者开口接回正轨或切换章节，卡片瞬时自动撤回（7 类 `WithdrawalReason`）**。遭遇超出已准备材料边界的追问时，触发 `missingEvidenceNotice` 诚实拒答，严禁瞎编。
  3. **真实推理链路与降级透明**：Phase 3 已打通 Google Colab G4 GPU 实机流式 ASR（`FunAudioLLM/SenseVoiceSmall + fsmn-vad`、`colab_gpu` 7 状态监控与断线回退）及统一 **CPA 模型网关**（`gemini-4-hydrogen` 等推理模型，严格隔离 `provider_reported`、`provider_unreported` 与本地确定性规则 `local_rule_zero`）。
  4. **散场复盘与人类记忆主权**：基于真实日志输出遗漏项与探索性效用指标 **`V = H − λI (λ=2)`**，支持弱项一键单点重练；全部个人习惯记忆须经讲者显式勾选（`userConfirmed === true`）才允许入库，并支持 `/wipe` 一键彻底擦除。

### 1.5 OPC 赛前已有 vs 48 小时新增（诚实增量边界）
- **赛前已有（`2026-11-01` 基础积累）**：曾完成单领域早期语音对练与底层 16 kHz 浏览器 `AudioWorklet` 音频采集、Sherpa ASR 接口调用及初始双进程对话原型验证。
- **本次比赛 48 小时全新重构与新增**：
  1. **彻底重构与多场景契约抽象**：完全清除早期单领域耦合代码，构建 `@cuex/protocol`（现已演进至 v2.1.0，支持 `colab_gpu` 7 态 ASR 与 `provider_unreported` 账本归因），通用化落地 `ContextStore` / `EventBus` / `InterventionController` 独立门控与 7 类自动撤回引擎（`Social / Teaching / Sales / Custom` 完成协议注册并划归路线图）。
  2. **完整交付 `CueX Presentation` 商业闭环**：四格式讲稿编译（`locked: true` 防幻觉）+ 基于 `The printed annual / Achromatic ledger` 设计规范重制的 `Home / Compiler / Stage Focus / Inspector / Reflection / Account / Memory` 全套前端 + `UsageLedger / Entitlement` 商业配额与沙盒账本（`Free ¥0 / Event ¥29 / Pro ¥59·¥499` 假设体系）+ 10 项全可变单位经济测算模型。
  3. **Phase 3 实机 GPU ASR + 统一 CPA 网关端到端验证**：打通带 TLS + Bearer 认证的 Colab GPU 流式 ASR 服务端、14 段普通话/中英双语实测语料集（离线神经音色合成用于无扬声器静音验证）以及统一 **`CpaProviderAdapter`**。

### 1.6 核心实测与透明指标摘要
- **离线确定性基线 `[Cat 1 本地实测 Eval]`**（`2026-11-15T23:53:22.971Z`）：`6/6` 核心测试用例全过，`local_rule_zero` 平均延迟 **`0.88 ms`**（P50 **`0.66 ms`** / P95 **`1.66 ms`**），探索性 `V = H − 2I = +3`。
- **Phase 3 实机全链路验收摘要 `[Cat 3 & Cat 4 实机遥测]`**：Colab RTX PRO 6000 (`SenseVoiceSmall`) `14/14` 片段（`225.344 s` TTS+DSP 可控语料，`notLiveHumanRoomRecording: true`）批处理均耗时 **`52.57 ms`**（P95 **`89.59 ms`** / RTF **`0.00327`** / 均值 CER **`0.0867`** / 数字 `clip_04` **CER `0.0`**），WSS 首包 **`772.1 ms`**；统一 CPA `gemini-4-hydrogen` S1 准确率 **`6/6 (100%)`**（vs `3.5-flash-lite` `4/6`），`12` 步主链实耗 **`15,399` Tokens**（`7,126` 思维链，`costFen: 0`）；全链路 **`14/14` Section 5.2 场景全过**（含 `80 ms` 超时降级与 `400/201/200/200` 主权擦除）；商业侧按实测分布外推 **`46,357` Tokens** 从严校验（敏感性 `#12`）Pro 贡献率仍达 **`80.2%`**。

---

## 二、商业交付件索引（提交附件清单）

| 分类 | 文件路径 | 用途与合规特征 |
| :--- | :--- | :--- |
| **品牌视觉封面** | `deliverables/cuex-final/brand/CueX-Cover.png` | 1920×1080 Warm Paper `#F8F7F3` × Amber/Violet `X` |
| **必备 · 商业画布** | `deliverables/cuex-final/mandatory/business-model-canvas/CueX-Business-Model-Canvas.pdf` | **严格 2 页 A4 横版**：9 要素标准 Osterwalder 画布 + 8 栏位映射表 + `.md/.html` 源文件 |
| **必备 · 岗位说明** | `deliverables/cuex-final/mandatory/ai-employee-job-spec/CueX-AI-Employee-Job-Specification.pdf` | **严格 1 页 A4**：业务语言全覆盖 12 项要素 + `.md/.html` 源文件 |
| **必备 · 实机证据** | `deliverables/cuex-final/mandatory/ai-employee-demo/{demo-pack,evidence}` | Colab GPU ASR + CPA LLM + 实机 E2E 证据链（严格脱敏零密钥） |
| **8 页商业计划** | `deliverables/cuex-final/pitch/CueX-BP.pdf`（同源 `business/CueX-Business-Plan.pdf`） | **严格 8 页 16:9** |
| **单位经济与竞品** | `deliverables/cuex-final/business/{CueX-Unit-Economics,CueX-Competitive-Analysis,CueX-BMC-and-Unit-Economics}.pdf` | 10 项全成本与 `2026-11-16` 联网官方竞品事实核验 |
| **演讲与演示脚本** | `deliverables/cuex-final/pitch/{CueX-Pitch-Script.md,CueX-Demo-Script.md}` | 5 分钟路演逐字稿 + 75–90s 无扬声器干扰演示剧本 |
