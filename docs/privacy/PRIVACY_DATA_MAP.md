# CueX Privacy Data Map

> Governance Scope: End-to-end mapping of personal, voice, document, cognitive, memory, and billing data across CueX Web (`apps/web`), Server (`apps/server`), Persistent Storage (`node:sqlite`), and Optional Third-Party Providers.

---

## 1. End-to-End Data Flow Map

```text
[Presenter Browser (apps/web)]
   │
   ├── 1. Auth & Consent
   │      Bearer session token (`auth_tokens` SHA-256 hash) + privacyNoticeAccepted (explicit click)
   │
   ├── 2. Pre-Stage Materials (.pptx / .pdf / .md / .txt)
   │      ──► HTTP POST /api/presentation/extract & /api/presentation/compile
   │          └─► DocumentExtractor (in-memory bounded unzip/parse + SHA-256 contentHash)
   │          └─► PresentationContextPack + verified Evidence[] ──► SQLite (`presentation_packs`)
   │
   ├── 3. Live Audio / Speech Stream
   │      ├── Mode A: 16 kHz PCM16/Opus (`AudioCapture`) ──► WS `/ws` `audio.chunk`
   │      │      ├─► LocalSherpaAsr (on-host CPU ONNX, zero network egress)
   │      │      └─► RemoteSherpaAsr (audio sent to configured Sherpa WS bridge)
   │      └── Mode B: Browser Web Speech / Text Simulation ──► WS `/ws` `speech.delta` (text only)
   │
   ├── 4. Dual-Process Inference (Optional External LLMs)
   │      ├── Local Heuristic / Local llama.cpp S1 / Local S2 (zero external cloud egress)
   │      └── PiSlowReasoningProvider (`CUEX_SYSTEM2=real`):
   │             sends compact untrusted_data-delimited transcript digest + verified Evidence[]
   │             to configured OpenAI/Anthropic-compatible API (`PromptGuard` sanitization)
   │
   ├── 5. Runtime State, Opt-In Memory & Metering
   │      ├── Session state, events & Reflections ──► SQLite (`sessions`, `session_events`, `session_reflections`)
   │      ├── MemoryItem ──► SQLite `memories` ONLY if `userConfirmed === true`
   │      └── UsageRecord & BillingAuditRecord ──► SQLite `usage_ledger`, `billing_audit_log`
   │
   └── 6. Privacy-Scrubbed Telemetry & Summary
          In-process `MetricsCollector`, `StructuredLogger` (`redactLogText` / `redact()`), and `PipelineTracker`
          exposed via authenticated `GET /api/observability/summary` (NO raw audio, NO raw speech transcripts)
```

---

## 2. Sub-Processor & External Processing Matrix

| Component / Mode | Data Dispatched Outside CueX Host | Default Local/Offline Mode | User Disclosure Requirement |
| --- | --- | --- | --- |
| **`LocalSherpaAsr` (`local_sherpa`)** | None (runs locally via `sherpa-onnx-node`) | Available locally when model path configured | Inform user local mic audio stays in host RAM (`ephemeral`). |
| **`RemoteSherpaAsr` (`remote_sherpa`)** | Streaming 16 kHz PCM audio over configured `ws://` / `wss://` bridge | Opt-in via `CUEX_ASR=real` + remote endpoint | Disclose target ASR endpoint host; audio leaves CueX Node server. |
| **Cloud Streaming ASR *(commercial roadmap target)*** | Streaming audio over TLS to external cloud ASR vendor | Not implemented in `@cuex/protocol` `AsrBackendMode` today | Would require explicit consent & third-party retention caveat in [CONSENT_FLOW.md](./CONSENT_FLOW.md). |
| **`browser_webspeech` (`BrowserSpeechRecognizer`)** | Managed by user's browser vendor (e.g., Chrome/Safari OS speech service) | Optional UI mode (`text_simulation` alternative when server ASR is `TextOnlyAsr`) | Warn presenter in UI badge that browser engine vendor handles speech audio. |
| **`PiSlowReasoningProvider` (`CUEX_SYSTEM2=real`)** | Compact recent spoken slice + relevant `Evidence[]` snippets sent to configured OpenAI/Anthropic-compatible API | Disabled by default (`CUEX_SYSTEM2=fake` uses zero-egress `LocalSlowReasoningProvider`) | Disclose configured LLM provider & warn that sent prompts cannot be remotely recalled by CueX wipe endpoints. |
| **WeChat Pay / Alipay (`SandboxPaymentProviderAdapter`)** | Order preview ID, `amountFen`, merchant metadata (`sandbox_only` / `501 PAYMENT_NOT_CONFIGURED` on webhook if `CUEX_WEBHOOK_SECRET` unset) | Sandbox preview (`liveCheckoutAvailable: false`) | Disclose `BillingAuditRecord` retention independent of operational session/account wipe. |

---

## 3. Data Classification (`PrivacyClass` & `PrivacyLevel`)

- **`ephemeral` (`PrivacyLevel`)**: Raw 16 kHz PCM audio frames (`audio.chunk`) and uploaded upload buffers — decoded in RAM, processed, and immediately discarded (never written to SQLite).
- **`session` (`PrivacyLevel` / `PrivacyClass`)**: Active speech transcript segments, `Candidate` drafts, transient `Observation`s, and `session_events` — deleted on `POST /api/sessions/:id/wipe`, `DELETE /api/sessions/:id`, WS `session.wipe`, or `DELETE /api/account/data`.
- **`local_private` / `user_private` (`PrivacyLevel` / `PrivacyClass`)**: User-uploaded `PresentationContextPack`s (`presentation_packs`), `Evidence[]`, `PresentationReflection` (`session_reflections`), confirmed `MemoryItem[]` (`memories`) — scoped strictly to owning `userId`; exportable via `GET /api/account/export?format=json|markdown`.
- **`restricted` / `billing_audit` (`PrivacyClass`)**: Minimal `BillingAuditRecord` rows (`billing_audit_log`) preserved strictly for tax, refund, and anti-fraud compliance without transcript/prompt/memory payloads (`ADR-003`).
