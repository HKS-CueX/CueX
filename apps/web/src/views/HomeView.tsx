import React, { useState } from 'react';
import {
  SCENARIO_CAPABILITY_DESCRIPTORS,
  type HealthStatusResponse,
  type ScenarioCapabilityDescriptor,
} from '@cuex/protocol';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  Mic,
  ShieldCheck,
  Sparkles,
  Zap,
  Brain,
  Minimize2,
} from 'lucide-react';
import type { ViewKey } from '@/components/layout/Navbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HomeViewProps {
  scenarios: ScenarioCapabilityDescriptor[];
  health: HealthStatusResponse | null;
  onNavigate: (view: ViewKey) => void;
  onLoadDemoPack: () => Promise<void>;
  loadingDemo: boolean;
}

type PreviewCueState = 'l0' | 'l1' | 'l2' | 'l3' | 'withdrawn';

const PREVIEW_STATES: Record<
  PreviewCueState,
  {
    label: string;
    badge: string;
    tone: 'secondary' | 'amber' | 'violet' | 'resolved';
    title: string;
    detail: string;
    why: string;
  }
> = {
  l0: {
    label: 'L0 · 静默观察',
    badge: '默认状态',
    tone: 'secondary',
    title: '表达连贯 · 保持零打扰',
    detail: 'System 1 持续追踪章节覆盖与语义流畅度，只要没有显著缺口或提问，界面保持完全静默。',
    why: '仅因为停顿 2 秒但语义完整时，Controller 判定 pause_only_without_gap 并抑制提示。',
  },
  l1: {
    label: 'L1 · 边缘微光',
    badge: '极轻唤醒',
    tone: 'amber',
    title: '屏幕边缘柔和呼吸提示',
    detail: '检测到章节偏离或关键数字尚未覆盖时，先以不打断视线的 Amber 边缘微光提醒，不弹出文字遮挡。',
    why: '最小必要干预：保留演讲者注意力，只在真正需要时才升级为文字。',
  },
  l2: {
    label: 'L2 · 关键词胶囊',
    badge: '余光可读',
    tone: 'amber',
    title: '“事实依据：V = H - λI”',
    detail: '大字号 2–6 字短关键词胶囊，严格绑定用户已确认的 FactWhitelist evidenceIds，绝不现场编造。',
    why: '支持演讲者用余光一瞥即接住思路，旁注清晰标明依据来源。',
  },
  l3: {
    label: 'L3 · 要点脚手架',
    badge: '兜底展开',
    tone: 'violet',
    title: '现场问答 / 主动求助展开 2–3 条结构化要点',
    detail: '仅在观众追问或演讲者主动点击「请求帮助」时展开，若资料未覆盖则明确标注「尚未准备 / 勿编造」。',
    why: 'System 2 检索已锁定事实并经 Controller 校验 grounding 后方允许展示。',
  },
  withdrawn: {
    label: '主动退出',
    badge: '自动撤回',
    tone: 'resolved',
    title: '检测到你已主动补全 → 提示自动收回',
    detail: '演讲者自行拉回主线或补出核心指标后，InterventionController 立即发出 withdraw（user_recovered）。',
    why: '记入 V = H - λI 统计：成功避免一次多余打断，让 AI 在不需要时自己消失。',
  },
};

export const HomeView: React.FC<HomeViewProps> = ({
  scenarios,
  health,
  onNavigate,
  onLoadDemoPack,
  loadingDemo,
}) => {
  const [previewState, setPreviewState] = useState<PreviewCueState>('l2');
  const effectiveScenarios =
    scenarios.length > 0 ? scenarios : [...SCENARIO_CAPABILITY_DESCRIPTORS];
  const presentationScenario =
    effectiveScenarios.find((s) => s.id === 'presentation') ?? effectiveScenarios[0];
  const roadmapScenarios = effectiveScenarios.filter((s) => s.id !== 'presentation');
  const activePreview = PREVIEW_STATES[previewState];

  return (
    <div className="bg-ground text-ink">
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-20">
        {/* ==================== HERO ==================== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-mono tracking-wider text-ink-3 uppercase">
              <span className="w-2 h-2 rounded-full bg-amber" />
              <span>CueX · Universal Cognitive Copilot</span>
            </div>

            <div className="space-y-3">
              <h1
                className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-ink leading-[1.12]"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                你的快思考外挂
              </h1>
              <p className="text-xl sm:text-2xl text-ink-2 font-normal tracking-tight">
                在深度思考之外，接住当下。
              </p>
            </div>

            <p className="text-sm sm:text-base text-ink-2 leading-relaxed max-w-xl">
              高压演讲、答辩与现场问答的挑战，往往不是没有准备，而是大脑在毫秒级临场负荷下突然卡壳或偏题。
              <strong className="text-ink font-semibold"> CueX </strong>
              以通用双层认知内核（System 1 快感知 × System 2 实证检索）与独立干预控制器，
              用最小必要提示接住当下，并在你恢复流畅后主动退场。
            </p>

            {/* Four Core Principles */}
            <div className="flex flex-wrap gap-2">
              {['持续理解', '适时提示', '最小必要干预', '主动退出'].map((item, idx) => (
                <span
                  key={item}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded border text-xs font-medium bg-surface',
                    idx % 2 === 0
                      ? 'border-amber/35 text-amber-ink'
                      : 'border-violet/35 text-violet-ink'
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      idx % 2 === 0 ? 'bg-amber' : 'bg-violet'
                    )}
                  />
                  {item}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                type="button"
                size="lg"
                onClick={() => onNavigate('compiler')}
                data-testid="home-cta-compiler"
                className="gap-2"
              >
                <span>进入 CueX Presentation 场前编译</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="quiet"
                size="lg"
                disabled={loadingDemo}
                onClick={() => void onLoadDemoPack()}
                data-testid="home-cta-demo"
                className="gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber" />
                <span>{loadingDemo ? '正在载入演示包...' : '一键载入 CueX 路演演示包'}</span>
              </Button>
            </div>

            <div className="pt-5 border-t border-line grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="font-semibold text-ink block">System 1 · 琥珀流</span>
                <span className="text-ink-3">持续监听节奏、遗漏与偏题</span>
              </div>
              <div>
                <span className="font-semibold text-ink block">System 2 · 紫晶流</span>
                <span className="text-ink-3">仅基于确认事实做问答兜底</span>
              </div>
              <div>
                <span className="font-semibold text-ink block font-mono">V = H - λI</span>
                <span className="text-ink-3">以净有效介入衡量每次提示</span>
              </div>
            </div>
          </div>

          {/* Right: Crossed X Philosophy & Progressive Intervention Interactive Card */}
          <div className="lg:col-span-6 border border-line bg-surface rounded-md p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-ink-3">
                  Dual-System Architecture
                </span>
                <span className="text-line">/</span>
                <span className="text-xs font-medium text-ink">
                  X，代表任意高压即时场景
                </span>
              </div>
              <Badge variant="amber">Presentation 实机已就绪</Badge>
            </div>

            {/* Crossed X diagram */}
            <div className="relative bg-ground border border-line rounded p-5 flex flex-col items-center justify-center min-h-[210px]">
              <div className="w-full max-w-[360px] grid grid-cols-3 items-center gap-2 text-center">
                <div className="text-left space-y-3">
                  <div>
                    <span className="text-xs font-semibold text-ink-3 block">社交 Social</span>
                    <span className="text-[10px] text-ink-3">路线图规划中</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-ink-3 block">讲课 Teaching</span>
                    <span className="text-[10px] text-ink-3">路线图规划中</span>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center">
                  <img
                    src="/brand/cuex-symbol-dimensional.svg"
                    alt="CueX 双层交汇标志"
                    className="w-24 h-24 object-contain"
                  />
                  <span className="text-[11px] font-mono text-ink-3 mt-1">
                    System 1 × System 2
                  </span>
                </div>

                <div className="text-right space-y-3">
                  <div>
                    <span className="text-xs font-bold text-amber-ink block">演讲 Presentation</span>
                    <span className="text-[10px] text-resolved font-medium">已实机上线</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-ink-3 block">销售 Sales</span>
                    <span className="text-[10px] text-ink-3">路线图规划中</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive L0-L3 Preview Selector */}
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="分级干预预览">
                {(Object.keys(PREVIEW_STATES) as PreviewCueState[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreviewState(key)}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded border transition-colors',
                      previewState === key
                        ? 'bg-ink text-ground border-ink font-medium'
                        : 'bg-ground text-ink-2 border-line hover:bg-ground-2'
                    )}
                  >
                    {PREVIEW_STATES[key].label}
                  </button>
                ))}
              </div>

              <div
                className={cn(
                  'p-4 rounded border transition-all space-y-1.5',
                  previewState === 'l1' || previewState === 'l2'
                    ? 'bg-amber-tint/50 border-amber/35'
                    : previewState === 'l3'
                      ? 'bg-violet-tint/50 border-violet/35'
                      : previewState === 'withdrawn'
                        ? 'bg-resolved-tint/60 border-resolved/35'
                        : 'bg-ground border-line'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{activePreview.title}</span>
                  <Badge variant={activePreview.tone}>{activePreview.badge}</Badge>
                </div>
                <p className="text-xs text-ink-2 leading-relaxed">{activePreview.detail}</p>
                <p className="text-[11px] text-ink-3 pt-1 border-t border-line/60">
                  控制器判据：{activePreview.why}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== COGNITIVE ARCHITECTURE PILLARS ==================== */}
        <section className="border-t border-line pt-12 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <span className="font-mono text-xs uppercase tracking-widest text-ink-3">
                UNIVERSAL COGNITIVE RUNTIME
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                为什么独立 InterventionController 才是护城河
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-ink-2 max-w-md">
              提词器的问题不是字太小，而是在不需要时还在喋喋不休。CueX 让 System 2 永远不能越过控制器直接弹窗。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="border border-line bg-surface rounded-md p-5 space-y-2.5">
              <div className="w-9 h-9 rounded bg-amber-tint text-amber-ink flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="text-base font-semibold text-ink">多信号联合触发 · 不只看停顿</h3>
              <p className="text-xs text-ink-2 leading-relaxed">
                单纯按停顿秒数弹窗会产生大量误报。System 1 综合语流缺口、章节偏离、关键点遗漏与现场提问信号联合判决，纯粹喘息停顿直接抑制。
              </p>
            </div>

            <div className="border border-line bg-surface rounded-md p-5 space-y-2.5">
              <div className="w-9 h-9 rounded bg-violet-tint text-violet-ink flex items-center justify-center">
                <Brain className="w-4 h-4" />
              </div>
              <h3 className="text-base font-semibold text-ink">严格事实白名单 · 绝不现场编造</h3>
              <p className="text-xs text-ink-2 leading-relaxed">
                每一条 L2/L3 提示必须绑定场前编译确认的 evidenceIds。遇到资料未覆盖的现场追问，明确提示「尚未准备」，守住演讲信誉底线。
              </p>
            </div>

            <div className="border border-line bg-surface rounded-md p-5 space-y-2.5">
              <div className="w-9 h-9 rounded bg-resolved-tint text-resolved flex items-center justify-center">
                <Minimize2 className="w-4 h-4" />
              </div>
              <h3 className="text-base font-semibold text-ink">TTL、版本失效与主动撤回</h3>
              <p className="text-xs text-ink-2 leading-relaxed">
                候选提示携带 contextVersion 与 TTL。当章节切换、话题转移或演讲者自行补全缺口时，提示立即作废撤回，减少一次多余打扰。
              </p>
            </div>
          </div>
        </section>

        {/* ==================== SCENARIO MATRIX (LIVE + ROADMAP) ==================== */}
        <section className="border-t border-line pt-12 space-y-8" data-testid="scenario-matrix">
          <div className="space-y-1.5">
            <span className="font-mono text-xs uppercase tracking-widest text-ink-3">
              SCENARIO ADAPTER LAYER
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              首个落地场景与通用扩展路线图
            </h2>
            <p className="text-xs sm:text-sm text-ink-2 max-w-2xl">
              CueX 基于统一的 Scenario Adapter 接口构建；当前实机聚焦{' '}
              <strong className="text-ink font-semibold">CueX Presentation</strong>
              ，其余场景以真实规划态呈现，不伪装成已上线功能。
            </p>
          </div>

          {/* Primary Implemented Scenario: CueX Presentation */}
          {presentationScenario && (
            <div
              className="border-2 border-ink/85 bg-surface rounded-md p-6 sm:p-8 shadow-sm space-y-6"
              data-testid="scenario-card-presentation"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-line pb-5">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="resolved">已实机上线 · Implemented</Badge>
                    <Badge variant="amber">Rehearsal &amp; Live 双模式</Badge>
                    <Badge variant="violet">L0–L3 分级介入</Badge>
                  </div>
                  <h3 className="text-2xl font-bold text-ink">{presentationScenario.displayName}</h3>
                  <p className="text-sm text-ink-2 max-w-3xl">{presentationScenario.description}</p>
                </div>

                <div className="flex flex-wrap gap-2.5 shrink-0">
                  <Button
                    type="button"
                    onClick={() => onNavigate('compiler')}
                    className="gap-1.5"
                  >
                    <span>开始场前编译</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => void onLoadDemoPack()}
                    disabled={loadingDemo}
                  >
                    <span>体验路演示例包</span>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3.5 bg-ground border border-line rounded space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-ink">
                    <Layers className="w-3.5 h-3.5 text-amber" />
                    <span>场前 · Context Compiler</span>
                  </div>
                  <p className="text-ink-2 leading-relaxed">
                    解析 .pptx / .pdf / .md / .txt，编译一页式导播单、可锁定事实白名单与明确标记为「AI 预测」的问答词卡。
                  </p>
                </div>
                <div className="p-3.5 bg-ground border border-line rounded space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-ink">
                    <Mic className="w-3.5 h-3.5 text-violet" />
                    <span>场中 · Focus × Inspector</span>
                  </div>
                  <p className="text-ink-2 leading-relaxed">
                    余光可读极简提示与一键开发者透视视图；真实接入 16kHz 麦克风 PCM / Web Speech / 文本仿真。
                  </p>
                </div>
                <div className="p-3.5 bg-ground border border-line rounded space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-ink">
                    <ShieldCheck className="w-3.5 h-3.5 text-resolved" />
                    <span>场后 · 单点重练与可控记忆</span>
                  </div>
                  <p className="text-ink-2 leading-relaxed">
                    完整回溯时间线、V = H - λI 评分、针对薄弱片段单点重练，以及由用户确认方可写入的记忆面板。
                  </p>
                </div>
              </div>

              {presentationScenario.limitations && presentationScenario.limitations.length > 0 && (
                <div className="text-[11px] text-ink-3 bg-ground-2/60 border border-line rounded px-3.5 py-2.5 space-y-0.5">
                  <strong className="text-ink-2 font-medium block">实机能力边界说明：</strong>
                  {presentationScenario.limitations.map((lim) => (
                    <div key={lim} className="flex items-start gap-1.5">
                      <span>·</span>
                      <span>{lim}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Scenario Roadmap Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {roadmapScenarios.map((item) => (
              <div
                key={item.id}
                data-testid={`scenario-card-${item.id}`}
                className="border border-line bg-surface/65 rounded-md p-5 flex flex-col justify-between space-y-4 opacity-90"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-ink-2 uppercase">
                      {item.name}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      <Clock className="w-2.5 h-2.5" />
                      路线图规划中 · 暂未开放实机
                    </Badge>
                  </div>
                  <h3 className="text-base font-semibold text-ink">{item.displayName}</h3>
                  <p className="text-xs text-ink-2 leading-relaxed">{item.description}</p>
                </div>

                <div className="pt-3 border-t border-line/70 space-y-2">
                  {item.roadmapSummary && (
                    <p className="text-[11px] text-ink-3 leading-relaxed">{item.roadmapSummary}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {item.supportedInterventionLevels.map((lvl) => (
                      <span
                        key={lvl}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ground-2 text-ink-3"
                      >
                        {lvl}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ==================== RUNTIME STATUS STRIP ==================== */}
        <section className="border border-line bg-surface rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          <div className="flex items-start sm:items-center gap-3">
            <CheckCircle2 className={cn('w-4 h-4 shrink-0', health?.ok ? 'text-resolved' : 'text-amber')} />
            <div className="space-y-0.5">
              <span className="font-semibold text-ink block">
                {health?.ok
                  ? `后端认知运行时在线（${health.service} · v${health.version}）`
                  : '正在检测本地后端运行时状态（若未启动，请先启动 @cuex/server）'}
              </span>
              {health && (
                <span className="text-ink-3 block">
                  ASR 能力：{health.asr.detail} ｜ System 1：{health.system1.backend}（
                  {health.system1.mode === 'real' ? '真实模型' : '本地规则引擎'}）｜ System 2：
                  {health.system2.backend}（
                  {health.system2.mode === 'real' ? '真实模型' : '本地规则引擎'}）
                </span>
              )}
            </div>
          </div>

          <Button type="button" variant="quiet" size="sm" onClick={() => onNavigate('compiler')}>
            进入工作流
          </Button>
        </section>
      </main>
    </div>
  );
};
