import type { System1PromptFormat } from '@cuex/protocol';

export type DecisionQuestion =
  | { kind: 'noul'; question: string }
  | { kind: 'score'; question: string }
  | { kind: 'choice'; question: string; options: string[] };

export interface DecisionAnswer {
  kind: 'noul' | 'score' | 'choice';
  probabilities: Record<string, number>;
  value: number;
  top: string;
  /** 校准后最高概率与次高概率之差及分布香农熵（用于黑板观测与升级判定）。 */
  margin?: number;
  entropy?: number;
  selectedSlot?: number;
}

export interface TokenUsageSample {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  modelCalls: number;
}

export interface TokenDecisionResult {
  answers: Record<string, DecisionAnswer>;
  latencyMs: number;
  backend: string;
  usage: TokenUsageSample;
  model?: string;
  promptFormat?: System1PromptFormat;
  calibrated?: boolean;
}

export interface TokenDecisionHealth {
  ok: boolean;
  detail?: string;
  provider?: string;
  model?: string;
  promptFormat?: System1PromptFormat;
  calibrated?: boolean;
  degraded?: boolean;
}

export interface TokenDecisionClient {
  readonly backend: string;
  readonly model?: string;
  readonly promptFormat?: System1PromptFormat;
  readonly calibrated?: boolean;
  readonly providerKind?: 'colab_jev' | 'local_jev';
  health?(): Promise<TokenDecisionHealth>;
  decide(
    state: string,
    questions: Record<string, DecisionQuestion>,
    signal?: AbortSignal,
  ): Promise<TokenDecisionResult>;
}
