import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type {
  AudioChunkPayload,
  ClientMessage,
  HealthStatusResponse,
  MemoryCreateInput,
  MemoryPatchInput,
  PresentationCompileInput,
  PresentationContextPack,
  PresentationExtractInput,
  PresentationPackPatchInput,
  PresentationReflection,
  PresentationWeakSegment,
  ScenarioId,
  ServerMessage,
} from '@cuex/protocol';
import { loadServerConfig, type ServerConfig } from '../config';
import {
  CognitiveRuntimeSession,
  InterventionController,
  LexicalBm25RetrievalProvider,
  MemoryStore,
  createFastDecisionProvider,
  createSlowReasoningProvider,
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
  toUniversalContextPack,
} from '../scenarios';
import {
  TextOnlyAsr,
  correctAsrText,
  createAsrEngine,
  describeAsrCapability,
  type AsrEngine,
  type AsrStream,
} from '../voice';

export interface GatewayDependencies {
  config?: ServerConfig;
  clock?: RuntimeClock;
  memoryStore?: MemoryStore;
  packStore?: PresentationPackStore;
  scenarioRegistry?: ScenarioRegistry;
  fastDecision?: FastDecisionProvider;
  slowReasoning?: SlowReasoningProvider;
  retrieval?: RetrievalProvider;
  asrEngine?: AsrEngine;
}

interface SessionArchiveEntry {
  sessionId: string;
  pack: PresentationContextPack;
  runtime?: CognitiveRuntimeSession<unknown, PresentationReflection>;
  reflection?: PresentationReflection;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody<T>(req: IncomingMessage, maxBytes: number): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw Object.assign(new Error(`Request payload exceeds ${maxBytes} bytes`), { statusCode: 413 });
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw Object.assign(new Error('Invalid JSON request body'), { statusCode: 400 });
  }
}

function validateAudioChunk(
  payload: AudioChunkPayload,
  maxChars: number,
): Buffer {
  if (!payload || typeof payload !== 'object') {
    throw new Error('audio.chunk payload must be an object');
  }
  if (payload.format === 'opus') {
    throw new Error('Opus transcoding is not enabled on this server; send pcm16 16000Hz mono frames or speech.delta.');
  }
  if (payload.format !== 'pcm16' || payload.sampleRate !== 16_000 || payload.channels !== 1) {
    throw new Error('audio.chunk requires format="pcm16", sampleRate=16000, channels=1');
  }
  if (typeof payload.data !== 'string' || !payload.data || payload.data.length > maxChars) {
    throw new Error('audio.chunk data must be non-empty base64 within frame limit');
  }
  const pcm = Buffer.from(payload.data, 'base64');
  if (pcm.length === 0 || pcm.length % 2 !== 0) {
    throw new Error('audio.chunk PCM16 byte length must be even and non-empty');
  }
  return pcm;
}

function isAllowedOrigin(originHeader: string | undefined): boolean {
  if (!originHeader) return true;
  try {
    const parsed = new URL(originHeader);
    return (
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

/**
 * Full-Duplex HTTP + WebSocket Gateway (`/ws`, `/api/*`, `/health`).
 */
export class CueXGatewayServer {
  readonly config: ServerConfig;
  readonly clock: RuntimeClock;
  readonly memoryStore: MemoryStore;
  readonly packStore: PresentationPackStore;
  readonly scenarioRegistry: ScenarioRegistry;
  readonly fastDecision: FastDecisionProvider;
  readonly slowReasoning: SlowReasoningProvider;
  readonly retrieval: RetrievalProvider;
  readonly asrEngine: AsrEngine;

  private readonly httpServer: Server;
  private readonly wss: WebSocketServer;
  private readonly sessions = new Map<string, SessionArchiveEntry>();
  private sessionSeq = 0;

  constructor(deps: GatewayDependencies = {}) {
    this.config = deps.config ?? loadServerConfig();
    this.clock = deps.clock ?? systemClock;
    this.memoryStore = deps.memoryStore ?? new MemoryStore(this.config.memoryDir);
    this.packStore = deps.packStore ?? new PresentationPackStore(this.config.packsDir);
    this.scenarioRegistry = deps.scenarioRegistry ?? new ScenarioRegistry();
    this.fastDecision =
      deps.fastDecision ?? createFastDecisionProvider(this.config.system1Mode);
    this.slowReasoning =
      deps.slowReasoning ??
      createSlowReasoningProvider(this.config.system2Mode, {
        candidateTtlMs: this.config.candidateTtlMs,
      });
    this.retrieval = deps.retrieval ?? new LexicalBm25RetrievalProvider();
    this.asrEngine = deps.asrEngine ?? createAsrEngine();

    this.httpServer = createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: this.config.maxWsPayloadBytes,
    });
    this.httpServer.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });
  }

  async start(): Promise<{ port: number; host: string }> {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.httpServer.off('listening', onListen);
        reject(err);
      };
      const onListen = () => {
        this.httpServer.off('error', onError);
        resolve();
      };
      this.httpServer.once('error', onError);
      this.httpServer.once('listening', onListen);
      this.httpServer.listen(this.config.port, this.config.host);
    });
    const addr = this.httpServer.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to resolve listening server address');
    }
    return { port: addr.port, host: addr.address };
  }

  async stop(): Promise<void> {
    for (const client of this.wss.clients) {
      client.close(1001, 'Server shutting down');
    }
    this.wss.close();
    await new Promise<void>((resolve) => {
      this.httpServer.close(() => resolve());
    });
  }

  getPort(): number {
    const addr = this.httpServer.address();
    return addr && typeof addr !== 'string' ? addr.port : this.config.port;
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname !== '/ws' && pathname !== '/ws/session') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!isAllowedOrigin(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.attachWsConnection(ws);
    });
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = url.pathname;

    try {
      if (req.method === 'GET' && pathname === '/health') {
        const [asr, s1Health, s2Health] = await Promise.all([
          describeAsrCapability(this.asrEngine),
          this.fastDecision.health(),
          this.slowReasoning.health(),
        ]);
        const body: HealthStatusResponse = {
          ok: true,
          service: 'cuex-runtime-server',
          version: this.config.serviceVersion,
          timestamp: this.clock.now(),
          asr,
          system1: {
            backend: this.fastDecision.backend,
            mode: this.fastDecision.mode,
            healthy: s1Health.ok,
            detail: s1Health.detail,
          },
          system2: {
            backend: this.slowReasoning.backend,
            mode: this.slowReasoning.mode,
            healthy: s2Health.ok,
            detail: s2Health.detail,
          },
        };
        sendJson(res, 200, body);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/scenarios') {
        sendJson(res, 200, { scenarios: this.scenarioRegistry.listScenarios() });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/presentation/extract') {
        const body = await readJsonBody<PresentationExtractInput>(req, 15 * 1024 * 1024);
        if (!body.filename) {
          sendJson(res, 400, { error: 'filename is required' });
          return;
        }
        sendJson(res, 200, extractPresentationDocument(body));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/presentation/compile') {
        const body = await readJsonBody<PresentationCompileInput>(req, 4 * 1024 * 1024);
        const compiled = compilePresentationPack(body, this.clock.now());
        const saved = this.packStore.save(compiled);
        sendJson(res, 201, { pack: saved });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/presentation/packs') {
        sendJson(res, 200, { packs: this.packStore.listSummaries() });
        return;
      }

      const packMatch = /^\/api\/presentation\/packs\/([^/]+)$/.exec(pathname);
      if (packMatch) {
        const packId = decodeURIComponent(packMatch[1]);
        if (req.method === 'GET') {
          const pack = this.packStore.get(packId);
          if (!pack) {
            sendJson(res, 404, { error: `Presentation pack "${packId}" not found.` });
            return;
          }
          sendJson(res, 200, { pack });
          return;
        }
        if (req.method === 'PATCH') {
          const body = await readJsonBody<PresentationPackPatchInput>(req, 2 * 1024 * 1024);
          const updated = this.packStore.patch(packId, body);
          if (!updated) {
            sendJson(res, 404, { error: `Presentation pack "${packId}" not found.` });
            return;
          }
          sendJson(res, 200, { pack: updated });
          return;
        }
      }

      if (req.method === 'GET' && pathname === '/api/memory') {
        const scenarioId = (url.searchParams.get('scenarioId') as ScenarioId | 'universal' | null) ?? undefined;
        const sessionId = url.searchParams.get('sessionId') ?? undefined;
        sendJson(res, 200, { items: this.memoryStore.list({ scenarioId, sessionId }) });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/memory') {
        const body = await readJsonBody<MemoryCreateInput>(req, 256 * 1024);
        if (body.userConfirmed !== true) {
          sendJson(res, 400, { error: 'Memory items require explicit userConfirmed === true.' });
          return;
        }
        const item = this.memoryStore.create(body);
        sendJson(res, 201, { item });
        return;
      }

      const memoryMatch = /^\/api\/memory\/([^/]+)$/.exec(pathname);
      if (memoryMatch) {
        const memoryId = decodeURIComponent(memoryMatch[1]);
        if (req.method === 'PATCH') {
          const body = await readJsonBody<MemoryPatchInput>(req, 256 * 1024);
          const existing = this.memoryStore.get(memoryId);
          if (!existing) {
            sendJson(res, 404, { error: `Memory item "${memoryId}" not found.` });
            return;
          }
          const updated = this.memoryStore.patch(memoryId, body);
          if (!updated) {
            sendJson(res, 200, { deleted: true, memoryId });
            return;
          }
          sendJson(res, 200, { item: updated });
          return;
        }
        if (req.method === 'DELETE') {
          const deleted = this.memoryStore.delete(memoryId);
          if (!deleted) {
            sendJson(res, 404, { error: `Memory item "${memoryId}" not found.` });
            return;
          }
          sendJson(res, 200, { deleted: true, memoryId });
          return;
        }
      }

      const wipeMatch = /^\/api\/sessions\/([^/]+)\/wipe$/.exec(pathname);
      if (wipeMatch && req.method === 'POST') {
        const sessionId = decodeURIComponent(wipeMatch[1]);
        const entry = this.sessions.get(sessionId);
        let wipedAt = this.clock.now();
        let deletedMemoryCount = 0;
        if (entry?.runtime) {
          const wiped = entry.runtime.wipe();
          wipedAt = wiped.wipedAt;
          deletedMemoryCount = wiped.deletedMemoryCount;
        } else {
          deletedMemoryCount = this.memoryStore.wipeSession(sessionId);
        }
        this.sessions.delete(sessionId);
        sendJson(res, 200, { wiped: true, sessionId, wipedAt, deletedMemoryCount });
        return;
      }

      const reflMatch = /^\/api\/sessions\/([^/]+)\/reflection$/.exec(pathname);
      if (reflMatch && req.method === 'GET') {
        const sessionId = decodeURIComponent(reflMatch[1]);
        const lambdaRaw = url.searchParams.get('lambda');
        const lambda = lambdaRaw !== null && Number.isFinite(Number(lambdaRaw)) ? Number(lambdaRaw) : this.config.defaultUtilityLambda;
        const entry = this.sessions.get(sessionId);
        if (!entry) {
          sendJson(res, 404, { error: `Session "${sessionId}" not found.` });
          return;
        }
        const reflection = entry.runtime
          ? entry.runtime.buildReflection(lambda)
          : entry.reflection;
        if (!reflection) {
          sendJson(res, 404, { error: `Reflection unavailable for session "${sessionId}".` });
          return;
        }
        sendJson(res, 200, { reflection });
        return;
      }

      sendJson(res, 404, { error: `Route not found: ${req.method} ${pathname}` });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 400;
      sendJson(res, status, {
        error: error instanceof Error ? error.message : 'Unexpected server error',
      });
    }
  }

  private attachWsConnection(ws: WebSocket): void {
    let activeRuntime: CognitiveRuntimeSession<unknown, PresentationReflection> | undefined;
    let activePlugin: PresentationRuntimePlugin | undefined;
    let asrStream: AsrStream | undefined;
    let asrOpenPromise: Promise<AsrStream> | undefined;
    let streamGen = 0;
    let tickTimer: NodeJS.Timeout | undefined;
    let serializeChain: Promise<unknown> = Promise.resolve();

    const send = (message: ServerMessage) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    };

    const sendError = (code: string, message: string, sessionId?: string) => {
      send({
        type: 'session.error',
        payload: { code, message, ...(sessionId ? { sessionId } : {}) },
      });
    };

    const closeAsrStream = () => {
      streamGen += 1;
      asrOpenPromise = undefined;
      try {
        asrStream?.end();
      } catch {
        // Ignore stream cleanup failures.
      }
      asrStream = undefined;
    };

    const stopTimers = () => {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = undefined;
      }
    };

    const startPresentationSession = async (params: {
      scenarioId: ScenarioId;
      packId?: string;
      contextPack?: PresentationContextPack;
      mode: 'rehearsal' | 'live';
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
    }) => {
      if (!params.privacyNoticeAccepted) {
        sendError('PRIVACY_CONSENT_REQUIRED', '必须先确认本地录音/文稿处理说明后才能开启会话。');
        return;
      }

      let scenario;
      try {
        scenario = this.scenarioRegistry.assertRunnable(params.scenarioId);
      } catch (error) {
        if (error instanceof ScenarioNotImplementedError) {
          sendError('SCENARIO_NOT_IMPLEMENTED', error.message);
          return;
        }
        throw error;
      }

      stopTimers();
      closeAsrStream();

      const pack: PresentationContextPack =
        params.contextPack && 'cueSheet' in params.contextPack
          ? params.contextPack
          : params.packId
            ? this.packStore.get(params.packId) ?? this.packStore.getDefaultPack()
            : this.packStore.getDefaultPack();

      const now = this.clock.now();
      const sessionId = `sess_${now}_${++this.sessionSeq}`;
      const viewMode = params.viewMode ?? 'focus';
      const initialChapter =
        (params.rehearsalTarget?.chapterId
          ? pack.progressNodes.find((n) => n.chapterId === params.rehearsalTarget?.chapterId)
          : undefined) ?? pack.progressNodes[0];

      const plugin = new PresentationRuntimePlugin({
        sessionId,
        mode: params.mode,
        viewMode,
        pack,
        startedAt: now,
        initialChapterId: initialChapter?.chapterId,
      });

      const asrStatus = await describeAsrCapability(this.asrEngine);

      const runtime = new CognitiveRuntimeSession({
        sessionId,
        mode: params.mode,
        viewMode,
        silentMode: Boolean(params.silentMode),
        maxInterventionLevel: params.maxInterventionLevel ?? 'L2',
        privacyNoticeAccepted: true,
        contextPack: toUniversalContextPack(pack),
        goal: pack.goal,
        audience: pack.audience,
        targetDurationSec: pack.targetDurationSec,
        constraints: pack.cueSheet.chapters.map((ch) => ch.coreMessage),
        forbiddenClaims: pack.forbiddenClaims,
        initialChapterId: initialChapter?.chapterId,
        initialChapterTitle: initialChapter?.title,
        asrStatus,
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
        emitMessage: send,
      });

      activeRuntime = runtime as unknown as CognitiveRuntimeSession<unknown, PresentationReflection>;
      activePlugin = plugin;
      this.sessions.set(sessionId, {
        sessionId,
        pack,
        runtime: activeRuntime,
      });

      const initialState = runtime.state.snapshot({
        recentObservations: [],
        recentSegments: [],
        now,
      });
      const presentationState = plugin.getProjection(initialState, now);

      send({
        type: 'session.ready',
        payload: {
          session: { ...runtime.context.session },
          serverTime: now,
          scenario,
          asrStatus,
          initialState: { ...initialState, scenarioState: presentationState as unknown as Record<string, unknown> },
          presentationState,
        },
      });
      send({ type: 'asr.status', payload: asrStatus });

      if (params.mode === 'rehearsal' && params.rehearsalTarget) {
        const weakSeg: PresentationWeakSegment = {
          weakSegmentId: params.rehearsalTarget.weakSegmentId,
          atMs: now,
          chapterId: initialChapter?.chapterId ?? '',
          chapterTitle: initialChapter?.title ?? '',
          reason: 'missed_key_point',
          promptText:
            params.rehearsalTarget.promptText ??
            `针对「${initialChapter?.title ?? '本节'}」进行单点加固重练。`,
          excerptText: '',
          targetPointLabels:
            params.rehearsalTarget.targetPointLabels ??
            initialChapter?.keyPoints.map((k) => k.label) ??
            [],
          supportingEvidence: pack.evidence.slice(0, 3),
          recommendedCue: initialChapter?.keyPoints[0]?.label ?? pack.goal,
        };
        send({
          type: 'rehearsal.ready',
          payload: {
            sessionId,
            weakSegment: weakSeg,
            promptText: weakSeg.promptText,
            supportingEvidence: weakSeg.supportingEvidence,
          },
        });
      }

      tickTimer = setInterval(() => {
        if (!activeRuntime || activeRuntime.state.getSessionStatus() !== 'active') return;
        serializeChain = serializeChain
          .then(() => activeRuntime?.processTick())
          .catch(() => undefined);
      }, 1000);
      tickTimer.unref();
    };

    const ensureAsrStream = async (sampleRate: number): Promise<AsrStream> => {
      if (asrStream) return asrStream;
      if (asrOpenPromise) return asrOpenPromise;
      const myGen = streamGen;
      const myRuntime = activeRuntime;
      const transcriptSource =
        this.asrEngine.backend === 'sherpa-ws' ? 'remote_sherpa' : 'local_sherpa';
      asrOpenPromise = this.asrEngine
        .open(
          { sampleRate },
          {
            onPartial(rawText) {
              if (myGen !== streamGen || !myRuntime) return;
              const corrected = correctAsrText(rawText, SAMPLE_ASR_CORRECTIONS);
              serializeChain = serializeChain
                .then(() =>
                  myRuntime.ingestSpeech({
                    speaker: 'presenter',
                    text: corrected,
                    isFinal: false,
                    source: transcriptSource,
                  }),
                )
                .catch(() => undefined);
            },
            onFinal(rawText) {
              if (myGen !== streamGen || !myRuntime) return;
              const corrected = correctAsrText(rawText, SAMPLE_ASR_CORRECTIONS);
              serializeChain = serializeChain
                .then(() =>
                  myRuntime.ingestSpeech({
                    speaker: 'presenter',
                    text: corrected,
                    isFinal: true,
                    source: transcriptSource,
                  }),
                )
                .catch(() => undefined);
            },
            onError(err) {
              if (myGen !== streamGen) return;
              sendError('ASR_STREAM_ERROR', err.message, myRuntime?.sessionId);
            },
          },
        )
        .then((opened) => {
          if (myGen !== streamGen) {
            opened.end();
            throw new Error('ASR stream superseded');
          }
          asrStream = opened;
          return opened;
        });
      return asrOpenPromise;
    };

    const handleMessage = async (msg: ClientMessage) => {
      switch (msg.type) {
        case 'ping':
          send({ type: 'pong', payload: { t: msg.payload.t, serverTime: this.clock.now() } });
          return;

        case 'session.start': {
          const p = msg.payload;
          await startPresentationSession({
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
          });
          return;
        }

        case 'rehearsal.start': {
          const sourceEntry = this.sessions.get(msg.payload.sourceSessionId);
          const sourceRefl =
            sourceEntry?.reflection ?? sourceEntry?.runtime?.buildReflection(this.config.defaultUtilityLambda);
          const weak = sourceRefl?.weakSegments.find(
            (w) => w.weakSegmentId === msg.payload.weakSegmentId,
          );
          await startPresentationSession({
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
          });
          return;
        }

        case 'audio.chunk': {
          if (!activeRuntime) {
            sendError('NO_ACTIVE_SESSION', '请先启动会话再发送音频帧。');
            return;
          }
          if (this.asrEngine instanceof TextOnlyAsr) {
            sendError(
              'ASR_TEXT_ONLY',
              '当前服务端未连接 Sherpa 流式语音识别，请切换为浏览器 Web Speech 或文本仿真。',
              activeRuntime.sessionId,
            );
            return;
          }
          const pcm = validateAudioChunk(msg.payload, this.config.maxAudioFrameChars);
          const stream = await ensureAsrStream(msg.payload.sampleRate);
          stream.write(pcm);
          return;
        }

        case 'speech.delta': {
          if (!activeRuntime) {
            sendError('NO_ACTIVE_SESSION', '请先启动会话再发送发言文本。');
            return;
          }
          const corrected = correctAsrText(msg.payload.text, SAMPLE_ASR_CORRECTIONS);
          if (!corrected.trim()) return;
          await activeRuntime.ingestSpeech({
            speaker: msg.payload.speaker ?? 'presenter',
            text: corrected,
            isFinal: msg.payload.isFinal,
            confidence: msg.payload.confidence,
            startMs: msg.payload.startMs,
            endMs: msg.payload.endMs,
            source: msg.payload.source ?? 'text_simulation',
          });
          return;
        }

        case 'chapter.set': {
          if (!activeRuntime) return;
          activeRuntime.setChapter(msg.payload.chapterId);
          return;
        }

        case 'session.pause':
          activeRuntime?.pause();
          return;

        case 'session.resume':
          activeRuntime?.resume();
          return;

        case 'session.silent':
          activeRuntime?.setSilentMode(msg.payload.silentMode);
          return;

        case 'view.mode':
          activePlugin?.setViewMode(msg.payload.viewMode);
          activeRuntime?.setViewMode(msg.payload.viewMode);
          return;

        case 'intervention.set_ceiling':
          activeRuntime?.setCeiling(msg.payload.maxLevel);
          return;

        case 'intervention.request_help':
          await activeRuntime?.requestManualHelp({
            preferredLevel: msg.payload.preferredLevel,
            question: msg.payload.question,
          });
          return;

        case 'intervention.dismiss':
          activeRuntime?.dismissIntervention({
            interventionId: msg.payload.interventionId,
            candidateId: msg.payload.candidateId,
            reason: msg.payload.reason,
          });
          return;

        case 'intervention.feedback':
          activeRuntime?.recordFeedback(
            msg.payload.interventionId,
            msg.payload.feedback,
          );
          return;

        case 'session.stop':
        case 'session.end': {
          if (!activeRuntime) return;
          stopTimers();
          closeAsrStream();
          const result = activeRuntime.end(this.config.defaultUtilityLambda);
          const entry = this.sessions.get(activeRuntime.sessionId);
          if (entry) {
            entry.reflection = result.reflection;
          }
          send({
            type: 'session.ended',
            payload: {
              sessionId: activeRuntime.sessionId,
              endedAt: result.endedAt,
              durationMs: result.durationMs,
              outcome: result.outcome,
              reflection: result.reflection,
            },
          });
          return;
        }

        case 'session.wipe': {
          const targetId = msg.payload.sessionId || activeRuntime?.sessionId;
          if (!targetId) return;
          stopTimers();
          closeAsrStream();
          const wipedAt = activeRuntime?.wipe().wipedAt ?? this.clock.now();
          this.sessions.delete(targetId);
          if (activeRuntime?.sessionId === targetId) {
            activeRuntime = undefined;
            activePlugin = undefined;
          }
          send({
            type: 'session.wiped',
            payload: { sessionId: targetId, wipedAt },
          });
          return;
        }
      }
    };

    ws.on('message', (data: RawData) => {
      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        sendError('INVALID_JSON', 'WebSocket 消息必须是有效的 JSON。');
        return;
      }
      serializeChain = serializeChain
        .then(() => handleMessage(parsed))
        .catch((error) => {
          sendError(
            'MESSAGE_ERROR',
            error instanceof Error ? error.message : String(error),
            activeRuntime?.sessionId,
          );
        });
    });

    ws.on('close', () => {
      stopTimers();
      closeAsrStream();
    });
  }
}
