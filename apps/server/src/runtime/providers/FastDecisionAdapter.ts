import {
  INTERVENTION_LEVEL_RANK,
  nowUtcIso8601,
  type CognitiveAttentionState,
  type FastDecisionInput,
  type FastDecisionVerdict,
  type InterventionLevel,
  type InterventionNeed,
  type S1ObservationSnapshot,
  type SpeakerIntent,
  type System2Guidance,
} from '@cuex/protocol';
import { wrapUntrustedPromptBlock } from '../../security';
import { LlamaSystemOne, resolveLlamaSystemOneConfig, type TokenDecisionClient } from '../../system1';
import { computeTermOverlap, tokenizeBilingual } from '../RetrievalProvider';
import { isoToMs } from '../time';
import type { FastDecisionProvider, ProviderHealthStatus } from '../types';
import { ProviderResilience } from './ProviderResilience';

const RECOVERY_CUE_RE =
  /(?:回到|刚才(?:那|这|提到)|补充(?:一下|说明)?|具体(?:来说|数据是|表现为)|先回答|关于刚才|回到主线|接下来看核心|总结一下刚才)/;
const DRIFT_CUE_RE =
  /(?:顺便(?:聊|提)|扯远了|跑题|说个题外话|我上次在|说到(?:咖啡|天气|电影|旅游)|闲聊一下|先不说这个)/;
const HESITATION_CUE_RE =
  /(?:那个[…\s，,]{1,}|怎么说呢|突然忘了|卡住了|让我想想|我想一下|等一下|忘了叫什么|uh+|um+|er+)/i;
const TRANSITION_WRAP_RE =
  /(?:差不多就是这些|这部分先讲到这|进入下一|下面我们直接看|好[,]?接下来看下|先到这里)/;
const AUDIENCE_QUESTION_RE =
  /[?？]$|(?:请问|打断一下|我想问|请问一下|想请问|评委(?:提问|想问|问)|听众(?:提问|想问)|能否(?:解释|说明|提供)|延迟(?:是|大概)?多少|成本多少|准确率多少|怎么验证|凭什么|有什么(?:边界|缺陷|限制)|为什么选择)/;
const RHETORICAL_HOOK_RE =
  /^(?:大家|各位)?(?:有没有|是不是)?(?:遇到过|想过|好奇|想象一下)/;
export const PRESENTER_GREETING_RE =
  /^(?:各位|尊敬的|现场的)?(?:评委|老师|嘉宾|听众|朋友们|大家)(?:们)?(?:好|大家好|上午好|下午好|晚上好)|^(?:大家好|各位好|谢谢大家|感谢各位|欢迎各位|欢迎大家)/;

/**
 * Returns true when an utterance begins with a standard presenter opening greeting or thank-you.
 */
export function isPresenterGreetingText(text: string): boolean {
  return PRESENTER_GREETING_RE.test(text.trim());
}

/** 校验黑板 System2Guidance 是否仍在当前上下文版本、轮次窗口与有效时间内。 */
function isGuidanceApplicable(
  guidance: System2Guidance | null | undefined,
  input: FastDecisionInput,
  nowMs: number,
): guidance is System2Guidance {
  if (!guidance) return false;
  if (guidance.contextVersion !== input.contextVersion) return false;
  if (nowMs >= guidance.expiresAtMs) return false;
  if (
    guidance.staleAfterTurnSeq !== undefined &&
    input.turnSeq !== undefined &&
    input.turnSeq > guidance.staleAfterTurnSeq
  ) {
    return false;
  }
  return true;
}

function buildEscalationReason(params: {
  openQuestion: boolean;
  topicDrift: boolean;
  semanticOmission: boolean;
  manualHelp?: boolean;
  interventionNeed: InterventionNeed;
}): string | undefined {
  if (params.manualHelp) return 'manual_help_requested';
  if (params.openQuestion) return 'live_audience_question';
  if (params.topicDrift) return 'topic_drift';
  if (params.semanticOmission) return 'semantic_omission';
  if (params.interventionNeed !== 'none' && params.interventionNeed !== 'withdraw_active') {
    return params.interventionNeed;
  }
  return undefined;
}

let heuristicSeq = 0;

/**
 * Deterministic local System 1 Fast Decision engine (0 LLM tokens).
 * Combines semantic omission, topic drift, open Q&A, speaker hesitation cues, and recovery signals.
 * Never triggers purely from an isolated silence pause when no semantic gap exists.
 */
export class HeuristicFastDecisionProvider implements FastDecisionProvider {
  readonly backend = 'local-heuristic-s1';
  readonly mode = 'local_fallback' as const;

  async health(): Promise<ProviderHealthStatus> {
    return {
      ok: true,
      detail: 'Deterministic local fast-decision rules ready (0 tokens).',
      provider: this.backend,
      model: 'rule_zero',
      degraded: false,
      fallbackActive: false,
      promptFormat: 'rule_zero',
      calibrated: false,
      lastHealthCheckAt: nowUtcIso8601(),
    };
  }

  async evaluate(input: FastDecisionInput, signal?: AbortSignal): Promise<FastDecisionVerdict> {
    signal?.throwIfAborted();
    const start = performance.now();
    const timestampMs = isoToMs(input.timestamp, Date.now());
    const latest = input.recentSegments.at(-1);
    const presenterRecent = input.recentSegments
      .filter((s) => s.speaker !== 'audience')
      .slice(-4)
      .map((s) => s.text)
      .join(' ');
    const latestText = latest?.text?.trim() ?? '';

    const coveredPointIds: string[] = [];
    const missingPointIds: string[] = [];

    for (const point of input.expectedPoints) {
      if (point.covered) {
        coveredPointIds.push(point.id);
        continue;
      }
      const matchLatest = computeTermOverlap(latestText, point.label);
      const matchRecent = computeTermOverlap(presenterRecent, point.label);
      if (
        matchLatest.matchedDistinct >= 2 ||
        matchLatest.ratio >= 0.34 ||
        matchRecent.matchedDistinct >= 2 ||
        matchRecent.ratio >= 0.4
      ) {
        coveredPointIds.push(point.id);
      } else {
        missingPointIds.push(point.id);
      }
    }

    const goalChapterOverlap = computeTermOverlap(
      latestText,
      `${input.activeGoal} ${input.activeChapterTitle ?? ''} ${input.expectedPoints.map((p) => p.label).join(' ')}`,
    );

    const presenterGreeting = latest?.speaker !== 'audience' && isPresenterGreetingText(latestText);
    const openQuestion = Boolean(
      latest &&
        (latest.speaker === 'audience' ||
          (!presenterGreeting && AUDIENCE_QUESTION_RE.test(latestText) && !RHETORICAL_HOOK_RE.test(latestText))),
    );

    const explicitDrift = latest?.speaker !== 'audience' && DRIFT_CUE_RE.test(latestText);
    const weakTopicOffshoot = Boolean(
      latest &&
        latest.speaker !== 'audience' &&
        !presenterGreeting &&
        !openQuestion &&
        tokenizeBilingual(latestText).length >= 5 &&
        goalChapterOverlap.matchedDistinct === 0 &&
        missingPointIds.length > 0 &&
        !/^(?:大家好|谢谢|下面|接下来|总结|欢迎)/.test(latestText),
    );
    const topicDrift = explicitDrift || weakTopicOffshoot;

    const hesitationPhrase = latest?.speaker !== 'audience' && HESITATION_CUE_RE.test(latestText);
    const wrappingWithGaps =
      latest?.speaker !== 'audience' &&
      TRANSITION_WRAP_RE.test(latestText) &&
      missingPointIds.length > 0;
    const stalledSilenceWithGap =
      input.silenceDurationMs >= 1_600 &&
      (hesitationPhrase || (missingPointIds.length > 0 && latestText.length > 0 && latestText.length < 18));

    const semanticOmission =
      wrappingWithGaps ||
      (missingPointIds.length > 0 && (hesitationPhrase || stalledSilenceWithGap));

    const recoveryHitTarget = Boolean(
      input.activeCandidate &&
        latestText &&
        (RECOVERY_CUE_RE.test(latestText) ||
          computeTermOverlap(
            latestText,
            `${input.activeCandidate.title} ${input.activeCandidate.cueText}`,
          ).matchedDistinct >= 2 ||
          (coveredPointIds.length > 0 &&
            input.expectedPoints.some(
              (p) => !p.covered && coveredPointIds.includes(p.id),
            ))),
    );

    const recovery = Boolean(
      (input.activeIntervention || input.activeCandidate) &&
        !topicDrift &&
        !hesitationPhrase &&
        recoveryHitTarget,
    );

    let cognitiveState: CognitiveAttentionState = 'fluent';
    let speakerIntent: SpeakerIntent = 'presenting';
    let interventionNeed: InterventionNeed = 'none';
    let recommendedLevel: InterventionLevel = 'L0';
    let confidence = 0.86;
    let reason = 'Speaker is on track and fluent; staying silent (L0).';

    if (recovery) {
      cognitiveState = 'recovering';
      speakerIntent = 'presenting';
      interventionNeed = input.activeIntervention ? 'withdraw_active' : 'none';
      recommendedLevel = 'L0';
      confidence = 0.91;
      reason = 'Speaker recovered or addressed the target gap; withdrawing active prompt.';
    } else if (input.manualHelpRequested) {
      cognitiveState = 'hesitating';
      speakerIntent = 'searching_for_word';
      interventionNeed = 'trigger_l3';
      recommendedLevel = 'L3';
      confidence = 0.95;
      reason = 'Presenter explicitly requested live assistance.';
    } else if (openQuestion) {
      cognitiveState = 'answering_question';
      speakerIntent = 'responding_to_qa';
      const complexQa = /(?:为什么|比较|区别|边界|原理|架构|如何处理|怎么保证)/.test(latestText);
      interventionNeed = complexQa ? 'trigger_l3' : 'trigger_l2';
      recommendedLevel = complexQa ? 'L3' : 'L2';
      confidence = 0.9;
      reason = 'Detected live audience question; preparing grounded Q&A evidence card.';
    } else if (hesitationPhrase && missingPointIds.length > 0) {
      cognitiveState = 'hesitating';
      speakerIntent = 'searching_for_word';
      interventionNeed = 'trigger_l2';
      recommendedLevel = 'L2';
      confidence = 0.88;
      reason = 'Detected hesitation marker paired with uncovered required points.';
    } else if (topicDrift) {
      cognitiveState = 'drifting';
      speakerIntent = 'elaborating';
      interventionNeed = missingPointIds.length >= 2 ? 'trigger_l2' : 'trigger_l1';
      recommendedLevel = missingPointIds.length >= 2 ? 'L2' : 'L1';
      confidence = 0.82;
      reason = 'Latest utterance drifted away from current chapter points.';
    } else if (semanticOmission) {
      cognitiveState = 'omitting_key_point';
      speakerIntent = wrappingWithGaps ? 'wrapping_up' : 'presenting';
      interventionNeed = wrappingWithGaps ? 'trigger_l2' : 'trigger_l1';
      recommendedLevel = wrappingWithGaps ? 'L2' : 'L1';
      confidence = 0.84;
      reason = 'Speaker is moving on or stalling while required chapter points remain uncovered.';
    } else if (input.silenceDurationMs > 0) {
      cognitiveState = 'on_track';
      speakerIntent = 'pausing_for_effect';
      interventionNeed = 'none';
      recommendedLevel = 'L0';
      confidence = 0.89;
      reason = 'Deliberate pause detected with no semantic omission or drift; suppressing intervention.';
    }

    // 读取黑板 System2Guidance：若未被紧急新问题或明确偏离覆盖，则在非高紧急场景下服从克制指导。
    let guidanceAppliedRevision: number | undefined;
    if (isGuidanceApplicable(input.activeGuidance, input, timestampMs)) {
      const g = input.activeGuidance;
      if (g.recommendedBias === 'stay_silent' || g.recommendedBias === 'recovery_hold') {
        if (!openQuestion && !explicitDrift && !input.manualHelpRequested && !recovery) {
          interventionNeed = 'none';
          recommendedLevel = 'L0';
          guidanceAppliedRevision = g.revision;
          reason = `遵循黑板指导 v${g.revision}（${g.focusDirective}）：保持 L0 静默。`;
        }
      } else if (
        (g.recommendedBias === 'prefer_l1' || g.recommendedBias === 'prefer_l2' || g.recommendedBias === 'prefer_l3') &&
        interventionNeed !== 'none' &&
        interventionNeed !== 'withdraw_active' &&
        !openQuestion
      ) {
        const guidedLevel: InterventionLevel =
          g.preferredLevel ??
          (g.recommendedBias === 'prefer_l3' ? 'L3' : g.recommendedBias === 'prefer_l2' ? 'L2' : 'L1');
        if (INTERVENTION_LEVEL_RANK[guidedLevel] <= INTERVENTION_LEVEL_RANK[recommendedLevel] || g.recommendedBias === 'prefer_l2') {
          recommendedLevel = guidedLevel;
          interventionNeed =
            guidedLevel === 'L3' ? 'trigger_l3' : guidedLevel === 'L2' ? 'trigger_l2' : 'trigger_l1';
          guidanceAppliedRevision = g.revision;
        }
      }
    }

    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    const escalationReason = buildEscalationReason({
      openQuestion,
      topicDrift,
      semanticOmission,
      manualHelp: input.manualHelpRequested,
      interventionNeed,
    });
    const observation: S1ObservationSnapshot = {
      turnSeq: input.turnSeq ?? 0,
      observedAtMs: timestampMs,
      observedAt: input.timestamp,
      decisionType: 'unknown',
      selectedSlot: -1,
      label: cognitiveState,
      calibratedConfidence: confidence,
      margin: 1,
      entropy: 0,
      ...(escalationReason ? { escalationReason } : {}),
      escalatedToS2: Boolean(escalationReason),
      latencyMs,
      degraded: false,
      providerKind: 'local_rule_zero',
      model: 'rule_zero',
      promptFormat: 'rule_zero',
      calibrated: false,
      ...(guidanceAppliedRevision !== undefined ? { guidanceAppliedRevision } : {}),
      cognitiveState,
      interventionNeed,
    };

    return {
      requestId: `s1_${++heuristicSeq}_${timestampMs}`,
      sessionId: input.sessionId,
      contextVersion: input.contextVersion,
      timestamp: input.timestamp,
      cognitiveState,
      speakerIntent,
      interventionNeed,
      recommendedLevel,
      recoveryDetected: recovery,
      confidence,
      coveredPointIds,
      missingPointIds,
      ...(openQuestion ? { detectedQuestion: latestText } : {}),
      driftDetected: topicDrift,
      reason,
      signals: {
        silenceMs: input.silenceDurationMs,
        semanticOmission,
        topicDrift,
        openQuestion,
        recovery,
      },
      latencyMs,
      backend: this.backend,
      observation,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        modelCalls: 0,
        retries: 0,
        usageSource: 'local_rule_zero',
        degraded: false,
        costFen: 0,
        provider: this.backend,
      },
    };
  }
}

export interface LlamaFastDecisionOptions {
  resilience?: ProviderResilience;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * 基于 Colab JEV-27B / llama.cpp 单 Token 受限分类头的 System 1 快速认知决策器（`CUEX_SYSTEM1=real`）。
 * 消费黑板 System2Guidance、当前章回待覆盖要点、近期转写与停顿/提问特征，
 * 在本地安全隔离与温度校准读取下裁决现场提示与是否异步唤醒 System 2。
 */
export class LlamaFastDecisionProvider implements FastDecisionProvider {
  readonly backend: string;
  readonly mode = 'real' as const;
  private readonly heuristic = new HeuristicFastDecisionProvider();
  private readonly resilience: ProviderResilience;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(
    private readonly client: TokenDecisionClient = new LlamaSystemOne(),
    opts: LlamaFastDecisionOptions = {},
  ) {
    this.backend = client.backend;
    this.resilience = opts.resilience ?? new ProviderResilience({ failureThreshold: 3, cooldownMs: 15_000 });
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.CUEX_S1_TIMEOUT_MS ?? 2_500);
    this.maxRetries = opts.maxRetries ?? 1;
    this.baseDelayMs = opts.baseDelayMs ?? 40;
  }

  async health(): Promise<ProviderHealthStatus> {
    const circuit = this.resilience.getCircuitState(`s1:${this.backend}`);
    if (circuit.isOpen) {
      return {
        ok: false,
        detail: `Circuit breaker open after repeated S1 failures (${this.backend})`,
        provider: this.backend,
        model: this.client.model,
        promptFormat: this.client.promptFormat,
        calibrated: this.client.calibrated,
        degraded: true,
        fallbackActive: true,
        fallbackReason: 'System 1 circuit breaker open',
        lastHealthCheckAt: nowUtcIso8601(),
      };
    }
    if (this.client.health) {
      const h = await this.client.health();
      return {
        ok: h.ok,
        detail: h.detail,
        provider: h.provider ?? this.backend,
        model: h.model ?? this.client.model,
        promptFormat: h.promptFormat ?? this.client.promptFormat,
        calibrated: h.calibrated ?? this.client.calibrated,
        degraded: !h.ok,
        fallbackActive: !h.ok,
        ...(!h.ok && h.detail ? { fallbackReason: h.detail } : {}),
        lastHealthCheckAt: nowUtcIso8601(),
      };
    }
    return {
      ok: true,
      detail: this.backend,
      provider: this.backend,
      model: this.client.model,
      promptFormat: this.client.promptFormat,
      calibrated: this.client.calibrated,
      degraded: false,
      fallbackActive: false,
      lastHealthCheckAt: nowUtcIso8601(),
    };
  }

  async evaluate(input: FastDecisionInput, signal?: AbortSignal): Promise<FastDecisionVerdict> {
    const base = await this.heuristic.evaluate(input, signal);
    const nowMs = isoToMs(input.timestamp, Date.now());
    const missingPointLabels = input.expectedPoints
      .filter((pt) => base.missingPointIds.includes(pt.id))
      .map((pt) => pt.label);
    const guidance = isGuidanceApplicable(input.activeGuidance, input, nowMs)
      ? input.activeGuidance
      : undefined;

    const latestSegment = input.recentSegments.at(-1);
    const isPresenterGreeting =
      latestSegment?.speaker !== 'audience' && isPresenterGreetingText(latestSegment?.text ?? '');

    const statePayload = [
      JSON.stringify({
        turnSeq: input.turnSeq ?? 0,
        goal: input.activeGoal,
        chapter: input.activeChapterTitle ?? input.activeChapterId ?? '',
        openGaps: missingPointLabels.slice(0, 4),
        missingPointIds: base.missingPointIds,
        silenceMs: input.silenceDurationMs,
        hasActiveIntervention: Boolean(input.activeIntervention),
        manualHelpRequested: Boolean(input.manualHelpRequested),
        ...(guidance
          ? {
              system2Guidance: {
                revision: guidance.revision,
                focusDirective: guidance.focusDirective,
                recommendedBias: guidance.recommendedBias,
                strategyHints: guidance.strategyHints.slice(0, 2),
              },
            }
          : {}),
      }),
      wrapUntrustedPromptBlock(
        'recent_speech',
        input.recentSegments
          .slice(-3)
          .map((s) => `${s.speaker}: ${s.text}`)
          .join('\n'),
        360,
      ),
    ].join('\n');

    const outcome = await this.resilience.execute({
      breakerKey: `s1:${this.backend}`,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      baseDelayMs: this.baseDelayMs,
      signal,
      operation: (attemptSignal) =>
        this.client.decide(
          statePayload,
          {
            need_help: {
              kind: 'noul',
              question:
                'Given the presentation chapter goal, open gaps, and optional System2Guidance, does the speaker need a real-time cue right now (omission, drift, hesitation, or open audience question)? Answer false for fluent delivery, opening greeting, or intentional dramatic pause.',
            },
            recovery: {
              kind: 'noul',
              question:
                'If there is an active cue, has the latest speech started recovering back on track or answering the missing point?',
            },
          },
          attemptSignal,
        ),
    });

    if (!outcome.ok) {
      const err = new Error(`[${outcome.errorCode}] ${outcome.message} (retries=${outcome.retries})`);
      (err as Error & { retries?: number }).retries = outcome.retries;
      throw err;
    }

    const tokenResult = outcome.value;
    const needAns = tokenResult.answers.need_help;
    const recAns = tokenResult.answers.recovery;
    const needScore = needAns?.value ?? 0;
    const recoverScore = recAns?.value ?? 0;
    const llmRecovery = Boolean(input.activeIntervention && recoverScore >= 0.68);
    const urgentOverride =
      Boolean(input.manualHelpRequested) ||
      Boolean(base.signals.openQuestion) ||
      Boolean(base.driftDetected);

    // 若黑板 System2Guidance 指示 stay_silent 且非紧急直问/偏离，则提高触发阈值避免过度打扰。
    const needThreshold =
      guidance?.recommendedBias === 'stay_silent' && !urgentOverride
        ? 0.88
        : guidance?.recommendedBias === 'prefer_l2' || guidance?.recommendedBias === 'prefer_l3'
          ? 0.62
          : 0.72;
    const llmNeed = !llmRecovery && !isPresenterGreeting && needScore >= needThreshold;

    let cognitiveState = base.cognitiveState;
    let recommendedLevel = base.recommendedLevel;
    let interventionNeed = base.interventionNeed;
    let guidanceAppliedRevision = base.observation?.guidanceAppliedRevision;

    if (llmRecovery) {
      cognitiveState = 'recovering';
      recommendedLevel = 'L0';
      interventionNeed = input.activeIntervention ? 'withdraw_active' : 'none';
    } else if (llmNeed && interventionNeed === 'none' && (base.missingPointIds.length > 0 || base.driftDetected)) {
      const guidedLevel = guidance?.preferredLevel;
      recommendedLevel =
        guidedLevel && guidedLevel !== 'L0'
          ? guidedLevel
          : guidance?.recommendedBias === 'prefer_l2'
            ? 'L2'
            : 'L1';
      interventionNeed =
        recommendedLevel === 'L3' ? 'trigger_l3' : recommendedLevel === 'L2' ? 'trigger_l2' : 'trigger_l1';
      if (cognitiveState === 'fluent' || cognitiveState === 'on_track') {
        cognitiveState = base.driftDetected ? 'drifting' : 'omitting_key_point';
      }
      if (guidance) {
        guidanceAppliedRevision = guidance.revision;
      }
    } else if (isPresenterGreeting && !base.signals.openQuestion) {
      cognitiveState = 'fluent';
      recommendedLevel = 'L0';
      interventionNeed = 'none';
    } else if (guidance && guidanceAppliedRevision === undefined) {
      guidanceAppliedRevision = guidance.revision;
    }

    const hasTokens = tokenResult.usage.inputTokens > 0 || tokenResult.usage.modelCalls > 0;
    const escalationReason = buildEscalationReason({
      openQuestion: base.signals.openQuestion,
      topicDrift: base.driftDetected,
      semanticOmission: base.signals.semanticOmission || (llmNeed && base.missingPointIds.length > 0),
      manualHelp: input.manualHelpRequested,
      interventionNeed,
    });
    const observation: S1ObservationSnapshot = {
      turnSeq: input.turnSeq ?? 0,
      observedAtMs: nowMs,
      observedAt: input.timestamp,
      decisionType: needAns?.kind ?? 'noul',
      selectedSlot: needAns?.selectedSlot ?? (needAns?.top === 'true' ? 1 : 0),
      label: needAns?.top ?? String(llmNeed),
      calibratedConfidence: Number(Math.max(needScore, 1 - needScore).toFixed(4)),
      margin: needAns?.margin ?? Number(Math.abs(needScore - (1 - needScore)).toFixed(6)),
      entropy: needAns?.entropy ?? 0,
      ...(escalationReason ? { escalationReason } : {}),
      escalatedToS2: Boolean(escalationReason),
      latencyMs: tokenResult.latencyMs,
      degraded: false,
      providerKind: this.client.providerKind ?? 'colab_jev',
      model: tokenResult.model ?? this.client.model,
      promptFormat: tokenResult.promptFormat ?? this.client.promptFormat ?? 'jev-v1',
      calibrated: tokenResult.calibrated ?? this.client.calibrated ?? true,
      ...(guidanceAppliedRevision !== undefined ? { guidanceAppliedRevision } : {}),
      cognitiveState,
      interventionNeed,
    };

    return {
      ...base,
      cognitiveState,
      recoveryDetected: base.recoveryDetected || llmRecovery,
      interventionNeed,
      recommendedLevel,
      latencyMs: tokenResult.latencyMs,
      backend: `${tokenResult.backend}+local-features`,
      observation,
      usage: {
        inputTokens: tokenResult.usage.inputTokens,
        outputTokens: tokenResult.usage.outputTokens,
        cachedInputTokens: tokenResult.usage.cachedInputTokens,
        modelCalls: tokenResult.usage.modelCalls,
        retries: outcome.retries,
        usageSource: hasTokens ? 'provider_reported' : 'local_rule_zero',
        degraded: false,
        costFen: 0,
        provider: tokenResult.backend,
        ...(tokenResult.model ?? this.client.model
          ? { model: tokenResult.model ?? this.client.model }
          : {}),
      },
    };
  }
}

export class FallbackFastDecisionProvider implements FastDecisionProvider {
  private lastMode: 'real' | 'local_fallback' = 'real';
  private lastBackend: string;
  private lastDegraded = false;
  private lastErrorMessage?: string;

  constructor(
    private readonly primary: FastDecisionProvider,
    private readonly fallback: FastDecisionProvider = new HeuristicFastDecisionProvider(),
  ) {
    this.lastBackend = primary.backend;
  }

  get backend(): string {
    return this.lastBackend;
  }

  get mode(): 'real' | 'local_fallback' {
    return this.lastMode;
  }

  async health(): Promise<ProviderHealthStatus> {
    const primaryHealth = await this.primary.health();
    if (primaryHealth.ok && !this.lastDegraded) {
      return {
        ...primaryHealth,
        fallbackActive: false,
      };
    }
    const reason = primaryHealth.fallbackReason ?? primaryHealth.detail ?? this.lastErrorMessage ?? 'primary unavailable';
    return {
      ok: false,
      detail: `Degraded to ${this.fallback.backend}: ${reason}`,
      provider: primaryHealth.provider ?? this.fallback.backend,
      model: primaryHealth.model,
      promptFormat: primaryHealth.promptFormat ?? 'rule_zero',
      calibrated: primaryHealth.calibrated ?? false,
      degraded: true,
      fallbackActive: true,
      fallbackReason: reason,
      lastHealthCheckAt: primaryHealth.lastHealthCheckAt ?? nowUtcIso8601(),
    };
  }

  async evaluate(input: FastDecisionInput, signal?: AbortSignal): Promise<FastDecisionVerdict> {
    try {
      const verdict = await this.primary.evaluate(input, signal);
      this.lastMode = this.primary.mode;
      this.lastBackend = this.primary.backend;
      this.lastDegraded = Boolean(verdict.usage?.degraded);
      this.lastErrorMessage = undefined;
      return verdict;
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastMode = 'local_fallback';
      this.lastBackend = this.fallback.backend;
      this.lastDegraded = true;
      const errMsg = error instanceof Error ? error.message : 'primary failure';
      this.lastErrorMessage = errMsg;
      const primaryRetries = (error as { retries?: number })?.retries ?? 0;
      const verdict = await this.fallback.evaluate(input, signal);
      return {
        ...verdict,
        reason: `${verdict.reason} [degraded fallback after ${errMsg}]`,
        ...(verdict.observation
          ? {
              observation: {
                ...verdict.observation,
                degraded: true,
                providerKind: 'local_rule_zero',
                promptFormat: 'rule_zero',
                calibrated: false,
              },
            }
          : {}),
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          modelCalls: 0,
          retries: (verdict.usage?.retries ?? 0) + primaryRetries,
          usageSource: 'local_rule_zero',
          degraded: true,
          costFen: 0,
          provider: this.fallback.backend,
        },
      };
    }
  }
}

class DegradedConfigFastDecisionProvider implements FastDecisionProvider {
  readonly backend = 'local-heuristic-s1 (degraded-unconfigured)';
  readonly mode = 'local_fallback' as const;
  private readonly fallback = new HeuristicFastDecisionProvider();

  constructor(private readonly missingDetail: string) {}

  async health(): Promise<ProviderHealthStatus> {
    return {
      ok: false,
      detail: this.missingDetail,
      provider: this.backend,
      model: 'rule_zero',
      promptFormat: 'rule_zero',
      calibrated: false,
      degraded: true,
      fallbackActive: true,
      fallbackReason: this.missingDetail,
      lastHealthCheckAt: nowUtcIso8601(),
    };
  }

  async evaluate(input: FastDecisionInput, signal?: AbortSignal): Promise<FastDecisionVerdict> {
    const verdict = await this.fallback.evaluate(input, signal);
    return {
      ...verdict,
      reason: `${verdict.reason} [${this.missingDetail}]`,
      ...(verdict.observation
        ? {
            observation: {
              ...verdict.observation,
              degraded: true,
              providerKind: 'local_rule_zero',
              promptFormat: 'rule_zero',
              calibrated: false,
            },
          }
        : {}),
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        modelCalls: 0,
        retries: 0,
        usageSource: 'local_rule_zero',
        degraded: true,
        costFen: 0,
        provider: this.backend,
      },
    };
  }
}

/**
 * 构建领域无关的 System 1 快速认知决策提供方。
 * 注意：默认 `real` 路由强制走 Colab/本地 JEV-Like `LlamaSystemOne` 栈并包裹启发式降级兜底，
 * 绝不将 CPA 云端推理网关作为默认 System 1 路由。
 */
export function createFastDecisionProvider(
  mode: 'fake' | 'real',
  env: NodeJS.ProcessEnv = process.env,
  opts?: { client?: TokenDecisionClient },
): FastDecisionProvider {
  if (mode === 'fake') {
    return new HeuristicFastDecisionProvider();
  }
  if (opts?.client) {
    return new FallbackFastDecisionProvider(
      new LlamaFastDecisionProvider(opts.client),
      new HeuristicFastDecisionProvider(),
    );
  }
  const s1Cfg = resolveLlamaSystemOneConfig(env);
  if (!s1Cfg) {
    return new DegradedConfigFastDecisionProvider(
      'CUEX_SYSTEM1=real requested without CUEX_S1_URL (or remote Bearer key); degraded to local heuristic.',
    );
  }
  return new FallbackFastDecisionProvider(
    new LlamaFastDecisionProvider(new LlamaSystemOne({ env })),
    new HeuristicFastDecisionProvider(),
  );
}
