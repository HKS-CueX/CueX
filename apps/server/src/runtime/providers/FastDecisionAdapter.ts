import type {
  CognitiveAttentionState,
  FastDecisionInput,
  FastDecisionVerdict,
  InterventionLevel,
  InterventionNeed,
  SpeakerIntent,
} from '@cuex/protocol';
import { wrapUntrustedPromptBlock } from '../../security';
import { LlamaSystemOne, type TokenDecisionClient } from '../../system1';
import { computeTermOverlap, tokenizeBilingual } from '../RetrievalProvider';
import { isoToMs } from '../time';
import type { FastDecisionProvider } from '../types';
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
  /[?？]$|(?:请问|评委|听众|我想问|能否(?:解释|说明|提供)|延迟(?:是|大概)?多少|成本多少|准确率多少|怎么验证|凭什么|有什么(?:边界|缺陷|限制)|为什么选择)/;
const RHETORICAL_HOOK_RE =
  /^(?:大家|各位)?(?:有没有|是不是)?(?:遇到过|想过|好奇|想象一下)/;

let heuristicSeq = 0;

/**
 * Deterministic local System 1 Fast Decision engine (0 LLM tokens).
 * Combines semantic omission, topic drift, open Q&A, speaker hesitation cues, and recovery signals.
 * Never triggers purely from an isolated silence pause when no semantic gap exists.
 */
export class HeuristicFastDecisionProvider implements FastDecisionProvider {
  readonly backend = 'local-heuristic-s1';
  readonly mode = 'local_fallback' as const;

  async health(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: 'Deterministic local fast-decision rules ready (0 tokens).' };
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

    const openQuestion = Boolean(
      latest &&
        (latest.speaker === 'audience' ||
          (AUDIENCE_QUESTION_RE.test(latestText) && !RHETORICAL_HOOK_RE.test(latestText))),
    );

    const explicitDrift = latest?.speaker !== 'audience' && DRIFT_CUE_RE.test(latestText);
    const weakTopicOffshoot = Boolean(
      latest &&
        latest.speaker !== 'audience' &&
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
      latencyMs: Math.max(1, Math.round(performance.now() - start)),
      backend: this.backend,
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
 * LlamaSystemOne-backed Fast Decision provider (`CUEX_SYSTEM1=real`),
 * guarded with prompt delimiters, bounded retries, timeout AbortController, and circuit breaker.
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

  async health(): Promise<{ ok: boolean; detail?: string }> {
    const circuit = this.resilience.getCircuitState(`s1:${this.backend}`);
    if (circuit.isOpen) {
      return { ok: false, detail: `Circuit breaker open after repeated S1 failures (${this.backend})` };
    }
    if (this.client.health) return this.client.health();
    return { ok: true, detail: this.backend };
  }

  async evaluate(input: FastDecisionInput, signal?: AbortSignal): Promise<FastDecisionVerdict> {
    const base = await this.heuristic.evaluate(input, signal);
    const statePayload = [
      JSON.stringify({
        goal: input.activeGoal,
        chapter: input.activeChapterTitle ?? input.activeChapterId ?? '',
        missingPoints: base.missingPointIds,
        silenceMs: input.silenceDurationMs,
        hasActiveIntervention: Boolean(input.activeIntervention),
      }),
      wrapUntrustedPromptBlock('recent_speech', input.recentSegments.at(-1)?.text ?? '', 240),
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
                'Given the current presentation state and missing points, does the speaker need a real-time cue right now (omission, drift, hesitation, or open audience question)? Answer false for fluent delivery or intentional dramatic pause.',
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
    const needScore = tokenResult.answers.need_help?.value ?? 0;
    const recoverScore = tokenResult.answers.recovery?.value ?? 0;
    const llmRecovery = Boolean(input.activeIntervention && recoverScore >= 0.68);
    const llmNeed = !llmRecovery && needScore >= 0.72;

    let recommendedLevel = base.recommendedLevel;
    let interventionNeed = base.interventionNeed;
    if (llmRecovery) {
      recommendedLevel = 'L0';
      interventionNeed = input.activeIntervention ? 'withdraw_active' : 'none';
    } else if (llmNeed && interventionNeed === 'none' && base.missingPointIds.length > 0) {
      recommendedLevel = 'L1';
      interventionNeed = 'trigger_l1';
    }

    const hasTokens = tokenResult.usage.inputTokens > 0 || tokenResult.usage.modelCalls > 0;

    return {
      ...base,
      recoveryDetected: base.recoveryDetected || llmRecovery,
      interventionNeed,
      recommendedLevel,
      latencyMs: tokenResult.latencyMs,
      backend: `${tokenResult.backend}+local-features`,
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

  async health(): Promise<{ ok: boolean; detail?: string }> {
    const primaryHealth = await this.primary.health();
    if (primaryHealth.ok && !this.lastDegraded) return primaryHealth;
    return {
      ok: false,
      detail: `Degraded to ${this.fallback.backend}: ${primaryHealth.detail ?? this.lastErrorMessage ?? 'primary unavailable'}`,
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

  async health(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: false, detail: this.missingDetail };
  }

  async evaluate(input: FastDecisionInput, signal?: AbortSignal): Promise<FastDecisionVerdict> {
    const verdict = await this.fallback.evaluate(input, signal);
    return {
      ...verdict,
      reason: `${verdict.reason} [${this.missingDetail}]`,
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

export function createFastDecisionProvider(
  mode: 'fake' | 'real',
  env: NodeJS.ProcessEnv = process.env,
): FastDecisionProvider {
  if (mode === 'fake') {
    return new HeuristicFastDecisionProvider();
  }
  if (!env.CUEX_S1_URL?.trim()) {
    return new DegradedConfigFastDecisionProvider(
      'CUEX_SYSTEM1=real requested without CUEX_S1_URL; degraded to local heuristic.',
    );
  }
  return new FallbackFastDecisionProvider(
    new LlamaFastDecisionProvider(new LlamaSystemOne()),
    new HeuristicFastDecisionProvider(),
  );
}
