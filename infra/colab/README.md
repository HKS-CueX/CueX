# CueX Colab Real GPU ASR Infrastructure (`infra/colab`)

Google Colab G4 GPU deployment for **Workstream A (Real-Time Streaming & Batch GPU ASR ONLY)**.

> **Scope Boundary**: Colab hosts **GPU speech recognition (`FunAudioLLM/SenseVoiceSmall` + `fsmn-vad`, or fallback Whisper) ONLY**. All LLM reasoning (System 1 / System 2), ContextStore, EventBus, and InterventionController logic run on the CueX runtime server, never on Colab.

## 1. Verified Colab Runtime Environment

Verified directly against active Colab G4 session `cuex-asr`:

| Component | Verified Value |
| :--- | :--- |
| **GPU** | `NVIDIA RTX PRO 6000 Blackwell Server Edition` (`sm_120`, compute capability `(12, 0)`) |
| **VRAM** | `97887 MiB` total (`97250.1 MiB` CUDA `mem_get_info` total) |
| **CUDA / Driver** | Driver `580.82.07`, CUDA `13.0` (`nvcc V13.0.88`) |
| **OS / Arch / Python** | `Linux 6.6.159+ x86_64`, `Python 3.13.16` |
| **Core Stack** | `torch 2.14.1+cu130`, `torchaudio 2.11.0+cu130`, `funasr 1.4.26`, `modelscope 1.40.3`, `fastapi 0.141.1`, `uvicorn 0.54.0`, `websockets 15.0.1`, `cryptography 50.0.2` |

---

## 2. Dual-Model Benchmark & Model Selection

Both candidate ASR models were benchmarked end-to-end on the actual Colab `NVIDIA RTX PRO 6000 Blackwell Server Edition` GPU across CueX's 14-clip Mandarin & mixed-English corpus (`225.344s` total audio, 16 kHz mono PCM16LE; see `deliverables/cuex-final/mandatory/ai-employee-demo/demo-pack/audio/manifest.json`).

> **Corpus Transparency Note**: Audio clips in `demo-pack/audio/` were synthesized offline via macOS neural voices (`Tingting`, `Meijia`, `Rocko`) followed by DSP transforms (fast pace, pauses/fillers, `-16 dB` quiet gain, `+9 dB` soft-clipping, moderate room noise, and speaker interruptions). They provide deterministic acoustic stress-testing and are distinct from live human microphone capture.

### Benchmark Results (All 14 Clips, CUDA 13.0)

| Metric | `iic/SenseVoiceSmall` + `fsmn-vad` (**Selected Default**) | `openai/whisper-large-v3-turbo` (`fp16` PyTorch SDPA) | Delta (SenseVoice vs Whisper) |
| :--- | :---: | :---: | :--- |
| **Framework** | `FunASR 1.4.26` (CUDA PyTorch) | HuggingFace `transformers` SDPA (`fp16`) | Native CUDA 13.0 on both |
| **Warm Model Load** | `0.999 s` (`4.584 s` cold server start) | `0.835 s` | Comparable (~1 s cached) |
| **Warmup (1 s silence)** | `780.41 ms` (`56.23 ms` in-server) | `1107.35 ms` | **-29.5% faster warmup** |
| **1.5 s First-Segment Latency** | **`27.18 ms`** | `29.19 ms` | Faster first segment |
| **Avg Final Latency (14 clips)** | **`51.77 ms`** (`52.57 ms` live HTTP E2E server infer) | `149.37 ms` | **2.88x faster** |
| **P95 Final Latency** | **`69.24 ms`** (`89.59 ms` live HTTP E2E server infer) | `205.50 ms` | **2.97x faster** |
| **Overall RTF** | **`0.00322`** (~310x real-time) | `0.00928` (~108x real-time) | **2.88x lower RTF** |
| **Mean Clip CER / Overall CER** | `0.0881` / `0.1014` (`0.0867` live HTTP) | `0.0836` / `0.0904` | +0.45 pp mean CER (domain English terms) |
| **GPU VRAM (Process / Torch Peak)** | **`1650 MiB` / `1084.7 MiB`** | `2448 MiB` / `1621.1 MiB` | **32.6% less VRAM** |
| **Built-in Streaming Endpointing** | Native `fsmn-vad` + acoustic RMS hangover | Requires external VAD | Lower pipeline complexity |

### Benchmark Technical Caveat & Decision Rationale

1. **`ctranslate2` / `faster-whisper` Compatibility Note on CUDA 13.0**: While `faster-whisper 1.2.1` + `ctranslate2 4.9.0` were installed and tested, invoking CUDA inference failed on Colab's CUDA 13.0 runtime with `RuntimeError: Library libcublas.so.12 is not found or cannot be loaded`. Rather than mutating or downgrading the runtime CUDA toolkit, we benchmarked `openai/whisper-large-v3-turbo` directly in `float16` via PyTorch SDPA (`transformers`), and integrated that SDPA fallback directly into `start_asr.py`.
2. **Why `FunAudioLLM/SenseVoiceSmall` + `fsmn-vad` Won**:
   - **Sub-60 ms streaming responsiveness**: Live WSS partials consistently execute in **`26–62 ms`** on the RTX PRO 6000, enabling System 1 cue gating well inside CueX's latency budget.
   - **Stronger Mandarin robustness on edge acoustics**: On fast speech (`02_pain_point_fast`: `0.0580` vs `0.0725`), pauses/fillers (`03_pauses_fillers`: `0.0541` vs `0.0946`), loud mic clipping (`07_loud_mic_gain`: `0.0217` vs `0.0652`), interruptions (`09_speaker_interruption_qa`: `0.0508` vs `0.0678`), and continuous multi-turn speech (`14_long_multiturn_continuous`: `0.1145` vs `0.1374`), SenseVoiceSmall achieved **lower CER** than Whisper-large-v3-turbo.
   - **Deterministic domain phonetic drift**: Most SenseVoice CER errors occur on English brand/architecture terms (`CueX` -> `QX`, `PPT` -> `TTT`, `Evidence` -> `Avidness`), which CueX already handles cleanly downstream via its domain correction table (`apps/server/src/voice/corrections.ts`).

---

## 3. Network, FRP Tunnel, TLS & Security Model

Traffic reaches the Colab runtime through FRP `0.71.1` over TLS-protected loopback endpoints without exposing any plaintext HTTP/WS listener:

1. **Loopback Binding Only**: `start_asr.py` listens on `127.0.0.1:10086` inside the Colab VM, while `sshd` listens on `127.0.0.1:2222`.
2. **FRP Port Mapping (`frpc 0.71.1`)**:
   - `<frp-public-host>:10080` (TCP) -> `127.0.0.1:2222` (SSH, `StrictHostKeyChecking=yes` + pre-verified host key fingerprint)
   - `<frp-public-host>:10086` (TCP & UDP) -> `127.0.0.1:10086` (Authenticated HTTPS + WSS ASR endpoint)
   - `<frp-public-host>:10010` (TCP & UDP) -> `127.0.0.1:10010` (Reserved auxiliary tunnel, echo-verified)
3. **Ephemeral Self-Signed TLS Pinning**:
   - `start_asr.py` generates an RSA-2048 self-signed X.509 certificate in `/tmp/cuex-asr-tls/{cert,key}.pem` with SubjectAltName entries `IP:127.0.0.1, IP:<frp-public-host>, DNS:localhost`.
   - Only the **public certificate** (`cert.pem`) is copied to gitignored `.cuex-runtime/colab-asr-cert.pem`; the private key remains strictly inside Colab `/tmp/cuex-asr-tls/key.pem` (`0600`).
4. **Mandatory Bearer Authentication**:
   - Every HTTP request and WebSocket handshake passes through `BearerAuthAsgiMiddleware` using constant-time `hmac.compare_digest` against a 32-byte random `COLAB_ASR_API_KEY`.
   - Missing or invalid tokens are rejected with HTTP **`401 UNAUTHORIZED`** before reaching FastAPI or completing a WebSocket upgrade.
5. **Zero Audio Disk Retention & Payload Guardrails**:
   - Batch uploads (`MAX_UPLOAD_BYTES=15 MiB`, `MAX_AUDIO_SEC=180 s`, `INFER_TIMEOUT_SEC=30 s`) and WebSocket streams decode WAV/PCM16LE frames strictly in memory (`io.BytesIO` / `bytearray`) and zero/clear buffers after inference.

---

## 4. API Contract (For `@runtime-server` Integration)

Base URL (replace placeholder with runtime FRP host from `.cuex-runtime/.env.phase3.local`):
- **HTTPS**: `https://203.0.113.10:10086`
- **WSS**: `wss://203.0.113.10:10086/v1/asr/stream`
- **Required Header**: `Authorization: Bearer <COLAB_ASR_API_KEY>`
- **TLS Trust**: Pin `.cuex-runtime/colab-asr-cert.pem` (`ca` option in Node `https`/`ws`, `SSLContext(cafile=...)` in Python).

### `GET /health` and `GET /ready`

- **`GET /health`** -> `200 OK` (or `401` if unauthorized):
  ```json
  {
    "status": "ok",
    "ready": true,
    "lifecycleState": "ready",
    "backend": "colab-gpu-asr",
    "model": "FunAudioLLM/SenseVoiceSmall",
    "gpu": {
      "available": true,
      "name": "NVIDIA RTX PRO 6000 Blackwell Server Edition",
      "cudaVersion": "13.0",
      "vramAllocatedMiB": 972.3,
      "vramReservedMiB": 1030.0,
      "vramUsedMiB": 2425.6,
      "vramTotalMiB": 97250.1
    },
    "loadTimeSec": 4.584,
    "warmupLatencyMs": 56.23,
    "uptimeSec": 136.16,
    "metrics": {
      "totalRequests": 104,
      "totalStreamSessions": 8,
      "totalAudioSec": 1119.412,
      "avgRtf": 0.00414
    },
    "timestamp": "2026-11-15T22:08:28.507676Z"
  }
  ```
- **`GET /ready`** -> `200 OK` (`{"ready": true, "lifecycleState": "ready", ...}`) once warmed up, or `503 Service Unavailable` (`lifecycleState: "starting"` / `"unavailable"`) during boot/failure.
- `lifecycleState` values align directly with `@cuex/protocol` `ColabAsrLifecycleState` (`starting`, `ready`, `degraded`, `unavailable`).

### `POST /v1/asr/transcribe` (Batch HTTPS Inference)

Supports three upload modes (max `15 MiB`, max `180 s`):
1. `multipart/form-data` with field `file` (or `audio`) and optional `language` (`auto`, `zh`, `en`), `sample_rate`.
2. `Content-Type: audio/wav` (raw RIFF/WAVE PCM16 mono/stereo, auto-resampled to 16 kHz mono).
3. `Content-Type: audio/pcm` (raw PCM16LE; pass `?sample_rate=16000&language=auto`).

**Success (`200 OK`)**:
```json
{
  "ok": true,
  "text": "在单位经济模型里，pro版本定价59元...",
  "language": "zh",
  "segments": [{ "startMs": 0, "endMs": 18307, "text": "..." }],
  "audioDurationMs": 18307,
  "latencyMs": 56.75,
  "rtf": 0.0031,
  "model": "FunAudioLLM/SenseVoiceSmall",
  "gpu": "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "timestamp": "2026-11-15T22:08:10.123456Z"
}
```

**Error Codes**:
- `401`: `UNAUTHORIZED` (missing/bad Bearer token)
- `400`: `VALIDATION_ERROR` (invalid WAV/PCM payload or audio > 180 s)
- `413`: `PAYLOAD_TOO_LARGE` (> 15 MiB)
- `503`: `ASR_UNAVAILABLE` (model still starting)
- `504`: `PROVIDER_TIMEOUT` (> 30 s inference timeout)

### `WSS /v1/asr/stream` (Real-Time Streaming PCM16LE 16 kHz Mono)

- **Audio Input**: Send binary frames of **16 kHz, 16-bit signed little-endian mono PCM** (`pcm_s16le`, `32 bytes/ms`, e.g., `100 ms = 3200 bytes` per frame). Optional query string `?language=auto`.
- **Client JSON Control Frames**:
  - `{"type": "config", "language": "auto", "partialIntervalMs": 450, "endpointSilenceMs": 650}`
  - `{"type": "ping", "ts": 1730000000000}` -> replies with `{"type": "pong", "ts": ..., "timestamp": ...}`
  - `{"type": "flush"}` -> commits active buffered utterance as `final`
  - `{"type": "end"}` or literal text `"Done"` -> flushes final segment, emits `done`, closes cleanly (`1000`)
- **Server JSON Events**:
  - `ready`: `{ "type": "ready", "protocol": "cuex-colab-asr-v1", "model": "...", "gpu": "...", "sampleRate": 16000, "encoding": "pcm_s16le", "channels": 1, "timestamp": "..." }`
  - `partial`: `{ "type": "partial", "segment": 0, "text": "...", "language": "zh", "startMs": 0, "endMs": 1200, "audioDurationMs": 1200, "latencyMs": 30.37, "rtf": 0.02531, "timestamp": "..." }`
  - `final`: `{ "type": "final", "segment": 0, "text": "...", "language": "zh", "startMs": 0, "endMs": 3200, "audioDurationMs": 3200, "latencyMs": 43.21, "rtf": 0.00355, "reason": "vad_endpoint|max_utterance|client_flush|stream_end", "timestamp": "..." }`
  - `ping` / `pong`: Keepalive heartbeat every `15 s` + protocol ping/pong.
  - `done`: Stream end acknowledgement before close `1000`.
  - `error`: `{ "type": "error", "code": "ASR_UNAVAILABLE|PROVIDER_TIMEOUT", "message": "..." }`.

---

## 5. Files & Verification Commands

- [`start_asr.py`](./start_asr.py): Authenticated HTTPS + WSS ASR server (`FastAPI` + `Uvicorn` + self-signed SAN TLS + zero disk audio retention).
- [`healthcheck.py`](./healthcheck.py): TLS-pinned health/readiness and `401` rejection probe.
- [`cuex-asr-deployment.ipynb`](./cuex-asr-deployment.ipynb): Executed reproducible Colab deployment & loopback verification notebook.
- [`requirements.txt`](./requirements.txt): Python ASR + API dependencies (preserves Colab CUDA 13 PyTorch).
- [`.env.example`](./.env.example): Secret-free configuration template.

### Quick Verification (Silent — Zero Audio Playback)

```bash
# 1. Verify 401 unauthorized rejection + authenticated /health & /ready over TLS
python3 infra/colab/healthcheck.py --env-file .cuex-runtime/.env.phase3.local --verify-auth

# 2. Notebook verification on Colab VM (runs non-conflicting ephemeral port loopback check)
jupyter nbconvert --to notebook --execute --inplace --ExecutePreprocessor.timeout=180 /opt/cuex-asr/cuex-asr-deployment.ipynb
```

Latest full live acceptance telemetry (all 14 clips + WSS streaming + mid-stream reconnect recovery + `401` checks) is recorded in [`deliverables/cuex-final/mandatory/ai-employee-demo/evidence/colab-asr-report.json`](../../deliverables/cuex-final/mandatory/ai-employee-demo/evidence/colab-asr-report.json).
