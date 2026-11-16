import React, { useEffect, useState } from 'react';
import type {
  ColabAsrLifecycleState,
  HealthStatusResponse,
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
  ChevronDown,
  Columns2,
  Cpu,
  ExternalLink,
  Eye,
  HelpCircle,
  Keyboard,
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
  COLAB_ASR_LIFECYCLE_LABELS,
  CONTROLLER_ACTION_LABELS,
  extractGlanceableCue,
  formatDateTime,
  formatDuration,
  formatMoneyFen,
  formatMs,
  formatTime,
  INTERVENTION_LEVEL_LABELS,
  PACE_STATUS_LABELS,
  S1_PROVIDER_KIND_LABELS,
  SUPPRESS_REASON_LABELS,
  SYSTEM2_GUIDANCE_BIAS_LABELS,
  USAGE_SOURCE_LABELS,
  WITHDRAWAL_REASON_LABELS,
} from '@/lib/format';
import { cn } from '@/lib/utils';

type PresentationHookReturn = ReturnType<typeof usePresentationSession>;
export type StageLayoutMode = 'standard' | 'split_strip';

function getColabLifecycleBadgeVariant(
  lifecycle?: ColabAsrLifecycleState
): 'resolved' | 'amber' | 'violet' | 'outline' {
  switch (lifecycle) {
    case 'ready':
      return 'resolved';
    case 'starting':
    case 'restarting':
      return 'violet';
    case 'degraded':
    case 'disconnected':
    case 'unavailable':
      return 'amber';
    default:
      return 'outline';
  }
}

interface StageViewProps {
  activePack: PresentationContextPack | null;
  onPackChange: (pack: PresentationContextPack) => void;
  privacyAccepted: boolean;
  onPrivacyChange: (accepted: boolean) => void;
  authReady?: boolean;
  health?: HealthStatusResponse | null;
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
  authReady = true,
  health = null,
  runtime,
  onLoadDemoPack,
  onGoToCompiler,
  onGoToReflection,
}) => {
  const { state } = runtime;
  const [viewMode, setViewModeLocal] = useState<ViewMode>('focus');
  const [layoutMode, setLayoutMode] = useState<StageLayoutMode>('standard');
  const [launchMode, setLaunchMode] = useState<PresentationMode>('live');
  const [savedPacks, setSavedPacks] = useState<PresentationPackSummary[]>([]);
  const [loadingPack, setLoadingPack] = useState(false);

  const [simText, setSimText] = useState('');
  const [simSpeaker, setSimSpeaker] = useState<TranscriptSpeaker>('presenter');
  const [progressiveSim, setProgressiveSim] = useState(false);
  const [showInputDrawer, setShowInputDrawer] = useState(false);
  const [autoNavigateOnEnd, setAutoNavigateOnEnd] = useState(false);
  const [companionLaunchNote, setCompanionLaunchNote] = useState<string | null>(null);

  useEffect(() => {
    if (state.session?.viewMode) {
      setViewModeLocal(state.session.viewMode);
    }
  }, [state.session?.viewMode]);

  useEffect(() => {
    if (!state.session && authReady) {
      void listPresentationPacks()
        .then(setSavedPacks)
        .catch(() => {});
    }
  }, [state.session, authReady]);

  useEffect(() => {
    if (autoNavigateOnEnd && state.session?.status === 'ended' && state.reflection) {
      setAutoNavigateOnEnd(false);
      onGoToReflection(state.session.sessionId);
    }
  }, [autoNavigateOnEnd, state.session?.status, state.session?.sessionId, state.reflection, onGoToReflection]);

  // 演讲者键盘快捷键（输入框聚焦时忽略）
  useEffect(() => {
    if (!state.session || state.session.status === 'ended') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.session?.status === 'paused') {
          runtime.resumeSession();
        } else {
          runtime.pauseSession();
        }
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        runtime.setSilentMode(!state.session?.silentMode);
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        runtime.requestHelp(state.activeIntervention ? 'L3' : 'L2');
      } else if (e.key === 'Escape' && state.activeIntervention) {
        e.preventDefault();
        runtime.dismissHint('keyboard_escape');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.session, state.activeIntervention, runtime]);

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
      viewMode: 'focus',
      maxInterventionLevel: 'L3',
      silentMode: false,
      privacyNoticeAccepted: privacyAccepted,
      autoStartMic: launchMode === 'live',
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

  const buildCompanionUrl = (sid: string): string => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'companion');
    url.searchParams.set('sessionId', sid);
    return url.toString();
  };

  const handleOpenCompanionWindow = async (sid: string) => {
    const companionUrl = buildCompanionUrl(sid);
    type DocPipWindowApi = {
      requestWindow?: (opts?: { width?: number; height?: number }) => Promise<Window>;
    };
    const pipApi = (window as unknown as { documentPictureInPicture?: DocPipWindowApi })
      .documentPictureInPicture;

    if (pipApi?.requestWindow) {
      try {
        const pipWin = await pipApi.requestWindow({ width: 440, height: 680 });
        pipWin.document.title = 'CueX 提词小窗';
        pipWin.document.documentElement.style.height = '100%';
        pipWin.document.body.style.height = '100%';
        pipWin.document.body.style.margin = '0';
        pipWin.document.body.style.background = '#F8F7F3';
        const frame = pipWin.document.createElement('iframe');
        frame.src = companionUrl;
        frame.title = 'CueX 提词小窗';
        frame.style.display = 'block';
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.border = '0';
        pipWin.document.body.appendChild(frame);
        setCompanionLaunchNote(
          '已打开独立提词小窗。全屏播放幻灯片时，建议开启 PPT / Keynote「演讲者视图」或移至副屏。'
        );
        return;
      } catch {
        // 浏览器环境不支持 Document PiP 时无缝使用独立弹窗
      }
    }

    const popup = window.open(
      companionUrl,
      'cuex_companion_window',
      'noopener,width=460,height=720'
    );
    if (popup) {
      setCompanionLaunchNote(
        '已打开独立提词小窗。全屏播放幻灯片时，建议开启 PPT / Keynote「演讲者视图」或移至副屏。'
      );
    } else {
      setCompanionLaunchNote('浏览器拦截了新窗口弹出，可点击右侧链接手动打开提词小窗。');
    }
  };

  // Pre-session launch gate if no session active
  if (!state.session) {
    return (
      <main className="bg-ground text-ink min-h-[calc(100dvh-3.5rem)] py-10 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto border border-line bg-surface rounded-md p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5 border-b border-line pb-4">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              准备上台
            </h1>
            <p className="text-sm text-ink-2 leading-relaxed">
              选择已整理好的演讲提纲，即可开启台前彩排或正式上台陪伴。
            </p>
          </div>

          {state.wipedAt && (
            <div
              className="border border-resolved/30 bg-resolved-tint text-resolved px-4 py-3 rounded text-xs space-y-1"
              data-testid="session-wiped-notice"
            >
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>上一场演讲记录已清空。</span>
              </div>
              {state.deletionReceipt && (
                <div className="text-xs text-ink-2 pl-6 tabular-nums">
                  清理时间：{formatDateTime(state.deletionReceipt.completedAt)}
                </div>
              )}
            </div>
          )}

          {state.error && (
            <div className="border border-amber/40 bg-amber-tint text-amber-ink px-4 py-3 rounded text-xs">
              {state.error}
            </div>
          )}

          <div className="space-y-3 text-xs">
            <div className="font-semibold text-ink">当前讲稿</div>
            {activePack ? (
              <div className="bg-surface-muted rounded p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm text-ink">{activePack.title}</div>
                  <div className="text-ink-3 mt-1 tabular-nums">
                    共 {activePack.cueSheet.chapters.length} 章 ｜ 预计{' '}
                    {formatDuration(activePack.targetDurationSec)} ｜ 已启用{' '}
                    {activePack.facts.filter((f) => f.userConfirmed).length} 条关键数据
                  </div>
                </div>
                <Button type="button" variant="quiet" size="sm" onClick={onGoToCompiler}>
                  修改讲稿与数据
                </Button>
              </div>
            ) : (
              <div className="bg-surface-muted rounded p-4 space-y-3">
                <p className="text-ink-2">尚未选择讲稿，可切换已保存讲稿或加载内置示例体验。</p>
                <div className="flex flex-wrap gap-2">
                  {savedPacks.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => void handlePickPack(e.target.value)}
                      className="h-9 px-3 border border-line bg-surface rounded text-xs text-ink focus-visible:outline-none focus-visible:border-ink"
                    >
                      <option value="" disabled>
                        选择已保存的讲稿…
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
                    <span>加载示例讲稿</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <button
              type="button"
              onClick={() => setLaunchMode('live')}
              className={cn(
                'text-left p-4 rounded border transition-colors space-y-1',
                launchMode === 'live'
                  ? 'border-ink bg-surface-muted font-medium'
                  : 'border-line bg-surface hover:bg-surface-muted/60'
              )}
            >
              <div className="font-semibold text-ink">正式演讲</div>
              <p className="text-ink-3 leading-relaxed">自动开启麦克风进入清爽提词舞台，顺畅时安静倾听。</p>
            </button>
            <button
              type="button"
              onClick={() => setLaunchMode('rehearsal')}
              className={cn(
                'text-left p-4 rounded border transition-colors space-y-1',
                launchMode === 'rehearsal'
                  ? 'border-ink bg-surface-muted font-medium'
                  : 'border-line bg-surface hover:bg-surface-muted/60'
              )}
            >
              <div className="font-semibold text-ink">台前彩排</div>
              <p className="text-ink-3 leading-relaxed">自由练习节奏与问答，支持无麦文字模拟测试。</p>
            </button>
          </div>

          <label className="flex items-center gap-2.5 border border-line bg-surface-muted rounded px-3.5 py-2.5 min-h-[44px] text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => onPrivacyChange(e.target.checked)}
              className="w-4 h-4 accent-ink shrink-0"
              data-testid="stage-privacy-checkbox"
            />
            <span className="text-ink-2 leading-relaxed">
              允许在演讲期间使用麦克风识别语流（原始录音不落盘，讲完可随时一键清空）。
            </span>
          </label>

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="quiet" onClick={onGoToCompiler}>
              先去准备讲稿
            </Button>
            <Button
              type="button"
              disabled={!privacyAccepted || loadingPack}
              onClick={() => void handleStartFromStage()}
              data-testid="stage-start-btn"
              className="gap-1.5 min-h-[40px]"
            >
              <span>{launchMode === 'live' ? '开始正式演讲' : '开始彩排'}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </main>
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

  const glanceable = activeIntervention
    ? extractGlanceableCue(activeIntervention.cueText, activeIntervention.title)
    : null;

  const activeAsrMode =
    runtime.micMode === 'browser_webspeech'
      ? 'browser_webspeech'
      : state.asrStatus?.mode ?? 'text_simulation';

  const asrLifecycle = state.asrStatus?.lifecycleState ?? health?.asr.lifecycleState;
  const companionUrl = buildCompanionUrl(session.sessionId);
  const s1BannerDegraded = Boolean(
    state.latestS1Observation?.degraded ||
      health?.system1.fallbackActive ||
      health?.system1.degraded ||
      health?.system1.mode === 'local_fallback'
  );
  const s2BannerDegraded = Boolean(
    health?.system2.fallbackActive ||
      health?.system2.degraded ||
      health?.system2.mode === 'local_fallback'
  );

  return (
    <main
      className="bg-ground text-ink min-h-[calc(100dvh-3.5rem)] flex flex-col"
      data-testid="stage-workspace"
    >
      {viewMode === 'focus' && <CueEdgeLight phase={edgePhase} paused={isPaused} />}

      {/* Top Session Bar */}
      <div className="w-full border-b border-line bg-surface px-4 sm:px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1 className="text-xs sm:text-sm font-semibold text-ink truncate max-w-[240px]">
              {activePack?.title ?? '正在演讲'}
            </h1>
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
                    ? '已暂停'
                    : state.wsStatus === 'connected'
                      ? '实时协同中'
                      : '连接中'}
              </span>
            </Badge>

            {/* Primary 1-Click Microphone Button right in the top bar */}
            <button
              type="button"
              disabled={isPaused || isEnded}
              onClick={() => void runtime.toggleBestMic()}
              data-testid="privacy-recording-badge"
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 h-7 rounded border text-xs font-medium transition-colors disabled:opacity-50',
                runtime.micMode !== 'off'
                  ? 'bg-amber-tint border-amber/45 text-amber-ink'
                  : 'bg-ground border-line-strong text-ink-2 hover:text-ink hover:bg-ground-2'
              )}
            >
              {runtime.micMode !== 'off' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber shrink-0" />
                  <span>正在收音（点击停止）</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-amber shrink-0" />
                  <span>开启麦克风</span>
                </>
              )}
            </button>
          </div>

          {/* Stage Layout, Companion Window & Secondary Backstage Inspector Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === 'focus' && (
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() =>
                  setLayoutMode((prev) => (prev === 'standard' ? 'split_strip' : 'standard'))
                }
                data-testid="layout-mode-toggle"
                className={cn(
                  'h-8 px-3 text-xs whitespace-nowrap',
                  layoutMode === 'split_strip' &&
                    'bg-amber-tint border-amber/45 text-amber-ink hover:bg-amber-tint'
                )}
                title="切换窄栏分屏布局，方便与幻灯片并排摆放"
              >
                <Columns2 className="w-3.5 h-3.5 mr-1" />
                <span>{layoutMode === 'split_strip' ? '退出窄栏分屏' : '窄栏分屏'}</span>
              </Button>
            )}

            <Button
              type="button"
              variant="quiet"
              size="sm"
              disabled={isEnded}
              onClick={() => void handleOpenCompanionWindow(session.sessionId)}
              data-testid="open-companion-window-btn"
              className="h-8 px-3 text-xs whitespace-nowrap"
              title="打开独立提词小窗，方便移至副屏或配合演讲者视图观看"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1 text-violet-ink" />
              <span>独立提词小窗</span>
            </Button>

            {state.attachState && (state.attachState.companionCount ?? 0) > 0 && (
              <Badge variant="violet" data-testid="primary-companion-count">
                小窗在线 {state.attachState.companionCount}
              </Badge>
            )}

            {viewMode === 'focus' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleToggleViewMode('inspector')}
                data-testid="view-toggle-inspector"
                className="h-8 px-2.5 text-xs text-ink-3 hover:text-ink"
                title="查看双系统实时运行指标与检索详情"
              >
                <Cpu className="w-3.5 h-3.5 mr-1" />
                <span>引擎透视</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => handleToggleViewMode('focus')}
                data-testid="view-toggle-focus"
                className="h-8 px-3 text-xs"
              >
                <Eye className="w-3.5 h-3.5 mr-1" />
                <span>返回演讲画面</span>
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={runtime.wipeCurrentSession}
              data-testid="wipe-session-btn"
              title="清空本场记录并返回"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-ink" />
              <span>清空本场</span>
            </Button>

            {isEnded ? (
              <Button
                type="button"
                size="sm"
                onClick={() => onGoToReflection(session.sessionId)}
                data-testid="go-reflection-btn"
              >
                <span>查看复盘</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleEndAndReview}
                data-testid="end-session-btn"
              >
                <span>结束并复盘</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Actionable Notices Only (Zero Defensive Disclaimers) */}
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-2.5 space-y-2 empty:hidden">
        {state.error && (
          <div
            role="alert"
            className="border border-amber/40 bg-amber-tint text-amber-ink px-4 py-2 rounded text-xs"
            data-testid="stage-error"
          >
            {state.error}
          </div>
        )}

        {runtime.micError && (
          <div
            role="alert"
            className="border border-amber/40 bg-amber-tint text-amber-ink px-4 py-2 rounded text-xs"
          >
            {runtime.micError}
          </div>
        )}

        {companionLaunchNote && (
          <div
            className="border border-violet/30 bg-violet-tint/35 text-ink px-3.5 py-2 rounded text-xs flex flex-wrap items-center justify-between gap-2"
            data-testid="companion-launch-notice"
          >
            <span>{companionLaunchNote}</span>
            <div className="flex items-center gap-3 shrink-0">
              <a
                href={companionUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="companion-window-link"
                className="text-violet-ink underline underline-offset-4 font-medium"
              >
                在新标签页打开小窗
              </a>
              <button
                type="button"
                onClick={() => setCompanionLaunchNote(null)}
                className="text-ink-3 hover:text-ink"
                aria-label="关闭小窗提示"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================== FOCUS VIEW ==================== */}
      {viewMode === 'focus' && (
        <div
          className={cn(
            'flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-6',
            layoutMode === 'split_strip'
              ? 'py-4 sm:py-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start'
              : 'py-6 flex flex-col justify-between gap-6'
          )}
          data-layout={layoutMode}
          data-testid="focus-view"
        >
          <div
            className={cn(
              'space-y-4 min-w-0',
              layoutMode === 'split_strip' &&
                'lg:col-span-5 w-full max-w-[460px] mx-auto lg:mx-0'
            )}
          >
            {/* Chapter & Pace Header */}
            <div
              className={cn(
                'border border-line bg-surface rounded-md p-4 sm:p-5 flex justify-between gap-4',
                layoutMode === 'split_strip'
                  ? 'flex-col items-stretch'
                  : 'flex-col sm:flex-row sm:items-center'
              )}
            >
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-ink-3">当前章节</span>
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
                <div
                  className={cn(
                    'font-bold text-ink leading-snug break-words',
                    layoutMode === 'split_strip' ? 'text-xl' : 'text-xl sm:text-2xl'
                  )}
                >
                  {cog?.activeChapterTitle ??
                    pres?.chapterNodes[pres.activeChapterIndex]?.title ??
                    '开场与核心观点'}
                </div>

                {pres && pres.chapterNodes.length > 0 && (
                  <div
                    className={cn(
                      'gap-1.5 pt-1',
                      layoutMode === 'split_strip'
                        ? 'flex flex-wrap'
                        : 'flex sm:flex-wrap overflow-x-auto sm:overflow-visible pb-1 sm:pb-0'
                    )}
                  >
                    {pres.chapterNodes.map((ch, idx) => (
                      <button
                        key={ch.chapterId}
                        type="button"
                        onClick={() => runtime.setChapter(ch.chapterId)}
                        data-testid={`focus-chapter-${ch.chapterId}`}
                        className={cn(
                          'px-2.5 py-1.5 rounded text-xs border transition-colors',
                          layoutMode !== 'split_strip' &&
                            'shrink-0 sm:shrink whitespace-nowrap sm:whitespace-normal',
                          ch.chapterId === pres.activeChapterId
                            ? 'bg-ink text-ground border-ink font-medium'
                            : ch.status === 'completed'
                              ? 'bg-resolved-tint/60 text-resolved border-resolved/30'
                              : 'bg-surface-muted/70 text-ink-2 border-line hover:bg-surface-muted'
                        )}
                      >
                        {idx + 1}. {ch.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'shrink-0',
                  layoutMode === 'split_strip'
                    ? 'text-left pt-2 border-t border-line'
                    : 'text-left sm:text-right'
                )}
              >
                <div
                  className={cn(
                    'font-mono font-semibold tabular-nums text-ink tracking-tight',
                    layoutMode === 'split_strip' ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
                  )}
                  data-testid="focus-timer"
                >
                  {formatDuration(pres?.elapsedSec ?? 0)}
                  <span className="text-lg text-ink-3 font-normal">
                    {' '}
                    / {formatDuration(pres?.targetDurationSec ?? activePack?.targetDurationSec ?? 300)}
                  </span>
                </div>
                {runtime.micMode === 'pcm_mic' && (
                  <div className="flex items-center sm:justify-end gap-2 mt-1.5 text-xs text-ink-3">
                    <span>音量</span>
                    <meter min={0} max={1} value={runtime.micVolume} className="w-24 h-2" />
                  </div>
                )}
              </div>
            </div>

            {/* Single-Point Rehearsal Prompt Strip */}
            {state.rehearsalContext && (
              <div
                className="border border-violet/35 bg-violet-tint/50 rounded-md p-4 text-xs space-y-2"
                data-testid="rehearsal-banner"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-violet-ink">
                    正在单点重练：{state.rehearsalContext.weakSegment.chapterTitle}
                  </span>
                  <Badge variant="violet">片段重练</Badge>
                </div>
                <p className="text-ink leading-relaxed">{state.rehearsalContext.promptText}</p>
                {state.rehearsalContext.supportingEvidence.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {state.rehearsalContext.supportingEvidence.map((ev) => (
                      <span
                        key={ev.id}
                        className="px-2.5 py-1 rounded bg-surface border border-violet/25 text-ink-2 text-xs"
                      >
                        参考数据：{ev.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Central Peripheral-Vision Cue Stage */}
            <div
              className={cn(
                'flex flex-col items-center justify-center border border-line bg-surface rounded-md relative',
                layoutMode === 'split_strip'
                  ? 'min-h-[220px] p-4 sm:p-5'
                  : 'flex-1 min-h-[280px] p-6 sm:p-10'
              )}
              aria-live="polite"
              aria-atomic="true"
              data-testid="focus-cue-stage"
            >
              {isSilent ? (
                <div className="text-center space-y-2.5" data-testid="focus-silent-state">
                  <VolumeX className="w-8 h-8 text-ink-3 mx-auto" />
                  <div className="text-xl font-semibold text-ink">免打扰模式已开启</div>
                  <p className="text-xs text-ink-2 max-w-md leading-relaxed">
                    正在后台安静记录你的演讲进度，期间不会弹出任何提词卡片。
                  </p>
                </div>
              ) : activeIntervention ? (
                <div
                  className="w-full max-w-2xl text-center space-y-4"
                  data-testid="focus-active-intervention"
                  data-level={activeIntervention.level}
                  data-grounded={activeIntervention.grounded}
                >
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Badge variant={activeIntervention.level === 'L3' ? 'violet' : 'amber'}>
                      {INTERVENTION_LEVEL_LABELS[activeIntervention.level]}
                    </Badge>
                    {activeIntervention.grounded ? (
                      <Badge variant="resolved">
                        <ShieldCheck className="w-3 h-3" />
                        来自讲稿关键数据
                      </Badge>
                    ) : (
                      <Badge variant="amber">
                        <ShieldAlert className="w-3 h-3" />
                        讲稿未包含此项
                      </Badge>
                    )}
                  </div>

                  {/* L1: Minimal nudge */}
                  {activeIntervention.level === 'L1' && (
                    <div className="space-y-2">
                      <div className="text-2xl sm:text-3xl font-semibold text-amber-ink tracking-tight">
                        {glanceable?.headline ?? activeIntervention.title}
                      </div>
                      {glanceable?.subline && (
                        <p className="text-sm text-ink-2">{glanceable.subline}</p>
                      )}
                    </div>
                  )}

                  {/* L2: Crisp, glanceable keyword pill */}
                  {activeIntervention.level === 'L2' && (
                    <div className="space-y-2.5">
                      <div className="inline-block max-w-full break-words px-5 sm:px-7 py-3.5 rounded-md bg-amber-tint border border-amber/40 text-2xl sm:text-4xl font-bold tracking-tight text-ink">
                        {glanceable?.headline ?? activeIntervention.cueText}
                      </div>
                      {glanceable?.subline && (
                        <p className="text-sm text-ink-2 max-w-lg mx-auto">
                          {glanceable.subline}
                        </p>
                      )}
                    </div>
                  )}

                  {/* L3: Structured 2-3 bullet card */}
                  {activeIntervention.level === 'L3' && (
                    <div className="space-y-3 text-left bg-violet-tint/35 border border-violet/30 rounded-md p-5">
                      <div className="text-sm font-semibold text-violet-ink">
                        {activeIntervention.title}
                      </div>
                      <p className="text-lg sm:text-2xl font-bold text-ink leading-snug">
                        {glanceable?.headline ?? activeIntervention.cueText}
                      </p>
                      {activeIntervention.bullets && activeIntervention.bullets.length > 0 && (
                        <ul className="space-y-1.5 pt-1 text-sm sm:text-base text-ink-2 list-disc pl-5">
                          {activeIntervention.bullets.slice(0, 3).map((b, idx) => (
                            <li key={idx}>{b}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {activeIntervention.missingEvidenceNotice && (
                    <div
                      className="border border-amber/40 bg-amber-tint rounded p-3 text-xs text-amber-ink text-left flex items-start gap-2 max-w-xl mx-auto"
                      data-testid="missing-evidence-warning"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>讲稿材料未包含这项数据记录，建议坦诚说明会后核实补充。</span>
                    </div>
                  )}

                  {/* Compact Feedback & Dismiss */}
                  <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant={activeIntervention.userFeedback === 'helpful' ? 'resolved' : 'quiet'}
                      size="sm"
                      onClick={() => runtime.sendFeedback(activeIntervention.interventionId, 'helpful')}
                      data-testid="feedback-helpful-btn"
                      className="min-h-9"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>有帮助</span>
                    </Button>
                    <Button
                      type="button"
                      variant={activeIntervention.userFeedback === 'distracting' ? 'amber' : 'quiet'}
                      size="sm"
                      onClick={() =>
                        runtime.sendFeedback(activeIntervention.interventionId, 'distracting')
                      }
                      data-testid="feedback-distracting-btn"
                      className="min-h-9"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>嫌打扰</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => runtime.dismissHint('user_dismissed_in_focus')}
                      data-testid="dismiss-hint-btn"
                      className="min-h-9"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>收起</span>
                    </Button>
                  </div>
                </div>
              ) : lastWithdrawn ? (
                <div
                  className="text-center space-y-1 max-w-md border border-resolved/35 bg-resolved-tint/60 rounded-md px-5 py-3.5"
                  data-testid="focus-withdrawn-banner"
                >
                  <p className="text-sm text-resolved font-medium">
                    {WITHDRAWAL_REASON_LABELS[lastWithdrawn.reason] ?? '已接回主线，提示自动收起'}
                  </p>
                </div>
              ) : (
                <div className="text-center space-y-3" data-testid="focus-l0-quiet">
                  <div className="w-2.5 h-2.5 rounded-full bg-resolved mx-auto" />
                  <div className="text-lg sm:text-xl font-medium text-ink">
                    正在安静倾听，保持自然节奏即可
                  </div>
                  <p className="text-xs text-ink-3 max-w-md leading-relaxed">
                    遇到卡顿、漏讲要点或现场追问时，这里会自动浮现简短提示，接上话后自动收起。
                  </p>
                  {pres && pres.missedKeyPoints.length > 0 && (
                    <div className="flex flex-wrap justify-center items-center gap-1.5 pt-2">
                      <span className="text-xs text-ink-3">本章要点：</span>
                      {pres.missedKeyPoints.slice(0, 4).map((m) => (
                        <span
                          key={m.pointId}
                          className="text-xs px-2.5 py-0.5 rounded bg-surface-muted text-ink-2"
                        >
                          {m.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Clean Speaker Controls Bar */}
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
                  <span>{isPaused ? '继续' : '暂停'}</span>
                </Button>

                <Button
                  type="button"
                  variant={isSilent ? 'default' : 'quiet'}
                  size="sm"
                  onClick={() => runtime.setSilentMode(!isSilent)}
                  data-testid="toggle-silent-btn"
                >
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>{isSilent ? '退出免打扰' : '免打扰'}</span>
                </Button>

                <Button
                  type="button"
                  variant="quiet"
                  size="sm"
                  onClick={() => runtime.requestHelp('L2')}
                  data-testid="request-help-l2-btn"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-amber" />
                  <span>提示关键词</span>
                </Button>

                <Button
                  type="button"
                  variant="quiet"
                  size="sm"
                  onClick={() => runtime.requestHelp('L3')}
                  data-testid="request-help-l3-btn"
                >
                  <Layers className="w-3.5 h-3.5 text-violet" />
                  <span>展开要点</span>
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-ink-2">
                  <span>提示详略：</span>
                  <select
                    value={session.maxInterventionLevel}
                    onChange={(e) => runtime.setCeilingLevel(e.target.value as InterventionLevel)}
                    data-testid="ceiling-select"
                    className="h-8 border border-line bg-ground rounded px-2 text-ink focus-visible:outline-none focus-visible:border-ink"
                  >
                    <option value="L3">可展开要点</option>
                    <option value="L2">仅关键词</option>
                    <option value="L1">仅边缘微光</option>
                    <option value="L0">全程免打扰</option>
                  </select>
                </label>

                <Button
                  type="button"
                  variant={showInputDrawer ? 'default' : 'ghost'}
                  size="sm"
                  data-testid="toggle-sim-drawer-btn"
                  onClick={() => setShowInputDrawer((v) => !v)}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{showInputDrawer ? '收起彩排模拟' : '无麦模拟输入'}</span>
                </Button>
              </div>

              <div
                className="w-full pt-2 border-t border-line flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3"
                data-testid="keyboard-shortcuts-hint"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Keyboard className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    快捷键：<code>Space</code> 暂停/继续 ｜ <code>M</code> 免打扰 ｜ <code>H</code>{' '}
                    提示 ｜ <code>Esc</code> 收起
                  </span>
                </span>
                <span className="whitespace-nowrap">
                  {layoutMode === 'split_strip' ? '窄栏分屏布局' : '标准舞台布局'}
                </span>
              </div>
            </div>
          </div>

          {/* Collapsible Rehearsal Simulator & Audio Channel Drawer (Hidden by default) */}
          {showInputDrawer && (
            <div
              className={cn(
                'border border-line bg-surface rounded-md p-4 space-y-4 text-xs',
                layoutMode === 'split_strip' && 'lg:col-span-7'
              )}
              data-testid="stage-input-panel"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <span className="font-semibold text-ink">无麦彩排与现场追问模拟</span>
                  <p className="text-ink-3 mt-0.5">
                    在不方便开麦的环境下，可直接输入发言或模拟观众提问来体验提词与收起节奏。
                  </p>
                </div>
                <label className="flex items-center gap-1.5 text-ink-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={progressiveSim}
                    onChange={(e) => setProgressiveSim(e.target.checked)}
                    className="accent-ink"
                  />
                  <span>模拟逐句流式说话</span>
                </label>
              </div>

              <form onSubmit={handleSimSubmit} className="flex flex-col sm:flex-row gap-2">
                <select
                  value={simSpeaker}
                  onChange={(e) => setSimSpeaker(e.target.value as TranscriptSpeaker)}
                  aria-label="选择发言角色"
                  data-testid="sim-speaker-select"
                  className="border border-line bg-ground rounded px-2.5 py-2 text-ink sm:w-36 focus-visible:outline-none focus-visible:border-ink"
                >
                  <option value="presenter">主讲人发言</option>
                  <option value="audience">观众/评委提问</option>
                </select>
                <input
                  type="text"
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  aria-label="输入模拟发言或观众提问"
                  placeholder="输入一句话或评委追问，按回车发送…"
                  disabled={isEnded}
                  data-testid="sim-speech-input"
                  className="flex-1 border border-line bg-ground rounded px-3 py-2 text-ink focus-visible:outline-none focus-visible:border-ink"
                />
                <Button
                  type="submit"
                  disabled={isEnded || !simText.trim()}
                  data-testid="sim-speech-submit"
                  className="gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>发送</span>
                </Button>
              </form>

              {/* Quick Rehearsal Snippets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ink-3 mr-1">快捷试演：</span>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickSnippet(
                      '各位评委好，今天汇报 CueX 通用实时认知外挂。它的核心理念是在深度思考之外接住当下，核心系统围绕实时理解与最小必要干预构建。',
                      'presenter'
                    )
                  }
                  className="px-2.5 py-1.5 rounded border border-line bg-ground hover:bg-surface-muted text-xs text-ink-2"
                >
                  顺畅开讲
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickSnippet(
                      '顺便聊一个我昨天在咖啡厅想到的界面配色细节和个人生活随想，先不管核心架构和指标。',
                      'presenter'
                    )
                  }
                  className="px-2.5 py-1.5 rounded border border-line bg-ground hover:bg-surface-muted text-xs text-amber-ink"
                >
                  模拟跑题卡壳
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickSnippet(
                      '回到核心架构：CueX 通过 System 1 与 System 2 并行，再由独立 InterventionController 控制介入并用 V = H - λI 度量净有效介入。',
                      'presenter'
                    )
                  }
                  className="px-2.5 py-1.5 rounded border border-line bg-ground hover:bg-surface-muted text-xs text-resolved"
                >
                  自然接回主线
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickSnippet(
                      '请问你们是如何量化衡量一次干预到底有没有打扰用户的？公式和默认参数是什么？',
                      'audience'
                    )
                  }
                  className="px-2.5 py-1.5 rounded border border-line bg-ground hover:bg-surface-muted text-xs text-violet-ink"
                >
                  评委提问（讲稿内）
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickSnippet(
                      '请问你们明年第三季度的海外定价策略、已完成签署的百万级企业付费合同金额是多少？',
                      'audience'
                    )
                  }
                  className="px-2.5 py-1.5 rounded border border-line bg-ground hover:bg-surface-muted text-xs text-amber-ink"
                >
                  评委追问（超纲问题）
                </button>
              </div>

              {/* Optional manual audio channel switcher */}
              <details className="group pt-2 border-t border-line">
                <summary className="cursor-pointer list-none flex items-center justify-between text-xs text-ink-3 hover:text-ink select-none">
                  <span>高级语音通道切换（当前：{ASR_MODE_LABELS[activeAsrMode]}）</span>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="pt-2.5 flex flex-wrap items-center gap-2">
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
                      {runtime.micMode === 'pcm_mic' ? '停止流式收音' : '使用流式麦克风'}
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
                    data-testid="toggle-webspeech-btn"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>
                      {runtime.webSpeechSupported
                        ? runtime.micMode === 'browser_webspeech'
                          ? '停止浏览器语音'
                          : '使用浏览器语音识别'
                        : '当前浏览器不支持语音识别'}
                    </span>
                  </Button>
                </div>
              </details>
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
          {/* Top Real Telemetry Strip (Achromatic Ledger) */}
          <div className="border border-line bg-surface rounded-md grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-line text-xs">
            <div className="p-3.5 space-y-1">
              <span className="text-xs text-ink-3 block">contextVersion</span>
              <span
                className="font-mono text-xl font-bold text-ink tabular-nums block"
                data-testid="inspector-ctx-ver"
              >
                v{cog?.contextVersion ?? 0}
              </span>
            </div>
            <div className="p-3.5 space-y-1">
              <span className="text-xs text-ink-3 block">System 1 / P95 延迟</span>
              <span className="font-mono text-xl font-bold text-amber-ink tabular-nums block">
                {state.telemetry?.lastSystem1LatencyMs ?? latestVerdict?.latencyMs ?? 0} ms
              </span>
              {state.telemetry?.latencyStats && (
                <span className="text-xs font-mono text-ink-3 block tabular-nums">
                  avg {state.telemetry.latencyStats.avgMs}ms · p95 {state.telemetry.latencyStats.p95Ms}ms
                </span>
              )}
            </div>
            <div className="p-3.5 space-y-1">
              <span className="text-xs text-ink-3 block">模型调用 / 本地规则</span>
              <span className="font-mono text-xl font-bold text-ink tabular-nums block">
                {state.telemetry?.modelCalls ?? 0} / {state.telemetry?.localRuleEvaluations ?? 0}
              </span>
              {state.telemetry && state.telemetry.retries > 0 && (
                <span className="text-xs font-mono text-amber-ink block tabular-nums">
                  retries: {state.telemetry.retries}
                </span>
              )}
            </div>
            <div className="p-3.5 space-y-1">
              <span className="text-xs text-ink-3 block">真实 Token / 费用</span>
              <span
                className="font-mono text-xl font-bold text-violet-ink tabular-nums block"
                data-testid="inspector-tokens"
              >
                {state.telemetry?.totalTokens ?? 0}
              </span>
              <span className="text-xs font-mono text-ink-3 block tabular-nums" data-testid="inspector-cost">
                {formatMoneyFen(state.telemetry?.cost ?? state.telemetry?.costFen)}
              </span>
            </div>
            <div className="p-3.5 space-y-1">
              <span className="text-xs text-ink-3 block">Cached / Reasoning</span>
              <span className="font-mono text-xl font-bold text-ink tabular-nums block">
                {state.telemetry?.cachedInputTokens ?? 0}
              </span>
              <span className="text-xs font-mono text-ink-3 block tabular-nums">
                reasoning: {state.telemetry?.reasoningTokens ?? 0}
              </span>
            </div>
            <div className="p-3.5 space-y-1">
              <span className="text-xs text-ink-3 block">计量口径 (usageSource)</span>
              <span
                className="text-xs font-semibold text-ink block mt-1 leading-snug"
                data-testid="inspector-usage-source"
              >
                {state.telemetry?.usageSource
                  ? USAGE_SOURCE_LABELS[state.telemetry.usageSource]
                  : state.telemetry?.usingLocalFallback
                    ? '本地规则零 Token 回退'
                    : '待统计'}
              </span>
              {state.telemetry?.usageSource === 'provider_unreported' && (
                <span className="text-xs text-amber-ink block">
                  外部模型已调用但上游未回传用量
                </span>
              )}
            </div>
          </div>

          {/* Runtime Subsystems Ledger Bar (ASR + System 1 JEV + System 2 CPA 清晰三路归因) */}
          <div
            className="border border-line bg-surface rounded-md grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-line text-xs"
            data-testid="inspector-subsystems"
          >
            {/* 1. ASR 实时语音识别 */}
            <div className="p-3.5 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">ASR 实时语音识别</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">
                    {state.asrStatus ? ASR_MODE_LABELS[state.asrStatus.mode] : '未知'}
                  </Badge>
                  {asrLifecycle && (
                    <Badge variant={getColabLifecycleBadgeVariant(asrLifecycle)}>
                      {COLAB_ASR_LIFECYCLE_LABELS[asrLifecycle]}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="font-mono text-xs text-ink-2 tabular-nums break-words">
                {(state.asrStatus?.gpuName ?? health?.asr.gpuName)
                  ? `${state.asrStatus?.gpuName ?? health?.asr.gpuName} · `
                  : ''}
                {state.asrStatus?.modelId ?? health?.asr.modelId ?? state.asrStatus?.backend ?? '—'}
                {(state.asrStatus?.rtf ?? health?.asr.rtf) !== undefined
                  ? ` · RTF ${(state.asrStatus?.rtf ?? health?.asr.rtf)!.toFixed(3)}`
                  : ''}
              </div>
              {(state.asrStatus?.lastHealthCheckAt ||
                health?.asr.lastHealthCheckAt ||
                state.asrStatus?.fallbackActive ||
                health?.asr.fallbackActive) && (
                <div className="text-xs text-ink-3">
                  {(state.asrStatus?.lastHealthCheckAt ?? health?.asr.lastHealthCheckAt) && (
                    <span>
                      心跳{' '}
                      {formatTime((state.asrStatus?.lastHealthCheckAt ?? health?.asr.lastHealthCheckAt)!)}
                    </span>
                  )}
                  {(state.asrStatus?.fallbackActive || health?.asr.fallbackActive) && (
                    <span className="text-amber-ink ml-2">
                      回退原因：
                      {state.asrStatus?.fallbackReason ??
                        health?.asr.fallbackReason ??
                        '备用链路接管'}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 2. System 1 快思考实时感知（Colab Jev-Like） */}
            <div className="p-3.5 space-y-1.5" data-testid="inspector-subsystem-s1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">System 1 · 快思考实时感知</span>
                <Badge
                  variant={
                    s1BannerDegraded
                      ? 'amber'
                      : health?.system1.mode === 'real'
                        ? 'resolved'
                        : 'secondary'
                  }
                >
                  {s1BannerDegraded
                    ? '已降级本地规则'
                    : health?.system1.mode === 'real'
                      ? '实时模型在线'
                      : health?.system1.mode ?? 'unknown'}
                </Badge>
              </div>
              <div className="font-mono text-xs text-ink-2 break-words tabular-nums">
                {health?.system1.provider ? `${health.system1.provider} · ` : ''}
                {state.latestS1Observation?.model ??
                  health?.system1.model ??
                  health?.system1.backend ??
                  '—'}
                {(state.latestS1Observation?.promptFormat ?? health?.system1.promptFormat)
                  ? ` · ${state.latestS1Observation?.promptFormat ?? health?.system1.promptFormat}`
                  : ''}
                {(state.latestS1Observation?.calibrated ?? health?.system1.calibrated) !== undefined &&
                  ` · ${(state.latestS1Observation?.calibrated ?? health?.system1.calibrated) ? '已校准' : '未校准'}`}
              </div>
              {health?.system1.fallbackReason && (
                <p className="text-xs text-amber-ink break-words">
                  降级原因：{health.system1.fallbackReason}
                </p>
              )}
              {state.telemetry?.byTier?.system1 && (
                <div className="text-xs font-mono text-ink-3 tabular-nums">
                  本场 S1：{state.telemetry.byTier.system1.calls} 次 · avg{' '}
                  {state.telemetry.byTier.system1.latencyMsAvg}ms ·{' '}
                  {state.telemetry.byTier.system1.usageSource}
                </div>
              )}
              {health?.system1.detail && (
                <p className="text-xs text-ink-3 break-words">{health.system1.detail}</p>
              )}
            </div>

            {/* 3. System 2 慢思考深度规划（CPA） */}
            <div className="p-3.5 space-y-1.5" data-testid="inspector-subsystem-s2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">System 2 · 慢思考深度规划</span>
                <Badge
                  variant={
                    s2BannerDegraded
                      ? 'amber'
                      : health?.system2.mode === 'real'
                        ? 'violet'
                        : 'secondary'
                  }
                >
                  {s2BannerDegraded
                    ? '已降级本地规则'
                    : health?.system2.mode === 'real'
                      ? '实时模型在线'
                      : health?.system2.mode ?? 'unknown'}
                </Badge>
              </div>
              <div className="font-mono text-xs text-ink-2 break-words tabular-nums">
                {health?.system2.provider ? `${health.system2.provider} · ` : ''}
                {state.system2Guidance?.model ??
                  health?.system2.model ??
                  health?.system2.backend ??
                  '—'}
                {(state.system2Guidance?.reasoningEffort ?? health?.system2.reasoningEffort)
                  ? ` · effort=${state.system2Guidance?.reasoningEffort ?? health?.system2.reasoningEffort}`
                  : ''}
              </div>
              {(health?.system2.compilerModel ||
                health?.system2.reflectionModel ||
                health?.compiler?.model ||
                health?.reflection?.model) && (
                <div className="text-xs font-mono text-ink-3 break-words">
                  Compiler:{health?.compiler?.model ?? health?.system2.compilerModel ?? '—'} ·
                  Reflection:{health?.reflection?.model ?? health?.system2.reflectionModel ?? '—'}
                </div>
              )}
              {health?.system2.fallbackReason && (
                <p className="text-xs text-amber-ink break-words">
                  降级原因：{health.system2.fallbackReason}
                </p>
              )}
              {state.telemetry?.byTier?.system2 && (
                <div className="text-xs font-mono text-ink-3 tabular-nums">
                  本场 S2：{state.telemetry.byTier.system2.calls} 次 ·{' '}
                  {state.telemetry.byTier.system2.inputTokens +
                    state.telemetry.byTier.system2.outputTokens}{' '}
                  tok（reasoning {state.telemetry.byTier.system2.reasoningTokens ?? 0}）
                </div>
              )}
              {health?.system2.detail && (
                <p className="text-xs text-ink-3 break-words">{health.system2.detail}</p>
              )}
            </div>
          </div>

          {/* 双向异步双系统协同黑板面板：S1 单轮观测 + S2 System2Guidance + 协同调度计数 */}
          <div
            className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start"
            data-testid="inspector-dual-system-board"
          >
            {/* S1 Single-Turn Observation Snapshot */}
            <section
              className="border border-line bg-surface rounded-md p-4 space-y-2.5 text-xs"
              data-testid="inspector-s1-observation"
            >
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="font-bold text-ink">System 1 · 单轮观测快照</span>
                {state.latestS1Observation ? (
                  <Badge variant={state.latestS1Observation.degraded ? 'amber' : 'resolved'}>
                    turn #{state.latestS1Observation.turnSeq}
                  </Badge>
                ) : (
                  <Badge variant="outline">待评估</Badge>
                )}
              </div>
              {!state.latestS1Observation ? (
                <p className="text-ink-3 py-1">等待本轮 System 1 实时评估快照...</p>
              ) : (
                <div className="space-y-1.5 font-mono tabular-nums">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink font-semibold">
                      {state.latestS1Observation.decisionType} · slot #
                      {state.latestS1Observation.selectedSlot}（{state.latestS1Observation.label}）
                    </span>
                    <span className="text-amber-ink">
                      {state.latestS1Observation.latencyMs}ms
                    </span>
                  </div>
                  <div className="text-ink-2">
                    置信度 {(state.latestS1Observation.calibratedConfidence * 100).toFixed(1)}% ·
                    margin {state.latestS1Observation.margin.toFixed(3)} · entropy{' '}
                    {state.latestS1Observation.entropy.toFixed(3)}
                  </div>
                  <div className="text-ink-3">
                    来源：{S1_PROVIDER_KIND_LABELS[state.latestS1Observation.providerKind]}
                    {state.latestS1Observation.guidanceAppliedRevision !== undefined
                      ? ` · 已读取 Guidance r${state.latestS1Observation.guidanceAppliedRevision}`
                      : ''}
                  </div>
                  <div className="text-ink-3">
                    异步升级 S2：{state.latestS1Observation.escalatedToS2 ? '是' : '否'}
                    {state.latestS1Observation.escalationReason
                      ? `（${state.latestS1Observation.escalationReason}）`
                      : ''}
                  </div>
                </div>
              )}
            </section>

            {/* S2 -> S1 Blackboard Guidance */}
            <section
              className="border border-line bg-surface rounded-md p-4 space-y-2.5 text-xs"
              data-testid="inspector-s2-guidance"
            >
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="font-bold text-ink">System 2 · 异步指导指令</span>
                {state.system2Guidance ? (
                  (() => {
                    const g = state.system2Guidance;
                    const expiredByTime = Number.isFinite(g.expiresAtMs) && Date.now() > g.expiresAtMs;
                    const expiredByTurn =
                      state.latestS1Observation !== null &&
                      g.staleAfterTurnSeq !== undefined &&
                      state.latestS1Observation.turnSeq > g.staleAfterTurnSeq;
                    const consumedByS1 =
                      state.latestS1Observation?.guidanceAppliedRevision === g.revision;
                    return (
                      <Badge
                        variant={
                          expiredByTime || expiredByTurn
                            ? 'secondary'
                            : consumedByS1
                              ? 'resolved'
                              : 'violet'
                        }
                      >
                        r{g.revision} ·{' '}
                        {expiredByTime
                          ? '已超时失效'
                          : expiredByTurn
                            ? '轮次已推进过期'
                            : consumedByS1
                              ? '已被 S1 消费'
                              : '黑板生效中'}
                      </Badge>
                    );
                  })()
                ) : (
                  <Badge variant="outline">暂无指导</Badge>
                )}
              </div>
              {!state.system2Guidance ? (
                <p className="text-ink-3 py-1">System 2 尚未向共享黑板下发异步指导。</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="font-semibold text-ink leading-snug">
                    {state.system2Guidance.focusDirective}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {state.system2Guidance.recommendedBias && (
                      <Badge variant="violet">
                        {SYSTEM2_GUIDANCE_BIAS_LABELS[state.system2Guidance.recommendedBias]}
                      </Badge>
                    )}
                    {state.system2Guidance.preferredLevel && (
                      <Badge variant="outline" className="font-mono">
                        建议 {state.system2Guidance.preferredLevel}
                      </Badge>
                    )}
                    <Badge variant={state.system2Guidance.grounded ? 'resolved' : 'amber'}>
                      {state.system2Guidance.grounded
                        ? `证据 ${state.system2Guidance.evidenceAnchors.length} 条`
                        : '无证据约束'}
                    </Badge>
                  </div>
                  {state.system2Guidance.strategyHints.length > 0 && (
                    <p className="text-ink-2 leading-relaxed">
                      策略：{state.system2Guidance.strategyHints.join('；')}
                    </p>
                  )}
                  <div className="font-mono text-ink-3 tabular-nums break-words">
                    依据轮次 turn #{state.system2Guidance.basedOnTurnSeq}
                    {state.system2Guidance.staleAfterTurnSeq !== undefined
                      ? ` · 失效阈值 #${state.system2Guidance.staleAfterTurnSeq}`
                      : ''}
                    {state.system2Guidance.targetChapterTitle
                      ? ` · 目标章节：${state.system2Guidance.targetChapterTitle}`
                      : ''}
                  </div>
                </div>
              )}
            </section>

            {/* Dual-System Async Collaboration & Multi-Subscriber Metrics */}
            <section
              className="border border-line bg-surface rounded-md p-4 space-y-2.5 text-xs"
              data-testid="inspector-dual-metrics"
            >
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="font-bold text-ink">双系统异步协同与订阅态</span>
                {state.attachState && (
                  <Badge variant="outline" className="font-mono">
                    {state.attachState.role} · 伴随 {state.attachState.companionCount ?? 0}
                  </Badge>
                )}
              </div>
              {!state.dualSystemMetrics ? (
                <p className="text-ink-3 py-1">等待双系统协同计数同步...</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono tabular-nums">
                  <div className="text-ink-2">
                    S1 评估 / 升级：{state.dualSystemMetrics.s1Evaluations} /{' '}
                    {state.dualSystemMetrics.s1Escalations}
                  </div>
                  <div className="text-ink-2">
                    S2 调度 / 完成：{state.dualSystemMetrics.s2AsyncDispatches} /{' '}
                    {state.dualSystemMetrics.s2Completed}
                  </div>
                  <div className="text-amber-ink">
                    过期取消 / 合并：{state.dualSystemMetrics.s2CancelledAsStale} /{' '}
                    {state.dualSystemMetrics.s2Coalesced}
                  </div>
                  <div className="text-resolved">
                    指导签发 / 消费：{state.dualSystemMetrics.guidanceRevisionsIssued} /{' '}
                    {state.dualSystemMetrics.guidanceAppliedCount}
                  </div>
                  <div className="text-ink-3">
                    S1 P50/P95：{state.dualSystemMetrics.s1P50LatencyMs ?? '—'} /{' '}
                    {state.dualSystemMetrics.s1P95LatencyMs ?? '—'} ms
                  </div>
                  <div className="text-ink-3">
                    S2 P50/P95：{state.dualSystemMetrics.s2P50LatencyMs ?? '—'} /{' '}
                    {state.dualSystemMetrics.s2P95LatencyMs ?? '—'} ms
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* 分系统真实调用与 Token 计量明细（ASR / S1 / S2 / Compiler / Reflection） */}
          {state.telemetry?.byTier && Object.keys(state.telemetry.byTier).length > 0 && (
            <section
              className="border border-line bg-surface rounded-md p-4 space-y-2.5 text-xs"
              data-testid="inspector-tier-telemetry"
            >
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="font-bold text-ink">分系统模型调用与 Token 明细（byTier）</span>
                <span className="font-mono text-ink-3 tabular-nums">
                  {Object.keys(state.telemetry.byTier).length} 个子系统
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-line text-ink-3">
                      <th className="py-1.5 pr-3">Tier</th>
                      <th className="py-1.5 pr-3">Provider / Model</th>
                      <th className="py-1.5 pr-3">Calls (Retry)</th>
                      <th className="py-1.5 pr-3">Tokens (In/Out/Reas)</th>
                      <th className="py-1.5 pr-3">Avg ms</th>
                      <th className="py-1.5">Usage Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {Object.values(state.telemetry.byTier).map(
                      (item) =>
                        item && (
                          <tr key={item.tier}>
                            <td className="py-1.5 pr-3 font-semibold text-ink">{item.tier}</td>
                            <td className="py-1.5 pr-3 text-ink-2">
                              {item.provider}
                              {item.model ? ` · ${item.model}` : ''}
                              {item.degraded ? ' [降级]' : ''}
                            </td>
                            <td className="py-1.5 pr-3 text-ink">
                              {item.calls} ({item.retries})
                            </td>
                            <td className="py-1.5 pr-3 text-ink-2">
                              {item.inputTokens} / {item.outputTokens} / {item.reasoningTokens ?? 0}
                            </td>
                            <td className="py-1.5 pr-3 text-ink">{item.latencyMsAvg}</td>
                            <td className="py-1.5 text-ink-3">{item.usageSource}</td>
                          </tr>
                        )
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left: Live Transcript + SharedCognitiveState */}
            <div className="lg:col-span-4 space-y-5">
              <section
                className="border border-line bg-surface rounded-md p-4 space-y-3 text-xs"
                data-testid="inspector-transcript"
              >
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="font-bold text-ink">ASR 能力与转写流</span>
                  <Badge variant="outline">
                    {state.asrStatus ? ASR_MODE_LABELS[state.asrStatus.mode] : '未知'}
                  </Badge>
                </div>
                {state.asrStatus && (
                  <p className="text-xs text-ink-3 leading-relaxed">
                    backend: <span className="font-mono text-ink-2">{state.asrStatus.backend}</span> · available:{' '}
                    <span className="font-mono text-ink-2">{String(state.asrStatus.available)}</span> · {state.asrStatus.detail}
                  </p>
                )}
                <div className="max-h-64 overflow-y-auto divide-y divide-line pr-1">
                  {state.transcripts.length === 0 ? (
                    <p className="text-ink-3 py-2">等待语音或文本仿真输入...</p>
                  ) : (
                    (() => {
                      const epochTimes = state.transcripts
                        .map((s) => s.startMs)
                        .filter((t) => Number.isFinite(t) && t >= 1_000_000_000_000);
                      const baseEpochMs =
                        epochTimes.length > 0 ? Math.min(...epochTimes) : 0;
                      return state.transcripts.map((seg) => {
                        const displayMs =
                          seg.startMs >= 1_000_000_000_000
                            ? Math.max(0, seg.startMs - baseEpochMs)
                            : seg.startMs;
                        return (
                          <div key={seg.segmentId} className="py-2.5 space-y-1">
                            <div className="flex items-center justify-between text-xs font-mono text-ink-3 tabular-nums">
                              <span>
                                {seg.speaker} · {seg.source ?? 'unknown'} ·{' '}
                                {seg.isFinal ? 'FINAL' : 'PARTIAL'}
                              </span>
                              <span>{formatMs(displayMs)}</span>
                            </div>
                            <p className="text-ink leading-relaxed">{seg.text}</p>
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </section>

              <section
                className="border border-line bg-surface rounded-md p-4 space-y-2.5 text-xs"
                data-testid="inspector-cognitive-state"
              >
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="font-bold text-ink">SharedCognitiveState</span>
                  <Badge variant="secondary" className="font-mono">
                    {ATTENTION_SIGNAL_LABELS[cog?.attentionSignal ?? 'fluent']}
                  </Badge>
                </div>
                <div className="space-y-2 text-xs">
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
                    <span className="font-mono text-ink tabular-nums">
                      {(() => {
                        const cooldownMs = cog?.cooldownUntil ? Date.parse(cog.cooldownUntil) : 0;
                        return Number.isFinite(cooldownMs) && cooldownMs > Date.now()
                          ? `${Math.ceil((cooldownMs - Date.now()) / 1000)}s`
                          : '就绪';
                      })()}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-3">抑制条目数：</span>
                    <span className="font-mono text-ink tabular-nums">{cog?.suppressions.length ?? 0}</span>
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
                  <span className="font-mono text-xs text-ink-3 tabular-nums">
                    {state.verdicts.length} 条记录
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-line pr-1">
                  {state.verdicts.length === 0 ? (
                    <p className="text-ink-3 py-2">等待 System 1 评估...</p>
                  ) : (
                    [...state.verdicts].reverse().map((v) => (
                      <div key={v.requestId} className="py-2.5 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge variant={v.driftDetected ? 'amber' : 'resolved'}>
                            {v.cognitiveState} → {v.interventionNeed}
                          </Badge>
                          <span className="font-mono text-xs text-ink-3 tabular-nums">
                            {v.latencyMs}ms · {v.backend}
                          </span>
                        </div>
                        <p className="text-ink-2 leading-relaxed">{v.reason}</p>
                        <div className="text-xs font-mono text-ink-3 break-words tabular-nums">
                          omission={String(v.signals.semanticOmission)} · drift=
                          {String(v.signals.topicDrift)} · qa={String(v.signals.openQuestion)} ·
                          recovery={String(v.signals.recovery)} · req={v.requestId.slice(0, 8)}
                          {v.usage?.correlationId ? ` · corr=${v.usage.correlationId.slice(0, 8)}` : ''}
                          {v.observation
                            ? ` · turn=#${v.observation.turnSeq} · slot=${v.observation.selectedSlot} · conf=${(v.observation.calibratedConfidence * 100).toFixed(0)}%`
                            : ''}
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
                  <span className="font-mono text-xs text-ink-3 tabular-nums">
                    {state.candidates.length} 个候选
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-line pr-1">
                  {state.candidates.length === 0 ? (
                    <p className="text-ink-3 py-2">暂无 System 2 候选提示。</p>
                  ) : (
                    [...state.candidates].reverse().map((c) => (
                      <div key={c.candidateId} className="py-2.5 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={c.status === 'withdrawn' ? 'resolved' : 'violet'}>
                              {c.level} · {c.status}
                            </Badge>
                            <Badge variant={c.grounded ? 'resolved' : 'amber'}>
                              {c.grounded ? `grounded (${c.evidenceIds.length})` : 'ungrounded'}
                            </Badge>
                          </div>
                          <span className="font-mono text-xs text-ink-3 tabular-nums">
                            v{c.contextVersion}
                          </span>
                        </div>
                        <div className="font-semibold text-ink">{c.title}</div>
                        <p className="text-ink-2 leading-relaxed">{c.cueText}</p>
                        {c.evidenceIds.length > 0 && (
                          <div className="text-xs font-mono text-ink-3 break-all">
                            Retrieval IDs: {c.evidenceIds.join(', ')}
                          </div>
                        )}
                        {c.withdrawalReason && (
                          <p className="text-xs text-resolved">
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
                  <span className="font-mono text-xs text-ink-3 tabular-nums">
                    {state.decisions.length} 条裁决
                  </span>
                </div>
                <div className="max-h-[540px] overflow-y-auto divide-y divide-line pr-1">
                  {state.decisions.length === 0 ? (
                    <p className="text-ink-3 py-2">等待 Controller 裁决...</p>
                  ) : (
                    [...state.decisions].reverse().map((d) => (
                      <div
                        key={d.decisionId}
                        data-testid="controller-decision-row"
                        className="py-2.5 space-y-1.5"
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
                          <span className="font-mono text-xs text-ink-3 tabular-nums">
                            v{d.contextVersion} · {d.decisionId.slice(0, 8)}
                          </span>
                        </div>
                        <p className="text-ink leading-relaxed">{d.reason}</p>
                        {d.suppressReason && (
                          <p className="text-xs text-ink-3">
                            抑制理由：
                            {SUPPRESS_REASON_LABELS[
                              d.suppressReason as keyof typeof SUPPRESS_REASON_LABELS
                            ] ?? d.suppressReason}
                          </p>
                        )}
                        {d.withdrawalReason && (
                          <p className="text-xs text-resolved">
                            撤回理由：{WITHDRAWAL_REASON_LABELS[d.withdrawalReason]}
                          </p>
                        )}
                        <div className="text-xs font-mono text-ink-3 break-words tabular-nums">
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

          {/* Real CognitiveEvent Timeline */}
          <section
            className="border border-line bg-surface rounded-md p-4 space-y-2.5 text-xs"
            data-testid="inspector-events"
          >
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="font-bold text-ink">CognitiveEvent 事件时间线</span>
              <span className="font-mono text-xs text-ink-3 tabular-nums">
                {state.events.length} 条记录
              </span>
            </div>
            {state.events.length === 0 ? (
              <p className="text-ink-3">尚无事件流记录。</p>
            ) : (
              <div className="max-h-48 overflow-y-auto divide-y divide-line border border-line rounded">
                {[...state.events]
                  .reverse()
                  .slice(0, 30)
                  .map((ev) => (
                    <div
                      key={ev.event_id}
                      className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <Badge variant="secondary" className="font-mono">
                          {ev.event_type}
                        </Badge>
                        <span className="font-mono text-ink-3 tabular-nums">v{ev.context_version}</span>
                        <span className="text-ink-2 truncate max-w-[380px]">
                          来源 {ev.source}
                        </span>
                      </div>
                      <span className="font-mono text-ink-3 tabular-nums whitespace-nowrap">
                        {formatTime(ev.timestamp)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* Also provide simulation / audio control strip inside Inspector for quick verification */}
          <div className="border border-line bg-surface rounded-md p-4 text-xs">
            <form onSubmit={handleSimSubmit} className="flex flex-col sm:flex-row gap-2 items-center">
              <Badge variant="amber" className="shrink-0">
                <AlertCircle className="w-3 h-3" />
                快速文本仿真注入
              </Badge>
              <select
                value={simSpeaker}
                onChange={(e) => setSimSpeaker(e.target.value as TranscriptSpeaker)}
                aria-label="选择快速仿真发言身份"
                className="border border-line bg-ground rounded px-2.5 py-2 text-ink focus-visible:outline-none focus-visible:border-ink"
              >
                <option value="presenter">演讲者</option>
                <option value="audience">观众提问</option>
              </select>
              <input
                type="text"
                value={simText}
                onChange={(e) => setSimText(e.target.value)}
                aria-label="输入快速仿真测试话术"
                placeholder="输入测试话术直接观察 System 1/2 与 Controller 仲裁日志..."
                className="flex-1 w-full border border-line bg-ground rounded px-3 py-2 text-ink focus-visible:outline-none focus-visible:border-ink"
              />
              <Button type="submit" size="sm" disabled={isEnded || !simText.trim()}>
                注入测试文本
              </Button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
