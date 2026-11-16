import React, { useEffect, useState } from 'react';
import type {
  DataDeletionReceipt,
  MemoryProposal,
  PresentationContextPack,
  PresentationReflection,
  PresentationWeakSegment,
} from '@cuex/protocol';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Edit3,
  FileWarning,
  Filter,
  HelpCircle,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { MemoryInspectorPanel } from '@/components/MemoryInspectorPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createMemoryItem, getSessionReflection, wipeSession } from '@/lib/api';
import {
  formatApiError,
  formatDateTime,
  formatDuration,
  formatMoneyFen,
  formatMs,
  formatTime,
  MEMORY_CATEGORY_LABELS,
  USAGE_SOURCE_LABELS,
  WITHDRAWAL_REASON_LABELS,
} from '@/lib/format';
import { cn } from '@/lib/utils';

function getTimelineBaseEpochMs(timeline: PresentationReflection['timeline']): number | null {
  let minEpoch: number | null = null;
  for (const ev of timeline) {
    if (Number.isFinite(ev.atMs) && ev.atMs > 1_000_000_000_000) {
      if (minEpoch === null || ev.atMs < minEpoch) {
        minEpoch = ev.atMs;
      }
    }
  }
  return minEpoch;
}

function formatTimelineOffset(atMs: number, baseEpochMs: number | null): string {
  if (!Number.isFinite(atMs)) return '00:00';
  if (atMs > 1_000_000_000_000) {
    if (baseEpochMs !== null) {
      return formatMs(Math.max(0, atMs - baseEpochMs));
    }
    return formatTime(new Date(atMs).toISOString());
  }
  return formatMs(Math.max(0, atMs));
}

interface ReflectionViewProps {
  sessionId: string | null;
  initialReflection: PresentationReflection | null;
  activePack: PresentationContextPack | null;
  onStartRehearsal: (weakSegment: PresentationWeakSegment, packId: string) => void;
  onGoToCompiler: () => void;
  onGoToStage: () => void;
  onSessionWiped: () => void;
}

const WEAK_REASON_LABELS: Record<PresentationWeakSegment['reason'], string> = {
  missed_key_point: '核心要点遗漏',
  topic_drift: '话题偏离主线',
  overtime: '章节节奏超时',
  unanswered_qa: '现场提问缺乏实证支撑',
  distracting_moment: '用户标记为打扰的提示时刻',
};

export const ReflectionView: React.FC<ReflectionViewProps> = ({
  sessionId,
  initialReflection,
  activePack,
  onStartRehearsal,
  onGoToCompiler,
  onGoToStage,
  onSessionWiped,
}) => {
  const [reflection, setReflection] = useState<PresentationReflection | null>(initialReflection);
  const [lambda, setLambda] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<
    'all' | 'segment' | 'interventions' | 'qa'
  >('all');
  const [selectedWeakId, setSelectedWeakId] = useState<string | null>(null);

  const [proposalStates, setProposalStates] = useState<
    Record<string, 'pending' | 'accepted' | 'rejected'>
  >({});
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [proposalDraftTitle, setProposalDraftTitle] = useState('');
  const [proposalDraftContent, setProposalDraftContent] = useState('');
  const [memoryRefresh, setMemoryRefresh] = useState(0);
  const [wiping, setWiping] = useState(false);
  const [deletionReceipt, setDeletionReceipt] = useState<DataDeletionReceipt | null>(null);

  useEffect(() => {
    setReflection(initialReflection);
    if (initialReflection) {
      setDeletionReceipt(null);
    }
    if (initialReflection?.weakSegments[0]) {
      setSelectedWeakId(initialReflection.weakSegments[0].weakSegmentId);
    }
  }, [initialReflection]);

  useEffect(() => {
    const targetSessionId = sessionId ?? initialReflection?.sessionId;
    if (!targetSessionId) return;
    setLoading(true);
    setError(null);
    setDeletionReceipt(null);
    void getSessionReflection(targetSessionId, lambda)
      .then((ref) => {
        setReflection(ref);
        if (!selectedWeakId && ref.weakSegments[0]) {
          setSelectedWeakId(ref.weakSegments[0].weakSegmentId);
        }
      })
      .catch((err) => {
        if (!initialReflection) {
          setError(formatApiError(err));
        }
      })
      .finally(() => setLoading(false));
  }, [sessionId, lambda]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAcceptProposal = async (
    proposal: MemoryProposal,
    customTitle?: string,
    customContent?: string
  ) => {
    try {
      await createMemoryItem({
        scenarioId: proposal.scenarioId,
        category: proposal.category,
        title: (customTitle ?? proposal.title).trim(),
        content: (customContent ?? proposal.content).trim(),
        sourceSessionId: proposal.sourceSessionId,
        userConfirmed: true,
        privacyLevel: proposal.privacyLevel,
        scope: proposal.scope,
      });
      setProposalStates((prev) => ({ ...prev, [proposal.proposalId]: 'accepted' }));
      setEditingProposalId(null);
      setMemoryRefresh((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '写入个人记忆失败');
    }
  };

  const handleRejectProposal = (proposalId: string) => {
    setProposalStates((prev) => ({ ...prev, [proposalId]: 'rejected' }));
    if (editingProposalId === proposalId) setEditingProposalId(null);
  };

  const handleWipeSessionData = async () => {
    const targetId = reflection?.sessionId ?? sessionId;
    if (!targetId) return;
    setWiping(true);
    setError(null);
    try {
      const res = await wipeSession(targetId);
      setReflection(null);
      setDeletionReceipt(res.receipt ?? null);
      setMemoryRefresh((n) => n + 1);
      onSessionWiped();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setWiping(false);
    }
  };

  const filteredTimeline = (reflection?.timeline ?? []).filter((ev) => {
    if (timelineFilter === 'all') return true;
    if (timelineFilter === 'segment') return ev.kind === 'segment';
    if (timelineFilter === 'qa') return ev.kind === 'qa_question';
    return (
      ev.kind === 'intervention_shown' ||
      ev.kind === 'intervention_withdrawn' ||
      ev.kind === 'intervention_dismissed'
    );
  });

  const selectedWeak =
    reflection?.weakSegments.find((w) => w.weakSegmentId === selectedWeakId) ??
    reflection?.weakSegments[0] ??
    null;

  const timelineBaseEpochMs = getTimelineBaseEpochMs(reflection?.timeline ?? []);

  return (
    <div className="bg-ground text-ink min-h-[calc(100dvh-3.5rem)]" data-testid="reflection-view">
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-line pb-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              场后复盘 · 净有效介入评估、单点重练与记忆治理
            </h1>
            <p className="text-sm text-ink-2 leading-relaxed">
              基于真实转写、控制器裁决与用户微反馈计算{' '}
              <span className="font-mono font-semibold text-ink">V = H - λI</span>，并支持单点重练与可控记忆落盘。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {reflection && (
              <Button
                type="button"
                variant="quiet"
                size="sm"
                disabled={wiping}
                onClick={() => void handleWipeSessionData()}
                data-testid="reflection-wipe-btn"
              >
                <Trash2 className="w-3.5 h-3.5 text-amber-ink" />
                <span>{wiping ? '清除中...' : '彻底删除本场会话数据'}</span>
              </Button>
            )}
            <Button type="button" variant="quiet" size="sm" onClick={onGoToStage}>
              返回场中协同
            </Button>
            <Button type="button" size="sm" onClick={onGoToCompiler}>
              新建 / 编辑演讲包
            </Button>
          </div>
        </header>

        {error && (
          <div className="border border-amber/40 bg-amber-tint text-amber-ink px-4 py-3 rounded text-xs">
            {error}
          </div>
        )}

        {deletionReceipt && (
          <div
            className="border border-resolved/40 bg-resolved-tint/60 rounded-md p-4 text-xs space-y-2"
            data-testid="session-deletion-receipt"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-resolved">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>会话数据销毁合规回执 (DataDeletionReceipt)</span>
              </div>
              <span className="font-mono text-xs text-ink-3">{deletionReceipt.receiptId}</span>
            </div>
            <p className="text-xs text-ink-2 leading-relaxed">
              完成时间：{formatDateTime(deletionReceipt.completedAt)} · 已清除范围：
              {deletionReceipt.deletedScopes.map((s) => `${s.scope}: ${s.deletedCount}`).join(' · ')}
            </p>
            {deletionReceipt.preservedRecords.length > 0 && (
              <p className="text-xs text-ink-3">
                保留合规项：
                {deletionReceipt.preservedRecords
                  .map((p) => `${p.category} (${p.count})`)
                  .join('；')}
              </p>
            )}
          </div>
        )}

        {loading && !reflection && (
          <div className="border border-line bg-surface rounded-md p-8 text-center text-xs text-ink-3">
            正在生成本次演讲复盘诊断...
          </div>
        )}

        {!reflection && !loading ? (
          <div className="border border-line bg-surface rounded-md p-8 text-center space-y-3">
            <Clock className="w-7 h-7 text-ink-3 mx-auto" />
            <h2 className="text-base font-semibold text-ink">暂无可复盘的已完成会话</h2>
            <p className="text-sm text-ink-2 max-w-md mx-auto leading-relaxed">
              在「场中协同」完成一轮演讲并点击「结束并进入复盘」后，系统将生成真实的时间线、V = H - λI 评分与单点重练任务。
            </p>
            <div className="flex justify-center gap-2 pt-1">
              <Button type="button" variant="quiet" size="sm" onClick={onGoToCompiler}>
                先去场前编译
              </Button>
              <Button type="button" size="sm" onClick={onGoToStage}>
                前往场中协同
              </Button>
            </div>
          </div>
        ) : (
          reflection && (
            <>
              {/* 1. V = H - λI & Diagnosis Summary (Natural height, zero bottom void) */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* V = H - λI Utility Score */}
                <div
                  className="lg:col-span-5 border border-ink/25 bg-surface rounded-md p-5 space-y-4"
                  data-testid="utility-score-card"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <h2 className="text-base font-bold text-ink">净有效介入评分 (V = H - λI)</h2>
                    <label className="flex items-center gap-1.5 text-xs text-ink-2 whitespace-nowrap shrink-0">
                      <span>惩罚系数 λ：</span>
                      <select
                        value={lambda}
                        onChange={(e) => setLambda(Number(e.target.value))}
                        data-testid="lambda-select"
                        className="h-8 border border-line bg-ground rounded px-2 text-ink font-mono focus-visible:outline-none focus-visible:border-ink"
                      >
                        <option value={1}>1</option>
                        <option value={2}>2 (默认)</option>
                        <option value={3}>3</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-baseline gap-5">
                    <span
                      className={cn(
                        'font-mono text-5xl font-bold tabular-nums',
                        reflection.utility.netUtilityScore >= 0 ? 'text-resolved' : 'text-amber-ink'
                      )}
                      data-testid="utility-net-score"
                    >
                      {reflection.utility.netUtilityScore}
                    </span>
                    <div className="text-xs text-ink-2 space-y-1 font-mono tabular-nums">
                      <div>
                        H (有效帮助) = {reflection.utility.helpfulCount} · 显式点赞{' '}
                        {reflection.utility.explicitHelpfulCount}
                      </div>
                      <div>
                        I (打扰次数) = {reflection.utility.distractingCount} · 显式打扰{' '}
                        {reflection.utility.explicitDistractingCount}
                      </div>
                      <div className="text-resolved">
                        主动撤回免打扰 = {reflection.utility.withdrawnBeforeDisruptionCount} · 抑制冗余{' '}
                        {reflection.utility.suppressedCount}
                      </div>
                    </div>
                  </div>

                  <p
                    className="text-xs text-ink-3 border-t border-line pt-3 leading-relaxed"
                    data-testid="utility-formula-note"
                  >
                    公式口径：<strong>H</strong> = 有效帮助介入次数（非提示总次数），<strong>I</strong>{' '}
                    = 不必要/打扰介入次数，多余打断以 λ={reflection.utility.lambda}{' '}
                    倍惩罚；演讲者主动修复后及时撤回不计入 I。
                  </p>
                </div>

                {/* Diagnosis Summary */}
                <div className="lg:col-span-7 border border-line bg-surface rounded-md p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <h2 className="text-base font-bold text-ink">结构化诊断摘要</h2>
                    <div className="flex flex-wrap gap-1.5 min-w-0 max-w-full">
                      <Badge variant="outline" className="font-mono">
                        模式：{reflection.mode === 'rehearsal' ? '彩排' : '正式'}
                      </Badge>
                      <Badge variant="secondary" className="font-mono tabular-nums">
                        时长：{formatDuration(reflection.durationMs / 1000)}
                      </Badge>
                      <Badge variant="outline" className="font-mono tabular-nums">
                        Tokens：{reflection.telemetry.totalTokens} ·{' '}
                        {formatMoneyFen(reflection.telemetry.cost ?? reflection.telemetry.costFen)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="font-mono whitespace-normal text-left max-w-full"
                      >
                        {USAGE_SOURCE_LABELS[reflection.telemetry.usageSource] ??
                          (reflection.telemetry.estimation.usingLocalFallback
                            ? '本地规则零 Token'
                            : '模型实计')}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-sm text-ink-2 leading-relaxed">
                    {reflection.diagnosis.overallSummary}
                  </p>

                  {/* 4-column Achromatic Ledger Metric Strip */}
                  <div className="border border-line bg-surface-muted/40 rounded grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-line text-xs">
                    <div className="p-3 space-y-0.5">
                      <span className="text-xs text-ink-3 block">要点覆盖率</span>
                      <span className="font-mono text-xl font-bold text-ink tabular-nums">
                        {Math.round(reflection.diagnosis.coverageRatio * 100)}%
                      </span>
                    </div>
                    <div className="p-3 space-y-0.5">
                      <span className="text-xs text-ink-3 block">遗漏要点</span>
                      <span className="font-mono text-xl font-bold text-amber-ink tabular-nums">
                        {reflection.diagnosis.missedPoints.length} 项
                      </span>
                    </div>
                    <div className="p-3 space-y-0.5">
                      <span className="text-xs text-ink-3 block">超时章节</span>
                      <span className="font-mono text-xl font-bold text-ink tabular-nums">
                        {reflection.diagnosis.overtimeChapters.length} 章
                      </span>
                    </div>
                    <div className="p-3 space-y-0.5">
                      <span className="text-xs text-ink-3 block">偏离 / 自动撤回</span>
                      <span className="font-mono text-xl font-bold text-resolved tabular-nums">
                        {reflection.diagnosis.driftCount} / {reflection.diagnosis.autoWithdrawCount}
                      </span>
                    </div>
                  </div>

                  {/* Missed / Overtime / Unanswered details (unified divided row, zero stretched empty voids) */}
                  <div className="border border-line bg-surface-muted/30 rounded grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-line text-xs">
                    <div className="p-3 space-y-1">
                      <strong className="text-ink block">遗漏关键点</strong>
                      {reflection.diagnosis.missedPoints.length === 0 ? (
                        <span className="text-resolved block">全部关键要点均已覆盖</span>
                      ) : (
                        <ul className="list-disc pl-4 text-ink-2 space-y-0.5 leading-relaxed">
                          {reflection.diagnosis.missedPoints.map((mp) => (
                            <li key={mp.pointId}>
                              [{mp.chapterTitle}] {mp.label}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="p-3 space-y-1">
                      <strong className="text-ink block">超时章节</strong>
                      {reflection.diagnosis.overtimeChapters.length === 0 ? (
                        <span className="text-resolved block">无明显超时章节</span>
                      ) : (
                        <ul className="list-disc pl-4 text-amber-ink space-y-0.5 leading-relaxed tabular-nums">
                          {reflection.diagnosis.overtimeChapters.map((oc) => (
                            <li key={oc.chapterId}>
                              {oc.title}：{oc.actualSec}s / {oc.targetSec}s
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="p-3 space-y-1">
                      <strong className="text-ink block">未准备/缺失事实问答</strong>
                      {reflection.diagnosis.unansweredQuestions.length === 0 ? (
                        <span className="text-resolved block">暂无未覆盖提问</span>
                      ) : (
                        <ul className="list-disc pl-4 text-amber-ink space-y-0.5 leading-relaxed">
                          {reflection.diagnosis.unansweredQuestions.map((uq) => (
                            <li key={uq.segmentId}>{uq.question}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. Timeline + Single-Point Rehearsal */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Timeline */}
                <div
                  className="lg:col-span-7 border border-line bg-surface rounded-md p-5 space-y-4"
                  data-testid="reflection-timeline"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <h2 className="text-base font-bold text-ink">演讲全流程时间线</h2>
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <Filter className="w-3.5 h-3.5 text-ink-3 mr-1" />
                      {(
                        [
                          ['all', '全部'],
                          ['segment', '转写'],
                          ['interventions', '提示与撤回'],
                          ['qa', '现场问答'],
                        ] as const
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setTimelineFilter(k)}
                          className={cn(
                            'px-2.5 py-1 min-h-8 rounded border',
                            timelineFilter === k
                              ? 'bg-ink text-ground border-ink font-medium'
                              : 'bg-surface-muted/60 text-ink-2 border-line hover:bg-surface-muted'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredTimeline.length === 0 ? (
                    <p className="text-xs text-ink-3 py-4">当前筛选条件下暂无时间线事件。</p>
                  ) : (
                    <ol className="divide-y divide-line text-xs max-h-[460px] overflow-y-auto pr-1">
                      {filteredTimeline.map((ev) => (
                        <li key={ev.id} className="py-3 flex items-start gap-3">
                          <span className="font-mono text-xs text-ink-3 w-20 whitespace-nowrap shrink-0 pt-0.5 tabular-nums">
                            {formatTimelineOffset(ev.atMs, timelineBaseEpochMs)}
                          </span>
                          <div className="flex-1 space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant={
                                  ev.kind === 'intervention_withdrawn'
                                    ? 'resolved'
                                    : ev.kind === 'intervention_shown'
                                      ? 'amber'
                                      : ev.kind === 'qa_question'
                                        ? 'violet'
                                        : 'secondary'
                                }
                              >
                                {ev.kind}
                              </Badge>
                              {ev.level && (
                                <span className="font-mono text-xs text-ink-3">{ev.level}</span>
                              )}
                              {ev.speaker && (
                                <span className="text-xs text-ink-3">· {ev.speaker}</span>
                              )}
                              {ev.userFeedback && (
                                <Badge
                                  variant={ev.userFeedback === 'helpful' ? 'resolved' : 'amber'}
                                >
                                  {ev.userFeedback === 'helpful' ? '有效 (H)' : '打扰 (I)'}
                                </Badge>
                              )}
                            </div>
                            <p
                              className={cn(
                                'leading-relaxed break-words',
                                ev.kind === 'intervention_withdrawn'
                                  ? 'text-ink-3 line-through'
                                  : 'text-ink'
                              )}
                            >
                              {ev.text}
                            </p>
                            {ev.withdrawalReason && (
                              <p className="text-xs text-resolved">
                                撤回原因：{WITHDRAWAL_REASON_LABELS[ev.withdrawalReason]}
                              </p>
                            )}
                            {ev.detail && <p className="text-xs text-ink-3">{ev.detail}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {/* Single-Point Rehearsal Panel */}
                <div
                  className="lg:col-span-5 border border-line bg-surface rounded-md p-5 space-y-4"
                  data-testid="single-point-rehearsal"
                >
                  <div className="border-b border-line pb-3">
                    <h2 className="text-base font-bold text-ink flex items-center gap-1.5">
                      <RotateCcw className="w-4 h-4 text-violet shrink-0" />
                      <span>单点重练（针对薄弱或遗漏时刻）</span>
                    </h2>
                    <p className="text-xs text-ink-3 mt-1 leading-relaxed">
                      选定任一薄弱片段，带着已核验事实依据重新演练并获得实时控制器反馈。
                    </p>
                  </div>

                  {reflection.weakSegments.length === 0 ? (
                    <div className="p-4 rounded bg-resolved-tint/50 border border-resolved/30 text-xs text-resolved">
                      本场未检测到需重点单点重练的薄弱片段，表现稳健！
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        {reflection.weakSegments.map((ws) => {
                          const active = selectedWeak?.weakSegmentId === ws.weakSegmentId;
                          return (
                            <button
                              key={ws.weakSegmentId}
                              type="button"
                              onClick={() => setSelectedWeakId(ws.weakSegmentId)}
                              data-testid={`weak-segment-${ws.weakSegmentId}`}
                              className={cn(
                                'w-full text-left p-3.5 rounded border text-xs transition-colors space-y-1',
                                active
                                  ? 'border-violet bg-violet-tint/35'
                                  : 'border-line bg-surface-muted/60 hover:bg-surface-muted'
                              )}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-ink">{ws.chapterTitle}</span>
                                <Badge variant="amber">
                                  {WEAK_REASON_LABELS[ws.reason] ?? ws.reason}
                                </Badge>
                              </div>
                              <p className="text-ink-2 line-clamp-2 leading-relaxed">{ws.promptText}</p>
                            </button>
                          );
                        })}
                      </div>

                      {selectedWeak && (
                        <div className="border border-violet/30 bg-surface-muted/50 rounded p-4 space-y-3 text-xs">
                          <div className="space-y-1">
                            <span className="text-xs font-semibold text-violet-ink block">
                              重练引导词
                            </span>
                            <p className="text-ink leading-relaxed">{selectedWeak.promptText}</p>
                          </div>

                          {selectedWeak.excerptText && (
                            <div className="space-y-1">
                              <span className="text-xs text-ink-3 block">原场片段回放：</span>
                              <p className="p-2.5 bg-surface border border-line rounded text-ink-2 leading-relaxed">
                                {selectedWeak.excerptText}
                              </p>
                            </div>
                          )}

                          {selectedWeak.supportingEvidence.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-xs text-ink-3 block">可用事实依据：</span>
                              <ul className="space-y-1">
                                {selectedWeak.supportingEvidence.map((ev) => (
                                  <li
                                    key={ev.id}
                                    className="px-2.5 py-1.5 rounded bg-surface border border-line text-ink-2"
                                  >
                                    {ev.text}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <p className="text-xs text-amber-ink">
                            建议提示词：{selectedWeak.recommendedCue}
                          </p>

                          <Button
                            type="button"
                            variant="violet"
                            className="w-full gap-1.5 min-h-[40px]"
                            data-testid="start-single-rehearsal-btn"
                            onClick={() =>
                              onStartRehearsal(
                                selectedWeak,
                                reflection.packId || activePack?.packId || ''
                              )
                            }
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>进入场中单点重练此片段</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* 3. Opt-in Proposed Memory Updates (Adaptive columns: 1 / 2 / 3 cols, zero orphan white space) */}
              <section
                className="border border-line bg-surface rounded-md p-5 space-y-4"
                data-testid="memory-proposals-section"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                  <div>
                    <h2 className="text-base font-bold text-ink flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber shrink-0" />
                      <span>待确认个人记忆更新建议（Opt-in Proposals）</span>
                    </h2>
                    <p className="text-xs text-ink-3 mt-1">
                      以下记忆由本场复盘提炼，未经您点击「允许写入」前绝不会写入个人存储。
                    </p>
                  </div>
                </div>

                {reflection.memoryProposals.length === 0 ? (
                  <p className="text-xs text-ink-3">本场未产生新的个人记忆更新建议。</p>
                ) : (
                  <div
                    className={cn(
                      'grid gap-4 text-xs',
                      reflection.memoryProposals.length === 1
                        ? 'grid-cols-1'
                        : reflection.memoryProposals.length === 2
                          ? 'grid-cols-1 md:grid-cols-2'
                          : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                    )}
                  >
                    {reflection.memoryProposals.map((prop) => {
                      const decision = proposalStates[prop.proposalId] ?? prop.status;
                      const isEditing = editingProposalId === prop.proposalId;
                      return (
                        <div
                          key={prop.proposalId}
                          data-testid={`memory-proposal-${prop.proposalId}`}
                          className="border border-line bg-surface-muted/50 rounded p-4 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="secondary">
                              {MEMORY_CATEGORY_LABELS[prop.category] ?? prop.category}
                            </Badge>
                            {decision !== 'pending' && (
                              <Badge variant={decision === 'accepted' ? 'resolved' : 'outline'}>
                                {decision === 'accepted' ? '已允许写入' : '已忽略'}
                              </Badge>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={proposalDraftTitle}
                                onChange={(e) => setProposalDraftTitle(e.target.value)}
                                className="w-full border border-line bg-surface rounded px-2.5 py-2 text-ink font-medium focus-visible:outline-none focus-visible:border-ink"
                              />
                              <textarea
                                rows={3}
                                value={proposalDraftContent}
                                onChange={(e) => setProposalDraftContent(e.target.value)}
                                className="w-full border border-line bg-surface rounded px-2.5 py-2 text-ink leading-relaxed focus-visible:outline-none focus-visible:border-ink"
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingProposalId(null)}
                                >
                                  取消
                                </Button>
                                <Button
                                  type="button"
                                  variant="resolved"
                                  size="sm"
                                  onClick={() =>
                                    void handleAcceptProposal(
                                      prop,
                                      proposalDraftTitle,
                                      proposalDraftContent
                                    )
                                  }
                                >
                                  保存并允许写入
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h3 className="font-semibold text-sm text-ink">{prop.title}</h3>
                              <p className="text-ink-2 leading-relaxed">{prop.content}</p>
                              <p className="text-xs text-ink-3">理由：{prop.rationale}</p>

                              {decision === 'pending' && (
                                <div className="flex flex-wrap items-center gap-2 pt-2">
                                  <Button
                                    type="button"
                                    variant="resolved"
                                    size="sm"
                                    onClick={() => void handleAcceptProposal(prop)}
                                    data-testid={`proposal-accept-${prop.proposalId}`}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>允许写入</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="quiet"
                                    size="sm"
                                    onClick={() => {
                                      setEditingProposalId(prop.proposalId);
                                      setProposalDraftTitle(prop.title);
                                      setProposalDraftContent(prop.content);
                                    }}
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>编辑</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRejectProposal(prop.proposalId)}
                                    data-testid={`proposal-reject-${prop.proposalId}`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>忽略</span>
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )
        )}

        {/* 4. Memory Governance Inspector (Always accessible) */}
        <section className="border border-line bg-surface rounded-md p-5">
          <MemoryInspectorPanel refreshTrigger={memoryRefresh} />
        </section>
      </main>
    </div>
  );
};
