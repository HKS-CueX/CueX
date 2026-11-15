# CueX 分阶段产品与商业路线图（Roadmap）

> **原则**：严格区分 **当前已实现（Implemented）**、**近期验证期（Near-Term Validation）**、**场景扩展期（Scenario Adapter Roadmap）** 与 **形态与端侧演进（Future Exploration）**，绝不将规划能力包装为已上线功能。

---

## 阶段总览（2026-11 至 2027-Q4）

| 阶段 | 时间窗口 | 核心目标 | 关键交付与协议状态 | 成功验证标准（Gate） |
| :--- | :--- | :--- | :--- | :--- |
| **Stage 0：统一底座与 Presentation MVP** | 2026-11（已完成重构） | 完成早期单领域原型剥离，落地 Universal Cognitive Runtime + `CueX Presentation` 全链路 | `presentation: status='implemented'`<br>`social/teaching/sales/custom: status='roadmap'` | Typecheck / Build / 单元测试 / `eval-presentation.ts` / Playwright E2E 全通 |
| **Stage 1：真实场景种子内测与商业验证** | 2026-12 ~ 2027-Q1 | 验证真实路演/答辩使用价值与 `¥19–39 单场包 / ¥59 月订阅` 付费意愿 | 接入生产级云端 ASR 与低延迟推理网关；落地真实账号、计费与隐私清理 | 20–50 名高频种子用户；单场中断打扰率（I）可控；首月付费转化率验证 |
| **Stage 2：多场景 Adapter 扩展** | 2027-Q2 ~ Q3 | 基于同一套 Universal Runtime 激活规划中的行业/场景适配器 | 依次上线 `CueX Sales` -> `CueX Teaching` -> `CueX Social` -> `CueX Custom SDK` | 无需重写 Controller 与状态机，仅通过新 Scenario Policy 与 ContextPack 上线新场景 |
| **Stage 3：桌面悬浮伴侣与端侧/眼镜演进** | 2027-Q4+ | 突破浏览器标签页限制，向原生低干扰形态与端侧快决策进化 | 桌面常驻轻悬浮窗（macOS/Windows）、移动端伴侣、智能眼镜 HUD 探索与端侧小模型蒸馏 | 脱离浏览器切屏；超低延迟边缘提示；端侧隐私优先推理闭环 |

---

## 阶段一详解：当前实现边界（Stage 0 — Implemented）

在分支 `refactor/universal-runtime-presentation` 中，CueX 已完成从早期单领域模拟原型向通用架构的彻底重构：

1. **Universal Cognitive Runtime（已实现）**：
   - 事件驱动状态机（`CognitiveEvent`、`SharedCognitiveState` 与单调递增 `contextVersion`）。
   - 快慢双流抽象（`FastDecisionProvider` 与 `SlowReasoningProvider`），支持在线大模型与本地确定性规则兜底（明确区分 `provider_reported` 与 `local_rule_zero` 计量）。
   - 独立 **`InterventionController`**：TTL、版本失活、事实依据（`grounded`）校验、冷却/静默/最高等级上限、用户手动关闭抑制（`dismissed`）、以及 7 类自动撤回原因（含 `user_recovered`）。
   - 用户显式授权的 **`MemoryStore`**（仅 `userConfirmed === true` 才入库，支持查看、修改、单条删除与会话一键擦除）。
2. **`CueX Presentation`（已实现，唯一可实机运行的场景）**：
   - **场前 Context Compiler**：支持 `.md` / `.txt` / `.pptx`（真实 ZIP+XML 解析含备注页）及 best-effort `.pdf` 抽取；编译生成一页导播单（`CueSheet`）、可编辑锁定的事实白名单（`FactWhitelist`）、AI 预测问答卡（显式标记 `isPrediction: true` 与未准备空白项 `unpreparedGaps`）、章节进度结构。
   - **场中 Focus / Inspector 双视角**：演讲者 Focus 视图仅展示余光可读的 L1 微光、L2（2–6 字）短词与 L3 短支架，支持暂停、静音、手动求助、关闭、调节干预上限与 `helpful/distracting` 微反馈；Inspector 视图完整透视实时 ASR 能力状态、System 1/2 判断、Controller 仲裁日志与真实 Token 计量。
   - **场后 Reflection**：绑定时间戳的时间线、遗漏要点/超时章节/未答问题诊断、`V = H - λI` 评分、薄弱片段**单点重练**与可控记忆更新提案。

### 当前明确边界（Honest Limitations）
- **ASR 链路**：浏览器 Web Speech API 与文本仿真输入开箱可用；本地/远端 Sherpa 流式 ASR 需配置对应本地模型或远端服务地址，界面明确标注当前生效模式（不把仿真文本伪装为麦克风转写）。
- **云端计费与支付**：目前尚未接入真实第三方支付网关、多租户鉴权与生产级多节点集群部署。
- **非演讲场景**：`Social`、`Teaching`、`Sales`、`Custom` 在协议与首页中明确标记为 `status: 'roadmap'`，不可启动实机会话。

---

## 阶段二详解：真实市场验证期（Stage 1 — 2026-12 ~ 2027-Q1）

1. **种子用户共创计划（怀柔果壳 OPC 社区 + 高校路演/答辩场景）**：
   - 招募 20–30 位高频路演创业者与硕博答辩同学完成 3 轮以上真实“彩排 + 上台”闭环测试。
   - 采集脱敏且经授权的 `V = H - λI` 反馈与人工撤回满意度，验证默认 `λ = 2` 惩罚系数与冷却时间窗口的最佳值。
2. **生产级流式语音与多模型路由**：
   - 对接国内低延迟流式 ASR（如火山引擎豆包流式 ASR / 阿里云 Fun-ASR，约 ¥0.79–1.00/小时）作为标准云端默认通道，保留端侧 Sherpa ONNX 隐私模式。
   - 对 System 1（极低延迟轻量模型 + 本地规则）与 System 2（带缓存的高准确度推理模型）进行 AB 延迟与成本调优。
3. **商业化漏斗与定价验证**：
   - 上线 `CueX Event`（¥19–39/场单次冲刺包）与 `CueX Pro`（¥59/月、¥499/年）支付灰度测试，验证**单场付费转化率**与**月度续费留存率**。

---

## 阶段三详解：Scenario Adapter 扩展（Stage 2 — 2027-Q2 ~ Q3）

在严格复用 Universal Cognitive Runtime、Controller 与 MemoryStore 的前提下，按商业优先级依次激活适配器：

1. **`CueX Sales`（第一扩展场景 — B2B 顾问式销售与方案沟通）**：
   - 复用事实白名单机制为「报价红线、SLA 承诺与产品参数白名单」，杜绝销售在客户逼问下口头乱承诺。
   - 新增双说话人区分（我方顾问 vs 客户异议）与异议处理（Objection Card）结构。
2. **`CueX Teaching`（第二扩展场景 — 课堂讲授与学术 Workshop）**：
   - 将课程大纲编译为教学知识点图谱，监控讲授覆盖度与时间分配，在学生跨章节提问时从教案/文献中检索带出处短词。
3. **`CueX Social`（第三扩展场景 — 高压即兴交流与面试破冰）**：
   - 无逐字稿上下文编译（仅挂载个人经历摘要/对方公开资料与核心谈话目标），极轻量 L1/L2 话题衔接与倾听信号提醒，配合更严格的隐私擦除与静音策略。
4. **`CueX Custom`（开发者与企业自定义 Adapter SDK）**：
   - 开放声明式 `ContextPack` Schema 与 `InterventionPolicy` 插件钩子，支持企业培训部门或独立开发者自定义行业岗位（如法律咨询助理、客服质检督导等）。

---

## 阶段四详解：形态突破与端侧进化（Stage 3 — 2027-Q4+）

1. **桌面悬浮伴侣（Desktop Translucent Overlay）**：
   - 基于轻量桌面壳（Electron / Tauri）提供紧贴摄像头下方的低透明度“余光窄条”，让演讲者在 Zoom/腾讯会议/腾讯课堂共享 PPT 全屏时无需切出浏览器窗口。
2. **智能眼镜与可穿戴 HUD 探索（Smart Glasses / AR HUD）**：
   - CueX “2–6 字短词 + 主动撤回”天然契合微显示智能眼镜极有限的视场与字数约束（区别于需要大屏阅读的长文助手）。未来探索与轻量单目/双目 HUD 眼镜协议对接，实现真正的线下脱屏路演与展会交流。
3. **端侧快思考小模型蒸馏（Edge Fast-Decision Distillation）**：
   - 在获得用户显式授权脱敏的数据集上，利用真实场景中“哪个信号该沉默、哪个 2–6 字短词真正帮助说话人接回话头（`helpful` 且成功恢复）”的偏好轨迹，微调 0.5B–3B 级本地模型承担 System 1 快速门控，实现近零云端延迟与更高端侧隐私保护。
