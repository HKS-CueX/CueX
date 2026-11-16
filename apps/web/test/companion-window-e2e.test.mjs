import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

async function fileExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function launchBrowser() {
  const launchArgs = ['--mute-audio'];
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return chromium.launch({
      headless: true,
      args: launchArgs,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    });
  }
  try {
    return await chromium.launch({ headless: true, args: launchArgs });
  } catch (err) {
    const cacheDirs = [
      path.join(homedir(), 'Library/Caches/ms-playwright'),
      path.join(homedir(), '.cache/ms-playwright'),
    ];
    for (const cacheDir of cacheDirs) {
      if (!(await fileExists(cacheDir))) continue;
      const entries = (await readdir(cacheDir)).sort().reverse();
      for (const entry of entries) {
        if (entry.startsWith('chromium_headless_shell-')) {
          const macArm = path.join(
            cacheDir,
            entry,
            'chrome-headless-shell-mac-arm64/chrome-headless-shell'
          );
          const linux = path.join(cacheDir, entry, 'chrome-linux/headless_shell');
          for (const candidate of [macArm, linux]) {
            if (await fileExists(candidate)) {
              return chromium.launch({ headless: true, args: launchArgs, executablePath: candidate });
            }
          }
        }
        if (entry.startsWith('chromium-')) {
          const macArm = path.join(
            cacheDir,
            entry,
            'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
          );
          if (await fileExists(macArm)) {
            return chromium.launch({ headless: true, args: launchArgs, executablePath: macArm });
          }
        }
      }
    }
    const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (await fileExists(systemChrome)) {
      return chromium.launch({ headless: true, args: launchArgs, executablePath: systemChrome });
    }
    throw err;
  }
}

const root = fileURLToPath(new URL('../../../', import.meta.url));
const processes = [];
let browser;
let serverOrigin;
let webOrigin;
let tempDir;

async function startProcess(command, args, env, detectReady, readyUrl) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.push(child);
  let output = '';
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      if (pollTimer) clearInterval(pollTimer);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const timeout = setTimeout(() => {
      fail(new Error(`Startup timeout for ${command} ${args.join(' ')}:\n${output}`));
    }, 30000);
    const pollTimer = readyUrl
      ? setInterval(async () => {
          try {
            const res = await fetch(readyUrl);
            if (res.ok) finish(readyUrl.replace(/\/health$/, ''));
          } catch {
            // 等待端口监听就绪
          }
        }, 150)
      : null;
    const onChunk = (chunk) => {
      output += chunk.toString();
      const match = detectReady(output);
      if (match) finish(match);
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.once('error', fail);
    child.once('exit', (code) => {
      if (code) fail(new Error(`${command} exited with code ${code}:\n${output}`));
    });
  });
}

async function getFreePort() {
  const net = await import('node:net');
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

/**
 * 以原生 WebSocket 客户端连接 /ws 验证服务端角色隔离与鉴权边界（COMPANION_READ_ONLY / PRIMARY_MIC_CONFLICT）。
 */
async function probeWsRoleGuard({ serverHttpOrigin, token, sessionId, role, sendMessages }) {
  const wsBase = serverHttpOrigin.replace(/^http/, 'ws');
  const url = new URL('/ws', wsBase);
  if (token) url.searchParams.set('token', token);
  url.searchParams.set('sessionId', sessionId);
  url.searchParams.set('role', role);

  return new Promise((resolve, reject) => {
    const ws = new globalThis.WebSocket(url.toString());
    const received = [];
    let closedCode;
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve({ received, closedCode });
    }, 4500);

    ws.addEventListener('open', () => {
      for (const msg of sendMessages) {
        ws.send(JSON.stringify(msg));
      }
      // 预留少量时间收取服务端响应/错误后关闭
      setTimeout(() => {
        clearTimeout(timer);
        ws.close();
        resolve({ received, closedCode });
      }, 650);
    });

    ws.addEventListener('message', (ev) => {
      try {
        received.push(JSON.parse(String(ev.data)));
      } catch {
        // ignore
      }
    });

    ws.addEventListener('close', (ev) => {
      closedCode = ev.code;
      if (received.some((m) => m.type === 'session.error')) {
        clearTimeout(timer);
        resolve({ received, closedCode });
      }
    });

    ws.addEventListener('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`WS probe failed: ${String(err)}`));
    });
  });
}

before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'cuex-companion-e2e-'));
  const serverPort = await getFreePort();
  const webPort = await getFreePort();
  const runtimeDir = path.join(tempDir, 'runtime');
  const expectedWebOrigin = `http://127.0.0.1:${webPort}`;

  await startProcess(
    path.join(root, 'apps/server/node_modules/.bin/tsx'),
    ['apps/server/src/index.ts'],
    {
      PORT: String(serverPort),
      CUEX_SYSTEM1: 'fake',
      CUEX_SYSTEM2: 'fake',
      CUEX_ASR: 'fake',
      CUEX_COOLDOWN_MS: '150',
      CUEX_ALLOWED_ORIGINS: expectedWebOrigin,
      CUEX_RUNTIME_DIR: runtimeDir,
      CUEX_SQLITE_PATH: path.join(runtimeDir, 'cuex.sqlite'),
      CUEX_MEMORY_DIR: path.join(runtimeDir, 'memory'),
      CUEX_PACKS_DIR: path.join(runtimeDir, 'packs'),
      CUEX_LIBRARY_DIR: path.join(runtimeDir, 'library'),
    },
    (log) =>
      log.includes(String(serverPort)) || /listening|ready|started/i.test(log)
        ? `http://127.0.0.1:${serverPort}`
        : null,
    `http://127.0.0.1:${serverPort}/health`
  );
  serverOrigin = `http://127.0.0.1:${serverPort}`;

  webOrigin = await startProcess(
    path.join(root, 'apps/web/node_modules/.bin/vite'),
    [
      '--config',
      'apps/web/vite.config.ts',
      'apps/web',
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
      '--strictPort',
    ],
    { CUEX_SERVER_ORIGIN: serverOrigin },
    (log) => log.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? null
  );

  browser = await launchBrowser();
}, { timeout: 60000 });

after(async () => {
  await browser?.close();
  for (const child of processes.reverse()) {
    if (child.exitCode !== null) continue;
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000).unref();
    });
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test(
  'Presenter Companion Window & Dual-System Async Collaboration Dual-Window E2E (--mute-audio)',
  { timeout: 120000 },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    // 在 Companion 窗口内注入监测探针：验证绝不调用 getUserMedia，且绝不发送主控写命令/音频分片
    await context.addInitScript(() => {
      if (!window.location.search.includes('view=companion')) return;
      const w = window;
      w.__companionGetUserMediaCalls = 0;
      w.__companionOutboundTypes = [];

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (...args) => {
          w.__companionGetUserMediaCalls += 1;
          return origGetUserMedia(...args);
        };
      }

      const OrigWs = window.WebSocket;
      w.WebSocket = class TrackedCompanionWebSocket extends OrigWs {
        send(data) {
          try {
            const parsed = JSON.parse(String(data));
            if (parsed && parsed.type) {
              w.__companionOutboundTypes.push(parsed.type);
            }
          } catch {
            // ignore
          }
          return super.send(data);
        }
      };
    });

    const primaryPage = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const attachErrorListeners = (p, label) => {
      p.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(`[${label}] ${msg.text()}`);
      });
      p.on('pageerror', (err) => pageErrors.push(`[${label}] ${err.message}`));
    };
    attachErrorListeners(primaryPage, 'primary');

    try {
      // 1. 主控端加载演示包并进入场中 Focus 舞台
      await primaryPage.goto(`${webOrigin}/?view=compiler`, { waitUntil: 'networkidle' });
      await primaryPage.waitForSelector('[data-testid="load-sample-pack-btn"]');
      await primaryPage.getByTestId('load-sample-pack-btn').click();
      await primaryPage.waitForSelector('[data-testid="compiled-pack-panel"]', { timeout: 15000 });
      await primaryPage.getByTestId('privacy-consent-checkbox').check();
      await primaryPage.getByTestId('launch-rehearsal-btn').click();
      await primaryPage.waitForSelector('[data-testid="stage-workspace"]', { timeout: 15000 });
      await primaryPage.waitForSelector('[data-testid="open-companion-window-btn"]');

      const authToken = await primaryPage.evaluate(() =>
        window.localStorage.getItem('cuex_auth_token')
      );

      // 2. 通过主舞台「打开独立伴随窗」启动伴随窗（兼容 Document PiP iframe 与 window.open 弹窗）
      const [companionPopup] = await Promise.all([
        context.waitForEvent('page', { timeout: 15000 }),
        primaryPage.getByTestId('open-companion-window-btn').click(),
      ]);
      attachErrorListeners(companionPopup, 'companion');
      await companionPopup.waitForLoadState('domcontentloaded');
      await companionPopup
        .locator('iframe, [data-testid="companion-view"]')
        .first()
        .waitFor({ timeout: 10000 });

      const hasIframe = (await companionPopup.locator('iframe').count()) > 0;
      const companionScope = hasIframe ? companionPopup.frameLocator('iframe') : companionPopup;
      await companionScope.locator('[data-testid="companion-view"]').waitFor({ timeout: 15000 });
      await companionScope.locator('[data-testid="companion-l0-quiet"]').waitFor({ timeout: 15000 });

      const attachBadge = await companionScope.locator('[data-testid="companion-attach-badge"]').innerText();
      assert(
        attachBadge.includes('companion'),
        `Companion attach badge should indicate companion role, got: ${attachBadge}`
      );
      const noMicBadge = await companionScope.locator('[data-testid="companion-no-mic-badge"]').innerText();
      assert(noMicBadge.includes('不采集麦克风'), 'Companion explicitly discloses zero mic capture');
      assert.equal(
        await companionScope.locator('[data-testid="toggle-pcm-mic-btn"]').count(),
        0,
        'Companion never renders microphone capture controls'
      );

      const honestyText = await companionScope.locator('[data-testid="companion-honesty-notice"]').innerText();
      assert(
        honestyText.includes('无法保证操作系统级强制置顶覆盖全屏 PowerPoint / Keynote'),
        'Companion explicitly warns that browser windows cannot guarantee OS-level always-on-top over fullscreen slides'
      );

      // 主控端同步看到伴随窗在线计数 >= 1
      await primaryPage.waitForSelector('[data-testid="primary-companion-count"]', { timeout: 10000 });
      const companionHref = await primaryPage
        .getByTestId('companion-window-link')
        .getAttribute('href');
      assert(companionHref, 'Primary displays direct companion URL fallback link');
      const sessionId = new URL(companionHref).searchParams.get('sessionId');
      assert(sessionId, 'Companion URL carries active sessionId');

      // 验证 Companion 未曾调用 getUserMedia 或发送禁发写指令
      const probeStats = hasIframe
        ? await companionPopup
            .frameLocator('iframe')
            .locator('body')
            .evaluate(() => ({
              micCalls: window.__companionGetUserMediaCalls ?? 0,
              outbound: window.__companionOutboundTypes ?? [],
            }))
        : await companionPopup.evaluate(() => ({
            micCalls: window.__companionGetUserMediaCalls ?? 0,
            outbound: window.__companionOutboundTypes ?? [],
          }));
      assert.equal(probeStats.micCalls, 0, 'Companion must never invoke getUserMedia');
      for (const forbidden of ['audio.chunk', 'speech.delta', 'session.start', 'session.pause', 'session.end']) {
        assert(
          !probeStats.outbound.includes(forbidden),
          `Companion must never send ${forbidden}`
        );
      }

      // 3. 主控端输入跑偏/遗漏话术 -> 主控 Focus 与伴随窗同步触发提示
      const simInput = primaryPage.getByTestId('sim-speech-input');
      await simInput.fill('顺便聊聊昨天咖啡厅的装修风格，先不讲核心架构与净效用公式。');
      await primaryPage.getByTestId('sim-speech-submit').click();
      await primaryPage.waitForSelector('[data-testid="focus-active-intervention"]', { timeout: 10000 });
      await companionScope
        .locator('[data-testid="companion-active-intervention"]')
        .waitFor({ timeout: 10000 });

      // 4. 伴随窗安全交互：点赞 + 忽略 -> 同步撤回/消隐；主动求助 (L2) -> 双端出现提示
      await companionScope.locator('[data-testid="companion-feedback-helpful-btn"]').click();
      await companionScope.locator('[data-testid="companion-dismiss-btn"]').click();
      await primaryPage.waitForFunction(
        () => !document.querySelector('[data-testid="focus-active-intervention"]'),
        { timeout: 10000 }
      );
      await primaryPage.waitForTimeout(300);
      await companionScope.locator('[data-testid="companion-request-l2-btn"]').click();
      await primaryPage.waitForSelector('[data-testid="focus-active-intervention"]', { timeout: 10000 });
      await companionScope
        .locator('[data-testid="companion-active-intervention"]')
        .waitFor({ timeout: 10000 });

      // 5. 主控恢复话术（紧扣当前章节核心论点）-> 双端同时展示主动退出自动撤回横幅
      await simInput.fill(
        '回到主线：传统对话框 AI 需要停下来阅读长段输出会直接打断现场语言流，而自然停顿不等于卡壳，Controller 会联合信号判断不误报。'
      );
      await primaryPage.getByTestId('sim-speech-submit').click();
      await primaryPage.waitForSelector('[data-testid="focus-withdrawn-banner"]', { timeout: 10000 });
      await companionScope
        .locator('[data-testid="companion-withdrawn-banner"]')
        .waitFor({ timeout: 10000 });

      // 6. 验证 Inspector 清晰三路归因与双系统黑板面板
      await primaryPage.getByTestId('view-toggle-inspector').click();
      await primaryPage.waitForSelector('[data-testid="inspector-subsystems"]');
      await primaryPage.waitForSelector('[data-testid="inspector-s1-observation"]');
      await primaryPage.waitForSelector('[data-testid="inspector-s2-guidance"]');
      await primaryPage.waitForSelector('[data-testid="inspector-dual-metrics"]');
      const s1Text = await primaryPage.getByTestId('inspector-subsystem-s1').innerText();
      assert(!s1Text.includes('CPA'), 'Inspector System 1 never claims CPA');
      const dualMetricsText = await primaryPage.getByTestId('inspector-dual-metrics').innerText();
      assert(
        !dualMetricsText.includes('等待双系统协同计数同步'),
        'Inspector DualSystemCollaborationMetrics should populate after active turns'
      );

      // 7. 服务端权限隔离探测：Companion 越权写命令返回 COMPANION_READ_ONLY
      const companionGuard = await probeWsRoleGuard({
        serverHttpOrigin: serverOrigin,
        token: authToken,
        sessionId,
        role: 'companion',
        sendMessages: [
          {
            type: 'audio.chunk',
            payload: { sessionId, format: 'pcm16', sampleRate: 16000, channels: 1, data: 'AA==', timestamp: 1 },
          },
          { type: 'session.pause', payload: { sessionId } },
          { type: 'session.end', payload: { sessionId, reason: 'user_requested' } },
        ],
      });
      const readOnlyErrors = companionGuard.received.filter(
        (m) => m.type === 'session.error' && m.payload?.code === 'COMPANION_READ_ONLY'
      );
      assert(
        readOnlyErrors.length >= 3,
        `Expected COMPANION_READ_ONLY for forbidden commands, got ${companionGuard.received.length} msgs`
      );

      // 8. 服务端防抢占探测：第二个 primary 连接同一活跃会话应返回 PRIMARY_MIC_CONFLICT
      const primaryConflict = await probeWsRoleGuard({
        serverHttpOrigin: serverOrigin,
        token: authToken,
        sessionId,
        role: 'primary',
        sendMessages: [{ type: 'ping', payload: { t: Date.now() } }],
      });
      const conflictHit =
        primaryConflict.closedCode === 4009 ||
        primaryConflict.received.some(
          (m) => m.type === 'session.error' && m.payload?.code === 'PRIMARY_MIC_CONFLICT'
        );
      assert(conflictHit, 'Second primary attach must trigger PRIMARY_MIC_CONFLICT');

      // 9. 关闭伴随窗不影响主控会话继续运转
      await companionPopup.close();
      await primaryPage.waitForTimeout(250);
      const statusAfterClose = await primaryPage.getByTestId('stage-session-status').innerText();
      assert(statusAfterClose.includes('实时协同中'), 'Primary stays active after companion closes');

      // 10. 重开窄屏独立伴随窗（420×720）校验零溢出 + 主控结束会话同步广播
      const secondCompanion = await context.newPage({ viewport: { width: 420, height: 720 } });
      attachErrorListeners(secondCompanion, 'companion-2');
      await secondCompanion.goto(companionHref, { waitUntil: 'networkidle' });
      await secondCompanion.waitForSelector('[data-testid="companion-view"]', { timeout: 15000 });
      await secondCompanion.waitForSelector('[data-testid="companion-header"]', { timeout: 15000 });
      const compDims = await secondCompanion.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      assert(
        compDims.scrollWidth <= compDims.clientWidth,
        `Companion 420x720 overflowed: ${compDims.scrollWidth} > ${compDims.clientWidth}`
      );

      await primaryPage.getByTestId('end-session-btn').click();
      await primaryPage.waitForSelector('[data-testid="reflection-view"]', { timeout: 15000 });
      await secondCompanion.waitForSelector('[data-testid="companion-session-ended"]', { timeout: 15000 });

      await secondCompanion.close();

      assert.deepEqual(consoleErrors, [], `Expected zero console errors: ${consoleErrors.join('; ')}`);
      assert.deepEqual(pageErrors, [], `Expected zero page errors: ${pageErrors.join('; ')}`);
    } finally {
      await context.close();
    }
  }
);
