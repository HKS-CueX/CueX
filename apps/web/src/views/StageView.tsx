import React, { useEffect, useState } from 'react';
import type {
  InterventionLevel,
  PresentationContextPack,
  PresentationMode,
  PresentationPackSummary,
  TranscriptSpeaker,
  ViewMode,
} from '@cuex/protocol';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Eye,
  HelpCircle,
  Layers,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  VolumeX,
  X,
} from 'lucide-react';
import { CueEdgeLight, type EdgeLightPhase } from '@/components/CueEdgeLight';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { usePresentationSession } from '@/core/session/usePresentationSession';
import { getPresentationPack, listPresentationPacks } from '@/lib/api';
import {
  ASR_MODE_LABELS,
  ATTENTION_SIGNAL_LABELS,
  CONTROLLER_ACTION_LABELS,
  formatDuration,
  formatMs,
  INTERVENTION_LEVEL_LABELS,
  PACE_STATUS_LABELS,
  SUPPRESS_REASON_LABELS,
  WITHDRAWAL_REASON_LABELS,
} from '@/lib/format';
import { cn } from '@/lib/utils';

type PresentationHookReturn = ReturnType<typeof usePresentationSession>;

interface StageViewProps {
  activePack: PresentationContextPack | null;
  onPackChange: (pack: PresentationContextPack) => void;
  privacyAccepted: boolean;
  onPrivacyChange: (accepted: boolean) => void;
  runtime: PresentationHookReturn;
  onLoadDemoPack: () => Promise<PresentationContextPack | null>;
  onGoToCompiler: () => void;
  onGoToReflection: (sessionId?: string) => void;
}

export const StageView: React.FC<StageViewProps> = ({
  activePack,
  onPackChange,
  privacyAccepted,
  onPrivacyChange,
  runtime,
  onLoadDemoPack,
  onGoToCompiler,
  onGoToReflection,
}) => {
  const { state } = runtime;
  const [viewMode, setViewModeLocal] = useState<ViewMode>('focus');
  const [launchMode, setLaunchMode] = useState<PresentationMode>('rehearsal');
  const [savedPacks, setSavedPacks] = useState<PresentationPackSummary[]>([]);
  const [loadingPack, setLoadingPack] = useState(false);

  const [simText, setSimText] = useState('');
  const [simSpeaker, setSimSpeaker] = useState<TranscriptSpeaker>('presenter');
  const [progressiveSim, setProgressiveSim] = useState(false);
  const [showInputDrawer, setShowInputDrawer] = useState(true);
  const [autoNavigateOnEnd, setAutoNavigateOnEnd] = useState(false);

  useEffect(() => {
    if (state.session?.viewMode) {
      setViewModeLocal(state.session.viewMode);
    }
  }, [state.session?.viewMode]);

  useEffect(() => {
    if (!state.session) {
      void listPresentationPacks()
        .then(setSavedPacks)
        .catch(() => {});
    }
  }, [state.session]);

  useEffect(() => {
    if (autoNavigateOnEnd && state.session?.status === 'ended' && state.reflection) {
      setAutoNavigateOnEnd(false);
      onGoToReflection(state.session.sessionId);
    }
  }, [autoNavigateOnEnd, state.session?.status, state.session?.sessionId, state.reflection, onGoToReflection]);

  const handleToggleViewMode = (mode: ViewMode) => {
    setViewModeLocal(mode);
    runtime.setViewMode(mode);
  };

  const handlePickPack = async (packId: string) => {
    if (!packId) return;
    setLoadingPack(true);
    try {
      const pack = await getPresentationPack(packId);
      onPackChange(pack);
    } finally {
      setLoadingPack(false);
    }
  };

  const handleStartFromStage = async () => {
    let packToUse = activePack;
    if (!packToUse) {
      setLoadingPack(true);
      packToUse = await onLoadDemoPack();
      setLoadingPack(false);
    }
    if (!packToUse) return;
    runtime.startSession({
      packId: packToUse.packId,
      contextPack: packToUse,
      mode: launchMode,
      viewMode,
      maxInterventionLevel: 'L3',
      silentMode: false,
      privacyNoticeAccepted: privacyAccepted,
    });
  };

  const handleSimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simText.trim()) return;
    runtime.sendSimulatedSpeech(simText, simSpeaker, progressiveSim);
    setSimText('');
  };

  const handleQuickSnippet = (text: string, speaker: TranscriptSpeaker) => {
    runtime.sendSimulatedSpeech(text, speaker, false);
  };

  const handleEndAndReview = () => {
    setAutoNavigateOnEnd(true);
    runtime.endSession('completed');
  };

  // Pre-session launch gate if no session active
  if (!state.session) {
    return (
      <div className="bg-ground text-ink min-h-[calc(100vh-3.5rem)] py-12 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto border border-line bg-surface rounded-md p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1.5 border-b border-line pb-4">
            <div className="flex items-center gap-2 text-xs font-mono text-ink-3 uppercase">
              <span className="text-amber font-semibold">STAGE 02</span>
              <span>/</span>
              <span>LIVE COGNITIVE COLLABORATION</span>
            </div>
            <h1 className="text-2xl font-bold text-ink">进入场中实时协同</h1>
            <p className="text-xs sm:text-sm text-ink-2">
              选择已编译的演讲 ContextPack，确认麦克风与隐私告知后，即可开启彩排或正式演讲。
            </p>
          </div>

          {state.wipedAt && (
            <div
              className="border border-resolved/30 bg-resolved-tint text-resolved px-4 py-3 rounded text-xs flex items-center gap-2"
              data-testid="session-wiped-notice"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>已彻底清除上一场会话转写、候选与临时状态。</span>
            </div>
          )}

          {state.error && (
            <div className="border border-amber/40 bg-amber-tint text-amber-ink px-4 py-3 rounded text-xs">
              {state.error}
            </div>
          )}

          <div className="space-y-3 text-xs">
            <label className="font-semibold text-ink block">当前演讲上下文包</label>
            {activePack ? (
              <div className="border border-line bg-ground rounded p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm text-ink">{activePack.title}</div>
                  <div className="text-ink-3 mt-0.5">
                    {activePack.facts.filter((f) => f.userConfirmed).length} 条已确认事实 ·{' '}
                    {activePack.cueSheet.chapters.length} 章节 · 目标{' '}
                    {formatDuration(activePack.targetDurationSec)}
                  </div>
                </div>
                <Button type="button" variant="quiet" size="sm" onClick={onGoToCompiler}>
                  返回编辑白名单
                </Button>
              </div>
            ) : (
              <div className="border border-dashed border-line-strong bg-ground/60 rounded p-4 space-y-3">
                <p className="text-ink-2">尚未选定 ContextPack，可选择已保存包或载入路演示例包。</p>
                <div className="flex flex-wrap gap-2">
                  {savedPacks.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => void handlePickPack(e.target.value)}
                      className="h-9 px-3 border border-line bg-surface rounded text-xs text-ink"
                    >
                      <option value="" disabled>
                        选择已保存演讲包...
                      </option>
                      {savedPacks.map((p) => (
                        <option key={p.packId} value={p.packId}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    type="button"
                    variant="amber"
                    size="sm"
                    onClick={() => void onLoadDemoPack()}
                    disabled={loadingPack}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>载入 CueX 路演演示包</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <button
              type="button"
              onClick={() => setLaunchMode('rehearsal')}
              className={cn(
                'text-left p-4 rounded border transition-colors space-y-1',
                launchMode === 'rehearsal'
                  ? 'border-ink bg-ground font-medium'
                  : 'border-line bg-surface hover:bg-ground/50'
              )}
            >
              <div className="font-semibold text-ink">彩排模式 (Rehearsal)</div>
              <p className="text-ink-3">支持测试话术仿真、随时切换视角、检验提示与撤回机制。</p>
            </button>
            <button
              type="button"
              onClick={() => setLaunchMode('live')}
              className={cn(
                'text-left p-4 rounded border transition-colors space-y-1',
                launchMode === 'live'
                  ? 'border-ink bg-ground font-medium'
                  : 'border-line bg-surface hover:bg-ground/50'
              )}
            >
              <div className="font-semibold text-ink">正式演讲 (Live)</div>
              <p className="text-ink-3">开启 Focus 余光极简界面，最小必要干扰陪你完成真实演讲。</p>
            </button>
          </div>

          <label className="flex items-start gap-2.5 border border-line bg-ground rounded p-3.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => onPrivacyChange(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-ink"
              data-testid="stage-privacy-checkbox"
            />
            <span className="text-ink-2 leading-relaxed">
              我已确认麦克风仅在本场会话期间采集，场后未确认记忆不会落盘，并可随时一键清除本场会话记录。
            </span>
          </label>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="quiet" onClick={onGoToCompiler}>
              先去场前编译
            </Button>
            <Button
              type="button"
              disabled={!privacyAccepted || loadingPack}
              onClick={() => void handleStartFromStage()}
              data-testid="stage-start-btn"
              className="gap-1.5"
            >
              <span>开始场中协同</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const session = state.session;
  const cog = state.cognitiveState;
  const pres = state.presentationState;
  const activeIntervention = state.activeIntervention;
  const lastWithdrawn = state.lastWithdrawn;
  const latestVerdict = state.verdicts[state.verdicts.length - 1];
  const isEnded = session.status === 'ended';
  const isPaused = session.status === 'paused';
  const isSilent = session.silentMode;

  // Compute peripheral EdgeLight phase
  let edgePhase: EdgeLightPhase = 'quiet';
  if (!isSilent && !isPaused && !isEnded) {
    if (lastWithdrawn) {
      edgePhase = 'withdrawn';
    } else if (activeIntervention) {
      if (activeIntervention.level === 'L1') {
        edgePhase = activeIntervention.evidenceIds.length > 0 ? 'l1_violet' : 'l1_amber';
      } else {
        edgePhase = 'l2_active';
      }
    } else if (cog?.attentionSignal === 'drifting' || cog?.attentionSignal === 'omission_risk') {
      edgePhase = 'l1_amber';
    }
  }

  const matchedEvidence = activeIntervention
    ? (activePack?.evidence ?? state.rehearsalContext?.supportingEvidence ?? []).filter((ev) =>
        activeIntervention.evidenceIds.includes(ev.id)
      )
    : [];

  const activeAsrMode =
    runtime.micMode === 'browser_webspeech'
      ? 'browser_webspeech'
      : state.asrStatus?.mode ?? 'text_simulation';

  return (
    <div
      className="bg-ground text-ink min-h-[calc(100vh-3.5rem)] flex flex-col"
      data-testid="stage-workspace"
    >
      <CueEdgeLight phase={edgePhase} paused={isPaused} />

      {/* Top Session Bar */}
      <div className="w-full border-b border-line bg-surface/95 px-4 sm:px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="font-semibold text-ink truncate max-w-[240px]">
              {activePack?.title ?? 'CueX Presentation 会话'}
            </span>
            <Badge variant={session.mode === 'rehearsal' ? 'violet' : 'amber'}>
              {session.mode === 'rehearsal' ? '彩排模式' : '正式演讲'}
            </Badge>
            <Badge
              variant={isEnded ? 'secondary' : isPaused ? 'amber' : 'resolved'}
              data-testid="stage-session-status"
            >
              <Radio className="w-3 h-3" />
              <span>
                {isEnded
                  ? '已结束'
                  : isPaused
                    ? '监听已暂停'
                    : state.wsStatus === 'connected'
                      ? '实时协同中'
                      : state.wsStatus}
              </span>
            </Badge>

            {/* Privacy Recording Badge */}
            <Badge
              variant={runtime.micMode !== 'off' ? 'amber' : 'outline'}
              data-testid="privacy-recording-badge"
            >
              {runtime.micMode !== 'off' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber animate-pulse" />
                  <span>正在收音（仅本场会话 · 可随时清除）</span>
                </>
              ) : (
                <span>麦克风未开启</span>
              )}
            </Badge>
          </div>

          {/* Focus / Inspector Dual View Switch */}
          <div
            className="inline-flex rounded border border-line bg-ground p-0.5"
            role="group"
            aria-label="切换视角"
          >
            <button
              type="button"
              onClick={() => handleToggleViewMode('focus')}
              data-testid="view-toggle-focus"
              aria-pressed={viewMode === 'focus'}
              className={cn(
                'px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5',
                viewMode === 'focus'
                  ? 'bg-ink text-ground shadow-sm'
                  : 'text-ink-2 hover:text-ink'
              )}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Focus 极简视角</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleViewMode('inspector')}
              data-testid="view-toggle-inspector"
              aria-pressed={viewMode === 'inspector'}
              className={cn(
                'px-3 py-1 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5',
                viewMode === 'inspector'
                  ? 'bg-ink text-ground shadow-sm'
                  : 'text-ink-2 hover:text-ink'
              )}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Inspector 透视视角</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={runtime.wipeCurrentSession}
              data-testid="wipe-session-btn"
              title="立刻销毁本场转写、候选与临时状态"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-ink" />
              <span>清除本场</span>
            </Button>

            {isEnded ? (
              <Button
                type="button"
                size="sm"
                onClick={() => onGoToReflection(session.sessionId)}
                data-testid="go-reflection-btn"
              >
                <span>查看场后复盘</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleEndAndReview}
                data-testid="end-session-btn"
              >
                <span>结束并进入复盘</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {state.error && (
        <div
          role="alert"
          className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-3"
          data-testid="stage-error"
        >
          <div className="border border-amber/40 bg-amber-tint text-amber-ink px-4 py-2 rounded text-xs">
            {state.error}
          </div>
        </div>
      )}

      {/* ==================== FOCUS VIEW ==================== */}
      {viewMode === 'focus' && (
        <div
          className="flex-1 max-w-[1180px] w-full mx-auto px-4 sm:px-6 py-6 flex flex-col justify-between gap-6"
          data-testid="focus-view"
        >
          {/* Chapter & Pace Header */}
          <div className="border border-line bg-surface rounded-md p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-ink-3 uppercase">CURRENT CHAPTER</span>
                {pres && (
                  <Badge
                    variant={
                      pres.paceStatus === 'overtime'
                        ? 'amber'
                        : pres.paceStatus === 'on_pace'
                          ? 'resolved'
                          : 'secondary'
                    }
                  >
                    {PACE_STATUS_LABELS[pres.paceStatus]}
                  </Badge>
                )}
              </div>
              <div className="text-xl sm:text-2xl font-bold text-ink truncate">
                {cog?.activeChapterTitle ??
                  pres?.chapterNodes[pres.activeChapterIndex]?.title ??
                  '开场与核心论点'}
              </div>

              {pres && pres.chapterNodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {pres.chapterNodes.map((ch, idx) => (
                    <button
                      key={ch.chapterId}
                      type="button"
                      onClick={() => runtime.setChapter(ch.chapterId)}
                      data-testid={`focus-chapter-${ch.chapterId}`}
                      className={cn(
                        'px-2.5 py-1 rounded text-[11px] border transition-colors',
                        ch.chapterId === pres.activeChapterId
                          ? 'bg-ink text-ground border-ink font-medium'
                          : ch.status === 'completed'
                            ? 'bg-resolved-tint/60 text-resolved border-resolved/30'
                            : 'bg-ground text-ink-2 border-line hover:bg-ground-2'
                      )}
                    >
                      0{idx + 1} {ch.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="text-left sm:text-right shrink-0">
              <div
                className="font-mono text-3xl sm:text-4xl font-semibold num text-ink tracking-tight"
                data-testid="focus-timer"
              >
                {formatDuration(pres?.elapsedSec ?? 0)}
                <span className="text-lg text-ink-3 font-normal">
                  {' '}
                  / {formatDuration(pres?.targetDurationSec ?? activePack?.targetDurationSec ?? 300)}
                </span>
              </div>
              <div className="text-[11px] text-ink-3 mt-1">
                当前注意态：{ATTENTION_SIGNAL_LABELS[cog?.attentionSignal ?? 'fluent']} · 干预上限{' '}
                <span className="font-mono font-semibold text-ink">
                  {session.maxInterventionLevel}
                </span>
              </div>
            </div>
          </div>

          {/* Rehearsal Prompt Strip */}
          {state.rehearsalContext && (
            <div
              className="border border-violet/35 bg-violet-tint/50 rounded-md p-4 text-xs space-y-2"
              data-testid="rehearsal-banner"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-violet-ink">
                  单点重练模式 · 目标片段：{state.rehearsalContext.weakSegment.chapterTitle}
                </span>
                <Badge variant="violet">Rehearsal Target</Badge>
              </div>
              <p className="text-ink leading-relaxed">{state.rehearsalContext.promptText}</p>
              {state.rehearsalContext.supportingEvidence.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {state.rehearsalContext.supportingEvidence.map((ev) => (
                    <span
                      key={ev.id}
                      className="px-2 py-0.5 rounded bg-surface border border-violet/25 text-ink-2"
                    >
                      依据：{ev.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Central Peripheral-Vision Cue Stage */}
          <div
            className="flex-1 flex flex-col items-center justify-center min-h-[260px] border border-line bg-surface rounded-md p-6 sm:p-10 shadow-sm relative"
            data-testid="focus-cue-stage"
          >
            {isSilent ? (
              <div className="text-center space-y-3" data-testid="focus-silent-state">
                <VolumeX className="w-8 h-8 text-ink-3 mx-auto" />
                <div className="text-xl font-semibold text-ink">L0 · 静默模式已开启</div>
                <p className="text-xs text-ink-2 max-w-md">
                  系统仍在静默记录转写与覆盖率，但不会向画面输出任何 L1–L3 干预提示。
                </p>
              </div>
            ) : activeIntervention ? (
              <div
                className="w-full max-w-2xl text-center space-y-5"
                data-testid="focus-active-intervention"
                data-level={activeIntervention.level}
                data-grounded={activeIntervention.grounded}
              >
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Badge
                    variant={activeIntervention.level === 'L3' ? 'violet' : 'amber'}
                    className="font-mono"
                  >
                    {INTERVENTION_LEVEL_LABELS[activeIntervention.level]}
                  </Badge>
                  {activeIntervention.grounded ? (
                    <Badge variant="resolved">
                      <ShieldCheck className="w-3 h-3" />
                      已核验事实依据 ({activeIntervention.evidenceIds.length})
                    </Badge>
                  ) : (
                    <Badge variant="amber">
                      <ShieldAlert className="w-3 h-3" />
                      资料未覆盖 · 勿现场编造
                    </Badge>
                  )}
                </div>

                {/* L1: Subtle minimal whisper */}
                {activeIntervention.level === 'L1' && (
                  <div className="space-y-2">
                    <div className="text-2xl sm:text-3xl font-semibold text-amber-ink tracking-tight">
                      {activeIntervention.title}
                    </div>
                    <p className="text-sm text-ink-2">{activeIntervention.cueText}</p>
                  </div>
                )}

                {/* L2: Crisp large 2-6+ char keyword pill readable by peripheral vision */}
                {activeIntervention.level === 'L2' && (
                  <div className="space-y-3">
                    <div className="inline-block px-6 py-3 rounded-md bg-amber-tint border-2 border-amber/50 text-3xl sm:text-5xl font-bold tracking-tight text-ink">
                      {activeIntervention.cueText}
                    </div>
                    <p className="text-sm text-ink-2">{activeIntervention.title}</p>
                  </div>
                )}

                {/* L3: Concise 2-3 bullet scaffold */}
                {activeIntervention.level === 'L3' && (
                  <div className="space-y-4 text-left bg-violet-tint/35 border border-violet/35 rounded-md p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base sm:text-lg font-bold text-ink">
                        {activeIntervention.title}
                      </span>
                      <span className="text-xs font-mono text-violet-ink">L3 脚手架</span>
                    </div>
                    <p className="text-lg sm:text-2xl font-semibold text-ink leading-snug">
                      {activeIntervention.cueText}
                    </p>
                    {activeIntervention.bullets && activeIntervention.bullets.length > 0 && (
                      <ul className="space-y-2 pt-1 text-sm sm:text-base text-ink-2 list-disc pl-5">
                        {activeIntervention.bullets.slice(0, 3).map((b, idx) => (
                          <li key={idx}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {activeIntervention.missingEvidenceNotice && (
                  <div
                    className="border border-amber/40 bg-amber-tint rounded p-3 text-xs text-amber-ink text-left flex items-start gap-2"
                    data-testid="missing-evidence-warning"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{activeIntervention.missingEvidenceNotice}</span>
                  </div>
                )}

                {matchedEvidence.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 pt-1 text-[11px] text-ink-3">
                    {matchedEvidence.map((ev) => (
                      <span
                        key={ev.id}
                        className="px-2.5 py-1 rounded bg-ground border border-line"
                      >
                        出处：{ev.source} · {ev.text}
                      </span>
                    ))}
                  </div>
                )}

                {/* Micro-feedback (H/I) + Dismiss suppression */}
                <div className="pt-3 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant={activeIntervention.userFeedback === 'helpful' ? 'resolved' : 'quiet'}
                    size="sm"
                    onClick={() => runtime.sendFeedback(activeIntervention.interventionId, 'helpful')}
                    data-testid="feedback-helpful-btn"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span>有效 (H)</span>
                  </Button>
                  <Button
                    type="button"
                    variant={activeIntervention.userFeedback === 'distracting' ? 'amber' : 'quiet'}
                    size="sm"
                    onClick={() =>
                      runtime.sendFeedback(activeIntervention.interventionId, 'distracting')
                    }
                    data-testid="feedback-distracting-btn"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                    <span>打扰 (I)</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => runtime.dismissHint('user_dismissed_in_focus')}
                    data-testid="dismiss-hint-btn"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>忽略并抑制此提示</span>
                  </Button>
                </div>
              </div>
            ) : lastWithdrawn ? (
              <div
                className="text-center space-y-2 max-w-lg border border-resolved/35 bg-resolved-tint/60 rounded-md px-6 py-5"
                data-testid="focus-withdrawn-banner"
              >
                <Badge variant="resolved">主动退出 · 已自动撤回</Badge>
                {lastWithdrawn.cueText && (
                  <p className="text-lg text-ink-3">
                    <del>{lastWithdrawn.cueText}</del>
                  </p>
                )}
                <p className="text-xs text-resolved font-medium">
                  {WITHDRAWAL_REASON_LABELS[lastWithdrawn.reason] ?? lastWithdrawn.reason}
                </p>
              </div>
            ) : (
              <div className="text-center space-y-3" data-testid="focus-l0-quiet">
                <div className="w-3 h-3 rounded-full bg-resolved/70 mx-auto animate-pulse" />
                <div className="text-lg sm:text-xl font-medium text-ink">
                  L0 · 正在持续理解，当前无需干预
                </div>
                <p className="text-xs text-ink-3 max-w-md">
                  保持你的正常节奏即可；只有当出现显著偏离、遗漏或现场问答时，CueX 才会以最小必要方式接住你。
                </p>
                {pres && pres.missedKeyPoints.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1.5 pt-2">
                    <span className="text-[11px] text-ink-3">当前章节待覆盖：</span>
                    {pres.missedKeyPoints.slice(0, 4).map((m) => (
                      <span
                        key={m.pointId}
                        className="text-[11px] px-2 py-0.5 rounded bg-ground border border-line text-ink-2"
                      >
                        {m.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Minimal Speaker Controls Bar */}
          <div className="border border-line bg-surface rounded-md p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={isPaused ? 'amber' : 'quiet'}
                size="sm"
                onClick={isPaused ? runtime.resumeSession : runtime.pauseSession}
                data-testid="toggle-pause-btn"
              >
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{isPaused ? '恢复监听' : '暂停监听'}</span>
              </Button>

              <Button
                type="button"
                variant={isSilent ? 'default' : 'quiet'}
                size="sm"
                onClick={() => runtime.setSilentMode(!isSilent)}
                data-testid="toggle-silent-btn"
              >
                <VolumeX className="w-3.5 h-3.5" />
                <span>{isSilent ? '关闭静默模式' : '静默模式 (L0)'}</span>
              </Button>

              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() => runtime.requestHelp('L2')}
                data-testid="request-help-l2-btn"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber" />
                <span>请求提示 (L2)</span>
              </Button>

              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() => runtime.requestHelp('L3')}
                data-testid="request-help-l3-btn"
              >
                <Layers className="w-3.5 h-3.5 text-violet" />
                <span>展开要点 (L3)</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-ink-2">
                <span>最高级别：</span>
                <select
                  value={session.maxInterventionLevel}
                  onChange={(e) => runtime.setCeilingLevel(e.target.value as InterventionLevel)}
                  data-testid="ceiling-select"
                  className="border border-line bg-ground rounded px-2 py-1 text-ink font-mono"
                >
                  <option value="L0">L0</option>
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                </select>
              </label>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowInputDrawer((v) => !v)}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{showInputDrawer ? '收起语音与测试面板' : '展开语音与测试面板'}</span>
              </Button>
            </div>
          </div>

          {/* Speech Input & Honest ASR / Text Simulation Panel */}
          {showInputDrawer && (
            <div
              className="border border-line bg-surface rounded-md p-4 space-y-4 text-xs shadow-sm"
              data-testid="stage-input-panel"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">实时语音采集与输入链路</span>
                  <Badge
                    variant={
                      activeAsrMode === 'text_simulation'
                        ? 'amber'
                        : activeAsrMode === 'browser_webspeech'
                          ? 'violet'
                          : 'resolved'
                    }
                    data-testid="asr-capability-badge"
                  >
                    {ASR_MODE_LABELS[activeAsrMode]}
                  </Badge>
                  {state.asrStatus && (
                    <span className="text-[11px] text-ink-3">{state.asrStatus.detail}</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={runtime.micMode === 'pcm_mic' ? 'amber' : 'quiet'}
                    size="sm"
                    onClick={() =>
                      runtime.micMode === 'pcm_mic'
                        ? runtime.stopAllAudio()
                        : void runtime.startPcmMic()
                    }
                    disabled={isPaused || isEnded}
                    data-testid="toggle-pcm-mic-btn"
                  >
                    {runtime.micMode === 'pcm_mic' ? (
                      <MicOff className="w-3.5 h-3.5" />
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {runtime.micMode === 'pcm_mic' ? '停止 PCM 麦克风' : '真实麦克风 (PCM16)'}
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant={runtime.micMode === 'browser_webspeech' ? 'violet' : 'quiet'}
                    size="sm"
                    onClick={() =>
                      runtime.micMode === 'browser_webspeech'
                        ? runtime.stopAllAudio()
                        : runtime.startWebSpeech()
                    }
                    disabled={!runtime.webSpeechSupported || isPaused || isEnded}
                    title={
                      runtime.webSpeechSupported
                        ? '使用浏览器原生 SpeechRecognition'
                        : '当前浏览器不支持 Web Speech API'
                    }
                    data-testid="toggle-webspeech-btn"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>
                      {runtime.webSpeechSupported
                        ? runtime.micMode === 'browser_webspeech'
                          ? '停止 Web Speech'
                          : '浏览器 Web Speech'
                        : 'Web Speech（浏览器不支持）'}
                    </span>
                  </Button>
                </div>
              </div>

              {runtime.micMode === 'pcm_mic' && (
                <div className="flex items-center gap-3 bg-ground rounded px-3 py-2">
                  <span className="text-ink-2">麦克风电平：</span>
                  <meter min={0} max={1} value={runtime.micVolume} className="w-40" />
                  {state.asrStatus?.mode === 'text_simulation' && (
                    <span className="text-amber-ink">
                      提示：服务端当前未启用 Sherpa ASR（仅文本仿真可识别语义），可切换右侧 Web Speech 或下方文本仿真测试。
                    </span>
                  )}
                </div>
              )}

              {runtime.micError && (
                <p className="text-amber-ink bg-amber-tint border border-amber/30 rounded px-3 py-2">
                  {runtime.micError}
                </p>
              )}

              {/* Explicitly labeled Text Simulation Panel */}
              <div className="bg-ground/70 border border-line rounded p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="amber">文本仿真输入 · 非真实麦克风 ASR</Badge>
                    <span className="text-ink-3">
                      用于快速验证 L0/L1/L2/L3 判定、自动撤回与现场 Q&amp;A 事实核验
                    </span>
                  </div>
                  <label className="flex items-center gap-1.5 text-ink-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={progressiveSim}
                      onChange={(e) => setProgressiveSim(e.target.checked)}
                      className="accent-ink"
                    />
                    <span>逐段流式送出</span>
                  </label>
                </div>

                <form onSubmit={handleSimSubmit} className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={simSpeaker}
                    onChange={(e) => setSimSpeaker(e.target.value as TranscriptSpeaker)}
                    data-testid="sim-speaker-select"
                    className="border border-line bg-surface rounded px-2.5 py-2 text-ink sm:w-36"
                  >
                    <option value="presenter">演讲者 (Presenter)</option>
                    <option value="audience">观众提问 (Audience)</option>
                  </select>
                  <input
                    type="text"
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    placeholder="输入仿真话术或观众追问，按 Enter 提交..."
                    disabled={isEnded}
                    data-testid="sim-speech-input"
                    className="flex-1 border border-line bg-surface rounded px-3 py-2 text-ink"
                  />
                  <Button
                    type="submit"
                    disabled={isEnded || !simText.trim()}
                    data-testid="sim-speech-submit"
                    className="gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>发送测试话术</span>
                  </Button>
                </form>

                {/* Quick E2E / Demo Simulation Snippets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-ink-3 mr-1">示例话术片段：</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickSnippet(
                        '各位评委好，今天汇报 CueX 通用实时认知外挂。它的核心理念是在深度思考之外接住当下，核心系统围绕实时理解与最小必要干预构建。',
                        'presenter'
                      )
                    }
                    className="px-2 py-1 rounded border border-line bg-surface hover:bg-ground-2 text-[11px] text-ink-2"
                  >
                    1. 流畅开场（应保持 L0）
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickSnippet(
                        '顺便聊一个我昨天在咖啡厅想到的界面配色细节和个人生活随想，先不管核心架构和指标。',
                        'presenter'
                      )
                    }
                    className="px-2 py-1 rounded border border-line bg-surface hover:bg-ground-2 text-[11px] text-amber-ink"
                  >
                    2. 跑偏/遗漏（触发提示）
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickSnippet(
                        '回到核心架构：CueX 通过 System 1 与 System 2 并行，再由独立 InterventionController 控制介入并用 V = H - λI 度量净有效介入。',
                        'presenter'
                      )
                    }
                    className="px-2 py-1 rounded border border-line bg-surface hover:bg-ground-2 text-[11px] text-resolved"
                  >
                    3. 主动补正（应自动撤回）
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickSnippet(
                        '请问你们是如何量化衡量一次干预到底有没有打扰用户的？公式和默认参数是什么？',
                        'audience'
                      )
                    }
                    className="px-2 py-1 rounded border border-line bg-surface hover:bg-ground-2 text-[11px] text-violet-ink"
                  >
                    4. 观众追问（白名单有依据）
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickSnippet(
                        '请问你们明年第三季度的海外定价策略、已完成签署的百万级企业付费合同金额是多少？',
                        'audience'
                      )
                    }
                    className="px-2 py-1 rounded border border-line bg-surface hover:bg-ground-2 text-[11px] text-amber-ink"
                  >
                    5. 观众追问（资料未覆盖 · 警示勿编造）
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== INSPECTOR VIEW ==================== */}
      {viewMode === 'inspector' && (
        <div
          className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-5"
          data-testid="inspector-view"
        >
          {/* Top Real Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            <div className="border border-line bg-surface rounded p-3 space-y-0.5">
              <span className="text-[11px] text-ink-3 block">contextVersion</span>
              <span className="font-mono text-lg font-bold text-ink" data-testid="inspector-ctx-ver">
                v{cog?.contextVersion ?? 0}
              </span>
            </div>
            <div className="border border-line bg-surface rounded p-3 space-y-0.5">
              <span className="text-[11px] text-ink-3 block">System 1 延迟</span>
              <span className="font-mono text-lg font-bold text-amber-ink">
                {state.telemetry?.lastSystem1LatencyMs ?? latestVerdict?.latencyMs ?? 0} ms
              </span>
            </div>
            <div className="border border-line bg-surface rounded p-3 space-y-0.5">
              <span className="text-[11px] text-ink-3 block">模型调用 / 本地规则</span>
              <span className="font-mono text-lg font-bold text-ink">
                {state.telemetry?.modelCalls ?? 0} / {state.telemetry?.localRuleEvaluations ?? 0}
              </span>
            </div>
            <div className="border border-line bg-surface rounded p-3 space-y-0.5">
              <span className="text-[11px] text-ink-3 block">真实 Token 消耗</span>
              <span className="font-mono text-lg font-bold text-violet-ink" data-testid="inspector-tokens">
                {state.telemetry?.totalTokens ?? 0}
              </span>
            </div>
            <div className="border border-line bg-surface rounded p-3 space-y-0.5">
              <span className="text-[11px] text-ink-3 block">Cached Tokens</span>
              <span className="font-mono text-lg font-bold text-ink">
                {state.telemetry?.cachedInputTokens ?? 0}
              </span>
            </div>
            <div className="border border-line bg-surface rounded p-3 space-y-0.5">
              <span className="text-[11px] text-ink-3 block">计费/推理模式</span>
              <span className="text-xs font-semibold text-ink block mt-1">
                {state.telemetry?.estimation.usingLocalFallback
                  ? '本地规则零 Token 回退'
                  : state.telemetry?.estimation.source ?? '待统计'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left: Live Transcript + SharedCognitiveState */}
            <div className="lg:col-span-4 space-y-5">
              <section
                className="border border-line bg-surface rounded-md p-4 space-y-3 text-xs"
                data-testid="inspector-transcript"
              >
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="font-bold text-ink">ASR 能力与转写流</span>
                  <Badge variant="outline" className="text-[10px]">
                    {state.asrStatus ? ASR_MODE_LABELS[state.asrStatus.mode] : '未知'}
                  </Badge>
                </div>
                {state.asrStatus && (
                  <p className="text-[11px] text-ink-3">
                    backend: <span className="font-mono">{state.asrStatus.backend}</span> · available:{' '}
                    {String(state.asrStatus.available)} · {state.asrStatus.detail}
                  </p>
                )}
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {state.transcripts.length === 0 ? (
                    <p className="text-ink-3">等待语音或文本仿真输入...</p>
                  ) : (
                    state.transcripts.map((seg) => (
                      <div
                        key={seg.segmentId}
                        className="p-2 rounded bg-ground border border-line space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-ink-3">
                          <span>
                            {seg.speaker} · {seg.source ?? 'unknown'} ·{' '}
                            {seg.isFinal ? 'FINAL' : 'PARTIAL'}
                          </span>
                          <span>{formatMs(seg.startMs)}</span>
                        </div>
                        <p className="text-ink leading-relaxed">{seg.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section
                className="border border-line bg-surface rounded-md p-4 space-y-2.5 text-xs"
                data-testid="inspector-cognitive-state"
              >
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="font-bold text-ink">SharedCognitiveState</span>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {ATTENTION_SIGNAL_LABELS[cog?.attentionSignal ?? 'fluent']}
                  </Badge>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div>
                    <span className="text-ink-3">当前章节：</span>
                    <span className="font-medium text-ink">{cog?.activeChapterTitle ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-ink-3">待覆盖缺口：</span>
                    <span className="text-ink">
                      {cog?.openGapLabels.length ? cog.openGapLabels.join('、') : '无'}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-3">冷却时间：</span>
                    <span className="font-mono text-ink">
                      {cog?.cooldownUntilMs && cog.cooldownUntilMs > Date.now()
                        ? `${Math.ceil((cog.cooldownUntilMs - Date.now()) / 1000)}s`
                        : '就绪'}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-3">抑制条目数：</span>
                    <span className="font-mono text-ink">{cog?.suppressions.length ?? 0}</span>
                  </div>
                </div>
              </section>
            </div>

            {/* Middle: System 1 Verdicts & System 2 Candidates */}
            <div className="lg:col-span-4 space-y-5">
              <section
                className="border border-line bg-surface rounded-md p-4 space-y-3 text-xs"
                data-testid="inspector-system1"
              >
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="font-bold text-ink flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber" />
                    System 1 · 快速判决流
                  </span>
                  <span className="font-mono text-[10px] text-ink-3">
                    {state.verdicts.length} 条记录
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {state.verdicts.length === 0 ? (
                    <p className="text-ink-3">等待 System 1 评估...</p>
                  ) : (
                    [...state.verdicts].reverse().map((v) => (
                      <div
                        key={v.requestId}
                        className="p-2.5 rounded bg-ground border border-line space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <Badge variant={v.driftDetected ? 'amber' : 'resolved'}>
                            {v.cognitiveState} → {v.interventionNeed}
                          </Badge>
                          <span className="font-mono text-[10px] text-ink-3">
                            {v.latencyMs}ms · {v.backend}
                          </span>
                        </div>
                        <p className="text-ink-2">{v.reason}</p>
                        <div className="text-[10px] font-mono text-ink-3">
                          omission={String(v.signals.semanticOmission)} · drift=
                          {String(v.signals.topicDrift)} · qa={String(v.signals.openQuestion)} ·
                          recovery={String(v.signals.recovery)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section
                className="border border-line bg-surface rounded-md p-4 space-y-3 text-xs"
                data-testid="inspector-system2"
              >
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="font-bold text-ink flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-violet" />
                    System 2 · 候选与事实绑定
                  </span>
                  <span className="font-mono text-[10px] text-ink-3">
                    {state.candidates.length} 个候选
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {state.candidates.length === 0 ? (
                    <p className="text-ink-3">暂无 System 2 候选提示。</p>
                  ) : (
                    [...state.candidates].reverse().map((c) => (
                      <div
                        key={c.candidateId}
                        className="p-2.5 rounded bg-ground border border-line space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Badge variant={c.status === 'withdrawn' ? 'resolved' : 'violet'}>
                              {c.level} · {c.status}
                            </Badge>
                            <Badge variant={c.grounded ? 'resolved' : 'amber'}>
                              {c.grounded ? `grounded (${c.evidenceIds.length})` : 'ungrounded'}
                            </Badge>
                          </div>
                          <span className="font-mono text-[10px] text-ink-3">
                            v{c.contextVersion}
                          </span>
                        </div>
                        <div className="font-semibold text-ink">{c.title}</div>
                        <p className="text-ink-2">{c.cueText}</p>
                        {c.withdrawalReason && (
                          <p className="text-[11px] text-resolved">
                            撤回原因：{c.withdrawalReason}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* Right: InterventionController Arbitration Log */}
            <div className="lg:col-span-4 space-y-5">
              <section
                className="border border-line bg-surface rounded-md p-4 space-y-3 text-xs"
                data-testid="inspector-controller"
              >
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="font-bold text-ink flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-ink" />
                    InterventionController 仲裁日志
                  </span>
                  <span className="font-mono text-[10px] text-ink-3">
                    {state.decisions.length} 条裁决
                  </span>
                </div>
                <div className="max-h-[540px] overflow-y-auto space-y-2 pr-1">
                  {state.decisions.length === 0 ? (
                    <p className="text-ink-3">等待 Controller 裁决...</p>
                  ) : (
                    [...state.decisions].reverse().map((d) => (
                      <div
                        key={d.decisionId}
                        data-testid="controller-decision-row"
                        className="p-2.5 rounded bg-ground border border-line space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge
                            variant={
                              d.selectedAction === 'withdraw'
                                ? 'resolved'
                                : d.selectedAction === 'stay_silent'
                                  ? 'secondary'
                                  : 'amber'
                            }
                          >
                            {CONTROLLER_ACTION_LABELS[d.selectedAction] ?? d.selectedAction}
                          </Badge>
                          <span className="font-mono text-[10px] text-ink-3">
                            v{d.contextVersion}
                          </span>
                        </div>
                        <p className="text-ink">{d.reason}</p>
                        {d.suppressReason && (
                          <p className="text-[11px] text-ink-3">
                            抑制理由：
                            {SUPPRESS_REASON_LABELS[
                              d.suppressReason as keyof typeof SUPPRESS_REASON_LABELS
                            ] ?? d.suppressReason}
                          </p>
                        )}
                        {d.withdrawalReason && (
                          <p className="text-[11px] text-resolved">
                            撤回理由：{WITHDRAWAL_REASON_LABELS[d.withdrawalReason]}
                          </p>
                        )}
                        <div className="text-[10px] font-mono text-ink-3">
                          ceiling={d.trace.ceilingLevel} · cooldown={d.trace.cooldownRemainingMs}ms ·
                          evidence={d.trace.evidenceCount} · rules=[
                          {d.trace.rulesApplied.join(', ')}]
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>

          {/* Also provide simulation / audio control strip inside Inspector for effortless testing */}
          <div className="border border-line bg-surface rounded-md p-4 text-xs">
            <form onSubmit={handleSimSubmit} className="flex flex-col sm:flex-row gap-2 items-center">
              <Badge variant="amber" className="shrink-0">
                <AlertCircle className="w-3 h-3" />
                快速文本仿真注入
              </Badge>
              <select
                value={simSpeaker}
                onChange={(e) => setSimSpeaker(e.target.value as TranscriptSpeaker)}
                className="border border-line bg-ground rounded px-2.5 py-1.5 text-ink"
              >
                <option value="presenter">演讲者</option>
                <option value="audience">观众提问</option>
              </select>
              <input
                type="text"
                value={simText}
                onChange={(e) => setSimText(e.target.value)}
                placeholder="输入测试话术直接观察 System 1/2 与 Controller 仲裁日志..."
                className="flex-1 w-full border border-line bg-ground rounded px-3 py-1.5 text-ink"
              />
              <Button type="submit" size="sm" disabled={isEnded || !simText.trim()}>
                注入测试文本
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
