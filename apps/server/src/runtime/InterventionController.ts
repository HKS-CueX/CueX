import {
  INTERVENTION_LEVEL_RANK,
  type Candidate,
  type ControllerAction,
  type ControllerDecision,
  type ControllerInspectionTrace,
  type ControllerSuppressReason,
  type Evidence,
  type FastDecisionVerdict,
  type Intervention,
  type InterventionLevel,
  type WithdrawalReason,
} from '@cuex/protocol';
import type { ContextStore } from './ContextStore';
import { verifyCandidateGrounding } from './RetrievalProvider';
import type { SharedCognitiveStateStore } from './SharedCognitiveStateStore';
import { isoToMs, msToIso } from './time';

export interface InterventionControllerConfig {
  cooldownMs: number;
  candidateTtlMs: number;
  dismissSuppressionMs: number;
  maxInterventionDisplayMs?: number;
}

export interface ControllerSignalContext {
  verdict?: FastDecisionVerdict;
  silenceMs: number;
  semanticGap: boolean;
  drift: boolean;
  openQuestion: boolean;
  manualHelp: boolean;
  recovery: boolean;
  topicChanged?: boolean;
  coveredPointIds?: string[];
  allowedAuxiliaryNumbers?: ReadonlySet<string>;
}

const ACTION_BY_LEVEL: Record<InterventionLevel, ControllerAction> = {
  L0: 'stay_silent',
  L1: 'show_l1_edge',
  L2: 'show_l2_keyword',
  L3: 'show_l3_scaffold',
};

/**
 * Independent Intervention Controller.
 * System 2 candidates NEVER bypass this gatekeeper:
 * enforces TTL, contextVersion matching, evidence grounding, non-pause-only triggers,
 * L0-L3 ceilings, cooldowns, dismissal suppressions, priority arbitration, and auto-withdrawal.
 */
export class InterventionController {
  private decisionSeq = 0;
  private interventionSeq = 0;
  private readonly decisionHistory: ControllerDecision[] = [];
  private readonly maxDisplayMs: number;

  constructor(private readonly config: InterventionControllerConfig) {
    this.maxDisplayMs = config.maxInterventionDisplayMs ?? Math.max(config.candidateTtlMs * 2, 18_000);
  }

  getDecisions(): ControllerDecision[] {
    return this.decisionHistory.map((d) => ({ ...d, trace: { ...d.trace } }));
  }

  private nextDecisionId(nowMs: number): string {
    return `dec_${++this.decisionSeq}_${nowMs}`;
  }

  private buildTrace(
    state: SharedCognitiveStateStore,
    signals: ControllerSignalContext,
    nowMs: number,
    rulesApplied: string[],
    candidate?: Candidate | null,
    grounding?: { checked: boolean; evidenceCount: number },
  ): ControllerInspectionTrace {
    const expiresAtMs = candidate ? isoToMs(candidate.expiresAt, 0) : 0;
    return {
      evaluatedAt: msToIso(nowMs),
      contextVersion: state.getContextVersion(),
      ...(candidate ? { candidateId: candidate.candidateId, candidateContextVersion: candidate.contextVersion } : {}),
      ...(candidate ? { ttlRemainingMs: Math.max(0, expiresAtMs - nowMs) } : {}),
      groundedChecked: grounding?.checked ?? false,
      evidenceCount: grounding?.evidenceCount ?? candidate?.evidenceIds.length ?? 0,
      cooldownRemainingMs: state.getCooldownRemainingMs(nowMs),
      ceilingLevel: state.getMaxInterventionLevel(),
      silentMode: state.isSilentMode(),
      paused: state.getSessionStatus() === 'paused',
      signalsEvaluated: {
        silenceMs: signals.silenceMs,
        semanticGap: signals.semanticGap,
        drift: signals.drift,
        openQuestion: signals.openQuestion,
        manualHelp: signals.manualHelp,
        recovery: signals.recovery,
      },
      rulesApplied,
    };
  }

  private recordDecision(decision: ControllerDecision): ControllerDecision {
    this.decisionHistory.push(decision);
    if (this.decisionHistory.length > 500) {
      this.decisionHistory.splice(0, this.decisionHistory.length - 500);
    }
    return decision;
  }

  private buildSuppressionKey(candidate: Candidate): string {
    return candidate.targetKeyPointId || candidate.targetChapterId || candidate.kind || candidate.candidateId;
  }

  /**
   * Checks whether an active Intervention must be automatically withdrawn based on updated context,
   * recovery, chapter/topic shift, or TTL expiration.
   */
  checkWithdrawals(params: {
    sessionId: string;
    state: SharedCognitiveStateStore;
    context: ContextStore;
    signals: ControllerSignalContext;
    now: number;
  }): ControllerDecision | null {
    const { sessionId, state, context, signals, now } = params;
    const active = state.getActiveIntervention();
    if (!active) return null;

    const currentVersion = state.getContextVersion();
    const activeChapterId = context.taskContext.activeChapterId;
    const sourceCandidate = state.getCandidate(active.candidateId);

    let reason: WithdrawalReason | undefined;
    let explanation = '';

    if (active.chapterId && activeChapterId && active.chapterId !== activeChapterId) {
      reason = 'chapter_changed';
      explanation = `Chapter moved from "${active.chapterId}" to "${activeChapterId}".`;
    } else if (active.contextVersion !== currentVersion) {
      reason = 'context_invalidated';
      explanation = `Context version changed from v${active.contextVersion} to v${currentVersion}.`;
    } else if (sourceCandidate && now >= isoToMs(sourceCandidate.expiresAt, 0)) {
      reason = 'candidate_expired';
      explanation = 'Source candidate TTL expired.';
    } else if (now - isoToMs(active.shownAt, now) >= this.maxDisplayMs) {
      reason = 'candidate_expired';
      explanation = 'Intervention exceeded maximum display horizon.';
    } else if (
      signals.recovery ||
      signals.verdict?.recoveryDetected ||
      signals.verdict?.interventionNeed === 'withdraw_active' ||
      (sourceCandidate?.targetKeyPointId &&
        signals.coveredPointIds?.includes(sourceCandidate.targetKeyPointId))
    ) {
      reason = 'user_recovered';
      explanation = 'Speaker recovered or covered the target point; withdrawing prompt immediately.';
    } else if (signals.topicChanged) {
      reason = 'topic_changed';
      explanation = 'Speaker cleanly transitioned to a new topic; old hint is no longer relevant.';
    }

    if (!reason) return null;

    const withdrawn = state.clearActiveIntervention(reason, now, false);
    if (!withdrawn) return null;

    return this.recordDecision({
      decisionId: this.nextDecisionId(now),
      sessionId,
      timestamp: msToIso(now),
      contextVersion: currentVersion,
      selectedAction: 'withdraw',
      level: 'L0',
      candidateId: active.candidateId,
      interventionId: withdrawn.interventionId,
      intervention: withdrawn,
      withdrawalReason: reason,
      reason: explanation,
      trace: this.buildTrace(state, signals, now, [`withdraw:${reason}`], sourceCandidate, {
        checked: true,
        evidenceCount: withdrawn.evidenceIds.length,
      }),
    });
  }

  /**
   * Explicitly dismisses an active or pending intervention and registers a dismissal suppression window.
   */
  dismiss(params: {
    sessionId: string;
    state: SharedCognitiveStateStore;
    interventionId?: string;
    candidateId?: string;
    reason?: string;
    now: number;
  }): { withdrawn?: Intervention; decision: ControllerDecision } {
    const { sessionId, state, interventionId, candidateId, now } = params;
    const active = state.getActiveIntervention();
    const targetCandidateId = candidateId ?? active?.candidateId;
    const targetCandidate = targetCandidateId ? state.getCandidate(targetCandidateId) : undefined;
    const suppressionKey = targetCandidate
      ? this.buildSuppressionKey(targetCandidate)
      : interventionId ?? 'manual_dismiss';

    state.addSuppression(
      {
        key: suppressionKey,
        reason: 'user_dismissed',
        createdAtMs: now,
        untilMs: now + this.config.dismissSuppressionMs,
      },
      now,
    );

    if (active && (!interventionId || active.interventionId === interventionId)) {
      const withdrawn = state.clearActiveIntervention('user_dismissed', now, true);
      if (withdrawn) {
        const decision = this.recordDecision({
          decisionId: this.nextDecisionId(now),
          sessionId,
          timestamp: msToIso(now),
          contextVersion: state.getContextVersion(),
          selectedAction: 'withdraw',
          level: 'L0',
          candidateId: withdrawn.candidateId,
          interventionId: withdrawn.interventionId,
          intervention: withdrawn,
          withdrawalReason: 'user_dismissed',
          reason: params.reason ?? 'User dismissed intervention; suppressing related nudges.',
          trace: this.buildTrace(
            state,
            {
              silenceMs: 0,
              semanticGap: false,
              drift: false,
              openQuestion: false,
              manualHelp: false,
              recovery: false,
            },
            now,
            ['user_dismissed', `suppress:${suppressionKey}`],
            targetCandidate,
            { checked: true, evidenceCount: withdrawn.evidenceIds.length },
          ),
        });
        return { withdrawn, decision };
      }
    }

    if (targetCandidate) {
      state.updateCandidateStatus(targetCandidate.candidateId, 'dismissed', now, {
        withdrawalReason: 'user_dismissed',
      });
    }

    const decision = this.recordDecision({
      decisionId: this.nextDecisionId(now),
      sessionId,
      timestamp: msToIso(now),
      contextVersion: state.getContextVersion(),
      selectedAction: 'stay_silent',
      level: 'L0',
      candidateId: targetCandidateId,
      suppressReason: 'user_dismissed_suppression',
      reason: 'Recorded dismissal suppression for target topic.',
      trace: this.buildTrace(
        state,
        {
          silenceMs: 0,
          semanticGap: false,
          drift: false,
          openQuestion: false,
          manualHelp: false,
          recovery: false,
        },
        now,
        ['user_dismissed_suppression'],
        targetCandidate,
      ),
    });
    return { decision };
  }

  /**
   * Arbitrates pending/submitted candidates against all Controller guardrails.
   * Never exposes ungrounded, stale, expired, silent-mode, or pause-only candidates.
   */
  evaluateCandidates(params: {
    sessionId: string;
    state: SharedCognitiveStateStore;
    context: ContextStore;
    candidates: Candidate[];
    signals: ControllerSignalContext;
    now: number;
  }): {
    decision: ControllerDecision;
    shown?: Intervention;
    supersededWithdrawn?: Intervention;
    supersededDecision?: ControllerDecision;
  } {
    const { sessionId, state, context, candidates, signals, now } = params;
    const rulesApplied: string[] = [];
    const evidenceMap = new Map<string, Evidence>(
      context.getAllEvidence().map((item) => [item.id, item]),
    );
    const forbiddenClaims = context.getContextPack()?.forbiddenClaims ?? [];

    const currentVersion = state.getContextVersion();
    const validRanked: Array<{ candidate: Candidate; grounded: boolean }> = [];
    let lastRejectReason: ControllerSuppressReason | undefined;
    let lastRejectDetail = '';

    const reject = (
      candidate: Candidate,
      suppressReason: ControllerSuppressReason,
      detail: string,
      status: Candidate['status'] = 'suppressed',
    ) => {
      state.updateCandidateStatus(candidate.candidateId, status, now, {
        suppressedReason: suppressReason,
      });
      if (!lastRejectReason) {
        lastRejectReason = suppressReason;
        lastRejectDetail = detail;
      }
      rulesApplied.push(`reject:${candidate.candidateId}:${suppressReason}`);
    };

    const sortedCandidates = [...candidates].sort((a, b) => b.priority - a.priority);

    for (const candidate of sortedCandidates) {
      if (state.getSessionStatus() === 'paused') {
        reject(candidate, 'session_paused', 'Session is paused.');
        continue;
      }
      if (state.isSilentMode()) {
        reject(candidate, 'silent_mode', 'Silent mode active; withholding visual intervention.');
        continue;
      }
      if (candidate.contextVersion !== currentVersion) {
        reject(
          candidate,
          'stale_context_version',
          `Candidate built at v${candidate.contextVersion}, current is v${currentVersion}.`,
          'expired',
        );
        continue;
      }
      if (now >= isoToMs(candidate.expiresAt, 0)) {
        reject(candidate, 'candidate_expired', 'Candidate TTL expired before display.', 'expired');
        continue;
      }

      const grounding = verifyCandidateGrounding(
        candidate,
        evidenceMap,
        forbiddenClaims,
        signals.allowedAuxiliaryNumbers,
      );
      rulesApplied.push(`grounding:${candidate.candidateId}:${grounding.ok ? 'ok' : 'fail'}`);
      if (!grounding.ok) {
        reject(candidate, 'ungrounded_evidence', grounding.reason ?? 'Failed grounding check.');
        continue;
      }

      // Pause-only suppression: silence without semantic gap, drift, open question, or manual help never triggers.
      const hasSemanticTrigger =
        signals.semanticGap || signals.drift || signals.openQuestion || signals.manualHelp;
      if (!hasSemanticTrigger && candidate.kind !== 'pace_nudge') {
        const suppressReason: ControllerSuppressReason =
          signals.silenceMs > 0 ? 'pause_only_without_gap' : 'no_semantic_need';
        reject(
          candidate,
          suppressReason,
          'Pause or fluency without semantic omission/drift/Q&A gap does not trigger intervention.',
        );
        continue;
      }

      if (signals.recovery && !signals.manualHelp && candidate.kind !== 'qa_grounding') {
        reject(
          candidate,
          'user_already_recovering',
          'Speaker is already recovering cleanly; withholding prompt.',
        );
        continue;
      }

      const ceiling = state.getMaxInterventionLevel();
      if (
        ceiling === 'L0' ||
        INTERVENTION_LEVEL_RANK[candidate.level] > INTERVENTION_LEVEL_RANK[ceiling]
      ) {
        reject(
          candidate,
          'ceiling_exceeded',
          `Candidate level ${candidate.level} exceeds max ceiling ${ceiling}.`,
        );
        continue;
      }

      const suppressKey = this.buildSuppressionKey(candidate);
      const dismissedEntry = state.isSuppressed(suppressKey, now);
      if (dismissedEntry && !signals.manualHelp) {
        reject(
          candidate,
          'user_dismissed_suppression',
          `Suppressed until ${dismissedEntry.until} after dismissal.`,
        );
        continue;
      }

      const bypassCooldown =
        signals.manualHelp || (signals.openQuestion && candidate.kind === 'qa_grounding');
      if (state.getCooldownRemainingMs(now) > 0 && !bypassCooldown) {
        reject(candidate, 'cooldown_active', 'Intervention cooldown window still active.');
        continue;
      }

      const activeCandidate = state.getActiveCandidate();
      if (activeCandidate && activeCandidate.candidateId !== candidate.candidateId) {
        const supersedes =
          signals.manualHelp ||
          candidate.kind === 'qa_grounding' ||
          candidate.priority >= activeCandidate.priority + 10;
        if (!supersedes) {
          reject(
            candidate,
            'lower_priority',
            `Active candidate ${activeCandidate.candidateId} has equal or higher priority.`,
          );
          continue;
        }
      }

      validRanked.push({ candidate, grounded: grounding.grounded });
    }

    if (validRanked.length === 0) {
      const reason = lastRejectReason ?? 'no_semantic_need';
      return {
        decision: this.recordDecision({
          decisionId: this.nextDecisionId(now),
          sessionId,
          timestamp: msToIso(now),
          contextVersion: currentVersion,
          selectedAction: 'stay_silent',
          level: 'L0',
          candidateId: sortedCandidates[0]?.candidateId,
          suppressReason: reason,
          reason: lastRejectDetail || 'No eligible candidate passes controller gating.',
          trace: this.buildTrace(
            state,
            signals,
            now,
            rulesApplied.length ? rulesApplied : [`stay_silent:${reason}`],
            sortedCandidates[0],
            { checked: true, evidenceCount: sortedCandidates[0]?.evidenceIds.length ?? 0 },
          ),
        }),
      };
    }

    const chosen = validRanked[0];
    for (let i = 1; i < validRanked.length; i++) {
      reject(
        validRanked[i].candidate,
        'lower_priority',
        `Superseded during arbitration by ${chosen.candidate.candidateId}.`,
      );
    }

    let supersededWithdrawn: Intervention | undefined;
    let supersededDecision: ControllerDecision | undefined;
    if (state.getActiveIntervention()) {
      const prev = state.clearActiveIntervention('superseded', now, false);
      if (prev) {
        supersededWithdrawn = prev;
        supersededDecision = this.recordDecision({
          decisionId: this.nextDecisionId(now),
          sessionId,
          timestamp: msToIso(now),
          contextVersion: currentVersion,
          selectedAction: 'withdraw',
          level: 'L0',
          candidateId: prev.candidateId,
          interventionId: prev.interventionId,
          intervention: prev,
          withdrawalReason: 'superseded',
          reason: `Superseded by higher-priority candidate ${chosen.candidate.candidateId}.`,
          trace: this.buildTrace(state, signals, now, ['superseded'], chosen.candidate, {
            checked: true,
            evidenceCount: prev.evidenceIds.length,
          }),
        });
      }
    }

    const intervention: Intervention = {
      interventionId: `int_${++this.interventionSeq}_${now}`,
      sessionId,
      candidateId: chosen.candidate.candidateId,
      level: chosen.candidate.level,
      title: chosen.candidate.title,
      cueText: chosen.candidate.cueText,
      ...(chosen.candidate.bullets ? { bullets: [...chosen.candidate.bullets] } : {}),
      evidenceIds: [...chosen.candidate.evidenceIds],
      grounded: chosen.grounded,
      ...(chosen.candidate.missingEvidenceNotice
        ? { missingEvidenceNotice: chosen.candidate.missingEvidenceNotice }
        : {}),
      basedOnSegmentId: chosen.candidate.basedOnSegmentId,
      contextVersion: currentVersion,
      shownAt: msToIso(now),
      chapterId: chosen.candidate.targetChapterId ?? context.taskContext.activeChapterId,
    };

    const effectiveCooldown =
      chosen.candidate.level === 'L1'
        ? Math.round(this.config.cooldownMs * 0.7)
        : this.config.cooldownMs;
    state.setActiveIntervention(intervention, effectiveCooldown, now);

    const decision = this.recordDecision({
      decisionId: this.nextDecisionId(now),
      sessionId,
      timestamp: msToIso(now),
      contextVersion: currentVersion,
      selectedAction: ACTION_BY_LEVEL[chosen.candidate.level],
      level: chosen.candidate.level,
      candidateId: chosen.candidate.candidateId,
      interventionId: intervention.interventionId,
      intervention,
      reason: chosen.candidate.triggerReason ?? `Approved grounded ${chosen.candidate.level} intervention.`,
      trace: this.buildTrace(
        state,
        signals,
        now,
        [...rulesApplied, `approved:${chosen.candidate.level}`],
        chosen.candidate,
        { checked: true, evidenceCount: intervention.evidenceIds.length },
      ),
    });

    return {
      decision,
      shown: intervention,
      ...(supersededWithdrawn ? { supersededWithdrawn, supersededDecision } : {}),
    };
  }
}
