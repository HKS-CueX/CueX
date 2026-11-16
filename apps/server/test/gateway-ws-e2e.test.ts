import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@cuex/protocol';
import { loadServerConfig } from '../src/config';
import { CueXGatewayServer } from '../src/gateway/GatewayServer';
import type { AsrCallbacks, AsrEngine, AsrStream } from '../src/voice';

function waitForMessage(
  queue: ServerMessage[],
  waiters: Array<() => void>,
  predicate: (m: ServerMessage) => boolean,
  timeoutMs = 5_000,
): Promise<ServerMessage> {
  const existing = queue.findIndex(predicate);
  if (existing >= 0) {
    return Promise.resolve(queue.splice(existing, 1)[0]);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for WS message. Seen: ${queue.map((m) => m.type).join(', ')}`));
    }, timeoutMs);
    const check = () => {
      const idx = queue.findIndex(predicate);
      if (idx >= 0) {
        clearTimeout(timer);
        const msg = queue.splice(idx, 1)[0];
        resolve(msg);
      } else {
        waiters.push(check);
      }
    };
    waiters.push(check);
  });
}

test('CueXGatewayServer HTTP API and WebSocket /ws live presentation & rehearsal flow', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cuex-gw-e2e-'));
  const baseCfg = loadServerConfig({
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '0',
    CUEX_RUNTIME_DIR: tmpDir,
    CUEX_MEMORY_DIR: path.join(tmpDir, 'memory'),
    CUEX_PACKS_DIR: path.join(tmpDir, 'packs'),
    CUEX_SYSTEM1: 'fake',
    CUEX_SYSTEM2: 'fake',
    CUEX_ASR: 'fake',
  });

  const server = new CueXGatewayServer({ config: baseCfg });
  const { port } = await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health & Scenario Registry
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const health = (await healthRes.json()) as {
      ok: boolean;
      asr: { mode: string };
      system1: { mode: string };
    };
    assert.equal(health.ok, true);
    assert.equal(health.asr.mode, 'text_simulation');
    assert.equal(health.system1.mode, 'local_fallback');

    const scenariosRes = await fetch(`${baseUrl}/api/scenarios`);
    const scenariosBody = (await scenariosRes.json()) as {
      scenarios: Array<{ id: string; status: string }>;
    };
    assert.equal(
      scenariosBody.scenarios.find((s) => s.id === 'presentation')?.status,
      'implemented',
    );
    assert.equal(
      scenariosBody.scenarios.find((s) => s.id === 'social')?.status,
      'roadmap',
    );

    // 1b. Protected routes reject unauthenticated access when CUEX_AUTH_REQUIRED=true (default)
    const unauthRes = await fetch(`${baseUrl}/api/presentation/packs`);
    assert.equal(unauthRes.status, 401);

    const authRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'E2E Presenter', email: 'e2e@example.com' }),
    });
    assert.equal(authRes.status, 200);
    const authJson = (await authRes.json()) as {
      authenticated: boolean;
      token: string;
      user: { userId: string };
    };
    assert.equal(authJson.authenticated, true);
    assert.ok(authJson.token);
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authJson.token}`,
    };

    // 2. Document extract & compile & pack list
    const extRes = await fetch(`${baseUrl}/api/presentation/extract`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        filename: 'pitch.md',
        textContent: '# 问题定义\n实时演讲打断注意力。\n# 方案核心\nSystem 1 延迟预算 1460 ms。',
      }),
    });
    assert.equal(extRes.status, 200);
    const extracted = (await extRes.json()) as {
      status: string;
      unreadable: boolean;
      sections: unknown[];
    };
    assert.equal(extracted.status, 'parsed');
    assert.equal(extracted.unreadable, false);
    assert.equal(extracted.sections.length, 2);

    const compRes = await fetch(`${baseUrl}/api/presentation/compile`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'API 测试演讲包',
        sceneType: 'pitch',
        goal: '验证编译与实机流程',
        audience: '测试评委',
        targetDurationSec: 240,
        rawMaterials: '传统辅助工具太慢，本系统保持 1460 ms 以内延迟并支持自动撤回。',
      }),
    });
    assert.equal(compRes.status, 201);

    const packsRes = await fetch(`${baseUrl}/api/presentation/packs`, {
      headers: { Authorization: `Bearer ${authJson.token}` },
    });
    assert.equal(packsRes.status, 200);
    const packsBody = (await packsRes.json()) as { packs: Array<{ packId: string }> };
    assert.ok(packsBody.packs.some((p) => p.packId === 'pack_cuex_demo_01'));

    // 3. Memory API rejects userConfirmed !== true, accepts opt-in
    const badMemRes = await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        scenarioId: 'presentation',
        category: 'preference',
        title: '非法写入',
        content: 'test',
        userConfirmed: false,
        privacyLevel: 'local_private',
        scope: 'scenario',
      }),
    });
    assert.equal(badMemRes.status, 400);

    // 4. WebSocket /ws Session E2E
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(authJson.token)}`);
    const queue: ServerMessage[] = [];
    const waiters: Array<() => void> = [];

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      queue.push(msg);
      const pending = waiters.splice(0, waiters.length);
      for (const fn of pending) fn();
    });

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const sendWs = (msg: ClientMessage) => ws.send(JSON.stringify(msg));

    // Reject unimplemented roadmap scenario cleanly
    sendWs({
      type: 'session.start',
      payload: {
        scenarioId: 'social',
        mode: 'live',
        privacyNoticeAccepted: true,
      },
    });
    const roadmapErr = await waitForMessage(queue, waiters, (m) => m.type === 'session.error');
    assert.equal(roadmapErr.type, 'session.error');
    assert.equal(roadmapErr.payload.code, 'SCENARIO_NOT_IMPLEMENTED');

    // Start Presentation live session
    sendWs({
      type: 'session.start',
      payload: {
        scenarioId: 'presentation',
        packId: 'pack_cuex_demo_01',
        mode: 'live',
        viewMode: 'focus',
        maxInterventionLevel: 'L2',
        privacyNoticeAccepted: true,
      },
    });
    const readyMsg = await waitForMessage(queue, waiters, (m) => m.type === 'session.ready');
    assert.equal(readyMsg.type, 'session.ready');
    assert.equal(typeof readyMsg.serverSeq, 'number');
    assert.ok(readyMsg.envelope?.eventId);
    const sessionId = readyMsg.payload.session.sessionId;

    // TextOnlyAsr rejects audio.chunk cleanly
    sendWs({
      type: 'audio.chunk',
      payload: {
        format: 'pcm16',
        sampleRate: 16_000,
        channels: 1,
        data: Buffer.alloc(640).toString('base64'),
        timestamp: Date.now(),
      },
    });
    const asrErr = await waitForMessage(
      queue,
      waiters,
      (m) => m.type === 'session.error' && m.payload.code === 'ASR_TEXT_ONLY',
    );
    assert.equal(asrErr.type, 'session.error');

    // Drift speech triggers intervention -> Recovery withdraws it cleanly
    sendWs({
      type: 'speech.delta',
      payload: {
        speaker: 'presenter',
        text: '顺便聊一下昨天我去喝的拿铁咖啡，今天天气真是好极了。',
        isFinal: true,
        source: 'text_simulation',
      },
    });
    const shownMsg = await waitForMessage(queue, waiters, (m) => m.type === 'intervention.shown');
    assert.equal(shownMsg.type, 'intervention.shown');

    sendWs({
      type: 'speech.delta',
      payload: {
        speaker: 'presenter',
        text: '回到刚才的主线要点：自然停顿本身不等于卡壳，Controller 会结合语义缺口判断。',
        isFinal: true,
        source: 'text_simulation',
      },
    });
    const wdMsg = await waitForMessage(queue, waiters, (m) => m.type === 'intervention.withdrawn');
    assert.equal(wdMsg.type, 'intervention.withdrawn');
    assert.equal(wdMsg.payload.reason, 'user_recovered');

    // Audience grounded Q&A (notice CueX ASR correction rule rewrites "系统一" -> "System 1")
    sendWs({
      type: 'speech.delta',
      payload: {
        speaker: 'audience',
        text: '请问你们 系统一 的超时预算和事件驱动成本机制是什么？',
        isFinal: true,
        source: 'text_simulation',
      },
    });
    const qaShown = await waitForMessage(
      queue,
      waiters,
      (m) => m.type === 'intervention.shown' && m.payload.intervention.evidenceIds.includes('ev_sample_3'),
    );
    assert.equal(qaShown.type, 'intervention.shown');

    // End session -> receives reflection
    sendWs({ type: 'session.end', payload: { sessionId, reason: 'completed' } });
    const endedMsg = await waitForMessage(queue, waiters, (m) => m.type === 'session.ended');
    assert.equal(endedMsg.type, 'session.ended');
    assert.ok(endedMsg.payload.reflection);
    assert.ok(endedMsg.payload.reflection.weakSegments.length >= 1);

    // Fetch reflection over HTTP REST
    const reflRes = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/reflection`, {
      headers: { Authorization: `Bearer ${authJson.token}` },
    });
    assert.equal(reflRes.status, 200);
    const reflJson = (await reflRes.json()) as { reflection: { sessionId: string } };
    assert.equal(reflJson.reflection.sessionId, sessionId);

    // Start single-point rehearsal from weak segment
    const weak = endedMsg.payload.reflection.weakSegments[0];
    sendWs({
      type: 'rehearsal.start',
      payload: {
        sourceSessionId: sessionId,
        packId: 'pack_cuex_demo_01',
        weakSegmentId: weak.weakSegmentId,
        chapterId: weak.chapterId,
      },
    });
    const rehMsg = await waitForMessage(queue, waiters, (m) => m.type === 'rehearsal.ready');
    assert.equal(rehMsg.type, 'rehearsal.ready');

    // Save confirmed session memory then wipe session cleanly
    const okMemRes = await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        scenarioId: 'presentation',
        category: 'pacing_habit',
        title: '会话记忆条目',
        content: '控制每节在目标时间内。',
        sourceSessionId: sessionId,
        userConfirmed: true,
        privacyLevel: 'session',
        scope: 'session',
      }),
    });
    assert.equal(okMemRes.status, 201);

    const wipeRes = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/wipe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authJson.token}` },
    });
    assert.equal(wipeRes.status, 200);
    const wipeJson = (await wipeRes.json()) as {
      receiptId: string;
      deletedScopes: Array<{ scope: string; deletedCount: number }>;
    };
    assert.ok(wipeJson.receiptId.startsWith('del_'));
    assert.equal(wipeJson.deletedScopes.find((s) => s.scope === 'memories')?.deletedCount, 1);
    assert.equal(wipeJson.deletedScopes.find((s) => s.scope === 'sessions')?.deletedCount, 1);

    ws.close();
  } finally {
    await server.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CueXGatewayServer streams PCM16 audio.chunk frames when streaming ASR engine is active', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cuex-asr-ws-'));
  const cfg = loadServerConfig({
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '0',
    CUEX_RUNTIME_DIR: tmpDir,
    CUEX_MEMORY_DIR: path.join(tmpDir, 'memory'),
    CUEX_PACKS_DIR: path.join(tmpDir, 'packs'),
  });

  const fakeStreamEngine: AsrEngine = {
    backend: 'sherpa-ws',
    async open(_opts, callbacks: AsrCallbacks): Promise<AsrStream> {
      return {
        write(_pcm) {
          callbacks.onFinal('自然停顿不等于卡壳，我们通过语义信号来控制。');
        },
        end() {},
      };
    },
  };

  const server = new CueXGatewayServer({ config: cfg, asrEngine: fakeStreamEngine });
  const { port } = await server.start();

  try {
    const authRes = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'ASR Presenter', email: 'asr@example.com' }),
    });
    const authJson = (await authRes.json()) as { token: string };
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(authJson.token)}`);
    const queue: ServerMessage[] = [];
    const waiters: Array<() => void> = [];
    ws.on('message', (raw) => {
      queue.push(JSON.parse(raw.toString()) as ServerMessage);
      for (const fn of waiters.splice(0, waiters.length)) fn();
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.send(
      JSON.stringify({
        type: 'session.start',
        payload: { scenarioId: 'presentation', mode: 'live', privacyNoticeAccepted: true },
      }),
    );
    await waitForMessage(queue, waiters, (m) => m.type === 'session.ready');

    ws.send(
      JSON.stringify({
        type: 'audio.chunk',
        payload: {
          format: 'pcm16',
          sampleRate: 16_000,
          channels: 1,
          data: Buffer.alloc(640).toString('base64'),
          timestamp: Date.now(),
        },
      }),
    );
    const tr = await waitForMessage(queue, waiters, (m) => m.type === 'asr.transcript');
    assert.equal(tr.type, 'asr.transcript');
    assert.match(tr.payload.segment.text, /自然停顿不等于卡壳/);

    ws.close();
  } finally {
    await server.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
