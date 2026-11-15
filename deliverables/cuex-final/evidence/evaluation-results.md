# CueX 自动化评测结果与透明核查报告（Evaluation Results）

> **评测运行命令**：`pnpm --filter @cuex/server eval`（执行脚本 `apps/server/scripts/eval-presentation.ts`，输出自动写入 `.cuex-runtime/eval-latest.json` 与 `.cuex-runtime/eval-latest.md`）  
> **数据完整性声明**：下文第 1–3 节全部为上述实机测试的**逐字观测结果**；第 4 节为基于该运行机制叠加公开云端单价推导的**商业建模桥接说明**，两者严格分离。

---

## 1. 运行环境与模式声明 `[本地实测 Eval]`

| 项 | 实机记录值 |
| :--- | :--- |
| **生成时间 (`generatedAt`)** | `2026-11-15T18:26:03.257Z` |
| **System 1 运行实现** | `local-heuristic-s1 (local_fallback)` |
| **System 2 运行实现** | `local-grounded-synthesizer (local_fallback)` |
| **消费计量来源 (`measurementSource`)** | `local_rule_zero` |
| **官方备注 (`note`)** | `Offline deterministic evaluation used local heuristic & grounded rules (0 LLM tokens consumed).` |

---

## 2. 汇总量化指标（Aggregate Metrics）

| 指标名称 | 实测结果 | 对应产品/控制含义 |
| :--- | :---: | :--- |
| **测试用例通过数 (`passedCases / totalCases`)** | **`6 / 6` (100.0%)** | 覆盖正常陈述、纯停顿抑制、偏题恢复撤回、依据内问答、超纲诚实拒答、数字防伪与切章撤回 |
| **平均单用例延迟 (`avgLatencyMs`)** | **`0.69 ms`** | 独立控制器与本地快规则可在亚毫秒级完成门控判定 |
| **P95 用例延迟 (`p95LatencyMs`)** | **`1.38 ms`** | 无长尾阻塞，确保极简临场端同步顺滑 |
| **干预精确率 (`precision`)** | **`100.0%` (`1.0`)** | 每次屏幕实际弹出干预均为有真实依据与必要性的有效出手 |
| **误打扰率 (`falseInterventionRate`)** | **`0.0%` (`0.0`)** | 流畅发言与纯 3000ms 停顿场景实现零多余弹出 |
| **自动撤回准确率 (`withdrawalAccuracy`)** | **`100.0%` (`1.0`)** | 命中预期恢复/切章条件时 100% 精准撤回旧提示，防止遗留字卡干扰 |
| **总净效用 (`totalNetUtilityV`)** | **`+3` (`V = H − λI, λ = 2`)** | 按打扰惩罚 `2×` 严格扣除后依然保持显著正向净帮助 |
| **实测 LLM Tokens (In / Out / Cached / Total)** | **`0 / 0 / 0 / 0`** | 本次离线评估由确定性控制器及本地规则拦截闭环完成 |
| **模型调用 / 本地规则评估次数 (`modelCalls / localRuleEvaluations`)** | **`0 / 13`** | 全部 13 次评估窗口均由本地规则零 Token 精准决策 |

---

## 3. 逐用例实测明细（Scenario Breakdown）

| 用例 ID | 用例名称 | 结果 | 展示数 | 抑制数 | 撤回匹配 | 延迟 (ms) | 净效用 `V` | 核心验证结论 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `case_1_fluent_quiet` | 流畅正常陈述保持 L0 静默 | **PASS** | 0 | 0 | 0 / 0 | `1.38` | `0` | 全程 `L0` 零打扰，不抢占演讲者视线 |
| `case_2_pause_suppression` | 纯静音停顿无语义缺口抑制触发 | **PASS** | 0 | 1 | 0 / 0 | `0.67` | `0` | 3000ms 纯呼吸停顿命中 `pause_only_without_gap` 被冷静抑制 |
| `case_3_drift_recovery_withdraw` | 话题跑偏触发提示 + 回正后自动撤回 | **PASS** | 1 | 0 | 1 / 1 | `1.03` | `+1` | 触发 1 次 `L1/L2` 收束提示，讲者自救后立即 `user_recovered` 撤回 |
| `case_4_grounded_qa` | 现场提问命中已核验事实白名单 | **PASS** | 1 | 0 | 0 / 0 | `0.35` | `+1` | 精准命中原文依据 `[ev_sample_7]`，推送带溯源 L2 短卡片 |
| `case_5_ungrounded_qa_honesty` | 资料外超纲提问触发诚实缺失声明 | **PASS** | 1 | 0 | 0 / 0 | `0.27` | `+1` | 资料未覆盖时诚实返回 `grounded=false` 与 `missingEvidenceNotice`，绝不编造 |
| `case_6_grounding_guard_and_chapter_withdraw` | 控制器拦截伪造数字 + 切章自动撤回 | **PASS** | 1 | 1 | 1 / 1 | `0.41` | `0` | 成功拦截未核验数字（`99.8% / 300万`），并在切章后以 `chapter_changed` 撤回旧提示 |

---

## 4. 从本地实测向云端商业成本建模的桥接说明 `[Modeled Cloud Cost]`

1. **为什么不直接用“0 Tokens”宣传商业成本？**  
   虽然在预设闭环基准评测下，确定性控制器与本地规则以 `0` LLM Tokens、平均 `0.69ms` 完成了全套抑制、溯源匹配与撤回验收；但在开放商业线上环境中，真实用户携带异构 PPT、临时发挥与突发观众提问，会同时调用 **云端流式 ASR** 与按需唤醒的 **云端 System 1/2 推理与复盘**。
2. **因此我们在商业与财务核算中采用最诚实的双层透明口径**（详见 `evidence/token-usage-proof.png` 与 `docs/business/UNIT_ECONOMICS.md`）：
   - **已验证事实层**：`eval-presentation.ts` 6/6 用例 100% 通过、精度 100%、误打扰 0%、撤回 100%、13 次本地规则评估零 Token 耗时 `0.69ms`。
   - **商业建模层（基准情景：6场/月 × 25分钟，100% 云端 ASR）**：假设每 25 分钟会话消耗 `~43,748` 云端建模 Tokens（含 28% System 1 补判 + 7.7 次 System 2 + 1 次赛后复盘）+ 全量云端流式 ASR（¥0.80/h）+ WS 基础设施 + 0.6% 支付手续费 + 12:1 免费补贴摊销。算出单场纯 LLM `¥0.098`、单场全变动成本 **`¥0.612`**、`Pro（¥59/月）` 直接贡献毛利率 **`84.2%`**、`SaaS 毛利率 92.4%`。
   - **绝不伪造截图**：因 `assets/hks/` 未提供外部云控制台付费截图，`evidence/token-usage-proof.png` 为基于本报告真实数值生成的透明核算证明图。
