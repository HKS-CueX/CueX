# CueX Phase 3 Real-World Validation Report (Colab GPU ASR + CPA LLM + Full E2E + UI QA)

> **Validation Scope**: Google Colab G4 Real GPU ASR (`infra/colab/`) + Live Unified CPA LLM Gateway (`apps/server/src/runtime/providers/CpaProviderAdapter.ts`) + Live `CueXGatewayServer` HTTP/WS/SQLite E2E (`apps/server/scripts/validate-real-e2e.ts`) + Phase 3 Web UI Visual/Accessibility QA (`apps/web/`, `docs/design/FRONTEND_QA_REPORT.md`).  
> **Strict Honesty & Hygiene Boundaries**:
> 1. All **6 evaluation categories** remain strictly separated below (`deterministic unit`, `provider contract`, `real CPA LLM`, `real Colab ASR`, `browser E2E`, and `real-user observation = planned / not yet conducted`).
> 2. **Zero machine speaker playback occurred** anywhere (`silentValidationOnly: true`, `zeroSpeakerOutputConfirmed: true`, Chromium `--mute-audio`).
> 3. **Corpus Provenance (`notLiveHumanRoomRecording: true`)**: The 14-clip WAV validation corpus uses offline macOS neural TTS voices + DSP transforms — deterministic acoustic stress testing, **distinct from live human-room microphone trials**.
> 4. Zero API keys, bearer tokens, private keys, `$HOME` literal filesystem paths, or raw external host IPs appear anywhere in this report (`scripts/check-public-data.mjs` clean).

---

## 1. Strict 6-Category Evaluation Taxonomy (No Mixed Denominators)

| # | Evaluation Category | Authority Artifact / Command | Execution Mode & Provider Attribution | Headline Verified Result |
| :---: | --- | --- | --- | --- |
| **1** | **Deterministic Unit & Offline Eval** | `CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test`<br>`pnpm --filter @cuex/protocol test`<br>`pnpm --filter @cuex/web test`<br>`CUEX_SYSTEM1=fake CUEX_SYSTEM2=fake CUEX_ASR=fake pnpm --filter @cuex/server eval` (`.cuex-runtime/eval-latest.json`, `2026-11-15T21:09:07.360Z`) | Fully offline, deterministic clock & rules (`usageSource: 'local_rule_zero'`, `0` tokens, `costFen: 0`) | Server unit/controller/storage/security **`34/34` pass** (`0` fail, `0` skipped, `757.11 ms`); Web Vitest **`10/10` pass**; Offline 6-case Presentation eval **`6/6` pass** (`100%` precision, `0%` false intervention, `100%` withdrawal accuracy, `0.76 ms` avg / `1.63 ms` P95, `13` rule evals, `V = +3`). |
| **2** | **Provider Contract & Fault Simulation** | `cpa-llm-report.json` -> `mockContractMatrix` (`isolatedFromLiveTelemetry: true`); `qa-a11y-resilience.mjs` UI fault checks (`FRONTEND_QA_REPORT.md §5`) | Local mock HTTP server / Playwright route mocks (explicitly isolated from live CPA telemetry) | **6/6 backend resilience contracts PASS**: `401`/`403` fast-fail + secret redaction, `429` retry recovery, `503` circuit-breaker (`4` attempts -> `local_rule_zero`), malformed `200` non-JSON guard, `stale_context_version` + duplicate suppression, `'provider_unreported'` (`0/0` tokens); UI `503` & degraded disclosure verified. |
| **3** | **Real CPA LLM** | [`cpa-llm-report.json`](../../deliverables/cuex-final/mandatory/ai-employee-demo/evidence/cpa-llm-report.json) (`schemaVersion: cpa-llm-report.v2`, `2026-11-15T23:29:37.171Z`) via `validate-cpa-live.ts` | Live external HTTPS calls to `cpa:gpt.kanglives.top` (`/v1/responses` auto-negotiation; `usageSource: 'provider_reported'`) | **`18/18` positive live checks PASS** (`+ 3` intentional negative `400`/timeout/abort guards = `21` total calls). Head-to-head S1 benchmark: **`gemini-4-hydrogen` (`reasoningEffort: "low"`) `6/6` (`100%`)** vs `gemini-3.5-flash-lite` `4/6` (`66.67%`). Canonical `gemini-4-hydrogen` pipeline (`12` calls): **`15,399` total tokens (`7,126` reasoning)**. |
| **4** | **Real Colab GPU ASR + Live Gateway E2E** | [`colab-asr-report.json`](../../deliverables/cuex-final/mandatory/ai-employee-demo/evidence/colab-asr-report.json) (`2026-11-15T22:08:28.644Z`) & [`real-e2e-validation.json`](../../deliverables/cuex-final/mandatory/ai-employee-demo/evidence/real-e2e-validation.json) (`schemaVersion: real-e2e-validation.v2`, `2026-11-15T23:27:42.641Z`) | Live Google Colab G4 GPU (`NVIDIA RTX PRO 6000 Blackwell Server Edition`) over pinned TLS+Bearer FRP `:10086` + live CPA `gemini-4-hydrogen` + live `CueXGatewayServer` & SQLite (`silentValidationOnly: true`) | **Direct ASR**: `FunAudioLLM/SenseVoiceSmall` + `fsmn-vad` **`14/14` clips (`225.344 s`)**, `52.57 ms` avg / `89.59 ms` P95 infer, **`0.00327` RTF**, `0.0867` mean clip CER, `401` auth, WSS drop recovery. **Gateway E2E**: **`14/14` Section 5.2 scenarios PASS** (`compileCheck`, 14 streaming clips, `V = H - λI` reflection, `400/201/200/200` sovereignty, `13,000 ms` TTL expiry, mid-stream Colab WS drop/reconnect, `80 ms` CPA timeout honest `local_rule_zero`, `unavailable` Colab fallback). |
| **5** | **Browser E2E, Visual Layout & A11y** | `CUEX_TEST_OFFLINE=1 node --test apps/web/test/presentation-e2e.test.mjs` + `FRONTEND_QA_REPORT.md` (`capture-after.mjs`, `qa-a11y-resilience.mjs`, `lint.mjs`, `impeccable detect`) | Built Vite SPA + live `CueXGatewayServer` in offline Chromium (`--mute-audio`, zero external ASR/LLM charges) | **Playwright E2E `1/1` pass (`5,105.30 ms`)**. **42/42 layout checks across 6 viewports** (`1440..360` + `480px`/`520px` sidecars) = `0` overflow / `0` header clipping / `0` `<11px` nodes / `0` console errors; **`9/9` ARIA landmarks & inputs**, keyboard shortcuts (`Space/M/H/Esc`), `prefers-reduced-motion: reduce` (`0.001s`). |
| **6** | **Real-User Observation** | `docs/business/CUSTOMER_VALIDATION.md` (planned cohorts) | Live human room microphones & multi-user longitudinal studies | **PLANNED / NOT YET CONDUCTED** — zero live human speaker trials, paying revenue, or `Round 1 (20–30) -> Round 2 (30–50)` observational `V` calibration datasets exist yet. |

**Reproducible Silent Commands (Zero Audio Playback)**:
```bash
# Category 1 & 5: Offline CI tests & silent Playwright E2E (zero external keys required)
CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test
CUEX_SYSTEM1=fake CUEX_SYSTEM2=fake CUEX_ASR=fake pnpm --filter @cuex/server eval
CUEX_TEST_OFFLINE=1 node --test apps/web/test/presentation-e2e.test.mjs

# Category 3 & 4: Live Colab ASR & Live CPA + Gateway E2E (requires gitignored .cuex-runtime/.env.phase3.local)
python3 infra/colab/healthcheck.py --env-file .cuex-runtime/.env.phase3.local --verify-auth
CPA_DEV_MODELS_LOADER=1 pnpm --filter @cuex/server exec tsx scripts/validate-cpa-live.ts
CPA_DEV_MODELS_LOADER=1 pnpm --filter @cuex/server exec tsx scripts/validate-real-e2e.ts
```

---

## 2. Corpus & Silent Validation Provenance Disclosure

1. **Test Audio Corpus (`deliverables/cuex-final/mandatory/ai-employee-demo/demo-pack/audio/`)**:
   - **14 16 kHz / 16-bit mono PCM16LE WAV clips** totaling **`225.344 s`** (`manifest.json`, `demo-pack/README.md`).
   - Generated offline via macOS neural Chinese speech voices (`say -v Tingting`, `Meijia`, `Rocko`) converted with `ffmpeg` (`16000 Hz`, mono, `pcm_s16le`), followed by controlled acoustic DSP transforms (`185–245 wpm` pace shifts, `1.2 s` filler pauses, `-16 dB` quiet gain, `+9 dB` soft clipping, `14–18 dB` SNR meeting-room pink noise, dual-speaker Q&A interruptions, omissions, and off-topic drift).
   - **Realism Boundary (`notLiveHumanRoomRecording: true`)**: Repeatable acoustic and semantic stress harness, explicitly separate from real-room live human microphones planned for post-hackathon seed user pilots.
2. **Zero-Speaker Silent Execution & Privacy**:
   - All runs executed purely from local WAV files and TLS buffers (`silentValidationOnly: true`, `zeroSpeakerOutputConfirmed: true`, `zeroRawAudioDiskRetentionConfirmed: true` — zero raw WAV/PCM audio written to Colab disk).

---

## 3. Workstream A: Google Colab G4 Real GPU ASR (`colab_gpu`)

### 3.1 Verified Environment & Security Controls (`colab-asr-report.json`)
- **GPU Hardware**: `NVIDIA RTX PRO 6000 Blackwell Server Edition` (`97,250.1 MiB` CUDA usable / `97,887 MiB` total VRAM, `sm_120`, Driver `580.82.07`, CUDA `13.0`, Python `3.13.16`, `torch 2.14.1+cu130`).
- **Network & Auth**: Tunneled via `frpc 0.71.1` from Colab loopback `127.0.0.1:10086` behind pinned self-signed SAN TLS (`.cuex-runtime/colab-asr-cert.pem`) + constant-time `Authorization: Bearer <COLAB_ASR_API_KEY>`.
- **Mandatory Auth Checks (`colab-asr-report.json`)**:
  - `GET /health`: missing token -> **`401`**, bad token -> **`401`** (confirmed again during E2E `unauthorizedHealthStatus: 401`).
  - `POST /v1/asr/transcribe` missing token -> **`401`**.
  - `WSS /v1/asr/stream`: missing token -> **`401`**, bad token -> **`401`**.

### 3.2 Two-Model GPU Benchmark (`infra/colab/README.md`)
Benchmarked across all 14 corpus clips (`225.344 s` audio) directly on the Colab Blackwell GPU:

| Metric | `FunAudioLLM/SenseVoiceSmall` + `fsmn-vad` **(Winner)** | `openai/whisper-large-v3-turbo` (`fp16` SDPA) | Delta / Observation |
| --- | :---: | :---: | --- |
| **Warm Load / Warmup** | `0.999 s` (`4.584 s` cold) / `780.41 ms` | `0.835 s` / `1,107.35 ms` | `-29.5%` faster warmup |
| **1.5 s First-Segment Latency** | **`27.18 ms`** | `29.19 ms` | Both sub-30 ms |
| **Avg Final Latency (14 clips)** | **`51.77 ms`** (`52.57 ms` live HTTP E2E) | `149.37 ms` | **2.88x faster** |
| **P95 Final Latency (14 clips)** | **`69.24 ms`** (`89.59 ms` live HTTP E2E) | `205.50 ms` | **2.97x faster** |
| **Overall RTF** | **`0.00322`** (`0.00327` live HTTP E2E) | `0.00928` | ~306–310x real-time |
| **Mean Clip CER / Overall CER** | `0.0881` (`0.0867` live HTTP) / `0.1014` | `0.0836` / `0.0904` | Slightly higher CER on English terms |
| **VRAM (Process / Torch Peak)** | **`1,650 MiB`** / `1,084.7 MiB` | `2,448 MiB` / `1,621.1 MiB` | **32.6% lower VRAM** |

*Compatibility Note*: `ctranslate2 4.9.0` (`faster-whisper`) failed on Colab CUDA 13.0 (`RuntimeError: libcublas.so.12 not found`); `whisper-large-v3-turbo` was therefore benchmarked cleanly in `fp16` via HuggingFace `transformers` PyTorch SDPA (`start_asr.py` retains this fallback).

### 3.3 Batch, Streaming WSS, Flush & Reconnect Results (`colab-asr-report.json` + `real-e2e-validation.json`)
- **Batch HTTP (`14/14` clips in `colab-asr-report.json`)**: `avgServerInferLatencyMs: 52.57 ms`, `p95ServerInferLatencyMs: 89.59 ms`, `avgE2eRoundTripMs: 420.24 ms` (includes FRP WAN TLS upload/RTT), `overallRtf: 0.00327`, `meanClipCer: 0.0867`.
  - Exact numeric pricing anchor (`clip_04_numbers_proper_nouns`): **`CER = 0.0`**.
  - Edge acoustic resilience: `clip_02_pain_point_fast` (`0.058`), `clip_03_pauses_fillers` (`0.0541`), `clip_06_quiet_mic_gain` (`0.0172`), `clip_07_loud_mic_gain` (`0.0217`), `clip_08_moderate_room_noise` (`0.0377`), `clip_11_topic_drift` (`0.0196`).
  - Bilingual English-term CER (`clip_05_architecture_bilingual` `0.2397`, `clip_12_qa_defense_bilingual` `0.2687`) reflects phonetic acronym drift (`CueX -> QX/gueX`, `API -> ATI`, `PPT -> TTT`, `GPU -> GTU`).
- **Colab Direct E2E Checks (`real-e2e-validation.json` `colabDirectChecks`)**:
  - `initialProbe`: `lifecycleState: "ready"`, `mode: "colab_gpu"`, `rtf: 0.004`.
  - `liveStreamFlushCheck`: `ColabAsrStream.flush()` (`{"type":"flush"}`) passed (`finalsAfterFirstFlush: 2`, `totalFinals: 4`).
  - `14/14` direct batch clips: `40.66 ms`–`88.01 ms` infer latency, RTF `0.00274`–`0.00397`, exact `0` CER on `clip_04`.
- **Direct WSS Streaming & Drop Recovery (`colab-asr-report.json`)**:
  - `clip_14` (`32.17 s`): `firstPartialFromAudioStartMs: 772.1 ms`, `firstFinalFromAudioStartMs: 6,659.9 ms`, `19` partials (`26.66–61.59 ms`), `2` finals, `pongReceived: true`, `CER: 0.1145`.
  - `reconnectRecoveryTest`: forced drop after `35` chunks (`1` partial pre-drop), immediate reconnect recovered with `firstPartialFromAudioStartMs: 762.71 ms`, `8` partials, `1` final (`50.26 ms`, `CER: 0.2687`).

---

## 4. Workstream B: Unified CPA LLM Gateway (`cpa-llm-report.json` v2)

All LLM tiers route strictly through `CpaProviderAdapter` (`cpa:gpt.kanglives.top`, `/v1/responses` auto-negotiation):
- **Default Production Config Verified**: `system1: gemini-4-hydrogen` (`reasoningEffort: "low"`), `system2 / compiler / reflection: gemini-4-hydrogen`.
- **Run Totals Across Benchmark + Live Matrix (`21` requests)**: `18` successes, `3` intentional negative checks (`invalidModelId` HTTP `400`, `254 ms` timeout degradation, `62 ms` explicit abort), `timeoutCount: 1`, `retryCount: 1`, `inputTokens: 9,034`, `outputTokens: 10,277`, `reasoningTokens: 7,126`, `p50LatencyMs: 2,040 ms`, `p95LatencyMs: 8,203 ms`.

### 4.1 Head-to-Head System 1 Live Benchmark (`6` Identical Utterances)

| Model | `reasoningEffort` | Accuracy | P50 / P95 / Avg Latency | Tokens (`In / Out / Reasoning`) | Outcome Breakdown |
| --- | :---: | :---: | :---: | :---: | --- |
| **`gemini-4-hydrogen`** *(Selected Default)* | `"low"` | **`6 / 6` (`100%`)** | `4,162 / 5,309 / 3,741 ms` | `3,236 / 1,584 / 1,110` | **All 6 passed**: `introGreetingQuiet` (`2,040 ms`, `fluent/L0`), `fluentQuiet` (`1,893 ms`, `fluent/L0`), `omissionTrigger` (`4,717 ms`, `omitting_key_point/L1`), `recoveryWithdraw` (`4,162 ms`, `recovering/withdraw_active/L0`), `pauseWithoutGapQuiet` (`4,325 ms`, `fluent/L0`), `qaDetect` (`5,309 ms`, `answering_question/L2`). |
| `gemini-3.5-flash-lite` *(Optional Fast Override)* | `provider_default` | `4 / 6` (`66.67%`) | `1,511 / 1,638 / 1,521 ms` | `3,130 / 782 / 0` | Failed **`omissionTrigger`** (`drifting` instead of `omitting_key_point`) and **`qaDetect`** (under-classified `trigger_l1 / L1` instead of `trigger_l2 / L2`). |

### 4.2 Canonical `gemini-4-hydrogen` Pipeline Telemetry (`aggregatedTelemetry`, `sess_cpa_live_validation`)

| Tier / Subsystem | Calls | Latency (ms) | Tokens (`In / Out / Reasoning`) | Verified Assertion (`usageSource: 'provider_reported'`, `degraded: false`) |
| --- | :---: | :---: | :---: | --- |
| **System 1 (`S1`)** | `6` | Avg `3,741` (Total `22,446`) | `3,236` / `1,584` (`1,110`) | `6/6` accurate state, pause suppression, omission, Q&A trigger, and recovery withdrawal |
| **System 2 (`S2`)** | `4` | Avg `6,528` (Total `26,111`) | `1,616` / `4,460` (`3,942`) | Includes `groundedQa` (`7,168 ms`, `ev_sample_7` `V = H - λI`), `ungroundedQaGap` (`5,470 ms`, `missing_evidence_notice`), `streamingCompletion` (`firstTokenLatencyMs: 5,195 ms`, `totalLatencyMs: 5,270 ms`, `2` SSE chunks, `/responses`, `744` tokens `usageReported: true`), `longContextPack` (`8,203 ms`, `5` chapters / `23` facts -> `ev_3, ev_15, ev_16`). |
| **Compiler** | `1` | `13,367` | `750` / `2,179` (`894`) | `compiledBy: 'llm_compiler'`, `23` facts + `6` Q&A cards (`locked: true` preserved) |
| **Reflection** | `1` | `6,509` | `302` / `1,272` (`1,180`) | `utilityPreserved: true` (`V = H - λI`, `V = 0` untouched) |
| **Canonical Session Total** | **`12`** | Avg `5,703` / P95 `13,367` | **`5,904` / `9,495` (`7,126`) = `15,399`** | `retries: 0`, `localRuleEvaluations: 0`, `costFen: 0` (CPA proxy reports tokens without billing rates) |

### 4.3 Live Fault Guards & Isolated Mock Contract Matrix (`cpa-llm-report.json`)
- **Live Fault Guards (`liveMatrixChecks`)**:
  - `invalidModelId`: rejected cleanly with `[PROVIDER_UNAVAILABLE] CPA HTTP 400: unknown provider for model cuex-nonexistent-model-validation-404`.
  - `timeoutAndAbort`: forced short timeout degraded in `254 ms` (`degraded: true`, `usageSource: 'local_rule_zero'`, `missing_evidence_notice`); explicit abort aborted cleanly in `62 ms` (`Explicit caller abort signal`).
- **Mock Contract Matrix (`mockContractMatrix`, `isolatedFromLiveTelemetry: true`)**:
  - `auth401And403`: `attempts401: 1`, `attempts403: 1`, `secretRedacted: true`, `failFastNoRetry: true`.
  - `rateLimit429Retry`: `attempts: 2`, `retries: 1`, `recovered: true`.
  - `upstream503CircuitAndFallback`: `attemptsObserved: 4`, `circuitOpened: true`, `fallbackUsageSource: 'local_rule_zero'`, `fallbackDegraded: true`.
  - `malformedResponse`: explicit error `[PROVIDER_UNAVAILABLE] CPA HTTP 200 non-JSON response`.
  - `staleContextVersionAndIdempotency`: `stale_context_version` + `firstShowAction: 'show_l2_keyword'` + `duplicateSuppressionAction: 'stay_silent'`.
  - `providerUnreportedAttribution`: verified `usageSource: 'provider_unreported'`, `inputTokens: 0`, `outputTokens: 0` when response omits usage metadata.

---

## 5. End-to-End Integrated Gateway & All 14 Section 5.2 Scenarios (`real-e2e-validation.json` v2)

Executed silent end-to-end against a live `CueXGatewayServer` (`CUEX_ASR=real`, `CUEX_SYSTEM1=real`, `CUEX_SYSTEM2=real`) + SQLite storage + live Colab G4 `SenseVoiceSmall` WSS + live CPA `gemini-4-hydrogen` (`validatedAt: 2026-11-15T23:27:42.641Z`):

- **`GET /health`**: `asr` (`colab_gpu`, `lifecycleState: 'ready'`, `available: true`, `streaming: true`, `gpuName: 'NVIDIA RTX PRO 6000 Blackwell Server Edition'`, `modelId: 'FunAudioLLM/SenseVoiceSmall'`, `rtf: 0.00398`, `fallbackActive: false`), `system1` & `system2` (`gemini-4-hydrogen`, `mode: 'real'`, `healthy: true`, `degraded: false`).
- **CPA Pack Compile (`compileCheck`)**: `packId: 'pack_1794784801309'`, `compiledBy: 'llm_compiler'`, `factsCount: 21`, `qaCardsCount: 6`.
- **Isolated `14/14` Streaming Sessions + Long Session (`clip_14`)**:
  - `clip_14_long_multiturn_continuous` (`32.17 s` -> `asrDurationMs: 33,670 ms`, `5` partials, `sess_d8c868009800`): `longSessionTelemetry` = `3` model calls (`2` S1 avg `4,234 ms` + `1` Reflection `10,469 ms`), **`1,677` input + `2,674` output (`2,417` reasoning) = `4,351` total `provider_reported` tokens**; `longSessionReflectionSummary`: `coverageRatio: 0.2`, `missedPointsCount: 12`, `suppressedCount: 1`, `V = 0`.
  - `sovereigntyChecks`: unconfirmed `POST /api/memory` -> **`400`**, confirmed -> **`201`**, `GET /api/account/export` -> **`200`**, `DELETE`/wipe -> **`200`** (`wipeReceiptId: del_df42422e-00e7-4b41-89fd-cbab3271280b`).

| # | Section 5.2 Scenario (`scenarioMatrix`) | Outcome | Observed Quantitative & Behavioral Verification |
| :---: | --- | :---: | --- |
| **1** | `#1_opening_greeting_L0` (`clip_01`) | **PASS** | `streamingCer: 0.0746`, `3` partials, `S1: fluent/L0`, `shownInterventions: []`. |
| **2** | `#2_fast_speech_L0` (`clip_02`) | **PASS** | `streamingCer: 0.1014`, `2` partials, `S1: fluent/L0` *(note: standalone run in default `ch_1` also logged 1 `ch_1` positioning cue `[ev_9]`)*. |
| **3** | `#3_natural_pause_zero_false_trigger` (`clip_03`) | **PASS** | `streamingCer: 0.3784`, `S1: fluent/hesitating(none)/fluent/fluent -> L0`, `shown: []` (zero false trigger across 1.2s pause + fillers). |
| **4** | `#4_numbers_proper_nouns_asr` (`clip_04`) | **PASS** | `streamingCer: 0.0143` (and `0.0` batch CER) on `59元/499元/240分钟/29元/120分钟/83.8%` *(standalone `ch_1` context triggered 1 `ch_1` cue `[ev_9]`)*. |
| **5** | `#5_bilingual_architecture_asr` (`clip_05`) | **PASS** | `streamingCer: 0.1983`, `3` partials, `shownInterventions: []`. |
| **6** | `#6_quiet_loud_noise_robustness` (`clip_06/07/08`) | **PASS** | Streaming CERs: `quietCer: 0.0345`, `loudCer: 0.0652`, `roomNoiseCer: 0.1509` (batch CERs: `0.0172 / 0.0217 / 0.0377`). |
| **7** | `#7_live_qa_grounded_and_ungrounded` (`clip_09` + gap) | **PASS** | `clip_09` grounded L2 cue citing `ev_5` (`14天120分钟` quota cap); ungrounded gap returned honest `missing_evidence_notice` (`grounded: false`). |
| **8** | `#8_chapter_change_stale_withdrawal` | **PASS** | Chapter transition immediately withdrew stale cue with `reason: 'chapter_changed'`. |
| **9** | `#9_candidate_ttl_expiry` | **PASS** | Deterministic `ManualClock +13,000 ms` triggered `withdrawalReason: 'candidate_expired'`. |
| **10** | `#10_mid_session_colab_disconnect_reconnect` | **PASS** | Mid-stream WS drop (`simulatedMidStreamDropTriggered: true`), `wsUpgradesObserved: 2`, recovered final transcript verified (`restartingStateObserved: false` at `60 ms` reconnect probe). |
| **11** | `#11_cpa_timeout_honest_degraded_zero_hallucination` | **PASS** | Forced `80 ms` CPA timeout fell back cleanly (`degraded: true`, `usageSource: 'local_rule_zero'`, `missing_evidence_notice`, `fabricatedNumbers: false`). |
| **12** | `#12_omission_and_drift_self_recovery_withdraw` (`clip_10/11`) | **PASS** | `clip_10` omission L1 cue `[ev_4, ev_5, ev_6]` -> `user_recovered`; `clip_11` drift L2 cue `[ev_9]` -> `user_recovered` *(audio + injected recovery utterance gave combined `streamingCer: 0.9118 / 1.1569` vs audio-only truth)*. |
| **13** | `#13_manual_help_dismiss_and_silent_mode` | **PASS** | Manual help -> `dismissReason: 'user_dismissed'`; toggling silent mode kept `silentShownCount: 0`. |
| **14** | `#14_long_multiturn_reflection_and_sovereignty` (`clip_14`) | **PASS** | `partialCount: 5`, `longSessionTelemetry` (`4,351` tokens), `sovereignty: 400/201/200/200`, unreachable Colab probe -> `lifecycleState: 'unavailable', available: false, fallbackActive: true`. |

---

## 6. Frontend Redesign, 6-Viewport Layout & Accessibility QA (`FRONTEND_QA_REPORT.md`)

All web verification checks ran strictly after the final edits to `apps/web/src/**` under headless `--mute-audio` contexts ([`docs/design/FRONTEND_QA_REPORT.md`](../design/FRONTEND_QA_REPORT.md)):

1. **Build, Unit & E2E Regressions**:
   - `pnpm --filter @cuex/web typecheck`: Exit **`0`**.
   - `pnpm --filter @cuex/web test`: Exit **`0`**, **`10/10` pass** (`web-helpers.test.ts` `7/7`, `presentation-reducer.test.ts` `3/3`).
   - `pnpm --filter @cuex/web build`: Exit **`0`** (`dist/assets/index-*.js` `460.47 kB` / gzip `137.18 kB`, `index-*.css` `31.14 kB` / gzip `6.94 kB`; `vite.config.ts` scopes static serving strictly to `/fonts/` and `/brand/`).
   - `CUEX_TEST_OFFLINE=1 node --test apps/web/test/presentation-e2e.test.mjs`: Exit **`0`**, **`1/1` pass** (`5,105.30 ms`, `0` skipped) covering `Home -> Compiler -> Stage (Focus/Split-Strip/Inspector) -> Reflection -> AccountPanel`.
2. **6-Viewport Matrix (`capture-after.mjs`: `1440×900`, `1280×800`, `1024×768`, `768×1024`, `390×844`, `360×800`) + Sidecars**:
   - **`42/42` UI views**: **`0` horizontal overflow**, **`0` header clipping**, **`0` `< 11px` text nodes** (down from `24` on Home / `39` on Inspector pre-redesign), **`0` broken images**, **`0` console/page errors**.
   - Narrow presenter sidecar checks (`480×800` Focus, `520×900` Split-Strip): `0px` horizontal overflow.
3. **Accessibility, WCAG AA Contrast, Reduced Motion & Fault States (`qa-a11y-resilience.mjs`)**:
   - **`9/9` state checks**: valid `<header>/<nav>/<main>/<footer>`, unique `<h1>` (`h1Count: 1`), `inputsWithoutName: []`.
   - **Keyboard & Reduced Motion**: `Tab`/`Esc`, Radix `Tabs` `ArrowRight`, `Stage` shortcuts (`M`, `Space`, `H`, `Escape`), and `@media (prefers-reduced-motion: reduce)` (`haloAnimationDuration: "0.001s"`, `cardVisible: true`, `cardOpacity: "1"`) all verified.
   - **WCAG 2.1 AA Contrast**: `#FFFFFF` on `--amber-ink #A84B07` upgraded from `2.90:1` to **`5.72:1`**, placeholders (`--ink-3 #626774`) **`>= 5.28:1`** on `#F8F7F3` / `>= 4.91:1` on muted ground.
   - **Design Auditors**: `design-taste-frontend lint.mjs` (`HomeView.tsx` **`0 FAIL, 0 WARN`**; 8 `--app` views **`0 FAIL, 87 WARN`** from intentional `font-mono` timestamps/IDs + 2 Lucide `Unlock` symbol matches); `impeccable detect` static & live URL scans (`1280×800`, `390×844`) reported **`0` script/contrast/nested-card/numbered-label/overflow errors** (retaining only documented `overused-font` and 1 `390px` `unbalanced-heading` advisory).

---

## 7. Observed Limitations & Engineering Findings

1. **Cloud Reasoning Token Latency (`gemini-4-hydrogen`)**: Even with `reasoningEffort: "low"`, `gemini-4-hydrogen` achieved `6/6` S1 accuracy (`100%`) at `1.89–5.31 s` per call (and `5.47–8.20 s` on S2, `10.47–13.37 s` on Reflection/Compiler) because `50–94%` of output tokens were `reasoningTokens`. This directly motivated `CognitiveRuntime.reanchorCandidateLifetime()` so slow S2 calls never return already-expired candidates, alongside `CognitiveRuntime`'s zero-latency local withdrawal/pause guards.
2. **Standalone Single-Clip Chapter Context (`clip_02`, `04`, `08`, `13`)**: Because those 4 isolated E2E clips were streamed individually against chapter `ch_1` (without advancing chapter pointers across a 5-chapter script), S1 accurately detected topical mismatch with `ch_1` and surfaced 1 grounded `ch_1` positioning cue `[ev_9]`.
3. **ASR Phonetic Drift on English Brand Acronyms & Flush Timing**: `SenseVoiceSmall` renders acronyms phonetically on some utterances (`CueX -> QX/gueX`, `API -> ATI`, `PPT -> TTT`), reinforcing pack-scoped `apps/server/src/voice/corrections.ts`. Additionally, on `#10` mid-stream drop recovery (`60 ms` probe interval), WS recovery completed immediately (`wsUpgradesObserved: 2`) before entering the transitional `restarting` state (`restartingStateObserved: false`).
4. **Telemetry Cost Attribution (`costFen: 0`)**: Upstream CPA responses return exact token counts without billing currency rates; CueX refuses to fabricate per-call `costFen` inside runtime telemetry, tracking `usageSource: 'provider_reported'` vs `'provider_unreported'` cleanly and isolating modeled cloud unit economics inside `docs/business/UNIT_ECONOMICS.md`.
