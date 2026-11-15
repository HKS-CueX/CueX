# Intervention Controller Architecture

> Contract Source: `packages/protocol/src/controller.ts`, `packages/protocol/src/state.ts`, `packages/protocol/src/common.ts`  
> Implementation: `apps/server/src/runtime/InterventionController.ts` (`config.ts` defaults)

## 1. Sole Gatekeeper Invariant

In CueX Next, System 2 produces `Candidate` proposals—it NEVER emits UI prompts directly. Every candidate and every session state update passes through `InterventionController` (`apps/server/src/runtime/InterventionController.ts`), yielding an explicit `ControllerDecision` with a `ControllerInspectionTrace`.

### Runtime Default Parameters (`apps/server/src/config.ts`)

| Config Env Variable | Server Field | Default | Purpose |
| --- | --- | --- | --- |
| `CUEX_COOLDOWN_MS` | `cooldownMs` | `15_000 ms` | Minimum quiet gap between non-urgent interventions |
| `CUEX_CANDIDATE_TTL_MS` | `candidateTtlMs` | `12_000 ms` | Candidate validity window before `candidate_expired` |
| `CUEX_DISMISS_SUPPRESSION_MS` | `dismissSuppressionMs` | `45_000 ms` | Suppression window after explicit user dismissal |
| `CUEX_HESITATION_SILENCE_MS` | `hesitationSilenceMs` | `1_600 ms` | Silence threshold evaluated *only alongside* semantic signals |
| *(derived)* | `maxInterventionDisplayMs` | `max(candidateTtlMs * 2, 18_000)` (`24_000 ms` default) | Maximum active display horizon before auto-expiry |
| `CUEX_UTILITY_LAMBDA` | `defaultUtilityLambda` | `2` | Disruption multiplier $\lambda$ in $V = H - \lambda I$ |

---

## 2. Progressive Intervention Levels (`InterventionLevel`)

| Level | Rank | `ControllerAction` | UI Rendering (`StageView` / `CueEdgeLight`) |
| --- | --- | --- | --- |
| `L0` | `0` | `'stay_silent'` | Default clean state; zero foreground card |
| `L1` | `1` | `'show_l1_edge'` | Peripheral Amber (`l1_amber`) or Violet (`l1_violet`) edge glow |
| `L2` | `2` | `'show_l2_keyword'` | Compact 2–6 character peripheral keyword pill (`l2_active` rim) |
| `L3` | `3` | `'show_l3_scaffold'` | Brief structured card (`title`, `cueText`, 2–3 bullets) for grounded Q&A, sustained gaps, or `intervention.request_help` |

---

## 3. Ordered Arbitration Pipeline (`evaluateCandidates`)

Candidates are sorted descending by `priority` and filtered sequentially through every check below. Failing any gate marks the candidate `'suppressed'` (or `'expired'`) and records the matching `ControllerSuppressReason`:

1. **`session_paused`**: Rejects while `state.getSessionStatus() === 'paused'`.
2. **`silent_mode`**: Rejects when speaker enables `silentMode` (`L0` lock).
3. **`stale_context_version`**: Drops candidates where `candidate.contextVersion !== state.getContextVersion()` (status `'expired'`).
4. **`candidate_expired`**: Drops candidates where `now >= candidate.expiresAt` (status `'expired'`).
5. **`ungrounded_evidence`**: Runs `verifyCandidateGrounding(candidate, evidenceMap, forbiddenClaims, allowedAuxiliaryNumbers)` (`RetrievalProvider.ts`) to block unconfirmed metrics/numbers or forbidden claims (`missing_evidence_notice` passes cleanly as an explicit ungrounded notice).
6. **`pause_only_without_gap` / `no_semantic_need`**: Rejects silence or fluency when `!(semanticGap || drift || openQuestion || manualHelp)` (except explicit `pace_nudge`). Pure rhetorical pauses never trigger noise.
7. **`user_already_recovering`**: Withholds non-Q&A/non-manual nudges if recovery cues are already detected.
8. **`ceiling_exceeded`**: Rejects candidates whose `INTERVENTION_LEVEL_RANK[level]` exceeds the user's `maxInterventionLevel` (or when ceiling is `L0`).
9. **`user_dismissed_suppression`**: Checks `state.isSuppressed(suppressionKey, now)` (bypassable only by explicit `manualHelp`).
10. **`cooldown_active`**: Enforces `cooldownRemainingMs === 0` (bypassable by `manualHelp` or urgent `openQuestion && candidate.kind === 'qa_grounding'`).
11. **`lower_priority`**: Defers if an equal-or-higher priority active candidate exists (`supersedes` requires `manualHelp`, `qa_grounding`, or `priority >= active.priority + 10`).

---

## 4. Automatic Withdrawal Engine (`checkWithdrawals`)

Whenever speech, silence ticks, chapter transitions, dismissals, or context updates arrive, `checkWithdrawals` checks active interventions in strict order:

1. **`chapter_changed`**: `active.chapterId !== context.taskContext.activeChapterId`.
2. **`context_invalidated`**: `active.contextVersion !== state.getContextVersion()`.
3. **`candidate_expired`**: `now >= sourceCandidate.expiresAt` or active display elapsed `>= maxDisplayMs`.
4. **`user_recovered`**: `signals.recovery`, `verdict.recoveryDetected`, `verdict.interventionNeed === 'withdraw_active'`, or `targetKeyPointId` appears in `coveredPointIds`.
5. **`topic_changed`**: `signals.topicChanged` indicates clean shift to another focus.
6. **`user_dismissed`**: Triggered immediately via `InterventionController.dismiss()`, also opening a `dismissSuppressionMs` (`45_000 ms`) suppression entry.
7. **`superseded`**: Handled in `evaluateCandidates` when a higher-priority cue preempts the active intervention.

---

## 5. Inspectable Trace & Net Utility (`V = H - λI`)

Every decision emits `controller.decision` carrying `ControllerInspectionTrace` (`contextVersion`, `ttlRemainingMs`, `cooldownRemainingMs`, `groundedChecked`, `evidenceCount`, `signalsEvaluated`, `rulesApplied`), streamed live to the web **`Inspector`** panel and consumed by `computeUtilitySummary()` (`PresentationReflection.ts`) to compute $V = H - \lambda I$ ($\lambda = 2$).
