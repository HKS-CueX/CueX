export type DecisionQuestion =
  | { kind: 'noul'; question: string }
  | { kind: 'score'; question: string }
  | { kind: 'choice'; question: string; options: string[] };

export interface DecisionAnswer {
  kind: 'noul' | 'score' | 'choice';
  probabilities: Record<string, number>;
  value: number;
  top: string;
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
}

export interface TokenDecisionClient {
  readonly backend: string;
  health?(): Promise<{ ok: boolean; detail?: string }>;
  decide(
    state: string,
    questions: Record<string, DecisionQuestion>,
    signal?: AbortSignal,
  ): Promise<TokenDecisionResult>;
}
