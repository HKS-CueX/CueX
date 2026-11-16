import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@cuex/protocol';
import { loadServerConfig } from '../src/config';
import { CueXGatewayServer } from '../src/gateway/GatewayServer';
import {
  FallbackFastDecisionProvider,
  HeuristicFastDecisionProvider,
  ManualClock,
  msToIso,
  type FastDecisionProvider,
} from '../src/runtime';
import { ProviderResilience } from '../src/runtime/providers/ProviderResilience';

function signWebhook(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

test('ProviderResilience enforces bounded retries, timeout AbortController, circuit breaker, and honest degraded fallback', async () => {
  let fakeNow = 1_000;
  const resilience = new ProviderResilience({ failureThreshold: 2, cooldownMs: 5_000 }, () => fakeNow);

  // 1. Timeout triggers bounded retry (1 retry = 2 attempts total) then returns PROVIDER_TIMEOUT
  let attempts = 0;
  const timedOut = await resilience.execute({
    breakerKey: 's1:test',
    timeoutMs: 15,
    maxRetries: 1,
    baseDelayMs: 5,
    operation: (signal) =>
      new Promise<string>((_resolve, reject) => {
        attempts += 1;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
  });
  assert.equal(timedOut.ok, false);
  assert.equal(attempts, 2);
  assert.equal(timedOut.retries, 1);
  assert.equal(timedOut.errorCode, 'PROVIDER_TIMEOUT');

  // 2. Second failure opens circuit breaker -> third call fails fast without invoking operation
  const secondFail = await resilience.execute({
    breakerKey: 's1:test',
    timeoutMs: 50,
    maxRetries: 0,
    operation: async () => {
      throw new Error('upstream 503');
    },
  });
  assert.equal(secondFail.ok, false);
  assert.equal(secondFail.circuitOpen, true);

  let invokedWhileOpen = false;
  const blockedByCircuit = await resilience.execute({
    breakerKey: 's1:test',
    timeoutMs: 50,
    maxRetries: 2,
    operation: async () => {
      invokedWhileOpen = true;
      return 'should-not-run';
    },
  });
  assert.equal(invokedWhileOpen, false);
  assert.equal(blockedByCircuit.ok, false);
  assert.equal(blockedByCircuit.circuitOpen, true);

  // 3. Cooldown elapses -> circuit recovers and succeeds
  fakeNow += 6_000;
  const recovered = await resilience.execute({
    breakerKey: 's1:test',
    timeoutMs: 50,
    maxRetries: 0,
    operation: async () => 'ok',
  });
  assert.equal(recovered.ok, true);

  // 4. FallbackFastDecisionProvider surfaces degraded:true & 0 local tokens
  const failingPrimary: FastDecisionProvider = {
    backend: 'broken-s1',
    mode: 'real',
    async health() {
      return { ok: false, detail: 'ECONNREFUSED' };
    },
    async evaluate() {
      const err = new Error('down') as Error & { retries?: number };
      err.retries = 2;
      throw err;
    },
  };
  const wrapped = new FallbackFastDecisionProvider(failingPrimary, new HeuristicFastDecisionProvider());
  const verdict = await wrapped.evaluate({
    sessionId: 's_deg',
    scenarioId: 'presentation',
    contextVersion: 1,
    timestamp: msToIso(Date.now()),
    activeGoal: 'Degraded test',
    expectedPoints: [],
    recentSegments: [],
    recentTextDigest: '',
    silenceDurationMs: 0,
  });
  assert.equal(verdict.usage?.degraded, true);
  assert.equal(verdict.usage?.retries, 2);
  assert.equal(verdict.usage?.usageSource, 'local_rule_zero');
  assert.equal(verdict.usage?.inputTokens, 0);
  assert.equal((await wrapped.health()).ok, false);
});

test('Gateway enforces atomic free monthly quota (402 QUOTA_EXCEEDED), HMAC webhook upgrade/refund idempotency, WS resume & reconnect replay', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cuex-rel-test-'));
  const secret = 'test_webhook_secret_123';
  const clock = new ManualClock(1_700_000_000_000);
  const cfg = loadServerConfig({
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '0',
    CUEX_RUNTIME_DIR: tmpDir,
    CUEX_WEBHOOK_SECRET: secret,
    CUEX_CANDIDATE_TTL_MS: '6000',
  });
  const server = new CueXGatewayServer({ config: cfg, clock });
  const { port } = await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const authRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'quota@example.com', displayName: 'Quota Tester' }),
    });
    const { token, user } = (await authRes.json()) as { token: string; user: { userId: string } };

    // 1. Connect WS, exercise idempotencyKey deduplication, pause/resume, active cue TTL expiry on reconnect
    const connectWs = (qs = '') =>
      new Promise<{ ws: WebSocket; queue: ServerMessage[]; waiters: Array<() => void> }>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}${qs}`);
        const queue: ServerMessage[] = [];
        const waiters: Array<() => void> = [];
        ws.on('message', (raw) => {
          queue.push(JSON.parse(raw.toString()) as ServerMessage);
          for (const fn of waiters.splice(0, waiters.length)) fn();
        });
        ws.once('open', () => resolve({ ws, queue, waiters }));
        ws.once('error', reject);
      });

    const nextMsg = (
      queue: ServerMessage[],
      waiters: Array<() => void>,
      pred: (m: ServerMessage) => boolean,
      label = 'message',
    ) => {
      const idx = queue.findIndex(pred);
      if (idx >= 0) return Promise.resolve(queue.splice(idx, 1)[0]);
      return new Promise<ServerMessage>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(`WS wait timeout (${label}). Seen: ${queue.map((m) => m.type).join(', ')}`),
            ),
          3_000,
        );
        const check = () => {
          const hit = queue.findIndex(pred);
          if (hit >= 0) {
            clearTimeout(timer);
            resolve(queue.splice(hit, 1)[0]);
          } else {
            waiters.push(check);
          }
        };
        waiters.push(check);
      });
    };

    const conn1 = await connectWs();
    // Duplicate idempotencyKey on session.start should only start ONE session (consuming 1 quota).
    const startFrame = JSON.stringify({
      type: 'session.start',
      idempotencyKey: 'idem_start_once',
      payload: { scenarioId: 'presentation', mode: 'live', privacyNoticeAccepted: true },
    });
    conn1.ws.send(startFrame);
    conn1.ws.send(startFrame);
    const ready1 = await nextMsg(conn1.queue, conn1.waiters, (m) => m.type === 'session.ready');
    assert.equal(ready1.type, 'session.ready');
    const sess1Id = ready1.payload.session.sessionId;
    const readySeq = ready1.serverSeq ?? 1;

    // Pause -> Resume transitions status back to active.
    conn1.ws.send(JSON.stringify({ type: 'session.pause', payload: { sessionId: sess1Id } }));
    const pausedState = await nextMsg(
      conn1.queue,
      conn1.waiters,
      (m) => m.type === 'session.state' && m.payload.session.status === 'paused',
    );
    assert.equal(pausedState.type, 'session.state');

    conn1.ws.send(JSON.stringify({ type: 'session.resume', payload: { sessionId: sess1Id } }));
    const resumedState = await nextMsg(
      conn1.queue,
      conn1.waiters,
      (m) => m.type === 'session.state' && m.payload.session.status === 'active',
    );
    assert.equal(resumedState.type, 'session.state');

    // Trigger an active intervention on drift speech, note its serverSeq, close WS before expiry, advance clock past TTL.
    conn1.ws.send(
      JSON.stringify({
        type: 'speech.delta',
        payload: {
          speaker: 'presenter',
          text: '顺便聊一下昨天我去喝的拿铁咖啡，今天外面天气不错。',
          isFinal: true,
          source: 'text_simulation',
        },
      }),
    );
    const shown = await nextMsg(conn1.queue, conn1.waiters, (m) => m.type === 'intervention.shown');
    assert.equal(shown.type, 'intervention.shown');
    conn1.ws.close();

    // Advance beyond candidate TTL (6000ms) -> reconnect with lastSeenSeq = readySeq
    // Reconnect reconciles TTL expiry and replays withdrawal WITHOUT replaying stale active intervention.shown!
    clock.advance(8_000);
    const conn2 = await connectWs(`&sessionId=${encodeURIComponent(sess1Id)}&lastSeenSeq=${readySeq}`);
    const ready2 = await nextMsg(conn2.queue, conn2.waiters, (m) => m.type === 'session.ready', 'ready2');
    assert.equal(ready2.type, 'session.ready');
    assert.equal(ready2.payload.initialState.activeIntervention, null);
    const replayedWd = await nextMsg(
      conn2.queue,
      conn2.waiters,
      (m) => m.type === 'intervention.withdrawn' && m.payload.reason === 'candidate_expired',
      'replayed_withdrawal',
    );
    assert.equal(replayedWd.type, 'intervention.withdrawn');

    // End session 1, start session 2 -> session 3 hits Free monthly quota (2/2) => QUOTA_EXCEEDED!
    conn2.ws.send(JSON.stringify({ type: 'session.end', payload: { sessionId: sess1Id, reason: 'completed' } }));
    await nextMsg(conn2.queue, conn2.waiters, (m) => m.type === 'session.ended', 'ended1');

    conn2.ws.send(
      JSON.stringify({
        type: 'session.start',
        payload: { scenarioId: 'presentation', mode: 'live', privacyNoticeAccepted: true },
      }),
    );
    const r2 = await nextMsg(conn2.queue, conn2.waiters, (m) => m.type === 'session.ready', 'ready_2');
    assert.equal(r2.type, 'session.ready');

    conn2.ws.send(
      JSON.stringify({
        type: 'session.start',
        payload: { scenarioId: 'presentation', mode: 'live', privacyNoticeAccepted: true },
      }),
    );
    const quotaErr = await nextMsg(
      conn2.queue,
      conn2.waiters,
      (m) => m.type === 'session.error' && m.payload.code === 'QUOTA_EXCEEDED',
      'quota_exceeded',
    );
    assert.equal(quotaErr.type, 'session.error');

    // 2. Webhook bad HMAC -> 401; valid HMAC -> upgrades user to Pro; replay -> deduplicated:true; refund -> revokes
    const upgradeBody = JSON.stringify({
      eventId: 'evt_upg_1',
      eventType: 'payment.succeeded',
      provider: 'alipay',
      userId: user.userId,
      planId: 'pro',
      amount: { amountFen: 5900, currency: 'CNY' },
      idempotencyKey: 'wh_upg_1',
      occurredAt: new Date().toISOString(),
    });

    const badSigRes = await fetch(`${baseUrl}/api/billing/webhooks/alipay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cuex-signature': 'sha256=deadbeef',
      },
      body: upgradeBody,
    });
    assert.equal(badSigRes.status, 401);

    const okSigRes = await fetch(`${baseUrl}/api/billing/webhooks/alipay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cuex-signature': signWebhook(upgradeBody, secret),
      },
      body: upgradeBody,
    });
    assert.equal(okSigRes.status, 200);
    const okWh = (await okSigRes.json()) as { deduplicated: boolean; entitlement?: { planId: string } };
    assert.equal(okWh.deduplicated, false);
    assert.equal(okWh.entitlement?.planId, 'pro');

    // Replay same webhook -> deduplicated:true
    const replayRes = await fetch(`${baseUrl}/api/billing/webhooks/alipay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cuex-signature': signWebhook(upgradeBody, secret),
      },
      body: upgradeBody,
    });
    assert.equal(replayRes.status, 200);
    assert.equal(((await replayRes.json()) as { deduplicated: boolean }).deduplicated, true);

    // Upgraded Pro user can now start a 3rd session without QUOTA_EXCEEDED!
    conn2.ws.send(
      JSON.stringify({
        type: 'session.start',
        payload: { scenarioId: 'presentation', mode: 'live', privacyNoticeAccepted: true },
      }),
    );
    const readyAfterUpgrade = await nextMsg(
      conn2.queue,
      conn2.waiters,
      (m) => m.type === 'session.ready',
      'ready_after_upgrade',
    );
    assert.equal(readyAfterUpgrade.type, 'session.ready');

    // Refund webhook revokes Pro entitlement
    const refundBody = JSON.stringify({
      eventId: 'evt_ref_1',
      eventType: 'payment.refunded',
      provider: 'alipay',
      userId: user.userId,
      planId: 'pro',
      amount: { amountFen: 5900, currency: 'CNY' },
      idempotencyKey: 'wh_ref_1',
      occurredAt: new Date().toISOString(),
    });
    const refundRes = await fetch(`${baseUrl}/api/billing/webhooks/alipay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cuex-signature': signWebhook(refundBody, secret),
      },
      body: refundBody,
    });
    assert.equal(refundRes.status, 200);
    const refundJson = (await refundRes.json()) as { entitlement?: { status: string } };
    assert.equal(refundJson.entitlement?.status, 'revoked');

    conn2.ws.close();
  } finally {
    await server.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
