# CueX Next — Phase 3 Final Verification & QA Test Report

> **Branch**: `refactor/universal-runtime-presentation` (branched from `main` commit `96cd742523d5b0fea5aafdb65944d421938a0a43`)  
> **Commits**: `e2cb6370a8df68f77440d6d0a09adaf4fa98d66f` (Phase 1 refactor), `6804f5a2788f809f3c8f466c612cdf1f5e65bfb4` (track unified `deliverables/cuex-final` & root ZIP), `7ad6ccb1caf4d8c6743bc0c22a3dcd981c719d04` (Phase 2 suite)  
> **Verification Timestamp (UTC)**: `2026-11-16T00:05:30Z` (Local CST `2026-11-16 08:05+08:00`)  
> **Verifier**: `qa-verifier` (Independent Phase 5 QA Gate, post-all-edits, `silentValidationOnly: true`)

---

## 1. Executive Summary

| Gate | Status | Result Summary |
| --- | --- | --- |
| **Branch Safety** | **PASS** | `git branch --show-current` -> `refactor/universal-runtime-presentation` (`main` untouched at `96cd742`) |
| **Frozen Lockfile Install** | **PASS** | `pnpm install --frozen-lockfile` — exit `0`, `Scope: all 4 workspace projects`, `Lockfile is up to date` (`394ms`, `pnpm v9.15.9`) |
| **Workspace Typecheck** | **PASS** | `pnpm typecheck` (`packages/protocol`, `apps/server`, `apps/web`) — exit `0`, `0` errors |
| **Web Production Build** | **PASS** | `pnpm build` (`tsc && vite build`, scoped `/fonts` + `/brand` assets) — exit `0`, `1678` modules transformed in `947ms` |
| **Protocol Contract Tests (`v2.1.0`)** | **PASS** | `pnpm --filter @cuex/protocol test` — exit `0`, `13/13` passed, `0` failed, `0` skipped (`128.25ms`) |
| **Server Offline Test Suite** | **PASS** | `CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test` — exit `0`, `34/34` passed across `12` files, `0` failed, `0` skipped (`748.06ms`) |
| **Web Unit Tests (`Vitest`)** | **PASS** | `pnpm --filter @cuex/web test` — exit `0`, `10/10` passed across `2` files, `0` failed, `0` skipped (`123ms`) |
| **Playwright Silent E2E (`--mute-audio`)** | **PASS** | `CUEX_TEST_OFFLINE=1 node --test apps/web/test/presentation-e2e.test.mjs` — exit `0`, `1/1` passed (`4944.42ms` test / `5202.57ms` total), `0` errors |
| **Presentation Offline Eval** | **PASS** | `pnpm --filter @cuex/server eval` — exit `0`, `6/6` passed (`2026-11-15T23:53:22.971Z`, `avg 0.88ms`, `p50 0.66ms`, `p95 1.66ms`, `V=+3`, `0` LLM tokens) |
| **SQLite Backup/Restore Self-Test** | **PASS** | `node scripts/db-backup-restore.mjs --self-test` — exit `0`, checksum `009276f575db76cb212366c5359c1e6936ea8f8936360e6beac0335490f6545e` |
| **Live Colab GPU ASR Health & Auth** | **PASS** | `python3 infra/colab/healthcheck.py --env-file .cuex-runtime/.env.phase3.local --verify-auth` — exit `0` (`unauth: 401`, `health/ready: 200`, `SenseVoiceSmall`, RTX PRO 6000) |
| **Live CPA Sanity & Benchmark** | **PASS** | Live `gemini-4-hydrogen` sanity ping (`ok: true`, `3054ms`, `101` tokens); `cpa-llm-report.v2` (`18/18` pos + `3` neg + `6` mock isolated; S1 `6/6` vs `4/6`) |
| **Live Full-Stack E2E (Sec 5.2)** | **PASS** | `real-e2e-validation.v2`: `14/14` Section 5.2 scenarios + `14/14` Colab batch WAVs (`52.57ms` avg / `0.00327` RTF / `notLiveHumanRoomRecording: true`) |
| **6-Viewport UI & A11y QA** | **PASS** | `42/42` viewport checks (`1440..360` + `480px`/`520px`: `0` overflow/clipping/`<11px`), `9/9` ARIA landmarks, `prefers-reduced-motion`, `HomeView` lint `0 FAIL / 0 WARN` |
| **Metrics & Deliverables Sync** | **PASS** | `npm --prefix ppt run verify:sync` — exit `0`, `ok: true`, `scannedFiles: 45`, `0` errors, `0` warnings; `9` PDFs match strict page counts |
| **Legacy Domain & Public-Data Scans** | **PASS** | `check-legacy-domain.mjs` & `check-public-data.mjs` (`--staged` + working tree) — exit `0`, `0` findings; `generate-sbom.mjs` (`workspaces=5`, `components=751`, `artifacts=151`) |
| **Dependency Audit** | **DISCLOSED** | `pnpm audit --audit-level=high` exits `0`; `pnpm audit` exits `1` (`1 low` transitive advisory `diff@8.0.2` / `GHSA-73rr-hh4g-fpgx`) |
| **Real-User Cohort Pilot (Cat 6)** | **PLANNED** | Zero live room microphone cohorts or paid revenue orders conducted yet (`Round 1: 20-30 -> Round 2: 30-50` planned) |

---

## 2. Category 1 & Category 5 Engineering Build, Unit, Eval & Browser Results

### 2.1 Lockfile, Typecheck & Scoped Production Build
- **`pnpm install --frozen-lockfile`** (exit code `0`, `394ms`, `pnpm v9.15.9`): `Scope: all 4 workspace projects`, `Lockfile is up to date`.
- **`pnpm typecheck`** (exit code `0`): `packages/protocol` (`843ms`), `apps/web` (`921ms`), `apps/server` (`1.3s`) — `0` errors.
- **`pnpm build`** (exit code `0`, `947ms`, `1678 modules transformed`): scoped `cuexScopedPublicAssets()` emits `/fonts/*.ttf` & `/brand/*` (`dist/assets/index-CQC4VBVK.css` `31.14 kB`, `dist/assets/index-fAC-7k0x.js` `460.47 kB`), excluding unrelated archival images.

### 2.2 Workspace Unit & Integration Suites
- **Protocol (`pnpm --filter @cuex/protocol test`, exit code `0`, `128.25ms`)**: **`13 / 13` passed, `0` failed, `0` skipped** across `4` files (`schemas-and-examples`, `v1-to-v2-compatibility`, `validation`, `versions-and-envelope`), covering `v2.1.0` `ColabAsrLifecycleState`, `'colab_gpu'`, `LlmSubsystemHealthStatus`, and `'provider_unreported'` / `reasoningTokens`.
- **Server (`CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test`, exit code `0`, `748.06ms`)**: **`34 / 34` passed, `0` failed, `0` skipped** across `12` suites (`api-contract`, `colab-asr-provider`, `cpa-provider`, `gateway-ws-e2e`, `memory-and-reflection`, `presentation-doc-compiler`, `reliability-and-quota`, `retrieval-and-providers`, `runtime-controller`, `scenario-conformance`, `security-and-isolation`, `storage-migration-backup`).
- **Web (`pnpm --filter @cuex/web test`, exit code `0`, `123ms`)**: **`10 / 10` passed, `0` failed, `0` skipped** across `2` files (`web-helpers.test.ts`: `7`, `presentation-reducer.test.ts`: `3`).
- **SQLite Backup Self-Test (`node scripts/db-backup-restore.mjs --self-test`, exit code `0`)**: `{"selfTest":"passed","checksum":"009276f575db76cb212366c5359c1e6936ea8f8936360e6beac0335490f6545e","counts":{"sample_items":1}}`.

### 2.3 Silent Playwright Browser E2E & Visual/A11y Audit
- **`CUEX_TEST_OFFLINE=1 node --test apps/web/test/presentation-e2e.test.mjs`** (exit code `0`, `4944.42ms` test / `5202.57ms` total, `--mute-audio` enforced): **`1 / 1` passed**, verifying User A/B isolation, `.md` compile & `locked` facts, `StageView` `Focus`/`Split-Strip`/`Inspector`, `Reflection` (`V = H - λI`), `Pro ¥59.00` sandbox checkout, `Team` disabled, User B `Live` mode start, export, wipe (`DataDeletionReceipt`), and responsive `1280×800`, `1920×1080`, and `420×900` zero overflow.
- **UI Design & A11y Audit (`docs/design/FRONTEND_QA_REPORT.md`)**: `42/42` viewport/layout inspections across `1440×900`, `1280×800`, `1024×768`, `768×1024`, `390×844`, `360×800` + `480px`/`520px` sidecars (`0` horizontal overflow, `0` clipped header controls, `0` `<11px` nodes, `0` console/page errors); `9/9` ARIA landmarks & `<h1>`; keyboard shortcuts (`Space`/`M`/`H`/`Esc`); `prefers-reduced-motion: reduce` (`0.001s` & card visible); `HomeView.tsx` `lint.mjs` `0 FAIL, 0 WARN`.

### 2.4 Offline Deterministic Presentation Eval (`eval-presentation.ts`)
- Command: `pnpm --filter @cuex/server eval` (`generatedAt: "2026-11-15T23:53:22.971Z"`, `local_rule_zero`):
  - **`6 / 6` passed (`passRate: 1`)**, `precision = 1`, `falseInterventionRate = 0`, `withdrawalAccuracy = 1`, `totalNetUtilityV = 3` (`λ = 2`), `avgLatencyMs = 0.88`, `p50LatencyMs = 0.66`, `p95LatencyMs = 1.66`, `localRuleEvaluations = 13`, `totalTokens = 0`, `costFen = 0`.
  - Per-case latencies: `case_1: 1.66ms`, `case_2: 0.77ms`, `case_3: 1.44ms`, `case_4: 0.41ms`, `case_5: 0.37ms`, `case_6: 0.66ms`.

---

## 3. Categories 2, 3 & 4: Real Colab GPU ASR, Unified CPA LLM & Full-Stack E2E

All Phase 3 live checks enforced `silentValidationOnly: true`, `zeroSpeakerOutputConfirmed: true`, and `zeroRawAudioDiskRetentionConfirmed: true`:

1. **Live Colab GPU ASR Verification (`healthcheck.py` + `colab-asr-report.json`)**:
   - Post-final health probe (`python3 infra/colab/healthcheck.py --env-file .cuex-runtime/.env.phase3.local --verify-auth`): exit `0`, `unauthStatus: 401`, `healthStatus: 200`, `readyStatus: 200`, `lifecycleState: "ready"`, `model: "FunAudioLLM/SenseVoiceSmall"`, `gpu: "NVIDIA RTX PRO 6000 Blackwell Server Edition"`, `cudaVersion: "13.0"`, `vramUsedMiB: 2425.6 / 97250.1`, `uptimeSec: 7155.79`.
   - 14-clip TTS+DSP corpus (`225.344 s` audio, `notLiveHumanRoomRecording: true`): **`14 / 14` pass**, `52.57 ms` avg server infer (`89.59 ms` P95), **`0.00327` RTF**, `0.0867` mean clip CER (`clip_04` numbers/proper nouns `CER = 0.0` batch / `0.0143` streaming); WSS first partial `772.1 ms`; mid-stream WSS drop/reconnect recovered cleanly (`wsUpgradesObserved: 2`).
2. **Live CPA LLM Sanity & Acceptance Matrix (`cpa-llm-report.json`, `cpa-llm-report.v2`)**:
   - Live sanity ping (`CpaClient.completeJson`, `tier: "system1"`): `ok: true`, `model: "gemini-4-hydrogen"`, `endpoint: "responses"`, `latencyMs: 3054`, `101` tokens (`49` in, `52` out incl. `43` reasoning, `usageReported: true`).
   - Head-to-head S1 benchmark (`6` identical utterances): `gemini-4-hydrogen` (`reasoningEffort: "low"`) **`6/6 (100%)`** (`p50: 4162ms`, `p95: 5309ms`) vs `gemini-3.5-flash-lite` **`4/6 (66.67%)`** (`p50: 1511ms`).
   - Canonical `gemini-4-hydrogen` pipeline (`12` calls): **`15,399` `provider_reported` tokens** (`5,904` input, `9,495` output incl. `7,126` reasoning, `costFen: 0`); live streaming SSE, long ContextPack (`23` facts -> `ev_3/15/16`), invalid model `400`, `254ms` timeout -> `local_rule_zero`, `62ms` abort, and **`6/6` isolated `mockContractMatrix`** fault contracts (`401/403`, `429` retry, `503` circuit-breaker, malformed non-JSON, `staleContextVersion` + idempotency, `'provider_unreported'`) all passed.
3. **Live Full-Stack E2E (`real-e2e-validation.json`, `real-e2e-validation.v2`)**:
   - **`14 / 14` Section 5.2 scenarios passed** with zero fake billing or fabricated numbers (`compileCheck` `21` facts/`6` Q&A cards, isolated `14`-clip streaming sessions, `chapter_changed`, `13,000 ms` `candidate_expired`, mid-stream Colab WS drop/reconnect, `80 ms` CPA timeout honest `local_rule_zero` / `missing_evidence_notice`, `user_dismissed` + `silentShownCount: 0`, `clip_14` `4,351` tokens + `400/201/200/200` sovereignty checks + unreachable Colab `unavailable`).

---

## 4. Deliverables Sync, Hygiene, Audit, SBOM, PDFs & Packaging

- **Public Evidence Host Sanitization**: Redacted the raw dev CPA gateway host (`cpa:<redacted-host>`) across public submission files [`deliverables/cuex-final/mandatory/ai-employee-demo/evidence/cpa-llm-report.json`](../../deliverables/cuex-final/mandatory/ai-employee-demo/evidence/cpa-llm-report.json) (`32` replacements) and [`real-e2e-validation.json`](../../deliverables/cuex-final/mandatory/ai-employee-demo/evidence/real-e2e-validation.json) (`8` replacements), validated clean JSON and matched `token-usage-proof.png` & `colab-asr-report.json`.
- **Deliverables Sync & PDF Checks (`npm --prefix ppt run verify:sync`)**: Exit `0` (`ok: true`, `scannedFiles: 45`, `0` errors, `0` warnings). Strict `pdf-lib` checks pass on all `9` PDFs (`mandatory/CueX-Business-Model-Canvas.pdf`: `2`p `841.92×594.96`; `mandatory/CueX-AI-Employee-Job-Specification.pdf`: `1`p `594.96×841.92`; `CueX-BP.pdf` & `CueX-Business-Plan.pdf`: `8`p `1440×810`; `business/CueX-AI-Employee-Job-Spec.pdf`: `1`p `594.96×840`; `business/CueX-Business-Model-Canvas.pdf`: `1`p `841.92×594`; `business/CueX-Unit-Economics.pdf`: `1`p `841.92×594`; `business/CueX-BMC-and-Unit-Economics.pdf`: `2`p `841.92×594`; `business/CueX-Competitive-Analysis.pdf`: `2`p `841.92×594.96`).
- **SBOM (`node scripts/generate-sbom.mjs`)**: [`deliverables/cuex-final/sbom-and-checksums.json`](../../deliverables/cuex-final/sbom-and-checksums.json) (`workspaces=5`, `components=751`, `artifacts=151`).
- **Legacy Guard & Public-Data Checks (`check-legacy-domain.mjs`, `check-public-data.mjs`)**: Exit `0` (`0` findings across working tree & `--staged` Git index; `0` `.DS_Store`, `.cuex-runtime/`, `.taste-skill/`, `*.pem`, or personal local home paths).
- **Dependency Audit**: `pnpm audit --audit-level=high` exits `0`; `pnpm audit` exits `1` (`1 low` transitive advisory in `apps/server > diff@8.0.2`, `GHSA-73rr-hh4g-fpgx`, patched `>=8.0.3`, transparently disclosed).
- **ZIP & Checksum Manifest**: Built [`deliverables/cuex-final/verification/SHA256SUMS.txt`](../../deliverables/cuex-final/verification/SHA256SUMS.txt) (`shasum -a 256 -c` verified) and packaged clean non-self-referential archive at `deliverables/cuex-final/CueX-Universal-Presentation-Final.zip` & tracked [`CueX-Universal-Presentation-Final.zip`](../../CueX-Universal-Presentation-Final.zip) (`unzip -t` verified).

---

## 5. Mandatory Verification Summary (14 Questions)

1. **原有工程是什么状态？** — `[已验证]`  
   基线提交 `96cd742`（`2026-11-16 01:08:45 +0800`）是面向旧单领域角色扮演的训练原型，包含旧角色记忆目录、3D 头像与角色回复控制器，缺少根 `README.md` 与通用认知内核、SQLite 持久化及演讲业务（详见 [BASELINE.md](./BASELINE.md) 与 [PHASE2_AUDIT.md](./PHASE2_AUDIT.md)）。
2. **清理了哪些旧业务？** — `[已实现 / 已验证]`  
   Phase 1 清除全部旧单领域角色扮演协议、服务端角色代理与测试、前端 3D 头像/旧 HUD 与 `assets/models/` `.glb` 资产；Phase 2 按 `ADR-004` 彻底移除已退役语音合成模块及冗余 `three` 依赖；`check-legacy-domain.mjs` 与 `--staged` 均返回 `0` 命中。
3. **哪些模块被保留？** — `[已实现 / 已验证]`  
   保留并适配浏览器 16 kHz PCM16LE 采集（`AudioCapture.ts`、`pcm-capture.worklet.js`）、Sherpa 本地/远端流式 ASR 传输层、`LlamaSystemOne` 客户端、`redact()`/`numbersIn()`、`check-public-data.mjs` 与品牌字体视觉资产。
4. **哪些模块被重写与新建？** — `[已实现 / 已验证]`  
   `@cuex/protocol` 演进至 `v2.1.0`（`EventEnvelope`、`MoneyAmount`、14 错误码、运行时 `validate*`、`ColabAsrLifecycleState`、`colab_gpu`、`provider_unreported`）；服务端新建 `CpaProviderAdapter`、`ColabAsrProvider`、`storage/` (`node:sqlite` + WAL + `db-backup-restore.mjs`)、`security/`、`observability/`、`pipeline/`、`commercial/`；前端基于 `The printed annual / Achromatic ledger` 全面重构 `HomeView`/`CompilerView`/`StageView`/`ReflectionView`/`AccountPanel`/`Navbar`；并补全 `.github/workflows/ci.yml`、`scripts/{check-legacy-domain,generate-sbom}.mjs`、`infra/colab/**` 及全套 API/设计/工程/验证/商业文档。
5. **Universal Runtime 实现了什么？** — `[已实现 / 已验证]`  
   实现了与具体场景 `0` 耦合的通用认知运行时（`ContextStore`、`EventBus`、`SharedCognitiveStateStore`、`LexicalBm25RetrievalProvider`、`InterventionController`、`MemoryStore`、`PipelineTracker`、`ProviderResilience`），由 `SqliteRepository` 提供多租户与跨重启持久化，并通过 `reanchorCandidateLifetime` 兼容慢速真实推理 TTL。
6. **Presentation 实际实现了什么？** — `[已实现 / 已验证]`  
   完整实现了唯一 `status: 'implemented'` 的 `CueX Presentation`：安全加固文档抽取与不可覆盖 `locked` 事实编译、`Focus`/`Split Strip`/`Inspector` 临场双视（实时展示 `colab_gpu` 7 态、降级诚实披露、CPA 用量来源）、`V = H - λI` 复盘与弱项单点重练，以及多用户隔离、账本配额与可保留账单审计日志的 `/wipe` 擦除回执。
7. **System 1 / System 2 如何协作？** — `[已实现 / 已验证]`  
   `EventBus` 驱动快速感知分流（`interim` 仅轻量更新字幕与本地自愈撤回，避免无效远程阻塞），必要时经 `PromptGuard`、`Evidence[]` 检索与 `ProviderResilience` 保护调用 `CpaProviderAdapter`（统一 `/v1/responses` + `/v1/chat/completions`，`gemini-4-hydrogen` S1 `6/6` + S2 实证生成），超限/断网时诚实退回 `local_rule_zero` 并返回 `missing_evidence_notice`。
8. **Controller 如何决定提示与撤回？** — `[已实现 / 已验证]`  
   `InterventionController` 作为 System 2 上屏唯一门控，执行静音/停顿、版本一致、TTL（异步 S2 完成后重锚起点）、证据绑定与未核验数字拦截、`L0–L3` 上限、驳回抑制与冷却仲裁，并在 7 类 `WithdrawalReason` 下自动撤回，重连仅重放未过期活跃事件。
9. **端到端流程是否真正跑通？** — `[已实现 / 已验证]`  
   是。离线 `gateway-ws-e2e` 与 `--mute-audio` Playwright E2E（含 `User B` Live 模式与 `1280/1920/420` 视口）全通；**真实 Colab RTX PRO 6000 `SenseVoiceSmall` + 统一 CPA `gemini-4-hydrogen` 全栈网关**也已真实跑通 Section 5.2 **14/14** 场景与 14 条 WAV 流式接入（披露 `notLiveHumanRoomRecording: true`）。
10. **测试通过率如何？** — `[已验证]`  
    最终重跑全绿：`frozen-lockfile` / `typecheck` / `build` exit `0`；`@cuex/protocol` **13/13**；`@cuex/server` **34/34**；`@cuex/web` Vitest **10/10**；Playwright `--mute-audio` E2E **1/1**；离线 `eval` **6/6**；`db-backup-restore --self-test` 通过；Colab 活体 `healthcheck.py --verify-auth` 通过（`401/200/200`）；CPA `gemini-4-hydrogen` 活体校验通过（`18/18` + `3` 负向 + `6/6` Mock 隔离 + 实机 ping `ok`）；实时全栈 E2E **14/14**；6 视口 UI/A11y 检查 **42/42 + 9/9**；`verify:sync` **45/45**；`pnpm audit --audit-level=high` exit `0`（低危 `diff@8.0.2` 已披露）。
11. **目前还有哪些缺陷与边界？** — `[已验证 / 诚实边界]`  
    (1) **Cat 6 真人会议室实测尚未开展**（14 段测试音频为离线神经 TTS+DSP 可控语料，零真人付费订单）；(2) 实时商业收单处于 `PaymentProviderAdapter` 沙盒门控（`liveCheckoutAvailable: false`）；(3) 扫描版/纯图片 PDF 仅返回 `unreadable` 提示而不调用 OCR；(4) `social`/`teaching`/`sales`/`custom` 保持 `roadmap` 占位；(5) `apps/server > diff@8.0.2` 存在 `1` 项上游传递低危告警（`GHSA-73rr-hh4g-fpgx`）。
12. **哪些商业指标是真实数据，哪些只是预测？** — `[已验证]`  
    - **真实本地实测（`Cat 1`）**：`eval` `6/6`、`precision=1`、`falseInterventionRate=0`、`withdrawalAccuracy=1`、`V=+3`、`0.88ms` avg / `0.66ms` P50 / `1.66ms` P95、`0` Token、`13` 次规则。
    - **真实 GPU ASR & CPA 遥测（`Cat 3/4`）**：Colab `SenseVoiceSmall` 14 片段均耗时 `52.57ms`（RTF `0.00327`、数字 `clip_04` CER `0.0`）；CPA `gemini-4-hydrogen` S1 `6/6`、主链 12 步实耗 `15,399` Tokens（`7,126` 推理，`costFen: 0`）、14/14 E2E 通过。
    - **商业建模与假设（`[云端公开费率]` / `[模型估算]` / `[商业假设]`）**：Base 单场 `¥0.098` LLM / `¥0.612` 全变动成本、Pro `¥59/mo` 直接贡献 `83.8%`（`85` 场/月上限）及敏感性 `#12` 按实测 `46,357` Token 全按 S2 高价校准后的 `¥0.259` LLM / `¥0.772` 全成本 / **`Pro 80.2%`**（`66` 场/月）、`companyBreakeven = UNMODELED`、微信/支付宝 `0.6%` 与退款率均属模型与商业假设，尚无真实收费流水。
13. **BP 与商业材料是否与当前代码一致？** — `[已验证]`  
    一致。`npm --prefix ppt run verify:sync` 核验 `45` 个核心文件（含 `cuex-final-metrics.json`、`docs/business/*`、`ppt/`、`deliverables/cuex-final/**` 与 `9` 份 PDF），`errors: []`、`warnings: []`；`verification.json` 与 `SHA256SUMS.txt` 已校验。
14. **最终交付物在哪里？** — `[已实现 / 已验证]`  
    - 统一交付目录：[`deliverables/cuex-final/`](../../deliverables/cuex-final/README.md)（含 `mandatory/{business-model-canvas,ai-employee-job-spec,ai-employee-demo}/`、`business/`、`pitch/`、`demo/`、`assets/`、`evidence/`、`previews/`、`verification/{verification.json,test-report.md,SHA256SUMS.txt}`、`sbom-and-checksums.json`）
    - 干净交付压缩包：`deliverables/cuex-final/CueX-Universal-Presentation-Final.zip` 与仓库根目录已跟踪 [`CueX-Universal-Presentation-Final.zip`](../../CueX-Universal-Presentation-Final.zip)（均经 `unzip -t` 校验、无自包含/密钥/临时文件）
    - 架构、真值、设计与验证文档：`docs/{ARCHITECTURE,PRODUCT_TRUTH_TABLE}.md`、`docs/phase3/*`、`docs/design/*`、`docs/engineering/*`、`infra/colab/*`
