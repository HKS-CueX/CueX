import {
  nowUtcIso8601,
  type Candidate,
  type CandidateKind,
  type InterventionLevel,
  type ProviderUsageRecord,
  type SlowReasoningCandidateRequest,
  type SlowReasoningCandidateResult,
} from '@cuex/protocol';
import { clampSpoken } from '../../system2/spoken';
import { isoToMs, msToIso } from '../time';
import type { ProviderHealthStatus, SlowReasoningProvider } from '../types';
import { CpaClient, CpaSlowReasoningProvider, resolveCpaConfig } from './CpaProviderAdapter';

let candidateSeq = 0;

function nextCandidateId(nowMs: number): string {
  return `cand_${++candidateSeq}_${nowMs}`;
}

function triggerToCandidateKind(
  triggerKind: SlowReasoningCandidateRequest['triggerKind'],
): CandidateKind {
  switch (triggerKind) {
    case 'live_qa':
      return 'qa_grounding';
    case 'drift':
      return 'drift_recovery';
    case 'pace_overtime':
      return 'pace_nudge';
    case 'manual_help':
      return 'manual_scaffold';
    case 'omission':
    case 'hesitation':
    default:
      return 'omission_cue';
  }
}

/**
 * Deterministic local System 2 candidate synthesizer (0 LLM tokens).
 * Guarantees strict evidence grounding and explicit missing-evidence honesty.
 */
export class LocalSlowReasoningProvider implements SlowReasoningProvider {
  readonly backend = 'local-grounded-synthesizer';
  readonly mode = 'local_fallback' as const;
  private readonly defaultTtlMs: number;

  constructor(opts?: { candidateTtlMs?: number }) {
    this.defaultTtlMs = opts?.candidateTtlMs ?? 12_000;
  }

  async health(): Promise<ProviderHealthStatus> {
    return {
      ok: true,
      detail: 'Local grounded candidate synthesizer ready (0 tokens).',
      provider: this.backend,
      degraded: false,
      lastHealthCheckAt: nowUtcIso8601(),
    };
  }

  async synthesize(
    request: SlowReasoningCandidateRequest,
    signal?: AbortSignal,
  ): Promise<SlowReasoningCandidateResult> {
    signal?.throwIfAborted();
    const start = performance.now();
    const requestMs = isoToMs(request.timestamp, Date.now());
    const zeroUsage: ProviderUsageRecord = {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      modelCalls: 0,
      retries: 0,
      usageSource: 'local_rule_zero',
      degraded: false,
      costFen: 0,
      provider: this.backend,
    };

    const topEvidence = request.retrievedEvidence.slice(0, 2);
    const evidenceIds = topEvidence.map((item) => item.id);
    const expiresAt = msToIso(requestMs + this.defaultTtlMs);

    if (request.triggerKind === 'live_qa' && topEvidence.length === 0) {
      const notice =
        '当前已确认的汇报资料与事实白名单中未收录该问题的实测数据或依据，建议坦诚说明当前暂无该项数据支持。';
      const candidate: Candidate = {
        candidateId: nextCandidateId(requestMs),
        sessionId: request.sessionId,
        level: request.requestedLevel === 'L3' ? 'L2' : request.requestedLevel,
        title: '问答依据缺失提醒',
        cueText: '资料库未覆盖该数据，请坦诚说明暂无已核验记录。',
        bullets: ['如确需补充，建议会后依据正式文档核对后答复。'],
        priority: 95,
        ttlMs: this.defaultTtlMs,
        expiresAt,
        contextVersion: request.contextVersion,
        evidenceIds: [],
        basedOnSegmentId: request.basedOnSegmentId,
        status: 'pending',
        createdAt: request.timestamp,
        kind: 'missing_evidence_notice',
        grounded: false,
        missingEvidenceNotice: notice,
        triggerReason: 'Audience question has no matching verified Evidence.',
        targetChapterId: request.activeChapterId,
      };
      return {
        requestId: request.requestId,
        sessionId: request.sessionId,
        contextVersion: request.contextVersion,
        timestamp: request.timestamp,
        status: 'insufficient_evidence',
        candidate,
        evidenceIds: [],
        grounded: false,
        ungroundedNotice: notice,
        rationale: 'No verified Evidence matched the live question; issuing honest missing-evidence notice.',
        latencyMs: Math.max(1, Math.round(performance.now() - start)),
        backend: this.backend,
        usage: zeroUsage,
      };
    }

    const level: InterventionLevel = request.requestedLevel === 'L0' ? 'L2' : request.requestedLevel;
    const primaryPoint = request.missingPoints?.[0];
    const primaryEvidence = topEvidence[0];

    let title = '临场关键提醒';
    let cueText = '';
    let bullets: string[] | undefined;
    let priority = 70;

    if (request.triggerKind === 'live_qa' && primaryEvidence) {
      title = level === 'L3' ? 'Q&A 事实应答框架' : 'Q&A 核验事实卡';
      cueText = clampSpoken(primaryEvidence.text, 56);
      bullets =
        level === 'L3'
          ? [
              `结论直答：${clampSpoken(primaryEvidence.text, 48)}`,
              ...(topEvidence[1] ? [`补充依据：${clampSpoken(topEvidence[1].text, 48)}`] : []),
              `来源标注：${primaryEvidence.source}`,
            ]
          : topEvidence.map((item) => clampSpoken(item.text, 52));
      priority = 92;
    } else if (request.triggerKind === 'drift') {
      title = '话题收束提醒';
      cueText = primaryPoint
        ? `回到本节重点：${clampSpoken(primaryPoint.label, 34)}`
        : `收束回到：${clampSpoken(request.activeChapterTitle ?? request.activeGoal, 36)}`;
      bullets = primaryPoint ? [`待补要点：${primaryPoint.label}`] : undefined;
      priority = 76;
    } else if (request.triggerKind === 'manual_help') {
      title = '主动呼出结构框架';
      cueText = primaryEvidence
        ? clampSpoken(primaryEvidence.text, 52)
        : primaryPoint
          ? `围绕「${clampSpoken(primaryPoint.label, 28)}」展开`
          : `聚焦本节目标：${clampSpoken(request.activeChapterTitle ?? request.activeGoal, 34)}`;
      bullets = [
        ...(request.missingPoints?.slice(0, 2).map((p) => `待讲要点：${p.label}`) ?? []),
        ...(topEvidence.map((e) => `依据：${clampSpoken(e.text, 46)}`) ?? []),
      ].slice(0, 3);
      priority = 96;
    } else if (request.triggerKind === 'omission' || request.triggerKind === 'hesitation') {
      title = level === 'L1' ? '核心要点提醒' : '遗漏要点补提';
      cueText = primaryPoint
        ? `补提：${clampSpoken(primaryPoint.label, 42)}`
        : primaryEvidence
          ? `补提：${clampSpoken(primaryEvidence.text, 42)}`
          : `回到本节：${clampSpoken(request.activeChapterTitle ?? request.activeGoal, 36)}`;
      bullets =
        level === 'L1'
          ? undefined
          : [
              ...(request.missingPoints?.slice(0, 2).map((p) => p.label) ?? []),
              ...(primaryEvidence ? [`事实参考：${clampSpoken(primaryEvidence.text, 48)}`] : []),
            ].slice(0, 2);
      priority = 80;
    } else {
      title = '节奏收束提示';
      cueText = `准备收尾本节：${clampSpoken(request.activeChapterTitle ?? request.activeGoal, 36)}`;
      priority = 64;
    }

    const candidate: Candidate = {
      candidateId: nextCandidateId(requestMs),
      sessionId: request.sessionId,
      level,
      title,
      cueText,
      ...(bullets && bullets.length > 0 ? { bullets } : {}),
      priority,
      ttlMs: this.defaultTtlMs,
      expiresAt,
      contextVersion: request.contextVersion,
      evidenceIds,
      basedOnSegmentId: request.basedOnSegmentId,
      status: 'pending',
      createdAt: request.timestamp,
      kind: triggerToCandidateKind(request.triggerKind),
      grounded: true,
      triggerReason: `Prepared ${level} candidate for ${request.triggerKind}.`,
      targetChapterId: request.activeChapterId,
      ...(primaryPoint ? { targetKeyPointId: primaryPoint.id } : {}),
    };

    return {
      requestId: request.requestId,
      sessionId: request.sessionId,
      contextVersion: request.contextVersion,
      timestamp: request.timestamp,
      status: 'synthesized',
      candidate,
      evidenceIds,
      grounded: true,
      rationale: `Locally synthesized ${level} candidate grounded in ${evidenceIds.length} evidence item(s).`,
      latencyMs: Math.max(1, Math.round(performance.now() - start)),
      backend: this.backend,
      usage: zeroUsage,
    };
  }
}

export class FallbackSlowReasoningProvider implements SlowReasoningProvider {
  private lastMode: 'real' | 'local_fallback' = 'real';
  private lastBackend: string;
  private lastDegraded = false;
  private lastErrorMessage?: string;

  constructor(
    private readonly primary: SlowReasoningProvider,
    private readonly fallback: SlowReasoningProvider = new LocalSlowReasoningProvider(),
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
    if (primaryHealth.ok && !this.lastDegraded) return primaryHealth;
    return {
      ok: false,
      detail: `Degraded to ${this.fallback.backend}: ${primaryHealth.detail ?? this.lastErrorMessage ?? 'primary unavailable'}`,
      provider: primaryHealth.provider ?? this.fallback.backend,
      model: primaryHealth.model,
      degraded: true,
      lastHealthCheckAt: primaryHealth.lastHealthCheckAt ?? nowUtcIso8601(),
    };
  }

  async synthesize(
    request: SlowReasoningCandidateRequest,
    signal?: AbortSignal,
  ): Promise<SlowReasoningCandidateResult> {
    try {
      const result = await this.primary.synthesize(request, signal);
      this.lastMode = this.primary.mode;
      this.lastBackend = this.primary.backend;
      this.lastDegraded = Boolean(result.usage?.degraded);
      this.lastErrorMessage = undefined;
      return result;
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastMode = 'local_fallback';
      this.lastBackend = this.fallback.backend;
      this.lastDegraded = true;
      const errMsg = error instanceof Error ? error.message : 'primary error';
      this.lastErrorMessage = errMsg;
      const primaryRetries = (error as { retries?: number })?.retries ?? 0;
      const fallbackResult = await this.fallback.synthesize(request, signal);
      return {
        ...fallbackResult,
        rationale: `${fallbackResult.rationale} [degraded fallback: ${errMsg}]`,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          modelCalls: 0,
          retries: (fallbackResult.usage?.retries ?? 0) + primaryRetries,
          usageSource: 'local_rule_zero',
          degraded: true,
          costFen: 0,
          provider: this.fallback.backend,
        },
      };
    }
  }
}

class DegradedConfigSlowReasoningProvider implements SlowReasoningProvider {
  readonly backend = 'local-grounded-synthesizer (degraded-unconfigured)';
  readonly mode = 'local_fallback' as const;
  private readonly fallback: LocalSlowReasoningProvider;

  constructor(private readonly missingDetail: string, opts?: { candidateTtlMs?: number }) {
    this.fallback = new LocalSlowReasoningProvider({ candidateTtlMs: opts?.candidateTtlMs });
  }

  async health(): Promise<ProviderHealthStatus> {
    return {
      ok: false,
      detail: this.missingDetail,
      provider: this.backend,
      degraded: true,
      lastHealthCheckAt: nowUtcIso8601(),
    };
  }

  async synthesize(
    request: SlowReasoningCandidateRequest,
    signal?: AbortSignal,
  ): Promise<SlowReasoningCandidateResult> {
    const result = await this.fallback.synthesize(request, signal);
    return {
      ...result,
      rationale: `${result.rationale} [${this.missingDetail}]`,
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

export function createSlowReasoningProvider(
  mode: 'fake' | 'real',
  opts?: { candidateTtlMs?: number; env?: NodeJS.ProcessEnv; cpaClient?: CpaClient },
): SlowReasoningProvider {
  const local = new LocalSlowReasoningProvider({ candidateTtlMs: opts?.candidateTtlMs });
  if (mode === 'fake') return local;
  const client =
    opts?.cpaClient ??
    (() => {
      const cfg = resolveCpaConfig({ env: opts?.env });
      return cfg ? new CpaClient(cfg) : undefined;
    })();
  if (!client) {
    const reason =
      'CUEX_SYSTEM2=real requested without CPA credentials (CPA_BASE_URL/CPA_API_KEY or opt-in dev loader); degraded to local synthesizer.';
    console.warn(`[runtime] ${reason}`);
    return new DegradedConfigSlowReasoningProvider(reason, { candidateTtlMs: opts?.candidateTtlMs });
  }
  return new FallbackSlowReasoningProvider(
    new CpaSlowReasoningProvider(client, { candidateTtlMs: opts?.candidateTtlMs }),
    local,
  );
}
