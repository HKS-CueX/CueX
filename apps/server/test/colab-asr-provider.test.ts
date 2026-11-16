import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import { COLAB_ASR_LIFECYCLE_STATES } from '@cuex/protocol';
import { loadServerConfig } from '../src/config';
import { CueXGatewayServer } from '../src/gateway/GatewayServer';
import { SqliteRepository } from '../src/storage';
import { ColabAsrProvider, resolveColabAsrConfig } from '../src/voice';

test('ColabAsrProvider covers all 7 lifecycle states cleanly without false ready claims or key leaks', async () => {
  // 1. not_configured
  const unconfigured = new ColabAsrProvider({ config: null });
  const sNotCfg = await unconfigured.probe();
  assert.equal(sNotCfg.mode, 'colab_gpu');
  assert.equal(sNotCfg.lifecycleState, 'not_configured');
  assert.equal(sNotCfg.available, false);
  assert.equal(sNotCfg.fallbackActive, true);

  // 2. unavailable (missing API key)
  const missingKeyCfg = resolveColabAsrConfig({
    CUEX_COLAB_ASR_URL: 'https://colab.mock.local:10086',
  });
  const missingKey = new ColabAsrProvider({ config: missingKeyCfg });
  const sNoKey = await missingKey.probe();
  assert.equal(sNoKey.lifecycleState, 'unavailable');
  assert.equal(sNoKey.available, false);
  assert.equal(sNoKey.fallbackActive, true);

  // Mock HTTP probing for starting -> ready -> degraded -> unavailable (401)
  const secretKey = 'colab-secret-token-never-print-9988';
  const cfg = resolveColabAsrConfig({
    CUEX_COLAB_ASR_URL: 'https://user:pw@colab.mock.local:10086/',
    CUEX_COLAB_ASR_API_KEY: secretKey,
  })!;
  assert.equal(cfg.baseUrl, 'https://colab.mock.local:10086');
  assert.equal(cfg.wsUrl, 'wss://colab.mock.local:10086/v1/asr/stream');
  assert.ok(!cfg.redact(`error token=${secretKey}`).includes(secretKey));

  let mode: 'starting' | 'ready' | 'degraded_500' | 'unauth_401' = 'starting';
  const provider = new ColabAsrProvider({
    config: cfg,
    httpRequest: async (req) => {
      assert.equal(req.headers.Authorization, `Bearer ${secretKey}`);
      if (mode === 'unauth_401') return { status: 401, body: {} };
      if (mode === 'degraded_500') return { status: 503, body: { ok: false } };
      if (mode === 'starting') {
        if (req.url.endsWith('/health')) {
          return {
            status: 200,
            body: {
              ready: false,
              lifecycleState: 'starting',
              model: 'iic/SenseVoiceSmall',
              gpu: { name: 'Tesla T4' },
            },
          };
        }
        return { status: 503, body: { ready: false, lifecycleState: 'starting' } };
      }
      if (req.url.endsWith('/health')) {
        return {
          status: 200,
          body: {
            ready: true,
            lifecycleState: 'ready',
            model: 'iic/SenseVoiceSmall',
            gpu: { name: 'Tesla T4' },
            metrics: { avgRtf: 0.042 },
          },
        };
      }
      return { status: 200, body: { ready: true, lifecycleState: 'ready' } };
    },
  });

  // 3. starting
  const sStarting = await provider.probe();
  assert.equal(sStarting.lifecycleState, 'starting');
  assert.equal(sStarting.available, false);
  assert.equal(sStarting.fallbackActive, true);
  assert.equal(sStarting.gpuName, 'Tesla T4');

  // 4. ready
  mode = 'ready';
  const sReady = await provider.probe();
  assert.equal(sReady.lifecycleState, 'ready');
  assert.equal(sReady.available, true);
  assert.equal(sReady.streaming, true);
  assert.equal(sReady.fallbackActive, false);
  assert.equal(sReady.modelId, 'iic/SenseVoiceSmall');
  assert.equal(sReady.rtf, 0.042);

  // 5. degraded
  mode = 'degraded_500';
  const sDegraded = await provider.probe();
  assert.equal(sDegraded.lifecycleState, 'degraded');
  assert.equal(sDegraded.available, false);
  assert.equal(sDegraded.fallbackActive, true);

  // 6. unavailable (401)
  mode = 'unauth_401';
  const sUnauth = await provider.probe();
  assert.equal(sUnauth.lifecycleState, 'unavailable');
  assert.equal(sUnauth.available, false);
  assert.equal(sUnauth.fallbackActive, true);

  // 7. restarting / disconnected explicit transitions
  provider.setLifecycleState('restarting', 'reconnecting stream');
  assert.equal(provider.getStatus().lifecycleState, 'restarting');
  assert.equal(provider.getStatus().available, false);
  provider.setLifecycleState('disconnected', 'ws closed');
  assert.equal(provider.getStatus().lifecycleState, 'disconnected');
  assert.equal(provider.getStatus().available, false);

  // Confirm test covered every state in COLAB_ASR_LIFECYCLE_STATES
  const covered = new Set([
    sNotCfg.lifecycleState,
    sStarting.lifecycleState,
    sReady.lifecycleState,
    sDegraded.lifecycleState,
    sUnauth.lifecycleState,
    'restarting',
    'disconnected',
  ]);
  for (const state of COLAB_ASR_LIFECYCLE_STATES) {
    assert.ok(covered.has(state), `Missing lifecycle coverage for ${state}`);
  }
});

test('ColabAsrProvider streams PCM16LE over WSS, handles reconnect/disconnect, batch transcribe, and Gateway /ws integration', async () => {
  const apiKey = 'colab-live-mock-key-abc123xyz';
  const seenAuthHeaders: string[] = [];
  const receivedBinaryLengths: number[] = [];
  let wsDropOnce = true;

  const mockServer = createServer((req, res) => {
    const auth = req.headers.authorization ?? '';
    seenAuthHeaders.push(auth);
    if (auth !== `Bearer ${apiKey}`) {
      res.statusCode = 401;
      res.end(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED' } }));
      return;
    }

    if (req.url?.startsWith('/health')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          status: 'ok',
          ready: true,
          lifecycleState: 'ready',
          model: 'iic/SenseVoiceSmall',
          gpu: { name: 'NVIDIA T4' },
          metrics: { avgRtf: 0.038 },
        }),
      );
      return;
    }
    if (req.url?.startsWith('/ready')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ready: true, lifecycleState: 'ready' }));
      return;
    }
    if (req.url?.startsWith('/v1/asr/transcribe')) {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const buf = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: true,
            text: `批量转写结果 (${buf.length} bytes)`,
            language: 'zh',
            audioDurationMs: 1200,
            latencyMs: 55,
            rtf: 0.045,
            model: 'iic/SenseVoiceSmall',
            gpu: 'NVIDIA T4',
          }),
        );
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  const mockWss = new WebSocketServer({ noServer: true });
  mockServer.on('upgrade', (req, socket, head) => {
    if (req.headers.authorization !== `Bearer ${apiKey}`) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    mockWss.handleUpgrade(req, socket, head, (ws) => {
      mockWss.emit('connection', ws, req);
    });
  });

  mockWss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'ready', model: 'iic/SenseVoiceSmall', gpu: 'NVIDIA T4' }));
    if (wsDropOnce) {
      wsDropOnce = false;
      setTimeout(() => ws.close(1012, 'simulated restart'), 20);
      return;
    }
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        receivedBinaryLengths.push(buf.length);
        ws.send(JSON.stringify({ type: 'partial', text: '我们看下一章', rtf: 0.04 }));
      } else {
        const msg = JSON.parse(data.toString('utf8')) as { type?: string };
        if (msg.type === 'flush') {
          ws.send(JSON.stringify({ type: 'final', text: 'flush分段结果。', rtf: 0.031 }));
        } else if (msg.type === 'end') {
          ws.send(JSON.stringify({ type: 'final', text: '我们看下一章核心架构设计。', rtf: 0.039 }));
          ws.send(JSON.stringify({ type: 'done' }));
          ws.close(1000);
        }
      }
    });
  });

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const mockAddr = mockServer.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${mockAddr.port}`;

  const dir = mkdtempSync(path.join(tmpdir(), 'cuex-colab-gw-'));
  try {
    const cfg = resolveColabAsrConfig({
      CUEX_COLAB_ASR_URL: baseUrl,
      CUEX_COLAB_ASR_API_KEY: apiKey,
    })!;

    const colabAsr = new ColabAsrProvider({
      config: cfg,
      reconnectDelayMs: 30,
      maxReconnects: 2,
    });

    // Batch transcribe check
    const batchRes = await colabAsr.transcribeBatch(Buffer.alloc(3200, 1));
    assert.equal(batchRes.ok, true);
    assert.ok(batchRes.text.includes('3200 bytes'));
    assert.equal(batchRes.gpu, 'NVIDIA T4');

    // GatewayServer integration
    const serverCfg = loadServerConfig({
      PORT: '0',
      CUEX_RUNTIME_DIR: dir,
      CUEX_ASR: 'real',
      CUEX_SYSTEM1: 'fake',
      CUEX_SYSTEM2: 'fake',
    });
    const repo = new SqliteRepository(path.join(dir, 'gw.db'));
    repo.init();
    const gw = new CueXGatewayServer({
      config: serverCfg,
      repo,
      asrEngine: colabAsr,
    });
    const gwAddr = await gw.start();
    try {
      const hRes = await fetch(`http://127.0.0.1:${gwAddr.port}/health`);
      assert.equal(hRes.status, 200);
      const hJson = (await hRes.json()) as {
        asr: { mode: string; lifecycleState?: string; available: boolean; gpuName?: string; rtf?: number };
      };
      assert.equal(hJson.asr.mode, 'colab_gpu');
      assert.equal(hJson.asr.lifecycleState, 'ready');
      assert.equal(hJson.asr.available, true);
      assert.equal(hJson.asr.gpuName, 'NVIDIA T4');

      // Auth session + WS flow with audio.chunk streaming through ColabAsrProvider reconnect
      const authRes = await fetch(`http://127.0.0.1:${gwAddr.port}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Colab Probe User' }),
      });
      const authJson = (await authRes.json()) as { token: string };

      const wsEvents: Array<{ type: string; payload?: Record<string, unknown> }> = [];
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${gwAddr.port}/ws?token=${authJson.token}`);
        const timer = setTimeout(() => {
          ws.terminate();
          reject(new Error(`WS e2e timeout; received events=${wsEvents.map((e) => e.type).join(',')}`));
        }, 4000);
        let sentAudio = false;
        let activeSessionId = '';
        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              type: 'session.start',
              payload: {
                scenarioId: 'presentation',
                packId: 'pack_cuex_demo_01',
                mode: 'live',
                viewMode: 'focus',
                privacyNoticeAccepted: true,
              },
            }),
          );
        });
        ws.on('message', async (raw) => {
          const msg = JSON.parse(raw.toString('utf8')) as { type: string; payload?: Record<string, unknown> };
          wsEvents.push(msg);
          if (msg.type === 'session.error') {
            clearTimeout(timer);
            ws.close();
            reject(new Error(`Unexpected gateway WS error: ${JSON.stringify(msg.payload)}`));
            return;
          }
          if (msg.type === 'session.ready' && !sentAudio) {
            sentAudio = true;
            activeSessionId =
              ((msg.payload?.session as { sessionId?: string } | undefined)?.sessionId) ?? '';
            // Wait past first simulated WS drop + reconnect (20ms + 30ms)
            await new Promise((r) => setTimeout(r, 150));
            const pcm16 = Buffer.alloc(6400); // 200ms @ 16kHz PCM16LE
            ws.send(
              JSON.stringify({
                type: 'audio.chunk',
                payload: {
                  format: 'pcm16',
                  sampleRate: 16_000,
                  channels: 1,
                  data: pcm16.toString('base64'),
                  timestamp: Date.now(),
                },
              }),
            );
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  type: 'session.end',
                  payload: { sessionId: activeSessionId, reason: 'completed' },
                }),
              );
            }, 150);
          }
          if (msg.type === 'session.ended') {
            clearTimeout(timer);
            ws.close();
            resolve();
          }
        });
        ws.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      assert.ok(receivedBinaryLengths.includes(6400), 'PCM16LE bytes must pass untouched without float32 expansion');
      assert.ok(wsEvents.some((e) => e.type === 'asr.status' || e.type === 'session.ready'));
      assert.ok(wsEvents.some((e) => e.type === 'asr.transcript'));
      assert.ok(seenAuthHeaders.every((h) => h === `Bearer ${apiKey}`));

      // Direct stream.flush() check (without closing underlying WSS)
      const flushFinals: string[] = [];
      const directStream = await colabAsr.open(
        { sampleRate: 16_000 },
        {
          onPartial: () => {},
          onFinal: (txt) => flushFinals.push(txt),
          onError: (err) => assert.fail(`Unexpected flush stream error: ${err.message}`),
        },
      );
      directStream.write(Buffer.alloc(3200, 2));
      directStream.flush?.();
      await new Promise((r) => setTimeout(r, 80));
      assert.ok(flushFinals.includes('flush分段结果。'), `Expected flush final, got ${JSON.stringify(flushFinals)}`);
      directStream.end();
      await new Promise((r) => setTimeout(r, 60));
    } finally {
      await gw.stop();
    }
  } finally {
    for (const client of mockWss.clients) client.terminate();
    mockWss.close();
    mockServer.closeAllConnections?.();
    mockServer.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Unreachable Colab ASR exposes honest unavailable state on session.ready and returns ASR_UNAVAILABLE on audio.chunk', async () => {
  const probeSock = createServer();
  await new Promise<void>((resolve) => probeSock.listen(0, '127.0.0.1', resolve));
  const unusedPort = (probeSock.address() as { port: number }).port;
  await new Promise<void>((resolve) => probeSock.close(() => resolve()));

  const dir = mkdtempSync(path.join(tmpdir(), 'cuex-colab-down-'));
  try {
    const cfg = resolveColabAsrConfig({
      CUEX_COLAB_ASR_URL: `http://127.0.0.1:${unusedPort}`,
      CUEX_COLAB_ASR_API_KEY: 'colab-down-key',
      CUEX_COLAB_ASR_TIMEOUT_MS: '500',
    })!;
    const colabAsr = new ColabAsrProvider({ config: cfg, reconnectDelayMs: 20, maxReconnects: 1 });
    const serverCfg = loadServerConfig({
      PORT: '0',
      CUEX_RUNTIME_DIR: dir,
      CUEX_ASR: 'real',
      CUEX_SYSTEM1: 'fake',
      CUEX_SYSTEM2: 'fake',
    });
    const repo = new SqliteRepository(path.join(dir, 'gw.db'));
    repo.init();
    const gw = new CueXGatewayServer({ config: serverCfg, repo, asrEngine: colabAsr });
    const gwAddr = await gw.start();
    try {
      const authRes = await fetch(`http://127.0.0.1:${gwAddr.port}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: 'Colab Down User' }),
      });
      const authJson = (await authRes.json()) as { token: string };

      const events: Array<{ type: string; payload?: Record<string, unknown> }> = [];
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${gwAddr.port}/ws?token=${authJson.token}`);
        const timer = setTimeout(() => {
          ws.terminate();
          reject(new Error(`Timeout waiting for unavailable ASR check: ${events.map((e) => e.type).join(',')}`));
        }, 4000);
        let downSessionId = '';
        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              type: 'session.start',
              payload: {
                scenarioId: 'presentation',
                packId: 'pack_cuex_demo_01',
                mode: 'live',
                viewMode: 'focus',
                privacyNoticeAccepted: true,
              },
            }),
          );
        });
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString('utf8')) as { type: string; payload?: Record<string, unknown> };
          events.push(msg);
          if (msg.type === 'session.ready') {
            downSessionId =
              ((msg.payload?.session as { sessionId?: string } | undefined)?.sessionId) ?? '';
            ws.send(
              JSON.stringify({
                type: 'audio.chunk',
                payload: {
                  format: 'pcm16',
                  sampleRate: 16_000,
                  channels: 1,
                  data: Buffer.alloc(1600).toString('base64'),
                  timestamp: Date.now(),
                },
              }),
            );
          } else if (msg.type === 'session.error' && msg.payload?.code === 'ASR_UNAVAILABLE') {
            ws.send(
              JSON.stringify({
                type: 'session.end',
                payload: { sessionId: downSessionId, reason: 'completed' },
              }),
            );
          } else if (msg.type === 'session.error') {
            clearTimeout(timer);
            ws.close();
            reject(new Error(`Unexpected session.error: ${JSON.stringify(msg.payload)}`));
          } else if (msg.type === 'session.ended') {
            clearTimeout(timer);
            ws.close();
            resolve();
          }
        });
        ws.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const readyEvt = events.find((e) => e.type === 'session.ready');
      const asrStatus = readyEvt?.payload?.asrStatus as Record<string, unknown> | undefined;
      assert.equal(asrStatus?.mode, 'colab_gpu');
      assert.equal(asrStatus?.available, false);
      assert.equal(asrStatus?.lifecycleState, 'unavailable');
      assert.equal(asrStatus?.fallbackActive, true);
      assert.ok(events.some((e) => e.type === 'session.error' && e.payload?.code === 'ASR_UNAVAILABLE'));
    } finally {
      await gw.stop();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
