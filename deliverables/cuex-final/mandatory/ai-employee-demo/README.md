# CueX AI Employee Demo Package — 演讲与答辩临场引导师实操包

> **交付对应**：怀客松 2026 OPC 模式创新赛道「AI 员工实机演示」强制交付包（对应岗位说明书 [`../ai-employee-job-spec/CueX-AI-Employee-Job-Specification.pdf`](../ai-employee-job-spec/CueX-AI-Employee-Job-Specification.pdf)）。  
> **数据口径声明**：本目录所有指标严格按 6 类评测维度分账，零伪造账单图、零未验证线下真人会议室录音外推（`notLiveHumanRoomRecording: true`），且全流程遵循零外放静音验证（`silentValidationOnly: true`）。

---

## 1. 目录资产索引

| 路径 | 角色说明 | 口径归属 |
| :--- | :--- | :--- |
| [`demo-script.md`](demo-script.md) | **75–90 秒现场/录屏实操分镜脚本**（对齐 `apps/web` Phase 3 真实界面与交互） | 实机操作流程 |
| [`operator-runbook.md`](operator-runbook.md) | **零秘钥脱敏运维手册**（环境准备、离线/实机切换、静音验收与会话擦除） | 工程可复现指引 |
| [`demo-pack/`](demo-pack/README.md) | 路演讲稿大纲、`8` 条 `locked: true` 事实白名单、`4` 张 Q&A 卡（含 `1` 条故意未准备缺口）及 **`14` 条 `16kHz` PCM16 WAV（`225.344 s`）可控声学语料** | 神经网络 TTS + DSP 可控语料 |
| [`evidence/colab-asr-report.json`](evidence/colab-asr-report.json) | Google Colab `NVIDIA RTX PRO 6000` (`SenseVoiceSmall + fsmn-vad`) `14/14` 流式/批处理/`401` 鉴权/断线重连实测 | **Cat 4: Real Colab GPU ASR** |
| [`evidence/cpa-llm-report.json`](evidence/cpa-llm-report.json) | 统一 `CpaProviderAdapter` (`cpa-llm-report.v2`) `gemini-4-hydrogen` `6/6` S1 对标、`12` 步主链 `15,399` Tokens 及 `6/6` Mock 契约测试 | **Cat 2 & Cat 3: Contract + Real CPA LLM** |
| [`evidence/real-e2e-validation.json`](evidence/real-e2e-validation.json) | `CueXGatewayServer` + SQLite + Colab ASR + CPA LLM 全链路 **14/14 Section 5.2 场景验收**（含 `clip_14` 长会话 `4,351` Tokens 与 `400/201/200/200` 主权链路） | **Cat 4: Live Gateway E2E** |
| [`evidence/ui-*.png`](evidence/) | Phase 3 前端重构后在 `--mute-audio` Chromium 下捕获的真实关键态高分截图（Compiler Facts / Stage L2 / Inspector / Degraded / Reflection） | **Cat 5: Browser E2E & Visual QA** |

---

## 2. 核心已锁定事实速查（Phase 3 / Phase 4 Verified）

- **离线确定性门控（Category 1, `.cuex-runtime/eval-latest.json`）**：`6/6` 用例全过、`100%` 精确率、`0%` 误打扰、`100%` 自动撤回率、`13` 次本地规则评估消耗 `0` Token、平均 **`0.88 ms`**（P50 **`0.66 ms`** / P95 **`1.66 ms`**）、净效用 **`V = +3`**（`λ = 2`）。
- **Colab GPU 实时流式 ASR（Category 4）**：`14/14` WAV 片段批处理平均推理 **`52.57 ms`**（P95 **`89.59 ms`**，RTF **`0.00327`**，均值 CER **`0.0867`**，数字定价锚点 `clip_04` CER **`0.0`**），WSS 首包增量 **`772.1 ms`**，强制断线恢复与未授权 `401` 拦截均通过。
- **统一 CPA 双系统与全链路验收（Category 3 & 4）**：`gemini-4-hydrogen`（S1 `reasoningEffort: "low"`）达成 **`6/6`（`100%`）** 准确判别（优于 `gemini-3.5-flash-lite` 的 `4/6`）；全链路 **14/14** Section 5.2 场景全过（含 `13,000 ms` TTL 到期、章节变更撤回、`80 ms` CPA 超时诚实降级 `local_rule_zero` 零幻觉输出）。
- **前端可访问性与容错（Category 5）**：`6` 档视口 `42/42` 页面零水平溢出与零字体裁切；`9/9` ARIA 地标与快捷键通过；`--amber-ink` `#A84B07` 达到 WCAG 2.1 AA（`5.72:1`）。
- **诚实边界（Category 6）**：真实线下多麦克风真人现场长程队列（`Round 1: 20–30人 -> Round 2: 30–50人`）**仍属计划中（Planned / Not Yet Conducted）**；服务端收费目前仅为沙盒 `UsageLedger / Entitlement` 契约，尚未开通微信/支付宝实单交易。
