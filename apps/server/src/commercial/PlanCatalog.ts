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
    displayName: '免费体验版',
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
      '每月 2 场完整彩排与正式演讲辅助（含 20 分钟云端高精度语音识别）',
      '支持 PPTX、PDF、Markdown 讲稿导入与关键数据整理',
      '余光提词、现场追问数据核对与场后单点重练',
      '超出云端语音时长后可继续使用浏览器语音识别',
    ],
    limitations: [],
    isCommercialHypothesis: true,
  },
  {
    planId: 'event',
    name: 'Event Pass',
    displayName: '单场冲刺包',
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
      '14 天内最多 20 场密集彩排与正式上台，无需按月续费',
      '包含 120 分钟云端高精度流式语音识别',
      '单份讲稿支持最多 100 条关键数据与预测追问卡片',
      '支持完整复盘报告导出（Markdown / JSON）',
    ],
    limitations: [],
    isCommercialHypothesis: true,
  },
  {
    planId: 'pro',
    name: 'Presenter Pro',
    displayName: '个人专业版',
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
      '不限场次准备讲稿、彩排演练与正式上台辅助',
      '每月包含 240 分钟云端高精度流式语音识别',
      '跨场次保存个人演讲偏好与常用口径',
      '支持独立提词小窗与薄弱片段无限重练',
    ],
    limitations: [],
    isCommercialHypothesis: true,
  },
  {
    planId: 'team',
    name: 'Enterprise & Team',
    displayName: '团队协作版',
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
      '团队共享产品参数库、标准问答口径与对外表达边界',
      '多成员演讲包协作与统一权限管理',
    ],
    limitations: [],
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
