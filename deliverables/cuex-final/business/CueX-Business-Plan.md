# CueX 商业计划书文字与八页结构蓝图

> **对应终版 PDF**：`CueX-BP.pdf` / `CueX-Business-Plan.pdf`（**严格 8 页 16:9**，已全量锁定 `.cuex-runtime/eval-latest.json`、`colab-asr-report.json`、`cpa-llm-report.json` v2、`real-e2e-validation.json` v2 与 Phase 3 UI 真实截图）。  
> **唯一统一口径**：**CueX —— 你的快思考外挂（Universal Cognitive Runtime）** × 首个已落地商业楔子 **`CueX Presentation`（演讲与答辩临场引导师）**。  
> **数据标签铁律**：严格区分 `[本地离线 Eval (Cat 1)]`、`[Phase 3 实机遥测 (Cat 3 & Cat 4)]`、`[云端公开费率 + 模型估算]` 与 `[商业假设]`，并严守 6 类评测边界（`notLiveHumanRoomRecording: true` / `silentValidationOnly: true`）。

---

## P1｜品牌与核心定位（Brand & Positioning）

- **主标题**：**CueX — 你的快思考外挂** · **在深度思考之外，接住当下。**
- **符号与视觉系统**：Warm Paper Daylight（`#F8F7F3`）+ Amber × Violet 交汇 `X` 流体丝带（人类当下表达流 × 系统实时理解流仅在最必要交汇点轻触）。
- **核心定义**：
  - **母品牌定位**：面向高认知负荷即时沟通的**通用实时认知运行时（Universal Cognitive Runtime）**。
  - **唯一已完整落地商业切口**：**`CueX Presentation`（演讲与答辩临场引导师）**；`Social / Teaching / Sales / Custom` 属协议注册与未来路线图 `[Planned]`。

---

## P2｜行业痛点与结构性空白（Pain Points & Market Gap）

| 现有工具分类（`2026-11-16` 核验） | 典型代表与客观价格边界 | 舞台 1–3 秒关键断点的真实失效原因 |
| :--- | :--- | :--- |
| **传统声控提词器** | **PromptSmart**（`$9.99/月` 或 `$99.99/年`，无免费云订阅） | 死守固定线性逐字稿，遇评委打断插话、跳页或跨章 Q&A 立即卡死失灵。 |
| **台前演练与语态教练** | **Yoodli AI**（终身限 `5` 次免费，Pro `$11/月` / Adv `$28/月`）；**Poised**（已于 `2026-10-08/09` 停服） | 专注台前模拟或事后语速/口头禅统计，不负责真实上台瞬间的实证托底。 |
| **重型实时答案外挂** | **Cluely**（隐身档 `$149.99/月`）；**Final Round AI**（`$150/月` / 年付 `$300` 预付） | 强制输出大段回答抢走视线与工作记忆、高价且深陷“隐身作弊”合规争议。 |
| **会后语音纪要工具** | **Otter / Read / 通义听悟 / 飞书妙记** | 专注散场后的录音整理与知识沉淀（`After`），不管台上当下那一秒如何接话（`In-the-moment`）。 |

**结构性空白**：公开、合法舞台上，人类不需要替自己讲话的对话框，而需要一位**平时零字静默、断点给 2–6 字真实依据、讲者接回立刻消失**的克制副导。

---

## P3｜首切商业产品：`CueX Presentation`（演讲与答辩临场引导师）

> 实机高清 UI 截图已嵌入 `CueX-BP.pdf` / `CueX-Business-Plan.pdf` 第 3 页，完整 6 视口原图见 [`../assets/previews/`](../assets/previews/)（`ui-compiler-facts-1440.png`、`ui-stage-focus-l2-1440.png`、`ui-stage-inspector-1440.png`、`ui-reflection-1440.png`）。

1. **Pre-Stage 材料白名单编译器**：解析 `.pptx / .pdf / .md / .txt`，抽取出带唯一编号的原文溯源依据（`Evidence[]`）、章节推进节点、禁区口径与预测追问；支持讲者开演前手工锁定不可篡改数字（`locked: true`）。
2. **Stage 双模临场视图（`The printed annual` / `Achromatic ledger` 极简 UI）**：
   - **Focus 视图**：顺畅讲话保持 **`L0` 静默零文字**；遗漏/跑偏/卡壳通过五重门控后亮起 `L1` 边缘琥珀微光或弹出 `L2` 轻量短锚点（≤6–8 字），讲者开口拉回正轨即按 **`user_recovered`** 自动撤回。
   - **Inspector 透明诊断视图**：实时显示当前语音识别真实状态（含 `colab_gpu` 7 状态生命周期 / 降级标注）、CPA 模型调用来源（`provider_reported` / `provider_unreported` / `local_rule_zero`）、TTL 与缺据诚实拒答提醒（`missingEvidenceNotice`）。
3. **Post-Stage 复盘与审批记忆**：输出遗漏断点与探索性净效用 **`V = H − λI (λ=2)`**，支持弱项单点直接跳回彩排，且所有个人记忆须经 **`userConfirmed === true`** 才入库并支持 `/wipe` 一键全擦除。

---

## P4｜技术内核：Universal Cognitive Runtime + 真实 GPU ASR × CPA 闭环

- **独立门控与自动撤回状态机（核心工程壁垒）**：`ContextStore`（单调 `contextVersion`）+ `EventBus` + 独立 **`InterventionController`**（静音检查、版本一致性、TTL 过期、证据绑定、冷却抑制与 7 类 `WithdrawalReason` 自动撤回）。
- **Phase 3 全栈真实推理架构（统一协议 `@cuex/protocol` v2.1.0）**：
  - **Speech Intake**：Colab G4（`NVIDIA RTX PRO 6000`）运行 **`FunAudioLLM/SenseVoiceSmall` + `fsmn-vad`** 通过 TLS+Bearer 认证流式 WSS（`colab_gpu` 7 态状态机 + 自动降级 `local_sherpa` / `browser_webspeech` 绝不静默伪装）。
  - **Unified LLM Gateway**：中央 **`CpaProviderAdapter`** 统一承接 System 1 快决策、System 2 依据检索、Compiler 与 Reflection 增强，完整兼容 `/v1/responses` 与 `/v1/chat/completions`、保留推理预算（`reasoningTokens`）并与确定性 `local_rule_zero` 规则严密隔离。
- **实测数据双轨已锁定（Cat 1 + Cat 3/4）**：
  - `[本地离线 Eval 基线]` (`2026-11-15T23:53:22.971Z`)：`6/6` 通过，平均 **`0.88 ms`** / P50 **`0.66 ms`** / P95 **`1.66 ms`**，`0` 本地 Token，探索 `V = +3`。
  - **`[Phase 3 实机端到端已锁定 · Cat 3 & Cat 4]`**：Colab RTX PRO 6000 (`FunAudioLLM/SenseVoiceSmall + fsmn-vad`) `14/14` 片段（`225.344 s` TTS+DSP 可控语料，`notLiveHumanRoomRecording: true`）批处理平均推理 **`52.57 ms`**（P95 **`89.59 ms`**，RTF **`0.00327`**，均值 CER **`0.0867`**，报价数字 `clip_04` **CER `0.0`**），WSS 首包 **`772.1 ms`**；统一 CPA 网关 **`gemini-4-hydrogen`** (`reasoningEffort: "low"`) S1 **`6/6` (`100%`)**（vs `gemini-3.5-flash-lite` `4/6`），`12` 步主链实测 **`15,399` Tokens**（含 **`7,126` 思维链 Token**，`costFen: 0`）；全链路 **14/14 Section 5.2 场景全过**（含 `clip_14` `4,351` Tokens 与 `400/201/200/200` 主权链路）；对应敏感性 `#12`（`46,357` 校准 Tokens 全按 S2 推理价测算）下 Pro 贡献率仍达 **`80.2%`**（单场全成本 `¥0.772` / 上限 **`66 场/月`**）。

---

## P5｜商业模式与客户增长飞轮（Business Model & GTM `[商业假设]`）

- **优先级客户排序**：**P1** OPC 一人公司主理人/早期路演创始人 → **P2** 高校硕博开题与毕业答辩学生 → **P3** 职业讲师/售前架构师。种子验证队列：`第 1 轮 20–30 名真实目标用户 → 第 2 轮扩展至 30–50 人`。
- **Osterwalder 九要素闭环 × 四档低摩擦定价 `[商业假设 · 沙盒契约已通，未真实收单]`**：
  - **`CueX Free (¥0)`**：每月 `2 场 × 10 分钟` 云端 ASR + 完整 `Inspector` + 本地/浏览器降级。
  - **`CueX Event (¥19–39/场，锚点 ¥29)`**：`14 天` 含 `120 分钟` 云端 ASR，专为一次性毕业答辩/重要路演破冰，消除订阅抗拒。
  - **`CueX Pro (¥59/月 或 ¥499/年)`**：每月含 `240 分钟` 云端 ASR + 长期审批记忆 + 无限材料包编译。
  - **`CueX Team (¥199/席/月 [Planned])`**：组织级共享证据白名单与口风审计（路线图规划）。
- **获客途径**：对比实录 Demo 裂变（“长文 Copilot 翻车 vs CueX 偏航瞬时撤回+缺据诚实拒答”）→ OPC/孵化营种子转化 → 毕业季高频模板包。

---

## P6｜单位经济模型与 10 项全成本透明核算（Unit Economics）

- **绝不把纯 Token 费用伪装成 SaaS 毛利**：完整计入 ①文档解析 + ②云端流式 ASR（第一成本）+ ③System 1 + ④System 2 + ⑤单会话内前缀缓存扣减 + ⑥检索 + ⑦复盘 + ⑧Web/WS/DB 基础设施 + ⑨微信(`0.6%`)/支付宝(`0.6%`)分渠道费率与退款损耗 + ⑩ `12:1` 算力活跃免费补贴与客服支持。
- **三情景核心结果 `[云端公开费率 + 模型估算]` + `[Phase 3 #12 实测成本校准]`**：
  - **Base 单场 25 分钟全可变成本 `¥0.612`**（云端 ASR **`¥0.333 / 54.4%`**；基建 `¥0.180`；纯 LLM **`¥0.098`** 含单会话内缓存 `-¥0.020`，无跨用户缓存假定）。
  - **Pro（锚定 `¥59/月`）**：月净营收 `¥57.82` − 月全成本 `¥9.37` = 直接贡献 **`¥48.45/月`**（**直接贡献率 `83.8%`** [保守 `48.6%` / 乐观 `94.4%`]；纯 SaaS 毛利率 **`92.2%`**；单户月可承受上限 **`85 场/月`** [保守 `29` / 乐观 `211`]；`LTV ¥339.15 / CAC ¥30 = 11.30x` `[商业假设]`）。
  - **Event（锚定 `¥29/场`）**：净营收 `¥28.42` − 变动成本 `¥3.60` → **直接贡献率 `87.3%`**。
  - **公司级总固定盈亏平衡点 `UNMODELED` 与 `#12` 实测校准**：明确披露尚未纳入固定研发薪酬与市场固定投放；同时基于 CPA `gemini-4-hydrogen` 实测分布外推 `46,357` Token 并全按 S2 推理单价计费（敏感性 `#12`），单场 LLM `¥0.259`、全变动 `¥0.772`，Pro 直接贡献率仍稳居 **`80.2%`**（`66 场/月` 安全上限）。

---

## P7｜长期愿景：`X` 的横向延展边界

- **为什么叫 Cue`X`**：`Presentation` 是验证「持续理解 × 最小必要干预 × 事实守门」闭环的第一张多米诺骨牌。
- **同一认知内核的平滑扩展路线 `[Planned]`**：
  - **场景轴（`ScenarioAdapter`）**：`Presentation [已实现]` → `Teaching（课堂教学节奏）` / `Sales（合规方案沟通）` / `Social（高频社交辅佐）` / `Custom（个人定制规则）` `[协议注册/路线图]`；
  - **终端轴**：今日 Web 独立伴侣面板 → 明日桌面低分心悬浮微条 → 未来轻量 **智能眼镜 HUD**，把计算藏在视线边缘。

---

## P8｜团队、真实完成度与 90 天行动计划

- **团队**：记性好了一点 · 聚焦实时认知计算与克制交互工程化交付。
- **赛前积累 vs 赛期 48 小时全新交付透明分界**：
  - *赛前 (`2026-11-01`)*：单领域早期语音原型与基础音频采集/调用探索；
  - *赛期 48 小时重构与 Phase 3 演进*：彻底剥离旧领域 → `@cuex/protocol` v2.1.0 → `Universal Cognitive Runtime` + 五重门控/7 类自动撤回 → 4 格式白名单编译 → 实机 **Colab G4 GPU ASR (`SenseVoiceSmall`) + 统一 `CpaProviderAdapter` (`gemini-4-hydrogen`) 全链路打通** → `The printed annual / Achromatic ledger` 极简前端重构 → 完整 10 项全成本与必备交付体系。
- **未来 90 天核心验证门禁**：完成 `第 1 轮 20–30 名 → 第 2 轮 30–50 人` 种子用户 3 轮以上实机演练闭环，校准干预阈值与真实付费留存，再开通正式商户收单。
