# CueX 双系统认知架构修正设计模型（定稿 · Wave 1–4 实证校准版）

> **文档状态**：已依据 Wave 1–4 全端代码改造与三路真机实测（`@protocol-architect` `@cuex/protocol` v2.2.0、`@colab-asr` `#108`、`@presentation-web` `#111`/`#115`、`@runtime-server` `#112`/`#119`）完成源码行号、契约字段与真机指标全量校准。  
> **安全与诚实约束**：本文档严禁出现密钥、Bearer Token、裸机 Host/IP 或本机用户路径；全部指标均核自实测脚本与产物。

---

## 1. 修正前架构痛点与终稿源码级落点对照

| 历史缺陷（Wave 1 审计发现） | Wave 2–4 实际源码修复与现行落点 |
| --- | --- |
| **System 1 错配走 CPA 云端大模型** | `apps/server/src/runtime/providers/FastDecisionAdapter.ts:768-792` 的 `createFastDecisionProvider('real')` 彻底移除 CPA 路由，强制路由至 `LlamaFastDecisionProvider` + `LlamaSystemOne`（外裹 `FallbackFastDecisionProvider(..., new HeuristicFastDecisionProvider())`）；`GatewayServer.ts` 构造仅在 `system2Mode === 'real'` 时初始化 `CpaClient`（实测 `s1CallsRoutedToCpa: 0`，`17/17` 网关 S1 评估全部直连 Colab JEV-27B）。 |
| **S1 → S2 同步串行阻塞 `ingestSpeech()`** | 新增 `apps/server/src/runtime/System2TaskCoordinator.ts:95-400`；`CognitiveRuntime.ts:518-764` 将 S1 与 S2 拆分为独立 `AbortController` 取消域，异步模式下 `ingestSpeech()` 完成 S1 与本地撤回裁决后立即返回（真机实测 S1 与异步 CPA S2 非阻塞返回时间差达 `9,113 ms`），S2 后台完成时通过 `'system2.guidance'` / `'intervention.shown'` 异步推送。 |
| **缺少 S2 → S1 反向黑板指导与 stale 取消** | `packages/protocol/src/dual-system.ts` 与 `SharedCognitiveStateStore.ts:143-258` 实现 `System2Guidance`（单调 `revision`、`basedOnTurnSeq`、`staleAfterTurnSeq`、`expiresAtMs`）、`S1ObservationSnapshot`、`DualSystemCollaborationMetrics`；`System2TaskCoordinator.ts:113-173, 249-302` 实现连说合并（`s2Coalesced`）、紧急抢占与切章/自愈过期取消（`s2CancelledAsStale`）。 |
| **`LlamaSystemOne` 缺鉴权/TLS/27B/长连接** | `apps/server/src/system1/LlamaSystemOne.ts:29-125, 135-417` 动态按 `CUEX_S1_MODEL` 选择 `autotrust-jev27b.json`（commit `14b42526...`）或 `autotrust-jev9b.json`，支持 `Authorization: Bearer`、自定义 SAN CA 钉扎、以及 `http/https.Agent({ keepAlive: true })` 长连接池（实测直连 Keep-Alive `371–376 ms`）与零重复累加 `bias`。 |
| **CPA 缺双端点 `medium` 推理传递与空证据护栏** | `CpaProviderAdapter.ts:43-44, 554-592, 1374-1450` 锁定 S2/Compiler/Reflection 默认 `gemini-4-hydrogen` 与 `DEFAULT_CPA_SYSTEM2_REASONING_EFFORT = 'medium'`：`responses` 端点传 `reasoning: { effort }`，`chat_completions` 端点传 `reasoning_effort: effort`；`insufficient_evidence` 时严禁回填弱证据并剥离数字。 |
| **TTL 过期误拦与缺失通知冷却阻塞（Wave 4 修复）** | `InterventionController.ts:415` 允许 `openQuestion` 的 `missing_evidence_notice` 穿透冷却窗口，确保“资料外超纲追问”立即诚实提醒而非被上轮提示冷却吞掉；`CognitiveRuntime.ts` 修复旧干预 `candidate_expired` 时早退吞掉同条新提问；`GatewayServer.ts:1554` 与 `presentationSession.ts:242-296` 防止重连补播历史 `session.ready` 覆盖状态。 |
| **健康归因混同且缺独立拆解** | `GatewayServer.ts:466-571` 依照 `packages/protocol/src/api.ts:33-70` 输出 `asr`、`system1`（含 `promptFormat`、`calibrated`、`fallbackActive`、`fallbackReason`）、`system2`（含 `reasoningEffort`）、`compiler`、`reflection` 与 `dualSystemMetrics` 六维脱敏归因。 |

---

## 2. 修正后的三路职责与真机实测拓扑

```text
实时音频帧 / 文本片段 (16kHz PCM16LE / speech.delta)
  │
  ▼
[1] 实时感知：Colab GPU ASR (`:10086`, HTTPS/WSS + Bearer + Pinned SAN TLS)
  │   FunAudioLLM/SenseVoiceSmall + fsmn-vad (`avgRTF = 0.00399` @ 并发实测)
  │   流式 partial/final -> CognitiveRuntime.ingestSpeech() 本地自愈快判直通撤回
  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 共享认知黑板 (`SharedCognitiveStateStore`, `packages/protocol/src/state.ts`)│
│  · contextVersion · turnSeq · activeChapterId · openGapLabels              │
│  · latestS1Observation: S1ObservationSnapshot | null   ◄── S1 每轮写回     │
│  · system2Guidance: System2Guidance | null (rev N)     ◄── S2 异步反向发布 │
│  · dualSystemMetrics: DualSystemCollaborationMetrics                       │
│  · pendingCandidates[] / activeIntervention / cooldowns / suppressions     │
└───────────────▲───────────────────────────────────────┬────────────────────┘
                │ 读取 activeGuidance (未过期且未跨轮次)   │ 仅当 S1 升级/Q&A/人工求助
                │ (`LlamaFastDecisionProvider:432-615`)  │ (`System2TaskCoordinator:113`)
┌───────────────┴──────────────┐          ┌─────────────▼────────────────────┐
│ [2] 快思考：System 1 (S1)    │          │ [3] 慢思考：System 2 (S2)         │
│  Colab `:10010` (Keep-Alive) │          │  CPA 统一网关 (`CpaProviderAdapter`)│
│  `autotrust/JEV-27B` `jev-v1`│          │  `gemini-4-hydrogen` (`medium`)  │
│  24-slot (`noul/score/choice`)          │  · `LexicalBm25RetrievalProvider` │
│  客户端单次校准 (`avg 784ms`):│          │  · 生成有据 Candidate (`L1–L3`)  │
│  `(logprob + bias) / T_kind` │          │  · 生成反向 `System2Guidance`    │
│  降级: `HeuristicFastDecision`│          │  降级: `LocalSlowReasoning`      │
└───────────────┬──────────────┘          └─────────────┬────────────────────┘
                │                                       │ 广播 `system2.guidance`
                └───────────────────┬───────────────────┘ & `intervention.shown`
                                    ▼
[4] 独立门控仲裁层：`InterventionController` (`apps/server/src/runtime/InterventionController.ts`)
    · 唯一 UI 展示裁判：11 道门控 + 7 类自动撤回转移（`L0 -> L1 -> L2 -> L3`）
    · 紧急直问（`openQuestion`）或自愈恢复（`effectiveRecovery`）通过 `invalidateGuidance()`
      与 `s2Coordinator.cancelStale()` 立即覆盖过期指导并撤回旧提示
```

---

## 3. 共享认知黑板与双向异步契约（`@cuex/protocol` v2.2.0 实证）

### 3.1 `S1ObservationSnapshot`（快思考单轮观测：`packages/protocol/src/dual-system.ts:71-97`）
- **生成落点**：`LlamaFastDecisionProvider.evaluate()`（`FastDecisionAdapter.ts:569-590`）与 `CognitiveRuntime.ts:578-609` 写入 `state.recordS1Observation()`。
- **核心字段**：
  - 轮次与时空：`turnSeq`、`observedAtMs`、`observedAt`；
  - 决策头校准输出：`decisionType`（`'noul' | 'choice' | 'score' | 'unknown'`）、`selectedSlot`（24 槽索引，规则引擎为 `-1`）、`label`、`calibratedConfidence`、`margin`、`entropy`；
  - 协同归因：`escalationReason`、`escalatedToS2`、`latencyMs`、`degraded`、`providerKind`（`'colab_jev' | 'local_jev' | 'local_rule_zero'`）、`model`、`promptFormat`、`calibrated`、`guidanceAppliedRevision`、`cognitiveState`、`interventionNeed`。
- **指导消费与动态阈值（`FastDecisionAdapter.ts:514-560`）**：
  - `LlamaFastDecisionProvider` 读取未过期的 `activeGuidance`：若 `recommendedBias` 为 `'stay_silent'` 或 `'recovery_hold'`，无紧急直问/显式偏离时将 `needThreshold` 从默认 `0.72` 提高至 **`0.88`**；若偏向 `'prefer_l2'` / `'prefer_l3'` 则温和降至 **`0.62`** 并可对齐 `preferredLevel`。
  - **突发语音覆盖保护（`CognitiveRuntime.ts:611-614`）**：遇到讲者恢复（`effectiveRecovery`）或明确听众提问撞上 `stay_silent` 时，立即调用 `this.state.invalidateGuidance(postS1NowMs)` 撤销过期指导，防止 S1 被陈旧的“静默指导”锁死。

### 3.2 `System2Guidance`（慢思考反向策略：`packages/protocol/src/dual-system.ts:36-66`）
- **生成与提交**：`System2TaskCoordinator.commitValidResult()`（`System2TaskCoordinator.ts:341-357`）在校验 `contextVersion` 一致后调用 `state.commitSystem2Guidance()` 分配严格递增 `revision`（默认 `staleAfterTurnSeq = input.turnSeq + 3`），随后向主控端与伴随窗推送 `ServerMessage` `{ type: 'system2.guidance', payload: committedGuidance }`。
- **时效与自动淘汰（`SharedCognitiveStateStore.ts:143-152, 210-254`）**：
  - `getActiveGuidance(nowMs, currentTurnSeq)` 自动检查时间过期（`nowMs >= expiresAtMs`）、轮次超界（`currentTurnSeq > staleAfterTurnSeq`）与上下文变更（`g.contextVersion !== this.contextVersion`），任意命中即清空指导并递增 `guidanceExpiredOrOverridden`。

### 3.3 `System2TaskCoordinator` 并发抢占、防抖合并与过期取消
`apps/server/src/runtime/System2TaskCoordinator.ts:68-400` 已通过实机 WAV 流场景压测（`dual-system-real-validation.json:670-687`：`s1Evaluations: 11`, `s1Escalations: 7`, `s2AsyncDispatches: 7`, `s2Completed: 4`, `s2CancelledAsStale: 2`, `s2Coalesced: 2`, `guidanceRevisionsIssued: 4`, `guidanceAppliedCount: 4`, `guidanceExpiredOrOverridden: 2`）：
1. **优先级仲裁（`priorityForTrigger` 第 `68-84` 行）**：`manual_help` (`100`) > `live_qa` (`90`) > `omission` (`60`) > `hesitation` (`58`) > `drift` (`55`) > `pace_overtime` (`40`)。高优先级或更高 `contextVersion` 任务到达时直接 `markTaskStale()` 中止低优先在途请求。
2. **单飞合并防抖（第 `134-137` 行）**：同级或更低优先触发在 `inFlight` 期间到达时合并入单槽位 `pendingInput` 并递增 `s2Coalesced`（实测合并 2 次）。
3. **过期取消（`cancelStale` 第 `146-173` 行）**：`user_recovered`、`chapter_changed`、`context_changed` 或 `session_ended` 发生时更新 `staleCutoffTurnSeq` 并立即中止非紧急的过期 S2 任务；延迟返回的第 `249-264` 行也会因版本/轮次陈旧丢弃并计入 `s2CancelledAsStale`（实测取消 2 次）。
4. **TTL 重锚（第 `383-399` 行）**：`reanchorCandidateLifetime()` 依据实际异步 S2 耗时顺延新产生 `Candidate` 的显示 TTL，保证慢推理产出的卡片不“刚出生即过期”，同时在 `ManualClock` 下保持零偏移确定性。

---

## 4. `LlamaSystemOne` 与 Colab JEV-27B 校准一致性（Wave 1–4 已实证）

1. **单次 `bias` 计算与数值零误差实证（`#108` + `LlamaSystemOne.ts:29-35, 123-125`）**：
   - `infra/colab/start_jev_s1.py` 经校验 `head.safetensors` 的 `proj.bias` 与 `decision_head.json` 最大偏差 `0.00e+00`；服务端 `/completion` 在 `lora.scale > 0` 命中 `verbalizer_ids` 时仅返回无偏置投影 `W @ h` 的归一化概率。
   - Node 端 `LlamaSystemOne.ts` 按 `model` 名称动态选择 `autotrust-jev27b.json`（27B：`noul=1.0143134751376188`、`choice=1.0161280671450397`、`score=1.0036213515883572`）或 `autotrust-jev9b.json`，统一执行一次 `(logprob + bias[offset + i]) / per_kind[kind]`。实测与 Colab PyTorch 直接前向对比最大绝对概率偏差仅 `<= 6e-08`（`noul 6e-08`、`score 3e-08`、`choice 4e-08`）。
2. **连接池与真机表现（`LlamaSystemOne.ts:135-295, 400-411` + `dual-system-real-validation.json`）**：
   - 支持 `CUEX_S1_URL`、`CUEX_S1_API_KEY`、`CUEX_S1_CA_CERT`（复用 `.cuex-runtime/colab-asr-cert.pem`）、`CUEX_S1_MODEL=autotrust/JEV-27B`、`CUEX_S1_PROMPT_FORMAT=jev-v1`。
   - 启用 `https.Agent({ keepAlive: true, maxSockets: 4 })` 后，直连探针仅 `371–376 ms`（`fluent_intro: 371 ms / probTrue 0.494089`、`topic_drift: 371 ms / probTrue 0.494887`、`hesitation_gap: 376 ms / top: true / probTrue 0.807122`）；全网关端到端 17 次 S1 评估 `avg 784 ms / P50 618 ms / P95 1,188 ms`，`localFallbackCalls: 0`，与 CPA S2（`medium`，avg `9,124 ms` / P50 `8,594 ms`）实现数量级错峰协同。
