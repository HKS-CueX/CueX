import type {
  AsrBackendMode,
  AttentionSignal,
  ControllerAction,
  ControllerSuppressReason,
  InterventionLevel,
  MemoryCategory,
  PresentationSceneType,
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
  local_sherpa: '本地 Sherpa 流式 ASR',
  remote_sherpa: '远端 Sherpa 流式 ASR',
  browser_webspeech: '浏览器 Web Speech API',
  text_simulation: '文本仿真输入（非麦克风 ASR）',
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
