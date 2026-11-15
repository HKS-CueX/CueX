# CueX Next — P4/P6 Verification & QA Test Report

> **Branch**: `refactor/universal-runtime-presentation` (branched from `main` commit `96cd742523d5b0fea5aafdb65944d421938a0a43`)  
> **Verification Timestamp (UTC)**: `2026-11-15T18:39:38Z` (Local CST `2026-11-16 02:39+08:00`)  
> **Verifier**: `qa-verifier` (Independent QA Verification Gate, post-all-edits)

---

## 1. Executive Summary

| Gate | Status | Result Summary |
| --- | --- | --- |
| **Branch Safety** | **PASS** | `git branch --show-current` -> `refactor/universal-runtime-presentation` (`main` untouched) |
| **Workspace Typecheck** | **PASS** | `pnpm typecheck` (`packages/protocol`, `apps/server`, `apps/web`) — exit `0`, `0` errors |
| **Web Production Build** | **PASS** | `pnpm build` (`tsc && vite build`) — exit `0`, `1670` modules transformed in `1.10s` |
| **Server Offline Test Suite** | **PASS** | `CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test` — exit `0`, `13/13` passed, `0` failed, `0` skipped |
| **Web Reducer Unit Tests** | **PASS** | `pnpm --filter @cuex/web exec vitest run test/presentation-reducer.test.ts` — exit `0`, `2/2` passed |
| **TTS Startup Config Tests** | **PASS** | `node --test scripts/tts-startup.test.mjs` — exit `0`, `4/4` passed, `0` failed, `0` skipped |
| **Presentation Eval Benchmark** | **PASS** | `pnpm --filter @cuex/server eval` — exit `0`, `6/6` cases passed (`precision=1.0`, `falseInterventionRate=0.0`, `withdrawalAccuracy=1.0`, `V=+3`) |
| **Playwright Browser E2E** | **PASS** | `node --test apps/web/test/presentation-e2e.test.mjs` — exit `0`, `1/1` suite passed (`4264.84ms`), `0` console/page errors |
| **Medical Domain Purge (`rg`)** | **PASS** | `0` unexpected matches (`ZERO_MEDICAL_MATCHES`) across active code, docs, infra, brand specs, ppt, and `deliverables/cuex-final/` |
| **Deliverables & PDF Checks** | **PASS** | Legacy `deliverables/hks-2026*` archived; all 6 PDFs pass strict page counts/dimensions; all 14 PNGs visually inspected |
| **Public-Data Secret Check** | **PASS** | `node scripts/check-public-data.mjs --staged` — exit `0`, `0` findings across staged Git index |

---

## 2. Full Engineering Build & Test Results (Post-All-Edits)

### 2.1 Typecheck & Production Build
- **`pnpm typecheck`** (exit code `0`):
  - `packages/protocol`: `tsc --noEmit` (`224ms`) — `0` errors
  - `apps/server`: `tsc --noEmit` (`1s`) — `0` errors
  - `apps/web`: `tsc --noEmit` (`1s`) — `0` errors
- **`pnpm build`** (exit code `0`):
  - `apps/web`: `tsc && vite build` (`1.10s`, `1670 modules transformed`)
  - Outputs: `dist/index.html` (`0.83 kB`), `dist/assets/index-CcXCOiL0.css` (`26.67 kB`), `dist/assets/index-ClU9i2at.js` (`386.92 kB`)

### 2.2 Server Unit & Integration Tests
Command: `CUEX_TEST_OFFLINE=1 pnpm --filter @cuex/server test` (exit code `0`, duration `351.28ms`):
- `13 / 13` passed, `0` failed, `0` skipped:
  1. `CueXGatewayServer HTTP API and WebSocket /ws live presentation & rehearsal flow` (`33.27ms`)
  2. `CueXGatewayServer streams PCM16 audio.chunk frames when streaming ASR engine is active` (`2.52ms`)
  3. `MemoryStore enforces explicit userConfirmed opt-in and supports CRUD and session wipe` (`3.04ms`)
  4. `computeUtilitySummary computes V = H - λI honestly for explicit feedback, dismissals, and recovery withdrawals` (`0.13ms`)
  5. `DocumentExtractor extracts .pptx slides, speaker notes, .md, and marks unreadable .pdf honestly` (`3.10ms`)
  6. `PresentationCompiler preserves grounded facts without fabricating numbers and PresentationPackStore enforces locks` (`4.33ms`)
  7. `LexicalBm25RetrievalProvider ranks bilingual evidence accurately and returns empty on unrelated query` (`1.08ms`)
  8. `LexicalBm25RetrievalProvider supports pluggable EmbeddingScorer fusion` (`0.21ms`)
  9. `LlamaFastDecisionProvider calls generic completion API and falls back cleanly when offline` (`9.02ms`)
  10. `Controller rejects pause-only ticks without semantic gaps` (`2.83ms`)
  11. `Controller blocks ungrounded fabricated numbers and forbidden claims` (`1.54ms`)
  12. `Controller enforces TTL expiry, contextVersion mismatch, L0-L3 ceiling, and silent mode` (`0.95ms`)
  13. `Controller executes automatic withdrawal across user_recovered, context_invalidated, chapter_changed, candidate_expired, and user_dismissed suppression` (`2.02ms`)

### 2.3 Web Unit Tests, TTS Startup Tests & Playwright Browser E2E
- **`pnpm --filter @cuex/web exec vitest run test/presentation-reducer.test.ts`** (exit code `0`, `103ms`):
  - `2 / 2` tests passed (`tracks intervention.shown, optimistic local_feedback, and automatic withdrawal`, `clears transient data when session.wiped arrives`).
- **`node --test scripts/tts-startup.test.mjs`** (exit code `0`, `3330.08ms`):
  - `4 / 4` tests passed (`0` failed, `0` skipped).
- **`node --test apps/web/test/presentation-e2e.test.mjs`** (exit code `0`, `4535.17ms` total / `4264.84ms` test):
  - `1 / 1` Playwright Chromium end-to-end suite passed against live `@cuex/server` + Vite dev server (`CUEX_SYSTEM1=fake`, `CUEX_SYSTEM2=fake`, `CUEX_ASR=fake`, `CUEX_COOLDOWN_MS=250`), covering `HomeView` (live vs roadmap scenarios) -> `CompilerView` (`.md` extract, demo pack load, `FactWhitelist` edit/lock, `QACards` prediction badges, privacy consent) -> `StageView` (`Focus` & `Inspector`, `asr-capability-badge`, `L0` silent mode, fluent `L0` quiet, drift -> `focus-active-intervention`, `H` feedback, recovery -> `focus-withdrawn-banner`, ungrounded audience Q&A -> `missing-evidence-warning`, `Inspector` `ControllerDecision` logs) -> `ReflectionView` (`utility-score-card`, timeline, `MemoryInspectorPanel` create/delete, single-point rehearsal re-entry, `wipe-session-btn`), with `0` console/page errors.

---

## 3. Reproducible Benchmark Verification (`eval-presentation.ts`)

Command: `pnpm --filter @cuex/server eval` (runs `apps/server/scripts/eval-presentation.ts`, writes `.cuex-runtime/eval-latest.json` and `.cuex-runtime/eval-latest.md`, exit code `0`):

- **Latest QA Run (`generatedAt: 2026-11-15T18:39:51.567Z`)**:
  - **Mode**: `system1="local-heuristic-s1 (local_fallback)"`, `system2="local-grounded-synthesizer (local_fallback)"`
  - **Cases**: `6 / 6` passed (`passRate = 1`)
  - **Metrics**: `avgLatencyMs = 0.74 ms`, `p95LatencyMs = 1.32 ms`, `precision = 1`, `falseInterventionRate = 0`, `withdrawalAccuracy = 1`, `totalNetUtilityV = 3` (`V = H - λI (λ = 2)`)
  - **Telemetry**: `inputTokens = 0`, `outputTokens = 0`, `cachedInputTokens = 0`, `totalTokens = 0`, `modelCalls = 0`, `localRuleEvaluations = 13`, `measurementSource = "local_rule_zero"`
  - **Per-Case Breakdown**:
    - `case_1_fluent_quiet`: `PASS`, `1.31ms`, `shown=0`, `V=0`
    - `case_2_pause_suppression`: `PASS`, `0.69ms`, `shown=0`, `suppressed=1 (pause_only_without_gap)`, `V=0`
    - `case_3_drift_recovery_withdraw`: `PASS`, `1.32ms`, `shown=1`, `withdrawn=1/1 (user_recovered)`, `V=+1`
    - `case_4_grounded_qa`: `PASS`, `0.38ms`, `shown=1 (ev_sample_7)`, `V=+1`
    - `case_5_ungrounded_qa_honesty`: `PASS`, `0.29ms`, `shown=1 (grounded=false + missingEvidenceNotice)`, `V=+1`
    - `case_6_grounding_guard_and_chapter_withdraw`: `PASS`, `0.43ms`, `shown=1`, `suppressed=1 (ungrounded_evidence)`, `withdrawn=1/1 (chapter_changed)`, `V=0`

### Cross-Check vs. Business & Deliverable Docs (`UNIT_ECONOMICS.md`, `evaluation-results.md`, `CueX-BP.pdf`)
- All deterministic counts (`6 / 6`, `100.0%` precision, `0.0%` false intervention rate, `100.0%` withdrawal accuracy, `V = +3`, `0` local tokens, `13` local rule evaluations) match verbatim across `.cuex-runtime/eval-latest.json`, `docs/business/UNIT_ECONOMICS.md`, `deliverables/cuex-final/evidence/evaluation-results.md`, `deliverables/cuex-final/evidence/token-usage-proof.png`, and `CueX-BP.pdf`.
- `deliverables/cuex-final/evidence/evaluation-results.md`, `token-usage-proof.png`, `CueX-AI-Employee-Job-Spec.pdf`, and `UNIT_ECONOMICS.md` cite the locked pre-final run (`2026-11-15T18:26:03.257Z`: `avgLatencyMs = 0.69 ms`, `p95LatencyMs = 1.38 ms`), whereas the post-all-edits final QA re-run (`18:39:51.567Z`) measured `avgLatencyMs = 0.74 ms`, `p95LatencyMs = 1.32 ms` (expected sub-millisecond wall-clock variance; zero contradiction in logic or unit economics).
- `docs/business/UNIT_ECONOMICS.md`, `CueX-BP.pdf`, and `token-usage-proof.png` explicitly separate `[本地实测 Eval (local_rule_zero)]` (`0` tokens) from `[商业假设 / 云端建模]` (`~43,748 tok/场`, `¥0.098` LLM cost, `¥0.612` full variable cost, `84.2%` Pro direct contribution margin, `92.4%` Pro SaaS gross margin, `87.6%` Event ¥29 margin).

---

## 4. Medical Domain Purge Audit (`rg`)

Command executed after all edits:
```bash
rg -n -i "(doctor|pharma|anshu|egfr|facecap|clinical|patient|医药|医疗|医学|临床|医药代表|安舒|陈主任|李主任|拜访|患者|医生|处方|科室|用药|诊疗)" \
  packages/ apps/ ppt/ infra/ scripts/ assets/ README.md package.json .env.example \
  docs/DEPLOYMENT.md docs/product/ docs/architecture/ docs/business/ deliverables/cuex-final/ \
  -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/*.pdf' -g '!**/*.png' -g '!assets/banners/**'
```
- **Result**: `ZERO_MEDICAL_MATCHES` (`0` matches).
- **Decoupling check** (`rg -n "scenarios/presentation" apps/server/src/runtime/`): `0` matches (`CLEAN_RUNTIME_DECOUPLING`).
- **Historical baseline audit docs** (`docs/engineering/{BASELINE,CURRENT_ARCHITECTURE,AUDIT,LEGACY_CLEANUP,CHANGELOG}.md`) intentionally document pre-refactor `96cd742` medical symbols purely as factual audit provenance.
- **Note**: `apps/server/src/system1/LlamaSystemOne.ts` & `infra/windows/*` retain `autotrust/JEV-9B` / `jev-v1` / `jevstyle-v1` as neutral System 1 model adapter names (`autotrust/JEV-9B` HuggingFace checkpoint).

---

## 5. Deliverables, PDF Page Counts, Visual Inspection & Archive Status

### 5.1 Legacy Archival & Final Packaging
- Verified both `@auditor-docs` and `@biz-deliverables` confirmed read-only audit completion of `deliverables/hks-2026*`.
- Archived `deliverables/hks-2026`, `deliverables/hks-2026-universal`, `deliverables/hks-2026.zip`, and `deliverables/hks-2026-universal.zip` to `.cuex-runtime/reference-archives/` (gitignored).
- Only `deliverables/cuex-final/` remains under `deliverables/`.
- Packaged `deliverables/cuex-final/` (excluding `.DS_Store`, `33` entries) into repository-root `CueX-Universal-Presentation-Final.zip` (`~19 MB`).

### 5.2 PDF Page Count & Geometry Verification (`pdf-lib`)
| Artifact | Expected | Observed Pages & Size | Status |
| --- | --- | --- | --- |
| `deliverables/cuex-final/pitch/CueX-BP.pdf` | `8` pages | `8` pages (`1440×810` pt, 16:9) | **PASS** |
| `deliverables/cuex-final/business/CueX-Business-Plan.pdf` | `8` pages | `8` pages (`1440×810` pt, 16:9) | **PASS** |
| `deliverables/cuex-final/business/CueX-AI-Employee-Job-Spec.pdf` | `1` page A4 | `1` page (`595×840` pt, A4 portrait) | **PASS** |
| `deliverables/cuex-final/business/CueX-Business-Model-Canvas.pdf` | `1` page A4 landscape | `1` page (`842×594` pt, A4 landscape) | **PASS** |
| `deliverables/cuex-final/business/CueX-Unit-Economics.pdf` | `1` page A4 landscape | `1` page (`842×594` pt, A4 landscape) | **PASS** |
| `deliverables/cuex-final/business/CueX-BMC-and-Unit-Economics.pdf` | `2` pages A4 landscape | `2` pages (`842×594` pt, A4 landscape) | **PASS** |

### 5.3 Visual Inspection (`read_file`)
All `14` PNG files were visually inspected via `read_file` (`brand/CueX-Cover.png`, `evidence/token-usage-proof.png`, and `previews/{cover,bp-p1..bp-p8,job-spec-p1,bmc-p1,unit-economics-p1}.png`):
- Consistent Warm Paper `#F8F7F3` background, `#111318` editorial typography, Amber (`#E87A24`/`#FF7A2F`) × Violet (`#7C3AED`/`#8E8CFF`) `X` motif, zero dark-neon clutter, zero clipped or overlapping text, legible tabular numerals and cost bars.
- Pre-commit defects caught during QA (`assets/brand/brand-spec.md` clinical wording, `apps/server/src/scripts/eval-presentation.ts` typo, `CompiledCueSheet` symbol mismatch, `CueX-Demo-Script.md` button wording) were fixed by owning workers and re-verified on regenerated PNGs/docs.

---

## 6. Known Gaps & Honesty Boundaries

1. **Offline Test Mode vs. External AI/ASR Endpoints**: All automated tests and `eval-presentation.ts` ran under offline deterministic engines (`CUEX_SYSTEM1=fake`, `CUEX_SYSTEM2=fake`, `CUEX_ASR=fake`). Live `LlamaSystemOne` (`llama-server`), `PiSlowReasoningProvider` (`pi-ai`), and `LocalSherpaAsr`/`RemoteSherpaAsr` codepaths are implemented with fallback guards (`FallbackFastDecisionProvider`, `FallbackSlowReasoningProvider`), while live remote model/ASR accuracy against external GPU servers was not tested in this offline sandbox (`未验证`).
2. **PDF Scanned-Image Limitation**: `DocumentExtractor` parses text streams and Flate-compressed PDF objects best-effort; image-only/scanned/encrypted PDFs return `unreadable: true` with explicit warnings rather than invoking external OCR.
3. **Roadmap Scenarios**: `social`, `teaching`, `sales`, and `custom` exist strictly as typed `SCENARIO_CAPABILITY_DESCRIPTORS` (`status: 'roadmap'`); `ScenarioRegistry.assertRunnable()` blocks execution (`ScenarioNotImplementedError`).
4. **Commercial Metrics**: All pricing tiers (`Free`, `Event ¥19–39`, `Pro ¥59/mo`, `Team ¥199/seat/mo`), CAC/LTV, and 10-component cloud unit economics are transparent modeled hypotheses (`尚未实现` billing/payment gateway; `0` real paid revenue).

---

## 7. Mandatory Section 17 Verification Matrix (14 Questions)

1. **原有工程是什么状态？** — `[已验证]`  
   基线提交 `96cd742`（`2026-11-16 01:08:45 +0800`）是面向虚构降压药「安舒平 / ANSHU-3」的医药代表虚拟医生拜访训练原型（含 `dr-chen`/`dr-li` 虚拟医生、3D `facecap*.glb` 头像、`TurnController`、医药热词与 `ClinicalScaffoldingHUD`），缺少根 `README.md`；本地旧 `deliverables/hks-2026*` 中的演讲与通用产品能力尚未在代码落地，且旧版 95.9% 毛利与跨槽共享 KV Cache 宣传与 `EVAL.md:49` 事实矛盾（详见 [BASELINE.md](./BASELINE.md) 与 [AUDIT.md](./AUDIT.md)）。
2. **清理了哪些旧业务？** — `[已实现 / 已验证]`  
   彻底删除了医药代表拜访与虚拟医生全部业务代码及资产：协议层 `jev.ts`、`piagent.ts`、`library.ts`；服务端 `agents/doctors/**`、`scenario/{anshu,asr-corrections}.ts`、`controller/{TurnController,DoctorLinePrefetch}.ts`、`conversation/visitIntent.ts`、`system1/{dose,HeuristicSystemOne,JevFastDecider}.ts`、`system2/{doctors,DoctorLineAgent,DoctorTurnAgent,concernText,linePrompt,fixtures,prompt,PiAgentRunner,PiSystemTwo}.ts`、`library/*` 及 10+ 医药测试/脚本；前端 `ClinicalScaffoldingHUD`、`DoctorBust`、`DoctorCanvas`、`ReplayDriver`、`stage/*` 及 `assets/models/facecap*.glb`；医疗 ASR 热词 `infra/windows/asr/*hotwords*`；旧冲突文档 `docs/{SCENARIO_LIBRARY,HKS_2026_*}.md` 与双版 `ppt/slides/cuex-hks*`。全仓库有效目录医药词汇扫描返回 `0` 命中（`ZERO_MEDICAL_MATCHES`）。
3. **哪些模块被保留？** — `[已实现 / 已验证]`  
   保留并适配了领域无关的工程底座：浏览器 16 kHz PCM16LE 采集（`apps/web/src/core/audio/{AudioCapture.ts,pcm-capture.worklet.js}`）、Sherpa 本地/远端流式 ASR 传输层（`apps/server/src/voice/{asr-local,asr-remote,sherpa,wav}.ts`）、`LlamaSystemOne` `/completion` 单 token 客户端与概率归一化、`system2/config.ts` 的 `redact()` 密钥脱敏与 `numbers.ts` 的 `numbersIn()` 数值校验、`scripts/check-public-data.mjs` 安全扫描脚本、Windows `llama.cpp`/TTS 部署脚本（已去除 `doctor` 用语），以及 `assets/brand/*`、`assets/fonts/*` 视觉资产。
4. **哪些模块被重写？** — `[已实现 / 已验证]`  
   完全重写了 `@cuex/protocol`（11 个领域无关协议文件）、服务端网关 `CueXGatewayServer`（`GatewayServer.ts`）、全新的 `apps/server/src/runtime/` 通用认知运行时（`CognitiveRuntimeSession`、`ContextStore`、`CognitiveEventBus`、`SharedCognitiveStateStore`、`LexicalBm25RetrievalProvider`、`InterventionController`、`MemoryStore`）、`apps/server/src/scenarios/` 场景注册与 `CueX Presentation` 全套模块、前端 `apps/web/src/`（`HomeView`、`CompilerView`、`StageView`、`ReflectionView`、`CueEdgeLight`、`MemoryInspectorPanel`、`CueXWSClient`、`presentationSession`）、文档体系（`README.md`、`docs/{product,architecture,business,engineering,DEPLOYMENT.md}`）及 `ppt/` 统一交付生成管线。
5. **Universal Runtime 实现了什么？** — `[已实现 / 已验证]`  
   实现了与具体场景完全解耦（`runtime/` 对 `scenarios/presentation/` `0` 引用）的通用认知运行时：`ContextStore`（任务目标、`ContextPack`、带溯源/生命周期/隐私级别/锁定的 `Evidence[]`、`Observation[]`、`TranscriptSegment[]`）、事件驱动 `CognitiveEventBus`、原子递增 `contextVersion` 的 `SharedCognitiveStateStore`（含真实分层 `TelemetryUsage`）、模型无关双系统抽象（`FastDecisionProvider` / `SlowReasoningProvider` / `LexicalBm25RetrievalProvider`）、独立门控 `InterventionController`，以及强制 `userConfirmed === true` 才入库的 `MemoryStore`（支持列表/修改/删除与会话一键擦除）。
6. **Presentation 实际实现了什么？** — `[已实现 / 已验证]`  
   端到端实现了唯一 `status: 'implemented'` 的 `CueX Presentation` 场景：场前 `DocumentExtractor`（`.md`/`.txt`/真实 `.pptx` ZIP+XML 含备注/尽力抽取 `.pdf` 不可读警告）与 `PresentationCompiler`（一页导播单 `PresentationCueSheet`、可编辑锁定的 `FactWhitelist`、标记 `isPrediction: true` 的 `QACards` 与 `unpreparedGaps`、章节进度结构 `ProgressNodes` + 内置示例包 `pack_cuex_demo_01`）；场中 `rehearsal`/`live` 双模式与 `Focus`/`Inspector` 双视图（`L0–L3`、浏览器 Web Speech / 文本仿真 / PCM16 音频、Q&A 证据检索与缺失诚实提示）；场后 `PresentationReflection`（时间线、遗漏/超时诊断、`V = H - λI` 算子、弱项单点重练 `rehearsal.start` 与 `MemoryProposal` 人工审批）。
7. **System 1 / System 2 如何协作？** — `[已实现 / 已验证（离线规则路径）；部分已验证（外部云端模型接口由单元测试/回退覆盖，未连外网GPU实机）]`  
   `CognitiveRuntimeSession` 在语音片段或状态信号到达时由 `EventBus` 触发 `FastDecisionProvider`（`HeuristicFastDecisionProvider` 或 `LlamaFastDecisionProvider`）先判别流畅/恢复/遗漏/偏题/提问：流畅或自愈时直接 `L0` 静默或触发撤回（不唤醒 System 2）；仅在确实存在缺口、偏题、提问或主动求助时，先用 `LexicalBm25RetrievalProvider` 检索已核验活跃 `Evidence[]`，再调用 `SlowReasoningProvider`（`LocalSlowReasoningProvider` 或 `PiSlowReasoningProvider`）生成带 `evidenceIds` 的 `Candidate`（无证据时显式产出 `missing_evidence_notice`），最后提交 `InterventionController` 仲裁。
8. **Controller 如何决定提示与撤回？** — `[已实现 / 已验证]`  
   `InterventionController` 是 System 2 通往屏幕的唯一门控（`System 2` 不可直出界面）：按序校验 `session_paused`、`silent_mode`、`stale_context_version`、`candidate_expired`（TTL 默认 12s）、`ungrounded_evidence`（拦截未核验数字与 `forbiddenClaims`）、非纯停顿多信号检查（`pause_only_without_gap`）、`user_already_recovering`、`ceiling_exceeded`（`L0–L3`）、`user_dismissed_suppression`（默认 45s）、`cooldown_active`（默认 15s）与优先级抢占；并在每次语音/时钟/切章/驳回时检查 **7 类 `WithdrawalReason`**（`user_recovered`、`topic_changed`、`chapter_changed`、`context_invalidated`、`candidate_expired`、`user_dismissed`、`superseded`）执行自动撤回。
9. **端到端流程是否真正跑通？** — `[已实现 / 已验证]`  
   是。在离线引擎模式（`CUEX_SYSTEM1=fake CUEX_SYSTEM2=fake CUEX_ASR=fake`）下，`apps/server/test/gateway-ws-e2e.test.ts` 与浏览器 Playwright 无头真实 Chromium E2E（`apps/web/test/presentation-e2e.test.mjs`）均已完整跑通 `HomeView -> CompilerView (.md 提取与事实锁定) -> StageView (Focus/Inspector, L0 静默 -> 偏题触发 -> H 反馈 -> 恢复撤回 -> 无证据 Q&A 诚实提示 -> Inspector 仲裁日志) -> ReflectionView (V=H-λI, 记忆增删, 单点重练, 会话一键擦除)`，`0` 控制台/页面报错。
10. **测试通过率如何？** — `[已验证]`  
    全部修改后实测全绿（100% 通过）：`pnpm typecheck` 0 错误；`pnpm build` 0 错误；`@cuex/server test` **13/13**（100%）；`@cuex/web` Vitest **2/2**（100%）；`tts-startup.test.mjs` **4/4**（100%）；`eval-presentation.ts` **6/6**（100%）；Playwright E2E **1/1**（100%）；`check-public-data.mjs --staged` **0 findings**。
11. **目前还有哪些缺陷？** — `[已验证 / 诚实边界]`  
    当前已落地版本存在 4 项明确边界（非隐瞒缺陷）：(1) 实时演示与测试默认跑在本地规则引擎与文本/浏览器 Web Speech 模式，未接入外部 GPU `llama-server` / 云端 `pi-ai` 真实 API 账单联调；(2) `DocumentExtractor` 对扫描版/纯图片 PDF 仅诚实标记 `unreadable: true`，未内置 OCR；(3) `Social / Teaching / Sales / Custom` 仅完成协议与注册表占位（`status: 'roadmap'`），不可启动实机会话；(4) 商业定价、微信/支付宝计费与用户系统尚未开发上线。
12. **哪些商业指标是真实数据，哪些只是预测？** — `[已验证]`  
    - **真实本地实测（`[本地实测 Eval]`）**：`eval-presentation.ts` 6/6 用例 100% 通过、`precision = 100.0%`、`falseInterventionRate = 0.0%`、`withdrawalAccuracy = 100.0%`、`V = +3`（`λ = 2`）、`localRuleEvaluations = 13`、`0` LLM tokens（延迟 `0.69–0.74 ms` 均值 / `1.32–1.38 ms` P95）。
    - **云端公开费率与商业预测（`[商业假设 / 建模测算]`）**：单场 25m 云端 `43,748` tokens、单场 LLM `¥0.098`、单场全变动成本 `¥0.612`、定价假设（`Free ¥0` / `Event ¥19–39` / `Pro ¥59/月` / `Team ¥199/席位/月`）、Pro 直接贡献率 `84.2%`（SaaS 毛利率 `92.4%`）、Event 毛利率 `87.6%`、CAC/LTV 与敏感性矩阵均为基于公开云报价单与产品假设的建模测算，尚无真实收费流水。
13. **BP 与商业材料是否与当前代码一致？** — `[已验证]`  
    一致。经 QA 逐项比对与返修闭环，`docs/business/*.md`、`ppt/slides/cuex-final/`、`CueX-BP.pdf`（8 页）、`CueX-Business-Plan.pdf`（8 页）、`CueX-AI-Employee-Job-Spec.pdf`（1 页 A4）、`CueX-BMC-and-Unit-Economics.pdf`（2 页 A4 横版）、`CueX-Demo-Script.md`、`evaluation-results.md` 与 `token-usage-proof.png` 均已与 `@cuex/protocol`、`apps/server`、`apps/web` 及 `eval-presentation.ts` 对齐，且无医药残留。（注：`eval-presentation.ts` 的 2 次本地实机跑批存在 `0.69ms` vs `0.74ms` 正常毫秒级耗时微差，计数与结论完全一致。）
14. **最终交付物在哪里？** — `[已实现 / 已验证]`  
    - 目录交付包：[`deliverables/cuex-final/`](../../deliverables/cuex-final/README.md)（含 `brand/`、`pitch/`、`business/`、`evidence/`、`previews/`）
    - 打包归档 ZIP：[`CueX-Universal-Presentation-Final.zip`](../../CueX-Universal-Presentation-Final.zip)（仓库根目录，已加入 `.gitignore` 避免膨胀 Git 历史）
    - 历史参考归档：`.cuex-runtime/reference-archives/`（已移出 `deliverables/`）
    - 工程与战略文档：`README.md`、`docs/DEPLOYMENT.md`、`docs/product/*`、`docs/architecture/*`、`docs/business/*`、`docs/engineering/*`
