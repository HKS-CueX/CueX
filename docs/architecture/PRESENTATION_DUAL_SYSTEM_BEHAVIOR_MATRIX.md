# CueX Presentation 双系统行为策略矩阵（定稿 · Wave 1–4 实证校准版）

> **文档状态**：已完成源码规则与实测对照全量校准。表中各行为条目分别依据 **三路真机 WAV 实测（`dual-system-real-validation.json` `2026-11-16T01:48:32.572Z`）**、**双窗口静音 Playwright E2E（`companion-window-e2e.test.mjs` `#115`）** 及 **确定性单测 / Eval（`CUEX_TEST_OFFLINE=1` `38/38` + `eval 6/6` `#119`）** 如实标注实测依据。

---

## 1. 行为裁决总体原则（已代码与实测锁定）

1. **L0 静默默认态与动态阈值（`FastDecisionAdapter.ts:514-560`）**：`needThreshold = 0.72`（`stay_silent` / `recovery_hold` 黑板指导下收紧至 `0.88`，`prefer_l2/l3` 放宽至 `0.62`；恢复判定 `recoverScore >= 0.68`）。
2. **S1 零阻塞响应，S2 优先抢占与过期取消（`CognitiveRuntime.ts:664-764`, `System2TaskCoordinator.ts:68-173`）**：`manual_help (100) > live_qa (90) > omission (60) > hesitation (58) > drift (55) > pace_overtime (40)`。
3. **证据边界与冷却穿透修正（`InterventionController.ts:415`, `CpaProviderAdapter.ts:1374-1450`）**：`missing_evidence_notice` 在 `openQuestion` 时可穿透普通冷却窗口立即提醒“资料库未覆盖”，且 `insufficient_evidence` 严禁回填弱证据 ID 或数字。

---

## 2. 演讲全周期双系统协同行为矩阵（含实测落数）

| # | 舞台场景 / 话语类型 | System 1（Colab JEV `jev-v1` + 规则）判定 | System 2（CPA `gemini-4-hydrogen · medium` 异步动作） | `InterventionController` 与双端 UI 表现 | 实测对齐依据 |
| :---: | --- | --- | --- | --- | --- |
| **1** | **开场礼貌问候**（`01_intro_natural` WAV 流 / `PRESENTER_GREETING_RE`） | `isPresenterGreetingText()` + JEV-27B 收束为 `fluent / none / L0` | 不唤醒 | 主控 `Focus` 与 `CompanionView` 全程 `shownCount: 0` | **已真机实测 PASS**（`Scenario A`：Colab `:10086`+`:10010`） |
| **2** | **流利正常推进（含快语速）** | 覆盖章回 `keyPoints`，S1 输出 `fluent / on_track -> none`（实测分布 `fluent:none 5`、`on_track:none 2`） | 不唤醒（0 CPA Tokens） | `L0` 静默，更新进度条 | **已真机 + 单测 PASS**（`dual-system-real-validation.json:348-356`） |
| **3** | **修辞性反问**（`RHETORICAL_HOOK_RE`） | 规则层命中 `RHETORICAL_HOOK_RE` 后保持 `presenting / fluent` | 不唤醒 | `L0` 静默（`openQuestion = false`） | **已单测覆盖 PASS**（`dual-system-collaboration.test.ts`） |
| **4** | **纯停顿无语义缺口**（`03_pauses` WAV 流 / `1.6s–3.0s` 换气停顿） | `hesitating` 停顿且无高价值语义缺口或未过控制器门控时保持静默 | 不唤醒 | 命中 `pause_only_without_gap` 抑制（实测 `suppressedCount: 1`） | **已真机 + Eval PASS**（`Scenario C` + `eval case_2`） |
| **5** | **卡壳停顿 + 寻词与未覆盖要点** | S1（JEV-27B）直接探针 `hesitation_gap`：`top: true / probTrue: 0.807122`；网关产出 `hesitating:trigger_l2` 并写 `S1ObservationSnapshot` | 异步调度（`priority: 58`），BM25 检索 verified `Evidence[]` 后产出 2–6 字锚点 `Candidate` | 经 11 道门控与 TTL 重锚展示 `L2` 胶囊，主副双端同步 | **已真机实测 PASS**（`hesitation_gap 376ms` + `Scenario C`） |
| **6** | **核心要点遗漏（`10_omission` WAV 流）** | `omitting_key_point:trigger_l1`，S1 零阻塞先行放行，与异步 S2 完成间隔实测 **`9,113 ms`** | 异步合成拉回提示（`priority: 60`）并发布 `System2Guidance` 写回共享黑板 | 按冷却/黑板与克制原则展示 `L1` 或抑制多余打扰（`omitShownCount: 0`） | **已真机实测 PASS**（`Scenario B`：`9,113 ms` 异构解耦） |
| **7** | **话题显著跑偏（`11_topic_drift` WAV 流）** | `drifting:trigger_l1`（网关分布 4 次） | 异步生成主线拉回提示（`priority: 55`）并更新黑板 `System2Guidance` | 展示 `L1/L2` 拉回提示；双窗口 E2E 验证主副屏同步高亮 | **已真机 + 双窗 E2E PASS**（`Scenario B` + `#115` 断言 3） |
| **8** | **评委/听众提问 — 资料库有据（`09_qa` WAV 流）** | S1 快速标定 `answering_question:trigger_l2`；若撞上 `stay_silent` 黑板指导则第 `612` 行直接 `invalidateGuidance()` 覆盖（实测 `guidanceExpiredOrOverridden: 2`） | 高优先级抢占（`priority: 90`），BM25 命中后输出 `grounded: true, evidenceCount: 1` `Candidate` 与 `qa_grounding` 指导 | 双端高优展示 `L2`/`L3` 卡片并带 `evidenceIds` | **已真机实测 PASS**（`Scenario C` `qaGrounded`） |
| **9** | **评委/听众提问 — 资料库无据（超纲财务估值追问）** | S1 判定 `answering_question` 并高优派发 S2 | `CpaProviderAdapter` 判定 `insufficient_evidence`：严禁回填弱 ID、剥离任何数字（`grounded: false, evidenceIds: []`） | 穿透冷却（`InterventionController.ts:415`）诚实提示：“资料库未覆盖该数据，请坦诚说明暂无已核验记录” | **已真机实测 PASS**（`Scenario C` `qaUngroundedHonesty`，0 编造） |
| **10** | **讲者自愈回正 / 流式中间片已补全** | 实测产生 2 次 `recovering:withdraw_active`（支持 `isFinal: false` 早撤回）并自动撤销过时黑板指导 | `s2Coordinator.cancelStale('user_recovered')` 中止在途旧 S2 推理，累加 `s2CancelledAsStale` | `0ms` 立即撤回提示（原因 **`user_recovered`**），主台与 Companion 同步显示撤回横幅 | **已真机 + 双窗 E2E PASS**（`Scenario B` + `#115` 断言 5） |
| **11** | **演讲章节切换（语音/主动 `chapter.set`）** | `bumpContextVersion()` 立即作废旧版 `System2Guidance` | `cancelStale('chapter_changed')` 取消旧章未落地任务；迟到返回直接丢弃（实测 `s2CancelledAsStale: 2`） | 已展示旧提示立即按 **`chapter_changed`** 撤回；TTL 到期按 **`candidate_expired`** 撤回 | **已真机 + Eval PASS**（`Scenario C` + `eval case_6`） |
| **12** | **讲者连续突发高频输出（S2 在途期间）** | S1 持续独立 `371–784 ms` 节奏产出观测（共 `11` 轮 S1 / `7` 次升级） | `System2TaskCoordinator` 将在途期间并发触发合并入单槽 `pendingInput`（实测 `s2Coalesced: 2`，`7` 次派发实执 `4` 次） | 防止多次慢调用排长队造成滞后错乱提示 | **已真机实测 PASS**（`Scenario C` `dualSystemCollaboration`） |
| **13** | **手动控制（`H` 求助 / `Esc` 忽略 / `M` 静音 / 伴随窗隔离）** | 伴随窗点按 `H` / `Esc` / 反馈即时生效；越权发 `speech.delta`/`audio.chunk`/`session.pause`/`session.end` 拒返 `COMPANION_READ_ONLY`；双 `primary` 拒返 `PRIMARY_MIC_CONFLICT` | 手动求助最高优 **`priority: 100`** 直达 CPA S2；静音态锁定静默；关闭伴随窗后主会话保持 `实时协同中` | `Esc` 触发 `user_dismissed`；伴随窗 `getUserMediaCalls === 0`、禁用控权 | **已真机 + 双窗 E2E PASS**（`Scenario A/C` + `#115` 全部 10 项断言） |
| **14** | **章节严重超时（`actualSec > targetSec + 10s`）** | `PresentationRuntime.onTick` 产出 `pace_overtime` 观测（无需每秒轮询大模型） | 走确定性节奏候选（0 CPA Tokens） | 冷却/静默外轻提示 `L1` 节奏收束 | **已单测覆盖 PASS**（`runtime-controller.test.ts`） |
| **15** | **外部引擎异常 / 超时 / 熔断降级** | Colab `:10010` 异常时 `FallbackFastDecisionProvider` 自动退回 `HeuristicFastDecisionProvider`，写 `degraded: true, providerKind: 'local_rule_zero'` | CPA 异常时退回 `LocalSlowReasoningProvider`（`local_rule_zero`），无数字编造 | `Inspector` 与 `CompanionView` 分系统独立点亮降级告警与原因，绝不伪装在线 | **已合同单测 + 前端 QA PASS**（`dual-system-collaboration` / `cpa-provider` / `FRONTEND_QA_REPORT`） |
| **16** | **散场复盘与双向协同指标结算** | 汇总全部 `S1ObservationSnapshot`、`DualSystemCollaborationMetrics` 与确定性 `V = H - λI` | CPA `reflection`（3 calls，`10,638 ms` avg，`4,845` reasoning tokens）仅生成 140 字总评并严守 `V = 2 - 2*0 = 2`（`withdrawnBeforeDisruptionCount: 3`、`suppressedCount: 1`） | `ReflectionView` 展示覆盖率（`0.133`）、1 个未作答超纲提问详情及三路遥测 | **已真机实测 PASS**（`dual-system-real-validation.json:426-531`） |
