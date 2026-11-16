# System 1 & System 2 Dual-Process Cognitive Architecture

> Contract Source: `packages/protocol/src/reasoning.ts`, `packages/protocol/src/common.ts`  
> Implementation: `apps/server/src/runtime/providers/{FastDecisionAdapter,SlowReasoningAdapter}.ts`, `apps/server/src/system1/`, `apps/server/src/system2/`

## 1. Dual-Process Provider Interfaces

CueX models fast situational awareness (**System 1**) separately from deliberate grounded cue synthesis (**System 2**) behind model-agnostic interfaces (`FastDecisionProvider`, `SlowReasoningProvider`, `RetrievalProvider`), ensuring instant offline fallback (`CUEX_SYSTEM1=fake`, `CUEX_SYSTEM2=fake`) with exact `0` token usage.

| Tier | Server Providers | Input / Output Contract | Operational Behavior & Defaults |
| --- | --- | --- | --- |
| **System 1 (`FastDecisionProvider`)** | `HeuristicFastDecisionProvider` (`local-heuristic-s1`), `LlamaFastDecisionProvider` (`LlamaSystemOne`), wrapped in `FallbackFastDecisionProvider` | `FastDecisionInput -> FastDecisionVerdict` | `createFastDecisionProvider`: returns `HeuristicFastDecisionProvider` when `CUEX_SYSTEM1=fake` or `CUEX_S1_URL` is unset; otherwise calls `LlamaSystemOne` (`/completion`, `n_predict: 1`) fused with local overlap features (`needScore >= 0.72`, `recoverScore >= 0.68`) and auto-falls back cleanly on upstream timeout/error (`ADR-004` neutralizes legacy calibration naming). |
| **Retrieval (`RetrievalProvider`)** | `LexicalBm25RetrievalProvider` (`RetrievalProvider.ts`) | `(query, Evidence[]) -> RetrievedEvidence[]` | Tokenizes CJK bigrams + Latin/numeric `#num:` tokens (`k1 = 1.5, b = 0.75`) over active verified `Evidence[]`; zero LLM tokens. |
| **System 2 (`SlowReasoningProvider`)** | `LocalSlowReasoningProvider` (`local-grounded-synthesizer`), `PiSlowReasoningProvider` (`pi-ai` + `@earendil-works/pi-agent-core`), wrapped in `FallbackSlowReasoningProvider` | `SlowReasoningCandidateRequest -> SlowReasoningCandidateResult` | `createSlowReasoningProvider`: returns `LocalSlowReasoningProvider` when `CUEX_SYSTEM2=fake` or `pi-ai` credentials fail to load; when `real`, binds `submit_candidate` tool over `loadS2Runtime()` (`openai-completions` / `anthropic-messages`, `redact()` secret masking) with deterministic local fallback. |

---

## 2. Execution & Grounding Cooperation Loop

```text
speech.delta / ASR transcript
  │
  ▼
Heuristic / Llama System 1 (FastDecisionProvider)
  ├─► 'fluent' / 'on_track' / 'recovering'
  │     └─► checkWithdrawals() -> stay L0 or emit 'withdraw' (0 System 2 tokens spent)
  │
  └─► 'omitting_key_point' / 'drifting' / 'answering_question' / 'hesitating'
        │
        ▼
      LexicalBm25RetrievalProvider searches verified active Evidence[]
        │
        ▼
      Local / Pi System 2 (SlowReasoningProvider)
        ├─ Evidence matched  ──► Candidate (`grounded: true`, `evidenceIds[]`, `ttlMs: 12000`, `contextVersion`)
        └─ Evidence missing (live Q&A) ──► `status: 'insufficient_evidence'`, `kind: 'missing_evidence_notice'`, `grounded: false`
        │
        ▼
      InterventionController.evaluateCandidates() (sole UI gatekeeper)
```

Crucial safety guarantees verified in `SlowReasoningAdapter.ts`:
- `PiSlowReasoningProvider` passes `retrievedEvidence[]` and filters tool-returned `evidenceIds` strictly to valid active IDs present in the request; if a live Q&A request has zero matched evidence, both `LocalSlowReasoningProvider` and `PiSlowReasoningProvider` produce an explicit `missing_evidence_notice` instead of inventing metrics or promises.
- System 2 candidates always enter with `status: 'pending'` and `candidateTtlMs` (`12_000 ms` default); `InterventionController` verifies grounding (`verifyCandidateGrounding`) before display.

---

## 3. Honest KV-Cache, Fallback & Telemetry Boundaries

1. **KV-Cache Reality Check (`apps/server/src/system1/EVAL.md:49`)**:
   - `LlamaSystemOne` (`apps/server/src/system1/LlamaSystemOne.ts`) sets `n_predict: 1` and `cache_prompt: true` on `llama.cpp` `/completion` calls.
   - However, generic `llama.cpp` `/completion` slots do **not** share computed prefix KV state across distinct scenario slots or models (`--kv-unified` pools allocation, not cross-slot computed KV cache), and `PiSlowReasoningProvider` communicates with independent cloud LLM endpoints (`openai-completions` / `anthropic-messages`).
   - Cost control comes from **event-driven dispatch + compact `recentTextDigest` windows + System 1 filtering** before waking System 2, NOT from fictional shared cross-scenario KV memory.
2. **Real `TelemetryUsage` Accounting (`SharedCognitiveStateStore.ts`)**:
   - `HeuristicFastDecisionProvider`, `LexicalBm25RetrievalProvider`, and `LocalSlowReasoningProvider` record `usageSource: 'local_rule_zero'`, `0` input/output/cached tokens, `0` model calls, `costFen: 0`, and increment `localRuleEvaluations`.
   - `PiSlowReasoningProvider` sums exact `assistant.usage.input`, `assistant.usage.output`, and `assistant.usage.cacheRead` per turn (`provider_reported`) with integer `costFen` attribution into `UsageLedger`.
   - `cachedInputTokens` is NEVER heuristically fabricated.
