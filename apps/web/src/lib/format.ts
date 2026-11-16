import type {
  ApiErrorCode,
  AsrBackendMode,
  AttentionSignal,
  ColabAsrLifecycleState,
  ControllerAction,
  ControllerSuppressReason,
  InterventionLevel,
  MemoryCategory,
  MoneyAmount,
  PlanDefinition,
  PresentationReflection,
  PresentationSceneType,
  S1ProviderKind,
  System2GuidanceBias,
  TelemetryUsageSource,
  TranscriptSpeaker,
  UsageType,
  UtcIso8601,
  WithdrawalReason,
} from '@cuex/protocol';

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatMs(ms: number): string {
  return formatDuration(ms / 1000);
}

/**
 * Formats a UTC ISO-8601 timestamp into the user's local browser timezone.
 */
export function formatDateTime(iso?: UtcIso8601 | null): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(parsed));
  } catch {
    return new Date(parsed).toLocaleString();
  }
}

export function formatTime(iso?: UtcIso8601 | null): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(parsed));
  } catch {
    return new Date(parsed).toLocaleTimeString();
  }
}

/**
 * Display-only formatting for integer minor-unit MoneyAmount / CNY Fen.
 */
export function formatMoneyFen(input?: MoneyAmount | number | null): string {
  if (input === null || input === undefined) return '¥0.00';
  const fen = typeof input === 'number' ? input : input.amountFen;
  if (!Number.isFinite(fen)) return '¥0.00';
  const sign = fen < 0 ? '-' : '';
  const absFen = Math.round(Math.abs(fen));
  const yuan = Math.floor(absFen / 100);
  const remFen = absFen % 100;
  return `${sign}¥${yuan}.${String(remFen).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Extracts a crisp, peripheral-vision friendly headline and optional concise detail
 * from an intervention cue so presenters don't have to read long prefixes on stage.
 */
export function extractGlanceableCue(cueText: string, fallbackTitle?: string): {
  headline: string;
  subline?: string;
} {
  const cleaned = cueText
    .trim()
    .replace(/^(?:回到本节重点|收束回到|准备收尾本节|回到本节|围绕|补提|聚焦本节目标)[：:]\s*/u, '')
    .trim();

  if (cleaned.length <= 16) {
    return {
      headline: cleaned || fallbackTitle || '关键提示',
      subline: fallbackTitle && fallbackTitle !== cleaned ? fallbackTitle : undefined,
    };
  }

  const clauseMatch = cleaned.split(/[；;，,。！!？?]/u).map((s) => s.trim()).filter(Boolean);
  if (clauseMatch.length >= 2 && clauseMatch[0].length >= 4 && clauseMatch[0].length <= 18) {
    return {
      headline: clauseMatch[0],
      subline: clauseMatch.slice(1).join('，'),
    };
  }

  return {
    headline: cleaned,
    subline: fallbackTitle,
  };
}

export const API_ERROR_LABELS: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: '输入内容未通过检查，请核对后重试',
  UNAUTHORIZED: '登录状态已失效，请刷新页面重试',
  FORBIDDEN: '无权访问该内容',
  NOT_FOUND: '未找到对应记录',
  RATE_LIMITED: '操作过于频繁，请稍后再试',
  PROVIDER_TIMEOUT: '云端响应超时，已切换本地辅助继续运行',
  PROVIDER_UNAVAILABLE: '云端服务暂时繁忙，已切换备用辅助',
  QUOTA_EXCEEDED: '当前套餐可用场次或语音时长已用完',
  SCHEMA_VERSION_UNSUPPORTED: '数据格式版本不兼容',
  SESSION_EXPIRED: '当前演讲已结束',
  ASR_UNAVAILABLE: '语音识别暂时不可用，可切换浏览器语音或模拟输入',
  INSUFFICIENT_EVIDENCE: '讲稿材料未包含该项数据',
  COMPANION_READ_ONLY: '当前为提词伴随窗，麦克风与启停控制请在主舞台操作',
  PRIMARY_MIC_CONFLICT: '主控端控制权冲突：同一场演讲仅支持一个主舞台开启麦克风',
  PAYMENT_NOT_CONFIGURED: '当前处于公开体验期，暂未开启在线扣费',
  INTERNAL_ERROR: '服务处理遇到异常，请稍后重试',
};

export function formatApiError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    const typed = err as {
      code?: string;
      message: string;
      requestId?: string;
      retryable?: boolean;
    };
    const codeLabel =
      typed.code && typed.code in API_ERROR_LABELS
        ? API_ERROR_LABELS[typed.code as ApiErrorCode]
        : typed.code;
    const parts = [typed.message || codeLabel || '请求失败'];
    if (codeLabel && typed.message && !typed.message.includes(codeLabel)) {
      parts.unshift(`[${typed.code}]`);
    }
    if (typed.retryable) parts.push('（可重试）');
    if (typed.requestId) parts.push(`追踪号 ${typed.requestId}`);
    return parts.join(' ');
  }
  if (err instanceof Error) return err.message;
  return '网络请求失败，请稍后重试';
}

export const SCENE_TYPE_LABELS: Record<PresentationSceneType, string> = {
  pitch: '项目路演',
  defense: '课题答辩',
  academic: '学术汇报',
  keynote: '主题演讲',
  general: '日常汇报',
};

export const INTERVENTION_LEVEL_LABELS: Record<InterventionLevel, string> = {
  L0: '安静倾听',
  L1: '边缘微光',
  L2: '关键词提词',
  L3: '要点卡片',
};

export const WITHDRAWAL_REASON_LABELS: Record<WithdrawalReason, string> = {
  user_recovered: '已接回主线，提示自动收起',
  topic_changed: '话题已推进，提示自动收起',
  chapter_changed: '已进入下一章，旧提示自动收起',
  context_invalidated: '讲稿内容已更新，旧提示已收起',
  candidate_expired: '提示停留时间已到，自动收起',
  user_dismissed: '已手动收起',
  superseded: '已更新为最新提示',
};

export const CONTROLLER_ACTION_LABELS: Record<ControllerAction, string> = {
  stay_silent: '保持安静 (L0)',
  show_l1_edge: '边缘微光提醒 (L1)',
  show_l2_keyword: '显示关键词提词 (L2)',
  show_l3_scaffold: '展开要点卡片 (L3)',
  withdraw: '自动收起当前提示',
};

export const SUPPRESS_REASON_LABELS: Record<ControllerSuppressReason, string> = {
  silent_mode: '已开启免打扰模式',
  session_paused: '已暂停监听',
  ceiling_exceeded: '超过设定的提示详略上限',
  cooldown_active: '冷却间隔保护中，避免频繁提示',
  user_dismissed_suppression: '同类提示近期已被收起',
  candidate_expired: '候选提示已逾有效期',
  stale_context_version: '上下文已更新，旧候选跳过',
  ungrounded_evidence: '缺少讲稿依据支撑，已过滤',
  no_semantic_need: '表达顺畅，无需介入',
  pause_only_without_gap: '正常换气停顿，不作打断',
  user_already_recovering: '正在自然接回主线，暂不打扰',
  lower_priority: '低于当前显示提示优先级',
};

export const ATTENTION_SIGNAL_LABELS: Record<AttentionSignal, string> = {
  fluent: '表达顺畅',
  hesitating: '思考停顿',
  drifting: '略微偏题',
  omission_risk: '有待补要点',
  answering_question: '现场问答',
  recovering: '正在接回主线',
};

export const ASR_MODE_LABELS: Record<AsrBackendMode, string> = {
  colab_gpu: 'Colab GPU 云端流式语音',
  local_sherpa: '本地流式语音',
  remote_sherpa: '远端流式语音',
  browser_webspeech: '浏览器语音识别',
  text_simulation: '彩排模拟输入',
};

export const COLAB_ASR_LIFECYCLE_LABELS: Record<ColabAsrLifecycleState, string> = {
  not_configured: '未连接云端语音',
  starting: '语音服务启动中',
  ready: '云端语音就绪',
  degraded: '语音服务降级',
  disconnected: '语音连接已断开',
  restarting: '语音服务重连中',
  unavailable: '云端语音暂不可用',
};

export const PACE_STATUS_LABELS: Record<
  'on_pace' | 'slightly_fast' | 'slightly_behind' | 'overtime',
  string
> = {
  on_pace: '节奏适中',
  slightly_fast: '语速偏快',
  slightly_behind: '进度偏慢',
  overtime: '本节已超时',
};

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: '表达偏好',
  terminology: '常用术语',
  fact: '常用数据',
  pacing_habit: '语速与节奏',
  qa_pattern: '问答习惯',
  style: '表达风格',
};

export const FACT_CATEGORY_LABELS: Record<string, string> = {
  metric: '关键数字',
  claim: '核心观点',
  boundary: '表达边界',
  milestone: '重要进展',
  definition: '关键概念',
};

export const TIMELINE_EVENT_KIND_LABELS: Record<
  PresentationReflection['timeline'][number]['kind'],
  string
> = {
  segment: '现场发言',
  chapter_change: '切换章节',
  intervention_shown: '弹出提示',
  intervention_withdrawn: '自动收起',
  intervention_dismissed: '手动收起',
  qa_question: '观众提问',
  feedback: '提示评价',
};

export const SPEAKER_LABELS: Record<TranscriptSpeaker, string> = {
  presenter: '主讲人',
  audience: '听众提问',
  interlocutor: '互动嘉宾',
  unknown: '现场声音',
};

export const USAGE_SOURCE_LABELS: Record<TelemetryUsageSource, string> = {
  provider_reported: '云端模型实报',
  provider_unreported: '云端未回传明细',
  local_rule_zero: '本地引擎（零消耗）',
  estimated: '按量估算',
};

export const PLAN_CYCLE_LABELS: Record<PlanDefinition['billingCycle'], string> = {
  none: '长期免费',
  one_time_14d: '14 天有效',
  monthly: '按月订阅',
  annual: '按年订阅',
};

export const USAGE_TYPE_LABELS: Record<UsageType, string> = {
  session_started: '开启演讲',
  live_audio_ms: '实时语音识别',
  document_extract: '解析讲稿文件',
  context_compile: '生成演讲提纲',
  system1_eval: '实时语流判断',
  system2_synthesis: '检索提词生成',
  reflection_generated: '生成复盘报告',
  memory_write: '保存演讲偏好',
};

export const SYSTEM2_GUIDANCE_BIAS_LABELS: Record<System2GuidanceBias, string> = {
  stay_silent: '保持安静（L0）',
  prefer_l1: '优先边缘微光',
  prefer_l2: '优先关键词提词',
  prefer_l3: '优先要点卡片',
  qa_grounding: '现场问答强依据匹配',
  recovery_hold: '接回主线观察窗口',
};

export const S1_PROVIDER_KIND_LABELS: Record<S1ProviderKind, string> = {
  colab_jev: 'Colab JEV 快思考模型',
  local_jev: '本地 JEV 快思考模型',
  local_rule_zero: '本地快速规则',
};
