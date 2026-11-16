import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  LLM_REASONING_EFFORTS,
  nowUtcIso8601,
  SYSTEM2_GUIDANCE_BIASES,
  type Candidate,
  type CandidateKind,
  type FastDecisionInput,
  type FastDecisionVerdict,
  type InterventionLevel,
  type LlmReasoningEffort,
  type PresentationCompileInput,
  type PresentationContextPack,
  type PresentationQACard,
  type PresentationReflection,
  type ProviderUsageRecord,
  type SlowReasoningCandidateRequest,
  type SlowReasoningCandidateResult,
  type System2Guidance,
  type System2GuidanceBias,
} from '@cuex/protocol';
import { redactLogText } from '../../observability';
import {
  classifyFactCategory,
  extractKeywords,
  splitCandidateFacts,
} from '../../scenarios/presentation/PresentationCompiler';
import { wrapUntrustedPromptBlock } from '../../security';
import { numbersIn } from '../../system2/numbers';
import { clampSpoken } from '../../system2/spoken';
import { isoToMs, msToIso } from '../time';
import type { FastDecisionProvider, ProviderHealthStatus, SlowReasoningProvider } from '../types';
import { HeuristicFastDecisionProvider, isPresenterGreetingText } from './FastDecisionAdapter';
import { ProviderResilience } from './ProviderResilience';
import { LocalSlowReasoningProvider } from './SlowReasoningAdapter';

export type CpaApiMode = 'responses' | 'chat_completions' | 'auto';
export type CpaReasoningEffort = LlmReasoningEffort;

export const DEFAULT_CPA_SYSTEM1_MODEL = 'gemini-4-hydrogen';
export const DEFAULT_CPA_SYSTEM2_MODEL = 'gemini-4-hydrogen';
export const DEFAULT_CPA_SYSTEM2_REASONING_EFFORT: CpaReasoningEffort = 'medium';
export const DEFAULT_CPA_MAX_OUTPUT_TOKENS = 4096;
export const MIN_CPA_OUTPUT_TOKENS = 1024;
export const DEFAULT_CPA_TIMEOUT_MS = 25_000;
export const DEFAULT_CPA_S1_TIMEOUT_MS = 10_000;

export interface CpaConfigOptions {
  env?: NodeJS.ProcessEnv;
  allowDevModelsJson?: boolean;
  modelsJsonPath?: string;
}

export interface CpaResolvedConfig {
  baseUrl: string;
  apiMode: CpaApiMode;
  system1Model: string;
  system2Model: string;
  compilerModel: string;
  reflectionModel: string;
  timeoutMs: number;
  s1TimeoutMs: number;
  maxOutputTokens: number;
  reasoningEffort?: CpaReasoningEffort;
  /** System 2 / Compiler / Reflection 默认推理强度（默认 'medium'）。 */
  system2ReasoningEffort: CpaReasoningEffort;
  providerLabel: string;
  source: 'env' | 'dev_models_json';
  modelApiHints: Record<string, 'responses' | 'chat_completions'>;
  getApiKey(): string;
  redact(text: string): string;
}

export interface CpaUsageDetails {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  usageReported: boolean;
}

export interface CpaCompletionRequest {
  tier: 'system1' | 'system2' | 'compiler' | 'reflection';
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  reasoningEffort?: CpaReasoningEffort;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
}

export interface CpaCompletionResult<T = string> {
  text: string;
  parsed: T;
  model: string;
  endpoint: 'responses' | 'chat_completions';
  latencyMs: number;
  retries: number;
  usage: CpaUsageDetails;
}

export interface CpaStreamRequest extends CpaCompletionRequest {
  onDelta?: (delta: string) => void;
}

export interface CpaStreamResult {
  text: string;
  model: string;
  endpoint: 'responses' | 'chat_completions';
  firstTokenLatencyMs: number;
  totalLatencyMs: number;
  chunkCount: number;
  retries: number;
  usage: CpaUsageDetails;
}

export class CpaHttpError extends Error {
  readonly statusCode: number;
  readonly retryable: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'CpaHttpError';
    this.statusCode = statusCode;
    this.retryable = statusCode === 408 || statusCode === 429 || statusCode >= 500;
  }
}

interface RawModelsJson {
  providers?: Record<
    string,
    {
      baseUrl?: string;
      apiKey?: string;
      api?: string;
      models?: Array<{ id?: string; api?: string }>;
    }
  >;
}

export interface CpaClientOptions {
  fetch?: typeof fetch;
  resilience?: ProviderResilience;
}

function isTruthyFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  return /^(?:1|true|yes|on)$/i.test(raw.trim());
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function parseApiMode(raw: string | undefined): CpaApiMode {
  const clean = raw?.trim().toLowerCase();
  if (clean === 'responses' || clean === 'openai-responses') return 'responses';
  if (clean === 'chat_completions' || clean === 'openai-completions' || clean === 'chat') {
    return 'chat_completions';
  }
  return 'auto';
}

function parseReasoningEffort(raw: string | undefined): CpaReasoningEffort | undefined {
  const clean = raw?.trim().toLowerCase();
  if (clean && (LLM_REASONING_EFFORTS as readonly string[]).includes(clean)) {
    return clean as CpaReasoningEffort;
  }
  return undefined;
}

function mapModelApiHint(api?: string): 'responses' | 'chat_completions' | undefined {
  if (!api) return undefined;
  const clean = api.trim().toLowerCase();
  if (clean === 'openai-completions' || clean === 'chat_completions') return 'chat_completions';
  if (clean === 'openai-responses' || clean === 'responses') return 'responses';
  return undefined;
}

function buildRedactor(secret: string, extraNeedles: string[] = []): (text: string) => string {
  const home = homedir();
  return (text: string) => {
    let out = redactLogText(text);
    if (secret) out = out.split(secret).join('[REDACTED_KEY]');
    if (home && home.length > 3) out = out.split(home).join('$HOME');
    for (const needle of extraNeedles) {
      if (needle) out = out.split(needle).join('[REDACTED]');
    }
    return out;
  };
}

function sanitizeBaseUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim());
  parsed.username = '';
  parsed.password = '';
  return parsed.toString().replace(/\/+$/, '');
}

/**
 * Resolves unified CPA LLM configuration from environment variables or opt-in dev models.json.
 * Returns null if offline test lock is enabled or no CPA credentials are configured.
 */
export function resolveCpaConfig(opts: CpaConfigOptions = {}): CpaResolvedConfig | null {
  const env = opts.env ?? process.env;
  if (isTruthyFlag(env.CUEX_TEST_OFFLINE) && !env.CPA_FORCE_IN_OFFLINE_TEST) {
    return null;
  }

  const timeoutMs = parsePositiveInt(env.CPA_TIMEOUT_MS ?? env.CUEX_CPA_TIMEOUT_MS, DEFAULT_CPA_TIMEOUT_MS);
  const s1TimeoutMs = parsePositiveInt(
    env.CPA_S1_TIMEOUT_MS,
    Math.min(timeoutMs, DEFAULT_CPA_S1_TIMEOUT_MS),
  );
  const maxOutputTokens = Math.max(
    MIN_CPA_OUTPUT_TOKENS,
    parsePositiveInt(env.CPA_MAX_OUTPUT_TOKENS, DEFAULT_CPA_MAX_OUTPUT_TOKENS),
  );
  const apiMode = parseApiMode(env.CPA_API_MODE ?? env.CUEX_CPA_API_MODE);
  const explicitReasoningEffort = parseReasoningEffort(
    env.CPA_SYSTEM2_REASONING_EFFORT ?? env.CUEX_CPA_REASONING_EFFORT ?? env.CPA_REASONING_EFFORT,
  );
  const system2ReasoningEffort = explicitReasoningEffort ?? DEFAULT_CPA_SYSTEM2_REASONING_EFFORT;

  const envUrl = (env.CPA_BASE_URL ?? env.CUEX_CPA_BASE_URL)?.trim();
  const envKey = (env.CPA_API_KEY ?? env.CUEX_CPA_API_KEY)?.trim();

  let baseUrl = '';
  let apiKey = '';
  let source: 'env' | 'dev_models_json' = 'env';
  let providerLabel = env.CPA_PROVIDER_NAME?.trim() || 'cpa';
  const modelApiHints: Record<string, 'responses' | 'chat_completions'> = {};

  if (envUrl && envKey) {
    baseUrl = sanitizeBaseUrl(envUrl);
    apiKey = envKey;
    if (!env.CPA_PROVIDER_NAME?.trim()) {
      providerLabel = `cpa:${new URL(baseUrl).host}`;
    }
  } else {
    const devOptIn =
      Boolean(opts.allowDevModelsJson) ||
      Boolean(opts.modelsJsonPath?.trim()) ||
      Boolean(env.CPA_MODELS_JSON?.trim()) ||
      isTruthyFlag(env.CPA_DEV_MODELS_LOADER) ||
      isTruthyFlag(env.CPA_USE_PI_MODELS);
    if (!devOptIn) return null;

    const targetPath =
      opts.modelsJsonPath?.trim() ||
      env.CPA_MODELS_JSON?.trim() ||
      path.join(homedir(), '.pi', 'agent', 'models.json');

    let rawJson: RawModelsJson;
    try {
      rawJson = JSON.parse(readFileSync(targetPath, 'utf8')) as RawModelsJson;
    } catch {
      return null;
    }

    const providers = rawJson.providers ?? {};
    const preferredName = env.CPA_MODELS_PROVIDER?.trim() || 'gpt.kanglives.top';
    const selectedEntry =
      (providers[preferredName]?.baseUrl && providers[preferredName]?.apiKey
        ? [preferredName, providers[preferredName]] as const
        : Object.entries(providers).find(([, p]) => Boolean(p?.baseUrl?.trim() && p?.apiKey?.trim())));

    if (!selectedEntry || !selectedEntry[1]?.baseUrl || !selectedEntry[1]?.apiKey) {
      return null;
    }

    const [provName, prov] = selectedEntry;
    baseUrl = sanitizeBaseUrl(envUrl || prov.baseUrl!);
    apiKey = envKey || prov.apiKey!;
    source = 'dev_models_json';
    providerLabel = `cpa:${provName}`;

    const defaultHint = mapModelApiHint(prov.api);
    for (const m of prov.models ?? []) {
      if (!m?.id) continue;
      const hint = mapModelApiHint(m.api) ?? defaultHint;
      if (hint) modelApiHints[m.id] = hint;
    }
  }

  const system1Model = env.CPA_SYSTEM1_MODEL?.trim() || DEFAULT_CPA_SYSTEM1_MODEL;
  const system2Model =
    (env.CPA_SYSTEM2_MODEL ?? env.CUEX_CPA_SYSTEM2_MODEL)?.trim() || DEFAULT_CPA_SYSTEM2_MODEL;
  const compilerModel =
    (env.CPA_COMPILER_MODEL ?? env.CUEX_CPA_COMPILER_MODEL)?.trim() || system2Model;
  const reflectionModel =
    (env.CPA_REFLECTION_MODEL ?? env.CUEX_CPA_REFLECTION_MODEL)?.trim() || system2Model;

  const redact = buildRedactor(apiKey);
  return {
    baseUrl,
    apiMode,
    system1Model,
    system2Model,
    compilerModel,
    reflectionModel,
    timeoutMs,
    s1TimeoutMs,
    maxOutputTokens,
    ...(explicitReasoningEffort ? { reasoningEffort: explicitReasoningEffort } : {}),
    system2ReasoningEffort,
    providerLabel,
    source,
    modelApiHints,
    getApiKey: () => apiKey,
    redact,
  };
}

/**
 * Strips markdown code fences and extracts the outermost balanced JSON object from model text.
 */
export function extractJsonObject<T>(rawText: string): T {
  const trimmed = rawText.replace(/^\uFEFF/, '').trim();
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const startIdx = candidate.indexOf('{');
    if (startIdx >= 0) {
      let depth = 0;
      let inStr = false;
      let escaped = false;
      for (let i = startIdx; i < candidate.length; i += 1) {
        const ch = candidate[i];
        if (inStr) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            return JSON.parse(candidate.slice(startIdx, i + 1)) as T;
          }
        }
      }
    }
    throw new Error(`CPA model output is not valid JSON (${clampSpoken(candidate, 96)})`);
  }
}

export function extractCpaUsage(body: Record<string, unknown>): CpaUsageDetails {
  const rawUsage = body.usage;
  if (!rawUsage || typeof rawUsage !== 'object') {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      usageReported: false,
    };
  }
  const u = rawUsage as Record<string, unknown>;
  const hasResponsesFields = typeof u.input_tokens === 'number' || typeof u.output_tokens === 'number';
  const hasChatFields = typeof u.prompt_tokens === 'number' || typeof u.completion_tokens === 'number';

  if (!hasResponsesFields && !hasChatFields) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      usageReported: false,
    };
  }

  const inputDetails = (u.input_tokens_details ?? u.prompt_tokens_details) as
    | Record<string, unknown>
    | undefined;
  const outputDetails = (u.output_tokens_details ?? u.completion_tokens_details) as
    | Record<string, unknown>
    | undefined;

  const inputTokens = Math.max(0, Number(hasResponsesFields ? (u.input_tokens ?? 0) : (u.prompt_tokens ?? 0)));
  const outputTokens = Math.max(0, Number(hasResponsesFields ? (u.output_tokens ?? 0) : (u.completion_tokens ?? 0)));
  const cachedInputTokens = Math.max(0, Number(inputDetails?.cached_tokens ?? 0));
  const reasoningTokens = Math.max(0, Number(outputDetails?.reasoning_tokens ?? 0));
  const totalTokens = Math.max(inputTokens + outputTokens, Number(u.total_tokens ?? 0));

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    totalTokens,
    usageReported: true,
  };
}

function extractTextFromCpaResponse(
  body: Record<string, unknown>,
  endpoint: 'responses' | 'chat_completions',
): string {
  if (endpoint === 'chat_completions') {
    const choices = Array.isArray(body.choices) ? body.choices : [];
    const first = choices[0] as { message?: { content?: unknown } } | undefined;
    const content = first?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => (part && typeof part === 'object' ? (part as { text?: string }).text ?? '' : ''))
        .join('');
    }
    return '';
  }

  if (typeof body.output_text === 'string' && body.output_text.trim()) {
    return body.output_text;
  }

  const outputs = Array.isArray(body.output) ? body.output : [];
  const chunks: string[] = [];
  for (const item of outputs) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as { type?: string; text?: string; content?: Array<{ type?: string; text?: string }> };
    if (obj.type === 'message' && Array.isArray(obj.content)) {
      for (const c of obj.content) {
        if (typeof c?.text === 'string') chunks.push(c.text);
      }
    } else if (typeof obj.text === 'string') {
      chunks.push(obj.text);
    }
  }
  return chunks.join('');
}

export function buildProviderUsageRecord(params: {
  usage: CpaUsageDetails;
  retries: number;
  provider: string;
  model: string;
  degraded?: boolean;
  correlationId?: string;
}): ProviderUsageRecord {
  return {
    inputTokens: params.usage.inputTokens,
    outputTokens: params.usage.outputTokens,
    cachedInputTokens: params.usage.cachedInputTokens,
    reasoningTokens: params.usage.reasoningTokens,
    modelCalls: 1,
    retries: params.retries,
    usageSource: params.usage.usageReported ? 'provider_reported' : 'provider_unreported',
    degraded: Boolean(params.degraded),
    costFen: 0,
    provider: params.provider,
    model: params.model,
    ...(params.correlationId ? { correlationId: params.correlationId } : {}),
  };
}

/**
 * Single centralized CPA LLM HTTP gateway client supporting `/v1/responses` and `/v1/chat/completions`.
 */
export class CpaClient {
  private readonly fetchFn: typeof fetch;
  readonly resilience: ProviderResilience;

  constructor(
    readonly config: CpaResolvedConfig,
    opts: CpaClientOptions = {},
  ) {
    this.fetchFn = opts.fetch ?? globalThis.fetch;
    this.resilience =
      opts.resilience ??
      new ProviderResilience({
        failureThreshold: 3,
        cooldownMs: 15_000,
      });
  }

  get defaultModel(): string {
    return this.config.system2Model;
  }

  resolveModelForTier(tier: CpaCompletionRequest['tier'], override?: string): string {
    if (override?.trim()) return override.trim();
    switch (tier) {
      case 'system1':
        return this.config.system1Model;
      case 'compiler':
        return this.config.compilerModel;
      case 'reflection':
        return this.config.reflectionModel;
      case 'system2':
      default:
        return this.config.system2Model;
    }
  }

  resolveEndpoint(model: string): 'responses' | 'chat_completions' {
    if (this.config.apiMode !== 'auto') return this.config.apiMode;
    return this.config.modelApiHints[model] ?? 'responses';
  }

  health(tier: 'system1' | 'system2' | 'compiler' | 'reflection' = 'system2'): ProviderHealthStatus {
    const breakerKey = `cpa:${tier}:${this.config.providerLabel}`;
    const circuit = this.resilience.getCircuitState(breakerKey);
    const model = this.resolveModelForTier(tier);
    const effort =
      tier === 'system1'
        ? (this.config.reasoningEffort ?? (/hydrogen/i.test(model) ? 'low' : undefined))
        : this.config.system2ReasoningEffort;
    const lastHealthCheckAt = nowUtcIso8601();
    if (circuit.isOpen) {
      return {
        ok: false,
        detail: `Circuit breaker open for ${this.config.providerLabel} (${tier})`,
        provider: this.config.providerLabel,
        model,
        degraded: true,
        fallbackActive: true,
        fallbackReason: `Circuit breaker open (${tier})`,
        ...(effort ? { reasoningEffort: effort } : {}),
        compilerModel: this.config.compilerModel,
        reflectionModel: this.config.reflectionModel,
        lastHealthCheckAt,
      };
    }
    return {
      ok: true,
      detail: `CPA ready (${this.config.providerLabel}, model=${model}, endpoint=${this.resolveEndpoint(model)}${effort ? `, effort=${effort}` : ''})`,
      provider: this.config.providerLabel,
      model,
      degraded: false,
      fallbackActive: false,
      ...(effort ? { reasoningEffort: effort } : {}),
      compilerModel: this.config.compilerModel,
      reflectionModel: this.config.reflectionModel,
      lastHealthCheckAt,
    };
  }

  private buildPayload(
    req: CpaCompletionRequest,
    model: string,
    endpoint: 'responses' | 'chat_completions',
    stream: boolean,
  ): Record<string, unknown> {
    const maxTokens = Math.max(
      MIN_CPA_OUTPUT_TOKENS,
      req.maxOutputTokens ?? this.config.maxOutputTokens,
    );
    const effort =
      req.reasoningEffort ??
      (req.tier === 'system1'
        ? (this.config.reasoningEffort ?? (/hydrogen/i.test(model) ? 'low' : undefined))
        : this.config.system2ReasoningEffort);

    if (endpoint === 'responses') {
      return {
        model,
        instructions: req.systemPrompt,
        input: req.userPrompt,
        max_output_tokens: maxTokens,
        ...(effort ? { reasoning: { effort } } : {}),
        ...(stream ? { stream: true } : {}),
      };
    }

    return {
      model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
      max_tokens: maxTokens,
      ...(effort ? { reasoning_effort: effort } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(stream ? { stream: true } : {}),
    };
  }

  private throwForErrorResponse(status: number, rawBodyText: string): never {
    let bodyJson: Record<string, unknown> = {};
    try {
      bodyJson = rawBodyText ? (JSON.parse(rawBodyText) as Record<string, unknown>) : {};
    } catch {
      throw new CpaHttpError(this.config.redact(`CPA HTTP ${status} non-JSON response`), status);
    }
    const errObj = bodyJson.error as { code?: unknown; message?: unknown } | undefined;
    const errDetail = errObj?.message ? String(errObj.message) : rawBodyText.slice(0, 160);
    throw new CpaHttpError(this.config.redact(`CPA HTTP ${status}: ${errDetail}`), status);
  }

  async completeJson<T>(req: CpaCompletionRequest): Promise<CpaCompletionResult<T>> {
    const model = this.resolveModelForTier(req.tier, req.model);
    const endpoint = this.resolveEndpoint(model);
    const timeoutMs = req.timeoutMs ?? (req.tier === 'system1' ? this.config.s1TimeoutMs : this.config.timeoutMs);
    const breakerKey = `cpa:${req.tier}:${this.config.providerLabel}`;
    const start = performance.now();

    const outcome = await this.resilience.execute({
      breakerKey,
      timeoutMs,
      maxRetries: req.maxRetries ?? 1,
      baseDelayMs: 80,
      signal: req.signal,
      operation: async (attemptSignal) => {
        const url = `${this.config.baseUrl}/${endpoint === 'responses' ? 'responses' : 'chat/completions'}`;
        const bodyPayload = this.buildPayload(req, model, endpoint, false);

        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.getApiKey()}`,
          },
          body: JSON.stringify(bodyPayload),
          signal: attemptSignal,
        });

        const rawBodyText = await response.text();
        if (!response.ok) {
          this.throwForErrorResponse(response.status, rawBodyText);
        }

        let bodyJson: Record<string, unknown> = {};
        try {
          bodyJson = rawBodyText ? (JSON.parse(rawBodyText) as Record<string, unknown>) : {};
        } catch {
          throw new Error(this.config.redact(`CPA HTTP ${response.status} non-JSON response`));
        }

        const text = extractTextFromCpaResponse(bodyJson, endpoint);
        if (!text.trim()) {
          const incompleteReason = (bodyJson.incomplete_details as { reason?: string } | undefined)?.reason;
          throw new Error(
            `CPA returned empty content (status=${String(bodyJson.status ?? 'unknown')}, incomplete=${incompleteReason ?? 'none'})`,
          );
        }

        const parsed = extractJsonObject<T>(text);
        const usage = extractCpaUsage(bodyJson);
        return { text, parsed, usage };
      },
    });

    if (!outcome.ok) {
      const sanitized = this.config.redact(outcome.message);
      const err = new Error(`[${outcome.errorCode}] ${sanitized}`);
      (err as Error & { retries?: number }).retries = outcome.retries;
      throw err;
    }

    return {
      text: outcome.value.text,
      parsed: outcome.value.parsed,
      model,
      endpoint,
      latencyMs: Math.max(1, Math.round(performance.now() - start)),
      retries: outcome.retries,
      usage: outcome.value.usage,
    };
  }

  /**
   * Executes a real streaming SSE request against `/v1/responses` or `/v1/chat/completions`,
   * tracking first-token latency, chunk count, and final token usage.
   */
  async completeStreamText(req: CpaStreamRequest): Promise<CpaStreamResult> {
    const model = this.resolveModelForTier(req.tier, req.model);
    const endpoint = this.resolveEndpoint(model);
    const timeoutMs = req.timeoutMs ?? (req.tier === 'system1' ? this.config.s1TimeoutMs : this.config.timeoutMs);
    const breakerKey = `cpa:${req.tier}:${this.config.providerLabel}`;
    const start = performance.now();

    const outcome = await this.resilience.execute({
      breakerKey,
      timeoutMs,
      maxRetries: req.maxRetries ?? 1,
      baseDelayMs: 80,
      signal: req.signal,
      operation: async (attemptSignal) => {
        const url = `${this.config.baseUrl}/${endpoint === 'responses' ? 'responses' : 'chat/completions'}`;
        const bodyPayload = this.buildPayload(req, model, endpoint, true);

        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: `Bearer ${this.config.getApiKey()}`,
          },
          body: JSON.stringify(bodyPayload),
          signal: attemptSignal,
        });

        if (!response.ok) {
          const rawErr = await response.text();
          this.throwForErrorResponse(response.status, rawErr);
        }

        let text = '';
        let firstTokenLatencyMs = 0;
        let chunkCount = 0;
        let usage = extractCpaUsage({});

        const processFrame = (frame: string): boolean => {
          const trimmedFrame = frame.trim();
          if (!trimmedFrame) return false;
          let eventName = '';
          const dataLines: string[] = [];
          for (const line of trimmedFrame.split('\n')) {
            if (line.startsWith(':')) continue;
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trimStart());
            }
          }
          if (dataLines.length === 0) return false;
          const dataStr = dataLines.join('\n').trim();
          if (!dataStr || dataStr === '[DONE]') return dataStr === '[DONE]';

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(dataStr) as Record<string, unknown>;
          } catch {
            throw new Error(this.config.redact('CPA SSE stream returned malformed JSON event'));
          }

          if (payload.error && typeof payload.error === 'object') {
            const errMsg = String((payload.error as { message?: unknown }).message ?? 'CPA SSE error');
            throw new Error(this.config.redact(errMsg));
          }

          const evType = typeof payload.type === 'string' ? payload.type : eventName;
          if (evType === 'error') {
            throw new Error(this.config.redact(String(payload.message ?? 'CPA SSE stream error')));
          }

          if (endpoint === 'responses') {
            if (evType === 'response.output_text.delta' && typeof payload.delta === 'string') {
              if (payload.delta.length > 0) {
                text += payload.delta;
                chunkCount += 1;
                if (firstTokenLatencyMs === 0) {
                  firstTokenLatencyMs = Math.max(1, Math.round(performance.now() - start));
                }
                req.onDelta?.(payload.delta);
              }
            } else if (evType === 'response.output_text.done' && !text && typeof payload.text === 'string') {
              text = payload.text;
              if (text.length > 0) {
                chunkCount = Math.max(chunkCount, 1);
                if (firstTokenLatencyMs === 0) {
                  firstTokenLatencyMs = Math.max(1, Math.round(performance.now() - start));
                }
              }
            } else if (
              evType === 'response.completed' ||
              evType === 'response.done' ||
              evType === 'response.incomplete'
            ) {
              const respObj =
                payload.response && typeof payload.response === 'object'
                  ? (payload.response as Record<string, unknown>)
                  : payload;
              const extractedUsage = extractCpaUsage(respObj);
              if (extractedUsage.usageReported) {
                usage = extractedUsage;
              }
              if (!text) {
                const fallbackText = extractTextFromCpaResponse(respObj, 'responses');
                if (fallbackText) {
                  text = fallbackText;
                  chunkCount = Math.max(chunkCount, 1);
                  if (firstTokenLatencyMs === 0) {
                    firstTokenLatencyMs = Math.max(1, Math.round(performance.now() - start));
                  }
                }
              }
            }
            return false;
          }

          if (payload.usage && typeof payload.usage === 'object') {
            const extractedUsage = extractCpaUsage(payload);
            if (extractedUsage.usageReported) {
              usage = extractedUsage;
            }
          }
          const choices = Array.isArray(payload.choices) ? payload.choices : [];
          const firstChoice = choices[0] as { delta?: { content?: unknown } } | undefined;
          const delta = firstChoice?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            text += delta;
            chunkCount += 1;
            if (firstTokenLatencyMs === 0) {
              firstTokenLatencyMs = Math.max(1, Math.round(performance.now() - start));
            }
            req.onDelta?.(delta);
          }
          return false;
        };

        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
            let sepIdx = buffer.indexOf('\n\n');
            while (sepIdx >= 0) {
              const frame = buffer.slice(0, sepIdx);
              buffer = buffer.slice(sepIdx + 2);
              const stop = processFrame(frame);
              if (stop) {
                await reader.cancel().catch(() => {});
                buffer = '';
                break;
              }
              sepIdx = buffer.indexOf('\n\n');
            }
          }
          buffer += decoder.decode().replace(/\r\n/g, '\n');
          if (buffer.trim()) {
            processFrame(buffer);
          }
        } else {
          const rawText = (await response.text()).replace(/\r\n/g, '\n');
          for (const frame of rawText.split('\n\n')) {
            if (processFrame(frame)) break;
          }
        }

        if (!text.trim()) {
          throw new Error('CPA SSE stream returned empty output text');
        }

        return {
          text,
          firstTokenLatencyMs: firstTokenLatencyMs || Math.max(1, Math.round(performance.now() - start)),
          chunkCount,
          usage,
        };
      },
    });

    if (!outcome.ok) {
      const sanitized = this.config.redact(outcome.message);
      const err = new Error(`[${outcome.errorCode}] ${sanitized}`);
      (err as Error & { retries?: number }).retries = outcome.retries;
      throw err;
    }

    return {
      text: outcome.value.text,
      model,
      endpoint,
      firstTokenLatencyMs: outcome.value.firstTokenLatencyMs,
      totalLatencyMs: Math.max(1, Math.round(performance.now() - start)),
      chunkCount: outcome.value.chunkCount,
      retries: outcome.retries,
      usage: outcome.value.usage,
    };
  }
}

interface S1JsonPayload {
  cognitiveState?: FastDecisionVerdict['cognitiveState'];
  interventionNeed?: FastDecisionVerdict['interventionNeed'];
  recommendedLevel?: InterventionLevel;
  confidence?: number;
  missingPointIds?: string[];
  coveredPointIds?: string[];
  driftDetected?: boolean;
  recoveryDetected?: boolean;
  reason?: string;
}

const VALID_COGNITIVE_STATES = new Set<FastDecisionVerdict['cognitiveState']>([
  'fluent',
  'hesitating',
  'omitting_key_point',
  'drifting',
  'answering_question',
  'recovering',
]);

function normalizeCognitiveState(
  raw: string | undefined,
  fallback: FastDecisionVerdict['cognitiveState'],
): FastDecisionVerdict['cognitiveState'] {
  if (!raw) return fallback;
  if (raw === 'off_topic_drift') return 'drifting';
  return VALID_COGNITIVE_STATES.has(raw as FastDecisionVerdict['cognitiveState'])
    ? (raw as FastDecisionVerdict['cognitiveState'])
    : fallback;
}

const VALID_NEEDS = new Set<FastDecisionVerdict['interventionNeed']>([
  'none',
  'trigger_l1',
  'trigger_l2',
  'trigger_l3',
  'withdraw_active',
]);

/**
 * 基于 CPA 云端网关的 System 1 判别器（仅保留作离线/诊断对照基准使用，
 * 默认 `CUEX_SYSTEM1=real` 路由已强制走 Colab/本地 JEV `LlamaSystemOne`，绝不默认走 CPA）。
 */
export class CpaFastDecisionProvider implements FastDecisionProvider {
  readonly backend: string;
  readonly mode = 'real' as const;
  private readonly heuristic = new HeuristicFastDecisionProvider();

  constructor(private readonly client: CpaClient) {
    this.backend = `${client.config.providerLabel}:${client.resolveModelForTier('system1')}`;
  }

  async health(): Promise<ProviderHealthStatus> {
    return this.client.health('system1');
  }

  async evaluate(input: FastDecisionInput, signal?: AbortSignal): Promise<FastDecisionVerdict> {
    const base = await this.heuristic.evaluate(input, signal);
    const latest = input.recentSegments.at(-1);
    const latestText = latest?.text?.trim() ?? '';
    const presenterGreeting = latest?.speaker !== 'audience' && isPresenterGreetingText(latestText);
    const pointLines = input.expectedPoints
      .map((p) => `- ${p.id}: ${p.label} [covered=${p.covered}]`)
      .join('\n');
    const recentBlock = wrapUntrustedPromptBlock(
      'recent_speech',
      input.recentSegments.slice(-4).map((s) => `${s.speaker}: ${s.text}`).join('\n'),
      600,
    );

    const systemPrompt = [
      '你是实时认知辅助系统的 System 1 快速判别器（仅输出严格 JSON）。',
      '目标：判断当前演讲者处于流畅、停顿犹豫、遗漏核心要点、跑题偏离、回答听众提问还是已自我恢复。',
      '原则：',
      '1) 开场问候、团队/产品自我介绍或致谢寒暄（如“各位评委好”“大家好”“我们是…团队”“今天带来的产品叫…”）属于正常开场推进，必须判为 cognitiveState="fluent", interventionNeed="none", recommendedLevel="L0"，绝不能误判为 answering_question。',
      '2) 仅当 speaker="audience" 或文本出现明确提问疑问句（如“请问…”“为什么…”“怎么…”“多少…”“？”）时，才可判为 answering_question。',
      '3) 停顿但无语义缺失/无跑题/无提问时，不要误判需要提示（保持 interventionNeed="none", recommendedLevel="L0"）。',
      '4) 若当前已有活跃提示(hasActiveIntervention=true)且演讲者已接上要点或切回正题，设置 recoveryDetected=true, interventionNeed="withdraw_active", recommendedLevel="L0"。',
      '5) 严格输出 JSON：{"cognitiveState":"fluent|hesitating|omitting_key_point|drifting|answering_question|recovering","interventionNeed":"none|trigger_l1|trigger_l2|withdraw_active","recommendedLevel":"L0|L1|L2","confidence":0.85,"missingPointIds":[],"coveredPointIds":[],"driftDetected":false,"recoveryDetected":false,"reason":"简短中文原因"}。',
    ].join('\n');

    const userPrompt = [
      `Goal: ${input.activeGoal}`,
      `Chapter: ${input.activeChapterTitle ?? input.activeChapterId ?? '(unspecified)'}`,
      `SilenceDurationMs: ${input.silenceDurationMs}`,
      `HasActiveIntervention: ${Boolean(input.activeIntervention)}`,
      `ActiveInterventionTitle: ${input.activeIntervention?.title ?? '(none)'}`,
      `HeuristicDetectedQuestion: ${base.detectedQuestion ?? '(none)'}`,
      `ExpectedPoints:\n${pointLines || '(none)'}`,
      recentBlock,
    ].join('\n\n');

    const res = await this.client.completeJson<S1JsonPayload>({
      tier: 'system1',
      systemPrompt,
      userPrompt,
      temperature: 0.1,
      signal,
    });

    const p = res.parsed ?? {};
    const validPointIds = new Set(input.expectedPoints.map((pt) => pt.id));
    const llmCovered = Array.isArray(p.coveredPointIds)
      ? p.coveredPointIds.filter((id) => validPointIds.has(id))
      : [];
    const coveredSet = new Set([...base.coveredPointIds, ...llmCovered]);
    const coveredPointIds = [...coveredSet];
    const missingPointIds = input.expectedPoints
      .filter((pt) => !coveredSet.has(pt.id))
      .map((pt) => pt.id);

    const recoveryDetected = Boolean(
      base.recoveryDetected ||
        (input.activeIntervention &&
          (p.recoveryDetected || p.interventionNeed === 'withdraw_active' || p.cognitiveState === 'recovering')),
    );
    const normalizedState = normalizeCognitiveState(p.cognitiveState, base.cognitiveState);
    const driftDetected = Boolean(base.driftDetected || p.driftDetected || normalizedState === 'drifting');

    let cognitiveState: FastDecisionVerdict['cognitiveState'] = normalizedState;
    let interventionNeed: FastDecisionVerdict['interventionNeed'] =
      p.interventionNeed && VALID_NEEDS.has(p.interventionNeed)
        ? p.interventionNeed
        : base.interventionNeed;
    let recommendedLevel: InterventionLevel =
      p.recommendedLevel === 'L0' || p.recommendedLevel === 'L1' || p.recommendedLevel === 'L2' || p.recommendedLevel === 'L3'
        ? p.recommendedLevel
        : base.recommendedLevel;

    if (recoveryDetected) {
      cognitiveState = 'recovering';
      interventionNeed = input.activeIntervention ? 'withdraw_active' : 'none';
      recommendedLevel = 'L0';
    } else if (base.detectedQuestion) {
      cognitiveState = 'answering_question';
      interventionNeed = interventionNeed === 'none' ? 'trigger_l2' : interventionNeed;
      recommendedLevel = recommendedLevel === 'L0' ? 'L2' : recommendedLevel;
    } else if (presenterGreeting && !driftDetected) {
      // Opening greetings and speaker introductions are normal on-track flow, never Q&A.
      cognitiveState = 'fluent';
      interventionNeed = 'none';
      recommendedLevel = 'L0';
    } else if (
      input.silenceDurationMs > 0 &&
      missingPointIds.length === 0 &&
      !driftDetected &&
      !base.detectedQuestion
    ) {
      // Intentional pause guard: silence without semantic gap never escalates above L0.
      interventionNeed = 'none';
      recommendedLevel = 'L0';
    }

    const confidence =
      typeof p.confidence === 'number' && Number.isFinite(p.confidence)
        ? Math.max(0, Math.min(1, p.confidence))
        : base.confidence;

    return {
      ...base,
      cognitiveState,
      interventionNeed,
      recommendedLevel,
      confidence,
      coveredPointIds,
      missingPointIds,
      driftDetected,
      recoveryDetected,
      signals: {
        ...base.signals,
        semanticOmission: missingPointIds.length > 0 && (cognitiveState === 'omitting_key_point' || base.signals.semanticOmission),
        topicDrift: driftDetected,
        openQuestion: Boolean(base.detectedQuestion),
      },
      reason: p.reason?.trim() ? clampSpoken(p.reason, 80) : base.reason,
      latencyMs: res.latencyMs,
      backend: `${this.backend} (${res.endpoint})`,
      usage: buildProviderUsageRecord({
        usage: res.usage,
        retries: res.retries,
        provider: this.client.config.providerLabel,
        model: res.model,
      }),
    };
  }
}

interface S2GuidancePayload {
  focusDirective?: string;
  strategyHints?: string[];
  recommendedBias?: string;
  preferredLevel?: InterventionLevel;
}

interface S2JsonPayload {
  status?: 'synthesized' | 'candidate_ready' | 'no_action_needed' | 'insufficient_evidence';
  title?: string;
  cueText?: string;
  bullets?: string[];
  evidenceIds?: string[];
  grounded?: boolean;
  ungroundedNotice?: string;
  rationale?: string;
  guidance?: S2GuidancePayload;
}

const VALID_GUIDANCE_BIASES = new Set<string>(SYSTEM2_GUIDANCE_BIASES);

function buildGuidanceFromS2(params: {
  request: SlowReasoningCandidateRequest;
  nowMs: number;
  raw?: S2GuidancePayload;
  evidenceIds: string[];
  grounded: boolean;
  reasoningEffort: CpaReasoningEffort;
  provider: string;
  model: string;
  fallbackDirective: string;
  fallbackBias: System2GuidanceBias;
  allowedNumbers: ReadonlySet<string>;
}): System2Guidance {
  const safeClamp = (txt: string, limit: number): string => {
    const cleaned = clampSpoken(txt, limit);
    const hasBadNum = numbersIn(cleaned).some((n) => !params.allowedNumbers.has(n));
    return hasBadNum ? clampSpoken(params.fallbackDirective, limit) : cleaned;
  };
  const focusDirective = safeClamp(
    params.raw?.focusDirective?.trim() || params.fallbackDirective,
    72,
  );
  const strategyHints = Array.isArray(params.raw?.strategyHints)
    ? params.raw.strategyHints
        .map((h) => safeClamp(String(h ?? '').trim(), 64))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  const rawBias = params.raw?.recommendedBias?.trim();
  const recommendedBias: System2GuidanceBias =
    rawBias && VALID_GUIDANCE_BIASES.has(rawBias) ? (rawBias as System2GuidanceBias) : params.fallbackBias;
  const preferredLevel =
    params.raw?.preferredLevel === 'L0' ||
    params.raw?.preferredLevel === 'L1' ||
    params.raw?.preferredLevel === 'L2' ||
    params.raw?.preferredLevel === 'L3'
      ? params.raw.preferredLevel
      : undefined;
  const turnSeq = params.request.basedOnTurnSeq ?? 0;

  return {
    guidanceId: `guid_cpa_${params.nowMs}_${Math.random().toString(36).slice(2, 6)}`,
    sessionId: params.request.sessionId,
    revision: 1,
    contextVersion: params.request.contextVersion,
    basedOnTurnSeq: turnSeq,
    staleAfterTurnSeq: turnSeq + 3,
    issuedAtMs: params.nowMs,
    expiresAtMs: params.nowMs + 25_000,
    issuedAt: msToIso(params.nowMs),
    expiresAt: msToIso(params.nowMs + 25_000),
    ...(params.request.activeChapterId ? { targetChapterId: params.request.activeChapterId } : {}),
    ...(params.request.activeChapterTitle ? { targetChapterTitle: params.request.activeChapterTitle } : {}),
    focusDirective,
    strategyHints: strategyHints.length ? strategyHints : [focusDirective],
    recommendedBias,
    ...(preferredLevel ? { preferredLevel } : {}),
    evidenceAnchors: [...params.evidenceIds],
    grounded: params.grounded,
    reasoningEffort: params.reasoningEffort,
    triggerKind: params.request.triggerKind,
    provider: params.provider,
    model: params.model,
  };
}

function nextCpaCandidateId(nowMs: number): string {
  return `cand_cpa_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
}

function mapTriggerToKind(
  triggerKind: SlowReasoningCandidateRequest['triggerKind'],
): CandidateKind {
  switch (triggerKind) {
    case 'live_qa':
      return 'qa_grounding';
    case 'drift':
      return 'drift_recovery';
    case 'pace_overtime':
      return 'pace_nudge';
    case 'manual_help':
      return 'manual_scaffold';
    case 'omission':
    case 'hesitation':
    default:
      return 'omission_cue';
  }
}

function collectAllowedNumbers(
  request: SlowReasoningCandidateRequest,
  citedIds: readonly string[],
): Set<string> {
  const allowed = new Set<string>();
  const citedSet = new Set(citedIds);
  for (const ev of request.retrievedEvidence) {
    if (!citedSet.has(ev.id)) continue;
    for (const num of numbersIn(`${ev.title ?? ''} ${ev.text}`)) {
      allowed.add(num);
    }
  }
  return allowed;
}

/**
 * System 2 Slow Reasoning Provider backed solely by CPA (`CPA_SYSTEM2_MODEL`),
 * enforcing strict evidence citation and zero numeric fabrication.
 */
export class CpaSlowReasoningProvider implements SlowReasoningProvider {
  readonly backend: string;
  readonly mode = 'real' as const;
  private readonly defaultTtlMs: number;
  private readonly localFallback: LocalSlowReasoningProvider;

  constructor(
    private readonly client: CpaClient,
    opts?: { candidateTtlMs?: number },
  ) {
    this.defaultTtlMs = opts?.candidateTtlMs ?? 12_000;
    this.localFallback = new LocalSlowReasoningProvider({ candidateTtlMs: this.defaultTtlMs });
    this.backend = `${client.config.providerLabel}:${client.resolveModelForTier('system2')}`;
  }

  async health(): Promise<ProviderHealthStatus> {
    return this.client.health('system2');
  }

  async synthesize(
    request: SlowReasoningCandidateRequest,
    signal?: AbortSignal,
  ): Promise<SlowReasoningCandidateResult> {
    const requestMs = isoToMs(request.timestamp, Date.now());
    const evidenceBlock =
      request.retrievedEvidence.length > 0
        ? request.retrievedEvidence
            .map((ev) => `- [${ev.id}] ${ev.title ?? ''}: ${ev.text} (source: ${ev.source})`)
            .join('\n')
        : '(无匹配 Verified Evidence)';

    const missingBlock =
      request.missingPoints?.map((m) => `- ${m.id}: ${m.label}`).join('\n') || '(无)';

    const systemPrompt = [
      '你是 CueX 的 System 2 认知综合器，只输出严格 JSON（禁止输出多余 Markdown 说明）。',
      '你必须遵守以下铁律：',
      '1. 只输出适合一眼扫读的极短口语提词（cueText <= 64字，title <= 24字，bullets 最多3条每条 <= 60字）。',
      '2. 任何量化数字或实测指标必须原样来自提供的 Verified Evidence，严禁猜测或编造数字。',
      '3. evidenceIds 数组只能填入上方明确存在的 id；若 Verified Evidence 为空且 triggerKind="live_qa"，必须输出 status="insufficient_evidence"、grounded=false、evidenceIds=[]，并在 cueText 中不包含任何数字，诚实说明“当前资料未覆盖该数据”。',
      '4. 若无需干预，输出 status="no_action_needed"。',
      '输出 JSON Schema：{"status":"synthesized|no_action_needed|insufficient_evidence","title":"","cueText":"","bullets":[""],"evidenceIds":[""],"grounded":true,"ungroundedNotice":"","rationale":"","guidance":{"focusDirective":"","strategyHints":[""],"recommendedBias":"stay_silent|prefer_l1|prefer_l2|prefer_l3|qa_grounding|recovery_hold"}}',
    ].join('\n');

    const userPrompt = [
      `TriggerKind: ${request.triggerKind}`,
      `RequestedLevel: ${request.requestedLevel}`,
      `Goal: ${request.activeGoal}`,
      `Chapter: ${request.activeChapterTitle ?? request.activeChapterId ?? '未指定'}`,
      request.questionText
        ? `听众/评委提问:\n${wrapUntrustedPromptBlock('audience_question', request.questionText, 600)}`
        : '',
      `待覆盖要点:\n${missingBlock}`,
      `禁止编造边界:\n${request.forbiddenClaims?.join('; ') || '(无)'}`,
      `Verified Evidence:\n${evidenceBlock}`,
      `最近发言摘要:\n${wrapUntrustedPromptBlock(
        'recent_segments',
        request.recentSegments.slice(-4).map((s) => `${s.speaker}: ${s.text}`).join('\n'),
        1_200,
      )}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const appliedEffort = request.reasoningEffort ?? this.client.config.system2ReasoningEffort;
    const res = await this.client.completeJson<S2JsonPayload>({
      tier: 'system2',
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      reasoningEffort: appliedEffort,
      signal,
    });

    const usage = buildProviderUsageRecord({
      usage: res.usage,
      retries: res.retries,
      provider: this.client.config.providerLabel,
      model: res.model,
    });

    const p = res.parsed;
    const validIds = new Set(request.retrievedEvidence.map((e) => e.id));
    let filteredEvidenceIds = Array.isArray(p.evidenceIds)
      ? p.evidenceIds.filter((id) => validIds.has(id))
      : [];

    if (request.triggerKind === 'live_qa' && request.retrievedEvidence.length === 0) {
      const honestNotice =
        p.ungroundedNotice?.trim() ||
        '当前已确认的汇报资料与事实白名单中未收录该问题的实测数据或依据，建议坦诚说明暂无该项数据支持。';
      const candidate: Candidate = {
        candidateId: nextCpaCandidateId(requestMs),
        sessionId: request.sessionId,
        level: request.requestedLevel === 'L3' ? 'L2' : request.requestedLevel === 'L0' ? 'L2' : request.requestedLevel,
        title: '问答依据缺失提醒',
        cueText: '资料库未覆盖该数据，请坦诚说明暂无已核验记录。',
        bullets: ['如确需补充，建议会后依据正式文档核对后答复。'],
        priority: 95,
        ttlMs: this.defaultTtlMs,
        expiresAt: msToIso(requestMs + this.defaultTtlMs),
        contextVersion: request.contextVersion,
        evidenceIds: [],
        basedOnSegmentId: request.basedOnSegmentId,
        status: 'pending',
        createdAt: request.timestamp,
        kind: 'missing_evidence_notice',
        grounded: false,
        missingEvidenceNotice: honestNotice,
        triggerReason: 'Q&A missing verified evidence (CPA honest guard)',
        targetChapterId: request.activeChapterId,
      };
      return {
        requestId: request.requestId,
        sessionId: request.sessionId,
        contextVersion: request.contextVersion,
        timestamp: request.timestamp,
        status: 'insufficient_evidence',
        candidate,
        guidance: buildGuidanceFromS2({
          request,
          nowMs: requestMs,
          raw: p.guidance,
          evidenceIds: [],
          grounded: false,
          reasoningEffort: appliedEffort,
          provider: this.client.config.providerLabel,
          model: res.model,
          fallbackDirective: '当前资料无核验依据，提醒讲者坦诚留白不编造数字。',
          fallbackBias: 'qa_grounding',
          allowedNumbers: new Set(),
        }),
        reasoningEffort: appliedEffort,
        evidenceIds: [],
        grounded: false,
        ungroundedNotice: honestNotice,
        rationale: p.rationale?.trim() || 'No verified evidence available for live Q&A.',
        latencyMs: res.latencyMs,
        backend: `${this.backend} (${res.endpoint})`,
        usage,
      };
    }

    if (p.status === 'no_action_needed') {
      return {
        requestId: request.requestId,
        sessionId: request.sessionId,
        contextVersion: request.contextVersion,
        timestamp: request.timestamp,
        status: 'no_action_needed',
        guidance: buildGuidanceFromS2({
          request,
          nowMs: requestMs,
          raw: p.guidance,
          evidenceIds: [],
          grounded: true,
          reasoningEffort: appliedEffort,
          provider: this.client.config.providerLabel,
          model: res.model,
          fallbackDirective: '当前叙事节奏正常，保持 L0 静默不打扰。',
          fallbackBias: 'stay_silent',
          allowedNumbers: new Set(),
        }),
        reasoningEffort: appliedEffort,
        evidenceIds: [],
        grounded: false,
        rationale: p.rationale?.trim() || 'CPA determined no intervention needed.',
        latencyMs: res.latencyMs,
        backend: `${this.backend} (${res.endpoint})`,
        usage,
      };
    }

    const isInsufficient =
      p.status === 'insufficient_evidence' ||
      (request.triggerKind === 'live_qa' && p.grounded === false && filteredEvidenceIds.length === 0);

    // 仅在模型确认有依据且非依据不足时，自动补齐首个检索命中的已核验证据 ID；避免把无关片段强行挂到拒答卡片上。
    if (!isInsufficient && request.triggerKind === 'live_qa' && filteredEvidenceIds.length === 0 && request.retrievedEvidence[0]) {
      filteredEvidenceIds = [request.retrievedEvidence[0].id];
    }

    let cueText = clampSpoken(p.cueText?.trim() || '', 64);
    let bullets = Array.isArray(p.bullets)
      ? p.bullets.map((b) => clampSpoken(String(b ?? ''), 60)).filter(Boolean).slice(0, 3)
      : undefined;

    // Grounding safety guard: if CPA fabricated a number not present in cited evidence, fall back to safe evidence excerpt.
    const allowedNumbers = isInsufficient ? new Set<string>() : collectAllowedNumbers(request, filteredEvidenceIds);
    const stripped = [cueText, ...(bullets ?? [])]
      .join(' ')
      .replace(/\bL[0-3]\b/g, ' ')
      .replace(/\bSystem\s*[12]\b/gi, ' ')
      .replace(/第\s*\d+\s*[章页节条点]/g, ' ');
    const ungroundedNums = numbersIn(stripped).filter((n) => !allowedNumbers.has(n));

    if (isInsufficient) {
      // 依据不足场景强制剥离任何未核验数字并保证返回明确诚实拒答文案。
      if (ungroundedNums.length > 0 || !cueText) {
        cueText = '资料库未覆盖该问题依据，请坦诚说明当前暂无已核验记录。';
        bullets = ['避免临场估算数字，建议会后补全实测来源。'];
      }
      filteredEvidenceIds = [];
    } else if (ungroundedNums.length > 0 || !cueText) {
      if (ungroundedNums.length > 0) {
        const localSafe = await this.localFallback.synthesize(request, signal);
        return {
          ...localSafe,
          rationale: `${localSafe.rationale} [CPA output contained ungrounded numbers: ${ungroundedNums.join(', ')}]`,
          latencyMs: res.latencyMs,
          backend: `${this.backend}+grounding-guard`,
          usage,
        };
      }
    }

    const resolvedMissingNotice =
      p.ungroundedNotice?.trim() ||
      (isInsufficient
        ? '当前已确认的汇报资料与事实白名单中未收录该问题的实测数据或依据，建议坦诚说明暂无该项数据支持。'
        : undefined);

    const candidate: Candidate = {
      candidateId: nextCpaCandidateId(requestMs),
      sessionId: request.sessionId,
      level: request.requestedLevel === 'L0' ? 'L2' : request.requestedLevel,
      title: clampSpoken(p.title?.trim() || (isInsufficient ? '依据缺失提醒' : '关键提示'), 24),
      cueText,
      ...(bullets?.length ? { bullets } : {}),
      priority: request.triggerKind === 'live_qa' ? 92 : request.triggerKind === 'manual_help' ? 95 : 80,
      ttlMs: this.defaultTtlMs,
      expiresAt: msToIso(requestMs + this.defaultTtlMs),
      contextVersion: request.contextVersion,
      evidenceIds: isInsufficient ? [] : filteredEvidenceIds,
      basedOnSegmentId: request.basedOnSegmentId,
      status: 'pending',
      createdAt: request.timestamp,
      kind: isInsufficient ? 'missing_evidence_notice' : mapTriggerToKind(request.triggerKind),
      grounded: !isInsufficient && (Boolean(p.grounded) || filteredEvidenceIds.length > 0),
      ...(resolvedMissingNotice ? { missingEvidenceNotice: resolvedMissingNotice } : {}),
      triggerReason: p.rationale?.trim() || `CPA ${request.triggerKind}`,
      targetChapterId: request.activeChapterId,
      ...(request.missingPoints?.[0] ? { targetKeyPointId: request.missingPoints[0].id } : {}),
    };

    return {
      requestId: request.requestId,
      sessionId: request.sessionId,
      contextVersion: request.contextVersion,
      timestamp: request.timestamp,
      status: isInsufficient ? 'insufficient_evidence' : 'synthesized',
      candidate,
      guidance: buildGuidanceFromS2({
        request,
        nowMs: requestMs,
        raw: p.guidance,
        evidenceIds: candidate.evidenceIds,
        grounded: Boolean(candidate.grounded),
        reasoningEffort: appliedEffort,
        provider: this.client.config.providerLabel,
        model: res.model,
        fallbackDirective: candidate.cueText,
        fallbackBias:
          request.triggerKind === 'live_qa'
            ? 'qa_grounding'
            : request.requestedLevel === 'L2'
              ? 'prefer_l2'
              : 'prefer_l1',
        allowedNumbers,
      }),
      reasoningEffort: appliedEffort,
      evidenceIds: candidate.evidenceIds,
      grounded: Boolean(candidate.grounded),
      ...(candidate.missingEvidenceNotice ? { ungroundedNotice: candidate.missingEvidenceNotice } : {}),
      rationale: candidate.triggerReason ?? 'CPA grounded synthesis',
      latencyMs: res.latencyMs,
      backend: `${this.backend} (${res.endpoint})`,
      usage,
    };
  }
}

type FactCategory = 'metric' | 'claim' | 'milestone' | 'definition' | 'boundary' | 'quote';
const VALID_FACT_CATEGORIES = new Set<FactCategory>([
  'metric',
  'claim',
  'milestone',
  'definition',
  'boundary',
  'quote',
]);

function normalizeFactCategory(raw: string | undefined, text: string): FactCategory {
  if (raw && VALID_FACT_CATEGORIES.has(raw as FactCategory)) return raw as FactCategory;
  if (raw === 'constraint') return 'boundary';
  if (raw === 'architecture') return 'definition';
  return classifyFactCategory(text);
}

interface CpaCompilePayload {
  oneLineThesis?: string;
  audienceHook?: string;
  facts?: Array<{ text?: string; category?: string }>;
  qaCards?: Array<{ question?: string; rationale?: string; suggestedAnswer?: string }>;
}

export interface CpaCompilerResult {
  pack: PresentationContextPack;
  usage?: ProviderUsageRecord;
  latencyMs?: number;
}

/**
 * Enhances a compiled PresentationContextPack via CPA (`CPA_COMPILER_MODEL`) while
 * strictly preserving locked facts and rejecting any hallucinated numeric figures.
 */
export async function enhanceCompiledPackWithCpa(
  client: CpaClient,
  basePack: PresentationContextPack,
  input: PresentationCompileInput,
  signal?: AbortSignal,
): Promise<CpaCompilerResult> {
  const sourceCorpus = `${input.rawMaterials ?? ''}\n${(input.keyFactsInput ?? []).join('\n')}`;
  const sourceNumbers = new Set(numbersIn(sourceCorpus));

  const systemPrompt = [
    '你是 CueX 的 Presentation Context Compiler。',
    '任务：根据用户原始讲稿资料，优化提炼一句话核心结论(oneLineThesis)、开场钩子(audienceHook)、可核验事实条目(facts)和预测评委问答(qaCards)。',
    '铁律：绝对不得发明、放大或改写原文中不存在的数字！所有事实与问答中的数字必须可在原文中找到原据。',
    '输出严格 JSON：{"oneLineThesis":"","audienceHook":"","facts":[{"text":"","category":"metric|claim|milestone|definition|boundary|quote"}],"qaCards":[{"question":"","rationale":"","suggestedAnswer":""}]}',
  ].join('\n');

  const userPrompt = [
    `Title: ${input.title}`,
    `SceneType: ${input.sceneType}`,
    `Goal: ${input.goal}`,
    wrapUntrustedPromptBlock('raw_materials', input.rawMaterials ?? '', 4_500),
    input.keyFactsInput?.length
      ? wrapUntrustedPromptBlock('user_confirmed_facts', input.keyFactsInput.join('\n'), 1_200)
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await client.completeJson<CpaCompilePayload>({
    tier: 'compiler',
    systemPrompt,
    userPrompt,
    temperature: 0.15,
    signal,
  });

  const usage = buildProviderUsageRecord({
    usage: res.usage,
    retries: res.retries,
    provider: client.config.providerLabel,
    model: res.model,
  });

  const containsUnseenNumber = (text: string): boolean =>
    numbersIn(text).some((n) => !sourceNumbers.has(n));

  const updatedPack: PresentationContextPack = structuredClone(basePack);
  updatedPack.compiledBy = 'llm_compiler';

  if (res.parsed.oneLineThesis?.trim() && !containsUnseenNumber(res.parsed.oneLineThesis)) {
    updatedPack.cueSheet.oneLineThesis = clampSpoken(res.parsed.oneLineThesis.trim(), 70);
  }
  if (res.parsed.audienceHook?.trim() && !containsUnseenNumber(res.parsed.audienceHook)) {
    updatedPack.cueSheet.audienceHook = clampSpoken(res.parsed.audienceHook.trim(), 60);
  }

  // Merge strictly grounded LLM Q&A predictions (preserving existing unprepared gaps and locked facts).
  const existingQs = new Set(updatedPack.qaCards.map((q) => q.question));
  const extraCards: PresentationQACard[] = [];
  for (const card of res.parsed.qaCards ?? []) {
    const q = card.question?.trim();
    const ans = card.suggestedAnswer?.trim();
    if (!q || !ans || existingQs.has(q)) continue;
    if (containsUnseenNumber(q) || containsUnseenNumber(ans)) continue;
    existingQs.add(q);
    extraCards.push({
      id: `qa_cpa_${extraCards.length + 1}`,
      question: clampSpoken(q, 90),
      rationale: clampSpoken(card.rationale?.trim() || 'CPA 基于讲稿提炼的高频追问预测。', 80),
      suggestedAnswer: clampSpoken(ans, 140),
      keywords: extractKeywords(`${q} ${ans}`),
      evidenceIds: updatedPack.evidence.slice(0, 2).map((e) => e.id),
      isPrediction: true,
      prepared: true,
    });
    if (extraCards.length >= 3) break;
  }
  if (extraCards.length > 0) {
    updatedPack.qaCards = [...extraCards, ...updatedPack.qaCards];
  }

  // Keep verified extracted facts when grounded; never drop locked facts.
  const existingFactTexts = new Set(updatedPack.facts.map((f) => f.text));
  for (const item of res.parsed.facts ?? []) {
    const text = item.text?.trim();
    if (!text || text.length < 8 || existingFactTexts.has(text)) continue;
    if (containsUnseenNumber(text)) continue;
    if (!splitCandidateFacts(sourceCorpus).some((src) => src.includes(text.slice(0, 8)))) {
      continue;
    }
    const factId = `fact_cpa_${updatedPack.facts.length + 1}`;
    const evidenceId = `ev_cpa_${updatedPack.evidence.length + 1}`;
    existingFactTexts.add(text);
    updatedPack.facts.push({
      id: factId,
      text,
      category: normalizeFactCategory(item.category, text),
      source: 'CPA LLM Compiler (source-verified)',
      userConfirmed: false,
      locked: false,
      verified: true,
      evidenceId,
    });
    updatedPack.evidence.push({
      id: evidenceId,
      schemaVersion: updatedPack.evidence[0]?.schemaVersion ?? 1,
      title: clampSpoken(text, 24),
      text,
      source: 'CPA LLM Compiler (source-verified)',
      sourceType: 'compiler_extracted',
      locationRef: 'rawMaterials',
      contentHash: `cpa_${updatedPack.evidence.length + 1}`,
      timestamp: updatedPack.updatedAt,
      createdAt: updatedPack.createdAt,
      updatedAt: updatedPack.updatedAt,
      confidence: 0.9,
      scope: 'session',
      privacyLevel: 'session',
      userConfirmed: false,
      verified: true,
      lifecycle: 'active',
      locked: false,
      tags: extractKeywords(text),
    });
  }

  return { pack: updatedPack, usage, latencyMs: res.latencyMs };
}

interface CpaReflectionPayload {
  overallSummary?: string;
}

/**
 * Generates an enriched coaching summary via CPA (`CPA_REFLECTION_MODEL`) without modifying
 * any deterministic diagnosis counts or `V = H - λI` utility calculations.
 */
export async function enhanceReflectionWithCpa(
  client: CpaClient,
  baseReflection: PresentationReflection,
  signal?: AbortSignal,
): Promise<{ reflection: PresentationReflection; usage?: ProviderUsageRecord; latencyMs?: number }> {
  const diag = baseReflection.diagnosis;
  const util = baseReflection.utility;

  const systemPrompt = [
    '你是 CueX 的演练复盘教练（只输出严格 JSON）。',
    '基于已确定的复盘诊断数据写一段简洁中文总评(overallSummary, <=140字)，不得篡改任何数字或编造额外事实。',
    '输出 JSON：{"overallSummary":""}',
  ].join('\n');

  const userPrompt = JSON.stringify({
    coverageRatio: diag.coverageRatio,
    missedPoints: diag.missedPoints.map((m) => m.label),
    overtimeChapters: diag.overtimeChapters.map((o) => `${o.title} (${o.actualSec}s/${o.targetSec}s)`),
    unansweredQuestions: diag.unansweredQuestions.map((u) => u.question),
    driftCount: diag.driftCount,
    autoWithdrawCount: diag.autoWithdrawCount,
    utilityScore: util.netUtilityScore,
    helpfulCount: util.helpfulCount,
    distractingCount: util.distractingCount,
    lambda: util.lambda,
  });

  const res = await client.completeJson<CpaReflectionPayload>({
    tier: 'reflection',
    systemPrompt,
    userPrompt,
    temperature: 0.2,
    signal,
  });

  const usage = buildProviderUsageRecord({
    usage: res.usage,
    retries: res.retries,
    provider: client.config.providerLabel,
    model: res.model,
  });

  const nextSummary = res.parsed.overallSummary?.trim();
  if (!nextSummary) {
    return { reflection: baseReflection, usage, latencyMs: res.latencyMs };
  }

  return {
    reflection: {
      ...baseReflection,
      diagnosis: {
        ...baseReflection.diagnosis,
        overallSummary: `${clampSpoken(nextSummary, 140)}（V = ${util.netUtilityScore}）`,
      },
    },
    usage,
    latencyMs: res.latencyMs,
  };
}
