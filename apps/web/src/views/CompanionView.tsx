import React, { useEffect } from 'react';
import type { HealthStatusResponse } from '@cuex/protocol';
import {
  AlertTriangle,
  ArrowUpRight,
  HelpCircle,
  Layers,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  VolumeX,
  X,
} from 'lucide-react';
import { CueEdgeLight, type EdgeLightPhase } from '@/components/CueEdgeLight';
import type { ViewKey } from '@/components/layout/Navbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCompanionSession } from '@/core/session/useCompanionSession';
import {
  extractGlanceableCue,
  formatDuration,
  INTERVENTION_LEVEL_LABELS,
  PACE_STATUS_LABELS,
  WITHDRAWAL_REASON_LABELS,
} from '@/lib/format';
import { cn } from '@/lib/utils';

interface CompanionViewProps {
  sessionId: string | null;
  health: HealthStatusResponse | null;
  onNavigateMain?: (view: ViewKey, targetSessionId?: string) => void;
}

/**
 * 独立提词小窗（Presenter Companion Window）。
 * 用于双屏或分屏陪讲，实时同步章节计时与余光提示，不重复开启麦克风。
 */
export const CompanionView: React.FC<CompanionViewProps> = ({
  sessionId,
  onNavigateMain,
}) => {
  const companion = useCompanionSession(sessionId);
  const { state } = companion;

  const session = state.session;
  const cog = state.cognitiveState;
  const pres = state.presentationState;
  const activeIntervention = state.activeIntervention;
  const lastWithdrawn = state.lastWithdrawn;
  const isEnded = session?.status === 'ended';
  const isPaused = session?.status === 'paused';
  const isSilent = session?.silentMode ?? false;
  const canInteractWithCues = state.attachState?.rolePolicy.canInteractWithCues ?? true;

  useEffect(() => {
    if (!session || isEnded || !canInteractWithCues) return;

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
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        companion.requestHelp(activeIntervention ? 'L3' : 'L2');
      } else if (e.key === 'Escape' && activeIntervention) {
        e.preventDefault();
        companion.dismissHint('keyboard_escape_in_companion');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session, isEnded, canInteractWithCues, activeIntervention, companion]);

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

  if (!sessionId) {
    return (
      <div className="min-h-dvh bg-ground text-ink flex flex-col">
        <header className="w-full border-b border-line bg-surface px-4 py-3">
          <div className="max-w-[680px] mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <img
                src="/brand/cuex-wordmark.svg"
                alt="CueX"
                width="56"
                height="25"
                className="h-6 w-auto block"
              />
              <h1 className="text-sm font-semibold text-ink">独立提词小窗</h1>
            </div>
            <Badge variant="outline">尚未连接</Badge>
          </div>
        </header>
        <main className="flex-1 max-w-[680px] w-full mx-auto px-4 py-8" data-testid="companion-view">
          <div className="border border-line bg-surface rounded-md p-6 space-y-3 text-xs">
            <div className="font-semibold text-sm text-ink">尚未关联正在进行的演讲</div>
            <p className="text-ink-2 leading-relaxed">
              请先在主窗口进入「上台演讲」，再点击右上角「独立提词小窗」即可同步画面。
            </p>
            <div>
              <Button
                type="button"
                size="sm"
                onClick={() => onNavigateMain?.('stage')}
                data-testid="companion-back-stage-btn"
              >
                前往上台演讲
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ground text-ink flex flex-col font-ui antialiased">
      <CueEdgeLight phase={edgePhase} paused={isPaused} />

      {/* 精简顶栏 */}
      <header className="w-full border-b border-line bg-surface px-4 py-2.5 sticky top-0 z-30">
        <div className="max-w-[680px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <img
              src="/brand/cuex-symbol-dimensional.svg"
              alt="CueX"
              width="22"
              height="22"
              className="w-5 h-5 shrink-0"
            />
            <h1 className="text-sm font-semibold text-ink truncate max-w-[200px]">
              CueX 提词小窗
            </h1>
            <Badge variant="violet" data-testid="companion-attach-badge">
              副窗同步
            </Badge>
            <Badge
              variant={
                isEnded
                  ? 'secondary'
                  : state.attachState && !state.attachState.activePrimaryConnected
                    ? 'amber'
                    : state.wsStatus === 'connected'
                      ? 'resolved'
                      : 'outline'
              }
              data-testid="companion-primary-status"
            >
              <Radio className="w-3 h-3" />
              <span>
                {isEnded
                  ? '演讲已结束'
                  : state.attachState && !state.attachState.activePrimaryConnected
                    ? '主窗口重连中'
                    : isPaused
                      ? '已暂停'
                      : state.wsStatus === 'connected'
                        ? '已同步主舞台'
                        : '连接中'}
              </span>
            </Badge>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge variant="outline" data-testid="companion-no-mic-badge">
              由主窗口收音
            </Badge>
            {(state.wsStatus === 'error' || state.wsStatus === 'closed') && !isEnded && (
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={companion.reconnect}
                data-testid="companion-reconnect-btn"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重连</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main
        className="flex-1 max-w-[680px] w-full mx-auto px-4 py-4 flex flex-col justify-between gap-3.5"
        data-testid="companion-view"
      >
        <div className="space-y-3.5">
          {state.error && (
            <div
              role="alert"
              data-testid="companion-error"
              className="border border-amber/40 bg-amber-tint text-amber-ink px-3.5 py-2.5 rounded text-xs leading-relaxed"
            >
              {state.error}
            </div>
          )}

          {/* 章节与计时头 */}
          <div
            className="border border-line bg-surface rounded-md p-4 space-y-2"
            data-testid="companion-header"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
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
              <span
                className="font-mono text-lg font-bold tabular-nums text-ink shrink-0"
                data-testid="companion-timer"
              >
                {formatDuration(pres?.elapsedSec ?? 0)}
                <span className="text-xs text-ink-3 font-normal">
                  {' '}
                  / {formatDuration(pres?.targetDurationSec ?? 300)}
                </span>
              </span>
            </div>

            <div className="text-base sm:text-lg font-bold text-ink leading-snug break-words">
              {cog?.activeChapterTitle ??
                pres?.chapterNodes[pres.activeChapterIndex]?.title ??
                (state.wsStatus === 'connected' ? '开场与核心论点' : '正在连接主舞台…')}
            </div>

            {cog && cog.openGapLabels.length > 0 && !activeIntervention && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="text-ink-3">本章要点：</span>
                {cog.openGapLabels.slice(0, 3).map((gap) => (
                  <span
                    key={gap}
                    className="px-2 py-0.5 rounded bg-surface-muted text-ink-2"
                  >
                    {gap}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 余光提示舞台 */}
          <div
            className="border border-line bg-surface rounded-md min-h-[240px] p-5 sm:p-6 flex flex-col items-center justify-center relative"
            aria-live="polite"
            aria-atomic="true"
            data-testid="companion-cue-stage"
          >
            {!session ? (
              <div className="text-center space-y-2.5" data-testid="companion-connecting">
                <div className="text-base font-medium text-ink">正在同步演讲进度…</div>
              </div>
            ) : isEnded ? (
              <div className="text-center space-y-3" data-testid="companion-session-ended">
                <Badge variant="secondary">演讲已结束</Badge>
                <div className="text-base font-semibold text-ink">辛苦了，本场分享已完成</div>
                <p className="text-xs text-ink-2 max-w-sm leading-relaxed">
                  可返回主窗口查看要点覆盖情况，并针对薄弱片段单点重练。
                </p>
                {onNavigateMain && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onNavigateMain('reflection', sessionId)}
                    data-testid="companion-go-reflection-btn"
                  >
                    <span>查看复盘报告</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ) : isSilent ? (
              <div className="text-center space-y-2.5" data-testid="companion-silent-state">
                <VolumeX className="w-7 h-7 text-ink-3 mx-auto" />
                <div className="text-lg font-semibold text-ink">免打扰模式已开启</div>
                <p className="text-xs text-ink-2 max-w-sm leading-relaxed">
                  当前仅保留章节计时，不弹出任何提示卡片。
                </p>
              </div>
            ) : activeIntervention ? (
              <div
                className="w-full text-center space-y-3.5"
                data-testid="companion-active-intervention"
                data-level={activeIntervention.level}
                data-grounded={activeIntervention.grounded}
              >
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <Badge variant={activeIntervention.level === 'L3' ? 'violet' : 'amber'}>
                    {INTERVENTION_LEVEL_LABELS[activeIntervention.level]}
                  </Badge>
                  {activeIntervention.grounded ? (
                    <Badge variant="resolved">
                      <ShieldCheck className="w-3 h-3" />
                      来自讲稿数据
                    </Badge>
                  ) : (
                    <Badge variant="amber">
                      <ShieldAlert className="w-3 h-3" />
                      讲稿未包含此项
                    </Badge>
                  )}
                </div>

                {activeIntervention.level === 'L1' && (
                  <div className="space-y-1.5">
                    <div className="text-xl sm:text-2xl font-semibold text-amber-ink tracking-tight">
                      {glanceable?.headline ?? activeIntervention.title}
                    </div>
                    {glanceable?.subline && (
                      <p className="text-sm text-ink-2">{glanceable.subline}</p>
                    )}
                  </div>
                )}

                {activeIntervention.level === 'L2' && (
                  <div className="space-y-2">
                    <div className="inline-block max-w-full break-words px-5 py-2.5 rounded-md bg-amber-tint border border-amber/40 text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                      {glanceable?.headline ?? activeIntervention.cueText}
                    </div>
                    {glanceable?.subline && (
                      <p className="text-xs sm:text-sm text-ink-2 max-w-md mx-auto">
                        {glanceable.subline}
                      </p>
                    )}
                  </div>
                )}

                {activeIntervention.level === 'L3' && (
                  <div className="space-y-2.5 text-left bg-violet-tint/35 border border-violet/30 rounded-md p-4">
                    <div className="text-sm font-semibold text-violet-ink">
                      {activeIntervention.title}
                    </div>
                    <p className="text-base sm:text-lg font-bold text-ink leading-snug">
                      {glanceable?.headline ?? activeIntervention.cueText}
                    </p>
                    {activeIntervention.bullets && activeIntervention.bullets.length > 0 && (
                      <ul className="space-y-1.5 pt-1 text-xs sm:text-sm text-ink-2 list-disc pl-4">
                        {activeIntervention.bullets.slice(0, 3).map((b, idx) => (
                          <li key={idx}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {activeIntervention.missingEvidenceNotice && (
                  <div
                    className="border border-amber/40 bg-amber-tint rounded p-2.5 text-xs text-amber-ink text-left flex items-start gap-2"
                    data-testid="companion-missing-evidence-warning"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>讲稿中暂无这项数据记录，建议坦诚说明会后核实补充。</span>
                  </div>
                )}

                {canInteractWithCues && (
                  <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant={activeIntervention.userFeedback === 'helpful' ? 'resolved' : 'quiet'}
                      size="sm"
                      onClick={() =>
                        companion.sendFeedback(activeIntervention.interventionId, 'helpful')
                      }
                      data-testid="companion-feedback-helpful-btn"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>有帮助</span>
                    </Button>
                    <Button
                      type="button"
                      variant={
                        activeIntervention.userFeedback === 'distracting' ? 'amber' : 'quiet'
                      }
                      size="sm"
                      onClick={() =>
                        companion.sendFeedback(activeIntervention.interventionId, 'distracting')
                      }
                      data-testid="companion-feedback-distracting-btn"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>嫌打扰</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => companion.dismissHint('user_dismissed_in_companion')}
                      data-testid="companion-dismiss-btn"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>收起</span>
                    </Button>
                  </div>
                )}
              </div>
            ) : lastWithdrawn ? (
              <div
                className="text-center space-y-1.5 max-w-md border border-resolved/35 bg-resolved-tint/60 rounded-md px-5 py-3.5"
                data-testid="companion-withdrawn-banner"
              >
                <p className="text-sm text-resolved font-medium">
                  {WITHDRAWAL_REASON_LABELS[lastWithdrawn.reason] ?? '已接回主线，提示自动收起'}
                </p>
              </div>
            ) : (
              <div className="text-center space-y-2.5" data-testid="companion-l0-quiet">
                <div className="w-2.5 h-2.5 rounded-full bg-resolved mx-auto" />
                <div className="text-base sm:text-lg font-medium text-ink">
                  正在安静倾听，保持自然节奏即可
                </div>
                <p className="text-xs text-ink-3 max-w-sm leading-relaxed">
                  遇到卡顿或现场提问时，这里会自动浮现简短关键词。
                </p>
              </div>
            )}
          </div>

          {/* 快捷求助条 */}
          <div
            className="border border-line bg-surface rounded-md p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
            data-testid="companion-controls"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="quiet"
                size="sm"
                disabled={!session || isEnded || !canInteractWithCues}
                onClick={() => companion.requestHelp('L2')}
                data-testid="companion-request-l2-btn"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber" />
                <span>提示关键词</span>
              </Button>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                disabled={!session || isEnded || !canInteractWithCues}
                onClick={() => companion.requestHelp('L3')}
                data-testid="companion-request-l3-btn"
              >
                <Layers className="w-3.5 h-3.5 text-violet" />
                <span>展开要点</span>
              </Button>
            </div>
            <span className="text-ink-3">
              快捷键：<code>H</code> 提示 / <code>Esc</code> 收起
            </span>
          </div>
        </div>

        {/* 实用双屏摆放提示 */}
        <footer
          className="border border-line bg-surface-muted/70 rounded-md px-3.5 py-2.5 text-xs text-ink-2 leading-relaxed"
          data-testid="companion-honesty-notice"
        >
          <p>
            <strong>双屏使用建议：</strong>
            全屏播放幻灯片时，建议开启 PPT / Keynote「演讲者视图」，或将此提词小窗移至扩展副屏观看。
          </p>
        </footer>
      </main>
    </div>
  );
};
