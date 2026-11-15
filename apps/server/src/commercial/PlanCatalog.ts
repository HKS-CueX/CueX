import {
  createMoneyAmount,
  type PlanDefinition,
  type PlanId,
  type PaymentCheckoutPreviewRequest,
} from '@cuex/protocol';

const DEFAULT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const PLAN_CATALOG: readonly PlanDefinition[] = [
  {
    planId: 'free',
    name: 'Free Starter',
    displayName: '免费探索版（Free）',
    status: 'active',
    billingCycle: 'none',
    price: createMoneyAmount(0),
    quotas: {
      monthlySessionsLimit: 2,
      liveMinutesLimit: 20,
      maxFactsPerPack: 30,
      maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
      reflectionEnabled: true,
      singlePointRehearsalEnabled: true,
      persistentMemoryEnabled: false,
      cloudAsrMinutesIncluded: 20,
    },
    features: [
      '每月 2 场完整汇报/答辩实时辅助（每场建议 10 分钟，共含 20 分钟云端流式 ASR）',
      '完整实时状态 Inspector 与零幻觉控制器护栏',
      '上下文编译器（CueSheet + 事实白名单 + Q&A 预测）',
      '支持本地 Sherpa / 浏览器 Web Speech 降级与文本仿真',
    ],
    limitations: [
      '每月硬顶 2 场 / 20 分钟云端流式 ASR，超出后平滑切换免费本地/浏览器路径',
      '不保留跨月长期审批记忆，单场事实白名单上限 30 条',
    ],
    isCommercialHypothesis: true,
  },
  {
    planId: 'event',
    name: 'Event Pass',
    displayName: '单场赛事/答辩通行证（Event Pass）',
    status: 'active',
    billingCycle: 'one_time_14d',
    price: createMoneyAmount(2900),
    quotas: {
      monthlySessionsLimit: 20,
      liveMinutesLimit: 120,
      maxFactsPerPack: 100,
      maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
      reflectionEnabled: true,
      singlePointRehearsalEnabled: true,
      persistentMemoryEnabled: true,
      cloudAsrMinutesIncluded: 120,
    },
    features: [
      '14 天有效期内最多 20 场高频排练与实战切换（推荐 2–3 场彩排 + 1 场正式上台 + 复盘）',
      '包含 120 分钟云端流式 ASR 总额度',
      '单包支持 100 条可锁定核验事实与 Q&A 卡片',
      '完整数据一键导出（JSON / Markdown）与场后拭除',
    ],
    limitations: [
      '面向个人重要答辩/路演周期（14 天）',
      '商业定价为可验证假设口径，需配置真实支付网关后方可结算',
    ],
    isCommercialHypothesis: true,
  },
  {
    planId: 'pro',
    name: 'Presenter Pro',
    displayName: '高频演讲者专业版（Pro）',
    status: 'active',
    billingCycle: 'monthly',
    price: createMoneyAmount(5900),
    annualPrice: createMoneyAmount(49900),
    quotas: {
      monthlySessionsLimit: null,
      liveMinutesLimit: 240,
      maxFactsPerPack: null,
      maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
      reflectionEnabled: true,
      singlePointRehearsalEnabled: true,
      persistentMemoryEnabled: true,
      cloudAsrMinutesIncluded: 240,
    },
    features: [
      '不限场次的实时低打扰提示控制器与无限材料包编译',
      '跨场次 Opt-in 长期审批记忆（完全可控可删）',
      '每月 240 分钟云端流式 ASR 与远端推理优先级通道',
      '完整全链路遥测（Tokens / Retries / P95 延迟 / V=H-λI）',
    ],
    limitations: [
      '每月含 240 分钟云端流式 ASR，超出后平滑降级至本地/浏览器路径或叠加 Event 加油包',
      '团队共享工作区与管理员审计正在规划中',
    ],
    isCommercialHypothesis: true,
  },
  {
    planId: 'team',
    name: 'Enterprise & Team',
    displayName: '团队协作版（规划中 Team）',
    status: 'planned',
    billingCycle: 'monthly',
    price: createMoneyAmount(19900),
    annualPrice: createMoneyAmount(199000),
    quotas: {
      monthlySessionsLimit: null,
      liveMinutesLimit: null,
      maxFactsPerPack: null,
      maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
      reflectionEnabled: true,
      singlePointRehearsalEnabled: true,
      persistentMemoryEnabled: true,
      cloudAsrMinutesIncluded: 1_000,
    },
    features: [
      '多演讲者共享事实白名单与禁用边界库（规划中）',
      '组织级 SSO、配额分配与合规归档（规划中）',
    ],
    limitations: [
      '尚未开放购买或自助结算，仅作未来路线图展示',
    ],
    isCommercialHypothesis: true,
  },
];

export function listPlans(): PlanDefinition[] {
  return structuredClone([...PLAN_CATALOG]);
}

export function getPlanById(planId: PlanId): PlanDefinition | undefined {
  const found = PLAN_CATALOG.find((p) => p.planId === planId);
  return found ? structuredClone(found) : undefined;
}

export function resolvePlanPriceFen(
  plan: PlanDefinition,
  billingCycle: PaymentCheckoutPreviewRequest['billingCycle'],
): number {
  if (billingCycle === 'annual' && plan.annualPrice) {
    return plan.annualPrice.amountFen;
  }
  return plan.price.amountFen;
}
