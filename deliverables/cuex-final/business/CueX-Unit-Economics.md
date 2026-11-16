# CueX 单位经济模型（Unit Economics）

> **对应终版 PDF**：`CueX-Unit-Economics.pdf`（1 页 A4 横版）与 `../mandatory/business-model-canvas/CueX-Business-Model-Canvas.pdf` P2，经 `compute-unit-economics.mjs --write` 与 `verify-metrics-sync.mjs` 全量校验并同步 Phase 3 实机遥测（`cpa-llm-report.v2`、`real-e2e-validation.v2`、`colab-asr-report.json`）。  
> **会计铁律**：绝不将“纯 LLM Token 成本”伪装成 SaaS 全部变动成本，绝不把 `local_rule_zero` 的 0 Token 本地运行外推为云端 0 成本；严格区分 **`[本地离线 Eval (Cat 1)]`**、**`[Phase 3 实机遥测 (Cat 3 & Cat 4)]`**、**`[云端公开费率 + 模型估算]`** 与 **`[商业假设]`**。

---

## 一、十项全要素变动成本架构（单场 25 分钟真实演讲 · Base 基准情景）

| 成本序号与类别 | Base 单场金额 | 占单场全成本比例 | 计费归属与工程/公开费率依据 |
| :--- | :---: | :---: | :--- |
| **① 文档解析 (Doc Extract)** | `¥0.020` | `3.3%` | 上传 `.pptx/.pdf/.md` 编译器结构化抽取均摊（可选 CPA LLM 补强按实际调用入账） |
| **② 流式语音识别 (ASR)** | **`¥0.333`** | **`54.4%`** | **全链路第一成本项**；商业定价基准采用 `cloud_streaming_asr` **`¥0.80 / 小时`** `[云端公开费率]` |
| **③ System 1 快决策** | `¥0.008` | `1.3%` | 72% 节奏与恢复由 `local_rule_zero` 零费拦截，仅 28% 触发云端快判 |
| **④ System 2 深度推理** | `¥0.058` | `9.5%` | 约 7.0 次高门槛唤醒，依据白名单生成锚点并计入 `reasoningTokens` 预算 |
| **⑤ 前缀缓存节流 (Cache)** | `-¥0.020` | `-3.3%` | **仅计量单会话内同前缀复用**（40% 命中率）；明确否定跨用户/跨槽共享 KV Cache |
| **⑥ 证据检索 (Retrieval)** | `¥0.012` | `2.0%` | 讲稿白名单与用户审批记忆相关性检索 |
| **⑦ 赛后复盘 (Reflection)** | `¥0.020` | `3.3%` | 遗漏梳理、`V = H − 2I` 汇总与待审批偏好建议 |
| **↳ `LLM Cost / Session` 小计** | **`¥0.098`** | **`16.0%`** | 仅 ①+③+④+⑤+⑥+⑦（Base 建模 `43,748` Tokens） |
| **⑧ 基础设施 (Web/WS/DB)** | `¥0.180` | `29.4%` | 实时 WebSocket 长连接、音频缓冲流转与 SQLite/状态存储摊销 |
| **↳ `Full Var Cost / Session` 合计** | **`¥0.612`** | **`100.0%`** | 单场真实变动成本底座（保守 `¥1.283` / 乐观 `¥0.267`） |
| **⑨ 支付通道费与退款损耗** | `¥0.35 + ¥0.04/月` | 按月/按包计 | 微信支付 `0.60%` / 支付宝 `0.60%`（`2026-11-16` 核验，365天/12月内退款等比退费）；测试 `2%` 退款与 `50%` 沉没算力 |
| **⑩ 免费算力补贴 + 人工支持** | `¥4.87 + ¥0.45/月` | 按付费用户摊派 | `12:1` 算力活跃免费/付费比（分母严格为 `activeFreeUsers`，禁止用注册人数稀释） |

---

## 二、5 + 1 种 ASR 路由与 3 类模型用量归因边界（Phase 3 协议扩展对齐）

1. **多模式 ASR 路由口径（`@cuex/protocol` v2.1.0 `AsrBackendMode`）**：
   - **`cloud_streaming_asr`（商业基准定价默认：`¥0.80/h`）**：用于所有商业单位经济测算（参考市场 range `¥0.45–3.50/h`）。
   - **`colab_gpu`（Phase 3 实机验证通道：`SenseVoiceSmall + fsmn-vad`）**：部署于 Google Colab G4 验证实时流式性能与 7 态生命周期（`not_configured → starting → ready → degraded → disconnected → restarting → unavailable`），**仅作工程实机验证与降级观测基准，不将免费/实验算力冒充商业零成本**。
   - **`remote_sherpa`（`¥0.22/h` 自建估算）** / **`local_sherpa`（`¥0.00` 端侧）** / **`browser_webspeech`（`¥0.00` 浏览器）** / **`text_simulation`（`¥0.00` 离线评测）**：用于套餐配额超限后的零断链降级，且 UI 诚实披露状态。
2. **三类 LLM 用量来源严密区分（`TelemetryUsageSource`）**：
   - **`provider_reported`**：供应商真实返回的输入、输出与 **`reasoningTokens`**（推理模型真实计费不可隐藏）；
   - **`provider_unreported`**：真实外部调用但供应商未回传用量元数据——**绝不虚报为 0 成本**，UI 与账本显式提示“非零消耗”；
   - **`local_rule_zero`**：确定性规则拦截（如 interim 恢复撤回、固定超限检测），真实消耗 `0` Token。

---

## 三、Phase 3 实机遥测对标与敏感性 `#12` 校准（Model vs. Real Measurement）

> 已同步锁定 `@runtime-server` 封版 `colab-asr-report.json`、`cpa-llm-report.json` (`v2`) 与 `real-e2e-validation.json` (`v2`)，及 `@auditor-docs` `docs/phase3/REAL_WORLD_VALIDATION_REPORT.md` 实测口径（`notLiveHumanRoomRecording: true` / `silentValidationOnly: true` / `costFen: 0`）：

| 校准指标 | Phase 2 基准建模 / 离线基线 | Phase 3 实机端到端实测锁定 (`Cat 3 & Cat 4`) |
| :--- | :--- | :--- |
| **流式 ASR 单小时推理速率与 RTF** | 商业模型参考 `¥0.80/h` 云 ASR | Colab RTX PRO 6000 `SenseVoiceSmall` `14/14` 片段批均 **`52.57 ms`**（P95 **`89.59 ms`** / RTF **`0.00327`** / `clip_04` **CER `0.0`**），WSS 首包 **`772.1 ms`** |
| **单场模型 Token（含 `reasoningTokens`）** | Base 建模 `43,748` Tokens（`¥0.098`） | CPA `gemini-4-hydrogen` `12` 步主链实测 **`15,399` Tokens**（含 `7,126` 思维链，`costFen: 0`）；按全 `25 分钟` 上限（敏感性 `#12`）外推 **`46,357` Tokens** -> **`¥0.259`** LLM / **`¥0.772`** 全成本 / Pro **`80.2%`** |
| **System 1 规则分流节流比例** | Base 假设 `72%` 本地规则零费拦截 | 离线评估 `13` 次规则 `0.88 ms` (`0` Token)；实机 S1 网关横评 `gemini-4-hydrogen` **`6/6 (100%)`** vs `3.5-flash-lite` `4/6`，`80 ms` 超时无缝退回 `local_rule_zero` |

---

## 四、三情景单元盈利能力、敏感性与公司级边界

| 核心财务与风控指标 | 保守 (Conservative) | 基准 (Base) | 乐观 (Optimistic) | 口径与边界说明 |
| :--- | :---: | :---: | :---: | :--- |
| **Pro（¥59/月）月净营收** `[商业假设]` | `¥56.05` | **`¥57.82`** | `¥58.41` | 分别扣除 `5% / 2% / 1%` 退款假设 |
| **Pro 月度总可变成本（含免费补贴）** | `¥28.82` | **`¥9.37`** | `¥3.26` | 含 `18:1 / 12:1 / 8:1` 免费补贴与分渠道支付费 |
| **Pro 直接贡献与贡献率 (`Direct Contrib`)** | `¥27.23` / **`48.6%`** | **`¥48.45` / `83.8%`** | `¥55.15` / **`94.4%`** | **对外核心盈利健康度指标** |
| **Pro 纯 SaaS 交付毛利率 (`SaaS Gross`)** | `78.8%` | **`92.2%`** | `96.7%` | 仅扣自身交付 COGS（不含免费获客补贴） |
| **Event（¥29/包）贡献率与变动成本** | `62.0%` (`¥10.47`) | **`87.3%`** (`¥3.60`) | `95.6%` (`¥1.27`) | 14 天单场包有效消除订阅抵触 |
| **简算 LTV / CAC / 倍数** `[商业假设]` | `¥136.13 / ¥45` (`3.03x`) | **`¥339.15 / ¥30` (`11.30x`)** | `¥551.51 / ¥18` (`30.64x`) | 受年卡折扣稀释、毕业季自然停用率等 4 项 caveats 约束 |
| **单 Pro 用户月可承受场次上限** | `29 场/月` | **`85 场/月`** | `211 场/月` | 配合 `240 分钟/月` 云 ASR 硬帽与本地降级防击穿 |
| **公司总固定盈亏平衡点 (`companyBreakeven`)** | `UNMODELED` | **`UNMODELED`** | `UNMODELED` | **尚未测算**（未计入固定研发人力、市场费用与基础底座开销） |

- **12 项全敏感性风控关键结论**：① 云端 ASR 单价升至 `¥3.50/h` 是第一风险因子（Pro 贡献率降至 `58.9%`），须设定单价阈值触发本地 Sherpa 兜底；② 活跃免费/付费比恶化至 `25:1` 是第二因子（降至 `74.7%`），须严锁 `Free 2场×10m` 额度；③ 单会话缓存降至 `0%` 仅影响 `-0.5 pct`（仍达 `83.3%`），验证模型不依赖缓存幻觉；④ **新增敏感性 `#12` 实测 CPA `gemini-4-hydrogen` 思维链校准**：按实测 `46,357` Token/场（含推理链）且全按 S2 推理单价计费，单场 LLM `¥0.259`、全变动成本 `¥0.772`，Pro 贡献率仍达 **`80.2%`**（Event **`84.6%`** / 单户安全上限 **`66 场/月`**）。
