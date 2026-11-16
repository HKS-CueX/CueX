import React, { useState } from 'react';
import {
  SCENARIO_CAPABILITY_DESCRIPTORS,
  type AuthSessionResponse,
  type HealthStatusResponse,
  type ScenarioCapabilityDescriptor,
} from '@cuex/protocol';
import { ArrowRight, CheckCircle2, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import type { ViewKey } from '@/components/layout/Navbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ASR_MODE_LABELS, COLAB_ASR_LIFECYCLE_LABELS } from '@/lib/format';
import { cn } from '@/lib/utils';

interface HomeViewProps {
  scenarios: ScenarioCapabilityDescriptor[];
  health: HealthStatusResponse | null;
  authSession?: AuthSessionResponse | null;
  onNavigate: (view: ViewKey) => void;
  onLoadDemoPack: () => Promise<void>;
  onOpenAccount?: () => void;
  loadingDemo: boolean;
}

type PreviewCueState = 'l0' | 'l1' | 'l2' | 'l3' | 'withdrawn';

const PREVIEW_STATES: Record<
  PreviewCueState,
  {
    label: string;
    badge: string;
    tone: 'secondary' | 'amber' | 'violet' | 'resolved';
    edgeLabel: string;
    spokenExcerpt: string;
    cueHeadline: string;
    detail: string;
    evidenceTag: string;
    verdictCode: string;
    utilityDelta: string;
    utilityNote: string;
  }
> = {
  l0: {
    label: 'L0 · 静默观察',
    badge: '默认静默',
    tone: 'secondary',
    edgeLabel: '边缘无光 · 保持零打扰',
    spokenExcerpt: '“我们把认知协同拆成快感知与实证检索两条异步流……”（停顿 1.8 秒换气）',
    cueHeadline: '表达连贯 · 保持零打扰',
    detail: '演讲者处于正常换气停顿且核心论点连贯，控制器维持 L0 静默，不弹出任何文字遮挡目光接触。',
    evidenceTag: '无需介入 · 保留注意力',
    verdictCode: 'stay_silent · pause_only_without_gap',
    utilityDelta: '0 打扰',
    utilityNote: '避免无效弹窗，守护 I = 0',
  },
  l1: {
    label: 'L1 · 边缘微光',
    badge: '极轻唤醒',
    tone: 'amber',
    edgeLabel: 'Amber 边缘微光唤醒',
    spokenExcerpt: '“传统的悬浮提词器在舞台上需要一直盯着逐字稿去念，所以观众体验不太好……”',
    cueHeadline: '边缘微光 · 提示切入核心对比',
    detail: '检测到章节偏离与核心量化点待覆盖，先在屏幕四周投射低饱和 Amber 边缘微光，不抢占中心视线。',
    evidenceTag: '章节 Ch.02 · 核心对比点',
    verdictCode: 'show_l1_edge · omission_risk',
    utilityDelta: '轻触达',
    utilityNote: '未出现文字干扰前给与方向提示',
  },
  l2: {
    label: 'L2 · 关键词胶囊',
    badge: '余光可读',
    tone: 'amber',
    edgeLabel: 'Amber 稳态边缘 · 2–6 字胶囊',
    spokenExcerpt: '“很多团队做语音助手只会堆大段答案，但我们衡量好坏的公式其实是那个……呃……”',
    cueHeadline: 'V = H - λI',
    detail: '在检测到实质性卡壳时，仅以超大字号吐出 2–6 字核心锚点关键词，余光一瞥即可接回主线。',
    evidenceTag: '已确认事实 #F-04 · 净效用公式',
    verdictCode: 'show_l2_keyword · hesitating',
    utilityDelta: '+1.0 H',
    utilityNote: '命中确认事实白名单并助推流畅接续',
  },
  l3: {
    label: 'L3 · 要点脚手架',
    badge: '问答兜底',
    tone: 'violet',
    edgeLabel: 'Violet 实证边缘 · 2–3 条短要点',
    spokenExcerpt: '评委提问：“如果云端大模型或远端识别突然超时，你们台上会直接卡死或胡编数字吗？”',
    cueHeadline: '降级与不编造底线',
    detail: '• 本地规则零 Token 实时接管（local_rule_zero）\n• 缺失资料显式标注「尚未准备」，绝不幻觉补全',
    evidenceTag: '已确认事实 #F-07 · 降级守卫策略',
    verdictCode: 'show_l3_scaffold · answering_question',
    utilityDelta: '+1.0 H',
    utilityNote: 'System 2 仅检索已锁定事实依据',
  },
  withdrawn: {
    label: '主动退出',
    badge: '自动撤回',
    tone: 'resolved',
    edgeLabel: 'Sage 呼吸消退 · 提示自动收回',
    spokenExcerpt: '“……没错，就是净效用公式 V = H - λI，其中 λ 专门惩罚多余的打断。”',
    cueHeadline: '已主动补全 → 提示撤回',
    detail: '当演讲者自行说出目标指标或切入下一章节，InterventionController 在 180ms 内平滑收回提示。',
    evidenceTag: 'Controller 主动退场',
    verdictCode: 'withdraw · user_recovered',
    utilityDelta: '+1 守正',
    utilityNote: '在不需要时自己消失',
  },
};

const PRICING_SUMMARY = [
  {
    id: 'free',
    name: 'Free 体验版',
    price: '¥0',
    cycle: '基础额度',
    status: 'Available' as const,
    summary: '个人场前编译、演示包体验与基础彩排闭环。',
  },
  {
    id: 'event',
    name: 'Event 单场冲刺',
    price: '¥29',
    cycle: '14 天单场有效',
    status: 'Available' as const,
    summary: '适合一次重要路演、毕业答辩或赛事决赛集中打磨。',
  },
  {
    id: 'pro',
    name: 'Pro 个人专业版',
    price: '¥59 / 月',
    cycle: '¥499 / 年',
    status: 'Available' as const,
    summary: '高频演讲者、完整单点重练与可控个人长期记忆。',
  },
  {
    id: 'team',
    name: 'Team 团队版',
    price: '¥199',
    cycle: '路线图规划中',
    status: 'Planned' as const,
    summary: '面向组织的多租户共享事实库与团队审计权限（尚未开放购买）。',
  },
];

export const HomeView: React.FC<HomeViewProps> = ({
  scenarios,
  health,
  authSession = null,
  onNavigate,
  onLoadDemoPack,
  onOpenAccount,
  loadingDemo,
}) => {
  const [previewState, setPreviewState] = useState<PreviewCueState>('l2');
  const effectiveScenarios =
    scenarios.length > 0 ? scenarios : [...SCENARIO_CAPABILITY_DESCRIPTORS];
  const presentationScenario =
    effectiveScenarios.find((s) => s.id === 'presentation') ?? effectiveScenarios[0];
  const roadmapScenarios = effectiveScenarios.filter((s) => s.id !== 'presentation');
  const activePreview = PREVIEW_STATES[previewState];

  const asrSummary = health
    ? `${ASR_MODE_LABELS[health.asr.mode]}${
        health.asr.lifecycleState
          ? `（${COLAB_ASR_LIFECYCLE_LABELS[health.asr.lifecycleState]}）`
          : ''
      }`
    : '等待检测';

  return (
    <div className="bg-ground text-ink">
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-16 space-y-20">
        {/* ==================== EDITORIAL JUMP INDEX ==================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-ground-2/80 rounded px-4 py-2.5 text-xs text-ink-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-ink">CueX 通用实时认知协同</span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span>持续理解 · 适时提示 · 最小必要干预 · 主动退出</span>
          </div>
          <nav aria-label="公开页章节索引" className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <a href="#how-it-works" className="hover:text-ink underline-offset-4 hover:underline">
              工作原理
            </a>
            <a href="#scenarios" className="hover:text-ink underline-offset-4 hover:underline">
              场景实机与路线图
            </a>
            <a href="#pricing" className="hover:text-ink underline-offset-4 hover:underline">
              方案与商业假设
            </a>
            <a href="#trust" className="hover:text-ink underline-offset-4 hover:underline">
              隐私与运行时边界
            </a>
          </nav>
        </div>

        {/* ==================== HERO: NARROW TALK, WIDE HEADLINE ==================== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left 40% Editorial Thesis & Primary Actions */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-3">
              <p className="text-xl sm:text-2xl font-semibold text-ink tracking-tight leading-snug">
                在深度思考之外，接住当下。
              </p>
              <p className="text-sm sm:text-base text-ink-2 leading-relaxed max-w-[46ch]">
                高压演讲、答辩与现场追问的难点，往往不是没有准备，而是大脑在毫秒级临场负荷下突然卡壳或偏题。
                <strong className="font-semibold text-ink"> CueX </strong>
                通过双层异步认知流与独立干预控制器，只在必要瞬间提供可验证提示，并在你找回节奏后主动退场。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
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
                <Sparkles className="w-4 h-4 text-amber shrink-0" />
                <span>{loadingDemo ? '正在载入演示包…' : '一键载入 CueX 路演演示包'}</span>
              </Button>
            </div>

            {/* Clean Vertical Editorial Ledger separated by surface steps */}
            <dl className="space-y-2 text-sm">
              <div className="rounded bg-surface px-4 py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4">
                <dt className="font-medium text-ink whitespace-nowrap">System 1 · 琥珀感知流</dt>
                <dd className="text-xs text-ink-2 sm:text-right">
                  持续追踪节奏、遗漏风险、偏题与现场提问
                </dd>
              </div>
              <div className="rounded bg-surface px-4 py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4">
                <dt className="font-medium text-ink whitespace-nowrap">System 2 · 紫晶实证流</dt>
                <dd className="text-xs text-ink-2 sm:text-right">
                  严格绑定 FactWhitelist 证据，绝不临场编造
                </dd>
              </div>
              <div className="rounded bg-ground-2 px-4 py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4">
                <dt className="font-semibold text-ink whitespace-nowrap num">
                  <code>V = H - λI</code>
                </dt>
                <dd className="text-xs text-ink-2 sm:text-right">
                  净效用评估：惩罚多余打扰（默认 <code>λ = 2</code>）
                </dd>
              </div>
            </dl>
          </div>

          {/* Right 60%: Display Headline + Interactive Cognitive Restraint Stage */}
          <div className="lg:col-span-7 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h1
                className="text-4xl sm:text-5xl xl:text-[62px] font-bold tracking-tight text-ink leading-[1.1] max-w-[14ch]"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                你的快思考外挂
              </h1>

              <div className="flex items-center gap-3 pb-1">
                <img
                  src="/brand/cuex-symbol-dimensional.svg"
                  alt="CueX 双层交汇标志"
                  width="36"
                  height="36"
                  className="w-9 h-9 object-contain shrink-0"
                />
                <div className="text-xs">
                  <code className="text-ink font-medium block whitespace-nowrap">
                    System 1 × System 2
                  </code>
                  <span className="text-ink-3 whitespace-nowrap">X · 面向高压即时场景</span>
                </div>
              </div>
            </div>

            {/* ONE LIVE THING: Interactive Cognitive-Restraint Stage (data-ui) */}
            <div
              data-ui="cognitive-restraint-stage"
              className="rounded-md bg-surface p-5 sm:p-6 space-y-5"
              aria-label="分级认知干预交互演示台"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                <div className="flex items-center gap-2 text-xs text-ink-2">
                  <span className="font-semibold text-ink whitespace-nowrap">分级干预实时状态机</span>
                  <span className="text-ink-3 hidden sm:inline" aria-hidden="true">
                    /
                  </span>
                  <span className="hidden sm:inline">点击切换层级与撤回状态</span>
                </div>
                <Badge variant="resolved">Presentation 实机已就绪</Badge>
              </div>

              {/* Level Switcher */}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="分级干预预览">
                {(Object.keys(PREVIEW_STATES) as PreviewCueState[]).map((key) => {
                  const selected = previewState === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPreviewState(key)}
                      aria-pressed={selected}
                      className={cn(
                        'px-2.5 min-h-[36px] sm:min-h-[32px] text-xs rounded whitespace-nowrap transition-transform duration-100 ease-out-custom active:scale-[0.97]',
                        selected
                          ? 'bg-ink text-ground font-medium'
                          : 'bg-ground-2 text-ink-2 hover:bg-ground-3 hover:text-ink'
                      )}
                    >
                      {PREVIEW_STATES[key].label}
                    </button>
                  );
                })}
              </div>

              {/* Live Stage Mockup Frame + Amber Metric Accent */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
                <div
                  className={cn(
                    'md:col-span-8 rounded p-4 sm:p-5 flex flex-col justify-between gap-4 transition-[background-color,border-color] duration-200 ease-out-custom',
                    previewState === 'l1' || previewState === 'l2'
                      ? 'bg-amber-tint/70'
                      : previewState === 'l3'
                        ? 'bg-violet-tint/70'
                        : previewState === 'withdrawn'
                          ? 'bg-resolved-tint/80'
                          : 'bg-ground-2'
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink-2">
                      {activePreview.edgeLabel}
                    </span>
                    <Badge variant={activePreview.tone}>{activePreview.badge}</Badge>
                  </div>

                  <div className="space-y-2.5">
                    <div className="text-xs text-ink-2 bg-surface/90 rounded px-3 py-2">
                      实时话语片段：{activePreview.spokenExcerpt}
                    </div>
                    <div className="pt-1">
                      <div
                        className={cn(
                          'font-bold tracking-tight text-ink',
                          previewState === 'l2' ? 'text-2xl sm:text-3xl num' : 'text-lg'
                        )}
                      >
                        {previewState === 'l2' ? (
                          <code>{activePreview.cueHeadline}</code>
                        ) : (
                          activePreview.cueHeadline
                        )}
                      </div>
                      <p className="text-xs text-ink-2 leading-relaxed whitespace-pre-line mt-1.5">
                        {activePreview.detail}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
                    <span className="text-ink-2 font-medium">{activePreview.evidenceTag}</span>
                    <code className="text-ink-3 text-xs">{activePreview.verdictCode}</code>
                  </div>
                </div>

                {/* Single Accent Metric Tile */}
                <div className="md:col-span-4 rounded bg-ground-2 p-4 flex flex-col justify-between gap-4">
                  <div className="space-y-1.5">
                    <span className="text-xs text-ink-3 block">控制器效用核算</span>
                    <div className="text-2xl font-bold text-amber-ink num">
                      {activePreview.utilityDelta}
                    </div>
                    <p className="text-xs text-ink-2 leading-relaxed">
                      {activePreview.utilityNote}
                    </p>
                  </div>

                  <div className="space-y-2 text-xs bg-surface rounded p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-ink-3">
                      <span className="whitespace-nowrap">核心公式</span>
                      <code className="text-ink font-semibold whitespace-nowrap num">V = H - λI</code>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-ink-3">
                      <span className="whitespace-nowrap">退场响应</span>
                      <span className="text-ink font-medium whitespace-nowrap num">&lt; 200ms</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== SECTION 1: HOW IT WORKS (RUN-IN COLUMN) ==================== */}
        <section id="how-it-works" className="pt-6 space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 space-y-3">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                为什么独立控制器才是护城河
              </h2>
              <p className="text-sm text-ink-2 leading-relaxed">
                提词器的问题不是字太小，而是在不需要时还在喋喋不休。CueX 强制规定 System 2 永远不能越过控制器直接弹窗。
              </p>
            </div>

            <div className="lg:col-span-8 space-y-3">
              <div className="rounded bg-surface p-5 grid grid-cols-1 sm:grid-cols-12 gap-3">
                <h3 className="sm:col-span-4 text-sm font-semibold text-ink">
                  多信号联合触发，不只看停顿
                </h3>
                <p className="sm:col-span-8 text-sm text-ink-2 leading-relaxed">
                  单纯按停顿秒数弹窗会产生大量误报。System 1 综合语流卡壳、章节偏离、关键点遗漏与现场提问四类信号联合判决，正常的换气停顿会被显式抑制（<code>pause_only_without_gap</code>）。
                </p>
              </div>
              <div className="rounded bg-surface p-5 grid grid-cols-1 sm:grid-cols-12 gap-3">
                <h3 className="sm:col-span-4 text-sm font-semibold text-ink">
                  严格事实白名单，绝不现场编造
                </h3>
                <p className="sm:col-span-8 text-sm text-ink-2 leading-relaxed">
                  每一条 L2/L3 提示必须携带已确认的 <code>evidenceIds</code>。遇到资料未覆盖的突发追问，系统宁可清晰提示「尚未准备」，也不生成似是而非的伪造数字。
                </p>
              </div>
              <div className="rounded bg-surface p-5 grid grid-cols-1 sm:grid-cols-12 gap-3">
                <h3 className="sm:col-span-4 text-sm font-semibold text-ink">
                  TTL、版本失效与主动撤回
                </h3>
                <p className="sm:col-span-8 text-sm text-ink-2 leading-relaxed">
                  所有候选提示都绑定 <code>contextVersion</code> 与有限 TTL。一旦演讲者切换章节、转移话题或自行补出核心论点，控制器立刻发出撤回指令并计入退场审计。
                </p>
              </div>
            </div>
          </div>

          {/* Three-Stage Workflow Ledger via surface steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded bg-surface p-5 sm:p-6 space-y-2">
              <span className="text-xs text-amber-ink font-semibold block">场前准备</span>
              <h3 className="text-base font-semibold text-ink">Context Compiler · 导播编译</h3>
              <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
                导入 <code>.pptx / .pdf / .md / .txt</code> 或讲稿笔记，输出一页式导播单、可锁定事实白名单与标明「AI 预测」的问答词卡。
              </p>
            </div>
            <div className="rounded bg-surface p-5 sm:p-6 space-y-2">
              <span className="text-xs text-violet-ink font-semibold block">场中协同</span>
              <h3 className="text-base font-semibold text-ink">Focus × Inspector · 协同双视角</h3>
              <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
                演讲者侧只保留余光可读的 L0–L3 极简提示与一键静默；开发者侧可透视 ASR、System 1/2 裁决与真实 Token 计量。
              </p>
            </div>
            <div className="rounded bg-surface p-5 sm:p-6 space-y-2">
              <span className="text-xs text-resolved font-semibold block">场后复盘</span>
              <h3 className="text-base font-semibold text-ink">Reflection &amp; Memory · 重练与沉淀</h3>
              <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
                基于会话日志核算净效用 <code>V = H - λI</code>，直接拉起薄弱片段单点重练，并在显式确认下更新长期记忆。
              </p>
            </div>
          </div>
        </section>

        {/* ==================== SECTION 2: SCENARIO MATRIX ==================== */}
        <section id="scenarios" className="pt-6 space-y-8" data-testid="scenario-matrix">
          <div className="space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              首个实机场景与通用扩展路线图
            </h2>
            <p className="text-sm text-ink-2 max-w-2xl">
              CueX 基于统一的 Scenario Adapter 抽象构建；当前实机全力打磨{' '}
              <strong className="font-semibold text-ink">CueX Presentation</strong>
              ，其余场景以规划态公开边界，不伪装成已上线功能。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Primary Live Scenario Sheet */}
            {presentationScenario && (
              <div
                className="lg:col-span-6 bg-surface rounded-md p-6 sm:p-7 space-y-5"
                data-testid="scenario-card-presentation"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="resolved">Available · 已实机上线</Badge>
                    <Badge variant="amber">Rehearsal &amp; Live 双模式</Badge>
                    <Badge variant="violet">L0–L3 分级介入</Badge>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-ink">
                    {presentationScenario.displayName}
                  </h3>
                  <p className="text-sm text-ink-2 leading-relaxed">
                    {presentationScenario.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <Button type="button" onClick={() => onNavigate('compiler')} className="gap-1.5">
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

                {presentationScenario.limitations && presentationScenario.limitations.length > 0 && (
                  <div className="text-xs text-ink-2 bg-ground-2 rounded px-4 py-3.5 space-y-1.5">
                    <strong className="text-ink font-semibold block">实机能力边界说明</strong>
                    {presentationScenario.limitations.map((lim) => (
                      <div key={lim} className="flex items-start gap-2">
                        <span className="text-ink-3" aria-hidden="true">
                          ·
                        </span>
                        <span>{lim}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Scenario Roadmap Index (Alternating Surface Steps) */}
            <div className="lg:col-span-6 bg-surface rounded-md p-2 sm:p-3 space-y-2">
              <div className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-ink">Universal X Adapter 规划清单</span>
                <span className="text-ink-3">公开路线图 · 暂未开放启动</span>
              </div>

              {roadmapScenarios.map((item, idx) => (
                <div
                  key={item.id}
                  data-testid={`scenario-card-${item.id}`}
                  aria-disabled="true"
                  className={cn(
                    'rounded p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3',
                    idx % 2 === 0 ? 'bg-ground-2/75' : 'bg-ground'
                  )}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">{item.displayName}</h3>
                      <Badge variant="secondary">Planned · 路线图规划中</Badge>
                    </div>
                    <p className="text-xs text-ink-2 leading-relaxed">{item.description}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                      <code>{item.name}</code>
                      <span aria-hidden="true">·</span>
                      <span>支持层级：{item.supportedInterventionLevels.join(' / ')}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    data-testid={`scenario-disabled-${item.id}`}
                    className="shrink-0 px-3 min-h-[36px] rounded bg-surface text-xs text-ink-3 cursor-not-allowed whitespace-nowrap"
                  >
                    暂未开放实机
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== SECTION 3: COMMERCIAL MODEL & PRICING ==================== */}
        <section id="pricing" className="pt-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                商业方案与计量透明原则
              </h2>
              <p className="text-sm text-ink-2 max-w-2xl">
                所有单价目前标定为商业假设（<code>isCommercialHypothesis</code>），控制台内仅触发沙盒试算预览，不连接真实商业扣费。
              </p>
            </div>
            {onOpenAccount && (
              <Button type="button" variant="quiet" size="sm" onClick={onOpenAccount}>
                打开套餐与沙盒预览控制台
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING_SUMMARY.map((tier) => (
              <div
                key={tier.id}
                className={cn(
                  'rounded-md p-5 flex flex-col justify-between gap-4',
                  tier.status === 'Planned' ? 'bg-ground-2' : 'bg-surface'
                )}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{tier.name}</span>
                    <Badge variant={tier.status === 'Planned' ? 'secondary' : 'amber'}>
                      {tier.status}
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-ink num">{tier.price}</span>
                    <span className="text-xs text-ink-3 num">{tier.cycle}</span>
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed">{tier.summary}</p>
                </div>
                <span className="text-xs text-ink-3">
                  {tier.status === 'Planned' ? '尚未开放购买' : '支持沙盒结算预览'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ==================== SECTION 4: TRUST, PRIVACY & LIVE HEALTH ==================== */}
        <section id="trust" className="pt-6 space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              隐私主权、实机边界与常见问题
            </h2>
            <p className="text-sm text-ink-2">
              不把文本仿真伪装成实时麦克风，不把降级规则伪装成真实大模型推理，不未经许可保存个人记忆。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md bg-surface p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Lock className="w-4 h-4 text-amber-ink shrink-0" />
                <span>麦克风采集何时开始？原始音频会落盘吗？</span>
              </div>
              <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
                仅在你在场前编译页明确勾选隐私知情同意并在场中开启采集后，才读取 16 kHz PCM 音频帧；Colab GPU 流式 ASR 服务端同样遵循零音频文件落盘策略。
              </p>
            </div>
            <div className="rounded-md bg-surface p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShieldCheck className="w-4 h-4 text-violet-ink shrink-0" />
                <span>模型用量和本地规则降级如何区分展示？</span>
              </div>
              <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
                Inspector 面板严格区分 <code>provider_reported</code>（实报用量）、<code>provider_unreported</code>（外部供应商未回传用量）与 <code>local_rule_zero</code>（本地规则 0 Token 兜底），绝不捏造虚假数字。
              </p>
            </div>
          </div>

          {/* Live Runtime & Identity Status Strip */}
          <div className="rounded-md bg-surface p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <CheckCircle2
                className={cn(
                  'w-4 h-4 shrink-0 mt-0.5 sm:mt-0',
                  health?.ok ? 'text-resolved' : 'text-amber-ink'
                )}
              />
              <div className="space-y-1 min-w-0">
                <span className="font-semibold text-ink block text-sm">
                  {health?.ok
                    ? `后端认知运行时在线（${health.service} · v${health.version}）`
                    : '正在检测本地后端运行时状态（若未启动，请先启动 @cuex/server）'}
                </span>
                {health && (
                  <span className="text-ink-2 block leading-relaxed">
                    ASR：{asrSummary}
                    {health.asr.modelId ? `（${health.asr.modelId}）` : ''} ｜ System 1（快思考）：
                    {health.system1.model ?? health.system1.backend}
                    {health.system1.promptFormat ? ` · ${health.system1.promptFormat}` : ''}（
                    {health.system1.fallbackActive || health.system1.degraded
                      ? '已降级本地规则'
                      : health.system1.mode === 'real'
                        ? '真实模型'
                        : '本地规则引擎'}
                    ）｜ System 2（慢思考）：{health.system2.model ?? health.system2.backend}
                    {health.system2.reasoningEffort ? ` · effort=${health.system2.reasoningEffort}` : ''}（
                    {health.system2.fallbackActive || health.system2.degraded
                      ? '已降级本地规则'
                      : health.system2.mode === 'real'
                        ? '真实模型'
                        : '本地规则引擎'}
                    ）
                  </span>
                )}
                {authSession && (
                  <span className="text-ink-2 block" data-testid="home-auth-strip">
                    当前身份：{authSession.user.displayName}（租户 {authSession.user.tenantId}）· 方案{' '}
                    <code className="uppercase">{authSession.usageSummary.activePlanId}</code>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onOpenAccount && (
                <Button type="button" variant="quiet" size="sm" onClick={onOpenAccount}>
                  账户与套餐
                </Button>
              )}
              <Button type="button" variant="quiet" size="sm" onClick={() => onNavigate('compiler')}>
                进入工作流
              </Button>
            </div>
          </div>
        </section>

        {/* ==================== SECTION 5: INVERTED CLOSURE CTA BAND ==================== */}
        <section className="rounded-md bg-ink text-ground p-7 sm:p-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <img
              src="/brand/cuex-wordmark-light.svg"
              alt="CueX"
              width="76"
              height="34"
              className="h-8 w-auto block"
            />
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight text-ground"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              在深度思考之外，接住当下。
            </h2>
            <p className="text-sm text-ground/80 leading-relaxed">
              现在就可以导入自己的讲稿，或一键载入 CueX 路演示例包，亲自检验 L0–L3 最小必要干预与自动撤回体验。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              type="button"
              size="lg"
              onClick={() => onNavigate('compiler')}
              className="bg-ground text-ink hover:bg-ground-2"
            >
              <span>开始场前编译</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              size="lg"
              variant="quiet"
              disabled={loadingDemo}
              onClick={() => void onLoadDemoPack()}
              className="bg-transparent border-ground/35 text-ground hover:bg-ground/10"
            >
              <span>{loadingDemo ? '载入中…' : '体验演示包'}</span>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
};
