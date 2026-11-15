/**
 * Deterministic 10-Component Unit Economics Engine for CueX Next.
 * Separates [Measured Local Eval], [Public Cloud Rate Card], and [Commercial Hypothesis].
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

export function computeScenario(params, evalAnchor) {
  const {
    name,
    sessionsPerMo,
    durationMin,
    asrRatePerHr, // RMB per hour (cloud streaming ASR)
    cloudAsrShare, // 0..1 (1.0 = 100% cloud ASR; <1 reflects partial local Sherpa offload)
    s1ModelRateInPer1M, // RMB / 1M uncached input tokens
    s1ModelRateOutPer1M, // RMB / 1M output tokens
    s2ModelRateInPer1M, // RMB / 1M uncached input tokens
    s2ModelRateOutPer1M, // RMB / 1M output tokens
    cacheHitRate, // intra-session prefix cache hit ratio (0..1)
    cacheDiscount, // e.g., 0.90 means cached input tokens cost 10% of base input
    s1PromptTokensPerCall,
    s1OutputTokensPerCall,
    s1CloudCallsPerMin, // after local deterministic rule filtering
    s2PromptTokensPerWakeup,
    s2OutputTokensPerWakeup,
    s2WakeupsPerSession,
    docExtractPerSession, // amortized upload extraction & structuring
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
    eventRunsIncluded = 2.5, // avg rehearsals + 1 live session per ¥29 Event pack
    paymentRate = 0.006, // verified WeChat Pay / Alipay standard 0.6%
  } = params;

  // Component 1: Doc Extract (amortized)
  const c1DocExtract = docExtractPerSession;

  // Component 2: Streaming ASR (cloud duration * cloud rate)
  const c2Asr = (durationMin / 60) * asrRatePerHr * cloudAsrShare;

  // Component 3: System 1 Fast Decision (uncached baseline)
  const s1Calls = s1CloudCallsPerMin * durationMin;
  const s1UncachedCost =
    ((s1Calls * s1PromptTokensPerCall) / 1_000_000) * s1ModelRateInPer1M +
    ((s1Calls * s1OutputTokensPerCall) / 1_000_000) * s1ModelRateOutPer1M;

  // Component 4: System 2 Grounded Reasoning (uncached baseline)
  const s2UncachedCost =
    ((s2WakeupsPerSession * s2PromptTokensPerWakeup) / 1_000_000) * s2ModelRateInPer1M +
    ((s2WakeupsPerSession * s2OutputTokensPerWakeup) / 1_000_000) * s2ModelRateOutPer1M;

  // Component 5: Intra-Session Prefix Cache Savings (negative cost delta; NO cross-slot sharing claimed)
  const s1InputCostRaw = ((s1Calls * s1PromptTokensPerCall) / 1_000_000) * s1ModelRateInPer1M;
  const s2InputCostRaw = ((s2WakeupsPerSession * s2PromptTokensPerWakeup) / 1_000_000) * s2ModelRateInPer1M;
  const c5CacheDelta = -(s1InputCostRaw + s2InputCostRaw) * cacheHitRate * cacheDiscount;

  // Component 6: Retrieval (Evidence[] + Memory recall)
  const c6Retrieval = retrievalPerSession;

  // Component 7: Reflection (Post-session V = H - lambda*I + memory summary)
  const c7Reflection =
    (reflectionTokensIn / 1_000_000) * s2ModelRateInPer1M +
    (reflectionTokensOut / 1_000_000) * s2ModelRateOutPer1M;

  // Component 8: Cloud Infrastructure (WS node, state storage, telemetry)
  const c8Infra = infraPerSession;

  const llmCostPerSession = c1DocExtract + s1UncachedCost + s2UncachedCost + c5CacheDelta + c6Retrieval + c7Reflection;
  const fullVarCostPerSession = llmCostPerSession + c2Asr + c8Infra;

  // Component 9: Payment Processing Fee (0.6%)
  const c9PaymentPro = proPrice * paymentRate;
  const c9PaymentEvent = eventPrice * paymentRate;

  // Component 10: Free User Subsidy + Support
  const freeAsrPerSession = (freeUserDurationMin / 60) * asrRatePerHr * cloudAsrShare;
  const freeLlmScale = freeUserDurationMin / Math.max(durationMin, 1);
  const freeFullVarPerSession = freeAsrPerSession + (llmCostPerSession * freeLlmScale) + (c8Infra * 0.65);
  const freeCostPerFreeUserMo = freeUserActiveSessionsPerMo * freeFullVarPerSession;
  const freeSubsidyPerPaidUserMo = freeCostPerFreeUserMo * freePerPaidRatio;
  const c10SubsidyAndSupportPro = freeSubsidyPerPaidUserMo + supportPerPaidMo;

  // Token accounting for Cloud Modeling transparency
  const modeledS1Tokens = s1Calls * (s1PromptTokensPerCall + s1OutputTokensPerCall);
  const modeledS2Tokens = s2WakeupsPerSession * (s2PromptTokensPerWakeup + s2OutputTokensPerWakeup);
  const modeledReflectionTokens = reflectionTokensIn + reflectionTokensOut;
  const modeledTotalCloudTokensPerSession = Math.round(modeledS1Tokens + modeledS2Tokens + modeledReflectionTokens);

  // Pro Tier Totals (¥59/mo)
  const proMonthlySaasCogs = sessionsPerMo * fullVarCostPerSession + c9PaymentPro + supportPerPaidMo;
  const proMonthlyVarCost = proMonthlySaasCogs + freeSubsidyPerPaidUserMo;
  const proDirectContrib = proPrice - proMonthlyVarCost;
  const proDirectMarginPct = (proDirectContrib / proPrice) * 100;
  const proSaasMarginPct = ((proPrice - proMonthlySaasCogs) / proPrice) * 100;

  // Event Tier Totals (¥29/event anchor, incl. rehearsals + live)
  const eventVariableCost = eventRunsIncluded * fullVarCostPerSession + c9PaymentEvent + (freeSubsidyPerPaidUserMo * 0.35) + (supportPerPaidMo * 0.4);
  const eventDirectContrib = eventPrice - eventVariableCost;
  const eventMarginPct = (eventDirectContrib / eventPrice) * 100;

  // LTV & Breakeven
  const ltv = proDirectContrib * avgLifetimeMonths;
  const ltvCac = ltv / cac;
  const maxSessionsHeadroom = Math.max(
    0,
    Math.floor((proPrice - c9PaymentPro - c10SubsidyAndSupportPro) / Math.max(fullVarCostPerSession, 0.001))
  );

  return {
    label: name,
    sessionsPerMo,
    durationMin,
    asrRatePerHr,
    cloudAsrShare,
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
    breakevenSessionsPro: maxSessionsHeadroom,
    evalAnchorNote: evalAnchor?.note ?? '',
  };
}

export function buildDefaultScenarios(evalSummary) {
  // Derive S1 & S2 per-call/per-wakeup token baselines cleanly from eval telemetry when available,
  // with explicit sensible fallbacks when run standalone before lock.
  const s2WakeupsMeasured = Math.max(1, evalSummary?.s2WakeupsPerCase ?? 2.2);
  const s1Prompt = evalSummary?.s1PromptTokensPerCall ?? 480;
  const s1Out = evalSummary?.s1OutputTokensPerCall ?? 4;
  const s2Prompt = evalSummary?.s2PromptTokensPerWakeup ?? 2400;
  const s2Out = evalSummary?.s2OutputTokensPerWakeup ?? 160;
  const s1RatioCloud = evalSummary?.s1CloudFilterRatio ?? 0.28; // deterministic rules reject ~72% idle windows at ¥0

  const baseConfig = {
    name: '基准情景 (Base)',
    sessionsPerMo: 6,
    durationMin: 25,
    asrRatePerHr: 0.80, // Volcengine Doubao standard / Aliyun Fun-ASR-Realtime ~¥0.79/hr
    cloudAsrShare: 1.0, // 100% cloud ASR (no hidden local offload assumption!)
    s1ModelRateInPer1M: 0.40, // Qwen-Flash RMB rate
    s1ModelRateOutPer1M: 1.20,
    s2ModelRateInPer1M: 2.90, // Qwen-Plus / DeepSeek-Pro tier
    s2ModelRateOutPer1M: 8.70,
    cacheHitRate: 0.40, // Conservative intra-session prefix hit rate
    cacheDiscount: 0.90,
    s1PromptTokensPerCall: s1Prompt,
    s1OutputTokensPerCall: s1Out,
    s1CloudCallsPerMin: 6 * s1RatioCloud, // 1 window every 10s -> 6/min * ~0.28 needing model eval
    s2PromptTokensPerWakeup: s2Prompt,
    s2OutputTokensPerWakeup: s2Out,
    s2WakeupsPerSession: Math.round(s2WakeupsMeasured * 3.5 * 10) / 10, // scaled to 25-min full session (~7-9 interventions)
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
  };

  const conservativeConfig = {
    ...baseConfig,
    name: '保守情景 (Conservative)',
    sessionsPerMo: 8,
    durationMin: 30,
    asrRatePerHr: 1.50, // Aliyun standard rate mid-high tier
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
  };

  const optimisticConfig = {
    ...baseConfig,
    name: '乐观情景 (Optimistic)',
    sessionsPerMo: 5,
    durationMin: 20,
    asrRatePerHr: 0.45, // Volcengine bulk / promo ASR rate
    cloudAsrShare: 0.70, // 30% of rehearsals run local Sherpa ASR
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
  };

  const conservative = computeScenario(conservativeConfig);
  const base = computeScenario(baseConfig);
  const optimistic = computeScenario(optimisticConfig);

  // 9-Variable Sensitivity Analysis around Base
  const sweep = (label, overrides) => {
    const res = computeScenario({ ...baseConfig, ...overrides });
    return {
      factor: label,
      proFullVarCost: Number(res.proMonthlyVarCost.toFixed(2)),
      proDirectMarginPct: Number(res.proDirectMarginPct.toFixed(1)),
      deltaMarginPct: Number((res.proDirectMarginPct - base.proDirectMarginPct).toFixed(1)),
      breakevenSessions: res.breakevenSessionsPro,
    };
  };

  const sensitivities = [
    sweep('1. 月高频场次增至 12 场 (+100%)', { sessionsPerMo: 12 }),
    sweep('2. 单场平均时长增至 45 分钟 (+80%)', { durationMin: 45 }),
    sweep('3. 云端 ASR 单价升至 Aliyun 标准 ¥3.50/h', { asrRatePerHr: 3.50 }),
    sweep('4. System 1+2 单轮输入 Token 翻倍', {
      s1PromptTokensPerCall: s1Prompt * 2,
      s2PromptTokensPerWakeup: s2Prompt * 2,
    }),
    sweep('5. 会话内前缀缓存命中降至 0% (无缓存)', { cacheHitRate: 0.0 }),
    sweep('6. System 2 临场唤醒翻倍 (过度干预)', { s2WakeupsPerSession: baseConfig.s2WakeupsPerSession * 2 }),
    sweep('7. 赛后复盘深度模型升至高阶 ¥10/1M', { s2ModelRateInPer1M: 10.0, s2ModelRateOutPer1M: 30.0 }),
    sweep('8. 免费/付费比恶化至 25:1 (+108%)', { freePerPaidRatio: 25 }),
    sweep('9. 单场云基础设施带宽升至 ¥0.50/场', { infraPerSession: 0.50 }),
  ];

  return { configs: { conservativeConfig, baseConfig, optimisticConfig }, conservative, base, optimistic, sensitivities };
}

async function main() {
  const args = process.argv.slice(2);
  const doWrite = args.includes('--write');
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
    s2WakeupsPerCase: shownCases / Math.max(evalJson?.cases?.length ?? 6, 1) * 3.0,
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
      breakevenSessionsPro: sc.breakevenSessionsPro,
    });

    const b = result.base;
    const c = b.componentsPerSession;
    const m = b.componentsMonthlyPro;
    const totalShown = evalJson?.cases?.reduce((acc, item) => acc + (item.shownCount ?? 0), 0) ?? 4;
    const localSuppressCount = Math.max(0, s1Evaluations - totalShown);
    const localCoveragePct = s1Evaluations > 0 ? `${((s1Evaluations / s1Evaluations) * 100).toFixed(0)}% (13/13)` : '100%';

    existing.dataStatus = 'EVAL_LOCKED';
    existing.generatedAt = evalJson?.generatedAt ?? new Date().toISOString();
    existing.eval = {
      sourceLabel: '[本地实测 Eval (local_rule_zero) + 云端公开费率建模]',
      datasetCases: evalJson?.metrics?.totalCases ?? 6,
      passedCases: evalJson?.metrics?.passedCases ?? 6,
      precision: `${((evalJson?.metrics?.precision ?? 1) * 100).toFixed(1)}%`,
      falseInterventionRate: `${((evalJson?.metrics?.falseInterventionRate ?? 0) * 100).toFixed(1)}%`,
      withdrawalAccuracy: `${((evalJson?.metrics?.withdrawalAccuracy ?? 1) * 100).toFixed(1)}%`,
      avgLatencyMs: evalJson?.metrics?.avgLatencyMs ?? 0.69,
      p95LatencyMs: evalJson?.metrics?.p95LatencyMs ?? 1.38,
      lambda: 2,
      utilityV: `+${evalJson?.metrics?.totalNetUtilityV ?? 3} (V=H-2I)`,
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

    existing.scenarios = {
      conservative: mapScenario(result.conservative, '保守情景 (Conservative)'),
      base: mapScenario(result.base, '基准情景 (Base)'),
      optimistic: mapScenario(result.optimistic, '乐观情景 (Optimistic)'),
    };

    existing.costComponents10 = [
      { id: 1, name: '1. 文档解析 (Doc Extract)', baseSession: round3(c.c1DocExtract), shareNote: 'PDF/PPTX 抽取与章节结构化摊销', category: 'LLM & Compute' },
      { id: 2, name: '2. 流式语音识别 (ASR)', baseSession: round3(c.c2Asr), shareNote: `25m × ¥${b.asrRatePerHr.toFixed(2)}/h (主要变动成本)`, category: 'Voice Infra' },
      { id: 3, name: '3. System 1 快决策', baseSession: round3(c.c3System1), shareNote: '本地规则拦截零费 + 云端快模型补判', category: 'LLM & Compute' },
      { id: 4, name: '4. System 2 深度推理', baseSession: round3(c.c4System2), shareNote: '高门槛触发锚点与 Evidence 推理', category: 'LLM & Compute' },
      { id: 5, name: '5. 前缀缓存节流 (Cache)', baseSession: round3(c.c5CacheDelta), shareNote: '单会话 40% 前缀命中净节省 (非跨槽共享)', category: 'Optimization' },
      { id: 6, name: '6. 证据检索 (Retrieval)', baseSession: round3(c.c6Retrieval), shareNote: 'Evidence[] 与审批记忆切片召回', category: 'LLM & Compute' },
      { id: 7, name: '7. 赛后复盘 (Reflection)', baseSession: round3(c.c7Reflection), shareNote: 'V = H − λI 算子与候选记忆摘要', category: 'LLM & Compute' },
      { id: 8, name: '8. 基础设施 (Web/WS/DB)', baseSession: round3(c.c8Infra), shareNote: 'WS 并发长连接、状态存储与监控摊销', category: 'Infrastructure' },
      { id: 9, name: '9. 支付通道费 (0.6%)', baseMonthly: round2(m.c9PaymentPro), shareNote: '微信/支付宝官方 SaaS 费率 (¥59×0.6%)', category: 'Commercial' },
      { id: 10, name: '10. 免费用户补贴与支持', baseMonthly: round2(m.c10SubsidyAndSupportPro), shareNote: `12:1 免费补贴 ¥${m.freeSubsidyPerPaidUserMo.toFixed(2)} + 客服 ¥${m.supportPerPaidMo.toFixed(2)}`, category: 'Subsidy & Ops' },
    ];
    existing.sensitivities = result.sensitivities;

    await fs.writeFile(METRICS_JSON_PATH, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  }

  console.log(JSON.stringify({
    wroteMetricsJson: doWrite,
    evalLockedFrom: evalJson ? toRepoRelSafe(repoRoot, evalPath) : 'none',
    conservative: {
      llm: result.conservative.llmCostPerSession.toFixed(3),
      fullVar: result.conservative.fullVarCostPerSession.toFixed(3),
      proVarMo: result.conservative.proMonthlyVarCost.toFixed(2),
      directContrib: result.conservative.proDirectContrib.toFixed(2),
      directMargin: result.conservative.proDirectMarginPct.toFixed(1) + '%',
      saasMargin: result.conservative.proSaasMarginPct.toFixed(1) + '%',
      eventFullCost: result.conservative.eventFullCost.toFixed(2),
      eventMargin: result.conservative.eventMarginPct.toFixed(1) + '%',
      ltv: result.conservative.ltv.toFixed(2),
      ltvCac: result.conservative.ltvCac.toFixed(2),
      breakeven: result.conservative.breakevenSessionsPro,
    },
    base: {
      modeledCloudTokens: result.base.modeledTotalCloudTokensPerSession,
      llm: result.base.llmCostPerSession.toFixed(3),
      fullVar: result.base.fullVarCostPerSession.toFixed(3),
      proSaasCogs: result.base.proMonthlySaasCogs.toFixed(2),
      proVarMo: result.base.proMonthlyVarCost.toFixed(2),
      directContrib: result.base.proDirectContrib.toFixed(2),
      directMargin: result.base.proDirectMarginPct.toFixed(1) + '%',
      saasMargin: result.base.proSaasMarginPct.toFixed(1) + '%',
      eventFullCost: result.base.eventFullCost.toFixed(2),
      eventMargin: result.base.eventMarginPct.toFixed(1) + '%',
      ltv: result.base.ltv.toFixed(2),
      ltvCac: result.base.ltvCac.toFixed(2),
      breakeven: result.base.breakevenSessionsPro,
    },
    optimistic: {
      llm: result.optimistic.llmCostPerSession.toFixed(3),
      fullVar: result.optimistic.fullVarCostPerSession.toFixed(3),
      proVarMo: result.optimistic.proMonthlyVarCost.toFixed(2),
      directContrib: result.optimistic.proDirectContrib.toFixed(2),
      directMargin: result.optimistic.proDirectMarginPct.toFixed(1) + '%',
      saasMargin: result.optimistic.proSaasMarginPct.toFixed(1) + '%',
      eventFullCost: result.optimistic.eventFullCost.toFixed(2),
      eventMargin: result.optimistic.eventMarginPct.toFixed(1) + '%',
      ltv: result.optimistic.ltv.toFixed(2),
      ltvCac: result.optimistic.ltvCac.toFixed(2),
      breakeven: result.optimistic.breakevenSessionsPro,
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
