import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nowUtcIso8601,
  type AsrCapabilityStatus,
  type ColabAsrLifecycleState,
  type UtcIso8601,
} from '@cuex/protocol';
import { WebSocket, type ClientOptions } from 'ws';
import { redactLogText } from '../observability';
import type { AsrCallbacks, AsrEngine, AsrStream } from './types';

export interface ColabAsrConfig {
  baseUrl: string;
  wsUrl: string;
  caCertPath?: string;
  caCertPem?: Buffer;
  allowInsecureTls: boolean;
  timeoutMs: number;
  inferTimeoutMs: number;
  language: string;
  getApiKey(): string;
  redact(text: string): string;
}

export interface ColabAsrHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

export type ColabHttpRequestFn = (params: {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
  timeoutMs: number;
  caCertPem?: Buffer;
  allowInsecureTls: boolean;
}) => Promise<ColabAsrHttpResponse>;

export type ColabWebSocketFactory = (url: string, options: ClientOptions) => WebSocket;

export interface ColabAsrProviderOptions {
  config?: ColabAsrConfig | null;
  env?: NodeJS.ProcessEnv;
  httpRequest?: ColabHttpRequestFn;
  wsFactory?: ColabWebSocketFactory;
  reconnectDelayMs?: number;
  maxReconnects?: number;
}

export interface ColabBatchTranscribeResult {
  ok: boolean;
  text: string;
  language: string;
  audioDurationMs: number;
  latencyMs: number;
  rtf?: number;
  model?: string;
  gpu?: string;
}

interface ColabStreamMessage {
  type?: string;
  text?: string;
  code?: string;
  message?: string;
  model?: string;
  gpu?: string;
  rtf?: number;
  ts?: number | string;
}

function deriveWsUrl(baseUrl: string, explicitWsUrl?: string): string {
  if (explicitWsUrl?.trim()) {
    return explicitWsUrl.trim().replace(/\/+$/, '');
  }
  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === 'http:' ? 'ws:' : 'wss:';
  parsed.pathname = '/v1/asr/stream';
  parsed.search = '';
  return parsed.toString().replace(/\/+$/, '');
}

function resolveExistingCertPath(rawCaPath: string | undefined): string | undefined {
  const trimmed = rawCaPath?.trim();
  if (!trimmed) return undefined;
  if (path.isAbsolute(trimmed)) return trimmed;
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const candidates = [
    path.resolve(process.cwd(), trimmed),
    path.resolve(process.cwd(), '..', '..', trimmed),
    path.resolve(repoRoot, trimmed),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function buildColabRedactor(secret: string, caCertPath?: string, remoteHost?: string): (text: string) => string {
  const maskHost =
    remoteHost && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(remoteHost) && remoteHost !== '127.0.0.1'
      ? remoteHost
      : undefined;
  return (text: string) => {
    let out = redactLogText(text);
    if (secret) out = out.split(secret).join('[REDACTED_KEY]');
    if (maskHost) out = out.split(maskHost).join('[COLAB_ASR_HOST]');
    if (caCertPath && path.isAbsolute(caCertPath)) {
      out = out.split(caCertPath).join('[COLAB_CA_CERT]');
    }
    return out;
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Resolves Colab GPU ASR client settings from environment variables.
 * Never prints or exposes `COLAB_ASR_API_KEY` or raw certificates.
 */
export function resolveColabAsrConfig(env: NodeJS.ProcessEnv = process.env): ColabAsrConfig | null {
  const rawUrl = (env.CUEX_COLAB_ASR_URL ?? env.COLAB_ASR_URL)?.trim();
  if (!rawUrl) return null;

  const parsed = new URL(rawUrl);
  parsed.username = '';
  parsed.password = '';
  const baseUrl = parsed.toString().replace(/\/+$/, '');
  const wsUrl = deriveWsUrl(baseUrl, env.CUEX_COLAB_ASR_WS_URL ?? env.COLAB_ASR_WS_URL);
  const apiKey = (env.CUEX_COLAB_ASR_API_KEY ?? env.COLAB_ASR_API_KEY)?.trim() ?? '';
  const rawCaPath = (env.CUEX_COLAB_ASR_CA_CERT ?? env.COLAB_ASR_CA_CERT)?.trim();
  const caCertPath = resolveExistingCertPath(rawCaPath);
  const caCertPem = caCertPath && existsSync(caCertPath) ? readFileSync(caCertPath) : undefined;

  return {
    baseUrl,
    wsUrl,
    ...(caCertPath ? { caCertPath } : {}),
    ...(caCertPem ? { caCertPem } : {}),
    allowInsecureTls: /^(?:1|true|yes)$/i.test((env.CUEX_COLAB_ASR_INSECURE ?? '').trim()),
    timeoutMs: parsePositiveInt(env.CUEX_COLAB_ASR_TIMEOUT_MS, 8_000),
    inferTimeoutMs: parsePositiveInt(env.CUEX_COLAB_ASR_INFER_TIMEOUT_MS, 30_000),
    language: (env.CUEX_COLAB_ASR_LANGUAGE ?? 'auto').trim() || 'auto',
    getApiKey: () => apiKey,
    redact: buildColabRedactor(apiKey, caCertPath, parsed.hostname),
  };
}

async function defaultHttpRequest(params: {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
  timeoutMs: number;
  caCertPem?: Buffer;
  allowInsecureTls: boolean;
}): Promise<ColabAsrHttpResponse> {
  const parsed = new URL(params.url);
  const isHttps = parsed.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      parsed,
      {
        method: params.method,
        agent: false,
        headers: {
          ...params.headers,
          Connection: 'close',
          ...(params.body ? { 'Content-Length': String(params.body.length) } : {}),
        },
        timeout: params.timeoutMs,
        ...(isHttps && params.caCertPem ? { ca: params.caCertPem } : {}),
        ...(isHttps ? { rejectUnauthorized: !params.allowInsecureTls } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let body: Record<string, unknown> = {};
          try {
            body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          } catch {
            body = { raw: raw.slice(0, 200) };
          }
          resolve({ status: res.statusCode ?? 500, body });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Colab ASR HTTP request timed out after ${params.timeoutMs}ms`));
    });
    req.on('error', reject);
    if (params.body) req.write(params.body);
    req.end();
  });
}

function defaultWsFactory(url: string, options: ClientOptions): WebSocket {
  return new WebSocket(url, options);
}

class ColabAsrStream implements AsrStream {
  private ws?: WebSocket;
  private isOpen = false;
  private ended = false;
  private dead = false;
  private pendingFlush = false;
  private reconnectAttempts = 0;
  private pending: Buffer[] = [];
  private closeTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(
    private readonly provider: ColabAsrProvider,
    private readonly config: ColabAsrConfig,
    private readonly callbacks: AsrCallbacks,
    private readonly wsFactory: ColabWebSocketFactory,
    private readonly maxReconnects: number,
    private readonly reconnectDelayMs: number,
  ) {
    this.connect();
  }

  private buildStreamUrl(): string {
    const u = new URL(this.config.wsUrl);
    if (!u.searchParams.has('language')) {
      u.searchParams.set('language', this.config.language);
    }
    return u.toString();
  }

  private connect(): void {
    const key = this.config.getApiKey();
    const isTls = this.config.wsUrl.startsWith('wss:');
    const wsOpts: ClientOptions = {
      handshakeTimeout: this.config.timeoutMs,
      perMessageDeflate: false,
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      ...(isTls && this.config.caCertPem ? { ca: this.config.caCertPem } : {}),
      ...(isTls ? { rejectUnauthorized: !this.config.allowInsecureTls } : {}),
    };

    const ws = this.wsFactory(this.buildStreamUrl(), wsOpts);
    this.ws = ws;

    ws.on('open', () => {
      if (ws !== this.ws) return;
      this.isOpen = true;
      this.reconnectAttempts = 0;
      for (const frame of this.pending.splice(0)) {
        ws.send(frame);
      }
      if (this.pendingFlush && !this.ended) {
        this.pendingFlush = false;
        ws.send(JSON.stringify({ type: 'flush' }));
      }
      if (this.ended) {
        ws.send(JSON.stringify({ type: 'end' }));
      }
    });

    ws.on('message', (raw, isBinary) => {
      if (ws !== this.ws || isBinary) return;
      this.handleMessage(ws, raw.toString('utf8'));
    });

    ws.on('error', (err) => {
      this.handleDisconnect(ws, err);
    });

    ws.on('close', (code) => {
      this.handleDisconnect(
        ws,
        code === 1000 ? undefined : new Error(`Colab ASR stream closed (code=${code})`),
      );
    });
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    let msg: ColabStreamMessage;
    try {
      msg = JSON.parse(raw) as ColabStreamMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'ready': {
        this.provider.updateTelemetry({
          lifecycleState: 'ready',
          gpuName: msg.gpu,
          modelId: msg.model,
          fallbackActive: false,
          fallbackReason: undefined,
        });
        break;
      }
      case 'partial': {
        const text = typeof msg.text === 'string' ? msg.text.trim() : '';
        this.provider.updateTelemetry({ lifecycleState: 'ready', rtf: msg.rtf });
        if (text) this.callbacks.onPartial(text);
        break;
      }
      case 'final': {
        const text = typeof msg.text === 'string' ? msg.text.trim() : '';
        this.provider.updateTelemetry({ lifecycleState: 'ready', rtf: msg.rtf });
        if (text) this.callbacks.onFinal(text);
        break;
      }
      case 'ping': {
        if (this.isOpen) {
          ws.send(JSON.stringify({ type: 'pong', ts: msg.ts }));
        }
        break;
      }
      case 'error': {
        const detail = this.config.redact(msg.message ?? msg.code ?? 'Colab ASR streaming error');
        const nextState: ColabAsrLifecycleState =
          msg.code === 'ASR_UNAVAILABLE' ? 'starting' : 'degraded';
        this.provider.updateTelemetry({
          lifecycleState: nextState,
          fallbackActive: true,
          fallbackReason: detail,
        });
        this.callbacks.onError(new Error(detail));
        break;
      }
      case 'done': {
        clearTimeout(this.closeTimer);
        this.ended = true;
        break;
      }
    }
  }

  private handleDisconnect(ws: WebSocket, err?: Error): void {
    if (ws !== this.ws) return;
    this.ws = undefined;
    this.isOpen = false;
    if (this.ended || this.dead) {
      clearTimeout(this.closeTimer);
      return;
    }

    const reason = this.config.redact(err?.message ?? 'Colab ASR stream disconnected');
    if (this.reconnectAttempts < this.maxReconnects) {
      this.reconnectAttempts += 1;
      this.provider.updateTelemetry({
        lifecycleState: 'restarting',
        fallbackActive: true,
        fallbackReason: reason,
      });
      this.reconnectTimer = setTimeout(() => {
        if (!this.ended && !this.dead) this.connect();
      }, this.reconnectDelayMs);
      this.reconnectTimer.unref();
      return;
    }

    this.dead = true;
    const isAuthOrUnavailable = /401|403|unauthorized|certificate|ECONNREFUSED|ENOTFOUND/i.test(reason);
    this.provider.updateTelemetry({
      lifecycleState: isAuthOrUnavailable ? 'unavailable' : 'disconnected',
      fallbackActive: true,
      fallbackReason: reason,
    });
    this.callbacks.onError(new Error(reason));
  }

  write(pcm16le: Buffer): void {
    if (this.ended || this.dead || pcm16le.length === 0) return;
    if (this.isOpen && this.ws) {
      this.ws.send(pcm16le);
      return;
    }
    this.pending.push(pcm16le);
    if (this.pending.length > 48) {
      this.pending.shift();
    }
  }

  flush(): void {
    if (this.ended || this.dead) return;
    if (this.isOpen && this.ws) {
      this.ws.send(JSON.stringify({ type: 'flush' }));
      return;
    }
    this.pendingFlush = true;
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.reconnectTimer);
    if (this.isOpen && this.ws) {
      this.ws.send(JSON.stringify({ type: 'end' }));
    }
    this.closeTimer = setTimeout(() => {
      this.ws?.terminate();
      this.ws = undefined;
    }, 1_500);
    this.closeTimer.unref();
  }
}

/**
 * CueX Colab GPU ASR Provider (`https/wss :10086`).
 * Enforces Bearer token auth, custom PEM TLS verification, PCM16LE pass-through streaming,
 * and strict 7-state lifecycle tracking without false availability claims.
 */
export class ColabAsrProvider implements AsrEngine {
  readonly backend = 'colab-gpu-asr';
  private readonly config: ColabAsrConfig | null;
  private readonly httpRequest: ColabHttpRequestFn;
  private readonly wsFactory: ColabWebSocketFactory;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnects: number;

  private lifecycleState: ColabAsrLifecycleState;
  private gpuName?: string;
  private modelId?: string;
  private rtf?: number;
  private lastHealthCheckAt?: UtcIso8601;
  private fallbackActive: boolean;
  private fallbackReason?: string;

  constructor(opts: ColabAsrProviderOptions = {}) {
    this.config = opts.config === undefined ? resolveColabAsrConfig(opts.env) : opts.config;
    this.httpRequest = opts.httpRequest ?? defaultHttpRequest;
    this.wsFactory = opts.wsFactory ?? defaultWsFactory;
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 300;
    this.maxReconnects = opts.maxReconnects ?? 2;

    if (!this.config) {
      this.lifecycleState = 'not_configured';
      this.fallbackActive = true;
      this.fallbackReason = 'CUEX_COLAB_ASR_URL is not configured.';
    } else if (!this.config.getApiKey()) {
      this.lifecycleState = 'unavailable';
      this.fallbackActive = true;
      this.fallbackReason = 'CUEX_COLAB_ASR_API_KEY is missing.';
    } else {
      this.lifecycleState = 'starting';
      this.fallbackActive = false;
    }
  }

  updateTelemetry(patch: {
    lifecycleState?: ColabAsrLifecycleState;
    gpuName?: string;
    modelId?: string;
    rtf?: number;
    lastHealthCheckAt?: UtcIso8601;
    fallbackActive?: boolean;
    fallbackReason?: string;
  }): void {
    if (patch.lifecycleState !== undefined) this.lifecycleState = patch.lifecycleState;
    if (patch.gpuName !== undefined) this.gpuName = patch.gpuName;
    if (patch.modelId !== undefined) this.modelId = patch.modelId;
    if (typeof patch.rtf === 'number' && Number.isFinite(patch.rtf)) this.rtf = patch.rtf;
    if (patch.lastHealthCheckAt !== undefined) this.lastHealthCheckAt = patch.lastHealthCheckAt;
    if (patch.fallbackActive !== undefined) this.fallbackActive = patch.fallbackActive;
    if ('fallbackReason' in patch) this.fallbackReason = patch.fallbackReason;
  }

  /**
   * Allows explicit lifecycle transition tests or external circuit signals.
   */
  setLifecycleState(state: ColabAsrLifecycleState, reason?: string): void {
    this.lifecycleState = state;
    this.fallbackActive = state !== 'ready';
    this.fallbackReason = reason;
    this.lastHealthCheckAt = nowUtcIso8601();
  }

  getStatus(): AsrCapabilityStatus {
    const ready = this.lifecycleState === 'ready';
    const detail = this.buildStatusDetail();
    return {
      backend: this.backend,
      mode: 'colab_gpu',
      available: ready,
      streaming: ready,
      detail,
      lifecycleState: this.lifecycleState,
      ...(this.gpuName ? { gpuName: this.gpuName } : {}),
      ...(this.modelId ? { modelId: this.modelId } : {}),
      ...(this.rtf !== undefined ? { rtf: this.rtf } : {}),
      ...(this.lastHealthCheckAt ? { lastHealthCheckAt: this.lastHealthCheckAt } : {}),
      fallbackActive: this.fallbackActive,
      ...(this.fallbackReason ? { fallbackReason: this.fallbackReason } : {}),
    };
  }

  private buildStatusDetail(): string {
    switch (this.lifecycleState) {
      case 'not_configured':
        return 'Colab GPU ASR not configured; browser Web Speech or speech.delta simulation active.';
      case 'ready':
        return `Colab GPU ASR ready (${this.gpuName ?? 'GPU'}, model=${this.modelId ?? 'SenseVoiceSmall'}${this.rtf !== undefined ? `, avgRTF=${this.rtf}` : ''}).`;
      case 'starting':
        return 'Colab GPU ASR warming up model weights on remote GPU.';
      case 'restarting':
        return `Colab GPU ASR reconnecting stream (${this.fallbackReason ?? 'recovering'}).`;
      case 'degraded':
        return `Colab GPU ASR degraded (${this.fallbackReason ?? 'transient failure'}); explicit fallback advised.`;
      case 'disconnected':
        return `Colab GPU ASR stream disconnected (${this.fallbackReason ?? 'connection lost'}).`;
      case 'unavailable':
      default:
        return `Colab GPU ASR unavailable (${this.fallbackReason ?? 'unreachable'}); fallback to browser Web Speech / text mode required.`;
    }
  }

  async probe(): Promise<AsrCapabilityStatus> {
    const checkedAt = nowUtcIso8601();
    if (!this.config) {
      this.updateTelemetry({
        lifecycleState: 'not_configured',
        lastHealthCheckAt: checkedAt,
        fallbackActive: true,
        fallbackReason: 'CUEX_COLAB_ASR_URL is not configured.',
      });
      return this.getStatus();
    }
    const key = this.config.getApiKey();
    if (!key) {
      this.updateTelemetry({
        lifecycleState: 'unavailable',
        lastHealthCheckAt: checkedAt,
        fallbackActive: true,
        fallbackReason: 'Missing CUEX_COLAB_ASR_API_KEY.',
      });
      return this.getStatus();
    }

    try {
      const healthRes = await this.httpRequest({
        method: 'GET',
        url: `${this.config.baseUrl}/health`,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${key}`,
        },
        timeoutMs: this.config.timeoutMs,
        caCertPem: this.config.caCertPem,
        allowInsecureTls: this.config.allowInsecureTls,
      });

      if (healthRes.status === 401 || healthRes.status === 403) {
        this.updateTelemetry({
          lifecycleState: 'unavailable',
          lastHealthCheckAt: checkedAt,
          fallbackActive: true,
          fallbackReason: `Colab ASR rejected Bearer auth (HTTP ${healthRes.status}).`,
        });
        return this.getStatus();
      }

      if (healthRes.status >= 500) {
        this.updateTelemetry({
          lifecycleState: 'degraded',
          lastHealthCheckAt: checkedAt,
          fallbackActive: true,
          fallbackReason: `Colab ASR /health returned HTTP ${healthRes.status}.`,
        });
        return this.getStatus();
      }

      const body = healthRes.body;
      const gpuObj = body.gpu as { name?: unknown } | undefined;
      const metricsObj = body.metrics as { avgRtf?: unknown } | undefined;
      const gpuName = typeof gpuObj?.name === 'string' ? gpuObj.name : undefined;
      const modelId = typeof body.model === 'string' ? body.model : undefined;
      const rtf = typeof metricsObj?.avgRtf === 'number' ? metricsObj.avgRtf : undefined;
      const remoteState = typeof body.lifecycleState === 'string' ? body.lifecycleState : undefined;
      const isReady = Boolean(body.ready) || remoteState === 'ready';

      const readyRes = await this.httpRequest({
        method: 'GET',
        url: `${this.config.baseUrl}/ready`,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${key}`,
        },
        timeoutMs: this.config.timeoutMs,
        caCertPem: this.config.caCertPem,
        allowInsecureTls: this.config.allowInsecureTls,
      });

      if (readyRes.status === 200 && isReady && readyRes.body.ready !== false) {
        this.updateTelemetry({
          lifecycleState: 'ready',
          gpuName,
          modelId,
          rtf,
          lastHealthCheckAt: checkedAt,
          fallbackActive: false,
          fallbackReason: undefined,
        });
      } else if (readyRes.status === 503 || remoteState === 'starting') {
        this.updateTelemetry({
          lifecycleState: 'starting',
          gpuName,
          modelId,
          rtf,
          lastHealthCheckAt: checkedAt,
          fallbackActive: true,
          fallbackReason: 'Colab GPU ASR model is still starting.',
        });
      } else {
        this.updateTelemetry({
          lifecycleState: 'degraded',
          gpuName,
          modelId,
          rtf,
          lastHealthCheckAt: checkedAt,
          fallbackActive: true,
          fallbackReason: `Colab ASR /ready returned HTTP ${readyRes.status}.`,
        });
      }
    } catch (error) {
      const msg = this.config.redact(error instanceof Error ? error.message : String(error));
      this.updateTelemetry({
        lifecycleState: /timeout/i.test(msg) ? 'degraded' : 'unavailable',
        lastHealthCheckAt: checkedAt,
        fallbackActive: true,
        fallbackReason: msg,
      });
    }

    return this.getStatus();
  }

  async transcribeBatch(
    audioBytes: Buffer,
    opts: { contentType?: string; sampleRate?: number; language?: string } = {},
  ): Promise<ColabBatchTranscribeResult> {
    if (!this.config || !this.config.getApiKey()) {
      throw new Error('Colab GPU ASR is not configured.');
    }
    const language = opts.language ?? this.config.language;
    const sampleRate = opts.sampleRate ?? 16_000;
    const url = `${this.config.baseUrl}/v1/asr/transcribe?language=${encodeURIComponent(language)}&sample_rate=${sampleRate}`;

    const res = await this.httpRequest({
      method: 'POST',
      url,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.config.getApiKey()}`,
        'Content-Type': opts.contentType ?? 'audio/wav',
      },
      body: audioBytes,
      timeoutMs: this.config.inferTimeoutMs,
      caCertPem: this.config.caCertPem,
      allowInsecureTls: this.config.allowInsecureTls,
    });

    if (res.status !== 200 || res.body.ok === false) {
      const errObj = res.body.error as { message?: string } | undefined;
      const detail = this.config.redact(errObj?.message ?? `Colab transcribe HTTP ${res.status}`);
      this.updateTelemetry({
        lifecycleState: res.status === 401 || res.status === 403 ? 'unavailable' : 'degraded',
        lastHealthCheckAt: nowUtcIso8601(),
        fallbackActive: true,
        fallbackReason: detail,
      });
      throw new Error(detail);
    }

    const rtf = typeof res.body.rtf === 'number' ? res.body.rtf : undefined;
    this.updateTelemetry({
      lifecycleState: 'ready',
      gpuName: typeof res.body.gpu === 'string' ? res.body.gpu : this.gpuName,
      modelId: typeof res.body.model === 'string' ? res.body.model : this.modelId,
      rtf,
      lastHealthCheckAt: nowUtcIso8601(),
      fallbackActive: false,
      fallbackReason: undefined,
    });

    return {
      ok: true,
      text: String(res.body.text ?? ''),
      language: String(res.body.language ?? language),
      audioDurationMs: Number(res.body.audioDurationMs ?? 0),
      latencyMs: Number(res.body.latencyMs ?? 0),
      rtf,
      model: typeof res.body.model === 'string' ? res.body.model : undefined,
      gpu: typeof res.body.gpu === 'string' ? res.body.gpu : undefined,
    };
  }

  async open(opts: { sampleRate: number }, callbacks: AsrCallbacks): Promise<AsrStream> {
    if (opts.sampleRate !== 16_000) {
      throw new Error(`${this.backend} expects 16 kHz PCM16LE audio, got ${opts.sampleRate}`);
    }
    if (!this.config || !this.config.getApiKey()) {
      this.setLifecycleState(
        this.config ? 'unavailable' : 'not_configured',
        this.config ? 'CUEX_COLAB_ASR_API_KEY is missing.' : 'CUEX_COLAB_ASR_URL is not configured.',
      );
      throw new Error(this.fallbackReason ?? 'Colab GPU ASR unavailable.');
    }

    return new ColabAsrStream(
      this,
      this.config,
      callbacks,
      this.wsFactory,
      this.maxReconnects,
      this.reconnectDelayMs,
    );
  }
}
