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
  /** 鉴权初始化完成标识，避免深链接直接进入舞台时触发未授权列表拉取。 */
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
  const [launchMode, setLaunchMode] = useState<PresentationMode>('rehearsal');
  const [savedPacks, setSavedPacks] = useState<PresentationPackSummary[]>([]);
  const [loadingPack, setLoadingPack] = useState(false);

  const [simText, setSimText] = useState('');
  const [simSpeaker, setSimSpeaker] = useState<TranscriptSpeaker>('presenter');
  const [progressiveSim, setProgressiveSim] = useState(false);
  const [showInputDrawer, setShowInputDrawer] = useState(true);
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

  // Ergonomic speaker keyboard shortcuts (ignored inside editable fields)
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
  }, [
    state.session,
    state.activeIntervention,
    runtime,
  ]);

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

  // 构建同会话伴随窗 URL（?view=companion&sessionId=...）
  const buildCompanionUrl = (sid: string): string => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'companion');
    url.searchParams.set('sessionId', sid);
    return url.toString();
  };

  // 渐进打开演讲伴随窗：优先尝试 Document PiP，不支持或被拒时无缝降级至 window.open
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
        pipWin.document.title = 'CueX 演讲伴随窗';
        pipWin.document.documentElement.style.height = '100%';
        pipWin.document.body.style.height = '100%';
        pipWin.document.body.style.margin = '0';
        pipWin.document.body.style.background = '#F8F7F3';
        const frame = pipWin.document.createElement('iframe');
        frame.src = companionUrl;
        frame.title = 'CueX 演讲伴随窗';
        frame.style.display = 'block';
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.border = '0';
        pipWin.document.body.appendChild(frame);
        setCompanionLaunchNote(
          '已以 Document PiP 打开伴随窗（注：浏览器无法保证系统级置顶覆盖全屏 PPT/Keynote）。'
        );
        return;
      } catch {
        // 无头环境或安全限制拒绝 Document PiP 时继续走 window.open 降级
      }
    }

    const popup = window.open(
      companionUrl,
      'cuex_companion_window',
      'noopener,width=460,height=720'
    );
    if (popup) {
      setCompanionLaunchNote(
        '已在新独立窗口打开伴随窗（注：浏览器弹窗无法保证系统级置顶覆盖全屏 PPT/Keynote）。'
      );
    } else {
      setCompanionLaunchNote('弹窗可能被浏览器拦截，请点击右侧「伴随窗直达链接」手动打开。');
    }
  };

  // Pre-session launch gate if no session active
  if (!state.session) {
    return (
      <main className="bg-ground text-ink min-h-[calc(100dvh-3.5rem)] py-10 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto border border-line bg-surface rounded-md p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5 border-b border-line pb-4">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              进入场中实时协同
            </h1>
            <p className="text-sm text-ink-2 leading-relaxed">
              选择已编译的演讲 ContextPack，确认麦克风与隐私告知后，即可开启彩排或正式演讲。
            </p>
          </div>

          {state.wipedAt && (
            <div
              className="border border-resolved/30 bg-resolved-tint text-resolved px-4 py-3 rounded text-xs space-y-1"
              data-testid="session-wiped-notice"
            >
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>已彻底清除上一场会话转写、候选与临时状态。</span>
              </div>
              {state.deletionReceipt && (
                <div className="text-xs font-mono text-ink-2 pl-6 tabular-nums">
                  回执：{state.deletionReceipt.receiptId} · 完成时间：
                  {formatDateTime(state.deletionReceipt.completedAt)}
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
            <div className="font-semibold text-ink">当前演讲上下文包</div>
            {activePack ? (
              <div className="bg-surface-muted rounded p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm text-ink">{activePack.title}</div>
                  <div className="text-ink-3 mt-1 tabular-nums">
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
              <div className="bg-surface-muted rounded p-4 space-y-3">
                <p className="text-ink-2">尚未选定 ContextPack，可选择已保存包或载入路演示例包。</p>
                <div className="flex flex-wrap gap-2">
                  {savedPacks.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => void handlePickPack(e.target.value)}
                      className="h-9 px-3 border border-line bg-surface rounded text-xs text-ink focus-visible:outline-none focus-visible:border-ink"
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
                  ? 'border-ink bg-surface-muted font-medium'
                  : 'border-line bg-surface hover:bg-surface-muted/60'
              )}
            >
              <div className="font-semibold text-ink">彩排模式 (Rehearsal)</div>
              <p className="text-ink-3 leading-relaxed">支持测试话术仿真、随时切换视角、检验提示与撤回机制。</p>
            </button>
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
              <div className="font-semibold text-ink">正式演讲 (Live)</div>
              <p className="text-ink-3 leading-relaxed">开启 Focus 余光极简界面，最小必要干扰陪你完成真实演讲。</p>
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
              我已确认麦克风仅在本场会话期间采集，场后未确认记忆不会落盘，并可随时一键清除本场会话记录。
            </span>
          </label>

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="quiet" onClick={onGoToCompiler}>
              先去场前编译
            </Button>
            <Button
              type="button"
              disabled={!privacyAccepted || loadingPack}
              onClick={() => void handleStartFromStage()}
              data-testid="stage-start-btn"
              className="gap-1.5 min-h-[40px]"
            >
              <span>开始场中协同</span>
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

  const asrLifecycle = state.asrStatus?.lifecycleState ?? health?.asr.lifecycleState;
  const isRuntimeFallbackOrDegraded = Boolean(
    state.telemetry?.degraded ||
      state.telemetry?.usingLocalFallback ||
      state.asrStatus?.fallbackActive ||
      state.latestS1Observation?.degraded ||
      asrLifecycle === 'degraded' ||
      asrLifecycle === 'disconnected' ||
      asrLifecycle === 'unavailable' ||
      asrLifecycle === 'starting' ||
      asrLifecycle === 'restarting' ||
      (health &&
        (!health.system1.healthy ||
          !health.system2.healthy ||
          health.system1.degraded ||
          health.system2.degraded ||
          health.system1.fallbackActive ||
          health.system2.fallbackActive ||
          health.system1.mode === 'local_fallback' ||
          health.system2.mode === 'local_fallback'))
  );
  const companionUrl = buildCompanionUrl(session.sessionId);
  const s1BannerModel =
    state.latestS1Observation?.model ??
    health?.system1.model ??
    health?.system1.backend ??
    (state.telemetry?.usingLocalFallback ? 'local_rule_zero' : 'ok');
  const s1BannerDegraded = Boolean(
    state.latestS1Observation?.degraded ||
      health?.system1.fallbackActive ||
      health?.system1.degraded ||
      health?.system1.mode === 'local_fallback'
  );
  const s2BannerModel =
    state.system2Guidance?.model ?? health?.system2.model ?? health?.system2.backend ?? 'ok';
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
              {activePack?.title ?? 'CueX Presentation 会话'}
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
                    ? '监听已暂停'
                    : state.wsStatus === 'connected'
                      ? '实时协同中'
                      : state.wsStatus}
              </span>
            </Badge>

            {/* Privacy Recording Badge (calm solid dot when capturing) */}
            <Badge
              variant={runtime.micMode !== 'off' ? 'amber' : 'outline'}
              data-testid="privacy-recording-badge"
            >
              {runtime.micMode !== 'off' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber shrink-0" />
                  <span>正在收音（仅本场会话 · 可随时清除）</span>
                </>
              ) : (
                <span>麦克风未开启</span>
              )}
            </Badge>
          </div>

          {/* Focus / Inspector Dual View Switch + Split-Strip Ergonomics Toggle */}
          <div className="flex flex-wrap items-center gap-2">
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
                  'px-2.5 sm:px-3 py-1 rounded-sm text-xs font-medium flex items-center gap-1.5',
                  viewMode === 'focus'
                    ? 'bg-ink text-ground'
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
                  'px-2.5 sm:px-3 py-1 rounded-sm text-xs font-medium flex items-center gap-1.5',
                  viewMode === 'inspector'
                    ? 'bg-ink text-ground'
                    : 'text-ink-2 hover:text-ink'
                )}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Inspector 透视视角</span>
              </button>
            </div>

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
                title="切换演说窄屏伴随条模式（适合置顶分屏于 PPT 旁）"
              >
                <Columns2 className="w-3.5 h-3.5 mr-1" />
                <span>
                  {layoutMode === 'split_strip' ? '精简伴随条 · Split Strip' : '标准双栏布局'}
                </span>
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
              title="打开同会话只读伴随窗（不支持操作系统级全屏 PPT 强制置顶）"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1 text-violet-ink" />
              <span>打开独立伴随窗</span>
            </Button>

            {state.attachState && (state.attachState.companionCount ?? 0) > 0 && (
              <Badge variant="violet" data-testid="primary-companion-count">
                伴随窗 {state.attachState.companionCount}
              </Badge>
            )}
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

      {/* Honest ASR Simulation / Runtime Degraded Banners */}
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-2.5 space-y-2 empty:hidden">
        {activeAsrMode === 'text_simulation' && (
          <div
            className="border border-amber/35 bg-amber-tint/70 text-amber-ink px-3.5 py-2 rounded text-xs flex flex-wrap items-center justify-between gap-2"
            data-testid="asr-simulation-banner"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>
                <strong>文本仿真输入模式：</strong>当前输入为模拟演讲文本（非真实麦克风 ASR），用于验证双层理解、触发阈值与撤回链路。
              </span>
            </div>
            <Badge variant="outline">
              ASR: {activeAsrMode}
            </Badge>
          </div>
        )}

        {isRuntimeFallbackOrDegraded && (
          <div
            className="border border-line bg-surface px-3.5 py-2 rounded text-xs text-ink-2 flex flex-wrap items-center justify-between gap-2"
            data-testid="runtime-degraded-banner"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="w-3.5 h-3.5 text-amber shrink-0" />
              <span>
                <strong>引擎状态诚实披露：</strong>
                {state.asrStatus?.fallbackActive && state.asrStatus?.fallbackReason
                  ? `ASR 回退中（${state.asrStatus.fallbackReason}）。`
                  : health?.asr.fallbackActive && health?.asr.fallbackReason
                    ? `ASR 回退中（${health.asr.fallbackReason}）。`
                    : state.telemetry?.degraded
                      ? '部分推理或识别通道处于降级态，已自动回退至本地确定性规则引擎。'
                      : asrLifecycle && asrLifecycle !== 'ready'
                        ? `${COLAB_ASR_LIFECYCLE_LABELS[asrLifecycle]}。`
                        : '当前使用本地确定性规则引擎运行（0 外部 LLM Token），未伪装外部大模型调用。'}
              </span>
            </div>
            <span className="font-mono text-xs text-ink-3 tabular-nums">
              {asrLifecycle ? `ASR:${asrLifecycle} · ` : ''}
              S1:{s1BannerModel}
              {s1BannerDegraded ? '(降级)' : ''} · S2:{s2BannerModel}
              {health?.system2.reasoningEffort ? `(${health.system2.reasoningEffort})` : ''}
              {s2BannerDegraded ? '(降级)' : ''} · {state.telemetry?.usageSource ?? 'local_rule_zero'}
            </span>
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
                伴随窗直达链接
              </a>
              <button
                type="button"
                onClick={() => setCompanionLaunchNote(null)}
                className="text-ink-3 hover:text-ink"
                aria-label="收起伴随窗提示"
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
                  <span className="font-mono text-ink-3">当前章节</span>
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
                    '开场与核心论点'}
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
                  layoutMode === 'split_strip' ? 'text-left pt-2 border-t border-line' : 'text-left sm:text-right'
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
                <div className="text-xs text-ink-3 mt-1">
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
                <div className="flex items-center justify-between gap-2">
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
                        className="px-2.5 py-1 rounded bg-surface border border-violet/25 text-ink-2 text-xs"
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
              className={cn(
                'flex flex-col items-center justify-center border border-line bg-surface rounded-md relative',
                layoutMode === 'split_strip'
                  ? 'min-h-[210px] p-4 sm:p-5'
                  : 'flex-1 min-h-[260px] p-6 sm:p-10'
              )}
              aria-live="polite"
              aria-atomic="true"
              data-testid="focus-cue-stage"
            >
              {isSilent ? (
                <div className="text-center space-y-3" data-testid="focus-silent-state">
                  <VolumeX className="w-8 h-8 text-ink-3 mx-auto" />
                  <div className="text-xl font-semibold text-ink">L0 · 静默模式已开启</div>
                  <p className="text-xs text-ink-2 max-w-md leading-relaxed">
                    系统仍在静默记录转写与覆盖率，但不会向画面输出任何 L1–L3 干预提示。
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

                  {/* L2: Crisp large 2-6+ char keyword pill readable by peripheral vision (flattened, <= 1 border) */}
                  {activeIntervention.level === 'L2' && (
                    <div className="space-y-3">
                      <div className="inline-block max-w-full break-words px-5 sm:px-6 py-3 rounded-md bg-amber-tint border border-amber/40 text-2xl sm:text-5xl font-bold tracking-tight text-ink">
                        {activeIntervention.cueText}
                      </div>
                      <p className="text-sm text-ink-2">{activeIntervention.title}</p>
                    </div>
                  )}

                  {/* L3: Concise 2-3 bullet scaffold */}
                  {activeIntervention.level === 'L3' && (
                    <div className="space-y-3.5 text-left bg-violet-tint/35 border border-violet/30 rounded-md p-5">
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
                    <div className="flex flex-wrap justify-center gap-2 pt-1 text-xs text-ink-2">
                      {matchedEvidence.map((ev) => (
                        <span
                          key={ev.id}
                          className="px-2.5 py-1 rounded bg-surface-muted"
                        >
                          出处：{ev.source} · {ev.text}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Micro-feedback (H/I) + Dismiss suppression */}
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant={activeIntervention.userFeedback === 'helpful' ? 'resolved' : 'quiet'}
                      size="sm"
                      onClick={() => runtime.sendFeedback(activeIntervention.interventionId, 'helpful')}
                      data-testid="feedback-helpful-btn"
                      className="min-h-9"
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
                      className="min-h-9"
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
                      className="min-h-9"
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
                  <div className="w-2.5 h-2.5 rounded-full bg-resolved mx-auto" />
                  <div className="text-lg sm:text-xl font-medium text-ink">
                    L0 · 正在持续理解，当前无需干预
                  </div>
                  <p className="text-xs text-ink-3 max-w-md leading-relaxed">
                    保持你的正常节奏即可；只有当出现显著偏离、遗漏或现场问答时，CueX 才会以最小必要方式接住你。
                  </p>
                  {pres && pres.missedKeyPoints.length > 0 && (
                    <div className="flex flex-wrap justify-center items-center gap-1.5 pt-2">
                      <span className="text-xs text-ink-3">当前章节待覆盖：</span>
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
                    className="h-8 border border-line bg-ground rounded px-2 text-ink font-mono focus-visible:outline-none focus-visible:border-ink"
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

              <div
                className="w-full pt-2 border-t border-line flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3"
                data-testid="keyboard-shortcuts-hint"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Keyboard className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    快捷键：<code>Space</code> 暂停/恢复 · <code>M</code> 静默(L0) · <code>H</code>{' '}
                    请求帮助 · <code>Esc</code> 忽略提示
                  </span>
                </span>
                <span className="font-mono whitespace-nowrap">
                  {layoutMode === 'split_strip' ? 'Split Strip 伴随栏模式' : '标准双栏视角'}
                </span>
              </div>
            </div>
          </div>

          {/* Secondary Column: Speech Input & Honest ASR / Text Simulation Panel */}
          {showInputDrawer && (
            <div
              className={cn(
                'border border-line bg-surface rounded-md p-4 space-y-4 text-xs',
                layoutMode === 'split_strip' && 'lg:col-span-7'
              )}
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
                  {asrLifecycle && (
                    <Badge variant={getColabLifecycleBadgeVariant(asrLifecycle)}>
                      {COLAB_ASR_LIFECYCLE_LABELS[asrLifecycle]}
                    </Badge>
                  )}
                  {state.asrStatus?.detail && (
                    <span className="text-xs text-ink-3">{state.asrStatus.detail}</span>
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

              {(state.asrStatus?.gpuName ||
                state.asrStatus?.modelId ||
                state.asrStatus?.rtf !== undefined ||
                state.asrStatus?.fallbackActive) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-ink-2 bg-surface-muted/70 rounded px-3 py-2 tabular-nums">
                  {state.asrStatus.gpuName && <span>GPU: {state.asrStatus.gpuName}</span>}
                  {state.asrStatus.modelId && <span>模型: {state.asrStatus.modelId}</span>}
                  {state.asrStatus.rtf !== undefined && (
                    <span>RTF: {state.asrStatus.rtf.toFixed(3)}</span>
                  )}
                  {state.asrStatus.lastHealthCheckAt && (
                    <span>心跳: {formatTime(state.asrStatus.lastHealthCheckAt)}</span>
                  )}
                  {state.asrStatus.fallbackActive && (
                    <span className="text-amber-ink">
                      已回退：{state.asrStatus.fallbackReason ?? '备用链路'}
                    </span>
                  )}
                </div>
              )}

              {runtime.micMode === 'pcm_mic' && (
                <div className="flex items-center gap-3 bg-surface-muted rounded px-3 py-2">
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
                <p
                  role="alert"
                  className="text-amber-ink bg-amber-tint border border-amber/30 rounded px-3 py-2"
                >
                  {runtime.micError}
                </p>
              )}

              {/* Explicitly labeled Text Simulation Panel */}
              <div className="bg-surface-muted/70 border border-line rounded p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="amber">文本仿真输入 · 非真实麦克风 ASR</Badge>
                    <span className="text-ink-3 text-xs">
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
                    aria-label="选择仿真发言身份"
                    data-testid="sim-speaker-select"
                    className="border border-line bg-surface rounded px-2.5 py-2 text-ink sm:w-36 focus-visible:outline-none focus-visible:border-ink"
                  >
                    <option value="presenter">演讲者 (Presenter)</option>
                    <option value="audience">观众提问 (Audience)</option>
                  </select>
                  <input
                    type="text"
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    aria-label="输入仿真话术或观众追问"
                    placeholder="输入仿真话术或观众追问，按 Enter 提交..."
                    disabled={isEnded}
                    data-testid="sim-speech-input"
                    className="flex-1 border border-line bg-surface rounded px-3 py-2 text-ink focus-visible:outline-none focus-visible:border-ink"
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
                  <span className="text-xs text-ink-3 mr-1">示例话术片段：</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickSnippet(
                        '各位评委好，今天汇报 CueX 通用实时认知外挂。它的核心理念是在深度思考之外接住当下，核心系统围绕实时理解与最小必要干预构建。',
                        'presenter'
                      )
                    }
                    className="px-2.5 py-1.5 rounded border border-line bg-surface hover:bg-surface-muted text-xs text-ink-2"
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
                    className="px-2.5 py-1.5 rounded border border-line bg-surface hover:bg-surface-muted text-xs text-amber-ink"
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
                    className="px-2.5 py-1.5 rounded border border-line bg-surface hover:bg-surface-muted text-xs text-resolved"
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
                    className="px-2.5 py-1.5 rounded border border-line bg-surface hover:bg-surface-muted text-xs text-violet-ink"
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
                    className="px-2.5 py-1.5 rounded border border-line bg-surface hover:bg-surface-muted text-xs text-amber-ink"
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
