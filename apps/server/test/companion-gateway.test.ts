import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import {
  type ServerMessage,
  validateHealthStatusResponse,
  validateWsAttachState,
} from '@cuex/protocol';
import { loadServerConfig } from '../src/config';
import { CueXGatewayServer } from '../src/gateway/GatewayServer';
import { SqliteRepository } from '../src/storage';
import type { AsrEngine, AsrStream } from '../src/voice';

function createWsCollector(url: string) {
  const ws = new WebSocket(url);
  const messages: ServerMessage[] = [];
  const waiters: Array<{
    predicate: (msg: ServerMessage) => boolean;
    resolve: (msg: ServerMessage) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString()) as ServerMessage;
    messages.push(msg);
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      const waiter = waiters[i];
      if (waiter.predicate(msg)) {
        clearTimeout(waiter.timer);
        waiters.splice(i, 1);
        waiter.resolve(msg);
      }
    }
  });

  const openPromise = new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  const waitForMessage = (
    predicate: (msg: ServerMessage) => boolean,
    label = 'ws message',
    timeoutMs = 5_000,
  ) => {
    const existing = messages.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error(`Timed out waiting for ${label} (seen=${messages.map((m) => m.type).join(',')})`));
      }, timeoutMs);
      waiters.push({ predicate, resolve, reject, timer });
    });
  };

  const waitForNewMessage = (
    afterCount: number,
    predicate: (msg: ServerMessage) => boolean,
    label = 'new ws message',
    timeoutMs = 5_000,
  ) => {
    const existing = messages.slice(afterCount).find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }
    let seen = 0;
    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error(`Timed out waiting for ${label} after ${afterCount}`));
      }, timeoutMs);
      waiters.push({
        predicate: (msg) => {
          seen += 1;
          void seen;
          return messages.indexOf(msg) >= afterCount && predicate(msg);
        },
        resolve,
        reject,
        timer,
      });
    });
  };

  const closeClean = async () => {
    if (ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve());
      ws.close();
      setTimeout(resolve, 400);
    });
  };

  return { ws, messages, openPromise, waitForMessage, waitForNewMessage, closeClean };
}

test('Gateway /ws supports Presenter Companion attach, replay, permission isolation, disconnect resilience, and single-mic conflict', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cuex-comp-gw-'));
  const repo = new SqliteRepository(path.join(dir, 'gateway.db'));

  let asrOpenCount = 0;
  let asrWriteCount = 0;
  let asrCloseCount = 0;
  const mockAsrEngine: AsrEngine = {
    backend: 'local_sherpa',
    async open(): Promise<AsrStream> {
      asrOpenCount += 1;
      return {
        write() {
          asrWriteCount += 1;
        },
        end() {
          asrCloseCount += 1;
        },
      };
    },
  };

  const cfg = loadServerConfig({
    CUEX_RUNTIME_DIR: dir,
    CUEX_SYSTEM1: 'fake',
    CUEX_SYSTEM2: 'fake',
    CUEX_ASR: 'fake',
    CUEX_AUTH_REQUIRED: 'true',
  });
  const gateway = new CueXGatewayServer({
    config: { ...cfg, host: '127.0.0.1', port: 0, cooldownMs: 0 },
    repo,
    asrEngine: mockAsrEngine,
  });
  const { port } = await gateway.start();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBase = `ws://127.0.0.1:${port}/ws`;

  t.after(async () => {
    await gateway.stop();
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  });

  // Check /health full schema compliance & separated attribution before any secrets/hosts exist
  const healthRes = await fetch(`${baseUrl}/health`);
  assert.equal(healthRes.status, 200);
  const healthBody = await healthRes.json();
  const healthCheck = validateHealthStatusResponse(healthBody);
  assert.equal(healthCheck.ok, true, `health response matches schema: ${JSON.stringify(healthCheck.issues)}`);
  assert.equal((healthBody as { system1: { promptFormat?: string } }).system1.promptFormat, 'rule_zero');
  assert.equal((healthBody as { system1: { calibrated?: boolean } }).system1.calibrated, false);
  assert.ok((healthBody as { compiler?: unknown }).compiler);
  assert.ok((healthBody as { reflection?: unknown }).reflection);
  assert.ok((healthBody as { dualSystemMetrics?: unknown }).dualSystemMetrics);

  // Login User A (owner) and User B (cross-tenant isolation)
  const loginA = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', displayName: 'Owner' }),
  });
  const authA = (await loginA.json()) as { token: string };
  const loginB = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'other@example.com', displayName: 'Other' }),
  });
  const authB = (await loginB.json()) as { token: string };

  // 1. Primary WS connects and starts session
  const primary = createWsCollector(`${wsBase}?token=${encodeURIComponent(authA.token)}&role=primary`);
  t.after(() => primary.closeClean());
  await primary.openPromise;

  primary.ws.send(
    JSON.stringify({
      type: 'session.start',
      payload: {
        scenarioId: 'presentation',
        mode: 'live',
        viewMode: 'focus',
        privacyNoticeAccepted: true,
      },
    }),
  );

  const primaryReady = await primary.waitForMessage((m) => m.type === 'session.ready', 'primary session.ready');
  assert.equal(primaryReady.type, 'session.ready');
  const sessionId = primaryReady.payload.session.sessionId;
  assert.ok(primaryReady.payload.attachState);
  assert.equal(primaryReady.payload.attachState.role, 'primary');
  assert.equal(primaryReady.payload.attachState.canCaptureMic, true);
  assert.equal(primaryReady.payload.attachState.rolePolicy.canInteractWithCues, true);
  assert.equal(asrOpenCount, 1);

  // Primary triggers an initial speech delta before companion connects (to test lastSeenSeq replay!)
  primary.ws.send(
    JSON.stringify({
      type: 'speech.delta',
      payload: {
        speaker: 'audience',
        text: '请问你们为什么不能只靠 LLM 停顿提醒？',
        isFinal: true,
      },
    }),
  );
  const shownBeforeComp = await primary.waitForMessage(
    (m) => m.type === 'intervention.shown',
    'primary intervention.shown before companion attach',
  );
  assert.equal(shownBeforeComp.type, 'intervention.shown');
  await primary.waitForMessage((m) => m.type === 'system2.guidance', 'primary system2.guidance');

  // 2. Cross-user companion attach must fail with FORBIDDEN
  const rogue = createWsCollector(
    `${wsBase}?token=${encodeURIComponent(authB.token)}&sessionId=${encodeURIComponent(sessionId)}&role=companion`,
  );
  t.after(() => rogue.closeClean());
  await rogue.openPromise;
  const rogueErr = await rogue.waitForMessage((m) => m.type === 'session.error', 'cross-user FORBIDDEN');
  assert.equal(rogueErr.type, 'session.error');
  assert.equal(rogueErr.payload.code, 'FORBIDDEN');
  await rogue.closeClean();

  // 3. Second primary attach while primary WS is active must be rejected with PRIMARY_MIC_CONFLICT
  const secondPrimary = createWsCollector(
    `${wsBase}?token=${encodeURIComponent(authA.token)}&sessionId=${encodeURIComponent(sessionId)}&role=primary`,
  );
  t.after(() => secondPrimary.closeClean());
  await secondPrimary.openPromise;
  const conflictErr = await secondPrimary.waitForMessage(
    (m) => m.type === 'session.error',
    'PRIMARY_MIC_CONFLICT',
  );
  assert.equal(conflictErr.type, 'session.error');
  assert.equal(conflictErr.payload.code, 'PRIMARY_MIC_CONFLICT');
  await secondPrimary.closeClean();

  // 4. Legitimate companion connects via handshake with lastSeenSeq=0 -> gets session.ready, replay, & updates primary companionCount
  const primaryMarkBeforeComp = primary.messages.length;
  const companion = createWsCollector(
    `${wsBase}?token=${encodeURIComponent(authA.token)}&sessionId=${encodeURIComponent(sessionId)}&role=companion&lastSeenSeq=0`,
  );
  t.after(() => companion.closeClean());
  await companion.openPromise;

  const compReady = await companion.waitForMessage((m) => m.type === 'session.ready', 'companion session.ready');
  assert.equal(compReady.type, 'session.ready');
  assert.ok(compReady.payload.attachState);
  assert.equal(validateWsAttachState(compReady.payload.attachState).ok, true);
  assert.equal(compReady.payload.attachState.role, 'companion');
  assert.equal(compReady.payload.attachState.canCaptureMic, false);
  assert.equal(compReady.payload.attachState.rolePolicy.canControlSession, false);
  assert.equal(compReady.payload.attachState.rolePolicy.canModifyContext, false);
  assert.equal(compReady.payload.attachState.rolePolicy.canInteractWithCues, true);
  assert.equal(compReady.payload.attachState.companionCount, 1);

  const replayedGuidance = await companion.waitForMessage(
    (m) => m.type === 'system2.guidance',
    'companion replayed system2.guidance',
  );
  assert.equal(replayedGuidance.type, 'system2.guidance');

  const attachUpdateOnPrimary = await primary.waitForNewMessage(
    primaryMarkBeforeComp,
    (m) => m.type === 'session.attach_state',
    'primary notified of companion attach',
  );
  assert.equal(attachUpdateOnPrimary.type, 'session.attach_state');
  assert.equal(attachUpdateOnPrimary.payload.role, 'primary');
  assert.equal(attachUpdateOnPrimary.payload.companionCount, 1);

  // 5. Companion sends allowed commands (`ping`, `intervention.feedback`, `intervention.dismiss`, `intervention.request_help`, `session.attach`)
  companion.ws.send(JSON.stringify({ type: 'ping', payload: { t: 12345 } }));
  const pongMsg = await companion.waitForMessage((m) => m.type === 'pong', 'companion pong');
  assert.equal(pongMsg.type, 'pong');
  assert.equal(pongMsg.payload.t, 12345);

  const primaryMarkDismiss = primary.messages.length;
  const activeIntId = shownBeforeComp.payload.intervention.interventionId;
  companion.ws.send(
    JSON.stringify({
      type: 'intervention.feedback',
      payload: { sessionId, interventionId: activeIntId, feedback: 'helpful' },
    }),
  );
  companion.ws.send(
    JSON.stringify({
      type: 'intervention.dismiss',
      payload: { sessionId, interventionId: activeIntId },
    }),
  );
  const withdrawnOnPrimary = await primary.waitForNewMessage(
    primaryMarkDismiss,
    (m) => m.type === 'intervention.withdrawn' && m.payload.reason === 'user_dismissed',
    'companion dismiss synchronized to primary',
  );
  assert.equal(withdrawnOnPrimary.type, 'intervention.withdrawn');

  const compMarkHelp = companion.messages.length;
  const primaryMarkHelp = primary.messages.length;
  companion.ws.send(
    JSON.stringify({
      type: 'intervention.request_help',
      payload: { sessionId, preferredLevel: 'L2', question: '请给我核心架构对比摘要' },
    }),
  );
  await companion.waitForNewMessage(compMarkHelp, (m) => m.type === 'intervention.shown', 'companion request_help shown');
  await primary.waitForNewMessage(primaryMarkHelp, (m) => m.type === 'intervention.shown', 'primary receives companion help shown');

  // Explicit `session.attach` claiming `role: 'primary'` while primary active -> PRIMARY_MIC_CONFLICT
  const compErrBefore = companion.messages.length;
  companion.ws.send(
    JSON.stringify({
      type: 'session.attach',
      payload: { sessionId, lastSeenSeq: 0, role: 'primary' },
    }),
  );
  const compPromoteConflict = await companion.waitForNewMessage(
    compErrBefore,
    (m) => m.type === 'session.error',
    'companion promote blocked',
  );
  assert.equal(compPromoteConflict.type, 'session.error');
  assert.equal(compPromoteConflict.payload.code, 'PRIMARY_MIC_CONFLICT');

  // 6. Companion forbidden commands -> EVERY restricted command rejected with COMPANION_READ_ONLY
  const forbiddenPayloads: unknown[] = [
    {
      type: 'audio.chunk',
      payload: {
        sessionId,
        format: 'pcm16',
        sampleRate: 16_000,
        channels: 1,
        timestamp: Date.now(),
        data: Buffer.alloc(640).toString('base64'),
      },
    },
    { type: 'speech.delta', payload: { sessionId, speaker: 'presenter', text: 'forbidden text', isFinal: true } },
    {
      type: 'session.start',
      payload: { scenarioId: 'presentation', mode: 'live', privacyNoticeAccepted: true },
    },
    { type: 'session.stop', payload: { sessionId } },
    { type: 'session.pause', payload: { sessionId } },
    { type: 'session.resume', payload: { sessionId } },
    { type: 'session.silent', payload: { sessionId, silentMode: true } },
    { type: 'session.end', payload: { sessionId } },
    { type: 'session.wipe', payload: { sessionId } },
    { type: 'chapter.set', payload: { sessionId, chapterId: 'ch_2' } },
    { type: 'intervention.set_ceiling', payload: { sessionId, maxLevel: 'L1' } },
    {
      type: 'rehearsal.start',
      payload: { sourceSessionId: sessionId, packId: 'sample', weakSegmentId: 'w1', chapterId: 'ch_1' },
    },
    { type: 'view.mode', payload: { sessionId, viewMode: 'inspector' } },
  ];

  for (const cmd of forbiddenPayloads) {
    const mark = companion.messages.length;
    companion.ws.send(JSON.stringify(cmd));
    const errMsg = await companion.waitForNewMessage(
      mark,
      (m) => m.type === 'session.error',
      `COMPANION_READ_ONLY for ${(cmd as { type: string }).type}`,
    );
    assert.equal(errMsg.type, 'session.error');
    assert.equal(
      errMsg.payload.code,
      'COMPANION_READ_ONLY',
      `${(cmd as { type: string }).type} must fail with COMPANION_READ_ONLY`,
    );
  }
  assert.equal(asrWriteCount, 0, 'companion audio.chunk never reaches asrStream');

  // 7. Companion disconnect MUST NOT stop primary ASR stream or tickTimer or session
  const primaryMarkBeforeDisconnect = primary.messages.length;
  await companion.closeClean();
  const attachAfterDisconnect = await primary.waitForNewMessage(
    primaryMarkBeforeDisconnect,
    (m) => m.type === 'session.attach_state' && m.payload.companionCount === 0,
    'primary companionCount returns to 0 after companion disconnect',
  );
  assert.equal(attachAfterDisconnect.type, 'session.attach_state');
  assert.equal(asrCloseCount, 0, 'companion disconnect never closes primary ASR stream');

  // Primary keeps streaming audio.chunk & speech.delta smoothly
  primary.ws.send(
    JSON.stringify({
      type: 'audio.chunk',
      payload: {
        sessionId,
        format: 'pcm16',
        sampleRate: 16_000,
        channels: 1,
        timestamp: Date.now(),
        data: Buffer.alloc(640).toString('base64'),
      },
    }),
  );
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(asrWriteCount, 1, 'primary audio stream remains active after companion disconnect');

  // 8. Re-attach a second companion via explicit session.attach & verify primary session.end broadcasts to companion
  const comp2 = createWsCollector(`${wsBase}?token=${encodeURIComponent(authA.token)}&role=companion`);
  t.after(() => comp2.closeClean());
  await comp2.openPromise;
  comp2.ws.send(JSON.stringify({ type: 'session.attach', payload: { sessionId, lastSeenSeq: 0 } }));
  const comp2Attach = await comp2.waitForMessage((m) => m.type === 'session.attach_state', 'explicit session.attach_state');
  assert.equal(comp2Attach.type, 'session.attach_state');
  assert.equal(comp2Attach.payload.companionCount, 1);

  primary.ws.send(JSON.stringify({ type: 'session.end', payload: { sessionId } }));
  const endedOnPrimary = await primary.waitForMessage((m) => m.type === 'session.ended', 'primary session.ended');
  const endedOnComp2 = await comp2.waitForMessage((m) => m.type === 'session.ended', 'companion receives session.ended');
  assert.equal(endedOnPrimary.type, 'session.ended');
  assert.equal(endedOnComp2.type, 'session.ended');
  assert.equal(asrCloseCount, 1, 'primary session.end closes ASR stream once');

  // 9. Verify live /health reflects real dualSystemMetrics accumulated from session
  const healthAfterRes = await fetch(`${baseUrl}/health`);
  const healthAfter = (await healthAfterRes.json()) as {
    dualSystemMetrics: { s1Evaluations: number; guidanceRevisionsIssued: number };
  };
  assert.ok(healthAfter.dualSystemMetrics.s1Evaluations >= 1);
  assert.ok(healthAfter.dualSystemMetrics.guidanceRevisionsIssued >= 1);
});
