# CueX Windows TTS

User-authorized deployment target: Windows 11, RTX 5080 16 GB, Ryzen 7 9800X3D, approximately 48 GB system memory. The private SSH bundle is kept outside this repository. Never add it, its private key, or a private SSH config to source control or the submission ZIP.

The selected model is [Ming-3.0-tts-0.5b](https://github.com/inclusionAI/Ming-3.0-tts). The model's reference requirements use PyTorch 2.6. This target needs a CUDA 12.8 build supporting Blackwell, so the dedicated environment uses PyTorch/torchaudio 2.8.0 and validates real CUDA inference. [PyTorch's Blackwell release guidance](https://pytorch.org/blog/pytorch-2-7/).

Deployment root: `E:\CueX-TTS`. No existing model environment, account, SSH key, firewall rule or boot autostart is changed. The service binds only `127.0.0.1:18666`; the Mac connects through an SSH exec bridge because this host disallows TCP forwarding. The bridge only accepts fixed `/health` and `/tts` operations; speech text is sent as JSON on stdin.

## Runtime contract

- `GET /health`: model, GPU, sample rate and readiness.
- `POST /tts`: JSON `{"text":"...","voice":"speaker"}` returns a complete PCM WAV. `voice` also accepts `narrator`.
- Official built-in voices: 灵楷 for the primary `speaker` voice, 灵小柔 for `narrator`. No real person's voice is cloned.
- Synthesis is serialized for one shared model. Disconnected queued requests are skipped; already-running GPU work may finish, but its audio is discarded after disconnect.
- Chinese FST normalization is disabled because the optional native pynini dependency is unavailable in the chosen Windows environment. CueX samples and narration are saved for audition; do not equate timing/decoding checks with subjective voice-quality assessment.

Configuration for optional remote TTS tooling:

```sh
CUEX_TTS_BACKEND=http
CUEX_TTS_URL=http://127.0.0.1:18766/tts
CUEX_TTS_FALLBACK=none
```

`none` requires speech synthesis to come from this machine when remote TTS is enabled; an unavailable remote service reports an error instead of silently falling back to another network provider. Automatic fallback requires an explicit `CUEX_TTS_FALLBACK=auto`.

Service source: `serve_ming.py`. Manual background startup: `start-ming.ps1`. Model and virtual-environment files remain on the Windows machine; only reproducible source/configuration belongs in this repo.

## Start and connect

The isolated environment is `.venv`, the source checkout is `Ming-3.0-tts` at `9332fb9443325d4726ce02cefd4ec1c211df4079`, and weights are in `models/Ming-3.0-tts-0.5b`. Install torch/torchaudio 2.8.0 from the CUDA 12.8 index, then `requirements-ming.txt`. The model is available from the official ModelScope inclusionAI repository.

On Windows, run `E:\CueX-TTS\start-ming.ps1`. It uses a WMI-owned background process, survives SSH logout and waits for model warmup. It does not install boot autostart. After a reboot, start it again.

On the Mac, keep the supplied private key, pinned known_hosts and SSH config outside the repository. Set `CUEX_TTS_SSH_CONFIG` to select a config explicitly. Otherwise, the launcher uses `~/.ssh/cuex-rtx-tts/ssh-config` when present, then `~/.ssh/rtx-home/ssh-config`. The config must define `rtx-home` and pin its host key. No keys or configs are copied. Run `pnpm tts:connect` for a standalone bridge, or `pnpm demo:remote-tts` for the remote-TTS launcher (`pnpm demo` starts the standard local CueX Presentation stack). The bridge listens only at `127.0.0.1:18766` and uses a private, owned SSH multiplex socket.

## Historical baseline validation (2026-11-01)

- CUDA BF16 computation and actual model synthesis passed on RTX 5080, torch 2.8.0+cu128. Output: 44.1 kHz mono PCM16 WAV.
- Warm primary speaker sample: 3.3 s audio, 3.208 s GPU synthesis, 4.522 s end-to-end including SSH connection startup.
- Warm narration sample: 2.4 s audio, 2.205 s synthesis, 2.723 s end-to-end. These are two samples, not a latency percentile or concurrency benchmark.
- The first GPU warmup after process startup took about 19 s. Health becomes ready only afterwards.
- `node --test scripts/tts-startup.test.mjs` verifies the pinned SSH bridge launcher config resolution and health probing offline.
