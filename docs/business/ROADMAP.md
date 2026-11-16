# CueX 分阶段产品与商业路线图（Roadmap）

> **边界原则**：严格区分 **当前已实现（Implemented）**、**Phase 2 商业底座就绪（Sandbox & Ready for Testing）**、**种子市场验证期（Near-Term Validation）** 与 **远期生态与形态演进（Future Roadmap）**。绝不将规划中特性包装为已上线营收能力。

---

## 阶段总览（2026-11 至 2027-Q4）

| 阶段 | 时间窗口 | 核心目标 | 协议与工程交付状态 | 关键定量 / 定性退出门槛（Exit Gate） |
| :--- | :--- | :--- | :--- | :--- |
| **Stage 0：通用运行时、Presentation MVP 与 Phase 3/4 实机验证封版** | 2026-11 *(已完成)* | 完成早期单领域原型剥离，落地 Universal Runtime、`CueX Presentation`、`EventEnvelope`、持久化契约、`UsageLedger/Entitlement`、Payment Sandbox，并在 Phase 3 打通实机 Colab GPU ASR (`SenseVoiceSmall`) + 统一 CPA 网关 (`gemini-4-hydrogen`) 与极简前端重设计 | `presentation: status='implemented'`<br>`social/teaching/sales/custom: status='roadmap'`<br>`Team Tier: Planned`<br>`Payment: Sandbox / 未开通实单收银` | Typecheck / Build / Protocol+Server+Web 单测 / `eval-presentation.ts` (`0.88 ms` / `6/6`) / **Colab ASR `14/14` + CPA `21` reqs + 14/14 实机 E2E** / 6 视口静默 Playwright / Legacy+Public-Data Check / PDF&Sync 校验全通 |
| **Stage 1：两轮种子实测与商业化灰度** | 2026-12 ~ 2027-Q1 | 验证真实路演/答辩临场价值与 `Free / Event (¥19–39) / Pro (¥59/月)` 付费转化 | **第 1 轮 20–30 名真实目标用户**深度盲测 → **第 2 轮扩展至 30–50 人**；接通真实微信/支付宝商户号及云端 ASR 资源包 | 完成 ≥3 轮/人的真机闭环；核心留存/净推荐及 `Event` 付费意愿达到预设及格线（见 `CUSTOMER_VALIDATION.md`） |
| **Stage 2：多场景 `ScenarioAdapter` 扩展与 Team 版本试点** | 2027-Q2 ~ Q3 | 严格复用核心 Controller、UsageLedger 与 MemoryStore，按商业清晰度激活新适配器 | 依次发布 `CueX Sales` → `CueX Teaching` → `CueX Social` → `CueX Custom SDK` 与 `CueX Team` 内测 | 不重写独立门控与计费台账底座，仅新增场景协议包与提示策略即可驱动端到端会话 |
| **Stage 3：桌面端极简悬浮窗与智能眼镜演进** | 2027-Q4+ | 突破浏览器标签页视觉依赖，向 OS 全局浮窗、可穿戴 HUD 与端侧小模型进化 | Electron/Tauri 低透明窄条浮窗、AR/智能眼镜提示协议、0.5B–3B 端侧 System 1 蒸馏实验 | 实现全屏共享 PPT 时零切屏余光提示；云端依赖进一步下探至端侧轻量优先 |

---

## 阶段零详解：当前真实实现与诚实边界（Stage 0）

### 已实现与已实机验证的能力
1. **Universal Cognitive Runtime（已实现 & Phase 3 实机全链路验证）**：
   - `@cuex/protocol`（`API_VERSION = '2026-11'`、`WS_PROTOCOL_VERSION = '2.0'`、`EventEnvelope`、7 态 `ColabAsrLifecycleState`、`provider_unreported` 账本来源、UTC ISO-8601 时间戳、整数分 `amountFen`、零依赖运行时校验器）。
   - `ContextStore`、`CognitiveEventBus`、`SharedCognitiveStateStore`、独立 `InterventionController`（5 道门控 + 7 类 `WithdrawalReason` 自动撤回）。
   - 多租户会话鉴权、持久化存储接口、`Entitlement` 配额校验、`UsageLedger` 幂等记账、数据导出与合规删除回执、`PaymentProviderAdapter` 沙盒契约。
   - **实机异构推理闭环**：Google Colab G4（`NVIDIA RTX PRO 6000`）托管 `FunAudioLLM/SenseVoiceSmall + fsmn-vad` 加密 TLS/Bearer 流式 ASR（`14/14` 合成测试集均耗时 `52.57 ms`、`0.00327` RTF）；统一 `CpaProviderAdapter` 驱动 `gemini-4-hydrogen`（S1 基准 `6/6`、`14/14` Section 5.2 全场景 E2E 通过）。
2. **`CueX Presentation`（唯一可实际运行场景）**：
   - 场前：`DocumentExtractor`（`.md/.txt/.pptx` 真实抽取 + `.pdf` 尽力提取，`unreadable` 诚实拒收机制）→ `PresentationCompiler` 生成 `PresentationContextPack`（`PresentationCueSheet`、可锁定 `facts`、显式 `isPrediction: true` `qaCards`、`unpreparedGaps`、`progressNodes`、`evidence`）。
   - 场中：`Focus`（余光低打扰 `CueEdgeLight` + 短锚点 + 自动撤回）、`Split-Strip` 与 `Inspector`（控制器仲裁明细、真实 ASR 生命周期与降级披露、Token/规则来源）；支持流式语音、`Dismiss` 驳回、`helpful/distracting` 微反馈。
   - 场后：`PresentationReflection`（计算探索性净效用 `V = H − λI`，默认 `λ = 2`）、弱项单点重练直入、`MemoryStore` 人工逐条审批（`userConfirmed: true`）与彻底擦除。
3. **工程与前端质控自动化**：GitHub Actions CI 工作流、遗留领域扫描、敏感信息扫描、`Warm Paper / Achromatic ledger` 6 视口（`1440–360px`）无声 Playwright + 无障碍终验、SBOM 清单与 PDF/Metrics 双向同步校验。

### 当前明确未实现边界（Honest Limitations）
- **ASR 与真人现场语料边界**：离线规则/文本模拟模式开箱必过；`colab_gpu` 已完成 14 段合成普通话/双语语料（`225.344s`）静音端到端实测，尚未完成多麦克风线下物理会场真人队列采集（留待第 1 轮 `20–30` 名种子期补齐）；云端商用流式 ASR 与独立商用模型按需配额接入。
- **商业收单**：`PaymentProviderAdapter` 处于接口与沙盒校验阶段，**尚未绑定真实微信支付/支付宝签约商户号，零线上真实付费流水**。
- **非演讲场景与团队版**：`Social / Teaching / Sales / Custom` 仅协议注册不可运行；`CueX Team（¥199/席/月）` 属于后期路线图 `Planned`。
- **OCR 边界**：扫描版/加密 PDF 返回 `unreadable` 警告提示补充文本，尚未内置重型 OCR 引擎。

---

## 阶段一详解：两轮种子用户验证与商业落地（Stage 1 — `2026-12 ~ 2027-Q1`）

1. **统一验证队列规模（解决早期口径漂移）**：
   - **第 1 轮种子深访队列（`20–30` 名真实目标用户）**：聚焦高紧迫感 P1（OPC 创始人在路演/融资演示期）与 P2（面临开题/毕业预答辩的研究生），要求每人完整走完至少 **3 轮“材料编译 → 彩排 → 真实演练/实场 → 复盘单点重练”** 闭环（详细筛选标准与 10 个行为访谈提纲见 `CUSTOMER_VALIDATION.md`）。
   - **第 2 轮扩展验证队列（扩充至 `30–50` 人）**：纳入跨院校答辩群体与产品/咨询演讲者，检验冷启动自助编译成功率、默认 `λ = 2` 冷却窗口参数有效性及计费意愿。
2. **商业计费与单位经济校准**：
   - 接入真实签约的微信支付（`pay.weixin.qq.com`）/ 支付宝（`b.alipay.com`）商户生产网关与阿里云/火山流式 ASR 资源包。
   - 按 **`PRICING_AND_PACKAGING.md`** 实施严格配额门槛（`Free` 限月 2 场×10m 云 ASR、`Event` 14 天单包、超限优雅降级到本地 Sherpa / Web Speech / 文本），采集真实 Cloud Billing 对账误差与退款率分布。

---

## 阶段二详解：`ScenarioAdapter` 横向扩展与 Team 试点（Stage 2 — `2027-Q2 ~ Q3`）

在零重写 `InterventionController`、`UsageLedger` 与 `MemoryStore` 的前提下，依商业明确度次序释放：
1. **`CueX Sales`（B2B 顾问式销售与复杂方案汇报）**：`Evidence[]` 映射为“官方报价底线、合规 SLA 参数、禁用过度承诺清单”；增加双说话人（客户异议 vs 方案顾问）状态判断与异议应答微提示。
2. **`CueX Teaching`（课堂讲授与公开课/学术分享）**：将教案大纲编译为知识点图谱，监控板书/讲授节奏并在跨章节提问时推送精准页码/文献出处词卡。
3. **`CueX Social`（高频高压力职场沟通、面试/跨文化对谈）**：无严格逐字稿下的轻上下文挂载（参会人摘要与核心沟通边界），触发极微弱话题过渡与节奏冷却提醒。
4. **`CueX Custom` & `CueX Team`（`¥199/席/月 [Planned]`）**：开放声明式 `ContextPack` 与 `InterventionPolicy` 契约，并与孵化器、高校实验室及企业内训团队试点共享标准口径库与审计面板。

---

## 阶段三详解：桌面端全局浮窗与可穿戴演进（Stage 3 — `2027-Q4+`）

1. **桌面轻量悬浮伴侣（Desktop Translucent Overlay）**：使用 Tauri/Electron 提供紧贴屏幕顶缘/摄像头下方的半透明窄条，使讲者在共享全屏 Keynote/PPT 时仍能以极低视线偏移获取 `L1/L2` 锚点。
2. **智能眼镜 / AR HUD 适配探索**：CueX 的“平时静默 + `2–6` 字短词 + 接回即自动撤回”天生适配微显示光学器件极窄的像素与视场带宽（远胜必须滚动阅读百字长文的方案）。
3. **端侧 System 1 蒸馏探索**：在获得用户明确授权的脱敏微反馈样本（`helpful` / `distracting` / `user_recovered`）基础上，微调端侧 `0.5B–3B` 级别小模型承担毫秒级 `System 1` 快判，将单场云端算力边际再下一个台阶并强化隐私就地处理。
