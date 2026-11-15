import { Agent, type AgentMessage } from '@earendil-works/pi-agent-core';
import { Type, type AssistantMessage, type Static } from '@earendil-works/pi-ai';
import type {
  Candidate,
  CandidateKind,
  InterventionLevel,
  ProviderUsageRecord,
  SlowReasoningCandidateRequest,
  SlowReasoningCandidateResult,
} from '@cuex/protocol';
import { loadS2Runtime, type S2Runtime } from '../../system2/config';
import { runAgentGuarded } from '../../system2/run';
import { clampSpoken } from '../../system2/spoken';
import type { SlowReasoningProvider } from '../types';

let candidateSeq = 0;

function nextCandidateId(now: number): string {
  return `cand_${++candidateSeq}_${now}`;
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

  async health(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: 'Local grounded candidate synthesizer ready (0 tokens).' };
  }

  async synthesize(
    request: SlowReasoningCandidateRequest,
    signal?: AbortSignal,
  ): Promise<SlowReasoningCandidateResult> {
    signal?.throwIfAborted();
    const start = performance.now();
    const zeroUsage: ProviderUsageRecord = {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      modelCalls: 0,
      measurementSource: 'local_rule_zero',
      provider: this.backend,
    };

    const topEvidence = request.retrievedEvidence.slice(0, 2);
    const evidenceIds = topEvidence.map((item) => item.id);
    const expiresAt = request.timestamp + this.defaultTtlMs;

    if (request.triggerKind === 'live_qa' && topEvidence.length === 0) {
      const notice =
        '当前已确认的汇报资料与事实白名单中未收录该问题的实测数据或依据，建议坦诚说明当前暂无该项数据支持。';
      const candidate: Candidate = {
        candidateId: nextCandidateId(request.timestamp),
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
      candidateId: nextCandidateId(request.timestamp),
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

const SubmitCandidateParams = Type.Object({
  status: Type.Union([
    Type.Literal('synthesized'),
    Type.Literal('insufficient_evidence'),
    Type.Literal('no_action_needed'),
  ]),
  title: Type.String(),
  cueText: Type.String(),
  bullets: Type.Optional(Type.Array(Type.String())),
  evidenceIds: Type.Array(Type.String()),
  grounded: Type.Boolean(),
  ungroundedNotice: Type.Optional(Type.String()),
  rationale: Type.String(),
});

function sumPiAssistantUsage(messages: AgentMessage[]): {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  modelCalls: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let modelCalls = 0;
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const assistant = msg as AssistantMessage;
      modelCalls += 1;
      inputTokens += assistant.usage?.input ?? 0;
      outputTokens += assistant.usage?.output ?? 0;
      cachedInputTokens += assistant.usage?.cacheRead ?? 0;
    }
  }
  return { inputTokens, outputTokens, cachedInputTokens, modelCalls };
}

/**
 * Pi-AI / Pi-Agent backed System 2 slow reasoning provider (`CUEX_SYSTEM2=real`).
 * Strictly prohibits ungrounded numbers and accounts exact provider-reported tokens.
 */
export class PiSlowReasoningProvider implements SlowReasoningProvider {
  readonly backend: string;
  readonly mode = 'real' as const;
  private readonly runtime: S2Runtime;
  private readonly timeoutMs: number;
  private readonly candidateTtlMs: number;

  constructor(opts?: { timeoutMs?: number; candidateTtlMs?: number; runtime?: S2Runtime }) {
    this.runtime = opts?.runtime ?? loadS2Runtime();
    this.backend = this.runtime.backend;
    this.timeoutMs = opts?.timeoutMs ?? Number(process.env.CUEX_S2_TIMEOUT_MS ?? 10_000);
    this.candidateTtlMs = opts?.candidateTtlMs ?? 12_000;
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: `System 2 configured (${this.backend}).` };
  }

  async synthesize(
    request: SlowReasoningCandidateRequest,
    signal?: AbortSignal,
  ): Promise<SlowReasoningCandidateResult> {
    const start = performance.now();
    const external = signal ?? new AbortController().signal;
    external.throwIfAborted();

    let captured:
      | {
          status: 'synthesized' | 'insufficient_evidence' | 'no_action_needed';
          title: string;
          cueText: string;
          bullets?: string[];
          evidenceIds: string[];
          grounded: boolean;
          ungroundedNotice?: string;
          rationale: string;
        }
      | undefined;

    const evidenceBlock =
      request.retrievedEvidence.length > 0
        ? request.retrievedEvidence
            .map((e) => `- [${e.id}] (${e.source}): ${e.text}`)
            .join('\n')
        : '(无匹配已核验事实条目)';

    const missingBlock =
      request.missingPoints?.map((p) => `- [${p.id}] ${p.label}`).join('\n') || '(无)';

    const systemPrompt = [
      '你是 CueX 认知运行时的慢思考（System 2）候选生成模块。',
      '规则：',
      '1. 输出必须极简、适合演讲者余光一眼扫读（cueText 不超过 45 字，bullets 最多 2 条）。',
      '2. 严格事实对齐：只能引用提供的 Verified Evidence 中的数字、事实与边界，禁止自行估算或编造数字。',
      '3. 若是 live_qa 且 Verified Evidence 不足以回答，必须将 status 设为 insufficient_evidence，grounded 设为 false，evidenceIds 为 []，并在 ungroundedNotice 诚实提示“资料未覆盖”。',
      '4. 必须且仅调用一次 submit_candidate 工具提交结果。',
    ].join('\n');

    const userPrompt = [
      `场景: ${request.scenarioId} | 触发类型: ${request.triggerKind} | 建议干预等级: ${request.requestedLevel}`,
      `核心目标: ${request.activeGoal}`,
      `当前章节: ${request.activeChapterTitle ?? request.activeChapterId ?? '未指定'}`,
      request.questionText ? `听众/评委提问: ${request.questionText}` : '',
      `待覆盖要点:\n${missingBlock}`,
      `禁止编造边界:\n${request.forbiddenClaims?.join('; ') || '(无)'}`,
      `Verified Evidence:\n${evidenceBlock}`,
      `最近发言摘要:\n${request.recentSegments
        .slice(-4)
        .map((s) => `${s.speaker}: ${s.text}`)
        .join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const agent = new Agent({
      streamFn: (model, context, options) =>
        this.runtime.models.streamSimple(model, context, options),
      initialState: {
        model: this.runtime.model,
        systemPrompt,
        thinkingLevel: 'off',
        tools: [
          {
            name: 'submit_candidate',
            label: 'Submit Candidate Intervention',
            description: 'Submit grounded intervention candidate or honest insufficient_evidence notice.',
            parameters: SubmitCandidateParams,
            execute: async (_toolCallId, params) => {
              captured = params as Static<typeof SubmitCandidateParams>;
              return {
                content: [{ type: 'text', text: 'recorded' }],
                details: { ok: true },
              };
            },
          },
        ],
      },
      sessionId: `${request.sessionId}_${request.requestId}`,
    });

    try {
      await runAgentGuarded(agent, userPrompt, external, this.timeoutMs, request.triggerKind);
    } catch (error) {
      const sanitized = this.runtime.redact(error instanceof Error ? error.message : String(error));
      throw new Error(sanitized);
    }

    const usageTotals = sumPiAssistantUsage(agent.state.messages);
    const usage: ProviderUsageRecord = {
      ...usageTotals,
      measurementSource: usageTotals.modelCalls > 0 ? 'provider_reported' : 'local_rule_zero',
      provider: this.runtime.providerId,
      model: this.runtime.modelId,
    };

    if (!captured) {
      return {
        requestId: request.requestId,
        sessionId: request.sessionId,
        contextVersion: request.contextVersion,
        timestamp: request.timestamp,
        status: 'error',
        evidenceIds: [],
        grounded: false,
        rationale: 'System 2 finished without calling submit_candidate.',
        latencyMs: Math.round(performance.now() - start),
        backend: this.backend,
        usage,
      };
    }

    const validIds = new Set(request.retrievedEvidence.map((e) => e.id));
    const filteredEvidenceIds = captured.evidenceIds.filter((id) => validIds.has(id));
    const isInsufficient = captured.status === 'insufficient_evidence';

    const candidate: Candidate | undefined =
      captured.status === 'no_action_needed'
        ? undefined
        : {
            candidateId: nextCandidateId(request.timestamp),
            sessionId: request.sessionId,
            level: request.requestedLevel === 'L0' ? 'L2' : request.requestedLevel,
            title: clampSpoken(captured.title, 24),
            cueText: clampSpoken(captured.cueText, 64),
            ...(captured.bullets?.length
              ? { bullets: captured.bullets.slice(0, 3).map((b) => clampSpoken(b, 60)) }
              : {}),
            priority: request.triggerKind === 'live_qa' ? 92 : request.triggerKind === 'manual_help' ? 95 : 78,
            ttlMs: this.candidateTtlMs,
            expiresAt: request.timestamp + this.candidateTtlMs,
            contextVersion: request.contextVersion,
            evidenceIds: filteredEvidenceIds,
            basedOnSegmentId: request.basedOnSegmentId,
            status: 'pending',
            createdAt: request.timestamp,
            kind: isInsufficient ? 'missing_evidence_notice' : triggerToCandidateKind(request.triggerKind),
            grounded: !isInsufficient && captured.grounded,
            ...(captured.ungroundedNotice ? { missingEvidenceNotice: captured.ungroundedNotice } : {}),
            triggerReason: captured.rationale,
            targetChapterId: request.activeChapterId,
            ...(request.missingPoints?.[0] ? { targetKeyPointId: request.missingPoints[0].id } : {}),
          };

    return {
      requestId: request.requestId,
      sessionId: request.sessionId,
      contextVersion: request.contextVersion,
      timestamp: request.timestamp,
      status: captured.status,
      ...(candidate ? { candidate } : {}),
      evidenceIds: filteredEvidenceIds,
      grounded: candidate?.grounded ?? false,
      ...(captured.ungroundedNotice ? { ungroundedNotice: captured.ungroundedNotice } : {}),
      rationale: captured.rationale,
      latencyMs: Math.round(performance.now() - start),
      backend: this.backend,
      usage,
    };
  }
}

export class FallbackSlowReasoningProvider implements SlowReasoningProvider {
  private lastMode: 'real' | 'local_fallback' = 'real';
  private lastBackend: string;

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

  async health(): Promise<{ ok: boolean; detail?: string }> {
    const primaryHealth = await this.primary.health();
    if (primaryHealth.ok) return primaryHealth;
    return {
      ok: true,
      detail: `Primary (${primaryHealth.detail ?? 'unavailable'}) down; using ${this.fallback.backend}.`,
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
      return result;
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastMode = 'local_fallback';
      this.lastBackend = this.fallback.backend;
      const fallbackResult = await this.fallback.synthesize(request, signal);
      return {
        ...fallbackResult,
        rationale: `${fallbackResult.rationale} [fallback: ${error instanceof Error ? error.message : 'primary error'}]`,
      };
    }
  }
}

export function createSlowReasoningProvider(
  mode: 'fake' | 'real',
  opts?: { candidateTtlMs?: number; env?: NodeJS.ProcessEnv },
): SlowReasoningProvider {
  const local = new LocalSlowReasoningProvider({ candidateTtlMs: opts?.candidateTtlMs });
  if (mode === 'fake') return local;
  try {
    const runtime = loadS2Runtime({ env: opts?.env });
    return new FallbackSlowReasoningProvider(
      new PiSlowReasoningProvider({ runtime, candidateTtlMs: opts?.candidateTtlMs }),
      local,
    );
  } catch (error) {
    console.warn(
      `[runtime] CUEX_SYSTEM2=real could not load pi-ai credentials (${error instanceof Error ? error.message : String(error)}); falling back to local grounded synthesizer.`,
    );
    return local;
  }
}
