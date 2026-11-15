import {
  DEFAULT_UTILITY_LAMBDA,
  type CognitiveEvent,
  type ControllerDecision,
  type Evidence,
  type Intervention,
  type MemoryProposal,
  type Observation,
  type PresentationContextPack,
  type PresentationDiagnosis,
  type PresentationMode,
  type PresentationProgressNode,
  type PresentationReflection,
  type PresentationTimelineEvent,
  type PresentationWeakSegment,
  type Session,
  type SharedCognitiveState,
  type TranscriptSegment,
  type UtilitySummary,
} from '@cuex/protocol';
import { isoToMs, msToIso } from '../../runtime/time';

export interface QuestionRecord {
  segmentId: string;
  question: string;
  grounded: boolean;
  evidenceIds: string[];
  missingInfoNotice?: string;
  atMs: number;
  chapterId?: string;
}

export function computeUtilitySummary(params: {
  interventions: Intervention[];
  decisions: ControllerDecision[];
  lambda?: number;
}): UtilitySummary {
  const lambda =
    params.lambda !== undefined && Number.isFinite(params.lambda) && params.lambda > 0
      ? params.lambda
      : DEFAULT_UTILITY_LAMBDA;

  let explicitHelpfulCount = 0;
  let explicitDistractingCount = 0;
  let helpfulCount = 0;
  let distractingCount = 0;
  let withdrawnBeforeDisruptionCount = 0;

  for (const item of params.interventions) {
    if (item.userFeedback === 'helpful') explicitHelpfulCount += 1;
    if (item.userFeedback === 'distracting') explicitDistractingCount += 1;

    const wasDisruption =
      item.userFeedback === 'distracting' ||
      (item.dismissedAt !== undefined && item.userFeedback !== 'helpful');

    if (wasDisruption) {
      distractingCount += 1;
      continue;
    }

    if (item.withdrawnAt !== undefined && item.withdrawalReason !== 'user_dismissed') {
      withdrawnBeforeDisruptionCount += 1;
    }

    if (
      item.userFeedback === 'helpful' ||
      item.withdrawalReason === 'user_recovered' ||
      (item.withdrawnAt === undefined && item.dismissedAt === undefined)
    ) {
      helpfulCount += 1;
    }
  }

  const meaningfulSuppressReasons = new Set([
    'silent_mode',
    'session_paused',
    'ceiling_exceeded',
    'cooldown_active',
    'user_dismissed_suppression',
    'ungrounded_evidence',
    'pause_only_without_gap',
    'user_already_recovering',
    'lower_priority',
  ]);

  const suppressedCount = params.decisions.filter(
    (d) =>
      d.selectedAction === 'stay_silent' &&
      d.suppressReason &&
      meaningfulSuppressReasons.has(d.suppressReason),
  ).length;

  const netUtilityScore = Number((helpfulCount - lambda * distractingCount).toFixed(2));

  return {
    helpfulCount,
    distractingCount,
    lambda,
    netUtilityScore,
    explicitHelpfulCount,
    explicitDistractingCount,
    withdrawnBeforeDisruptionCount,
    suppressedCount,
    formula: 'V = H - λI',
  };
}

export function buildPresentationReflection(params: {
  pack: PresentationContextPack;
  chapterNodes: PresentationProgressNode[];
  questionRecords: QuestionRecord[];
  session: Session;
  state: SharedCognitiveState;
  events: CognitiveEvent[];
  decisions: ControllerDecision[];
  interventions: Intervention[];
  observations: Observation[];
  segments: TranscriptSegment[];
  evidence: Evidence[];
  lambda?: number;
  now: number;
}): PresentationReflection {
  const {
    pack,
    chapterNodes,
    questionRecords,
    session,
    state,
    interventions,
    observations,
    segments,
    decisions,
    evidence,
    lambda,
    now,
  } = params;

  const sessionStartedMs = isoToMs(session.startedAt, now);
  const sessionEndedMs = isoToMs(session.endedAt, now);
  const timeline: PresentationTimelineEvent[] = [];

  for (const seg of segments) {
    timeline.push({
      id: `tl_${seg.segmentId}`,
      atMs: seg.endMs,
      kind: seg.speaker === 'audience' ? 'qa_question' : 'segment',
      chapterId: seg.chapterId,
      speaker: seg.speaker,
      text: seg.text,
      detail: seg.isFinal ? 'final' : 'partial',
    });
  }

  for (const obs of observations) {
    timeline.push({
      id: `tl_${obs.observationId}`,
      atMs: isoToMs(obs.timestamp, now),
      kind: 'observation',
      chapterId: obs.relatedChapterId,
      text: obs.summary,
      detail: obs.kind,
    });
  }

  for (const item of interventions) {
    timeline.push({
      id: `tl_show_${item.interventionId}`,
      atMs: isoToMs(item.shownAt, now),
      kind: 'intervention_shown',
      chapterId: item.chapterId,
      text: `[${item.level}] ${item.title}: ${item.cueText}`,
      level: item.level,
      userFeedback: item.userFeedback,
      evidenceIds: item.evidenceIds,
    });
    if (item.withdrawnAt !== undefined) {
      timeline.push({
        id: `tl_wd_${item.interventionId}`,
        atMs: isoToMs(item.withdrawnAt, now),
        kind: item.dismissedAt ? 'intervention_dismissed' : 'intervention_withdrawn',
        chapterId: item.chapterId,
        text: item.dismissedAt ? `用户关闭了提示：${item.title}` : `自动撤回提示：${item.title}`,
        withdrawalReason: item.withdrawalReason,
        level: 'L0',
      });
    }
  }

  timeline.sort((a, b) => a.atMs - b.atMs);

  const missedPoints: PresentationDiagnosis['missedPoints'] = [];
  let totalPoints = 0;
  let coveredPoints = 0;
  for (const node of chapterNodes) {
    for (const kp of node.keyPoints) {
      totalPoints += 1;
      if (kp.covered) {
        coveredPoints += 1;
      } else {
        missedPoints.push({
          chapterId: node.chapterId,
          chapterTitle: node.title,
          pointId: kp.id,
          label: kp.label,
        });
      }
    }
  }

  const coverageRatio = totalPoints > 0 ? Number((coveredPoints / totalPoints).toFixed(3)) : 1;

  const overtimeChapters: PresentationDiagnosis['overtimeChapters'] = chapterNodes
    .filter((node) => node.actualDurationSec > node.targetDurationSec + 10)
    .map((node) => ({
      chapterId: node.chapterId,
      title: node.title,
      targetSec: node.targetDurationSec,
      actualSec: node.actualDurationSec,
    }));

  const unansweredQuestions: PresentationDiagnosis['unansweredQuestions'] = questionRecords
    .filter((q) => !q.grounded)
    .map((q) => ({
      segmentId: q.segmentId,
      question: q.question,
      missingInfoNotice: q.missingInfoNotice,
    }));

  const driftCount = observations.filter((o) => o.kind === 'topic_drift').length;
  const autoWithdrawCount = interventions.filter(
    (i) => i.withdrawnAt !== undefined && i.withdrawalReason !== 'user_dismissed',
  ).length;

  const utility = computeUtilitySummary({ interventions, decisions, lambda });

  const overallSummary =
    [
      `覆盖率 ${(coverageRatio * 100).toFixed(0)}%（${coveredPoints}/${totalPoints} 个核心要点）`,
      missedPoints.length ? `遗漏 ${missedPoints.length} 项要点` : '核心要点全部覆盖',
      overtimeChapters.length ? `${overtimeChapters.length} 个章节超时` : '节奏控时良好',
      unansweredQuestions.length
        ? `${unansweredQuestions.length} 个未收录事实的 Q&A 缺口`
        : 'Q&A 均有核验依据支撑',
      `净效用 V = ${utility.netUtilityScore}（H=${utility.helpfulCount}, I=${utility.distractingCount}, λ=${utility.lambda}）`,
    ].join('；') + '。';

  const diagnosis: PresentationDiagnosis = {
    overallSummary,
    coverageRatio,
    missedPoints,
    overtimeChapters,
    unansweredQuestions,
    driftCount,
    autoWithdrawCount,
  };

  const weakSegments: PresentationWeakSegment[] = [];
  const evMap = new Map(evidence.map((e) => [e.id, e]));

  for (const missed of missedPoints.slice(0, 3)) {
    const ch = chapterNodes.find((n) => n.chapterId === missed.chapterId);
    const kp = ch?.keyPoints.find((k) => k.id === missed.pointId);
    const sup = kp?.evidenceId && evMap.get(kp.evidenceId) ? [evMap.get(kp.evidenceId)!] : [];
    weakSegments.push({
      weakSegmentId: `weak_miss_${missed.chapterId}_${missed.pointId}`,
      atMs: sessionStartedMs,
      chapterId: missed.chapterId,
      chapterTitle: missed.chapterTitle,
      reason: 'missed_key_point',
      promptText: `请针对「${missed.chapterTitle}」补充陈述遗漏要点：${missed.label}`,
      excerptText: segments.find((s) => s.chapterId === missed.chapterId)?.text ?? '(该章节暂无对应发言摘录)',
      targetPointLabels: [missed.label],
      supportingEvidence: sup,
      recommendedCue: missed.label,
    });
  }

  for (const qa of unansweredQuestions.slice(0, 2)) {
    weakSegments.push({
      weakSegmentId: `weak_qa_${qa.segmentId}`,
      atMs: now,
      chapterId: chapterNodes[chapterNodes.length - 1]?.chapterId ?? pack.progressNodes[0]?.chapterId ?? 'ch_1',
      chapterTitle: '现场问答补全',
      reason: 'unanswered_qa',
      promptText: `练习诚实或补齐依据回答该评委追问：${qa.question}`,
      excerptText: qa.question,
      targetPointLabels: [qa.question],
      supportingEvidence: [],
      recommendedCue: qa.missingInfoNotice ?? '补充事实条目或明确声明暂无数据边界',
    });
  }

  for (const ot of overtimeChapters.slice(0, 2)) {
    const ch = chapterNodes.find((n) => n.chapterId === ot.chapterId);
    weakSegments.push({
      weakSegmentId: `weak_ot_${ot.chapterId}`,
      atMs: now,
      chapterId: ot.chapterId,
      chapterTitle: ot.title,
      reason: 'overtime',
      promptText: `将「${ot.title}」压缩到 ${ot.targetSec} 秒以内（本次用时 ${ot.actualSec} 秒），突出一句核心结论。`,
      excerptText:
        segments
          .filter((s) => s.chapterId === ot.chapterId)
          .map((s) => s.text)
          .join(' ')
          .slice(0, 120) || ot.title,
      targetPointLabels: ch?.keyPoints.map((k) => k.label) ?? [ot.title],
      supportingEvidence: [],
      recommendedCue: `${ot.targetSec}s 内只留核心结论 + 一组实证数据`,
    });
  }

  const memoryProposals: MemoryProposal[] = [];
  if (overtimeChapters.length > 0) {
    memoryProposals.push({
      proposalId: `prop_pace_${session.sessionId}`,
      scenarioId: 'presentation',
      category: 'pacing_habit',
      title: `开场/核心章节精简控时偏好（${overtimeChapters[0].title}）`,
      content: `历史排练在「${overtimeChapters[0].title}」超时 ${overtimeChapters[0].actualSec - overtimeChapters[0].targetSec} 秒，建议下次在 ${Math.round(overtimeChapters[0].targetSec * 0.8)} 秒处收尾过渡。`,
      rationale: '由本场计时统计生成，需您点击确认后才会写入个人记忆。',
      scope: 'scenario',
      privacyLevel: 'local_private',
      sourceSessionId: session.sessionId,
      status: 'pending',
    });
  }

  if (unansweredQuestions.length > 0) {
    memoryProposals.push({
      proposalId: `prop_qa_${session.sessionId}`,
      scenarioId: 'presentation',
      category: 'qa_pattern',
      title: '高频未准备问答缺口记录',
      content: `评委追问「${unansweredQuestions[0].question}」时当前资料未覆盖，建议下场前在白名单中补充核验口径。`,
      rationale: '基于本场实时问答未命中记录提取，仅在显式确认后保存。',
      scope: 'scenario',
      privacyLevel: 'local_private',
      sourceSessionId: session.sessionId,
      status: 'pending',
    });
  }

  if (memoryProposals.length === 0 && coverageRatio >= 0.8) {
    memoryProposals.push({
      proposalId: `prop_style_${session.sessionId}`,
      scenarioId: 'presentation',
      category: 'style',
      title: '高流畅度陈述与最小打扰阈值偏好',
      content: `本次以 ${(coverageRatio * 100).toFixed(0)}% 要点覆盖率完成陈述，建议维持低频边缘提示习惯。`,
      rationale: '仅在您手动确认后才保留到个人风格记忆库。',
      scope: 'global',
      privacyLevel: 'local_private',
      sourceSessionId: session.sessionId,
      status: 'pending',
    });
  }

  return {
    reflectionId: `refl_${session.sessionId}_${now}`,
    sessionId: session.sessionId,
    packId: pack.packId,
    mode: (session.mode as PresentationMode) || 'live',
    generatedAt: msToIso(now),
    durationMs: Math.max(0, sessionEndedMs - sessionStartedMs),
    timeline,
    diagnosis,
    weakSegments,
    memoryProposals,
    utility,
    telemetry: state.telemetry,
  };
}
