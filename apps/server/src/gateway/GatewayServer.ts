import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { URL } from 'node:url';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import {
  API_VERSION,
  WS_PROTOCOL_VERSION,
  createApiErrorResponse,
  createWsRolePolicy,
  nowUtcIso8601,
  validateAuthSessionInput,
  validateClientMessage,
  validateMemoryCreateInput,
  validateMemoryPatchInput,
  validatePaymentCheckoutPreviewRequest,
  validatePaymentWebhookEvent,
  validatePresentationCompileInput,
  validatePresentationExtractInput,
  validatePresentationPackPatchInput,
  validateWsAttachRole,
  type AsrCapabilityStatus,
  type ClientMessage,
  type DualSystemCollaborationMetrics,
  type EventEnvelopeMeta,
  type HealthStatusResponse,
  type LlmSubsystemHealthStatus,
  type PaymentWebhookEvent,
  type PresentationContextPack,
  type PresentationMode,
  type PresentationReflection,
  type ServerMessage,
  type UserAccount,
  type WsAttachRole,
  type WsAttachState,
} from '@cuex/protocol';
import {
  CommercialService,
  SandboxPaymentProviderAdapter,
  type PaymentProviderAdapter,
} from '../commercial';
import type { ServerConfig } from '../config';
import { MetricsCollector, StructuredLogger } from '../observability';
import { PipelineTracker } from '../pipeline';
import {
  CognitiveRuntimeSession,
  CpaClient,
  InterventionController,
  LexicalBm25RetrievalProvider,
  MemoryStore,
  createFastDecisionProvider,
  createSlowReasoningProvider,
  enhanceCompiledPackWithCpa,
  enhanceReflectionWithCpa,
  isoToMs,
  msToIso,
  resolveCpaConfig,
  systemClock,
  type FastDecisionProvider,
  type RetrievalProvider,
  type RuntimeClock,
  type SlowReasoningProvider,
} from '../runtime';
import {
  PresentationPackStore,
  PresentationRuntimePlugin,
  SAMPLE_ASR_CORRECTIONS,
  ScenarioNotImplementedError,
  ScenarioRegistry,
  compilePresentationPack,
  extractPresentationDocument,
  toPackSummary,
  toUniversalContextPack,
} from '../scenarios';
import { computeUtilitySummary } from '../scenarios/presentation/PresentationReflection';
import {
  AuthService,
  HttpServiceError,
  OriginGuard,
  RateLimiter,
  extractBearerToken,
  type AuthenticatedContext,
} from '../security';
import { SqliteRepository, type StorageRepository } from '../storage';
import {
  ColabAsrProvider,
  LocalSherpaAsr,
  RemoteSherpaAsr,
  TextOnlyAsr,
  correctAsrText,
  createAsrEngine,
  type AsrEngine,
  type AsrStream,
} from '../voice';

interface WsSubscriber {
  ws: WebSocket;
  role: WsAttachRole;
  userId: string;
  send: (msg: ServerMessage) => void;
  lastSeenSeq: number;
}

interface SessionEntry {
  sessionId: string;
  userId: string;
  tenantId: string;
  packId: string;
  packTitle: string;
  runtime?: CognitiveRuntimeSession<unknown, PresentationReflection>;
  plugin?: PresentationRuntimePlugin;
  reflection?: PresentationReflection;
  startedAtMs: number;
  endedAtMs?: number;
  /** 会话唯一主控端连接（拥有麦克风采集与会话控制权）。 */
  primarySubscriber?: WsSubscriber;
  /** 会话所有在线 WebSocket 订阅者（主控端 + 0..N 伴随窗）。 */
  subscribers: Set<WsSubscriber>;
  /** 会话级 ASR 流与心跳定时器（由 SessionEntry 持有，伴随窗断开绝不销毁）。 */
  asrStream?: AsrStream;
  tickTimer?: ReturnType<typeof setInterval>;
  /** 会话级异步串行任务队列，确保跨连接指令与 ASR/Tick 时序一致。 */
  serializeChain: Promise<void>;
}

export interface GatewayServerOptions {
  config: ServerConfig;
  repo?: StorageRepository;
  packStore?: PresentationPackStore;
  memoryStore?: MemoryStore;
  asrEngine?: AsrEngine;
  cpaClient?: CpaClient;
  fastDecision?: FastDecisionProvider;
  slowReasoning?: SlowReasoningProvider;
  retrieval?: RetrievalProvider;
  paymentAdapter?: PaymentProviderAdapter;
  rateLimiter?: RateLimiter;
  logger?: StructuredLogger;
  metrics?: MetricsCollector;
  clock?: RuntimeClock;
}

function defaultAsrEngine(config: ServerConfig): AsrEngine {
  if (config.asrMode !== 'real') {
    return new TextOnlyAsr();
  }
  return createAsrEngine({ ...process.env, CUEX_ASR: config.asrMode });
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * CueX HTTP REST & Full-Duplex WebSocket Gateway (Phase 2).
 */
export class CueXGatewayServer {
  readonly config: ServerConfig;
  readonly repo: StorageRepository;
  private readonly ownsRepo: boolean;
  readonly logger: StructuredLogger;
  readonly metrics: MetricsCollector;
  readonly pipeline: PipelineTracker;
  readonly authService: AuthService;
  readonly originGuard: OriginGuard;
  readonly rateLimiter: RateLimiter;
  readonly paymentAdapter: PaymentProviderAdapter;
  readonly commercial: CommercialService;
  readonly scenarios = new ScenarioRegistry();
  readonly packStore: PresentationPackStore;
  readonly memoryStore: MemoryStore;
  readonly asrEngine: AsrEngine;
  readonly cpaClient?: CpaClient;
  readonly fastDecision: FastDecisionProvider;
  readonly slowReasoning: SlowReasoningProvider;
  readonly retrieval: RetrievalProvider;
  private readonly clock: RuntimeClock;

  private readonly sessions = new Map<string, SessionEntry>();
  private readonly liveSockets = new Set<WebSocket>();
  private httpServer?: Server;
  private wss?: WebSocketServer;

  constructor(opts: GatewayServerOptions) {
    this.config = opts.config;
    this.clock = opts.clock ?? systemClock;
    this.logger = opts.logger ?? new StructuredLogger('cuex-server', opts.config.environment);
    this.metrics = opts.metrics ?? new MetricsCollector();

    if (opts.repo) {
      this.repo = opts.repo;
      this.ownsRepo = false;
    } else {
      this.repo = new SqliteRepository(opts.config.sqlitePath);
      this.ownsRepo = true;
    }
    this.repo.init();
    this.repo.migrateLegacyJsonFiles({
      runtimeDir: opts.config.runtimeDir,
      packsDir: opts.config.packsDir,
      memoryDir: opts.config.memoryDir,
    });

    this.pipeline = new PipelineTracker(this.repo);
    this.authService = new AuthService(this.repo, {
      authRequired: opts.config.authRequired,
      tokenTtlHours: opts.config.authTokenTtlHours,
    });
    this.originGuard = new OriginGuard(opts.config.allowedOrigins, opts.config.environment);
    this.rateLimiter =
      opts.rateLimiter ?? new RateLimiter(opts.config.rateLimitRpm, () => this.clock.now());
    this.paymentAdapter =
      opts.paymentAdapter ?? new SandboxPaymentProviderAdapter(opts.config.webhookSecret);
    this.commercial = new CommercialService(this.repo, this.paymentAdapter);

    this.packStore = opts.packStore ?? new PresentationPackStore(this.repo);
    this.memoryStore = opts.memoryStore ?? new MemoryStore(this.repo);
    this.asrEngine = opts.asrEngine ?? defaultAsrEngine(opts.config);
    // CPA 仅服务 System 2 / Compiler / Reflection；System 1 real 模式严格直连 Colab / 本地 JEV 模型。
    const shouldInitCpa = opts.config.system2Mode === 'real';
    const resolvedCpa = !opts.cpaClient && shouldInitCpa ? resolveCpaConfig() : null;
    this.cpaClient = opts.cpaClient ?? (resolvedCpa ? new CpaClient(resolvedCpa) : undefined);
    this.fastDecision =
      opts.fastDecision ??
      createFastDecisionProvider(opts.config.system1Mode, process.env);
    this.slowReasoning =
      opts.slowReasoning ??
      createSlowReasoningProvider(opts.config.system2Mode, {
        candidateTtlMs: opts.config.candidateTtlMs,
        cpaClient: this.cpaClient,
      });
    this.retrieval = opts.retrieval ?? new LexicalBm25RetrievalProvider();
  }

  getAsrCapability(): AsrCapabilityStatus {
    if (this.asrEngine instanceof ColabAsrProvider) {
      return this.asrEngine.getStatus();
    }
    if (this.asrEngine instanceof TextOnlyAsr) {
      if (this.config.asrMode === 'real') {
        return {
          backend: this.asrEngine.backend,
          mode: 'text_simulation',
          available: false,
          streaming: false,
          lifecycleState: 'not_configured',
          fallbackActive: true,
          fallbackReason:
            'CUEX_ASR=real requested without reachable Colab/Sherpa ASR host; degraded to Web Speech / text mode.',
          detail:
            'CUEX_ASR=real requested without reachable Sherpa host/model; degraded to Web Speech / text mode.',
        };
      }
      return {
        backend: this.asrEngine.backend,
        mode: 'text_simulation',
        available: true,
        streaming: false,
        lifecycleState: 'not_configured',
        fallbackActive: false,
        detail:
          'Server Sherpa ASR is in offline/text mode; browser Web Speech API and text simulation are active.',
      };
    }
    if (this.asrEngine instanceof RemoteSherpaAsr) {
      return {
        backend: this.asrEngine.backend,
        mode: 'remote_sherpa',
        available: true,
        streaming: true,
        detail: `Remote Sherpa ASR bridge configured (${process.env.CUEX_ASR_URL ?? 'CUEX_ASR_URL'}).`,
      };
    }
    return {
      backend: this.asrEngine.backend,
      mode: 'local_sherpa',
      available: true,
      streaming: true,
      detail: 'Local Sherpa streaming ASR active (16kHz PCM16).',
    };
  }

  async probeAsrCapability(): Promise<AsrCapabilityStatus> {
    if (this.asrEngine instanceof ColabAsrProvider) {
      return this.asrEngine.probe();
    }
    return this.getAsrCapability();
  }

  async start(): Promise<{ host: string; port: number }> {
    if (this.httpServer) {
      const addr = this.httpServer.address();
      if (addr && typeof addr === 'object') {
        return { host: this.config.host, port: addr.port };
      }
    }

    this.httpServer = createServer((req, res) => {
      void this.handleHttp(req, res);
    });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });

    this.httpServer.on('upgrade', (req, socket, head) => {
      this.handleWsUpgrade(req, socket, head);
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once('error', reject);
      this.httpServer!.listen(this.config.port, this.config.host, () => resolve());
    });

    const address = this.httpServer.address();
    const port = typeof address === 'object' && address ? address.port : this.config.port;
    return { host: this.config.host, port };
  }

  async stop(): Promise<void> {
    for (const entry of this.sessions.values()) {
      this.stopSessionTickTimer(entry);
      this.closeSessionAsrStream(entry);
      try {
        entry.runtime?.end(this.config.defaultUtilityLambda);
      } catch {
        // Ignore shutdown end errors
      }
    }
    this.sessions.clear();

    for (const sock of this.liveSockets) {
      try {
        sock.close(1001, 'Server shutting down');
      } catch {
        sock.terminate();
      }
    }
    this.liveSockets.clear();

    await new Promise<void>((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      this.wss.close(() => resolve());
    });
    this.wss = undefined;

    await new Promise<void>((resolve) => {
      if (!this.httpServer) {
        resolve();
        return;
      }
      this.httpServer.close(() => resolve());
    });
    this.httpServer = undefined;

    if (this.ownsRepo) {
      this.repo.close();
    }
  }

  private writeJson(res: ServerResponse, status: number, body: unknown, correlationId: string): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Correlation-Id', correlationId);
    res.end(JSON.stringify(body));
  }

  private writeError(
    res: ServerResponse,
    err: HttpServiceError,
    correlationId: string,
    details?: Array<{ path: string; message: string; code?: string }>,
  ): void {
    const payload = createApiErrorResponse({
      code: err.code,
      message: err.message,
      httpStatus: err.httpStatus,
      retryable: err.retryable,
      correlationId,
      details,
    });
    this.writeJson(res, err.httpStatus, payload, correlationId);
  }

  private async readRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > maxBytes) {
        throw new HttpServiceError(
          'VALIDATION_ERROR',
          `Request body exceeded limit (${maxBytes} bytes).`,
          { httpStatus: 400 },
        );
      }
      chunks.push(buf);
    }
    return Buffer.concat(chunks);
  }

  private parseJsonBody<T>(rawBody: Buffer): T {
    if (rawBody.length === 0) return {} as T;
    try {
      return JSON.parse(rawBody.toString('utf8')) as T;
    } catch {
      throw new HttpServiceError('VALIDATION_ERROR', 'Request body must be valid JSON.');
    }
  }

  private enforceRateLimit(
    bucket: string,
    key: string,
    res: ServerResponse,
    correlationId: string,
  ): void {
    const rate = this.rateLimiter.consume(`${bucket}:${key}`);
    res.setHeader('X-RateLimit-Limit', String(rate.limit));
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      this.logger.warn('http.rate_limited', { bucket, correlationId });
      throw new HttpServiceError(
        'RATE_LIMITED',
        `Rate limit exceeded. Retry after ${rate.retryAfterSec}s.`,
        { httpStatus: 429, retryable: true },
      );
    }
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startMs = performance.now();
    const incomingCorr = req.headers['x-correlation-id'];
    const correlationId =
      (typeof incomingCorr === 'string' && incomingCorr.trim()) || randomUUID();
    res.setHeader('X-Correlation-Id', correlationId);

    const originCheck = this.originGuard.applyCorsHeaders(req, res);
    if (!originCheck.allowed) {
      this.writeError(
        res,
        new HttpServiceError('FORBIDDEN', 'Origin not allowed by CORS policy.'),
        correlationId,
      );
      return;
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';
    const maxBodyBytes = Math.ceil(this.config.maxUploadBytes * 1.45) + 256 * 1024;
    const clientIp = getClientIp(req);

    try {
      if (method === 'GET' && pathname === '/health') {
        const [s1Health, s2Health, asrStatus] = await Promise.all([
          this.fastDecision.health(),
          this.slowReasoning.health(),
          this.probeAsrCapability(),
        ]);
        const repoOk = this.repo.ping();
        const s1Subsystem: LlmSubsystemHealthStatus = {
          backend: this.fastDecision.backend,
          mode: this.fastDecision.mode,
          healthy: s1Health.ok,
          detail: s1Health.detail,
          ...(s1Health.provider ? { provider: s1Health.provider } : {}),
          ...(s1Health.model ? { model: s1Health.model } : {}),
          ...(s1Health.degraded !== undefined ? { degraded: s1Health.degraded } : {}),
          ...(s1Health.fallbackActive !== undefined ? { fallbackActive: s1Health.fallbackActive } : {}),
          ...(s1Health.fallbackReason ? { fallbackReason: s1Health.fallbackReason } : {}),
          ...(s1Health.promptFormat ? { promptFormat: s1Health.promptFormat } : {}),
          ...(s1Health.calibrated !== undefined ? { calibrated: s1Health.calibrated } : {}),
          ...(s1Health.lastHealthCheckAt ? { lastHealthCheckAt: s1Health.lastHealthCheckAt } : {}),
        };
        const s2Subsystem: LlmSubsystemHealthStatus = {
          backend: this.slowReasoning.backend,
          mode: this.slowReasoning.mode,
          healthy: s2Health.ok,
          detail: s2Health.detail,
          ...(s2Health.provider ? { provider: s2Health.provider } : {}),
          ...(s2Health.model ? { model: s2Health.model } : {}),
          ...(s2Health.degraded !== undefined ? { degraded: s2Health.degraded } : {}),
          ...(s2Health.fallbackActive !== undefined ? { fallbackActive: s2Health.fallbackActive } : {}),
          ...(s2Health.fallbackReason ? { fallbackReason: s2Health.fallbackReason } : {}),
          ...(s2Health.reasoningEffort ? { reasoningEffort: s2Health.reasoningEffort } : {}),
          ...(s2Health.lastHealthCheckAt ? { lastHealthCheckAt: s2Health.lastHealthCheckAt } : {}),
        };
        const compilerModel = s2Health.compilerModel ?? this.cpaClient?.config.compilerModel ?? 'local_compiler';
        const reflectionModel = s2Health.reflectionModel ?? this.cpaClient?.config.reflectionModel ?? 'local_reflection';
        const cpaReal = Boolean(this.cpaClient && this.config.system2Mode === 'real');
        const compilerSubsystem: LlmSubsystemHealthStatus = cpaReal
          ? {
              backend: 'cpa_responses',
              mode: 'real',
              healthy: s2Health.ok,
              detail: s2Health.fallbackActive
                ? `Compiler fallback active (${s2Health.fallbackReason ?? s2Health.detail}).`
                : `CPA compiler ready (model=${compilerModel}, effort=${s2Health.reasoningEffort ?? this.cpaClient!.config.system2ReasoningEffort}).`,
              provider: this.cpaClient!.config.providerLabel,
              model: compilerModel,
              degraded: Boolean(s2Health.degraded),
              fallbackActive: Boolean(s2Health.fallbackActive ?? !s2Health.ok),
              ...(s2Health.fallbackReason ? { fallbackReason: s2Health.fallbackReason } : {}),
              reasoningEffort: s2Health.reasoningEffort ?? this.cpaClient!.config.system2ReasoningEffort,
              ...(s2Health.lastHealthCheckAt ? { lastHealthCheckAt: s2Health.lastHealthCheckAt } : {}),
            }
          : {
              backend: 'local_compiler',
              mode: 'local_fallback',
              healthy: true,
              detail: 'Deterministic local grounded presentation pack compiler.',
              provider: 'local_compiler',
              model: compilerModel,
              fallbackActive: false,
              ...(s2Health.lastHealthCheckAt ? { lastHealthCheckAt: s2Health.lastHealthCheckAt } : {}),
            };
        const reflectionSubsystem: LlmSubsystemHealthStatus = cpaReal
          ? {
              backend: 'cpa_responses',
              mode: 'real',
              healthy: s2Health.ok,
              detail: s2Health.fallbackActive
                ? `Reflection fallback active (${s2Health.fallbackReason ?? s2Health.detail}).`
                : `CPA reflection ready (model=${reflectionModel}, effort=${s2Health.reasoningEffort ?? this.cpaClient!.config.system2ReasoningEffort}).`,
              provider: this.cpaClient!.config.providerLabel,
              model: reflectionModel,
              degraded: Boolean(s2Health.degraded),
              fallbackActive: Boolean(s2Health.fallbackActive ?? !s2Health.ok),
              ...(s2Health.fallbackReason ? { fallbackReason: s2Health.fallbackReason } : {}),
              reasoningEffort: s2Health.reasoningEffort ?? this.cpaClient!.config.system2ReasoningEffort,
              ...(s2Health.lastHealthCheckAt ? { lastHealthCheckAt: s2Health.lastHealthCheckAt } : {}),
            }
          : {
              backend: 'local_reflection',
              mode: 'local_fallback',
              healthy: true,
              detail: 'Deterministic local presentation reflection & rehearsal engine.',
              provider: 'local_reflection',
              model: reflectionModel,
              fallbackActive: false,
              ...(s2Health.lastHealthCheckAt ? { lastHealthCheckAt: s2Health.lastHealthCheckAt } : {}),
            };

        const health: HealthStatusResponse = {
          ok: repoOk,
          service: 'cuex-server',
          version: '2.0.0',
          apiVersion: API_VERSION,
          wsProtocolVersion: WS_PROTOCOL_VERSION,
          timestamp: nowUtcIso8601(),
          asr: asrStatus,
          system1: s1Subsystem,
          system2: s2Subsystem,
          compiler: compilerSubsystem,
          reflection: reflectionSubsystem,
          dualSystemMetrics: this.buildHealthDualSystemMetrics(),
        };
        this.writeJson(res, repoOk ? 200 : 503, health, correlationId);
        return;
      }

      if (method === 'GET' && pathname === '/api/scenarios') {
        this.writeJson(res, 200, { scenarios: this.scenarios.listScenarios() }, correlationId);
        return;
      }

      if (method === 'GET' && pathname === '/api/plans') {
        this.writeJson(res, 200, { plans: this.commercial.listPlans() }, correlationId);
        return;
      }

      // Auth Session Routes
      if (method === 'POST' && pathname === '/api/auth/session') {
        this.enforceRateLimit('auth', clientIp, res, correlationId);
        const body = this.parseJsonBody(await this.readRawBody(req, 64 * 1024));
        const validated = validateAuthSessionInput(body);
        if (!validated.ok) {
          this.writeError(
            res,
            new HttpServiceError('VALIDATION_ERROR', 'Invalid auth session payload.'),
            correlationId,
            validated.issues,
          );
          return;
        }
        const issued = this.authService.createSession(validated.value);
        const { entitlements, usageSummary } = this.commercial.getEntitlementsAndSummary(issued.user);
        this.logger.info('auth.session.created', {
          correlationId,
          userId: issued.user.userId,
          tenantId: issued.user.tenantId,
        });
        this.writeJson(
          res,
          200,
          {
            authenticated: true,
            token: issued.token,
            user: issued.user,
            sessionTokenExpiresAt: issued.sessionTokenExpiresAt,
            entitlements,
            usageSummary,
          },
          correlationId,
        );
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/logout') {
        const token = extractBearerToken(req.headers.authorization);
        this.authService.logoutToken(token);
        this.writeJson(res, 200, { loggedOut: true }, correlationId);
        return;
      }

      // Billing Webhook Routes (authenticated by HMAC-SHA256 signature + CUEX_WEBHOOK_SECRET)
      const webhookMatch = /^\/api\/billing\/webhooks?\/([^/]+)$/.exec(pathname);
      if (method === 'POST' && (pathname === '/api/billing/webhook' || webhookMatch)) {
        this.enforceRateLimit('webhook', clientIp, res, correlationId);
        const rawBody = await this.readRawBody(req, 256 * 1024);
        const sigHeaderRaw = req.headers['x-cuex-signature'] ?? req.headers['x-webhook-signature'];
        const sigHeader = Array.isArray(sigHeaderRaw) ? sigHeaderRaw[0] : sigHeaderRaw;
        const providerParam = webhookMatch ? decodeURIComponent(webhookMatch[1]) : undefined;

        const body = this.parseJsonBody<PaymentWebhookEvent>(rawBody);
        this.paymentAdapter.verifyWebhookSignature(rawBody, sigHeader ?? body.signature);
        const validated = validatePaymentWebhookEvent(body);
        if (!validated.ok) {
          this.writeError(
            res,
            new HttpServiceError('VALIDATION_ERROR', 'Invalid payment webhook event payload.'),
            correlationId,
            validated.issues,
          );
          return;
        }
        const processed = this.commercial.processWebhook({
          rawBody,
          signatureHeader: sigHeader,
          providerParam,
          event: validated.value,
        });
        this.writeJson(res, 200, { received: true, ...processed }, correlationId);
        return;
      }

      // All remaining REST API routes enforce Auth + RateLimit
      const auth: AuthenticatedContext = this.authService.authenticateRequest(req);
      this.enforceRateLimit('api', `${auth.user.userId}:${clientIp}`, res, correlationId);

      if (method === 'GET' && pathname === '/api/auth/me') {
        const { entitlements, usageSummary } = this.commercial.getEntitlementsAndSummary(auth.user);
        this.writeJson(
          res,
          200,
          {
            authenticated: auth.authenticated,
            user: auth.user,
            entitlements,
            usageSummary,
          },
          correlationId,
        );
        return;
      }

      if (method === 'GET' && pathname === '/api/account/entitlements') {
        const { entitlements, usageSummary } = this.commercial.getEntitlementsAndSummary(auth.user);
        this.writeJson(res, 200, { entitlements, usageSummary }, correlationId);
        return;
      }

      if (method === 'GET' && pathname === '/api/account/usage') {
        const usage = this.commercial.getUsageRecordsAndSummary(auth.user);
        this.writeJson(res, 200, usage, correlationId);
        return;
      }

      if (method === 'GET' && pathname === '/api/account/export') {
        const format = url.searchParams.get('format') === 'markdown' ? 'markdown' : 'json';
        const exported = this.commercial.exportUserData(auth.user, format);
        if (exported.format === 'markdown') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          res.setHeader('X-Correlation-Id', correlationId);
          res.end(exported.markdown);
          return;
        }
        this.writeJson(res, 200, exported.bundle, correlationId);
        return;
      }

      if (method === 'DELETE' && pathname === '/api/account/data') {
        const receipt = this.commercial.wipeAccountData(auth.user);
        for (const [sid, entry] of [...this.sessions.entries()]) {
          if (entry.userId === auth.user.userId) {
            entry.runtime?.wipe();
            this.sessions.delete(sid);
            this.metrics.removeSessionTelemetry(sid);
            this.pipeline.clearSession(sid);
          }
        }
        this.logger.info('account.data_wiped', {
          correlationId,
          userId: auth.user.userId,
          receiptId: receipt.receiptId,
        });
        this.writeJson(res, 200, receipt, correlationId);
        return;
      }

      if (method === 'POST' && pathname === '/api/billing/checkout-preview') {
        const body = this.parseJsonBody(await this.readRawBody(req, 64 * 1024));
        const validated = validatePaymentCheckoutPreviewRequest(body);
        if (!validated.ok) {
          this.writeError(
            res,
            new HttpServiceError('VALIDATION_ERROR', 'Invalid checkout preview request.'),
            correlationId,
            validated.issues,
          );
          return;
        }
        const preview = this.commercial.previewCheckout(auth.user, validated.value);
        this.writeJson(res, 200, preview, correlationId);
        return;
      }

      if (method === 'POST' && pathname === '/api/presentation/extract') {
        const body = this.parseJsonBody(await this.readRawBody(req, maxBodyBytes));
        const validated = validatePresentationExtractInput(body);
        if (!validated.ok) {
          this.writeError(
            res,
            new HttpServiceError('VALIDATION_ERROR', 'Invalid extract document request.'),
            correlationId,
            validated.issues,
          );
          return;
        }
        const result = extractPresentationDocument(validated.value, {
          maxUploadBytes: this.config.maxUploadBytes,
        });
        this.metrics.recordFunnelEvent('doc_extracted');
        this.commercial.recordUsage({
          user: auth.user,
          usageType: 'document_extract',
          quantity: result.characterCount || 1,
          unit: 'bytes',
          source: 'gateway.extract',
          idempotencyKey: `ext:${auth.user.userId}:${correlationId}`,
        });
        this.writeJson(res, 200, result, correlationId);
        return;
      }

      if (method === 'POST' && pathname === '/api/presentation/compile') {
        const body = this.parseJsonBody(await this.readRawBody(req, maxBodyBytes));
        const validated = validatePresentationCompileInput(body);
        if (!validated.ok) {
          this.writeError(
            res,
            new HttpServiceError('VALIDATION_ERROR', 'Invalid compile request payload.'),
            correlationId,
            validated.issues,
          );
          return;
        }

        let existingPack: PresentationContextPack | undefined;
        if (validated.value.packId) {
          const owner = this.packStore.getOwner(validated.value.packId);
          if (owner && !owner.isSample) {
            this.authService.assertOwnership(owner.userId, auth.user, 'presentation pack');
          }
          existingPack = this.packStore.get(validated.value.packId, auth.user.userId);
        }

        let compiled = compilePresentationPack(validated.value, this.clock.now(), {
          existingPack,
          userId: auth.user.userId,
          tenantId: auth.user.tenantId,
        });
        if (this.cpaClient && this.config.system2Mode === 'real' && !validated.value.useSamplePack) {
          try {
            const enhanced = await enhanceCompiledPackWithCpa(
              this.cpaClient,
              compiled,
              validated.value,
            );
            compiled = enhanced.pack;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            compiled = {
              ...compiled,
              warnings: [
                ...compiled.warnings,
                `CPA 编译器不可用，已自动回退为本地确定性编排 (${msg})`,
              ],
            };
          }
        }
        const saved = this.packStore.save(compiled, {
          isSampleOverride: Boolean(compiled.isSample),
        });
        this.metrics.recordFunnelEvent('pack_compiled');
        this.commercial.recordUsage({
          user: auth.user,
          usageType: 'context_compile',
          quantity: saved.facts.length,
          unit: 'count',
          source: 'gateway.compile',
          idempotencyKey: `cmp:${auth.user.userId}:${correlationId}`,
        });
        this.writeJson(res, 201, { pack: saved }, correlationId);
        return;
      }

      if (method === 'GET' && pathname === '/api/presentation/packs') {
        this.writeJson(
          res,
          200,
          { packs: this.packStore.listSummaries(auth.user.userId) },
          correlationId,
        );
        return;
      }

      const packMatch = /^\/api\/presentation\/packs\/([^/]+)$/.exec(pathname);
      if (packMatch) {
        const packId = decodeURIComponent(packMatch[1]);
        const owner = this.packStore.getOwner(packId);
        if (!owner) {
          this.writeError(res, new HttpServiceError('NOT_FOUND', `Pack "${packId}" not found.`), correlationId);
          return;
        }
        if (!owner.isSample) {
          this.authService.assertOwnership(owner.userId, auth.user, 'presentation pack');
        }

        if (method === 'GET') {
          const pack = this.packStore.get(packId, auth.user.userId);
          if (!pack) {
            this.writeError(res, new HttpServiceError('NOT_FOUND', `Pack "${packId}" not found.`), correlationId);
            return;
          }
          this.writeJson(res, 200, { pack }, correlationId);
          return;
        }

        if (method === 'PATCH') {
          const body = this.parseJsonBody(await this.readRawBody(req, 512 * 1024));
          const validated = validatePresentationPackPatchInput(body);
          if (!validated.ok) {
            this.writeError(
              res,
              new HttpServiceError('VALIDATION_ERROR', 'Invalid presentation pack patch payload.'),
              correlationId,
              validated.issues,
            );
            return;
          }
          const updated = this.packStore.patch(packId, validated.value, {
            userId: auth.user.userId,
            tenantId: auth.user.tenantId,
          });
          if (!updated) {
            this.writeError(res, new HttpServiceError('NOT_FOUND', `Pack "${packId}" not found.`), correlationId);
            return;
          }
          this.writeJson(res, 200, { pack: updated }, correlationId);
          return;
        }
      }

      if (method === 'GET' && pathname === '/api/memory') {
        const scenarioId = url.searchParams.get('scenarioId') || undefined;
        const sessionId = url.searchParams.get('sessionId') || undefined;
        const items = this.memoryStore.list({
          userId: auth.user.userId,
          scenarioId: scenarioId as never,
          sourceSessionId: sessionId,
        });
        this.writeJson(res, 200, { items }, correlationId);
        return;
      }

      if (method === 'POST' && pathname === '/api/memory') {
        const body = this.parseJsonBody(await this.readRawBody(req, 128 * 1024));
        const validated = validateMemoryCreateInput(body);
        if (!validated.ok) {
          this.writeError(
            res,
            new HttpServiceError('VALIDATION_ERROR', 'Invalid memory payload (userConfirmed=true required).'),
            correlationId,
            validated.issues,
          );
          return;
        }
        if (validated.value.userConfirmed !== true) {
          this.writeError(
            res,
            new HttpServiceError('VALIDATION_ERROR', 'Privacy rule: MemoryItem can only be persisted when userConfirmed === true.'),
            correlationId,
          );
          return;
        }
        const item = this.memoryStore.create({
          ...validated.value,
          userId: auth.user.userId,
          tenantId: auth.user.tenantId,
        });
        this.metrics.recordFunnelEvent('memory_saved');
        this.commercial.recordUsage({
          user: auth.user,
          sessionId: item.sourceSessionId,
          usageType: 'memory_write',
          quantity: 1,
          unit: 'count',
          source: 'gateway.memory',
          idempotencyKey: `mem:${item.memoryId}`,
        });
        this.writeJson(res, 201, { item }, correlationId);
        return;
      }

      const memMatch = /^\/api\/memory\/([^/]+)$/.exec(pathname);
      if (memMatch) {
        const memId = decodeURIComponent(memMatch[1]);
        const existing = this.memoryStore.get(memId);
        if (!existing) {
          this.writeError(res, new HttpServiceError('NOT_FOUND', `Memory "${memId}" not found.`), correlationId);
          return;
        }
        this.authService.assertOwnership(existing.userId, auth.user, 'memory item');

        if (method === 'PATCH') {
          const body = this.parseJsonBody(await this.readRawBody(req, 128 * 1024));
          const validated = validateMemoryPatchInput(body);
          if (!validated.ok) {
            this.writeError(
              res,
              new HttpServiceError('VALIDATION_ERROR', 'Invalid memory patch payload.'),
              correlationId,
              validated.issues,
            );
            return;
          }
          const updated = this.memoryStore.patch(memId, validated.value);
          this.writeJson(res, 200, updated ? { item: updated } : { deleted: true }, correlationId);
          return;
        }

        if (method === 'DELETE') {
          const deleted = this.memoryStore.delete(memId);
          this.writeJson(res, 200, { deleted }, correlationId);
          return;
        }
      }

      if (method === 'GET' && pathname === '/api/sessions') {
        const sessions = this.repo.listSessions(auth.user.userId);
        this.writeJson(res, 200, { sessions }, correlationId);
        return;
      }

      const sessionDetailMatch = /^\/api\/sessions\/([^/]+)$/.exec(pathname);
      if (sessionDetailMatch) {
        const sessionId = decodeURIComponent(sessionDetailMatch[1]);
        const live = this.sessions.get(sessionId);
        const stored = this.repo.getSession(sessionId);
        if (!live && !stored) {
          this.writeError(res, new HttpServiceError('NOT_FOUND', `Session "${sessionId}" not found.`), correlationId);
          return;
        }
        const ownerUserId = live?.userId ?? stored?.session.userId;
        this.authService.assertOwnership(ownerUserId, auth.user, 'session');

        if (method === 'GET') {
          const session = live?.runtime ? { ...live.runtime.context.session } : stored!.session;
          const reflection =
            live?.reflection ??
            live?.runtime?.buildReflection(this.config.defaultUtilityLambda) ??
            this.repo.getReflection(sessionId);
          this.writeJson(res, 200, { session, ...(reflection ? { reflection } : {}) }, correlationId);
          return;
        }

        if (method === 'DELETE') {
          const receipt = this.commercial.wipeSession(auth.user, sessionId);
          if (live) {
            live.runtime?.wipe();
            this.sessions.delete(sessionId);
          }
          this.metrics.removeSessionTelemetry(sessionId);
          this.metrics.recordFunnelEvent('session_wiped');
          this.pipeline.clearSession(sessionId);
          this.writeJson(res, 200, receipt, correlationId);
          return;
        }
      }

      const reflMatch = /^\/api\/sessions\/([^/]+)\/reflection$/.exec(pathname);
      if (method === 'GET' && reflMatch) {
        const sessionId = decodeURIComponent(reflMatch[1]);
        const live = this.sessions.get(sessionId);
        const stored = this.repo.getSession(sessionId);
        if (!live && !stored) {
          this.writeError(res, new HttpServiceError('NOT_FOUND', `Session "${sessionId}" not found.`), correlationId);
          return;
        }
        const ownerUserId = live?.userId ?? stored?.session.userId;
        this.authService.assertOwnership(ownerUserId, auth.user, 'session reflection');

        const lambdaParam = url.searchParams.get('lambda');
        const parsedLambda = lambdaParam ? Number(lambdaParam) : undefined;
        const lambda =
          parsedLambda !== undefined && Number.isFinite(parsedLambda) && parsedLambda > 0
            ? parsedLambda
            : this.config.defaultUtilityLambda;

        let reflection: PresentationReflection | undefined;
        if (live?.runtime) {
          reflection = live.runtime.buildReflection(lambda);
          if (this.cpaClient && this.config.system2Mode === 'real') {
            try {
              const enhanced = await enhanceReflectionWithCpa(this.cpaClient, reflection);
              if (enhanced.usage) {
                live.runtime.state.recordTelemetry(
                  'reflection',
                  enhanced.latencyMs ?? 0,
                  { ...enhanced.usage, correlationId },
                  this.cpaClient.config.providerLabel,
                  this.clock.now(),
                );
              }
              reflection = {
                ...enhanced.reflection,
                telemetry: live.runtime.state.getTelemetry(),
              };
            } catch {
              // Keep deterministic reflection if CPA reflection enhancement fails.
            }
          }
          live.reflection = reflection;
          this.repo.saveReflection(reflection, auth.user.userId, auth.user.tenantId);
        } else {
          reflection = live?.reflection ?? this.repo.getReflection(sessionId);
          if (reflection && lambdaParam) {
            reflection = {
              ...reflection,
              utility: computeUtilitySummary({
                interventions: live?.runtime?.state.getInterventionHistory() ?? [],
                decisions: [],
                lambda,
              }),
            };
          }
        }
        if (!reflection) {
          this.writeError(
            res,
            new HttpServiceError('NOT_FOUND', `Reflection for session "${sessionId}" is not available yet.`),
            correlationId,
          );
          return;
        }
        this.writeJson(res, 200, { reflection }, correlationId);
        return;
      }

      const wipeMatch = /^\/api\/sessions\/([^/]+)\/wipe$/.exec(pathname);
      if (method === 'POST' && wipeMatch) {
        const sessionId = decodeURIComponent(wipeMatch[1]);
        const live = this.sessions.get(sessionId);
        const stored = this.repo.getSession(sessionId);
        const ownerUserId = live?.userId ?? stored?.session.userId;
        this.authService.assertOwnership(ownerUserId, auth.user, 'session');

        const receipt = this.commercial.wipeSession(auth.user, sessionId);
        if (live) {
          live.runtime?.wipe();
          this.sessions.delete(sessionId);
        }
        this.metrics.removeSessionTelemetry(sessionId);
        this.metrics.recordFunnelEvent('session_wiped');
        this.pipeline.clearSession(sessionId);
        this.writeJson(res, 200, receipt, correlationId);
        return;
      }

      if (method === 'GET' && pathname === '/api/observability/summary') {
        this.writeJson(
          res,
          200,
          {
            metrics: this.metrics.snapshot(),
            pipeline: this.pipeline.getStageSummary(),
          },
          correlationId,
        );
        return;
      }

      this.writeError(res, new HttpServiceError('NOT_FOUND', `Route not found: ${method} ${pathname}`), correlationId);
    } catch (error) {
      if (error instanceof HttpServiceError) {
        this.writeError(res, error, correlationId);
        return;
      }
      this.logger.error('http.unhandled_error', {
        correlationId,
        method,
        pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      this.writeError(
        res,
        new HttpServiceError('INTERNAL_ERROR', error instanceof Error ? error.message : 'Internal server error'),
        correlationId,
      );
    } finally {
      this.metrics.recordHttpRequest(res.statusCode || 500, performance.now() - startMs);
    }
  }

  private handleWsUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (url.pathname !== '/ws' || !this.wss) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    if (!this.originGuard.evaluate(req.headers.origin).allowed) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const token =
      url.searchParams.get('token')?.trim() || extractBearerToken(req.headers.authorization);
    let auth: AuthenticatedContext;
    try {
      auth = this.authService.authenticateToken(token);
    } catch (error) {
      const status = error instanceof HttpServiceError && error.httpStatus === 401 ? 401 : 403;
      socket.write(`HTTP/1.1 ${status} Unauthorized\r\nConnection: close\r\n\r\n`);
      socket.destroy();
      return;
    }

    const rate = this.rateLimiter.consume(`ws:${auth.user.userId}:${getClientIp(req)}`);
    if (!rate.allowed) {
      socket.write(
        `HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${rate.retryAfterSec}\r\nConnection: close\r\n\r\n`,
      );
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.attachWsConnection(ws, req, url, auth.user);
    });
  }

  private buildHealthDualSystemMetrics(): DualSystemCollaborationMetrics {
    let latestActive: SessionEntry | undefined;
    let latestAny: SessionEntry | undefined;
    for (const entry of this.sessions.values()) {
      if (entry.runtime) {
        latestAny = entry;
        if (!entry.endedAtMs) {
          latestActive = entry;
        }
      }
    }
    const target = latestActive ?? latestAny;
    if (target?.runtime) {
      return target.runtime.state.getDualSystemMetrics();
    }
    return {
      s1Evaluations: 0,
      s1Escalations: 0,
      s2AsyncDispatches: 0,
      s2Completed: 0,
      s2CancelledAsStale: 0,
      s2Coalesced: 0,
      guidanceRevisionsIssued: 0,
      guidanceAppliedCount: 0,
      guidanceExpiredOrOverridden: 0,
    };
  }

  private enqueueSessionTask(entry: SessionEntry, task: () => Promise<void>): void {
    entry.serializeChain = entry.serializeChain
      .then(task)
      .then(() => undefined)
      .catch(() => undefined);
  }

  private stopSessionTickTimer(entry: SessionEntry): void {
    if (entry.tickTimer) {
      clearInterval(entry.tickTimer);
      entry.tickTimer = undefined;
    }
  }

  private ensureSessionTickTimer(entry: SessionEntry): void {
    if (entry.tickTimer || !entry.runtime || entry.endedAtMs) {
      return;
    }
    entry.tickTimer = setInterval(() => {
      if (!entry.runtime || entry.endedAtMs) {
        this.stopSessionTickTimer(entry);
        return;
      }
      this.enqueueSessionTask(entry, async () => {
        if (entry.runtime && !entry.endedAtMs) {
          await entry.runtime.processTick();
        }
      });
    }, 1000);
  }

  private closeSessionAsrStream(entry: SessionEntry): void {
    if (entry.asrStream) {
      try {
        entry.asrStream.end();
      } catch {
        // Ignore close failures
      }
      entry.asrStream = undefined;
    }
  }

  private broadcastToSession(entry: SessionEntry, msg: ServerMessage): void {
    for (const sub of entry.subscribers) {
      sub.send(msg);
      if (typeof msg.serverSeq === 'number' && msg.serverSeq > sub.lastSeenSeq) {
        sub.lastSeenSeq = msg.serverSeq;
      }
    }
  }

  private buildAttachState(
    entry: SessionEntry,
    role: WsAttachRole,
    lastSeenSeq: number,
  ): WsAttachState {
    const activePrimaryConnected = Boolean(
      entry.primarySubscriber && entry.primarySubscriber.ws.readyState === entry.primarySubscriber.ws.OPEN,
    );
    const companionCount = Array.from(entry.subscribers).filter(
      (sub) => sub.role === 'companion' && sub.ws.readyState === sub.ws.OPEN,
    ).length;
    const rolePolicy = createWsRolePolicy(role);
    return {
      sessionId: entry.sessionId,
      lastSeenSeq,
      role,
      activePrimaryConnected,
      canCaptureMic: rolePolicy.canCaptureMic,
      rolePolicy,
      companionCount,
    };
  }

  private broadcastAttachState(entry: SessionEntry, excludeSub?: WsSubscriber): void {
    for (const sub of entry.subscribers) {
      if (sub === excludeSub || sub.ws.readyState !== sub.ws.OPEN) {
        continue;
      }
      sub.send({
        type: 'session.attach_state',
        payload: this.buildAttachState(entry, sub.role, sub.lastSeenSeq),
      });
    }
  }

  private async openSessionAsrStream(
    entry: SessionEntry,
    initialAsrStatus: AsrCapabilityStatus,
    correlationId?: string,
  ): Promise<void> {
    if (!entry.runtime || this.asrEngine instanceof TextOnlyAsr) {
      return;
    }
    this.closeSessionAsrStream(entry);
    const shouldOpenColab = !(this.asrEngine instanceof ColabAsrProvider) || initialAsrStatus.available;
    if (!shouldOpenColab) {
      this.stateDegradeAsrNotice(entry.runtime, initialAsrStatus.detail);
      return;
    }
    const transcriptSource =
      this.asrEngine instanceof ColabAsrProvider
        ? 'external_asr'
        : this.asrEngine instanceof RemoteSherpaAsr
          ? 'remote_sherpa'
          : 'local_sherpa';
    try {
      entry.asrStream = await this.asrEngine.open(
        { sampleRate: 16_000 },
        {
          onPartial: (text) => {
            const fixed = correctAsrText(text, SAMPLE_ASR_CORRECTIONS);
            if (!fixed.trim() || !entry.runtime || entry.endedAtMs) return;
            this.enqueueSessionTask(entry, async () => {
              if (!entry.runtime || entry.endedAtMs) return;
              await entry.runtime.ingestSpeech({
                speaker: 'presenter',
                text: fixed,
                isFinal: false,
                source: transcriptSource,
              });
            });
          },
          onFinal: (text) => {
            const fixed = correctAsrText(text, SAMPLE_ASR_CORRECTIONS);
            if (!fixed.trim() || !entry.runtime || entry.endedAtMs) return;
            this.enqueueSessionTask(entry, async () => {
              if (!entry.runtime || entry.endedAtMs) return;
              await entry.runtime.ingestSpeech({
                speaker: 'presenter',
                text: fixed,
                isFinal: true,
                source: transcriptSource,
              });
            });
          },
          onError: (err) => {
            if (!entry.runtime) return;
            this.stateDegradeAsrNotice(entry.runtime, err.message);
            this.broadcastToSession(entry, {
              type: 'asr.status',
              correlationId,
              payload: this.getAsrCapability(),
            });
            this.broadcastToSession(entry, {
              type: 'session.error',
              ...(correlationId ? { correlationId } : {}),
              payload: { code: 'ASR_ERROR', message: err.message, sessionId: entry.sessionId },
            });
          },
        },
      );
    } catch (err) {
      this.stateDegradeAsrNotice(entry.runtime, (err as Error).message);
      this.broadcastToSession(entry, {
        type: 'asr.status',
        correlationId,
        payload: this.getAsrCapability(),
      });
      this.broadcastToSession(entry, {
        type: 'session.error',
        ...(correlationId ? { correlationId } : {}),
        payload: { code: 'ASR_ERROR', message: (err as Error).message, sessionId: entry.sessionId },
      });
    }
  }

  private attachWsConnection(
    ws: WebSocket,
    _req: IncomingMessage,
    url: URL,
    user: UserAccount,
  ): void {
    const reconnectSessionId = url.searchParams.get('sessionId')?.trim();
    const lastSeenSeqRaw = url.searchParams.get('lastSeenSeq');
    const lastSeenSeq = lastSeenSeqRaw ? Math.max(0, Number.parseInt(lastSeenSeqRaw, 10) || 0) : 0;
    const roleRaw = url.searchParams.get('role')?.trim();

    let connectionRole: WsAttachRole = 'primary';
    let invalidHandshakeRole: string | undefined;
    if (roleRaw) {
      const roleCheck = validateWsAttachRole(roleRaw);
      if (!roleCheck.ok) {
        invalidHandshakeRole = roleRaw;
      } else {
        connectionRole = roleCheck.value;
      }
    }

    this.liveSockets.add(ws);
    this.metrics.recordWsConnect(Boolean(reconnectSessionId));

    const sendRaw = (msg: ServerMessage) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    const sendError = (code: string, message: string, sessionId?: string, correlationId?: string) => {
      sendRaw({
        type: 'session.error',
        ...(correlationId ? { correlationId } : {}),
        payload: { code, message, sessionId },
      });
    };

    if (invalidHandshakeRole) {
      sendError(
        'VALIDATION_ERROR',
        `无效的 WebSocket 连接角色 "${invalidHandshakeRole}"，仅支持 primary 或 companion。`,
      );
      ws.on('close', () => {
        this.liveSockets.delete(ws);
        this.metrics.recordWsDisconnect();
      });
      return;
    }

    const COMPANION_ALLOWED_COMMANDS = new Set<ClientMessage['type']>([
      'session.attach',
      'ping',
      'intervention.request_help',
      'intervention.dismiss',
      'intervention.feedback',
    ]);

    let attachedEntry: SessionEntry | undefined;
    let socketChain = Promise.resolve();
    const subscriber: WsSubscriber = {
      ws,
      role: connectionRole,
      userId: user.userId,
      send: sendRaw,
      lastSeenSeq,
    };

    const detachCurrentSubscriber = (reason: 'switch' | 'close') => {
      if (!attachedEntry) {
        return;
      }
      const prevEntry = attachedEntry;
      const wasPrimary = prevEntry.primarySubscriber === subscriber;
      prevEntry.subscribers.delete(subscriber);
      if (wasPrimary) {
        prevEntry.primarySubscriber = undefined;
        if (reason === 'close') {
          // 主控端断线释放其麦克风采集流；若已无任何订阅端在线，再停止会话心跳。
          this.closeSessionAsrStream(prevEntry);
          if (prevEntry.subscribers.size === 0) {
            this.stopSessionTickTimer(prevEntry);
          }
        }
      }
      // 伴随窗断开绝不停止主控端 ASR 流或心跳定时器，仅更新在线计数。
      attachedEntry = undefined;
      this.broadcastAttachState(prevEntry);
    };

    const attachToSession = (opts: {
      sessionId: string;
      lastSeenSeq: number;
      requestedRole?: WsAttachRole;
      correlationId?: string;
      emitAttachEventToSelf: boolean;
    }): boolean => {
      const existing = this.sessions.get(opts.sessionId);
      if (!existing) {
        sendError('NOT_FOUND', `会话 ${opts.sessionId} 不存在或已过期。`, opts.sessionId, opts.correlationId);
        return false;
      }
      if (existing.userId !== user.userId && user.role !== 'admin') {
        sendError(
          'FORBIDDEN',
          'Cannot reconnect or attach to a session owned by another user.',
          opts.sessionId,
          opts.correlationId,
        );
        return false;
      }
      if (!existing.runtime || !existing.plugin) {
        sendError('NO_ACTIVE_SESSION', '目标会话运行时尚未就绪。', opts.sessionId, opts.correlationId);
        return false;
      }

      const resolvedRole = opts.requestedRole ?? connectionRole;
      if (
        resolvedRole === 'primary' &&
        existing.primarySubscriber &&
        existing.primarySubscriber !== subscriber &&
        existing.primarySubscriber.ws.readyState === existing.primarySubscriber.ws.OPEN
      ) {
        sendError(
          'PRIMARY_MIC_CONFLICT',
          '当前会话已有在线主控端占用麦克风与会话控制权，请使用 companion 模式接入或先断开原主控端。',
          opts.sessionId,
          opts.correlationId,
        );
        return false;
      }

      if (attachedEntry && attachedEntry !== existing) {
        detachCurrentSubscriber('switch');
      }

      connectionRole = resolvedRole;
      subscriber.role = resolvedRole;
      subscriber.lastSeenSeq = opts.lastSeenSeq;

      // 先执行 TTL 与状态对账，确保过期退出事件落入 session_events 后按序补播。
      existing.runtime.reconcileBeforeReconnect();
      const nowMs = this.clock.now();
      const stateSnap = existing.runtime.state.snapshot({
        recentObservations: existing.runtime.context.getRecentObservations(),
        recentSegments: existing.runtime.context.getRecentSegments(),
        now: nowMs,
      });
      const presState = existing.plugin.getProjection(stateSnap, nowMs);

      existing.subscribers.add(subscriber);
      if (resolvedRole === 'primary') {
        existing.primarySubscriber = subscriber;
      }
      attachedEntry = existing;
      if (!existing.endedAtMs) {
        this.ensureSessionTickTimer(existing);
      }

      const attachState = this.buildAttachState(existing, resolvedRole, opts.lastSeenSeq);
      sendRaw({
        type: 'session.ready',
        ...(opts.correlationId ? { correlationId: opts.correlationId } : {}),
        payload: {
          session: { ...existing.runtime.context.session },
          serverTime: nowUtcIso8601(),
          scenario: this.scenarios.assertRunnable('presentation'),
          asrStatus: this.getAsrCapability(),
          initialState: stateSnap,
          presentationState: presState,
          attachState,
        },
      });

      const currentActiveIntId = stateSnap.activeIntervention?.interventionId;
      const missed = this.repo.listSessionEventsSince(opts.sessionId, opts.lastSeenSeq, 'ws_server');
      let replayedCount = 0;
      for (const ev of missed) {
        // 已向当前连接下发带实时快照与 attachState 的 session.ready，跳过历史 session.ready 避免覆盖伴随角色。
        if (ev.eventType === 'session.ready') {
          continue;
        }
        if (ev.eventType === 'intervention.shown') {
          const p = ev.payload as { intervention?: { interventionId?: string } };
          if (p.intervention?.interventionId !== currentActiveIntId) {
            continue;
          }
        }
        replayedCount += 1;
        if (ev.serverSeq > subscriber.lastSeenSeq) {
          subscriber.lastSeenSeq = ev.serverSeq;
        }
        sendRaw({
          type: ev.eventType,
          serverSeq: ev.serverSeq,
          correlationId: ev.correlationId,
          payload: ev.payload,
        } as ServerMessage);
      }
      this.metrics.recordWsReplayed(replayedCount);

      if (opts.emitAttachEventToSelf) {
        this.broadcastAttachState(existing);
      } else {
        this.broadcastAttachState(existing, subscriber);
      }
      return true;
    };

    // 可选握手附着：/ws?token=...&sessionId=...&lastSeenSeq=...&role=primary|companion
    if (reconnectSessionId) {
      attachToSession({
        sessionId: reconnectSessionId,
        lastSeenSeq,
        requestedRole: connectionRole,
        emitAttachEventToSelf: false,
      });
    }

    const startPresentationSession = async (
      params: {
        scenarioId: string;
        packId?: string;
        contextPack?: PresentationContextPack;
        mode: PresentationMode;
        viewMode?: 'focus' | 'inspector';
        maxInterventionLevel?: 'L0' | 'L1' | 'L2' | 'L3';
        silentMode?: boolean;
        privacyNoticeAccepted: boolean;
        rehearsalTarget?: {
          weakSegmentId: string;
          chapterId: string;
          promptText?: string;
          targetPointLabels?: string[];
        };
      },
      correlationId?: string,
      idempotencyKey?: string,
    ) => {
      if (!params.privacyNoticeAccepted) {
        sendError('VALIDATION_ERROR', '请先确认实时转写与隐私提示声明后再开启会话。', undefined, correlationId);
        return;
      }

      let scenarioDescriptor;
      try {
        scenarioDescriptor = this.scenarios.assertRunnable(params.scenarioId);
      } catch (err) {
        if (err instanceof ScenarioNotImplementedError) {
          sendError('SCENARIO_NOT_IMPLEMENTED', err.message, undefined, correlationId);
          return;
        }
        throw err;
      }

      if (params.packId && !params.contextPack) {
        const packOwner = this.packStore.getOwner(params.packId);
        if (packOwner && !packOwner.isSample && packOwner.userId !== user.userId && user.role !== 'admin') {
          sendError('FORBIDDEN', '无权使用其他用户的演示准备包启动会话。', undefined, correlationId);
          return;
        }
      }

      const sessionId = `sess_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

      // Enforce commercial monthly quota atomically before creating runtime session.
      try {
        this.commercial.reserveSessionStart({
          user,
          sessionId,
          idempotencyKey: idempotencyKey
            ? `ws_start:${user.userId}:${idempotencyKey}`
            : `sess_start:${user.userId}:${sessionId}`,
        });
      } catch (err) {
        if (err instanceof HttpServiceError && err.code === 'QUOTA_EXCEEDED') {
          sendError('QUOTA_EXCEEDED', err.message, sessionId, correlationId);
          return;
        }
        throw err;
      }

      let pack =
        params.contextPack ??
        (params.packId ? this.packStore.get(params.packId, user.userId) : undefined) ??
        this.packStore.getDefaultPack(user.userId);
      if (params.packId && !params.contextPack && !this.packStore.get(params.packId, user.userId)) {
        pack = this.packStore.getDefaultPack(user.userId);
      }

      detachCurrentSubscriber('switch');

      const nowMs = this.clock.now();
      const plugin = new PresentationRuntimePlugin({
        sessionId,
        mode: params.mode,
        viewMode: params.viewMode ?? 'focus',
        pack,
        startedAt: nowMs,
        initialChapterId: params.rehearsalTarget?.chapterId ?? pack.progressNodes[0]?.chapterId,
      });

      subscriber.role = 'primary';
      subscriber.lastSeenSeq = 0;

      const entry: SessionEntry = {
        sessionId,
        userId: user.userId,
        tenantId: user.tenantId,
        packId: pack.packId,
        packTitle: pack.title,
        plugin,
        startedAtMs: nowMs,
        primarySubscriber: subscriber,
        subscribers: new Set([subscriber]),
        serializeChain: Promise.resolve(),
      };
      this.sessions.set(sessionId, entry);
      attachedEntry = entry;

      const fanout = (msg: ServerMessage) => {
        if (msg.type === 'system1.verdict') {
          this.metrics.recordProviderCall('system1', {
            ok: !msg.payload.usage?.degraded,
            degraded: Boolean(msg.payload.usage?.degraded),
            retries: msg.payload.usage?.retries ?? 0,
            latencyMs: msg.payload.latencyMs,
          });
        } else if (msg.type === 'system2.candidate') {
          this.metrics.recordProviderCall('system2', {
            ok: !msg.payload.usage?.degraded,
            degraded: Boolean(msg.payload.usage?.degraded),
            retries: msg.payload.usage?.retries ?? 0,
            latencyMs: msg.payload.latencyMs,
          });
        } else if (msg.type === 'controller.decision') {
          this.metrics.recordControllerDecision(
            msg.payload.selectedAction,
            msg.payload.withdrawalReason ?? msg.payload.suppressReason,
          );
        } else if (msg.type === 'intervention.shown') {
          this.metrics.recordGroundingCheck(msg.payload.intervention.grounded);
        } else if (msg.type === 'telemetry.updated') {
          this.metrics.updateSessionTelemetry(msg.payload);
        }

        this.broadcastToSession(entry, msg);
      };

      const initialAsrStatus = await this.probeAsrCapability();
      const runtime = new CognitiveRuntimeSession({
        sessionId,
        userId: user.userId,
        tenantId: user.tenantId,
        mode: params.mode,
        viewMode: params.viewMode ?? 'focus',
        silentMode: Boolean(params.silentMode),
        maxInterventionLevel: params.maxInterventionLevel ?? 'L3',
        privacyNoticeAccepted: params.privacyNoticeAccepted,
        contextPack: toUniversalContextPack(pack),
        goal: pack.goal,
        audience: pack.audience,
        targetDurationSec: pack.targetDurationSec,
        constraints: pack.cueSheet.chapters.map((c) => c.coreMessage),
        forbiddenClaims: pack.forbiddenClaims,
        initialChapterId: params.rehearsalTarget?.chapterId ?? pack.progressNodes[0]?.chapterId,
        initialChapterTitle:
          pack.progressNodes.find((n) => n.chapterId === params.rehearsalTarget?.chapterId)?.title ??
          pack.progressNodes[0]?.title,
        asrStatus: initialAsrStatus,
        plugin,
        fastDecision: this.fastDecision,
        slowReasoning: this.slowReasoning,
        retrieval: this.retrieval,
        controller: new InterventionController({
          cooldownMs: this.config.cooldownMs,
          candidateTtlMs: this.config.candidateTtlMs,
          dismissSuppressionMs: this.config.dismissSuppressionMs,
        }),
        memoryStore: this.memoryStore,
        clock: this.clock,
        pipeline: this.pipeline,
        asyncSystem2: true,
        emitMessage: fanout,
      });

      entry.runtime = runtime;

      this.repo.saveSession({
        session: { ...runtime.context.session },
        packTitle: pack.title,
        elapsedSec: 0,
      });

      this.metrics.recordFunnelEvent('session_started');
      await this.openSessionAsrStream(entry, initialAsrStatus, correlationId);

      const stateSnap = runtime.state.snapshot({
        recentObservations: runtime.context.getRecentObservations(),
        recentSegments: runtime.context.getRecentSegments(),
        now: nowMs,
      });
      const presState = plugin.getProjection(stateSnap, nowMs);

      const trackedReady = this.pipeline.emitEnvelope({
        stage: 'delivery',
        eventType: 'session.ready',
        producer: 'cuex-gateway',
        payload: {
          session: { ...runtime.context.session },
          serverTime: msToIso(nowMs),
          scenario: scenarioDescriptor,
          asrStatus: this.getAsrCapability(),
          initialState: stateSnap,
          presentationState: presState,
          attachState: this.buildAttachState(entry, 'primary', 0),
        },
        sessionId,
        tenantId: user.tenantId,
        userId: user.userId,
        correlationId,
        persistCategory: 'ws_server',
      });

      this.broadcastToSession(entry, {
        type: 'session.ready',
        serverSeq: trackedReady.serverSeq,
        correlationId: trackedReady.envelope.correlationId,
        envelope: trackedReady.envelopeMeta,
        payload: trackedReady.envelope.payload,
      });

      if (params.rehearsalTarget) {
        const weakSeg = {
          weakSegmentId: params.rehearsalTarget.weakSegmentId,
          atMs: nowMs,
          chapterId: params.rehearsalTarget.chapterId,
          chapterTitle: presState.chapterNodes.find((c) => c.chapterId === params.rehearsalTarget?.chapterId)?.title ?? '',
          reason: 'missed_key_point' as const,
          promptText: params.rehearsalTarget.promptText ?? '请围绕关键要点重新组织一句精炼表达。',
          excerptText: '',
          targetPointLabels: params.rehearsalTarget.targetPointLabels ?? [],
          supportingEvidence: pack.evidence.slice(0, 2),
          recommendedCue: params.rehearsalTarget.targetPointLabels?.[0] ?? pack.goal,
        };
        sendRaw({
          type: 'rehearsal.ready',
          correlationId,
          payload: {
            sessionId,
            weakSegment: weakSeg,
            promptText: weakSeg.promptText,
            supportingEvidence: weakSeg.supportingEvidence,
          },
        });
      }

      this.ensureSessionTickTimer(entry);
    };

    const handleMessage = async (msg: ClientMessage) => {
      const currentEntry = attachedEntry;
      const activeRuntime = currentEntry?.runtime;
      const activePlugin = currentEntry?.plugin;

      const idempotencyScope =
        msg.type === 'session.start' || msg.type === 'rehearsal.start'
          ? `ws_start:${user.userId}`
          : ('payload' in msg &&
              msg.payload &&
              typeof msg.payload === 'object' &&
              'sessionId' in msg.payload &&
              typeof (msg.payload as { sessionId?: string }).sessionId === 'string' &&
              (msg.payload as { sessionId?: string }).sessionId) ||
            activeRuntime?.sessionId ||
            `ws_user:${user.userId}`;

      if (msg.idempotencyKey) {
        const fresh = this.pipeline.claimIdempotencyKey(idempotencyScope, msg.idempotencyKey);
        if (!fresh) {
          this.metrics.recordWsDeduped();
          return;
        }
      }

      const correlationId = msg.correlationId ?? randomUUID();

      // 伴随窗安全隔离边界：禁止麦克风采集、会话启停/暂停/静默/wipe、章节/上限/视图篡改。
      if (connectionRole === 'companion' && !COMPANION_ALLOWED_COMMANDS.has(msg.type)) {
        sendError(
          'COMPANION_READ_ONLY',
          `伴随窗（companion）无权执行控制或采集指令 "${msg.type}"；仅允许求助、忽略、反馈与重连附着。`,
          activeRuntime?.sessionId,
          correlationId,
        );
        return;
      }

      switch (msg.type) {
        case 'ping': {
          sendRaw({
            type: 'pong',
            correlationId,
            payload: { t: msg.payload.t, serverTime: nowUtcIso8601() },
          });
          return;
        }

        case 'session.attach': {
          attachToSession({
            sessionId: msg.payload.sessionId,
            lastSeenSeq: Math.max(0, msg.payload.lastSeenSeq ?? 0),
            requestedRole: msg.payload.role,
            correlationId,
            emitAttachEventToSelf: true,
          });
          return;
        }

        case 'session.start': {
          const p = msg.payload;
          await startPresentationSession(
            {
              scenarioId: p.scenarioId,
              packId: p.packId,
              contextPack:
                p.contextPack && 'cueSheet' in p.contextPack
                  ? (p.contextPack as PresentationContextPack)
                  : undefined,
              mode: p.mode,
              viewMode: p.viewMode,
              maxInterventionLevel: p.maxInterventionLevel,
              silentMode: p.silentMode,
              privacyNoticeAccepted: p.privacyNoticeAccepted,
              rehearsalTarget: p.rehearsalTarget,
            },
            correlationId,
            msg.idempotencyKey,
          );
          return;
        }

        case 'rehearsal.start': {
          const sourceEntry = this.sessions.get(msg.payload.sourceSessionId);
          const sourceStored = this.repo.getSession(msg.payload.sourceSessionId);
          const sourceOwnerId = sourceEntry?.userId ?? sourceStored?.session.userId;
          if (sourceOwnerId && sourceOwnerId !== user.userId && user.role !== 'admin') {
            sendError('FORBIDDEN', '无权基于其他用户的会话发起复盘重练。', undefined, correlationId);
            return;
          }
          const sourceRefl =
            sourceEntry?.reflection ??
            sourceEntry?.runtime?.buildReflection(this.config.defaultUtilityLambda) ??
            this.repo.getReflection(msg.payload.sourceSessionId);
          const weak = sourceRefl?.weakSegments.find(
            (w) => w.weakSegmentId === msg.payload.weakSegmentId,
          );
          await startPresentationSession(
            {
              scenarioId: 'presentation',
              packId: msg.payload.packId,
              mode: 'rehearsal',
              viewMode: 'focus',
              privacyNoticeAccepted: true,
              rehearsalTarget: {
                weakSegmentId: msg.payload.weakSegmentId,
                chapterId: weak?.chapterId ?? msg.payload.chapterId,
                promptText: weak?.promptText,
                targetPointLabels: weak?.targetPointLabels,
              },
            },
            correlationId,
            msg.idempotencyKey,
          );
          return;
        }

        case 'audio.chunk': {
          if (!currentEntry || !activeRuntime) {
            sendError('NO_ACTIVE_SESSION', '请先启动会话再发送音频帧。', undefined, correlationId);
            return;
          }
          if (this.asrEngine instanceof TextOnlyAsr) {
            sendError(
              'ASR_TEXT_ONLY',
              '当前服务端未连接 Sherpa 流式语音识别，请切换为浏览器 Web Speech 或文本仿真。',
              activeRuntime.sessionId,
              correlationId,
            );
            return;
          }
          if (!currentEntry.asrStream) {
            const st = this.getAsrCapability();
            sendError(
              'ASR_UNAVAILABLE',
              this.asrEngine instanceof ColabAsrProvider
                ? `Colab GPU ASR 不可用 (${st.detail})`
                : '流式 ASR 会话尚未打开或已关闭。',
              activeRuntime.sessionId,
              correlationId,
            );
            return;
          }
          const pcm = Buffer.from(msg.payload.data, 'base64');
          const frameDurationMs =
            msg.payload.sampleRate > 0
              ? Math.round((pcm.length / 2 / Math.max(1, msg.payload.channels) / msg.payload.sampleRate) * 1000)
              : 0;
          if (frameDurationMs > 0) {
            activeRuntime.state.recordAsrMetrics({
              provider: this.getAsrCapability().backend,
              durationMs: frameDurationMs,
              nowMs: this.clock.now(),
            });
          }
          currentEntry.asrStream.write(pcm);
          return;
        }

        case 'speech.delta': {
          if (!activeRuntime) {
            sendError('NO_ACTIVE_SESSION', '请先启动会话再发送语音转写文本。', undefined, correlationId);
            return;
          }
          const fixed = correctAsrText(msg.payload.text, SAMPLE_ASR_CORRECTIONS);
          await activeRuntime.ingestSpeech({
            speaker: msg.payload.speaker,
            text: fixed,
            isFinal: msg.payload.isFinal,
            confidence: msg.payload.confidence,
            startMs: msg.payload.startMs,
            endMs: msg.payload.endMs,
            source: msg.payload.source ?? 'text_simulation',
            correlationId,
          });
          return;
        }

        case 'chapter.set': {
          activeRuntime?.setChapter(msg.payload.chapterId, correlationId);
          return;
        }

        case 'intervention.request_help': {
          if (!activeRuntime) {
            sendError('NO_ACTIVE_SESSION', '请先连接或启动会话后再请求实时协助。', undefined, correlationId);
            return;
          }
          await activeRuntime.requestManualHelp({
            preferredLevel: msg.payload.preferredLevel,
            question: msg.payload.question,
            correlationId,
          });
          return;
        }

        case 'intervention.dismiss': {
          if (!activeRuntime) {
            if (connectionRole === 'companion') {
              sendError('NO_ACTIVE_SESSION', '请先附着会话后再忽略提示卡。', undefined, correlationId);
            }
            return;
          }
          activeRuntime.dismissIntervention(msg.payload, correlationId);
          return;
        }

        case 'intervention.set_ceiling': {
          activeRuntime?.setCeiling(msg.payload.maxLevel, correlationId);
          return;
        }

        case 'intervention.feedback': {
          if (!activeRuntime) {
            if (connectionRole === 'companion') {
              sendError('NO_ACTIVE_SESSION', '请先附着会话后再提交提示卡反馈。', undefined, correlationId);
            }
            return;
          }
          activeRuntime.recordFeedback(msg.payload.interventionId, msg.payload.feedback, correlationId);
          return;
        }

        case 'view.mode': {
          activePlugin?.setViewMode(msg.payload.viewMode);
          activeRuntime?.setViewMode(msg.payload.viewMode, correlationId);
          return;
        }

        case 'session.pause': {
          activeRuntime?.pause(correlationId);
          return;
        }

        case 'session.resume': {
          activeRuntime?.resume(correlationId);
          return;
        }

        case 'session.silent': {
          activeRuntime?.setSilentMode(msg.payload.silentMode, correlationId);
          return;
        }

        case 'session.stop':
        case 'session.end': {
          if (!currentEntry || !activeRuntime) return;
          this.stopSessionTickTimer(currentEntry);
          this.closeSessionAsrStream(currentEntry);
          const result = activeRuntime.end(this.config.defaultUtilityLambda, correlationId);
          if (this.cpaClient && this.config.system2Mode === 'real') {
            try {
              const enhanced = await enhanceReflectionWithCpa(this.cpaClient, result.reflection);
              if (enhanced.usage) {
                activeRuntime.state.recordTelemetry(
                  'reflection',
                  enhanced.latencyMs ?? 0,
                  { ...enhanced.usage, correlationId },
                  this.cpaClient.config.providerLabel,
                  this.clock.now(),
                );
              }
              const updatedTelemetry = activeRuntime.state.getTelemetry();
              result.reflection = { ...enhanced.reflection, telemetry: updatedTelemetry };
              result.outcome = { ...result.outcome, telemetry: updatedTelemetry };
            } catch {
              // Keep deterministic reflection & outcome on CPA enhancement failure.
            }
          }
          const endedMs = isoToMs(result.endedAt, this.clock.now());
          currentEntry.reflection = result.reflection;
          currentEntry.endedAtMs = endedMs;

          this.repo.saveSession({
            session: { ...activeRuntime.context.session },
            packTitle: currentEntry.packTitle,
            elapsedSec: Math.round(result.durationMs / 1000),
            durationMs: result.durationMs,
            utilityScore: result.outcome.utilityScore,
            coverageRatio: result.outcome.coverageRatio,
          });
          this.repo.saveReflection(result.reflection, user.userId, user.tenantId);
          this.commercial.recordTelemetryUsage(user, result.outcome.telemetry);

          if (result.outcome.telemetry.asrDurationMs > 0) {
            this.commercial.recordUsage({
              user,
              sessionId: activeRuntime.sessionId,
              usageType: 'live_audio_ms',
              quantity: result.outcome.telemetry.asrDurationMs,
              unit: 'ms',
              source: result.outcome.telemetry.asrProvider,
              idempotencyKey: `asr:${activeRuntime.sessionId}`,
              decrementLiveMinutes: Math.max(0, Math.round(result.outcome.telemetry.asrDurationMs / 60_000)),
            });
          }

          this.metrics.recordFunnelEvent('session_completed');

          const trackedEnded = this.pipeline.emitEnvelope({
            stage: 'delivery',
            eventType: 'session.ended',
            producer: 'cuex-gateway',
            payload: {
              sessionId: activeRuntime.sessionId,
              endedAt: result.endedAt,
              durationMs: result.durationMs,
              outcome: result.outcome,
              reflection: result.reflection,
            },
            sessionId: activeRuntime.sessionId,
            tenantId: user.tenantId,
            userId: user.userId,
            correlationId,
            persistCategory: 'ws_server',
          });

          this.broadcastToSession(currentEntry, {
            type: 'session.ended',
            serverSeq: trackedEnded.serverSeq,
            correlationId: trackedEnded.envelope.correlationId,
            envelope: trackedEnded.envelopeMeta,
            payload: trackedEnded.envelope.payload,
          });
          return;
        }

        case 'session.wipe': {
          const targetId = msg.payload.sessionId || activeRuntime?.sessionId;
          if (!targetId) return;
          const targetEntry = this.sessions.get(targetId);
          const storedTarget = this.repo.getSession(targetId);
          const targetOwnerId = targetEntry?.userId ?? storedTarget?.session.userId;
          if (targetOwnerId && targetOwnerId !== user.userId && user.role !== 'admin') {
            sendError('FORBIDDEN', '无权擦除其他用户的会话数据。', targetId, correlationId);
            return;
          }
          if (targetEntry) {
            this.stopSessionTickTimer(targetEntry);
            this.closeSessionAsrStream(targetEntry);
          }
          this.commercial.wipeSession(user, targetId);
          const wipedAt = targetEntry?.runtime?.wipe().wipedAt ?? nowUtcIso8601();
          const wipedMsg: ServerMessage = {
            type: 'session.wiped',
            correlationId,
            payload: { sessionId: targetId, wipedAt },
          };
          if (targetEntry && targetEntry.subscribers.size > 0) {
            this.broadcastToSession(targetEntry, wipedMsg);
          } else {
            sendRaw(wipedMsg);
          }
          this.sessions.delete(targetId);
          this.metrics.removeSessionTelemetry(targetId);
          this.metrics.recordFunnelEvent('session_wiped');
          this.pipeline.clearSession(targetId);
          if (attachedEntry?.sessionId === targetId) {
            attachedEntry = undefined;
          }
          return;
        }
      }
    };

    ws.on('message', (data: RawData) => {
      let parsedRaw: unknown;
      try {
        parsedRaw = JSON.parse(data.toString());
      } catch {
        sendError('INVALID_JSON', 'WebSocket 消息必须是有效的 JSON。');
        return;
      }

      const validated = validateClientMessage(parsedRaw);
      if (!validated.ok) {
        sendError(
          'VALIDATION_ERROR',
          `无效的 WebSocket 客户端指令: ${validated.issues.map((e) => e.message).join('; ')}`,
          attachedEntry?.sessionId,
        );
        return;
      }

      const parsed = validated.value;
      const reportMsgError = (error: unknown) => {
        const errCode = error instanceof HttpServiceError ? error.code : 'MESSAGE_ERROR';
        sendError(
          errCode,
          error instanceof Error ? error.message : String(error),
          attachedEntry?.sessionId,
          parsed.correlationId,
        );
      };

      socketChain = socketChain.then(() => {
        if (attachedEntry) {
          const targetEntry = attachedEntry;
          const task = targetEntry.serializeChain
            .then(() => handleMessage(parsed))
            .catch(reportMsgError);
          targetEntry.serializeChain = task.then(() => undefined);
          return task;
        }
        return handleMessage(parsed).catch(reportMsgError);
      });
    });

    ws.on('close', () => {
      this.liveSockets.delete(ws);
      this.metrics.recordWsDisconnect();
      detachCurrentSubscriber('close');
    });
  }

  private stateDegradeAsrNotice(
    runtime: CognitiveRuntimeSession<unknown, PresentationReflection>,
    detail: string,
  ): void {
    runtime.state.recordAsrMetrics({
      provider: this.getAsrCapability().backend,
      durationMs: 0,
      degraded: true,
      nowMs: this.clock.now(),
    });
    this.logger.warn('asr.degraded', { sessionId: runtime.sessionId, detail });
  }
}

export type { EnvelopeMetaRef };
type EnvelopeMetaRef = EventEnvelopeMeta;
