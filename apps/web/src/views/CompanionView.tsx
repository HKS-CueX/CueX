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
  ASR_MODE_LABELS,
  ATTENTION_SIGNAL_LABELS,
  COLAB_ASR_LIFECYCLE_LABELS,
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
 * 独立演讲伴随窗（Presenter Companion Window）。
 * 设计定位：极简余光 Focus 视图，同会话多订阅只读附着，绝不采集麦克风或新建 Runtime。
 */
export const CompanionView: React.FC<CompanionViewProps> = ({
  sessionId,
  health,
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

  // 伴随窗安全快捷键：仅开放 H（求助）与 Esc（忽略当前提示），绝不绑定 M/Space 等主控写操作
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

  // 计算与主 Focus 同口径的边缘微光状态
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

  const s1ModelText =
    state.latestS1Observation?.model ??
    health?.system1.model ??
    health?.system1.backend ??
    '待同步';
  const s1Degraded = Boolean(
    state.latestS1Observation?.degraded ||
      health?.system1.fallbackActive ||
      health?.system1.degraded
  );
  const s2ModelText =
    state.system2Guidance?.model ?? health?.system2.model ?? health?.system2.backend ?? '待同步';
  const s2Degraded = Boolean(health?.system2.fallbackActive || health?.system2.degraded);
  const asrLifecycle = state.asrStatus?.lifecycleState ?? health?.asr.lifecycleState;

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
              <h1 className="text-sm font-semibold text-ink">演讲伴随窗（Companion）</h1>
            </div>
            <Badge variant="outline">未指定会话</Badge>
          </div>
        </header>
        <main className="flex-1 max-w-[680px] w-full mx-auto px-4 py-8" data-testid="companion-view">
          <div className="border border-line bg-surface rounded-md p-6 space-y-3 text-xs">
            <div className="font-semibold text-sm text-ink">缺少可附着的 sessionId 参数</div>
            <p className="text-ink-2 leading-relaxed">
              请从主舞台（「场中协同」页）点击「打开独立伴随窗」启动，或在 URL 中传入{' '}
              <code>?view=companion&amp;sessionId=...</code>。
            </p>
            <div>
              <Button
                type="button"
                size="sm"
                onClick={() => onNavigateMain?.('stage')}
                data-testid="companion-back-stage-btn"
              >
                前往主控台场中协同
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

      {/* 伴随窗精简顶栏：清晰展示只读角色、主控在线态与零采集声明 */}
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
            <h1 className="text-sm font-semibold text-ink truncate max-w-[220px]">
              CueX 伴随窗
            </h1>
            <Badge variant="violet" data-testid="companion-attach-badge">
              {state.attachState?.role === 'companion' ? 'companion 只读附着' : '只读伴随连接'}
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
                  ? '会话已结束'
                  : state.attachState && !state.attachState.activePrimaryConnected
                    ? '主控端暂离线'
                    : isPaused
                      ? '监听已暂停'
                      : state.wsStatus === 'connected'
                        ? '已同步主控会话'
                        : state.wsStatus}
              </span>
            </Badge>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge variant="outline" data-testid="companion-no-mic-badge">
              不采集麦克风
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

          {/* 章节与计时头：适合 420–520px 窄窗余光一眼扫读 */}
          <div
            className="border border-line bg-surface rounded-md p-4 space-y-2"
            data-testid="companion-header"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
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
                (state.wsStatus === 'connected' ? '开场与核心论点' : '正在接入主控会话…')}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
              <span>
                注意态：{ATTENTION_SIGNAL_LABELS[cog?.attentionSignal ?? 'fluent']} · 上限{' '}
                <code className="text-ink font-semibold">{session?.maxInterventionLevel ?? 'L3'}</code>
              </span>
              <span className="font-mono truncate max-w-[200px]">session: {sessionId}</span>
            </div>

            {cog && cog.openGapLabels.length > 0 && !activeIntervention && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="text-ink-3">待覆盖：</span>
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

          {/* 伴随窗核心余光提示舞台 */}
          <div
            className="border border-line bg-surface rounded-md min-h-[240px] p-5 sm:p-6 flex flex-col items-center justify-center relative"
            aria-live="polite"
            aria-atomic="true"
            data-testid="companion-cue-stage"
          >
            {!session ? (
              <div className="text-center space-y-2.5" data-testid="companion-connecting">
                <div className="text-base font-medium text-ink">正在同步主控会话状态…</div>
                <p className="text-xs text-ink-3 max-w-sm leading-relaxed">
                  正在以只读伴随角色接入会话 {sessionId}。
                </p>
              </div>
            ) : isEnded ? (
              <div className="text-center space-y-3" data-testid="companion-session-ended">
                <Badge variant="secondary">主控会话已结束</Badge>
                <div className="text-base font-semibold text-ink">本场演讲已同步结束</div>
                <p className="text-xs text-ink-2 max-w-sm leading-relaxed">
                  当前伴随连接保留最终结束快照，可前往主界面查看「场后复盘」与净效用评分 V = H - λI。
                </p>
                {onNavigateMain && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onNavigateMain('reflection', sessionId)}
                    data-testid="companion-go-reflection-btn"
                  >
                    <span>在主界面查看复盘</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ) : isSilent ? (
              <div className="text-center space-y-2.5" data-testid="companion-silent-state">
                <VolumeX className="w-7 h-7 text-ink-3 mx-auto" />
                <div className="text-lg font-semibold text-ink">L0 · 主控已开启静默模式</div>
                <p className="text-xs text-ink-2 max-w-sm leading-relaxed">
                  伴随窗同步保持零干预静默，仅保留计时与章节进度。
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
                  <Badge
                    variant={activeIntervention.level === 'L3' ? 'violet' : 'amber'}
                    className="font-mono"
                  >
                    {INTERVENTION_LEVEL_LABELS[activeIntervention.level]}
                  </Badge>
                  {activeIntervention.grounded ? (
                    <Badge variant="resolved">
                      <ShieldCheck className="w-3 h-3" />
                      已核验依据 ({activeIntervention.evidenceIds.length})
                    </Badge>
                  ) : (
                    <Badge variant="amber">
                      <ShieldAlert className="w-3 h-3" />
                      资料未覆盖 · 勿现场编造
                    </Badge>
                  )}
                </div>

                {activeIntervention.level === 'L1' && (
                  <div className="space-y-1.5">
                    <div className="text-xl sm:text-2xl font-semibold text-amber-ink tracking-tight">
                      {activeIntervention.title}
                    </div>
                    <p className="text-sm text-ink-2">{activeIntervention.cueText}</p>
                  </div>
                )}

                {activeIntervention.level === 'L2' && (
                  <div className="space-y-2.5">
                    <div className="inline-block max-w-full break-words px-5 py-2.5 rounded-md bg-amber-tint border border-amber/40 text-2xl sm:text-4xl font-bold tracking-tight text-ink">
                      {activeIntervention.cueText}
                    </div>
                    <p className="text-xs sm:text-sm text-ink-2">{activeIntervention.title}</p>
                  </div>
                )}

                {activeIntervention.level === 'L3' && (
                  <div className="space-y-2.5 text-left bg-violet-tint/35 border border-violet/30 rounded-md p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm sm:text-base font-bold text-ink">
                        {activeIntervention.title}
                      </span>
                      <span className="text-xs font-mono text-violet-ink">L3 脚手架</span>
                    </div>
                    <p className="text-base sm:text-lg font-semibold text-ink leading-snug">
                      {activeIntervention.cueText}
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
                    <span>{activeIntervention.missingEvidenceNotice}</span>
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
                      <span>有效</span>
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
                      <span>打扰</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => companion.dismissHint('user_dismissed_in_companion')}
                      data-testid="companion-dismiss-btn"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>忽略提示</span>
                    </Button>
                  </div>
                )}
              </div>
            ) : lastWithdrawn ? (
              <div
                className="text-center space-y-2 max-w-md border border-resolved/35 bg-resolved-tint/60 rounded-md px-5 py-4"
                data-testid="companion-withdrawn-banner"
              >
                <Badge variant="resolved">主动退出 · 已自动撤回</Badge>
                {lastWithdrawn.cueText && (
                  <p className="text-base text-ink-3">
                    <del>{lastWithdrawn.cueText}</del>
                  </p>
                )}
                <p className="text-xs text-resolved font-medium">
                  {WITHDRAWAL_REASON_LABELS[lastWithdrawn.reason] ?? lastWithdrawn.reason}
                </p>
              </div>
            ) : (
              <div className="text-center space-y-2.5" data-testid="companion-l0-quiet">
                <div className="w-2.5 h-2.5 rounded-full bg-resolved mx-auto" />
                <div className="text-base sm:text-lg font-medium text-ink">
                  L0 · 正在持续理解，当前无需干预
                </div>
                <p className="text-xs text-ink-3 max-w-sm leading-relaxed">
                  伴随窗已与主控会话同步；保持自然语速即可，仅在必要时用余光一瞥线索。
                </p>
              </div>
            )}
          </div>

          {/* 伴随窗安全轻量操作条：仅支持手动求助，不开放任何会话控制/写操作 */}
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
                <span>请求提示 (L2)</span>
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
                <span>展开要点 (L3)</span>
              </Button>
            </div>
            <span className="text-ink-3 font-mono">
              快捷键：<code>H</code> 求助 · <code>Esc</code> 忽略
            </span>
          </div>
        </div>

        {/* 诚实边界与系统能力简要说明 */}
        <footer
          className="border border-line bg-surface-muted/70 rounded-md px-3.5 py-2.5 text-xs text-ink-2 space-y-1 leading-relaxed"
          data-testid="companion-honesty-notice"
        >
          <p>
            <strong>窗口置顶边界说明：</strong>
            浏览器独立窗口（含 Document PiP）<strong>无法保证操作系统级强制置顶覆盖全屏 PowerPoint / Keynote</strong>；全屏演示时建议配合「演讲者视图」分屏或副屏独立摆放。
          </p>
          <p className="font-mono text-ink-3 tabular-nums break-words">
            ASR:{state.asrStatus ? ASR_MODE_LABELS[state.asrStatus.mode] : '待同步'}
            {asrLifecycle ? `(${COLAB_ASR_LIFECYCLE_LABELS[asrLifecycle]})` : ''} · S1:{s1ModelText}
            {s1Degraded ? '(降级)' : ''} · S2:{s2ModelText}
            {s2Degraded ? '(降级)' : ''}
          </p>
        </footer>
      </main>
    </div>
  );
};
