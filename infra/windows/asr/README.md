# Remote Windows Sherpa-ONNX Streaming ASR Service

Stock C++ streaming ASR host for live CueX Presentation microphone capture when running ASR off-device over an SSH port forward (`CUEX_ASR_URL=ws://127.0.0.1:6006`).

## Setup (Windows host)

1. Run `pwsh -File install.ps1` from `C:\cuex\asr` to download `sherpa-onnx` v2.0.1 and the streaming zipformer models (`zh` and `zh-en` X-ASR).
2. Run `pwsh -File start.ps1 -Model zh` (or `-Model xasr -Hotwords` using `hotwords.txt`) to start the detached WebSocket server on port `6006`.
3. Forward `127.0.0.1:6006` from the CueX server host if running remotely, and set `CUEX_ASR=real` plus `CUEX_ASR_URL=ws://127.0.0.1:6006`.

## Mac / In-Process Alternative

If running `CUEX_ASR=real` without `CUEX_ASR_URL`, the CueX server uses `sherpa-onnx-node` in-process with the local model downloaded by `apps/server/scripts/voice-fetch-asr-model.sh`. If neither model is available, the gateway transparently reports `text-only` capability and accepts `speech.delta` from browser Web Speech API or simulated speaker input.
