# CueX Phase 3 Final Verification & Test Report (`deliverables/cuex-final`)

> **Verification Timestamp**: `2026-11-16T00:05:30Z` (`2026-11-16 08:05+08:00`)  
> **Git Branch**: `refactor/universal-runtime-presentation` (`main` untouched at `96cd742523d5b0fea5aafdb65944d421938a0a43`)  
> **Audio & Corpus Disclosure**: `silentValidationOnly: true` (`--mute-audio` browser & file-to-file WAV streaming, `0` speaker playback); 14-clip Mandarin/bilingual WAV corpus (`225.344 s`) uses macOS neural TTS voices + DSP transforms (`notLiveHumanRoomRecording: true`), strictly distinct from live human-room trials.

---

## 1. Per-Suite Test & Verification Matrix (Exact Counts & Evidence Paths)

| Suite / Check | Exact Command | Total | Passed | Failed | Skipped | Skip Reason | Evidence Path |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| **Frozen Lockfile Install** | `pnpm install --frozen-lockfile` | 1 | 1 | 0 | 0 | `None` | [`docs/engineering/TEST_REPORT.md`](../../../docs/engineering/TEST_REPORT.md) |
| **Workspace Typecheck** | `pnpm typecheck` | 3 | 3 | 0 | 0 | `None` | [`docs/engineering/TEST_REPORT.md`](../../../docs/engineering/TEST_REPORT.md) |
| **Web Production Build** | `pnpm build` | 1 | 1 | 0 | 0 | `None` | [`docs/engineering/TEST_REPORT.md`](../../../docs/engineering/TEST_REPORT.md) |
| **Protocol Unit & Schema Tests** | `pnpm --filter @cuex/protocol test` | 13 | 13 | 0 | 0 | `None` | [`packages/protocol/test/`](../../../packages/protocol/test/) |
| **Server Unit & Integration Tests** | `CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test` | 34 | 34 | 0 | 0 | `None` | [`apps/server/test/`](../../../apps/server/test/) |
| **Web Unit Tests (Vitest)** | `pnpm --filter @cuex/web test` | 10 | 10 | 0 | 0 | `None` | [`apps/web/test/`](../../../apps/web/test/) |
| **Playwright Silent E2E** | `CUEX_TEST_OFFLINE=1 node --test apps/web/test/presentation-e2e.test.mjs` | 1 | 1 | 0 | 0 | `None` | [`apps/web/test/presentation-e2e.test.mjs`](../../../apps/web/test/presentation-e2e.test.mjs) |
| **Deterministic Presentation Eval** | `pnpm --filter @cuex/server eval` | 6 | 6 | 0 | 0 | `None` | [`../evidence/evaluation-results.md`](../evidence/evaluation-results.md) |
| **SQLite Backup/Restore Self-Test** | `node scripts/db-backup-restore.mjs --self-test` | 1 | 1 | 0 | 0 | `None` | [`scripts/db-backup-restore.mjs`](../../../scripts/db-backup-restore.mjs) |
| **Colab GPU ASR Live Auth & Health** | `python3 infra/colab/healthcheck.py --env-file .cuex-runtime/.env.phase3.local --verify-auth` | 1 | 1 | 0 | 0 | `None` | [`../mandatory/ai-employee-demo/evidence/colab-asr-report.json`](../mandatory/ai-employee-demo/evidence/colab-asr-report.json) |
| **Colab Batch GPU ASR Corpus** | `infra/colab` acceptance (`colab-asr-report.json`, `225.344 s` audio) | 14 | 14 | 0 | 0 | `None` | [`../mandatory/ai-employee-demo/evidence/colab-asr-report.json`](../mandatory/ai-employee-demo/evidence/colab-asr-report.json) |
| **Live CPA LLM Benchmark & Matrix** | `CPA_DEV_MODELS_LOADER=1 pnpm --filter @cuex/server exec tsx scripts/validate-cpa-live.ts` (`18` pos + `3` neg + `6` mock isolated) | 21 | 21 | 0 | 0 | `None` | [`../mandatory/ai-employee-demo/evidence/cpa-llm-report.json`](../mandatory/ai-employee-demo/evidence/cpa-llm-report.json) |
| **Live Full-Stack E2E (Sec 5.2)** | `CPA_DEV_MODELS_LOADER=1 pnpm --filter @cuex/server exec tsx scripts/validate-real-e2e.ts` | 14 | 14 | 0 | 0 | `None` | [`../mandatory/ai-employee-demo/evidence/real-e2e-validation.json`](../mandatory/ai-employee-demo/evidence/real-e2e-validation.json) |
| **6-Viewport UI & A11y Visual QA** | `capture-after.mjs` (`42` views) + `qa-a11y-resilience.mjs` (`9` landmark/a11y + reduced-motion + fault checks) | 51 | 51 | 0 | 0 | `None` | [`docs/design/FRONTEND_QA_REPORT.md`](../../../docs/design/FRONTEND_QA_REPORT.md) |
| **Deliverables Metrics & PDF Sync** | `npm --prefix ppt run verify:sync` | 47 | 47 | 0 | 0 | `None` | [`../evidence/verification.json`](../evidence/verification.json) |
| **Legacy Domain & TTS Guard** | `node scripts/check-legacy-domain.mjs` & `--staged` | 1 | 1 | 0 | 0 | `None` | [`scripts/check-legacy-domain.mjs`](../../../scripts/check-legacy-domain.mjs) |
| **Public-Data Secret/Path Guard** | `node scripts/check-public-data.mjs` & `--staged` | 1 | 1 | 0 | 0 | `None` | [`scripts/check-public-data.mjs`](../../../scripts/check-public-data.mjs) |
| **Dependency Audit (`--audit-level=high`)** | `pnpm audit --audit-level=high` (`pnpm audit` exits `1` with `1 low` transitive advisory `diff@8.0.2` / `GHSA-73rr-hh4g-fpgx`) | 1 | 1 | 0 | 0 | `None` | [`docs/engineering/TEST_REPORT.md`](../../../docs/engineering/TEST_REPORT.md) |
| **Real-User Pilot Observation (Cat 6)** | Cohort field pilot (`Round 1: 20-30`, `Round 2: 30-50`) | 0 | 0 | 0 | 0 | `Planned / post-hackathon; zero live room trials or paid orders yet` | [`docs/business/CUSTOMER_VALIDATION.md`](../../../docs/business/CUSTOMER_VALIDATION.md) |

---

## 2. Verified Key Quantitative Metrics (`Section 15`)

- **Colab GPU ASR (`FunAudioLLM/SenseVoiceSmall` + `fsmn-vad` on `NVIDIA RTX PRO 6000 Blackwell Server Edition`)**:
  - Live healthcheck (`verify-auth`): `unauthStatus: 401`, `healthStatus: 200`, `readyStatus: 200`, `lifecycleState: "ready"`, VRAM `2,425.6 / 97,250.1 MiB`, CUDA `13.0`, uptime `7,155.79s`.
  - Direct 14-clip corpus (`225.344 s` audio): `52.57 ms` avg server infer, `89.59 ms` P95, `0.00327` RTF, `0.0867` mean clip CER (`clip_04` numbers/proper nouns `CER = 0.0` batch / `0.0143` streaming); WSS first partial `772.1 ms`; mid-stream WSS drop/reconnect verified (`wsUpgradesObserved: 2`).
- **Unified CPA LLM Gateway (`cpa:<redacted-host>`, `gemini-4-hydrogen`)**:
  - Live S1 head-to-head benchmark (`6` utterances): `gemini-4-hydrogen` (`reasoningEffort: "low"`) **`6/6 (100%)`** vs `gemini-3.5-flash-lite` **`4/6 (66.67%)`**.
  - Canonical `gemini-4-hydrogen` pipeline (`12` calls): `5,904` input + `9,495` output (`7,126` reasoning) = **`15,399` `provider_reported` tokens**, `costFen: 0`. Live sanity ping verified (`ok: true`, `endpoint: "responses"`, `latencyMs: 3054`, `101` tokens).
  - Real Gateway E2E (`real-e2e-validation.v2`): **`14/14` Section 5.2 scenarios pass** (`compileCheck`, isolated `14` streaming clips, `V = H - λI`, `80 ms` CPA timeout fallback -> `local_rule_zero`, `13,000 ms` TTL expiry, `chapter_changed`, `user_dismissed`, memory/export/wipe `400/201/200/200`, unreachable Colab `unavailable`).
- **Deterministic Offline Eval (`eval-presentation.ts`)**: `6/6` pass (`precision = 1`, `falseInterventionRate = 0`, `withdrawalAccuracy = 1`, `V = +3` at `λ = 2`, `avgLatencyMs = 0.88`, `p50 = 0.66`, `p95 = 1.66`, `13` local rule evals, `0` tokens).
- **Commercial Unit Economics Alignment**: Base single-session LLM `¥0.098`, full 10-item variable cost `¥0.612`, Pro `¥59/mo` Direct Contribution `83.8%` (`SaaS 92.2%`, `85` sessions/mo cap); Calibration Sensitivity `#12` (`46,357` tokens at S2 reasoning rate) -> LLM `¥0.259`, full var `¥0.772`, Pro **`80.2%`** (`66` sessions/mo); `companyBreakeven = UNMODELED`.
- **PDF & Archive Packaging**: All `9` deliverable PDFs pass strict page counts/dimensions (`2`, `1`, `8`, `8`, `1`, `1`, `1`, `2`, `2` pages); [`verification.json`](./verification.json) & [`SHA256SUMS.txt`](./SHA256SUMS.txt) generated cleanly; `CueX-Universal-Presentation-Final.zip` verified via `unzip -t` with zero self-inclusion, `.DS_Store`, `node_modules`, or secret leaks.
