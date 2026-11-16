# CueX 自动化评测结果与透明核查报告（Evaluation Results）

> **评测运行命令**：`pnpm --filter @cuex/server eval`（执行脚本 `apps/server/scripts/eval-presentation.ts`，输出自动写入 `.cuex-runtime/eval-latest.json` 与 `.cuex-runtime/eval-latest.md`）  
> **数据完整性声明**：下文第 1–3 节全部为上述实机测试的**逐字观测结果**；第 4 节为基于该运行机制叠加公开云端单价推导的**商业建模桥接说明**，两者严格分离。

---

## 1. 运行环境与模式声明 `[本地实测 Eval]`

| 项 | 实机记录值 |
| :--- | :--- |
| **生成时间 (`generatedAt`)** | `2026-11-15T23:53:22.971Z` |
| **System 1 运行实现** | `local-heuristic-s1 (local_fallback)` |
| **System 2 运行实现** | `local-grounded-synthesizer (local_fallback)` |
| **消费计量来源 (`measurementSource`)** | `local_rule_zero` |
| **官方备注 (`note`)** | `Offline deterministic evaluation used local heuristic & grounded rules (0 LLM tokens consumed).` |

---

## 2. 汇总量化指标（Aggregate Metrics）

| 指标名称 | 实测结果 | 对应产品/控制含义 |
| :--- | :---: | :--- |
| **测试用例通过数 (`passedCases / totalCases`)** | **`6 / 6` (100.0%)** | 覆盖正常陈述、纯停顿抑制、偏题恢复撤回、依据内问答、超纲诚实拒答、数字防伪与切章撤回 |
| **平均单用例延迟 (`avgLatencyMs`)** | **`0.88 ms`** (`P50: 0.66 ms`) | 独立控制器与本地快规则可在亚毫秒级完成门控判定 |
| **P95 用例延迟 (`p95LatencyMs`)** | **`1.66 ms`** | 无长尾阻塞，确保极简临场端同步顺滑 |
| **干预精确率 (`precision`)** | **`100.0%` (`1.0`)** | 每次屏幕实际弹出干预均为有真实依据与必要性的有效出手 |
| **误打扰率 (`falseInterventionRate`)** | **`0.0%` (`0.0`)** | 流畅发言与纯 3000ms 停顿场景实现零多余弹出 |
| **自动撤回准确率 (`withdrawalAccuracy`)** | **`100.0%` (`1.0`)** | 命中预期恢复/切章条件时 100% 精准撤回旧提示，防止遗留字卡干扰 |
| **总净效用 (`totalNetUtilityV`)** | **`+3` (`V = H − λI, λ = 2`，探索指标)** | 按打扰惩罚 `2×` 严格扣除后保持正向净帮助（尚待 `第 1 轮 20–30 名 → 第 2 轮扩展至 30–50 人` 实测校准） |
| **实测 LLM Tokens (In / Out / Cached / Total)** | **`0 / 0 / 0 / 0`** | 本次离线评估由确定性控制器及本地规则拦截闭环完成 |
| **模型调用 / 本地规则评估次数 (`modelCalls / localRuleEvaluations`)** | **`0 / 13`** | 全部 13 次评估窗口均由本地规则零 Token 精准决策 |

---

## 3. 逐用例实测明细（Scenario Breakdown）

| 用例 ID | 用例名称 | 结果 | 展示数 | 抑制数 | 撤回匹配 | 延迟 (ms) | 净效用 `V` | 核心验证结论 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `case_1_fluent_quiet` | 流畅正常陈述保持 L0 静默 | **PASS** | 0 | 0 | 0 / 0 | `1.66` | `0` | 全程 `L0` 零打扰，不抢占演讲者视线 |
| `case_2_pause_suppression` | 纯静音停顿无语义缺口抑制触发 | **PASS** | 0 | 1 | 0 / 0 | `0.77` | `0` | 3000ms 纯呼吸停顿命中 `pause_only_without_gap` 被冷静抑制 |
| `case_3_drift_recovery_withdraw` | 话题跑偏触发提示 + 回正后自动撤回 | **PASS** | 1 | 0 | 1 / 1 | `1.44` | `+1` | 触发 1 次 `L1/L2` 收束提示，讲者自救后立即 `user_recovered` 撤回 |
| `case_4_grounded_qa` | 现场提问命中已核验事实白名单 | **PASS** | 1 | 0 | 0 / 0 | `0.41` | `+1` | 精准命中原文依据 `[ev_sample_7]`，推送带溯源 L2 短卡片 |
| `case_5_ungrounded_qa_honesty` | 资料外超纲提问触发诚实缺失声明 | **PASS** | 1 | 0 | 0 / 0 | `0.37` | `+1` | 资料未覆盖时诚实返回 `grounded=false` 与 `missingEvidenceNotice`，绝不编造 |
| `case_6_grounding_guard_and_chapter_withdraw` | 控制器拦截伪造数字 + 切章自动撤回 | **PASS** | 1 | 1 | 1 / 1 | `0.66` | `0` | 成功拦截未核验数字（`99.8% / 300万`），并在切章后以 `chapter_changed` 撤回旧提示 |

---

## 4. 从本地实测向云端商业成本建模的桥接说明 `[Modeled Cloud Cost]`

1. **为什么不直接用“0 Tokens”宣传商业成本？**  
   虽然在预设闭环基准评测下，确定性控制器与本地规则以 `0` LLM Tokens、平均 `0.88ms`（P50 `0.66ms` / P95 `1.66ms`）完成了全套抑制、溯源匹配与撤回验收；但在开放商业线上环境中，真实用户携带异构 PPT、临时发挥与突发观众提问，会同时调用 **云端流式 ASR** 与按需唤醒的 **云端 System 1/2 推理与复盘**。
2. **因此我们在商业与财务核算中采用最诚实的双层透明口径**（详见 `evidence/token-usage-proof.png`、`demo/token-usage-proof.png` 与 `docs/business/UNIT_ECONOMICS.md`）：
   - **已验证事实层（Cat 1）**：`eval-presentation.ts` 6/6 用例 100% 通过、精度 100%、误打扰 0%、撤回 100%、13 次本地规则评估零 Token 平均耗时 `0.88ms`（`local_rule_zero`）。
   - **商业建模层（基准情景：6场/月 × 25分钟，100% 云端 ASR）**：假设每 25 分钟会话消耗 `43,748` 云端建模 Tokens（含 28% System 1 补判 + 7.0 次 System 2 + 1 次赛后复盘）+ 全量云端流式 ASR（`¥0.80/h`）+ WS 基础设施 + 微信/支付宝分渠道（`0.6%` 基准与 `2%` 退款假设）+ `12:1` 算力活跃免费补贴摊销。算出单场纯 LLM `¥0.098`、单场全变动成本 **`¥0.612`**、`Pro（¥59/月，净营收 ¥57.82）` 直接贡献率 **`83.8%`**、`SaaS 毛利率 92.2%`、`Event（¥29/包，净营收 ¥28.42）` 贡献率 **`87.3%`**、单 Pro 月可承受上限 **`85 场`**（未计入公司固定研发人力开销；当前仅完成沙盒契约，无真实收费营收）。
   - **绝不伪造截图**：因 `assets/hks/` 未提供外部云控制台付费截图，`token-usage-proof.png` 严格基于真实 CPA/Colab JSON 遥测脱敏渲染（含 `costFen: 0` 原样披露）并叠加公开云费率模型，绝不虚构账单。

---

## 5. Phase 3 实机 Colab GPU ASR + CPA LLM + 14/14 E2E 遥测锁定（6 类严格分账）

| 评测类别 | 来源文件 | 实测结论摘要（`silentValidationOnly: true`） |
| :--- | :--- | :--- |
| **Cat 1. 离线确定性单元与 Eval** | `.cuex-runtime/eval-latest.json` (`2026-11-15T23:53:22.971Z`) | `6/6` 通过，平均 `0.88 ms` / P50 `0.66 ms` / P95 `1.66 ms`，`13` 次本地规则 `0` Token，探索 `V = +3`；服务端单测 `34/34`、Web 单测 `10/10`。 |
| **Cat 2. Provider 契约与故障注入** | `mandatory/ai-employee-demo/evidence/cpa-llm-report.json` (`mockContractMatrix`, `isolatedFromLiveTelemetry: true`) | `6/6` 隔离契约全部通过（`401/403` 脱敏、`429` 重试、`503` 4 次熔断回退 `local_rule_zero`、非法 JSON、`stale_context_version`、`provider_unreported`）。 |
| **Cat 3. 实机 CPA LLM 基准** | `cpa-llm-report.v2` (`2026-11-15T23:29:37.171Z`) | `18/18` 正向调用通过（+3 负向防错）；S1 横评 `gemini-4-hydrogen` (`low`) **`6/6 (100%)`** vs `gemini-3.5-flash-lite` `4/6`；`12` 步标准管线实测 **`15,399` Tokens**（`5,904 in / 9,495 out / 7,126 reasoning`，`costFen: 0`）。 |
| **Cat 4. Colab GPU ASR + Gateway E2E** | `colab-asr-report.json` + `real-e2e-validation.v2` (`2026-11-15T23:27:42.641Z`) | RTX PRO 6000 `SenseVoiceSmall` `14/14` 片段（`225.344 s` TTS+DSP 可控语料，`notLiveHumanRoomRecording: true`）批处理平均 **`52.57 ms`**（P95 `89.59 ms` / RTF `0.00327` / 均值 CER `0.0867` / `clip_04` CER `0.0`），WSS 首包 `772.1 ms`；全链路 **14/14 Section 5.2** 全过（`clip_14` `4,351` Tokens、`80 ms` CPA 超时降级、`400/201/200/200` 主权链路）。 |
| **Cat 5. 浏览器 E2E 与视觉 A11y** | `apps/web/test/presentation-e2e.test.mjs` + `docs/design/FRONTEND_QA_REPORT.md` | Chromium `--mute-audio` E2E `1/1` (`5,105.30 ms`)；6 视口 `42/42` 页面零溢出、零 `<11px` 节点、`9/9` ARIA & reduced-motion 通过。 |
| **Cat 6. 真人现场多麦长程评测** | `docs/business/CUSTOMER_VALIDATION.md` | **Planned / Not Yet Conducted**（尚无线下多麦真人实时演讲、商业收入或 Round 1/2 观测校准数据）。 |

- **敏感性 `#12` 实测对照校准**：按实机 `gemini-4-hydrogen` 特征外推为 25 分钟会话 **`46,357` Tokens** 且从严全按 S2 推理费率（`¥2.90/¥8.70 per 1M`）计算，单场 LLM 由 `¥0.098` 升至 `¥0.259`、全变动成本由 `¥0.612` 升至 `¥0.772`，Pro 直接贡献率仍达 **`80.2%`**（Event `84.6%`，月承受上限 **`66 场`**）。
