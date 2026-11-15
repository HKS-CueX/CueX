# Voice Engines

`index.ts` exports `createAsrEngine()`, `describeAsrCapability()`, `createTtsEngine()`, and `warmupVoice()`.

## ASR (Speaker speech to transcript)

| Configuration | Active Backend | Location |
| --- | --- | --- |
| `CUEX_ASR=fake` (default offline) | `text-only` (`text_simulation` / browser `speech.delta`) | Browser or text harness |
| `CUEX_ASR=real` + `CUEX_ASR_URL=ws://host:6006` | `sherpa-ws` (`RemoteSherpaAsr`) | Windows or remote host |
| `CUEX_ASR=real` + local model (`CUEX_ASR_MODEL_DIR` or `~/.cache/cuex-models/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30`) | `sherpa-local` (`LocalSherpaAsr`) | In-process `sherpa-onnx-node` |
| `CUEX_ASR=real` with neither configured | `text-only` (explicitly reports `available: false` for native PCM streaming) | Fallback to browser Web Speech or `speech.delta` |

Run `apps/server/scripts/voice-fetch-asr-model.sh` to download the local streaming transducer model.
