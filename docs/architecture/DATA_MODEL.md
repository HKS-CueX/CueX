# CueX Data Model Specification (`@cuex/protocol`)

> Authoritative Source: `packages/protocol/src/` (Domain-Agnostic Universal Cognitive Entities + Presentation Scenario Contracts)

## 1. Universal Primitives (`common.ts`)

| Type | Values / Structure | Role |
| --- | --- | --- |
| `InterventionLevel` | `'L0' \| 'L1' \| 'L2' \| 'L3'` | Progressive intervention hierarchy (`INTERVENTION_LEVEL_RANK`: `0..3`) |
| `DEFAULT_UTILITY_LAMBDA` | `2` | Default disruption multiplier $\lambda$ in $V = H - \lambda I$ |
| `DataScope` | `'global' \| 'scenario' \| 'session' \| 'document'` | Lifetime & visibility boundary for Evidence and MemoryItems |
| `PrivacyLevel` | `'ephemeral' \| 'session' \| 'local_private' \| 'shared'` | Storage & sharing sensitivity label |
| `EvidenceLifecycle` | `'draft' \| 'active' \| 'superseded' \| 'archived' \| 'revoked'` | Governs whether an evidence item can back live cues |
| `EvidenceSourceType` | `'user_document' \| 'user_input' \| 'user_confirmed_memory' \| 'compiler_extracted' \| 'live_transcript' \| 'system_rule'` | Provenance category for grounding audits |
| `TelemetryMeasurementSource` | `'provider_reported' \| 'local_rule_zero' \| 'estimated'` | Separates real API usage headers, `0`-token local rules, and explicit estimates |
| `TelemetryUsage` | `inputTokens`, `outputTokens`, `cachedInputTokens`, `totalTokens`, `modelCalls`, `localRuleEvaluations`, `latencyMs`, `lastSystem1LatencyMs?`, `lastSystem2LatencyMs?`, `estimation`, `byTier?` | Honest runtime telemetry structure |

---

## 2. Core Universal Runtime Entities (`entities.ts`)

### 2.1 Session, Context & Grounded Evidence
- **`Session`**: `sessionId`, `scenarioId`, `status` (`'initializing' | 'active' | 'paused' | 'ended'`), `mode`, `viewMode` (`'focus' | 'inspector'`), `startedAt`, `endedAt?`, `contextPackId?`, `silentMode`, `maxInterventionLevel`, `privacyNoticeAccepted`.
- **`TaskContext`**: active session objective (`taskId`, `goal`, `audience?`, `activeChapterId?`, `activeChapterTitle?`, `targetDurationSec?`, `elapsedSec?`, `constraints[]`, `forbiddenClaims?`, monotonic `contextVersion`).
- **`ContextPack`**: compiled scenario knowledge container (`packId`, `scenarioId`, `title`, `goal`, `constraints[]`, `forbiddenClaims[]`, `chapters: ContextPackChapter[]`, `evidence: Evidence[]`).
- **`Evidence`**: atomic groundable fact (`id`, `text`, `source`, `timestamp`, `confidence`, `scope`, `privacyLevel`, `userConfirmed`, `verified`, `lifecycle`, optional `sourceType`, `locked`, `locationRef`). System 2 candidates MUST cite verified `Evidence.id`s or mark `grounded: false`.

### 2.2 Events, Speech & Observations
- **`CognitiveEvent<TPayload>`**: `event_id`, `session_id`, `event_type` (`session.lifecycle`, `speech.partial`, `speech.final`, `silence.tick`, `topic.shift`, `chapter.change`, `question.detected`, `omission.detected`, `drift.detected`, `recovery.detected`, `user.manual_help`, `user.dismiss_hint`, `user.feedback`, `user.mode_change`, `candidate.prepared`, `intervention.shown`, `intervention.withdrawn`, `context.updated`), `timestamp`, `source`, `payload`, `confidence`, `context_version`.
- **`TranscriptSegment`**: `segmentId`, `sessionId`, `speaker` (`'presenter' | 'audience' | 'interlocutor' | 'unknown'`), `text`, `delta`, `isFinal`, `confidence`, `startMs`, `endMs`, optional `source` (`TranscriptSource`), `chapterId`.
- **`Observation`**: structured detection emitted by runtime evaluators (`silence`, `pace_overtime`, `pace_fast`, `topic_drift`, `key_point_omission`, `audience_question`, `hesitation`, `recovery`, `manual_trigger`, `chapter_transition`).

### 2.3 Candidates, Interventions & Outcomes
- **`Candidate`**: prepared but **unshown** support proposal (`candidateId`, `level`, `title`, `cueText`, `bullets?`, `priority`, `ttlMs`, `expiresAt`, `contextVersion`, `evidenceIds[]`, `basedOnSegmentId`, `status`: `'pending' | 'active' | 'suppressed' | 'expired' | 'withdrawn' | 'dismissed'`, `kind?`, `grounded?`, `missingEvidenceNotice?`, `withdrawalReason?`, `suppressedReason?`).
- **`Intervention`**: an approved candidate actually displayed to the user (`interventionId`, `candidateId`, `level`, `title`, `cueText`, `bullets?`, `evidenceIds[]`, `grounded`, `shownAt`, `withdrawnAt?`, `withdrawalReason?`, `dismissedAt?`, `userFeedback?: 'helpful' | 'distracting'`).
- **`Outcome` & `Reflection`**: post-session `utilityScore`, `helpfulCount`, `interruptionCount`, `lambda`, `coverageRatio`, `telemetry`, plus `interventions[]`, `observations[]`, `memoryProposals[]`, `highlights[]`, `improvementFocuses[]`.

### 2.4 Opt-In Memory Model
- **`MemoryItem`**: `memoryId`, `scenarioId` (`ScenarioId | 'universal'`), `category` (`'preference' | 'terminology' | 'fact' | 'pacing_habit' | 'qa_pattern' | 'style'`), `title`, `content`, `userConfirmed`, `privacyLevel`, `scope`, `createdAt`, `updatedAt`.
- **`MemoryProposal`**: candidate memory update emitted after session reflection with `status: 'pending' | 'accepted' | 'rejected'` — cannot become an active `MemoryItem` without user confirmation.

---

## 3. Shared State, Decision & Controller Contracts (`state.ts`, `reasoning.ts`, `controller.ts`)

- **`SharedCognitiveState`**: single runtime truth snapshot holding `contextVersion`, `activeGoal`, `activeChapterId`, `constraints`, `attentionSignal` (`'fluent' | 'hesitating' | 'drifting' | 'omission_risk' | 'answering_question' | 'recovering'`), `openGapLabels[]`, `activeIntervention`, `activeCandidate`, `queuedCandidates[]`, `recentObservations[]`, `recentSegments[]`, `cooldownUntilMs`, `suppressions: SuppressionEntry[]`, and `telemetry: TelemetryUsage`.
- **`FastDecisionInput` -> `FastDecisionVerdict`** (`reasoning.ts`): System 1 contract returning `cognitiveState`, `speakerIntent`, `interventionNeed`, `recommendedLevel`, `recoveryDetected`, `confidence`, `coveredPointIds[]`, `missingPointIds[]`, `driftDetected`, `signals`, `latencyMs`, `backend`, `usage`.
- **`SlowReasoningCandidateRequest` -> `SlowReasoningCandidateResult`** (`reasoning.ts`): System 2 contract yielding `status` (`'synthesized' | 'insufficient_evidence' | 'no_action_needed' | 'aborted' | 'error'`), optional `candidate`, `evidenceIds[]`, strict `grounded: boolean`, and `ungroundedNotice?`.
- **`ControllerDecision`** (`controller.ts`): `selectedAction` (`'stay_silent' | 'show_l1_edge' | 'show_l2_keyword' | 'show_l3_scaffold' | 'withdraw'`), `level`, `withdrawalReason?`, `suppressReason?`, `reason`, and structured `ControllerInspectionTrace` (`signalsEvaluated`, `rulesApplied`, `cooldownRemainingMs`, `ttlRemainingMs`, `groundedChecked`, `evidenceCount`).

---

## 4. Presentation Scenario Entities (`presentation.ts`)

- **`PresentationExtractResult`**: `filename`, `fileType` (`'md' | 'txt' | 'pptx' | 'pdf' | 'unknown'`), `extractedText`, `sections: ExtractedPresentationSection[]`, `warnings[]`, `unreadable`.
- **`PresentationContextPack`**: extends session presentation context with `cueSheet: PresentationCueSheet`, `facts: PresentationFactItem[]` (`locked`, `userConfirmed`, `verified`, `evidenceId`), `qaCards: PresentationQACard[]` (`isPrediction: true`, `prepared`, `gapNote?`), `unpreparedGaps[]`, `progressNodes: PresentationProgressNode[]`, and `compiledBy` (`'local_compiler' | 'llm_compiler'`).
- **`PresentationLiveState`**: live chapter progress (`activeChapterId`, `elapsedSec`, `paceStatus`, `chapterNodes`, `missedKeyPoints[]`, `activeDriftTopic?`, `activeQuestion?`).
- **`PresentationReflection`**: `timeline: PresentationTimelineEvent[]`, `diagnosis: PresentationDiagnosis`, `weakSegments: PresentationWeakSegment[]`, `memoryProposals[]`, `utility: UtilitySummary` (`formula: 'V = H - λI'`), `telemetry: TelemetryUsage`.
