import React, { useEffect, useState } from 'react';
import type {
  DataDeletionReceipt,
  MemoryProposal,
  PresentationContextPack,
  PresentationReflection,
  PresentationWeakSegment,
} from '@cuex/protocol';
import {
  CheckCircle2,
  Clock,
  Edit3,
  Filter,
  Play,
  RotateCcw,
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
  formatMs,
  formatTime,
  INTERVENTION_LEVEL_LABELS,
  MEMORY_CATEGORY_LABELS,
  SPEAKER_LABELS,
  TIMELINE_EVENT_KIND_LABELS,
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

/** 将后端摘要中可能包含的内部公式记号转化为自然中文。 */
function cleanSummaryCopy(summary: string): string {
  return summary
    .replace(/[；;]?\s*净效用\s*V\s*=[^。；;]*[。]?/gu, '')
    .replace(/Q&A/gu, '现场提问')
    .trim();
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
  missed_key_point: '漏讲核心要点',
  topic_drift: '话题偏离主线',
  overtime: '章节用时超标',
  unanswered_qa: '提问待补充数据',
  distracting_moment: '节奏波动片段',
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
    void getSessionReflection(targetSessionId, 2)
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
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setError(err instanceof Error ? err.message : '保存演讲偏好失败');
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
              复盘提升
            </h1>
            <p className="text-sm text-ink-2 leading-relaxed">
              回顾本场要点覆盖、各章用时与现场提问表现，挑选薄弱片段随时单点重练。
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
                <span>{wiping ? '清空中…' : '清空本场记录'}</span>
              </Button>
            )}
            <Button type="button" variant="quiet" size="sm" onClick={onGoToStage}>
              前往上台演讲
            </Button>
            <Button type="button" size="sm" onClick={onGoToCompiler}>
              编辑讲稿
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
            className="border border-resolved/40 bg-resolved-tint/60 rounded-md p-4 text-xs space-y-1.5"
            data-testid="session-deletion-receipt"
          >
            <div className="flex items-center gap-2 font-semibold text-resolved">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>本场演讲记录已彻底清除</span>
            </div>
            <p className="text-xs text-ink-2 leading-relaxed tabular-nums">
              清理完成时间：{formatDateTime(deletionReceipt.completedAt)}
            </p>
          </div>
        )}

        {loading && !reflection && (
          <div className="border border-line bg-surface rounded-md p-8 text-center text-xs text-ink-3">
            正在整理本场复盘报告…
          </div>
        )}

        {!reflection && !loading ? (
          <div className="border border-line bg-surface rounded-md p-8 text-center space-y-3">
            <Clock className="w-7 h-7 text-ink-3 mx-auto" />
            <h2 className="text-base font-semibold text-ink">还没有已完成的演讲记录</h2>
            <p className="text-sm text-ink-2 max-w-md mx-auto leading-relaxed">
              完成一次彩排或正式上台并点击「结束并复盘」后，这里会自动生成要点覆盖清单与单点重练建议。
            </p>
            <div className="flex justify-center gap-2 pt-1">
              <Button type="button" variant="quiet" size="sm" onClick={onGoToCompiler}>
                准备讲稿
              </Button>
              <Button type="button" size="sm" onClick={onGoToStage}>
                上台演讲
              </Button>
            </div>
          </div>
        ) : (
          reflection && (
            <>
              {/* 1. Presenter Performance Overview First + Calm Assist Summary */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Primary: Presenter Delivery Overview */}
                <div className="lg:col-span-8 border border-line bg-surface rounded-md p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <h2 className="text-base font-bold text-ink">本场完成情况</h2>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={reflection.mode === 'rehearsal' ? 'violet' : 'amber'}>
                        {reflection.mode === 'rehearsal' ? '彩排演练' : '正式演讲'}
                      </Badge>
                      <Badge variant="secondary" className="font-mono tabular-nums">
                        用时 {formatDuration(reflection.durationMs / 1000)}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-sm text-ink-2 leading-relaxed">
                    {cleanSummaryCopy(reflection.diagnosis.overallSummary) ||
                      '本场演讲已完成，可参考下方漏讲要点与提问记录针对性补强。'}
                  </p>

                  {/* 4 Key Presenter Metrics */}
                  <div className="border border-line bg-surface-muted/40 rounded grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-line text-xs">
                    <div className="p-3.5 space-y-0.5">
                      <span className="text-xs text-ink-3 block">要点覆盖率</span>
                      <span className="font-mono text-2xl font-bold text-ink tabular-nums">
                        {Math.round(reflection.diagnosis.coverageRatio * 100)}%
                      </span>
                    </div>
                    <div className="p-3.5 space-y-0.5">
                      <span className="text-xs text-ink-3 block">漏讲要点</span>
                      <span className="font-mono text-2xl font-bold text-amber-ink tabular-nums">
                        {reflection.diagnosis.missedPoints.length} 项
                      </span>
                    </div>
                    <div className="p-3.5 space-y-0.5">
                      <span className="text-xs text-ink-3 block">超时章节</span>
                      <span className="font-mono text-2xl font-bold text-ink tabular-nums">
                        {reflection.diagnosis.overtimeChapters.length} 章
                      </span>
                    </div>
                    <div className="p-3.5 space-y-0.5">
                      <span className="text-xs text-ink-3 block">待补充提问</span>
                      <span className="font-mono text-2xl font-bold text-violet-ink tabular-nums">
                        {reflection.diagnosis.unansweredQuestions.length} 个
                      </span>
                    </div>
                  </div>

                  {/* Actionable Details */}
                  <div className="border border-line bg-surface-muted/30 rounded grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-line text-xs">
                    <div className="p-3.5 space-y-1">
                      <strong className="text-ink block">建议补讲的要点</strong>
                      {reflection.diagnosis.missedPoints.length === 0 ? (
                        <span className="text-resolved block">核心要点已全部讲到</span>
                      ) : (
                        <ul className="list-disc pl-4 text-ink-2 space-y-1 leading-relaxed">
                          {reflection.diagnosis.missedPoints.map((mp) => (
                            <li key={mp.pointId}>
                              <span className="text-ink-3">{mp.chapterTitle}：</span>
                              {mp.label}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="p-3.5 space-y-1">
                      <strong className="text-ink block">时间节奏提醒</strong>
                      {reflection.diagnosis.overtimeChapters.length === 0 ? (
                        <span className="text-resolved block">各章用时均在预算范围内</span>
                      ) : (
                        <ul className="list-disc pl-4 text-amber-ink space-y-1 leading-relaxed tabular-nums">
                          {reflection.diagnosis.overtimeChapters.map((oc) => (
                            <li key={oc.chapterId}>
                              {oc.title}（实讲 {formatDuration(oc.actualSec)} / 预计{' '}
                              {formatDuration(oc.targetSec)}）
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="p-3.5 space-y-1">
                      <strong className="text-ink block">待补充数据的追问</strong>
                      {reflection.diagnosis.unansweredQuestions.length === 0 ? (
                        <span className="text-resolved block">现场提问均有讲稿数据支撑</span>
                      ) : (
                        <ul className="list-disc pl-4 text-amber-ink space-y-1 leading-relaxed">
                          {reflection.diagnosis.unansweredQuestions.map((uq) => (
                            <li key={uq.segmentId}>{uq.question}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                {/* Secondary: Calm Copilot Assist Summary */}
                <div
                  className="lg:col-span-4 border border-line bg-surface rounded-md p-5 space-y-4"
                  data-testid="utility-score-card"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
                    <h2 className="text-base font-bold text-ink">临场辅助小结</h2>
                    <Badge
                      variant={
                        reflection.utility.distractingCount === 0 ? 'resolved' : 'amber'
                      }
                    >
                      {reflection.utility.distractingCount === 0 ? '零多余打断' : '建议调轻提示'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    <div className="rounded bg-ground-2 p-3 space-y-1">
                      <span
                        className="font-mono text-2xl font-bold text-resolved tabular-nums block"
                        data-testid="utility-net-score"
                      >
                        {reflection.utility.helpfulCount}
                      </span>
                      <span className="text-xs text-ink-2 block">关键提词</span>
                    </div>
                    <div className="rounded bg-ground-2 p-3 space-y-1">
                      <span className="font-mono text-2xl font-bold text-ink tabular-nums block">
                        {reflection.utility.withdrawnBeforeDisruptionCount}
                      </span>
                      <span className="text-xs text-ink-2 block">接回即收</span>
                    </div>
                    <div className="rounded bg-ground-2 p-3 space-y-1">
                      <span className="font-mono text-2xl font-bold text-ink-2 tabular-nums block">
                        {reflection.utility.distractingCount}
                      </span>
                      <span className="text-xs text-ink-2 block">标记打扰</span>
                    </div>
                  </div>

                  <p
                    className="text-xs text-ink-2 border-t border-line pt-3 leading-relaxed"
                    data-testid="utility-formula-note"
                  >
                    顺畅表达与自然换气期间已自动过滤 {reflection.utility.suppressedCount}{' '}
                    次非必要弹窗，确保你在台上不被打断视线。
                  </p>
                </div>
              </section>

              {/* 2. Single-Point Rehearsal + Session Timeline */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Single-Point Rehearsal Panel */}
                <div
                  className="lg:col-span-5 border border-line bg-surface rounded-md p-5 space-y-4"
                  data-testid="single-point-rehearsal"
                >
                  <div className="border-b border-line pb-3">
                    <h2 className="text-base font-bold text-ink flex items-center gap-1.5">
                      <RotateCcw className="w-4 h-4 text-violet shrink-0" />
                      <span>薄弱片段单点重练</span>
                    </h2>
                    <p className="text-xs text-ink-3 mt-1 leading-relaxed">
                      不用从头重讲整份 PPT，直接挑出漏讲或卡顿的那一小段再练一遍。
                    </p>
                  </div>

                  {reflection.weakSegments.length === 0 ? (
                    <div className="p-4 rounded bg-resolved-tint/50 border border-resolved/30 text-xs text-resolved">
                      本场节奏与要点覆盖都很扎实，没有需要单独重练的薄弱片段。
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
                                  {WEAK_REASON_LABELS[ws.reason] ?? '建议补强'}
                                </Badge>
                              </div>
                              <p className="text-ink-2 line-clamp-2 leading-relaxed">
                                {ws.promptText}
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      {selectedWeak && (
                        <div className="border border-violet/30 bg-surface-muted/50 rounded p-4 space-y-3 text-xs">
                          <div className="space-y-1">
                            <span className="text-xs font-semibold text-violet-ink block">
                              练习目标
                            </span>
                            <p className="text-ink leading-relaxed">{selectedWeak.promptText}</p>
                          </div>

                          {selectedWeak.excerptText && (
                            <div className="space-y-1">
                              <span className="text-xs text-ink-3 block">刚才的原话回顾：</span>
                              <p className="p-2.5 bg-surface border border-line rounded text-ink-2 leading-relaxed">
                                {selectedWeak.excerptText}
                              </p>
                            </div>
                          )}

                          {selectedWeak.supportingEvidence.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-xs text-ink-3 block">可引用的讲稿数据：</span>
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
                            <span>单独重练这一段</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div
                  className="lg:col-span-7 border border-line bg-surface rounded-md p-5 space-y-4"
                  data-testid="reflection-timeline"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <h2 className="text-base font-bold text-ink">全流程回顾</h2>
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <Filter className="w-3.5 h-3.5 text-ink-3 mr-1" />
                      {(
                        [
                          ['all', '全部'],
                          ['segment', '发言记录'],
                          ['interventions', '提词时刻'],
                          ['qa', '现场提问'],
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
                    <p className="text-xs text-ink-3 py-4">该分类下暂无记录。</p>
                  ) : (
                    <ol className="divide-y divide-line text-xs max-h-[460px] overflow-y-auto pr-1">
                      {filteredTimeline.map((ev) => (
                        <li key={ev.id} className="py-3 flex items-start gap-3">
                          <span className="font-mono text-xs text-ink-3 w-16 whitespace-nowrap shrink-0 pt-0.5 tabular-nums">
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
                                {TIMELINE_EVENT_KIND_LABELS[ev.kind] ?? '现场记录'}
                              </Badge>
                              {ev.level && (
                                <span className="text-xs text-ink-3">
                                  {INTERVENTION_LEVEL_LABELS[ev.level] ?? ev.level}
                                </span>
                              )}
                              {ev.speaker && (
                                <span className="text-xs text-ink-3">
                                  {SPEAKER_LABELS[ev.speaker] ?? ev.speaker}
                                </span>
                              )}
                              {ev.userFeedback && (
                                <Badge
                                  variant={ev.userFeedback === 'helpful' ? 'resolved' : 'amber'}
                                >
                                  {ev.userFeedback === 'helpful' ? '有帮助' : '嫌打扰'}
                                </Badge>
                              )}
                            </div>
                            <p
                              className={cn(
                                'leading-relaxed break-words',
                                ev.kind === 'intervention_withdrawn'
                                  ? 'text-ink-2'
                                  : 'text-ink'
                              )}
                            >
                              {ev.text}
                            </p>
                            {ev.withdrawalReason && (
                              <p className="text-xs text-resolved">
                                {WITHDRAWAL_REASON_LABELS[ev.withdrawalReason]}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </section>

              {/* 3. Suggested Habits */}
              {reflection.memoryProposals.length > 0 && (
                <section
                  className="border border-line bg-surface rounded-md p-5 space-y-4"
                  data-testid="memory-proposals-section"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <div>
                      <h2 className="text-base font-bold text-ink flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber shrink-0" />
                        <span>值得记住的表达习惯</span>
                      </h2>
                      <p className="text-xs text-ink-3 mt-1">
                        从本场表现中提炼的提醒建议，点击「保存为偏好」后将在后续演讲中自动沿用。
                      </p>
                    </div>
                  </div>

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
                                {decision === 'accepted' ? '已保存' : '已跳过'}
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
                                  保存偏好
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h3 className="font-semibold text-sm text-ink">{prop.title}</h3>
                              <p className="text-ink-2 leading-relaxed">{prop.content}</p>
                              <p className="text-xs text-ink-3">{prop.rationale}</p>

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
                                    <span>保存为偏好</span>
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
                                    <span>修改</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRejectProposal(prop.proposalId)}
                                    data-testid={`proposal-reject-${prop.proposalId}`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>跳过</span>
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )
        )}

        {/* 4. Personal Speaking Preferences */}
        <section className="border border-line bg-surface rounded-md p-5">
          <MemoryInspectorPanel refreshTrigger={memoryRefresh} />
        </section>
      </main>
    </div>
  );
};
