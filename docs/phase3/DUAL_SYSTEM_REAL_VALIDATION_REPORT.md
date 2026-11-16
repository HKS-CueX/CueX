# CueX 双系统异步协作、JEV-27B S1 与 Companion 模式真实验证报告（定稿 · Wave 4）

> **权威产物**：[`deliverables/cuex-final/mandatory/ai-employee-demo/evidence/dual-system-real-validation.json`](../../deliverables/cuex-final/mandatory/ai-employee-demo/evidence/dual-system-real-validation.json)（`generatedAt: 2026-11-16T01:48:32.572Z`，由 [`apps/server/scripts/validate-dual-system-real.ts`](../../apps/server/scripts/validate-dual-system-real.ts) 生成）、[`S1_S2_ROUTING_VERIFICATION.md`](./S1_S2_ROUTING_VERIFICATION.md)、[`infra/colab/healthcheck_jev.py`](../../infra/colab/healthcheck_jev.py)（`#108`）及 `apps/web/test/companion-window-e2e.test.mjs`（`#115`）。  
> **安全与诚实四项铁律**：
> 1. **六类评测严格分离**：离线确定性单测、Fault/Mock 契约、Colab JEV-27B S1 真机、Colab GPU ASR 真机、CPA `gemini-4-hydrogen` (`medium`) + 异步协同 & Companion E2E、真实房间人类舞台观测（**尚未开展 / Planned**）严格分栏统计，绝不混池。
> 2. **100% 静音测试**：`strictSilentMode: true`、`audioPlaybackTriggered: false`，所有浏览器 Playwright 测试强制携带 `--mute-audio`，**零本机扬声器外放**。
> 3. **TTS WAV 语料边界透明（`notLiveHumanRoomRecording: true`）**：端到端语音流来自 `demo-pack/audio/` 的离线 macOS 神经语音 + DSP 合成 WAV 语料，属于可复现声学/语义压力基线，**明确区别于真实会议室现场人声麦克风录音**。
> 4. **Companion 能力红线**：Web 版伴随窗基于标准浏览器能力（`Document PiP` -> `window.open` -> `Split Strip`），**绝不宣称“强制系统级置顶覆盖全屏 PowerPoint / Keynote”**。

---

## 1. 严格分离的六类验证总览

| 类别 | 验证目标 | 权威命令 / 证据来源 | 口径与环境 | 终稿实测结论 |
| :---: | --- | --- | --- | --- |
| **1** | **离线确定性单测与 Controller Eval** | `pnpm --filter @cuex/protocol test`<br>`CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test`<br>`pnpm --filter @cuex/web test`<br>`pnpm --filter @cuex/server eval` (`.cuex-runtime/eval-latest.json` `2026-11-16T01:48:42.073Z`) | 纯本地确定性时钟与规则（`local_rule_zero`，`0` LLM Tokens） | Protocol **`14/14` pass**；Server **`38/38` pass**（含 `dual-system-collaboration` 与 `companion-gateway`）；Web Vitest **`12/12` pass**；Offline Eval **`6/6` pass**（`precision: 1`, `falseInterventionRate: 0`, `withdrawalAccuracy: 1`, `avg 0.95 ms / p50 0.67 ms / p95 1.74 ms`, `13` 规则, `V = +3`）。 |
| **2** | **故障隔离、权限拒绝与 Mock 契约** | `CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test` 隔离套件 + 真实网关负例验证（`#108` / `#115` / `#119`） | 可控故障注入与真实 `401/403/409` 负例拦截 | Colab `:10010` & `:10086` 无令牌均返回 **`401`**；WS `companion` 越权发送 `audio.chunk`/`speech.delta`/`session.pause`/`session.end` 稳定拦截 **`COMPANION_READ_ONLY` (`403`)**；双 `primary` 抢麦拦截 **`PRIMARY_MIC_CONFLICT` (`409`)**；S1/S2 超时退回 `local_rule_zero`；过期/合并机制单测全过。 |
| **3** | **Colab GPU System 1 真机 (`:10010`)** | `healthcheck_jev.py` (`#108`) + `dual-system-real-validation.json` | 真机 `NVIDIA RTX PRO 6000 Blackwell` + `autotrust/JEV-27B` (`jev-v1`, Keep-Alive TLS+Bearer) | **`bias` 零重复计偏偏差 `<= 6e-08`**；服务端推理 **`avg 93.68 ms / P50 92.97 ms / P95 115.88 ms`**；直连 Keep-Alive 探针 `371–376 ms`；网关 E2E **`17/17` S1 调用全部走 Colab (`s1CallsRoutedToCpa: 0`, `localFallbackCalls: 0`, avg `784 ms` / P50 `618 ms`)**。 |
| **4** | **Colab GPU ASR 真机 (`:10086`) + 同卡并发** | `healthcheck.py` / `healthcheck_jev.py` (`#108`) + `dual-system-real-validation.json` | 真机同卡与 JEV-27B 并跑（`55,316.9 MiB` 已用 / **`41,933.2 MiB` 空闲**） | `FunAudioLLM/SenseVoiceSmall + fsmn-vad` 并发 6 轮转写 **`errors: []`**，**`asrAvgRtf: 0.00369`**（网关实时态 `0.00399`），TTS+DSP WAV 静音流全量转写流畅稳定。 |
| **5** | **CPA `gemini-4-hydrogen · medium` + 异步协同 & 双窗 E2E** | `dual-system-real-validation.json` (`#119`) + `presentation-e2e.test.mjs` & `companion-window-e2e.test.mjs` (`#115`, `--mute-audio`) | **三路真机串联**（真实 WAV->Colab ASR->Colab JEV-27B->CPA `medium`->Gateway）+ 双窗 Chromium 实测 | CPA `/responses` vs `/chat/completions` (`medium`) 2+2 全通；真实 **Scenario A/B/C 全通过**（`9,113 ms` 非阻塞差、`s2Coalesced: 2`、`s2CancelledAsStale: 2`、`guidanceRevisionsIssued/Applied: 4/4`、超纲问答 `0` 编造、复盘 `V = +2`）；Chromium `presentation-e2e` **`1/1` (`4,809.47 ms`)**、`companion-window-e2e` **`1/1` (`4,802.32 ms`，10/10 断言，`getUserMediaCalls === 0`，`420×720` `0px` 溢出)**。 |
| **6** | **真实人群与现场会议室麦观测** | `docs/business/CUSTOMER_VALIDATION.md` | 真实会议室环境人类讲者试讲与商业付款 | **PLANNED / NOT YET CONDUCTED（尚未开展）** — 零真实人间麦试讲样本与付费订单。 |

---

## 2. 三路真机协同实测详细分解（`dual-system-real-validation.json`）

### 2.1 CPA `gemini-4-hydrogen`（`reasoningEffort: 'medium'`）分模块用量与延迟
Across Scenario A/B/C 全验证周期（`gatewayThreeWayTelemetry.system2AndCpaTiers`）：
- **Compiler（1 call）**：`input: 1,580` / `output: 4,018`（含 **`reasoning: 2,520`**）/ `total: 5,598`，耗时 `22,141 ms` -> 编译产成 `pack_1794793574330`（`5` 章节、`20` 条 verified `Evidence`、`6` 张预测 Q&A 卡）。
- **System 2（5 calls）**：`input: 3,341` / `output: 5,802`（含 **`reasoning: 4,750`**）/ `total: 9,143`，耗时 **`avg 9,124 ms / P50 8,594 ms / P95 12,168 ms`**。
- **Reflection（3 calls）**：`input: 1,229` / `output: 5,130`（含 **`reasoning: 4,845`**）/ `total: 6,359`，耗时 **`avg 10,638 ms / P50 11,230 ms / P95 11,239 ms`**。
- **双端点对比（`/v1/responses` vs `/v1/chat/completions`，见 [S1_S2_ROUTING_VERIFICATION.md §3](./S1_S2_ROUTING_VERIFICATION.md)）**：两者均 `2/2` 成功返回并精准记入 `provider_reported` `reasoningTokens`（`avgMs: 6,094` vs `6,019`）。

### 2.2 Scenario A / B / C 真实语音流与双向黑板闭环记录
1. **`Scenario A`（`01_intro_natural` WAV 流 -> Colab ASR -> JEV-27B + Companion 只读拦截）**：
   - 转写顺利触发开场保护，`shownCount: 0`（严守 `L0`）；同会话 `companion` 注入越权 `speech.delta` 立即被 **`COMPANION_READ_ONLY`** 拦截（`companionReadOnlyBlocked: true`）。
2. **`Scenario B`（`10_omission` + `11_topic_drift` WAV 流 -> 异步 S1/S2 解耦 + 指导写回 + 自愈撤回）**：
   - 真实遗漏与跑偏语句到来时，S1 率先非阻塞完成现场裁决与快照更新，与异步 CPA S2 落地的真实跨度 **`nonBlockingS1ToS2GapMs = 9,113 ms`**；S2 写回 `System2Guidance` 并同步伴随窗，讲者补充恢复正题后双端按 **`user_recovered`** 立即撤回。
3. **`Scenario C`（`sess_10577c530148` 长会话：停顿抑制 + 卡顿提示 + 指导闭环 + 有据/无据问答 + 高频合并/切章取消 + 伴随求助 + 复盘）**：
   - **双向黑板实测计数（`dualSystemCollaboration`）**：`s1Evaluations: 11` -> `s1Escalations: 7` -> `s2AsyncDispatches: 7` -> `s2Completed: 4` -> **`s2Coalesced: 2`**（连续连说合并）-> **`s2CancelledAsStale: 2`**（切章与过期取消）-> **`guidanceRevisionsIssued: 4`** -> **`guidanceAppliedCount: 4`** -> **`guidanceExpiredOrOverridden: 2`**；延迟 `s1P50: 558 ms / s1P95: 1,029 ms`，`s2P50: 8,177 ms / s2P95: 12,168 ms`。
   - **问答防幻觉实测**：资料内 `09_qa` 命中引用（`qaGrounded: { grounded: true, evidenceCount: 1 }`）；超纲提问（“明年第四季度海外净营收与 B 轮投前估值”）在 CPA 与控制器双护栏下诚实返回 `grounded: false, evidenceIds: []`，提示 *“资料库未覆盖该数据，请坦诚说明暂无已核验记录”*（`0` 数字编造）。
   - **长会话全栈遥测（`reflectionResult.telemetry`，`33,370 ms` 实时 ASR）**：总计 `27` 次模型调用（`22` 次 Colab `JEV-27B` `6,213 in / 22 out / avg 357 ms` + `4` 次 CPA S2 `2,781 in / 4,775 out / 3,924 reasoning` + `1` 次 CPA Reflection `417 in / 1,410 out / 1,317 reasoning`）= **`15,618` total `provider_reported` tokens（`5,241` reasoning）**；`V = H - λI = 2 - 2*0 = 2`（`withdrawnBeforeDisruptionCount: 3`、`suppressedCount: 1`、`coverageRatio: 0.133`、`unansweredQuestions: 1`）。

---

## 3. 本轮验证过程暴露并已修复的真实代码缺陷

1. **伴随窗首次接入历史 `session.ready` 覆盖竞态（`#115` / `#119`）**：修正 `GatewayServer.ts:1554` 与 `presentationSession.ts:242-296`，避免补播历史 `t=0` `session.ready` 把 `companion` 角色与实时黑板覆盖回退。
2. **深度链接与 StrictMode 并发初始化 `401`（`#115`）**：合并 `ensureAuthSession()` 并发请求并令工作台视图等待 `authReady` 再请求 `/api/presentation/packs`。
3. **无证据问答通知被上轮 Q&A 冷却误拦截与弱证据回填（`#119`）**：修正 `InterventionController.ts:415` 允许 `openQuestion` 的 `missing_evidence_notice` 穿透一般冷却、`CpaProviderAdapter.ts:1374-1450` 禁止 `insufficient_evidence` 回填弱证据 ID 与数字，并修正 `CognitiveRuntime.ts` 在同轮触发 `candidate_expired` 时继续接纳同条新问题。

---

## 4. 现存客观限制与诚实边界

1. **语音来源限制（`notLiveHumanRoomRecording: true`）**：三路真机 WAV 流由离线神经语音合成+DSP 构造；真实室内多人交叉抢话与远场麦克风混响表现尚待 Phase 1 种子用户（`Round 1 20–30 -> Round 2 30–50`）实测。
2. **CPA 推理时延与计费口径（`costFen: 0`）**：`gemini-4-hydrogen` 在 `medium` 深度下输出 Token 中约 `82%–92%` 为 `reasoningTokens`（S2 平均 ~`9.1 s`），这正反衬了“S1 JEV-27B 本地/独立毫秒级闭环 + 异步不阻塞 `System2TaskCoordinator`”架构修正的必要性；因 CPA 上游不返回人民币单价，`TelemetryUsage.costFen` 诚实保持 `0`。
3. **Companion 平台窗口限制**：独立伴随窗及 `Document PiP` 仅限桌面浏览器权限范围，不宣称也无法突破 OS 全屏独占覆盖全屏 PowerPoint / Keynote。
