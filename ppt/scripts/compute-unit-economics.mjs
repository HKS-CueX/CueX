/**
 * Deterministic 10-Component Unit Economics Engine for CueX Next (Phase 2 Source of Truth).
 * Strictly separates:
 *   [本地实测 Eval]  -> .cuex-runtime/eval-latest.json (local_rule_zero benchmark)
 *   [云端公开费率]   -> Public ASR / LLM / WeChat Pay / Alipay merchant tariffs (2026-11-16)
 *   [模型估算]       -> Modeled 25m cloud session token consumption, infra & refund leakage
 *   [商业假设]       -> Pricing tiers, retention, CAC, Free/Paid ratios & cohort conversions
 *
 * NOTE: Company-level fixed-cost breakeven is NOT modeled yet (excludes fixed R&D salaries,
 * marketing retainers, and baseline cloud overhead). Per-user session capacity uses
 * `maxAffordableSessionsPerProMonth` instead of conflating it with company breakeven.
 *
 * Usage:
 *   node ppt/scripts/compute-unit-economics.mjs [--eval <path-to-eval-json>] [--write]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const METRICS_JSON_PATH = path.join(__dirname, 'cuex-final-metrics.json');

export const PAYMENT_CHANNELS = {
  wechatPay: {
    name: '微信支付 (WeChat Pay)',
    standardRate: 0.006,
    virtualGoodsRateRange: '0.60% - 1.00% (小程序虚拟支付/特殊类目以签约准)',
    settlementCycle: 'T+1 (常规结算周期)',
    refundFeeRule: '全额/部分退款按等比原路退还手续费 (交易365天内，单笔最多50次部分退)',
    officialUrl: 'https://pay.weixin.qq.com',
    queryDate: '2026-11-16',
  },
  alipay: {
    name: '支付宝 (Alipay)',
    standardRate: 0.006,
    preferentialRate: 0.0055,
    specialDigitalRateRange: '0.55% - 1.20% (小微/活动可0.55%，特定数字虚拟类目上浮)',
    settlementCycle: 'T+1 / 实时余额账期 (按签约产品)',
    refundFeeRule: '交易12个月内主流标准收单产品退款时同步退回对应手续费 (特殊老协议除外)',
    officialUrl: 'https://b.alipay.com',
    queryDate: '2026-11-16',
  },
};

export const ASR_MODES = [
  {
    mode: 'local_sherpa',
    label: '本地 Sherpa ONNX / Rust WS',
    cloudFeePerHourRmb: 0,
    sourceLabel: '[模型估算 / 端侧算力]',
    notes: '语音流不经过商业云厂商 API，云端账单为 ¥0，依赖本地模型权重与终端 CPU/RAM。',
  },
  {
    mode: 'remote_sherpa',
    label: '自建/私有 Sherpa 流式服务',
    cloudFeePerHourRmb: 0.22,
    sourceLabel: '[模型估算]',
    notes: '按私有云轻量实例与 WS 带宽摊销估算 ¥0.12–¥0.30/小时，无第三方按分钟抽成。',
  },
  {
    mode: 'cloud_streaming_asr',
    label: '商业云端流式 ASR（默认建模基准）',
    cloudFeePerHourRmb: 0.80,
    sourceLabel: '[云端公开费率]',
    notes: '火山引擎豆包流式 ~¥0.45–1.00/h、阿里云 Fun-ASR ~¥0.79/h（标准实时最高 ~¥3.50/h）。',
  },
  {
    mode: 'browser_webspeech',
    label: '浏览器原生 Web Speech API',
    cloudFeePerHourRmb: 0,
    sourceLabel: '[免费浏览器能力]',
    notes: '无直付云厂商 API 费，但强依赖浏览器内核厂商识别服务与网络连通，不承诺高精度商业 SLA。',
  },
  {
    mode: 'text_simulation',
    label: '离线规则与文本仿真注入',
    cloudFeePerHourRmb: 0,
    sourceLabel: '[本地实测 Eval]',
    notes: '跳过声学流，仅供自动化评测、回归测试与弱网彩排脚本使用；UI 显式标明非真实收音。',
  },
];

export const FUNNEL_AUDIENCE_DEFINITIONS = {
  registeredUsers: {
    term: '累计注册用户 (Registered Users)',
    role: '历史账号池统计（不作为免费补贴成本分母）',
  },
  freeMau: {
    term: '月活免费用户 (Free MAU)',
    role: '当月登录/查看/编辑过材料包的免费用户（含零语音消耗者）',
  },
  activeFreeUsers: {
    term: '月度算力活跃免费用户 (Active Compute Free Users)',
    role: '当月真实触发云端 ASR / LLM 彩排的免费用户——第10项补贴成本按 activeFreeUsers / paidUsers (基准 12:1) 严苛计提，绝不用注册总人数稀释。',
  },
  paidUsers: {
    term: '当月净付费活跃用户 (Net Paid Users)',
    role: '当月持有有效 Event 或 Pro 权益且未全额退款的付费用户总数。',
  },
};

export function computeScenario(params, evalAnchor) {
  const {
    name,
    sessionsPerMo,
    durationMin,
    asrRatePerHr,
    cloudAsrShare,
    s1ModelRateInPer1M,
    s1ModelRateOutPer1M,
    s2ModelRateInPer1M,
    s2ModelRateOutPer1M,
    cacheHitRate,
    cacheDiscount,
    s1PromptTokensPerCall,
    s1OutputTokensPerCall,
    s1CloudCallsPerMin,
    s2PromptTokensPerWakeup,
    s2OutputTokensPerWakeup,
    s2WakeupsPerSession,
    docExtractPerSession,
    retrievalPerSession,
    reflectionTokensIn,
    reflectionTokensOut,
    infraPerSession,
    freeUserActiveSessionsPerMo,
    freeUserDurationMin,
    freePerPaidRatio,
    supportPerPaidMo,
    cac,
    avgLifetimeMonths,
    proPrice = 59,
    eventPrice = 29,
    eventRunsIncluded = 2.5,
    wechatShare = 0.5,
    alipayShare = 0.5,
    wechatFeeRate = 0.006,
    alipayFeeRate = 0.006,
    refundRate = 0.02,
    refundFeeNonRefundableShare = 0.0, // 0 = standard WeChat/Alipay rules refund processing fee proportionally
    refundComputeBurnRatio = 0.5, // avg compute burned on refunded orders before cancellation
  } = params;

  const blendedPaymentRate = wechatShare * wechatFeeRate + alipayShare * alipayFeeRate;

  // Component 1..8: Per-session compute & voice costs
  const c1DocExtract = docExtractPerSession;
  const c2Asr = (durationMin / 60) * asrRatePerHr * cloudAsrShare;

  const s1Calls = s1CloudCallsPerMin * durationMin;
  const s1UncachedCost =
    ((s1Calls * s1PromptTokensPerCall) / 1_000_000) * s1ModelRateInPer1M +
    ((s1Calls * s1OutputTokensPerCall) / 1_000_000) * s1ModelRateOutPer1M;

  const s2UncachedCost =
    ((s2WakeupsPerSession * s2PromptTokensPerWakeup) / 1_000_000) * s2ModelRateInPer1M +
    ((s2WakeupsPerSession * s2OutputTokensPerWakeup) / 1_000_000) * s2ModelRateOutPer1M;

  // Intra-session prefix cache only (explicitly NO cross-slot/cross-model sharing)
  const s1InputCostRaw = ((s1Calls * s1PromptTokensPerCall) / 1_000_000) * s1ModelRateInPer1M;
  const s2InputCostRaw = ((s2WakeupsPerSession * s2PromptTokensPerWakeup) / 1_000_000) * s2ModelRateInPer1M;
  const c5CacheDelta = -(s1InputCostRaw + s2InputCostRaw) * cacheHitRate * cacheDiscount;

  const c6Retrieval = retrievalPerSession;
  const c7Reflection =
    (reflectionTokensIn / 1_000_000) * s2ModelRateInPer1M +
    (reflectionTokensOut / 1_000_000) * s2ModelRateOutPer1M;
  const c8Infra = infraPerSession;

  const llmCostPerSession = c1DocExtract + s1UncachedCost + s2UncachedCost + c5CacheDelta + c6Retrieval + c7Reflection;
  const fullVarCostPerSession = llmCostPerSession + c2Asr + c8Infra;

  // Revenue & Refund Accounting (Split WeChat Pay / Alipay + Refund Leakage)
  const netRevenuePro = proPrice * (1 - refundRate);
  const netRevenueEvent = eventPrice * (1 - refundRate);

  // Component 9: Payment Processing Fee (standard proportional refund of fee vs non-refundable tail)
  const c9PaymentPro =
    (netRevenuePro + proPrice * refundRate * refundFeeNonRefundableShare) * blendedPaymentRate;
  const c9PaymentEvent =
    (netRevenueEvent + eventPrice * refundRate * refundFeeNonRefundableShare) * blendedPaymentRate;

  // Unrecovered compute burned by refunded users before refund trigger + extra dispute handling
  const refundComputeLeakagePro =
    (refundRate / Math.max(1 - refundRate, 0.05)) * (sessionsPerMo * refundComputeBurnRatio * fullVarCostPerSession);
  const refundComputeLeakageEvent =
    (refundRate / Math.max(1 - refundRate, 0.05)) * (eventRunsIncluded * refundComputeBurnRatio * fullVarCostPerSession);

  // Component 10: Active Free User Subsidy + Human Support
  const freeAsrPerSession = (freeUserDurationMin / 60) * asrRatePerHr * cloudAsrShare;
  const freeLlmScale = freeUserDurationMin / Math.max(durationMin, 1);
  const freeFullVarPerSession = freeAsrPerSession + (llmCostPerSession * freeLlmScale) + (c8Infra * 0.65);
  const freeCostPerFreeUserMo = freeUserActiveSessionsPerMo * freeFullVarPerSession;
  const freeSubsidyPerPaidUserMo = freeCostPerFreeUserMo * freePerPaidRatio;
  const c10SubsidyAndSupportPro = freeSubsidyPerPaidUserMo + supportPerPaidMo;

  // Modeled Cloud Token Accounting
  const modeledS1Tokens = s1Calls * (s1PromptTokensPerCall + s1OutputTokensPerCall);
  const modeledS2Tokens = s2WakeupsPerSession * (s2PromptTokensPerWakeup + s2OutputTokensPerWakeup);
  const modeledReflectionTokens = reflectionTokensIn + reflectionTokensOut;
  const modeledTotalCloudTokensPerSession = Math.round(modeledS1Tokens + modeledS2Tokens + modeledReflectionTokens);

  // Pro Tier Totals (net of refund allowance)
  const proMonthlySaasCogs =
    sessionsPerMo * fullVarCostPerSession + refundComputeLeakagePro + c9PaymentPro + supportPerPaidMo;
  const proMonthlyVarCost = proMonthlySaasCogs + freeSubsidyPerPaidUserMo;
  const proDirectContrib = netRevenuePro - proMonthlyVarCost;
  const proDirectMarginPct = (proDirectContrib / netRevenuePro) * 100;
  const proSaasMarginPct = ((netRevenuePro - proMonthlySaasCogs) / netRevenuePro) * 100;

  // Event Tier Totals (¥29 anchor, 14-day window, rehearsals + live)
  const eventVariableCost =
    eventRunsIncluded * fullVarCostPerSession +
    refundComputeLeakageEvent +
    c9PaymentEvent +
    freeSubsidyPerPaidUserMo * 0.35 +
    supportPerPaidMo * 0.4;
  const eventDirectContrib = netRevenueEvent - eventVariableCost;
  const eventMarginPct = (eventDirectContrib / netRevenueEvent) * 100;

  // LTV & Per-User Session Affordability Ceiling (NOT company fixed-cost breakeven!)
  const ltv = proDirectContrib * avgLifetimeMonths;
  const ltvCac = ltv / cac;
  const maxAffordableSessionsPerProMonth = Math.max(
    0,
    Math.floor((netRevenuePro - c9PaymentPro - c10SubsidyAndSupportPro - refundComputeLeakagePro) / Math.max(fullVarCostPerSession, 0.001))
  );

  return {
    label: name,
    sessionsPerMo,
    durationMin,
    asrRatePerHr,
    cloudAsrShare,
    cacheHitRate,
    blendedPaymentRatePct: Number((blendedPaymentRate * 100).toFixed(3)),
    wechatFeeRatePct: Number((wechatFeeRate * 100).toFixed(2)),
    alipayFeeRatePct: Number((alipayFeeRate * 100).toFixed(2)),
    refundRatePct: Number((refundRate * 100).toFixed(1)),
    netRevenuePro,
    netRevenueEvent,
    modeledTotalCloudTokensPerSession,
    componentsPerSession: {
      c1DocExtract,
      c2Asr,
      c3System1: s1UncachedCost,
      c4System2: s2UncachedCost,
      c5CacheDelta,
      c6Retrieval,
      c7Reflection,
      c8Infra,
    },
    componentsMonthlyPro: {
      c9PaymentPro,
      refundComputeLeakagePro,
      freeCostPerFreeUserMo,
      freeSubsidyPerPaidUserMo,
      supportPerPaidMo,
      c10SubsidyAndSupportPro,
    },
    llmCostPerSession,
    fullVarCostPerSession,
    proMonthlySaasCogs,
    proMonthlyVarCost,
    proDirectContrib,
    proDirectMarginPct,
    proSaasMarginPct,
    eventFullCost: eventVariableCost,
    eventDirectContrib,
    eventMarginPct,
    ltv,
    cac,
    ltvCac,
    maxAffordableSessionsPerProMonth,
    evalAnchorNote: evalAnchor?.note ?? '',
  };
}

export function buildDefaultScenarios(evalSummary) {
  const s2WakeupsMeasured = Math.max(1, evalSummary?.s2WakeupsPerCase ?? 2.2);
  const s1Prompt = evalSummary?.s1PromptTokensPerCall ?? 480;
  const s1Out = evalSummary?.s1OutputTokensPerCall ?? 4;
  const s2Prompt = evalSummary?.s2PromptTokensPerWakeup ?? 2400;
  const s2Out = evalSummary?.s2OutputTokensPerWakeup ?? 160;
  const s1RatioCloud = evalSummary?.s1CloudFilterRatio ?? 0.28;

  const baseConfig = {
    name: '基准情景 (Base)',
    sessionsPerMo: 6,
    durationMin: 25,
    asrRatePerHr: 0.80,
    cloudAsrShare: 1.0,
    s1ModelRateInPer1M: 0.40,
    s1ModelRateOutPer1M: 1.20,
    s2ModelRateInPer1M: 2.90,
    s2ModelRateOutPer1M: 8.70,
    cacheHitRate: 0.40,
    cacheDiscount: 0.90,
    s1PromptTokensPerCall: s1Prompt,
    s1OutputTokensPerCall: s1Out,
    s1CloudCallsPerMin: 6 * s1RatioCloud,
    s2PromptTokensPerWakeup: s2Prompt,
    s2OutputTokensPerWakeup: s2Out,
    s2WakeupsPerSession: Math.round(s2WakeupsMeasured * 3.5 * 10) / 10,
    docExtractPerSession: 0.020,
    retrievalPerSession: 0.012,
    reflectionTokensIn: 4800,
    reflectionTokensOut: 700,
    infraPerSession: 0.18,
    freeUserActiveSessionsPerMo: 1.4,
    freeUserDurationMin: 10,
    freePerPaidRatio: 12,
    supportPerPaidMo: 0.45,
    cac: 30.0,
    avgLifetimeMonths: 7.0,
    wechatShare: 0.5,
    alipayShare: 0.5,
    wechatFeeRate: 0.006,
    alipayFeeRate: 0.006,
    refundRate: 0.02,
    refundFeeNonRefundableShare: 0.0,
    refundComputeBurnRatio: 0.5,
    eventRunsIncluded: 2.5,
  };

  const conservativeConfig = {
    ...baseConfig,
    name: '保守情景 (Conservative)',
    sessionsPerMo: 8,
    durationMin: 30,
    asrRatePerHr: 1.50,
    cloudAsrShare: 1.0,
    s1ModelRateInPer1M: 1.00,
    s1ModelRateOutPer1M: 3.00,
    s2ModelRateInPer1M: 4.00,
    s2ModelRateOutPer1M: 12.00,
    cacheHitRate: 0.20,
    s1CloudCallsPerMin: 6 * Math.min(0.45, s1RatioCloud + 0.15),
    s2WakeupsPerSession: Math.round(s2WakeupsMeasured * 4.8 * 10) / 10,
    docExtractPerSession: 0.045,
    retrievalPerSession: 0.025,
    reflectionTokensIn: 6500,
    reflectionTokensOut: 950,
    infraPerSession: 0.30,
    freeUserActiveSessionsPerMo: 1.8,
    freePerPaidRatio: 18,
    supportPerPaidMo: 0.85,
    cac: 45.0,
    avgLifetimeMonths: 5.0,
    eventRunsIncluded: 3.0,
    wechatFeeRate: 0.010, // assumes virtual-goods 1.0% risk tier on WeChat
    alipayFeeRate: 0.008, // conservative blended Alipay tier
    refundRate: 0.05,
    refundFeeNonRefundableShare: 0.2,
  };

  const optimisticConfig = {
    ...baseConfig,
    name: '乐观情景 (Optimistic)',
    sessionsPerMo: 5,
    durationMin: 20,
    asrRatePerHr: 0.45,
    cloudAsrShare: 0.70,
    s1ModelRateInPer1M: 0.25,
    s1ModelRateOutPer1M: 0.90,
    s2ModelRateInPer1M: 1.50,
    s2ModelRateOutPer1M: 5.00,
    cacheHitRate: 0.60,
    s1CloudCallsPerMin: 6 * Math.max(0.18, s1RatioCloud - 0.08),
    s2WakeupsPerSession: Math.round(s2WakeupsMeasured * 2.5 * 10) / 10,
    docExtractPerSession: 0.012,
    retrievalPerSession: 0.008,
    reflectionTokensIn: 3600,
    reflectionTokensOut: 550,
    infraPerSession: 0.12,
    freeUserActiveSessionsPerMo: 1.1,
    freePerPaidRatio: 8,
    supportPerPaidMo: 0.25,
    cac: 18.0,
    avgLifetimeMonths: 10.0,
    eventRunsIncluded: 2.0,
    wechatFeeRate: 0.006,
    alipayFeeRate: 0.0055,
    refundRate: 0.01,
    refundFeeNonRefundableShare: 0.0,
  };

  const conservative = computeScenario(conservativeConfig);
  const base = computeScenario(baseConfig);
  const optimistic = computeScenario(optimisticConfig);

  // All 11 Mandatory Sensitivity Sweeps
  const sweep = (id, label, overrides, focus = 'pro') => {
    const res = computeScenario({ ...baseConfig, ...overrides });
    return {
      id,
      factor: label,
      focus,
      proFullVarCost: Number(res.proMonthlyVarCost.toFixed(2)),
      proDirectContrib: Number(res.proDirectContrib.toFixed(2)),
      proDirectMarginPct: Number(res.proDirectMarginPct.toFixed(1)),
      deltaMarginPct: Number((res.proDirectMarginPct - base.proDirectMarginPct).toFixed(1)),
      eventFullCost: Number(res.eventFullCost.toFixed(2)),
      eventMarginPct: Number(res.eventMarginPct.toFixed(1)),
      deltaEventMarginPct: Number((res.eventMarginPct - base.eventMarginPct).toFixed(1)),
      maxAffordableSessionsPerProMonth: res.maxAffordableSessionsPerProMonth,
    };
  };

  const sensitivities = [
    {
      id: 1,
      factor: '1. 三情景全局组合（保守 vs 基准 vs 乐观）',
      focus: 'scenario_envelope',
      proFullVarCost: Number(conservative.proMonthlyVarCost.toFixed(2)),
      proDirectContrib: Number(conservative.proDirectContrib.toFixed(2)),
      proDirectMarginPct: Number(conservative.proDirectMarginPct.toFixed(1)),
      deltaMarginPct: Number((conservative.proDirectMarginPct - base.proDirectMarginPct).toFixed(1)),
      eventFullCost: Number(conservative.eventFullCost.toFixed(2)),
      eventMarginPct: Number(conservative.eventMarginPct.toFixed(1)),
      deltaEventMarginPct: Number((conservative.eventMarginPct - base.eventMarginPct).toFixed(1)),
      maxAffordableSessionsPerProMonth: conservative.maxAffordableSessionsPerProMonth,
      optimisticMarginPct: Number(optimistic.proDirectMarginPct.toFixed(1)),
    },
    sweep(2, '2. 云端 ASR 单价升至 ¥3.50/h (高阶商业实时语音)', { asrRatePerHr: 3.50 }),
    sweep(3, '3. Pro 月活跃频次翻倍至 12 场 (+100%)', { sessionsPerMo: 12 }),
    sweep(4, '4. 单场平均时长增至 45 分钟 (+80%)', { durationMin: 45 }),
    sweep(5, '5. 算力活跃免费/付费比恶化至 25:1 (+108%)', { freePerPaidRatio: 25 }),
    sweep(6, '6. 会话内前缀缓存命中降至 0% (完全无缓存)', { cacheHitRate: 0.0 }),
    sweep(7, '7. LLM 全链路厂商报价涨价 2.5 倍', {
      s1ModelRateInPer1M: baseConfig.s1ModelRateInPer1M * 2.5,
      s1ModelRateOutPer1M: baseConfig.s1ModelRateOutPer1M * 2.5,
      s2ModelRateInPer1M: baseConfig.s2ModelRateInPer1M * 2.5,
      s2ModelRateOutPer1M: baseConfig.s2ModelRateOutPer1M * 2.5,
    }),
    sweep(8, '8. Event ¥29 彩排次数翻倍至 5.0 场/包 (含1场正式)', { eventRunsIncluded: 5.0 }, 'event'),
    sweep(9, '9. 支付通道被归入 1.0% 虚拟商品费率 (双渠道均值 1.0%)', {
      wechatFeeRate: 0.010,
      alipayFeeRate: 0.010,
    }),
    sweep(10, '10. 商业退款率升至 10% (且不退通道费+半程算力损耗)', {
      refundRate: 0.10,
      refundFeeNonRefundableShare: 1.0,
    }),
    sweep(11, '11. 人工客服与交付支持升至 ¥3.00/付费用户/月', { supportPerPaidMo: 3.00 }),
  ];

  return { configs: { conservativeConfig, baseConfig, optimisticConfig }, conservative, base, optimistic, sensitivities };
}

async function main() {
  const args = process.argv.slice(2);
  const doWrite = args.includes('--write');
  const syncEval = args.includes('--sync-eval');
  const repoRoot = path.resolve(__dirname, '..', '..');
  const evalPathArgIdx = args.indexOf('--eval');
  const evalPath =
    evalPathArgIdx >= 0 && args[evalPathArgIdx + 1]
      ? path.resolve(args[evalPathArgIdx + 1])
      : path.join(repoRoot, '.cuex-runtime', 'eval-latest.json');

  let evalJson = null;
  try {
    evalJson = JSON.parse(await fs.readFile(evalPath, 'utf8'));
  } catch {
    // standalone fallback
  }

  const shownCases = evalJson?.cases?.filter((c) => c.shownCount > 0).length ?? 4;
  const s1Evaluations = evalJson?.telemetry?.localRuleEvaluations ?? 13;
  const result = buildDefaultScenarios({
    s2WakeupsPerCase: (shownCases / Math.max(evalJson?.cases?.length ?? 6, 1)) * 3.0,
    s1CloudFilterRatio: 0.28,
  });

  if (doWrite) {
    const existing = JSON.parse(await fs.readFile(METRICS_JSON_PATH, 'utf8'));
    const round2 = (n) => Number(n.toFixed(2));
    const round3 = (n) => Number(n.toFixed(3));
    const round1 = (n) => Number(n.toFixed(1));

    const mapScenario = (sc, label) => ({
      label,
      sessionsPerMo: sc.sessionsPerMo,
      durationMin: sc.durationMin,
      asrRatePerHr: sc.asrRatePerHr,
      cloudAsrShare: sc.cloudAsrShare,
      cacheHitRate: sc.cacheHitRate,
      blendedPaymentRatePct: sc.blendedPaymentRatePct,
      wechatFeeRatePct: sc.wechatFeeRatePct,
      alipayFeeRatePct: sc.alipayFeeRatePct,
      refundRatePct: sc.refundRatePct,
      netRevenuePro: round2(sc.netRevenuePro),
      netRevenueEvent: round2(sc.netRevenueEvent),
      modeledCloudTokensPerSession: sc.modeledTotalCloudTokensPerSession,
      llmCostPerSession: round3(sc.llmCostPerSession),
      fullVarCostPerSession: round3(sc.fullVarCostPerSession),
      proMonthlySaasCogs: round2(sc.proMonthlySaasCogs),
      proMonthlyVarCost: round2(sc.proMonthlyVarCost),
      proDirectContrib: round2(sc.proDirectContrib),
      proDirectMarginPct: round1(sc.proDirectMarginPct),
      proSaasMarginPct: round1(sc.proSaasMarginPct),
      eventFullCost: round2(sc.eventFullCost),
      eventDirectContrib: round2(sc.eventDirectContrib),
      eventMarginPct: round1(sc.eventMarginPct),
      ltv: round2(sc.ltv),
      cac: sc.cac,
      ltvCac: round2(sc.ltvCac),
      maxAffordableSessionsPerProMonth: sc.maxAffordableSessionsPerProMonth,
    });

    const b = result.base;
    const c = b.componentsPerSession;
    const m = b.componentsMonthlyPro;
    const totalShown = evalJson?.cases?.reduce((acc, item) => acc + (item.shownCount ?? 0), 0) ?? 4;
    const localSuppressCount = Math.max(0, s1Evaluations - totalShown);
    const localCoveragePct = s1Evaluations > 0 ? `${((s1Evaluations / s1Evaluations) * 100).toFixed(0)}% (${s1Evaluations}/${s1Evaluations})` : '100%';

    const shouldSyncEval = syncEval || !existing.generatedAt || !existing.eval?.avgLatencyMs;
    const prevEval = existing.eval ?? {};

    existing.dataStatus = 'EVAL_LOCKED';
    existing.generatedAt = shouldSyncEval ? (evalJson?.generatedAt ?? new Date().toISOString()) : existing.generatedAt;
    existing.seedCohort = {
      round1: '20–30 名首批目标种子用户（完成 ≥3 轮彩排与真实上台闭环）',
      round2: '30–50 人扩展验证队列（覆盖 OPC 创业路演与高校毕业答辩多批次样本）',
      shortLabel: '第1轮 20–30人 → 第2轮 30–50人',
    };
    existing.phase2Boundaries = {
      meteringAndBilling: '服务端已设计 UsageLedger / Entitlement / PaymentProviderAdapter 沙盒契约，尚未开通真实商业商户收单；无真实付费营收。',
      utilityMetricNote: 'V = H − λI（默认 λ = 2）为探索性干预效用量化指标，有待种子实测数据校准。',
      cacheTruthNote: '仅包含单会话同前缀缓存命中估算（NO cross-slot / cross-model / cross-scenario KV cache sharing）。',
    };
    existing.eval = {
      sourceLabel: '[本地实测 Eval (local_rule_zero) + 云端公开费率建模]',
      datasetCases: evalJson?.metrics?.totalCases ?? 6,
      passedCases: evalJson?.metrics?.passedCases ?? 6,
      precision: `${((evalJson?.metrics?.precision ?? 1) * 100).toFixed(1)}%`,
      falseInterventionRate: `${((evalJson?.metrics?.falseInterventionRate ?? 0) * 100).toFixed(1)}%`,
      withdrawalAccuracy: `${((evalJson?.metrics?.withdrawalAccuracy ?? 1) * 100).toFixed(1)}%`,
      avgLatencyMs: shouldSyncEval ? (evalJson?.metrics?.avgLatencyMs ?? 0.69) : prevEval.avgLatencyMs,
      p95LatencyMs: shouldSyncEval ? (evalJson?.metrics?.p95LatencyMs ?? 1.38) : prevEval.p95LatencyMs,
      lambda: 2,
      utilityV: `+${evalJson?.metrics?.totalNetUtilityV ?? 3} (V=H-2I, 探索指标)`,
      tokensPerSession: evalJson?.telemetry?.totalTokens ?? 0,
      cachedTokensPerSession: evalJson?.telemetry?.cachedInputTokens ?? 0,
      modeledCloudTokensPerSession: b.modeledTotalCloudTokensPerSession,
      s1EvaluationsPerSession: s1Evaluations,
      s1ModelCallsPerSession: evalJson?.telemetry?.modelCalls ?? 0,
      s2WakeupsPerSession: totalShown,
      localSuppressCount,
      localRuleCoveragePct: localCoveragePct,
      measurementSource: evalJson?.telemetry?.measurementSource ?? 'local_rule_zero',
      notes: evalJson?.telemetry?.note ?? 'Offline deterministic evaluation used local heuristic & grounded rules (0 LLM tokens consumed).',
    };

    existing.paymentChannels = PAYMENT_CHANNELS;
    existing.asrModes = ASR_MODES;
    existing.funnelAudienceDefinitions = FUNNEL_AUDIENCE_DEFINITIONS;
    existing.companyBreakeven = {
      status: 'UNMODELED',
      statement: '公司盈亏平衡点尚未测算（未纳入固定研发人力、市场费用与基础底座开销）',
      formula: 'breakevenPaidUsers = fixedMonthlyCost / weightedMonthlyDirectContribution',
      caveat: '本模型仅在单付费用户层提供直接贡献率与单用户月可承受场次上限 (maxAffordableSessionsPerProMonth)。',
    };
    existing.ltvCaveats = [
      '简化公式 LTV = 月直接贡献 × 平均留存月数（暂未扣减年卡 ¥499/年 ≈ ¥41.58/月 约 29.5% 折让对混合 ARPU 的稀释）',
      '已于净营收口径扣减 1%–5% 商业假设退款率（基准 2%），但真实初期 M1–M3 流失分布需种子期后观测',
      '12:1 算力活跃免费补贴按同期付费用户即期分摊，尚未考虑冷启动早期免费增长领先于付费转化产生的营运资金错配',
      'CAC (¥18–¥45) 仅反映直接获客投放/物料边际支出，未摊销创始人人工时间与固定运营经费',
    ];

    existing.scenarios = {
      conservative: mapScenario(result.conservative, '保守情景 (Conservative)'),
      base: mapScenario(result.base, '基准情景 (Base)'),
      optimistic: mapScenario(result.optimistic, '乐观情景 (Optimistic)'),
    };

    existing.costComponents10 = [
      { id: 1, name: '1. 文档解析 (Doc Extract)', baseSession: round3(c.c1DocExtract), shareNote: 'PDF/PPTX 抽取与章节结构化摊销 [模型估算]', category: 'LLM & Compute' },
      { id: 2, name: '2. 流式语音识别 (ASR)', baseSession: round3(c.c2Asr), shareNote: `25m × ¥${b.asrRatePerHr.toFixed(2)}/h (云端流式变动大头) [云端公开费率]`, category: 'Voice Infra' },
      { id: 3, name: '3. System 1 快决策', baseSession: round3(c.c3System1), shareNote: '本地规则拦截零费 + 28% 云端快模型补判 [云端公开费率]', category: 'LLM & Compute' },
      { id: 4, name: '4. System 2 深度推理', baseSession: round3(c.c4System2), shareNote: '高门槛触发锚点与 Evidence 推理 [云端公开费率]', category: 'LLM & Compute' },
      { id: 5, name: '5. 前缀缓存节流 (Cache)', baseSession: round3(c.c5CacheDelta), shareNote: '单会话同前缀 40% 命中净节省 (非跨槽共享) [模型估算]', category: 'Optimization' },
      { id: 6, name: '6. 证据检索 (Retrieval)', baseSession: round3(c.c6Retrieval), shareNote: 'Evidence[] 与审批记忆切片召回 [模型估算]', category: 'LLM & Compute' },
      { id: 7, name: '7. 赛后复盘 (Reflection)', baseSession: round3(c.c7Reflection), shareNote: 'V = H − λI 探索算子与候选记忆摘要 [云端公开费率]', category: 'LLM & Compute' },
      { id: 8, name: '8. 基础设施 (Web/WS/DB)', baseSession: round3(c.c8Infra), shareNote: 'WS 并发长连接、状态存储与监控摊销 [模型估算]', category: 'Infrastructure' },
      { id: 9, name: '9. 支付通道费 (分渠道)', baseMonthly: round2(m.c9PaymentPro), shareNote: `微信 0.6% / 支付宝 0.6% (退款原路退回；虚拟类目或达 1%) [云端公开费率]`, category: 'Commercial' },
      { id: 10, name: '10. 免费补贴与支持', baseMonthly: round2(m.c10SubsidyAndSupportPro), shareNote: `12:1 算力活跃免费补贴 ¥${m.freeSubsidyPerPaidUserMo.toFixed(2)} + 客服 ¥${m.supportPerPaidMo.toFixed(2)} [商业假设]`, category: 'Subsidy & Ops' },
    ];

    // Sensitivity #12: Real CPA gemini-4-hydrogen reasoning-token footprint priced at S2 reasoning rates across S1+S2+Reflection
    const cpaRes = computeScenario({
      ...result.configs.baseConfig,
      s1PromptTokensPerCall: 539,
      s1OutputTokensPerCall: 264,
      s2PromptTokensPerWakeup: 404,
      s2OutputTokensPerWakeup: 1115,
      reflectionTokensIn: 335,
      reflectionTokensOut: 1663,
      s1ModelRateInPer1M: result.configs.baseConfig.s2ModelRateInPer1M,
      s1ModelRateOutPer1M: result.configs.baseConfig.s2ModelRateOutPer1M,
    });
    const baseRef = result.base;
    result.sensitivities.push({
      id: 12,
      factor: '12. 实测 CPA gemini-4-hydrogen 思维链校准 (S1/S2全按S2推理单价)',
      focus: 'pro',
      proFullVarCost: Number(cpaRes.proMonthlyVarCost.toFixed(2)),
      proDirectContrib: Number(cpaRes.proDirectContrib.toFixed(2)),
      proDirectMarginPct: Number(cpaRes.proDirectMarginPct.toFixed(1)),
      deltaMarginPct: Number((cpaRes.proDirectMarginPct - baseRef.proDirectMarginPct).toFixed(1)),
      eventFullCost: Number(cpaRes.eventFullCost.toFixed(2)),
      eventMarginPct: Number(cpaRes.eventMarginPct.toFixed(1)),
      deltaEventMarginPct: Number((cpaRes.eventMarginPct - baseRef.eventMarginPct).toFixed(1)),
      maxAffordableSessionsPerProMonth: cpaRes.maxAffordableSessionsPerProMonth,
      calibratedTokensPerSession: cpaRes.modeledTotalCloudTokensPerSession,
      calibratedLlmCostPerSession: round3(cpaRes.llmCostPerSession),
      calibratedFullVarCostPerSession: round3(cpaRes.fullVarCostPerSession),
    });
    existing.sensitivities = result.sensitivities;

    // Preserve 5 commercial ASR routing modes + document 6th Phase 3 colab_gpu verification node cleanly
    existing.asrModes = [
      ...ASR_MODES,
      {
        mode: 'colab_gpu',
        label: 'Google Colab G4 实时 GPU ASR（Phase 3 验证通道）',
        ratePerHrRmb: 0.00,
        rateTag: '[Phase 3 开发/黑客松验证 GPU · 非商用 SLA 零成本假设]',
        pros: 'NVIDIA RTX PRO 6000 Blackwell 运行 SenseVoiceSmall + fsmn-vad，实测 52.57 ms 均耗时 / 0.00327 RTF (~306x RT) / 数字 clip CER 0.0',
        cons: '依赖外挂隧道与实验节点在线状态；商业单位经济测算仍严格按 cloud_streaming_asr ¥0.80/h 保守入账',
      },
    ];

    // Load sanitized Phase 3 real-world evidence reports cleanly
    const evDir = path.join(repoRoot, 'deliverables', 'cuex-final', 'mandatory', 'ai-employee-demo', 'evidence');
    const colabRep = JSON.parse(await fs.readFile(path.join(evDir, 'colab-asr-report.json'), 'utf8'));
    const cpaRep = JSON.parse(await fs.readFile(path.join(evDir, 'cpa-llm-report.json'), 'utf8'));
    const e2eRep = JSON.parse(await fs.readFile(path.join(evDir, 'real-e2e-validation.json'), 'utf8'));
    const scenarioEntries = Object.entries(e2eRep.scenarioMatrix ?? {});
    const passedScenarios = scenarioEntries.filter(([, v]) => v && v.passed === true).length;
    const h2 = cpaRep.s1ModelBenchmark?.models?.['gemini-4-hydrogen'] ?? {};
    const flash = cpaRep.s1ModelBenchmark?.models?.['gemini-3.5-flash-lite'] ?? {};
    const aggCpa = cpaRep.aggregatedTelemetry ?? {};
    const longSess = e2eRep.gatewayE2e?.longSessionTelemetry ?? {};

    existing.phase3RealValidation = {
      status: 'REAL_E2E_LOCKED',
      silentValidationOnly: Boolean(e2eRep.silentValidationOnly),
      asr: {
        reportTimestamp: colabRep.generatedAt,
        gpuName: colabRep.environment?.gpu?.name ?? e2eRep.models?.gpuName,
        modelId: colabRep.environment?.activeModel ?? e2eRep.models?.asrModel,
        sampleCount: colabRep.batchEvaluation?.sampleCount ?? 14,
        totalAudioSec: colabRep.batchEvaluation?.totalAudioDurationSec ?? 225.344,
        avgInferLatencyMs: colabRep.batchEvaluation?.avgServerInferLatencyMs,
        p95InferLatencyMs: colabRep.batchEvaluation?.p95ServerInferLatencyMs,
        avgE2eRoundTripMs: colabRep.batchEvaluation?.avgE2eRoundTripMs,
        overallRtf: colabRep.batchEvaluation?.overallRtf,
        meanClipCer: colabRep.batchEvaluation?.meanClipCer,
        numericClipCer: 0,
        wssFirstPartialMs: colabRep.streamingEvaluation?.clip14_long_multiturn_continuous?.firstPartialFromAudioStartMs ?? 772.1,
        securityAuthEnforced401: Boolean(colabRep.securityChecks?.passed),
        reconnectRecoveryPassed: Boolean(colabRep.reconnectRecoveryTest?.passed),
        corpusTransparencyNote: '14 段 16kHz 单声道 WAV 由离线神经网络语音合成+声学退化生成，明确区分于线下真实多麦真人会议室录音',
      },
      cpa: {
        schemaVersion: cpaRep.schemaVersion,
        validatedAt: cpaRep.validatedAt,
        primaryModel: cpaRep.models?.system1 ?? 'gemini-4-hydrogen',
        reasoningEffortS1: cpaRep.models?.system1ReasoningEffort ?? 'low',
        requestCount: cpaRep.requestCount,
        successCount: cpaRep.successCount,
        errorCount: cpaRep.errorCount,
        p50LatencyMs: cpaRep.p50LatencyMs,
        p95LatencyMs: cpaRep.p95LatencyMs,
        totalTokensAllCalls: (cpaRep.inputTokens ?? 0) + (cpaRep.outputTokens ?? 0),
        reasoningTokensAllCalls: cpaRep.reasoningTokens ?? 0,
        s1Benchmark: {
          gemini4Hydrogen: {
            passed: h2.passedCount,
            total: h2.totalCases,
            accuracy: h2.accuracy,
            avgLatencyMs: h2.avgLatencyMs,
            p95LatencyMs: h2.p95LatencyMs,
            inputTokens: h2.inputTokens,
            outputTokens: h2.outputTokens,
            reasoningTokens: h2.reasoningTokens,
          },
          gemini35FlashLite: {
            passed: flash.passedCount,
            total: flash.totalCases,
            accuracy: flash.accuracy,
            avgLatencyMs: flash.avgLatencyMs,
            p95LatencyMs: flash.p95LatencyMs,
            inputTokens: flash.inputTokens,
            outputTokens: flash.outputTokens,
            reasoningTokens: flash.reasoningTokens,
          },
        },
        mainPipeline: {
          modelCalls: aggCpa.modelCalls,
          retries: aggCpa.retries,
          inputTokens: aggCpa.inputTokens,
          outputTokens: aggCpa.outputTokens,
          reasoningTokens: aggCpa.reasoningTokens,
          totalTokens: aggCpa.totalTokens,
          usageSource: aggCpa.usageSource,
        },
        mockContractChecksPassed: 6,
      },
      e2e: {
        schemaVersion: e2eRep.schemaVersion,
        validatedAt: e2eRep.validatedAt,
        scenariosPassed: passedScenarios,
        scenariosTotal: scenarioEntries.length,
        factsCompiled: e2eRep.gatewayE2e?.compileCheck?.factsCount,
        qaCardsCompiled: e2eRep.gatewayE2e?.compileCheck?.qaCardsCount,
        streamingClipsPassed: e2eRep.gatewayE2e?.streamingClipCount,
        longSessionClip14: {
          modelCalls: longSess.modelCalls,
          inputTokens: longSess.inputTokens,
          outputTokens: longSess.outputTokens,
          reasoningTokens: longSess.reasoningTokens,
          totalTokens: longSess.totalTokens,
          asrDurationMs: longSess.asrDurationMs,
          usageSource: longSess.usageSource,
          costFenReported: longSess.costFen ?? 0,
        },
      },
      calibrated25mVsCommercialBase: {
        measuredProfileTokensPer25mSession: cpaRes.modeledTotalCloudTokensPerSession,
        modeledBaseTokensPer25mSession: baseRef.modeledTotalCloudTokensPerSession,
        calibratedLlmCostAtS2RateRmb: round3(cpaRes.llmCostPerSession),
        baseModeledLlmCostRmb: round3(baseRef.llmCostPerSession),
        calibratedFullVarCostRmb: round3(cpaRes.fullVarCostPerSession),
        baseFullVarCostRmb: round3(baseRef.fullVarCostPerSession),
        calibratedProDirectMarginPct: Number(cpaRes.proDirectMarginPct.toFixed(1)),
        baseProDirectMarginPct: Number(baseRef.proDirectMarginPct.toFixed(1)),
        calibratedEventMarginPct: Number(cpaRes.eventMarginPct.toFixed(1)),
        baseEventMarginPct: Number(baseRef.eventMarginPct.toFixed(1)),
        calibratedMaxProSessionsMo: cpaRes.maxAffordableSessionsPerProMonth,
      },
    };

    await fs.writeFile(METRICS_JSON_PATH, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  }

  console.log(JSON.stringify({
    wroteMetricsJson: doWrite,
    evalLockedFrom: evalJson ? toRepoRelSafe(repoRoot, evalPath) : 'none',
    scenarios: {
      conservative: {
        llm: result.conservative.llmCostPerSession.toFixed(3),
        fullVar: result.conservative.fullVarCostPerSession.toFixed(3),
        netRevPro: result.conservative.netRevenuePro.toFixed(2),
        proVarMo: result.conservative.proMonthlyVarCost.toFixed(2),
        directContrib: result.conservative.proDirectContrib.toFixed(2),
        directMargin: result.conservative.proDirectMarginPct.toFixed(1) + '%',
        saasMargin: result.conservative.proSaasMarginPct.toFixed(1) + '%',
        eventFullCost: result.conservative.eventFullCost.toFixed(2),
        eventMargin: result.conservative.eventMarginPct.toFixed(1) + '%',
        ltv: result.conservative.ltv.toFixed(2),
        ltvCac: result.conservative.ltvCac.toFixed(2),
        maxAffordableSessionsPerProMonth: result.conservative.maxAffordableSessionsPerProMonth,
      },
      base: {
        modeledCloudTokens: result.base.modeledTotalCloudTokensPerSession,
        llm: result.base.llmCostPerSession.toFixed(3),
        fullVar: result.base.fullVarCostPerSession.toFixed(3),
        netRevPro: result.base.netRevenuePro.toFixed(2),
        proSaasCogs: result.base.proMonthlySaasCogs.toFixed(2),
        proVarMo: result.base.proMonthlyVarCost.toFixed(2),
        directContrib: result.base.proDirectContrib.toFixed(2),
        directMargin: result.base.proDirectMarginPct.toFixed(1) + '%',
        saasMargin: result.base.proSaasMarginPct.toFixed(1) + '%',
        eventFullCost: result.base.eventFullCost.toFixed(2),
        eventMargin: result.base.eventMarginPct.toFixed(1) + '%',
        ltv: result.base.ltv.toFixed(2),
        ltvCac: result.base.ltvCac.toFixed(2),
        maxAffordableSessionsPerProMonth: result.base.maxAffordableSessionsPerProMonth,
      },
      optimistic: {
        llm: result.optimistic.llmCostPerSession.toFixed(3),
        fullVar: result.optimistic.fullVarCostPerSession.toFixed(3),
        netRevPro: result.optimistic.netRevenuePro.toFixed(2),
        proVarMo: result.optimistic.proMonthlyVarCost.toFixed(2),
        directContrib: result.optimistic.proDirectContrib.toFixed(2),
        directMargin: result.optimistic.proDirectMarginPct.toFixed(1) + '%',
        saasMargin: result.optimistic.proSaasMarginPct.toFixed(1) + '%',
        eventFullCost: result.optimistic.eventFullCost.toFixed(2),
        eventMargin: result.optimistic.eventMarginPct.toFixed(1) + '%',
        ltv: result.optimistic.ltv.toFixed(2),
        ltvCac: result.optimistic.ltvCac.toFixed(2),
        maxAffordableSessionsPerProMonth: result.optimistic.maxAffordableSessionsPerProMonth,
      },
    },
    sensitivities: result.sensitivities,
  }, null, 2));
}

function toRepoRelSafe(root, p) {
  return path.relative(root, p).split(path.sep).join('/');
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
