import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  API_VERSION,
  WS_PROTOCOL_VERSION,
  validateMemoryItem,
  validatePresentationContextPack,
} from '@cuex/protocol';
import { loadServerConfig } from '../src/config';
import { CueXGatewayServer } from '../src/gateway/GatewayServer';

test('REST API contract covers all v2 routes, unified ApiErrorResponse errors, 501 webhook unconfigured, and protocol validators', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cuex-contract-test-'));
  const cfg = loadServerConfig({
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '0',
    CUEX_RUNTIME_DIR: tmpDir,
    // Intentionally omit CUEX_WEBHOOK_SECRET to verify 501 PAYMENT_NOT_CONFIGURED.
  });
  const server = new CueXGatewayServer({ config: cfg });
  const { port } = await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Public routes: /health, /api/scenarios, /api/plans
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    assert.ok(healthRes.headers.get('x-correlation-id'));
    const health = (await healthRes.json()) as { apiVersion: string; wsProtocolVersion: string };
    assert.equal(health.apiVersion, API_VERSION);
    assert.equal(health.wsProtocolVersion, WS_PROTOCOL_VERSION);

    const plansRes = await fetch(`${baseUrl}/api/plans`);
    assert.equal(plansRes.status, 200);
    const plansJson = (await plansRes.json()) as {
      plans: Array<{
        planId: string;
        status: string;
        isCommercialHypothesis: boolean;
        price: { amountFen: number };
        annualPrice?: { amountFen: number };
        quotas: {
          monthlySessionsLimit: number | null;
          liveMinutesLimit: number | null;
          cloudAsrMinutesIncluded: number;
        };
      }>;
    };
    assert.ok(plansJson.plans.every((p) => p.isCommercialHypothesis === true));
    const freePlan = plansJson.plans.find((p) => p.planId === 'free');
    const eventPlan = plansJson.plans.find((p) => p.planId === 'event');
    const proPlan = plansJson.plans.find((p) => p.planId === 'pro');
    const teamPlan = plansJson.plans.find((p) => p.planId === 'team');
    assert.equal(freePlan?.price.amountFen, 0);
    assert.equal(freePlan?.quotas.monthlySessionsLimit, 2);
    assert.equal(freePlan?.quotas.liveMinutesLimit, 20);
    assert.equal(freePlan?.quotas.cloudAsrMinutesIncluded, 20);
    assert.equal(eventPlan?.price.amountFen, 2900);
    assert.equal(eventPlan?.quotas.liveMinutesLimit, 120);
    assert.equal(eventPlan?.quotas.cloudAsrMinutesIncluded, 120);
    assert.equal(proPlan?.price.amountFen, 5900);
    assert.equal(proPlan?.annualPrice?.amountFen, 49900);
    assert.equal(proPlan?.quotas.monthlySessionsLimit, null);
    assert.equal(proPlan?.quotas.liveMinutesLimit, 240);
    assert.equal(proPlan?.quotas.cloudAsrMinutesIncluded, 240);
    assert.equal(teamPlan?.status, 'planned');
    assert.equal(teamPlan?.price.amountFen, 19900);
    assert.equal(teamPlan?.annualPrice?.amountFen, 199000);
    assert.equal(teamPlan?.quotas.cloudAsrMinutesIncluded, 1000);

    // 2. Unconfigured webhook returns 501 PAYMENT_NOT_CONFIGURED
    const wh501 = await fetch(`${baseUrl}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'payment.succeeded' }),
    });
    assert.equal(wh501.status, 501);
    assert.equal(((await wh501.json()) as { error: { code: string } }).error.code, 'PAYMENT_NOT_CONFIGURED');

    // 3. Auth session lifecycle: login -> /me -> logout -> /me fails 401 -> re-login
    const loginRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'contract@example.com', displayName: 'Contract User' }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson = (await loginRes.json()) as { token: string; user: { userId: string } };

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginJson.token}` },
    });
    assert.equal(meRes.status, 200);
    assert.equal(((await meRes.json()) as { authenticated: boolean }).authenticated, true);

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${loginJson.token}` },
    });
    assert.equal(logoutRes.status, 200);

    const meAfterLogout = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginJson.token}` },
    });
    assert.equal(meAfterLogout.status, 401);

    const login2Res = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'contract@example.com', displayName: 'Contract User' }),
    });
    const { token } = (await login2Res.json()) as { token: string };
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    // 4. Checkout preview: 'pro' succeeds, 'team' (planned) returns 400 VALIDATION_ERROR
    const badCheckout = await fetch(`${baseUrl}/api/billing/checkout-preview`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ planId: 'team', billingCycle: 'monthly', paymentChannel: 'alipay' }),
    });
    assert.equal(badCheckout.status, 400);
    assert.equal(((await badCheckout.json()) as { error: { code: string } }).error.code, 'VALIDATION_ERROR');

    const okCheckout = await fetch(`${baseUrl}/api/billing/checkout-preview`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        planId: 'pro',
        billingCycle: 'monthly',
        paymentChannel: 'wechat_pay',
        couponCode: 'CUEXBETA20',
      }),
    });
    assert.equal(okCheckout.status, 200);
    const previewJson = (await okCheckout.json()) as {
      liveCheckoutAvailable: boolean;
      discount: { amountFen: number };
      total: { amountFen: number };
    };
    assert.equal(previewJson.liveCheckoutAvailable, false);
    assert.ok(previewJson.discount.amountFen > 0);
    assert.equal(typeof previewJson.total.amountFen, 'number');

    // 5. Account usage & entitlements & observability & sessions list
    const usageRes = await fetch(`${baseUrl}/api/account/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(usageRes.status, 200);

    const sessionsRes = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(sessionsRes.status, 200);
    assert.ok(Array.isArray(((await sessionsRes.json()) as { sessions: unknown[] }).sessions));

    // 6. Compile + Get + Patch pack validated against @cuex/protocol schema
    const compileRes = await fetch(`${baseUrl}/api/presentation/compile`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Contract Validation Deck',
        sceneType: 'pitch',
        goal: 'Validate all REST fields',
        audience: 'QA',
        targetDurationSec: 180,
        rawMaterials: 'Target latency 250 ms verified in CI.',
      }),
    });
    assert.equal(compileRes.status, 201);
    const compiled = ((await compileRes.json()) as { pack: unknown }).pack;
    const packValid = validatePresentationContextPack(compiled);
    assert.equal(packValid.ok, true);
    const packId = (compiled as { packId: string }).packId;

    const getPackRes = await fetch(`${baseUrl}/api/presentation/packs/${encodeURIComponent(packId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(getPackRes.status, 200);

    const patchPackRes = await fetch(`${baseUrl}/api/presentation/packs/${encodeURIComponent(packId)}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ audience: 'QA Team' }),
    });
    assert.equal(patchPackRes.status, 200);

    // 7. Memory CRUD validated against @cuex/protocol
    const createMemRes = await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        scenarioId: 'presentation',
        category: 'preference',
        title: 'Compact cues',
        content: 'Prefer concise keywords.',
        userConfirmed: true,
        privacyLevel: 'local_private',
        scope: 'scenario',
      }),
    });
    assert.equal(createMemRes.status, 201);
    const memItem = ((await createMemRes.json()) as { item: unknown }).item;
    assert.equal(validateMemoryItem(memItem).ok, true);
    const memId = (memItem as { memoryId: string }).memoryId;

    const patchMemRes = await fetch(`${baseUrl}/api/memory/${encodeURIComponent(memId)}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ content: 'Updated concise keywords.' }),
    });
    assert.equal(patchMemRes.status, 200);

    // 8. 404 Not Found error shape & Observability summary
    const nfRes = await fetch(`${baseUrl}/api/does-not-exist`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(nfRes.status, 404);
    assert.equal(((await nfRes.json()) as { error: { code: string } }).error.code, 'NOT_FOUND');

    const obsRes = await fetch(`${baseUrl}/api/observability/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(obsRes.status, 200);
    const obsJson = (await obsRes.json()) as {
      metrics: { http: { requestsTotal: number } };
      pipeline: Record<string, number>;
    };
    assert.ok(obsJson.metrics.http.requestsTotal >= 1);
    assert.ok(obsJson.pipeline);
  } finally {
    await server.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
