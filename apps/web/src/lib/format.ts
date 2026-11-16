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
  PresentationSceneType,
  TelemetryUsageSource,
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

export const API_ERROR_LABELS: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: '请求参数校验未通过',
  UNAUTHORIZED: '当前认证凭据无效或已过期，请刷新会话或重新登录',
  FORBIDDEN: '无权访问其他用户或租户的资源',
  NOT_FOUND: '请求的资源不存在或已被清除',
  RATE_LIMITED: '请求过于频繁，触发限流保护，请稍后重试',
  PROVIDER_TIMEOUT: '推理或外部服务超时，可重试或降级使用本地规则模式',
  PROVIDER_UNAVAILABLE: '外部推理或识别服务暂不可用',
  QUOTA_EXCEEDED: '当前套餐可用会话或实时时长额度已耗尽',
  SCHEMA_VERSION_UNSUPPORTED: '数据 Schema 版本不受支持',
  SESSION_EXPIRED: '会话已过期或已结束',
  ASR_UNAVAILABLE: '语音识别引擎暂不可用，请切换浏览器 Web Speech 或文本仿真',
  INSUFFICIENT_EVIDENCE: '已确认资料不足以支持该回答，禁止无依据编造',
  PAYMENT_NOT_CONFIGURED: '尚未接入真实商业支付商户（当前仅沙盒预览）',
  INTERNAL_ERROR: '服务端内部处理异常',
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
    if (typed.requestId) parts.push(`· 请求追踪 ${typed.requestId}`);
    return parts.join(' ');
  }
  if (err instanceof Error) return err.message;
  return '未知请求错误';
}

export const SCENE_TYPE_LABELS: Record<PresentationSceneType, string> = {
  pitch: '项目路演',
  defense: '课题答辩',
  academic: '学术汇报',
  keynote: '正式演讲',
  general: '通用演讲',
};

export const INTERVENTION_LEVEL_LABELS: Record<InterventionLevel, string> = {
  L0: 'L0 · 静默观察',
  L1: 'L1 · 边缘微光',
  L2: 'L2 · 关键词胶囊',
  L3: 'L3 · 结构化要点',
};

export const WITHDRAWAL_REASON_LABELS: Record<WithdrawalReason, string> = {
  user_recovered: '演讲者已主动补全，系统自动撤回',
  topic_changed: '话题已切换，原提示不再适用',
  chapter_changed: '章节已推进，旧提示自动失效',
  context_invalidated: '上下文版本更新，候选提示已作废',
  candidate_expired: '候选提示已超过 TTL 有效期',
  user_dismissed: '演讲者手动忽略',
  superseded: '已被更高优先级干预替代',
};

export const CONTROLLER_ACTION_LABELS: Record<ControllerAction, string> = {
  stay_silent: '保持静默 (L0)',
  show_l1_edge: '触发边缘微光 (L1)',
  show_l2_keyword: '显示关键词胶囊 (L2)',
  show_l3_scaffold: '展开要点脚手架 (L3)',
  withdraw: '主动撤回当前提示',
};

export const SUPPRESS_REASON_LABELS: Record<ControllerSuppressReason, string> = {
  silent_mode: '处于静默模式 (L0)',
  session_paused: '会话已暂停',
  ceiling_exceeded: '超过用户设定的最大干预上限',
  cooldown_active: '冷却窗口保护中，避免频繁打扰',
  user_dismissed_suppression: '该类提示近期已被用户忽略',
  candidate_expired: '候选提示已过期 (TTL)',
  stale_context_version: '候选上下文版本过旧 (Stale contextVersion)',
  ungrounded_evidence: '缺少已确认事实依据，已拦截未实证内容',
  no_semantic_need: '当前表达连贯，无语义缺口',
  pause_only_without_gap: '仅短暂停顿但无语义缺口，禁止误触发',
  user_already_recovering: '检测到用户正在自行修正，暂不干预',
  lower_priority: '优先级低于当前活跃提示',
};

export const ATTENTION_SIGNAL_LABELS: Record<AttentionSignal, string> = {
  fluent: '流畅推进',
  hesitating: '卡壳 / 检索中',
  drifting: '主题偏离',
  omission_risk: '关键点遗漏风险',
  answering_question: '现场问答应对中',
  recovering: '主动补正恢复中',
};

export const ASR_MODE_LABELS: Record<AsrBackendMode, string> = {
  colab_gpu: 'Colab GPU 云端流式 ASR',
  local_sherpa: '本地 Sherpa 流式 ASR',
  remote_sherpa: '远端 Sherpa 流式 ASR',
  browser_webspeech: '浏览器 Web Speech API',
  text_simulation: '文本仿真输入（非麦克风 ASR）',
};

export const COLAB_ASR_LIFECYCLE_LABELS: Record<ColabAsrLifecycleState, string> = {
  not_configured: '未配置 Colab ASR',
  starting: 'Colab ASR 启动中',
  ready: 'Colab GPU 就绪',
  degraded: 'Colab ASR 性能降级',
  disconnected: 'Colab ASR 连接断开',
  restarting: 'Colab ASR 重启恢复中',
  unavailable: 'Colab ASR 不可用',
};

export const PACE_STATUS_LABELS: Record<
  'on_pace' | 'slightly_fast' | 'slightly_behind' | 'overtime',
  string
> = {
  on_pace: '节奏稳健',
  slightly_fast: '语速偏快',
  slightly_behind: '略微滞后',
  overtime: '章节已超时',
};

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: '表达偏好',
  terminology: '专业术语',
  fact: '确认事实',
  pacing_habit: '节奏习惯',
  qa_pattern: '问答策略',
  style: '风格约束',
};

export const USAGE_SOURCE_LABELS: Record<TelemetryUsageSource, string> = {
  provider_reported: '模型商实报 (provider_reported)',
  provider_unreported: '供应商未回传用量（非零消耗）',
  local_rule_zero: '本地规则零 Token (local_rule_zero)',
  estimated: '显式估算 (estimated)',
};

export const PLAN_CYCLE_LABELS: Record<PlanDefinition['billingCycle'], string> = {
  none: '免费永久',
  one_time_14d: '14 天单场有效',
  monthly: '按月订阅',
  annual: '按年订阅',
};

export const USAGE_TYPE_LABELS: Record<UsageType, string> = {
  session_started: '开启会话',
  live_audio_ms: '实时音频时长',
  document_extract: '文档解析',
  context_compile: '上下文编译',
  system1_eval: 'System 1 评估',
  system2_synthesis: 'System 2 候选合成',
  reflection_generated: '场后复盘生成',
  memory_write: '个人记忆写入',
};
