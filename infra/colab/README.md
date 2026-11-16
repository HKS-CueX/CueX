# CueX Colab GPU 推理基础设施（`infra/colab`）

Google Colab G4 GPU 同卡部署方案，承载 **实时 GPU 语音识别（ASR，端口 `10086`）** 与 **Jev-Like System 1 快速认知决策模型（`autotrust/JEV-27B`，端口 `10010`）**。

> **架构边界声明**：
> - Colab `10086`：仅运行 **GPU ASR（`FunAudioLLM/SenseVoiceSmall` + `fsmn-vad`）**。
> - Colab `10010`：仅运行 **System 1 Jev-Like 单 Token 校准分类器（`autotrust/JEV-27B`）**。
> - System 2 慢思考推理、讲稿编译（Compiler）与复盘生成（Reflection）由本地服务端通过 `CpaProviderAdapter` 调用 CPA（`gemini-4-hydrogen`），绝不在 Colab 部署 System 2 慢思考大语言模型生成服务。

---

## 1. Colab G4 运行时硬件与双服务同卡资源实测

已在活跃 Colab G4 会话 `cuex-asr` 上完成真实同卡并发验证：

| 组件 / 指标 | 实测值 |
| :--- | :--- |
| **GPU 型号** | `NVIDIA RTX PRO 6000 Blackwell Server Edition`（`sm_120`，计算能力 `(12, 0)`） |
| **总显存（SMI / CUDA）** | `97887 MiB` / `97250.1 MiB` |
| **驱动与 CUDA 版本** | Driver `580.82.07`，CUDA `13.0` |
| **操作系统 / Python / PyTorch** | `Linux 6.6.159+ x86_64`，`Python 3.13.16`，`torch 2.14.1+cu130` |
| **ASR 服务显存（`:10086` `SenseVoiceSmall`）** | `1690 MiB` 进程占用（Torch 分配 `972.3 MiB` / 预留 `1030.0 MiB`） |
| **S1 服务显存（`:10010` `autotrust/JEV-27B` BF16）** | `52846 MiB` 进程占用（Torch 分配 `51786.6 MiB` / 预留 `52226.0 MiB`） |
| **双服务并发后总占用 / 剩余空闲显存** | **`55316.9 MiB`** / **剩余 `41933.2 MiB`（~41.0 GiB 空闲）** |

---

## 2. System 1 模型选型：`autotrust/JEV-27B`（SOTA Jev-Like）与数值校准对齐

### 2.1 为什么首选 `autotrust/JEV-27B`

- **架构优势**：基座为 `Qwen3_5ForCausalLM`（`hidden_size = 5120`，64 层中每 4 层含 1 层 `full_attention`，其余为线性注意力），配合 LoRA (`r=16, lora_alpha=32`) 与 24 槽线性头 `head.safetensors` (`(24, 5120)`)，在 `NVIDIA RTX PRO 6000` 上以 `bfloat16` 加载仅占 ~`52.8 GiB` 显存，轻松与 `1.69 GiB` `SenseVoiceSmall` 同卡零冲突共存。
- **显著更优的 OOD 与校准表现**：`autotrust/JEV-27B`（commit `14b425269ed24452e0a5ad5a8f3e51d139647a88`，Apache-2.0）与 `JEV-9B` 共享完全相同的 `jev-v1` 协议和 24 个 `verbalizer_ids`（`0..1: noul ["false","true"]`、`2..7: score ["0".."5"]`、`8..23: choice ["A".."P"]`），但训练了专属 `27B` `decisionHead.bias` 与分类型温度 `calibration.per_kind`（已导出脱敏配置 [`autotrust-jev27b.json`](./autotrust-jev27b.json)）。

### 2.2 严格数值校准与防止重复加 `bias`（供 `@runtime-server` 对齐）

客户端 `LlamaSystemOne.ts` 第 257 行固定对 `/completion` 返回的 `prob_i` 执行：

$$\text{logit}_i = \frac{\ln(p_i) + b_{\text{slot}+i}}{T_{\text{kind}}}, \quad P_{\text{calibrated}} = \text{softmax}(\text{logit})$$

为保证与 PyTorch 原生分类头公式 $\text{softmax}((W h + b_{\text{head}}) / T_{\text{kind}})$ **逐位等价且绝不重复叠加 `bias`**：
1. **`start_jev_s1.py` `/completion` 路径**：当 `lora.scale > 0` 且候选 Token 属于 `verbalizer_ids` 时，仅计算无偏置投影 `raw_logits = h @ W_head^T`（**不加 `proj.bias`，不除以 `T_kind`**）并输出受限候选集合的 `log_softmax` / `prob` 到 `completion_probabilities[0].top_probs`。
2. **`/v1/decide` 直算对比路径**：直接执行 `softmax((W_head @ h + proj.bias)[lo:hi] / T_kind)`。
3. **交叉实测精度**：通过 `healthcheck_jev.py` 对 `noul`、`score`、`choice` 三种题型交叉检验，`/completion + autotrust-jev27b.json` 与 PyTorch 原生直算的最大绝对概率差仅 **`3e-08 ~ 6e-08`**（已验证 `head.safetensors` 的 `proj.bias` 与 `adapter_vllm/decision_head.json` 偏差为 `0.00e+00`）。

### 2.3 `@runtime-server` 接入 `LlamaSystemOne.ts` 必要修改要点

现有 `apps/server/src/system1/LlamaSystemOne.ts` 原先针对无鉴权本机 HTTP `autotrust-jev9b.json` 编写，对接 Colab `:10010` 需补充：
1. 读取环境变量 `CUEX_S1_API_KEY`（随 `/health`、`/apply-template`、`/completion` 请求附带 `Authorization: Bearer <token>`）与 `CUEX_S1_CA_CERT`（固定 TLS CA 证书 `.cuex-runtime/colab-asr-cert.pem`）。
2. 当 `CUEX_S1_MODEL` 包含 `27B`（默认 `autotrust/JEV-27B`）或配置了校准文件路径时，加载 **`infra/colab/autotrust-jev27b.json`**（不要误用 `JEV-9B` 的偏置与温度）。
3. 建议使用 HTTP Keep-Alive 长连接复用 TLS 会话：实测跨洋 FRP 环境下短连接 P50/P95 RTT 为 `848.27 ms` / `1029.46 ms`，启用 Keep-Alive 后稳态 RTT 降至 **`410.05 ms` 平均**（最低 `341.36 ms`），配合 `CUEX_S1_TIMEOUT_MS >= 2500` 极度充裕。

---

## 3. ASR 模型双基准对比与选型结论（`:10086`）

在真实 Colab `RTX PRO 6000` + CueX 14 条中英双语评测集（总时长 `225.344 s`，16 kHz mono PCM16LE；[语料清单](../../deliverables/cuex-final/mandatory/ai-employee-demo/demo-pack/audio/manifest.json)）上实测对比：

> **语料透明度声明**：该 14 条 WAV 语料由离线 macOS 神经网络人声（`Tingting`/`Meijia`/`Rocko`）经声学变换（快语速、停顿填充词、`-16 dB` 低增益、`+9 dB` 软削波、室内噪声、打断抢答）离线文件到文件合成（零外放播放），不同于真实会议室人声实录。

| 指标 | `iic/SenseVoiceSmall` + `fsmn-vad`（**已选默认**） | `openai/whisper-large-v3-turbo` (`fp16` PyTorch SDPA) | 对比差距 |
| :--- | :---: | :---: | :--- |
| **推理框架** | `FunASR 1.4.26`（CUDA PyTorch） | HF `transformers` SDPA（`fp16`） | 均原生运行于 CUDA 13.0 |
| **热加载耗时** | `0.999 s`（服务端冷启动 `4.584 s`） | `0.835 s` | 相近 |
| **首段 1.5 s 延迟** | **`27.18 ms`** | `29.19 ms` | 更快首包 |
| **14 条平均终稿延迟** | **`51.77 ms`**（在线 HTTP `52.57 ms`） | `149.37 ms` | **快 2.88 倍** |
| **P95 延迟** | **`69.24 ms`**（在线 HTTP `89.59 ms`） | `205.50 ms` | **快 2.97 倍** |
| **整体 RTF** | **`0.00322`**（~310 倍实时） | `0.00928`（~108 倍实时） | **RTF 低 2.88 倍** |
| **平均句 CER / 整体 CER** | `0.0881` / `0.1014`（在线 `0.0867`） | `0.0836` / `0.0904` | 英文专名漂移由词表纠偏 |
| **GPU 显存占用（进程 / 峰值）** | **`1650 MiB` / `1084.7 MiB`** | `2448 MiB` / `1621.1 MiB` | **省显存 32.6%** |

> **基准备注（`libcublas.so.12`）**：Colab 运行时为 CUDA `13.0`，预装测试的 `faster-whisper 1.2.1` + `ctranslate2 4.9.0` 会因缺少 `libcublas.so.12` 无法调用 CUDA。为保持运行时稳定不降级 CUDA，`start_asr.py` 集成并实测了基于 PyTorch SDPA 的 `transformers` Whisper 回退路径，最终选定延迟与显存均显著占优且自带 `fsmn-vad` 的 `SenseVoiceSmall`。

---

## 4. JEV-27B + ASR 同卡并发压测与服务契约

### 4.1 `healthcheck_jev.py` 同卡并发实测（2026-11-16）

- **401 鉴权负例**：未携带 Token 与错误 Token 访问 `S1 /health`、`/completion`、`/apply-template` 与 `ASR /health`、`/v1/asr/transcribe`、`/v1/asr/stream` 全部返回 **`401 UNAUTHORIZED`**。
- **JEV-27B 加载与推理**：冷加载 **`7.525 s`**，预热 **`439.11 ms`**；12 轮与 ASR 并发压测下服务端 GPU 推理耗时 **平均 `97.87 ms` / P50 `93.23 ms` / P95 `114.55 ms`**（15 请求全量 `avg 98.49 ms / P50 93.51 ms / P95 116.02 ms`）；纯单连接 Keep-Alive 服务端平均 **`81.22 ms`**。
- **ASR 同卡并发表现**：并发压力下 6 次 16.265 s 音频批转写 **`errors: []`**，平均 **`asrAvgRtf = 0.00432`**（~231 倍实时），断线重连后 `/ready` 均恢复 `200 OK`。

### 4.2 网络与安全模型（FRP `0.71.1` + 自签名 SAN TLS + Bearer）

- 两个服务均只绑定 Colab VM 回环地址 `127.0.0.1`：`:10086`（ASR）与 `:10010`（JEV-27B S1），`sshd` 仅监听 `127.0.0.1:2222`。
- 通过 `frpc 0.71.1` 将 `<redacted-frp-host>:10080` 映射至 SSH，`:10086` 与 `:10010`（TCP/UDP）映射至双服务。
- 复用并固定 RSA-2048 自签名 SAN 证书（覆盖 `IP:127.0.0.1, IP:<frp-host>, DNS:localhost`），**仅公钥证书** 存放在 gitignored `.cuex-runtime/colab-asr-cert.pem`，密钥与 URL 仅存 gitignored `.cuex-runtime/.env.phase3.local`（`0600`）。

### 4.3 端口 `:10010` HTTP API 契约（`start_jev_s1.py`）

占位地址示例（实际读取 `.cuex-runtime/.env.phase3.local` 中 `CUEX_S1_URL`）：`https://203.0.113.10:10010`，所有请求必须携带请求头 `Authorization: Bearer <CUEX_S1_API_KEY>`。

- `GET /health` -> `200 OK`：返回 `{ status, ok, ready, lifecycleState, backend: "colab-jev-s1", model: "autotrust/JEV-27B", promptFormat: "jev-v1", calibrated: true, headVerified: true, gpu, loadTimeSec, warmupLatencyMs, uptimeSec, metrics: { totalRequests, totalInputTokens, latency: { count, avgMs, p50Ms, p95Ms } }, timestamp }`。
- `GET /ready` -> 就绪返回 `200 OK`，启动中返回 `503`。
- `POST /apply-template` -> 接收 `{ messages, add_generation_prompt, chat_template_kwargs }`，返回 `{ prompt }`。
- `POST /completion` -> 接收 llama.cpp 格式 `{ prompt, n_predict: 1, grammar, logit_bias, n_probs, post_sampling_probs, temperature, lora }`，返回 `{ content, model, tokens_evaluated, tokens_predicted, tokens_cached, timings, completion_probabilities: [{ content, top_probs, top_logprobs, probs }], probs, latencyMs, headFormula }`。
- `POST /v1/decide` -> 接收 `{ kind: "noul"|"score"|"choice", state, question, options? }`，返回 PyTorch 原生直接前向校准概率，供 `healthcheck_jev.py` 自动验证无重复加 `bias`。

### 4.4 端口 `:10086` HTTP / WSS ASR API 契约（`start_asr.py`）

- `GET /health` / `GET /ready`：返回 `{ status, ready, lifecycleState, backend: "colab-gpu-asr", model: "FunAudioLLM/SenseVoiceSmall", gpu, loadTimeSec, warmupLatencyMs, uptimeSec, metrics }`。
- `POST /v1/asr/transcribe`：支持 `multipart/form-data`、`audio/wav`、`audio/pcm`（限 `15 MiB` / `180 s` / `30 s` 超时），内存解码零落盘。
- `WSS /v1/asr/stream`：输入 `16 kHz` `pcm_s16le` 单声道二进制分片（`32 bytes/ms`）与 JSON 控制帧（`config` / `ping` / `flush` / `end` 或 `"Done"`），输出 `ready` / `partial` / `final` / `ping` / `pong` / `done` / `error`。

---

## 5. 文件清单与静默验证命令

- [`start_asr.py`](./start_asr.py)：Port `10086` HTTPS + WSS GPU ASR 服务。
- [`start_jev_s1.py`](./start_jev_s1.py)：Port `10010` HTTPS + Bearer `autotrust/JEV-27B` System 1 服务。
- [`autotrust-jev27b.json`](./autotrust-jev27b.json)：从 `autotrust/JEV-27B` 提取的非涉密 24 槽决策头偏置与温度校准配置。
- [`healthcheck.py`](./healthcheck.py)：Port `10086` ASR TLS 鉴权与就绪探针。
- [`healthcheck_jev.py`](./healthcheck_jev.py)：Port `10010` JEV-27B 401 鉴权、`noul`/`score`/`choice` 校准对齐与同卡并发验收脚本。
- [`cuex-asr-deployment.ipynb`](./cuex-asr-deployment.ipynb)：在 Colab G4 上真实执行并包含双服务验收输出的部署 Notebook。
- [`requirements.txt`](./requirements.txt) & [`.env.example`](./.env.example)：共享依赖清单与无密钥模板。

```bash
# 1. ASR 服务静默探针（401 + /health + /ready）
python3 infra/colab/healthcheck.py --env-file .cuex-runtime/.env.phase3.local --verify-auth

# 2. JEV-27B System 1 鉴权 + 校准等价性 + 同卡并发压测（401 + noul/score/choice + 并发 ASR）
python3 infra/colab/healthcheck_jev.py --env-file .cuex-runtime/.env.phase3.local --verify-auth --concurrent-runs 12

# 3. Notebook 端到端重跑（在 Colab VM 上执行）
jupyter nbconvert --to notebook --execute --inplace --ExecutePreprocessor.timeout=180 /opt/cuex-asr/cuex-asr-deployment.ipynb
```
