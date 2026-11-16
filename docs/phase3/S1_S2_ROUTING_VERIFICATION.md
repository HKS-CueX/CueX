# CueX S1 / S2 / ASR 三路模型路由与协议差异验证报告（定稿 · Wave 4 真机实测校准）

> **证据依据**：[`infra/colab/healthcheck_jev.py`](../../infra/colab/healthcheck_jev.py)（`#108`）、[`apps/server/scripts/validate-dual-system-real.ts`](../../apps/server/scripts/validate-dual-system-real.ts)（`#119`）及脱敏实测证据 [`dual-system-real-validation.json`](../../deliverables/cuex-final/mandatory/ai-employee-demo/evidence/dual-system-real-validation.json)（`generatedAt: 2026-11-16T01:48:32.572Z`）。  
> **安全与诚实约束**：严格零密钥、零 Bearer Token、零裸机 Host/IP 与零本机绝对用户路径；全部数值直接核自实测记录与源码解析。

---

## 1. 三路路由纠偏终验总表

| 子系统 | Wave 1 纠偏前状态 | Wave 2–4 修正与终验落地状态 | 真机核验结论 |
| --- | --- | --- | --- |
| **ASR (`:10086`)** | Colab `FunAudioLLM/SenseVoiceSmall + fsmn-vad` | 独立服务于 `:10086`，与 `:10010` S1 同卡并跑零报错（`avgRTF=0.00399`，`401` 拦截通过） | **PASS** |
| **System 1 (`:10010`)** | `FastDecisionAdapter` 误将 S1 路由至 CPA 大模型；缺 SAN TLS 与 27B 支持 | `createFastDecisionProvider('real')` 彻底移除 CPA 路由，直连 Colab `autotrust/JEV-27B`（`jev-v1`，`Keep-Alive` + Bearer + SAN TLS）；网关内 **`17/17` S1 调用走 Colab，`s1CallsRoutedToCpa: 0`，`localFallbackCalls: 0`** | **PASS** |
| **System 2 / Compiler / Reflection** | 同步串行阻塞 `ingestSpeech()`；无双端点 `medium` 传参 | 严格固定 `gemini-4-hydrogen` + `reasoningEffort: 'medium'`，后台 `System2TaskCoordinator` 非阻塞运行并写回 `System2Guidance` | **PASS** |
| **离线确定性 CI 与降级** | `CUEX_TEST_OFFLINE=1` / `local_rule_zero` | `CUEX_TEST_OFFLINE=1` 测试 **`38/38` pass**、离线 `eval` **`6/6` pass**（`0.95 ms` avg，0 Tokens），与真机指标彻底分离 | **PASS** |

---

## 2. Colab `:10010` `autotrust/JEV-27B` S1 安全、校准与同卡并发实测

### 2.1 鉴权、证书钉扎与无重复 `bias` 一致性（已核实）
- **TLS + Bearer 强制鉴权（`#108` & `dual-system-real-validation.json:7-8`）**：
  - `:10010`：`healthNoAuth=401`、`healthBadAuth=401`、`completionNoAuth=401`、`completionBadAuth=401`、`applyTemplateNoAuth=401`（E2E 复验 `colabS1UnauthorizedHttp: 401`）。
  - `:10086`：无 Token 请求返回 `401`（`colabAsrUnauthorizedHttp: 401`）。
- **SAN 证书钉扎**：`LlamaSystemOne.ts:394-411` 加载 `.cuex-runtime/colab-asr-cert.pem` 构造 `https.Agent({ keepAlive: true, rejectUnauthorized: true })`。
- **单次偏置计算对齐（`biasNoDoubleCountVerified: true`）**：
  - `start_jev_s1.py` 校验 `head.safetensors` `proj.bias` 与 `decision_head.json` 最大偏差 `0.00e+00`，服务端 `/completion` 在受限候选模式下**不再累加 `proj.bias` 或除 `T_kind`**；Node 端 `LlamaSystemOne.ts` 读取 `autotrust-jev27b.json`（27B：`noul=1.0143134751376188`、`choice=1.0161280671450397`、`score=1.0036213515883572`）执行单次 `(logprob + bias) / T_kind`。与 PyTorch `/v1/decide` 直接前向对比：最大绝对概率偏差 **`noul: 6e-08`、`score: 3e-08`、`choice: 4e-08`**。

### 2.2 同卡并发资源与延迟实测（`RTX PRO 6000 Blackwell`，`#108` + `dual-system-real-validation.json`）

| 实测维度 | 实测观测结果 | 数据来源 |
| --- | --- | --- |
| **总显存 / 两服务加载后剩余** | 总可用 `97,250.1 MiB`；`JEV-27B` Torch 分配 `51,786.6 MiB` / 进程 `52,846 MiB`；`SenseVoiceSmall` 分配 `972.3 MiB` / 进程 `1,690 MiB`；并发压测后整卡占用 `55,316.9 MiB`、**剩余 `41,933.2 MiB`（~41.0 GiB 空闲）** | `healthcheck_jev.py` (`#108`) |
| **JEV-27B 加载与服务端推理延迟** | 冷加载 `7.525 s`，预热 `439.11 ms`；37 次请求服务端推理 **`avg 93.68 ms / P50 92.97 ms / P95 115.88 ms`**（Keep-Alive 稳态推理 ~`81.22 ms` / RTT ~`410.05 ms`，短连接 `P50 829.06 ms / P95 993.35 ms`） | `healthcheck_jev.py` (`#108`) |
| **并发压测期间 ASR 稳定性** | 6 轮 16.265 s 音频同卡并发转写 **`errors: []`**，`asrRttMsAvg: 1,238.31 ms`、`P95: 1,339.79 ms`、**`asrAvgRtf: 0.00369`** | `healthcheck_jev.py` (`#108`) |
| **Node Keep-Alive 直连探针（3 典型句）** | `fluent_intro`: **`371 ms`**（`top: false, probTrue: 0.494089`）；`topic_drift`: **`371 ms`**（`top: false, probTrue: 0.494887`）；`hesitation_gap`: **`376 ms`**（`top: true, probTrue: 0.807122`, `selectedSlot: 1`, `margin: 0.614244`, `entropy: 0.707453`） | `dual-system-real-validation.json:22-77` |
| **Gateway 全链路 E2E S1 汇总（17 次）** | `avgMs: 784`、`P50: 618 ms`、`P95: 1,188 ms`、`remoteJevCalls: 17`、`localFallbackCalls: 0`（单轮含两次分类问题呼叫 + 本地特征与事件分发开销） | `dual-system-real-validation.json:334-357` |

---

## 3. CPA `gemini-4-hydrogen`（`reasoningEffort: 'medium'`）双端点实测对比

依据 `apps/server/src/runtime/providers/CpaProviderAdapter.ts:361-445, 554-592` 源码解析逻辑与 `dual-system-real-validation.json:78-155` 实机 2+2 轮对比调用，如实记录两个上游端点在 `medium` 推理深度下的请求/解析/实测差异：

| 比较维度 | `/v1/responses`（`medium` 实测） | `/v1/chat/completions`（`medium` 实测） |
| --- | --- | --- |
| **请求体传参格式** (`CpaProviderAdapter.ts:570-591`) | `instructions` + `input` + `max_output_tokens` + `reasoning: { effort: 'medium' }` | `messages` (`system` + `user`) + `max_tokens` + `reasoning_effort: 'medium'` |
| **文本主体解析路径** (`extractTextFromCpaResponse:411-445`) | 优先读 `output_text`，回退拼接 `output[].content[].text`（`type === 'message'`） | 读 `choices[0].message.content`（字符串或片段数组） |
| **Usage 与推理 Token 字段映射** (`extractCpaUsage:361-409`) | `usage.input_tokens`、`usage.output_tokens`、`usage.input_tokens_details.cached_tokens`、**`usage.output_tokens_details.reasoning_tokens`**、`usage.total_tokens` | `usage.prompt_tokens`、`usage.completion_tokens`、`usage.prompt_tokens_details.cached_tokens`、**`usage.completion_tokens_details.reasoning_tokens`**、`usage.total_tokens` |
| **HTTP 成功率与 `usageReported`** | **2/2 `statusOk: true`**，均 `usageReported: true` | **2/2 `statusOk: true`**，均 `usageReported: true` |
| **实测第 1 轮（相同 `inputTokens: 122`）** | Latency **`6,394 ms`** · `outputTokens: 642`（含 **`reasoningTokens: 589`**，占输出 91.7%）· `total: 764` | Latency **`5,951 ms`** · `outputTokens: 520`（含 **`reasoningTokens: 469`**，占输出 90.2%）· `total: 642` |
| **实测第 2 轮（相同 `inputTokens: 111`）** | Latency **`5,793 ms`** · `outputTokens: 494`（含 **`reasoningTokens: 449`**，占输出 90.9%）· `total: 605` | Latency **`6,086 ms`** · `outputTokens: 509`（含 **`reasoningTokens: 463`**，占输出 91.0%）· `total: 620` |
| **延迟汇总（Avg / P50 / P95）** | `avgMs: 6,094` · `p50Ms: 5,793` · `p95Ms: 6,394` | `avgMs: 6,019` · `p50Ms: 5,951` · `p95Ms: 6,086` |
| **诚实边界说明** | 两个端点在 `completeJson`（非流式）模式下均真实返回并正确解析出了 `reasoningTokens`（且未出现因 `reasoning_effort` 导致空回复），总体延迟接近（~6.0s）；`validate-dual-system-real.ts` 将输出统一归一化为 `CpaUsageDetails`，**未单独捕获并落盘 `chat_completions` 在 `medium` 下的逐帧原始 SSE 增量包**。 | 与左栏相同；生产默认按 `CpaClient` 对模型提示（`openai-responses`）走 `/v1/responses`。 |

---

## 4. `/api/health`（`/health`）六维脱敏归因实测快照验证

`dual-system-real-validation.json:156-324` 已实测抓录初始与收尾两次完整 `/health` 响应，确认全部 **6 项**归因边界与脱敏红线：
1. **`asr`**：`backend: "colab-gpu-asr"`, `mode: "colab_gpu"`, `lifecycleState: "ready"`, `gpuName: "NVIDIA RTX PRO 6000 Blackwell Server Edition"`, `modelId: "FunAudioLLM/SenseVoiceSmall"`, `rtf: 0.00399`, `fallbackActive: false`。
2. **`system1`**：`backend: "colab-jev-27b"`, `mode: "real"`, `provider: "colab-jev-s1"`, `model: "autotrust/JEV-27B"`, `promptFormat: "jev-v1"`, `calibrated: true`, `degraded: false`, `fallbackActive: false`。
3. **`system2`**：`provider: "cpa:[REDACTED_ENDPOINT]"`, `model: "gemini-4-hydrogen"`, `reasoningEffort: "medium"`, `degraded: false`, `fallbackActive: false`。
4. **`compiler` & `reflection`**：均清晰拆列且独立绑定 `model: "gemini-4-hydrogen"`, `reasoningEffort: "medium"`, `mode: "real"`, `provider: "cpa:[REDACTED_ENDPOINT]"`。
5. **`dualSystemMetrics`**：随会话实时累加（结束态实测 `s1Evaluations: 11, s1Escalations: 7, s2AsyncDispatches: 7, s2Completed: 4, s2CancelledAsStale: 2, s2Coalesced: 2, guidanceRevisionsIssued: 4, guidanceAppliedCount: 4, guidanceExpiredOrOverridden: 2, s1LastLatencyMs: 560, s1P50LatencyMs: 558, s1P95LatencyMs: 1029, s2LastLatencyMs: 12168, s2P50LatencyMs: 8177, s2P95LatencyMs: 12168`）。
6. **零泄露确认**：所有输出均经 `[REDACTED_ENDPOINT]` 脱敏且 `node scripts/check-public-data.mjs` 扫描 `0` 命中。
