import React, { useState } from 'react';
import {
  SCENARIO_CAPABILITY_DESCRIPTORS,
  type AuthSessionResponse,
  type HealthStatusResponse,
  type ScenarioCapabilityDescriptor,
} from '@cuex/protocol';
import { ArrowRight, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import type { ViewKey } from '@/components/layout/Navbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

type PreviewCueState = 'quiet' | 'edge' | 'keyword' | 'qa' | 'withdrawn';

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
    sourceTag: string;
    presenterFeelingTitle: string;
    presenterFeelingNote: string;
  }
> = {
  quiet: {
    label: '顺畅表达',
    badge: '默认安静',
    tone: 'secondary',
    edgeLabel: '屏幕保持留白',
    spokenExcerpt: '“这一部分我们来看核心实验对比结果……”（自然停顿换气 1.8 秒）',
    cueHeadline: '安静倾听，零弹窗打扰',
    detail: '正常换气或思考停顿不会误触发任何文字弹窗，让你始终把眼神留在台下观众与评委身上。',
    sourceTag: '第 2 章 进度正常',
    presenterFeelingTitle: '不抢注意力',
    presenterFeelingNote: '顺畅讲演时像不存在一样安静，绝不用满屏文字打乱你的节奏。',
  },
  edge: {
    label: '边缘微光',
    badge: '轻柔提醒',
    tone: 'amber',
    edgeLabel: '屏幕四周亮起柔和微光',
    spokenExcerpt: '“刚才聊了不少背景故事，其实最初做这个课题的时候也走了弯路……”',
    cueHeadline: '轻柔提示切回本章主线',
    detail: '察觉到话题渐渐偏离且本章还有关键结论未讲时，先用柔和边缘微光轻拍提醒，不打断你正在说的句子。',
    sourceTag: '第 2 章 还有 1 个关键结论待讲',
    presenterFeelingTitle: '余光即可感知',
    presenterFeelingNote: '不用低头找字，余光感受到微光就能自然收束话题。',
  },
  keyword: {
    label: '关键词提词',
    badge: '一眼可读',
    tone: 'amber',
    edgeLabel: '大字号短词锚点',
    spokenExcerpt: '“相比传统方案，我们在真实样本上的平均响应速度提升了……呃……”',
    cueHeadline: '响应速度提升 3.4 倍',
    detail: '真正卡壳忘词的那一秒，直接浮现简短清晰的核心词或关键数字，扫一眼就能顺畅接上。',
    sourceTag: '来自你核对过的关键数据',
    presenterFeelingTitle: '0.5 秒接上话',
    presenterFeelingNote: '只给最关键的几个字，省去在长篇逐字稿里来回找位置的时间。',
  },
  qa: {
    label: '追问托底',
    badge: '数据核对',
    tone: 'violet',
    edgeLabel: '现场问答要点卡片',
    spokenExcerpt: '评委提问：“如果现场网络不稳定，或者问到讲稿里没有的数据怎么办？”',
    cueHeadline: '离线可用，缺省数据坦诚说明',
    detail: '• 断网或弱网时自动切换浏览器本地识别继续陪伴\n• 遇到材料里没有的数字，直接提醒暂无记录，避免临场说错',
    sourceTag: '已匹配讲稿问答准备卡',
    presenterFeelingTitle: '追问心里有底',
    presenterFeelingNote: '所有提示数字都严格出自你的讲稿，绝不临场给你塞入未经核实的答案。',
  },
  withdrawn: {
    label: '接回即退',
    badge: '自动收起',
    tone: 'resolved',
    edgeLabel: '提示悄然淡出',
    spokenExcerpt: '“……对，实测平均响应速度提升了 3.4 倍，接下来看具体案例。”',
    cueHeadline: '你一接上话，提示立刻收起',
    detail: '一旦你自然补上了要点或翻入下一章，屏幕上的提示会自动淡出，重新回到干净清爽的状态。',
    sourceTag: '已自动回到安静倾听',
    presenterFeelingTitle: '招之即来挥之即去',
    presenterFeelingNote: '不需要腾出手去关弹窗，把舞台节奏完全交还给你自己。',
  },
};

const PRICING_SUMMARY = [
  {
    id: 'free',
    name: '免费体验版',
    price: '¥0',
    cycle: '每月 2 场完整体验',
    status: 'Available' as const,
    summary: '支持讲稿导入、关键数据整理、台上余光提词与场后单点重练。',
  },
  {
    id: 'event',
    name: '单场冲刺包',
    price: '¥29',
    cycle: '14 天有效',
    status: 'Available' as const,
    summary: '适合一次重要毕业答辩、融资路演或比赛决赛，集中彩排与上台无需包月。',
  },
  {
    id: 'pro',
    name: '个人专业版',
    price: '¥59 / 月',
    cycle: '年付 ¥499',
    status: 'Available' as const,
    summary: '适合高频演讲者、讲师与顾问，不限场次备稿并跨场保存个人表达偏好。',
  },
  {
    id: 'team',
    name: '团队协作版',
    price: '¥199 / 席',
    cycle: '即将推出',
    status: 'Planned' as const,
    summary: '面向企业与团队共享产品口径库、常见客户追问卡与对外表达边界。',
  },
];

export const HomeView: React.FC<HomeViewProps> = ({
  scenarios,
  onNavigate,
  onLoadDemoPack,
  onOpenAccount,
  loadingDemo,
}) => {
  const [previewState, setPreviewState] = useState<PreviewCueState>('keyword');
  const effectiveScenarios =
    scenarios.length > 0 ? scenarios : [...SCENARIO_CAPABILITY_DESCRIPTORS];
  const presentationScenario =
    effectiveScenarios.find((s) => s.id === 'presentation') ?? effectiveScenarios[0];
  const roadmapScenarios = effectiveScenarios.filter((s) => s.id !== 'presentation');
  const activePreview = PREVIEW_STATES[previewState];

  return (
    <div className="bg-ground text-ink">
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-16 space-y-20">
        {/* ==================== TOP JUMP BAR ==================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-ground-2/80 rounded px-4 py-2.5 text-xs text-ink-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-ink">CueX Presentation</span>
            <span>顺畅时安静倾听，卡顿与追问时恰到好处地托底</span>
          </div>
          <nav aria-label="页面章节导航" className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <a href="#how-it-works" className="hover:text-ink underline-offset-4 hover:underline">
              三步上手
            </a>
            <a href="#scenarios" className="hover:text-ink underline-offset-4 hover:underline">
              场景拓展
            </a>
            <a href="#pricing" className="hover:text-ink underline-offset-4 hover:underline">
              会员方案
            </a>
            <a href="#trust" className="hover:text-ink underline-offset-4 hover:underline">
              隐私保障
            </a>
          </nav>
        </div>

        {/* ==================== HERO ==================== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left 40%: Value Proposition & Primary Actions */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-3">
              <p className="text-xl sm:text-2xl font-semibold text-ink tracking-tight leading-snug">
                在深度思考之外，接住当下。
              </p>
              <p className="text-sm sm:text-base text-ink-2 leading-relaxed max-w-[46ch]">
                真正站上路演台或答辩席的那十几分钟，最怕的不是没准备，而是紧张卡壳、漏掉核心结论，或被突发追问打乱节奏。
                <strong className="font-semibold text-ink"> CueX </strong>
                在你顺畅表达时保持安静，只在需要的那一秒递上一眼可读的简短提示，并在你接上话后悄然收起。
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
                <span>准备我的讲稿</span>
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
                <span>{loadingDemo ? '正在加载示例…' : '试试示例讲稿'}</span>
              </Button>
            </div>

            {/* Clean Consumer Benefit List */}
            <dl className="space-y-2 text-sm">
              <div className="rounded bg-surface px-4 py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4">
                <dt className="font-medium text-ink whitespace-nowrap">顺畅时不打断</dt>
                <dd className="text-xs text-ink-2 sm:text-right">
                  正常换气停顿不乱弹窗，把眼神留给现场观众
                </dd>
              </div>
              <div className="rounded bg-surface px-4 py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4">
                <dt className="font-medium text-ink whitespace-nowrap">余光一瞥即接上</dt>
                <dd className="text-xs text-ink-2 sm:text-right">
                  只给简短关键词锚点，开口回到主线立刻自动收起
                </dd>
              </div>
              <div className="rounded bg-ground-2 px-4 py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4">
                <dt className="font-semibold text-ink whitespace-nowrap">只引用你的材料</dt>
                <dd className="text-xs text-ink-2 sm:text-right">
                  严格依据你核对过的数据提词，超纲提问绝不瞎编
                </dd>
              </div>
            </dl>
          </div>

          {/* Right 60%: Headline + Interactive Stage Experience */}
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
                  alt="CueX 标志"
                  width="36"
                  height="36"
                  className="w-9 h-9 object-contain shrink-0"
                />
                <div className="text-xs">
                  <span className="text-ink font-medium block whitespace-nowrap">
                    演讲与答辩临场搭档
                  </span>
                  <span className="text-ink-3 whitespace-nowrap">支持主屏幻灯片 + 副窗提词</span>
                </div>
              </div>
            </div>

            {/* Interactive Stage Preview */}
            <div
              data-ui="cognitive-restraint-stage"
              className="rounded-md bg-surface p-5 sm:p-6 space-y-5"
              aria-label="台上提词体验预览"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                <div className="flex items-center gap-2 text-xs text-ink-2">
                  <span className="font-semibold text-ink whitespace-nowrap">台上真实反应预览</span>
                  <span className="text-ink-3 hidden sm:inline">点击不同临场瞬间查看画面变化</span>
                </div>
                <Badge variant="resolved">CueX Presentation</Badge>
              </div>

              {/* Moment Switcher */}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="切换临场时刻">
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

              {/* Live Stage Mockup Frame */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
                <div
                  className={cn(
                    'md:col-span-8 rounded p-4 sm:p-5 flex flex-col justify-between gap-4 transition-[background-color,border-color] duration-200 ease-out-custom',
                    previewState === 'edge' || previewState === 'keyword'
                      ? 'bg-amber-tint/70'
                      : previewState === 'qa'
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
                      现场原声：{activePreview.spokenExcerpt}
                    </div>
                    <div className="pt-1">
                      <div
                        className={cn(
                          'font-bold tracking-tight text-ink',
                          previewState === 'keyword' ? 'text-2xl sm:text-3xl num' : 'text-lg'
                        )}
                      >
                        {activePreview.cueHeadline}
                      </div>
                      <p className="text-xs text-ink-2 leading-relaxed whitespace-pre-line mt-1.5">
                        {activePreview.detail}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
                    <span className="text-ink-2 font-medium">{activePreview.sourceTag}</span>
                  </div>
                </div>

                {/* Presenter Experience Card */}
                <div className="md:col-span-4 rounded bg-ground-2 p-4 flex flex-col justify-between gap-4">
                  <div className="space-y-1.5">
                    <span className="text-xs text-ink-3 block">讲者直观感受</span>
                    <div className="text-xl font-bold text-amber-ink">
                      {activePreview.presenterFeelingTitle}
                    </div>
                    <p className="text-xs text-ink-2 leading-relaxed">
                      {activePreview.presenterFeelingNote}
                    </p>
                  </div>

                  <div className="space-y-2 text-xs bg-surface rounded p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-ink-3">
                      <span className="whitespace-nowrap">默认画面</span>
                      <span className="text-ink font-semibold whitespace-nowrap">零字留白</span>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-ink-3">
                      <span className="whitespace-nowrap">收起速度</span>
                      <span className="text-ink font-medium whitespace-nowrap num">接上即退</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== SECTION 1: HOW IT WORKS ==================== */}
        <section id="how-it-works" className="pt-6 space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 space-y-3">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                为什么台上敢放心开着它
              </h2>
              <p className="text-sm text-ink-2 leading-relaxed">
                传统提词器一遇打断提问就卡住，聊天机器人一开口又铺满整屏长文。CueX 专门为不能低头读屏的真实现场而设计。
              </p>
            </div>

            <div className="lg:col-span-8 space-y-3">
              <div className="rounded bg-surface p-5 grid grid-cols-1 sm:grid-cols-12 gap-3">
                <h3 className="sm:col-span-4 text-sm font-semibold text-ink">
                  听得懂正常停顿，不瞎凑热闹
                </h3>
                <p className="sm:col-span-8 text-sm text-ink-2 leading-relaxed">
                  演讲中留白换气、强调语气都很常见。CueX 会结合整章内容是否讲完、话题是否跑偏来综合判断，不会因为停顿两秒就乱弹提示打断你。
                </p>
              </div>
              <div className="rounded bg-surface p-5 grid grid-cols-1 sm:grid-cols-12 gap-3">
                <h3 className="sm:col-span-4 text-sm font-semibold text-ink">
                  关键数字提前锁定，绝不临场胡编
                </h3>
                <p className="sm:col-span-8 text-sm text-ink-2 leading-relaxed">
                  上台前你可以核对并锁定核心指标与业务数据。遇到评委问及材料之外的问题，画面会直接提醒你材料未包含该项，把诚实作答的主动权交还给你。
                </p>
              </div>
              <div className="rounded bg-surface p-5 grid grid-cols-1 sm:grid-cols-12 gap-3">
                <h3 className="sm:col-span-4 text-sm font-semibold text-ink">
                  独立提词小窗，全屏放 PPT 也能看
                </h3>
                <p className="sm:col-span-8 text-sm text-ink-2 leading-relaxed">
                  在主屏幕放映幻灯片时，可以一键打开轻巧的独立提词小窗放在副屏或演讲者视图旁，实时同步计时与关键词，不重复开麦也不怕误触。
                </p>
              </div>
            </div>
          </div>

          {/* Three-Step Workflow */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded bg-surface p-5 sm:p-6 space-y-2">
              <span className="text-xs text-amber-ink font-semibold block">第一步</span>
              <h3 className="text-base font-semibold text-ink">准备讲稿与关键数据</h3>
              <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
                导入 PPT、PDF 或讲稿大纲，自动梳理出各章时间预算、关键数据卡片与可能被追问的问题。
              </p>
            </div>
            <div className="rounded bg-surface p-5 sm:p-6 space-y-2">
              <span className="text-xs text-violet-ink font-semibold block">第二步</span>
              <h3 className="text-base font-semibold text-ink">彩排或正式上台陪伴</h3>
              <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
                开启麦克风自然开讲，顺畅时零干扰，卡顿或遇到追问时余光一瞥即可接上，接回主线自动收起。
              </p>
            </div>
            <div className="rounded bg-surface p-5 sm:p-6 space-y-2">
              <span className="text-xs text-resolved font-semibold block">第三步</span>
              <h3 className="text-base font-semibold text-ink">复盘薄弱点单点重练</h3>
              <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
                讲完立刻看清漏讲要点、超时章节与待补强的追问，点一下就能针对那一段单独重练到熟练为止。
              </p>
            </div>
          </div>
        </section>

        {/* ==================== SECTION 2: LARGER VISION & SCENARIOS ==================== */}
        <section id="scenarios" className="pt-6 space-y-8" data-testid="scenario-matrix">
          <div className="space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              从一场演讲出发，陪伴每一次关键表达
            </h2>
            <p className="text-sm text-ink-2 max-w-2xl">
              <strong className="font-semibold text-ink">CueX Presentation</strong>{' '}
              是我们面向个人演讲与答辩打造的首款产品；同一套低打扰临场辅助体验，正逐步拓展到商务沟通、课堂讲授等更多高压对话场景。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Primary Live Product Card */}
            {presentationScenario && (
              <div
                className="lg:col-span-6 bg-surface rounded-md p-6 sm:p-7 space-y-5"
                data-testid="scenario-card-presentation"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="resolved">立即可用</Badge>
                    <Badge variant="amber">支持彩排与正式上台</Badge>
                    <Badge variant="violet">支持双屏提词小窗</Badge>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-ink">
                    {presentationScenario.displayName}
                  </h3>
                  <p className="text-sm text-ink-2 leading-relaxed">
                    {presentationScenario.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-ink-2 bg-ground-2/70 rounded p-4">
                  <div>• 支持 PPTX / PDF / Markdown 导入</div>
                  <div>• 关键数字核对与防误改保护</div>
                  <div>• 现场提问即时匹配讲稿依据</div>
                  <div>• 薄弱片段一键单点重练</div>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <Button type="button" onClick={() => onNavigate('compiler')} className="gap-1.5">
                    <span>立即准备讲稿</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => void onLoadDemoPack()}
                    disabled={loadingDemo}
                  >
                    <span>试试示例讲稿</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Upcoming Product Vision Matrix */}
            <div className="lg:col-span-6 bg-surface rounded-md p-3 sm:p-4 space-y-2.5">
              <div className="px-2 py-1.5 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-ink">正在拓展的更多沟通场景</span>
                <span className="text-ink-3">产品演进版图</span>
              </div>

              {roadmapScenarios.map((item, idx) => (
                <div
                  key={item.id}
                  data-testid={`scenario-card-${item.id}`}
                  className={cn(
                    'rounded p-4 space-y-1.5',
                    idx % 2 === 0 ? 'bg-ground-2/75' : 'bg-ground'
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">{item.displayName}</h3>
                    <Badge variant="secondary">即将推出</Badge>
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== SECTION 3: PRICING ==================== */}
        <section id="pricing" className="pt-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                灵活方案，贴合不同上台频率
              </h2>
              <p className="text-sm text-ink-2 max-w-2xl">
                无论是准备一年一度的毕业答辩，还是高频参与项目路演与方案汇报，都可以按实际节奏选择合适方案。
              </p>
            </div>
            {onOpenAccount && (
              <Button type="button" variant="quiet" size="sm" onClick={onOpenAccount}>
                查看我的方案与额度
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
                      {tier.status === 'Planned' ? '即将推出' : '开放体验'}
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-ink num">{tier.price}</span>
                    <span className="text-xs text-ink-3 num">{tier.cycle}</span>
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed">{tier.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ==================== SECTION 4: TRUST & PRIVACY ==================== */}
        <section id="trust" className="pt-6 space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              安心上台，数据始终由你掌控
            </h2>
            <p className="text-sm text-ink-2">
              你的讲稿、现场语音与个人表达习惯都只服务于你自己的每一次上台。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-md bg-surface p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Lock className="w-4 h-4 text-amber-ink shrink-0" />
                <span>什么时候会开启麦克风？录音会被保存吗？</span>
              </div>
              <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
                只有在你进入上台演讲并开启收音时才会实时识别语流，平时后台绝不静默监听；原始音频不落盘保存，讲完后可随时一键清空当场记录。
              </p>
            </div>
            <div className="rounded-md bg-surface p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShieldCheck className="w-4 h-4 text-violet-ink shrink-0" />
                <span>个人偏好与讲稿资料如何管理？</span>
              </div>
              <p className="text-xs sm:text-sm text-ink-2 leading-relaxed">
                复盘总结出的个人表达习惯需经你点击确认后才会保存，方便下一场演讲沿用；你随时可以在个人中心导出全部复盘记录或彻底删除。
              </p>
            </div>
          </div>
        </section>

        {/* ==================== SECTION 5: CLOSURE CTA BAND ==================== */}
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
              下一场重要演讲，带一个懂分寸的搭档上台。
            </h2>
            <p className="text-sm text-ground/80 leading-relaxed">
              现在导入你的幻灯片或讲稿，或者用内置路演示例花一分钟感受余光提词与自动收起体验。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              type="button"
              size="lg"
              onClick={() => onNavigate('compiler')}
              className="bg-ground text-ink hover:bg-ground-2"
            >
              <span>准备我的讲稿</span>
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
              <span>{loadingDemo ? '加载中…' : '试试示例讲稿'}</span>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
};
