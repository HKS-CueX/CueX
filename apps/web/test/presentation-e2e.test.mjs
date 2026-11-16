import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
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

async function assertNoHorizontalOverflow(page, label) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(
    dims.scrollWidth <= dims.clientWidth,
    `${label} overflowed horizontally: scrollWidth=${dims.scrollWidth} > clientWidth=${dims.clientWidth}`
  );
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
            // retry until server binds
          }
        }, 150)
      : null;
    const onChunk = (chunk) => {
      output += chunk.toString();
      const match = detectReady(output);
      if (match) {
        finish(match);
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.once('error', (err) => {
      fail(err);
    });
    child.once('exit', (code) => {
      if (code) {
        fail(new Error(`${command} exited with code ${code}:\n${output}`));
      }
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

before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'cuex-web-e2e-'));
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
      CUEX_COOLDOWN_MS: '250',
      CUEX_ALLOWED_ORIGINS: expectedWebOrigin,
      CUEX_RUNTIME_DIR: runtimeDir,
      CUEX_SQLITE_PATH: path.join(runtimeDir, 'cuex.sqlite'),
      CUEX_MEMORY_DIR: path.join(runtimeDir, 'memory'),
      CUEX_PACKS_DIR: path.join(runtimeDir, 'packs'),
      CUEX_LIBRARY_DIR: path.join(runtimeDir, 'library'),
    },
    (log) => {
      if (log.includes(String(serverPort)) || /listening|ready|started/i.test(log)) {
        return `http://127.0.0.1:${serverPort}`;
      }
      return null;
    },
    `http://127.0.0.1:${serverPort}/health`
  );
  serverOrigin = `http://127.0.0.1:${serverPort}`;

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${serverOrigin}/health`);
      if (res.ok) break;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150));
  }

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
  'CueX Presentation Stage-B E2E: Home -> Compiler -> Stage Focus/Split-Strip/Inspector -> Reflection -> Account Isolation/Plans/Export/Wipe',
  { timeout: 120000 },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    try {
      // 1. HOME VIEW & HONESTY BADGES + RESPONSIVE OVERFLOW CHECK
      await page.goto(webOrigin, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="scenario-matrix"]');
      await page.waitForSelector('[data-testid="home-auth-strip"]', { timeout: 10000 });
      await assertNoHorizontalOverflow(page, 'Home 1280x800');

      const homeText = await page.locator('body').innerText();
      assert(homeText.includes('你的快思考外挂'), 'Home renders primary CueX headline');
      assert(homeText.includes('在深度思考之外，接住当下'), 'Home renders CueX subheadline');
      assert(homeText.includes('Available'), 'CueX Presentation clearly marked Available');

      for (const roadmapId of ['social', 'teaching', 'sales', 'custom']) {
        const cardText = await page.getByTestId(`scenario-card-${roadmapId}`).innerText();
        assert(
          cardText.includes('Planned') && cardText.includes('路线图规划中'),
          `Roadmap card ${roadmapId} clearly labeled as Planned`
        );
        const disabledAttr = await page
          .getByTestId(`scenario-disabled-${roadmapId}`)
          .getAttribute('disabled');
        assert(disabledAttr !== null, `Roadmap scenario ${roadmapId} cannot be launched`);
      }

      // Narrow viewport 420x900 check on Home
      await page.setViewportSize({ width: 420, height: 900 });
      await assertNoHorizontalOverflow(page, 'Home 420x900');
      await page.setViewportSize({ width: 1280, height: 800 });

      // 2. COMPILER VIEW (Pre-upload reject + Markdown extract + Sample compile + Provenance + Lock Guard + QA)
      await page.getByTestId('home-cta-compiler').click();
      await page.waitForSelector('[data-testid="file-upload-input"]');

      // Unsupported file rejection happens before network upload
      const badFilePath = path.join(tempDir, 'malicious.exe');
      await writeFile(badFilePath, 'MZ-not-supported', 'utf8');
      await page.getByTestId('file-upload-input').setInputFiles(badFilePath);
      await page.waitForSelector('[data-testid="file-validation-error"]');

      // Valid markdown extract
      const sampleMdPath = path.join(tempDir, 'pitch-notes.md');
      await writeFile(
        sampleMdPath,
        '# CueX 演示大纲\n\n## 核心架构\nSystem 1 与 System 2 并行运行，独立 InterventionController 控频。\n\n## 评测目标\n核心公式 V = H - λI（默认 λ = 2）。\n',
        'utf8'
      );
      await page.getByTestId('file-upload-input').setInputFiles(sampleMdPath);
      await page.waitForSelector('[data-testid="extract-result"]');

      await page.getByTestId('load-sample-pack-btn').click();
      await page.waitForSelector('[data-testid="compiled-pack-panel"]');

      // FactWhitelist: verify provenance, add locked fact, check lock guard on edit/delete
      await page.getByTestId('tab-facts').click();
      await page.waitForSelector('[data-testid="fact-whitelist"]');
      const provCount = await page.locator('[data-testid^="fact-provenance-"]').count();
      assert(provCount >= 1, 'FactWhitelist items display provenance metadata');

      await page.getByTestId('new-fact-input').fill('CueX Presentation 锁定事实守卫已通过');
      await page.getByTestId('add-fact-btn').click();
      await page.waitForFunction(() =>
        document.body.innerText.includes('CueX Presentation 锁定事实守卫已通过')
      );
      const manualFactItem = page.locator('[data-testid^="fact-item-fact-manual-"]').first();
      const manualFactId = (await manualFactItem.getAttribute('data-testid')).replace(
        'fact-item-',
        ''
      );
      assert(
        (await page.getByTestId(`fact-edit-${manualFactId}`).isDisabled()) &&
          (await page.getByTestId(`fact-delete-${manualFactId}`).isDisabled()),
        'Locked facts disable both edit and delete controls'
      );

      // Verify QACards explicitly labeled as AI predictions
      await page.getByTestId('tab-qa').click();
      const qaText = await page.getByTestId('qa-cards-panel').innerText();
      assert(qaText.includes('AI 预测问题 · 非已确认事实'), 'QACards carry explicit prediction badge');

      await page.getByTestId('privacy-consent-checkbox').check();
      await page.getByTestId('launch-rehearsal-btn').click();

      // 3. STAGE VIEW (Honest Banners, Keyboard Shortcuts, Split-Strip 420x900, L0/L2/Withdraw/QA, Inspector)
      await page.waitForSelector('[data-testid="stage-workspace"]');
      await page.waitForSelector('[data-testid="focus-view"]');
      await page.waitForSelector('[data-testid="asr-simulation-banner"]');
      await page.waitForSelector('[data-testid="runtime-degraded-banner"]');

      // Ergonomics: Split-Strip mode + 420x900 & 1920x1080 zero overflow check
      await page.getByTestId('layout-mode-toggle').click();
      assert.equal(await page.getByTestId('focus-view').getAttribute('data-layout'), 'split_strip');
      await page.setViewportSize({ width: 420, height: 900 });
      await assertNoHorizontalOverflow(page, 'Stage Split-Strip 420x900');
      await page.setViewportSize({ width: 1920, height: 1080 });
      await assertNoHorizontalOverflow(page, 'Stage 1920x1080');
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.getByTestId('layout-mode-toggle').click();

      // Keyboard shortcuts (ensure input focus ignores shortcuts, stage shortcuts toggle M / Space)
      const simInput = page.getByTestId('sim-speech-input');
      await simInput.click();
      await simInput.fill('测试焦点内输入 m 和空格不会误触发快捷键');
      assert.equal(
        await page.locator('[data-testid="focus-silent-state"]').count(),
        0,
        'Keyboard shortcuts do not fire while typing in input'
      );
      await simInput.fill('');
      await page.getByTestId('focus-cue-stage').click();
      await page.keyboard.press('m');
      await page.waitForSelector('[data-testid="focus-silent-state"]');
      await page.keyboard.press('m');
      await page.waitForSelector('[data-testid="focus-l0-quiet"]');

      // Fluent on-topic speech remains quiet in L0
      await page.getByTestId('sim-speaker-select').selectOption('presenter');
      await simInput.fill('传统对话框 AI 需要用户停下来阅读长段输出，而自然停顿不等于卡壳。');
      await page.getByTestId('sim-speech-submit').click();
      await page.waitForTimeout(250);
      await page.waitForSelector('[data-testid="focus-l0-quiet"]');

      // Drift speech triggers intervention -> record H -> recover triggers auto-withdrawal
      await simInput.fill('顺便聊聊昨天咖啡厅的装修配色和个人旅游见闻，先不讲产品架构。');
      await page.getByTestId('sim-speech-submit').click();
      await page.waitForSelector('[data-testid="focus-active-intervention"]', { timeout: 10000 });
      await page.getByTestId('feedback-helpful-btn').click();

      await simInput.fill(
        '回到核心架构：CueX 采用 System 1 与 System 2 双层并行，由独立 InterventionController 控制介入并用 V = H - λI 评估。'
      );
      await page.getByTestId('sim-speech-submit').click();
      await page.waitForSelector('[data-testid="focus-withdrawn-banner"]', { timeout: 10000 });

      // Live Q&A missing-info warning test
      await page.waitForTimeout(350);
      await page.getByTestId('sim-speaker-select').selectOption('audience');
      await simInput.fill('请问明年海外扩张的精确付费合同总额和未公开投资协议条款是什么？');
      await page.getByTestId('sim-speech-submit').click();
      await page.waitForSelector('[data-testid="missing-evidence-warning"]', { timeout: 10000 });

      // Inspector View verification (telemetry, usageSource, costFen, controller logs, events timeline)
      await page.getByTestId('view-toggle-inspector').click();
      await page.waitForSelector('[data-testid="inspector-view"]');
      await page.waitForSelector('[data-testid="inspector-usage-source"]');
      await page.waitForSelector('[data-testid="inspector-cost"]');
      await page.waitForSelector('[data-testid="inspector-events"]');
      const decisionCount = await page.locator('[data-testid="controller-decision-row"]').count();
      assert(decisionCount >= 1, 'Inspector shows live ControllerDecision arbitration logs');

      // 4. REFLECTION VIEW & MEMORY GOVERNANCE
      await page.getByTestId('end-session-btn').click();
      await page.waitForSelector('[data-testid="reflection-view"]', { timeout: 15000 });
      await page.waitForSelector('[data-testid="utility-score-card"]');
      await page.waitForSelector('[data-testid="utility-formula-note"]');
      await page.waitForSelector('[data-testid="reflection-timeline"]');
      await page.waitForSelector('[data-testid="single-point-rehearsal"]');
      await assertNoHorizontalOverflow(page, 'Reflection 1280x800');

      await page.getByTestId('memory-add-toggle').click();
      await page.locator('[data-testid="memory-inspector"] input[type="text"]').fill('E2E 临时偏好记忆');
      await page.locator('[data-testid="memory-inspector"] textarea').fill('保持 5 分钟以内紧凑节奏');
      await page.locator('[data-testid="memory-inspector"] button[type="submit"]').click();
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="memory-inspector"]')
          ?.textContent?.includes('E2E 临时偏好记忆')
      );
      await page.locator('[data-testid^="memory-delete-"]').first().click();
      await page.waitForFunction(
        () =>
          !document
            .querySelector('[data-testid="memory-inspector"]')
            ?.textContent?.includes('E2E 临时偏好记忆')
      );

      // Single-point rehearsal re-entry + clean session wipe
      await page.waitForSelector('[data-testid="start-single-rehearsal-btn"]');
      await page.getByTestId('start-single-rehearsal-btn').click();
      await page.waitForSelector('[data-testid="stage-workspace"]', { timeout: 10000 });
      await page.getByTestId('wipe-session-btn').click();
      await page.waitForSelector('[data-testid="session-wiped-notice"]', { timeout: 10000 });

      // 5. ACCOUNT PANEL: HISTORY, PLANS HONESTY, SANDBOX CHECKOUT, EXPORT, MULTI-USER ISOLATION, WIPE RECEIPT
      await page.getByTestId('open-account-drawer').click();
      await page.waitForSelector('[data-testid="account-panel"]');

      // Sessions tab has User A's session
      await page.getByTestId('account-tab-sessions').click();
      await page.waitForSelector('[data-testid="session-history-list"]');

      // Plans tab: Team planned/disabled, Pro checkout returns liveCheckoutAvailable: false
      await page.getByTestId('account-tab-plans').click();
      assert(
        await page.getByTestId('preview-checkout-team').isDisabled(),
        'Team plan must be non-purchasable (Planned)'
      );
      await page.getByTestId('preview-checkout-pro').click();
      await page.waitForSelector('[data-testid="checkout-preview-result"]');
      const previewText = await page.getByTestId('checkout-preview-result').innerText();
      assert(
        previewText.includes('liveCheckoutAvailable: false') && previewText.includes('¥59.00'),
        'Checkout preview explicitly shows liveCheckoutAvailable: false and updated Pro price ¥59.00'
      );

      // Privacy tab: Export JSON & Markdown
      await page.getByTestId('account-tab-privacy').click();
      await page.getByTestId('export-json-btn').click();
      await page.waitForSelector('[data-testid="export-preview"]');
      const jsonPreview = await page.getByTestId('export-preview').innerText();
      assert(
        jsonPreview.includes('"exportId"') && jsonPreview.includes('"usageSummary"'),
        'JSON export preview displays UserDataExportBundle fields'
      );
      await page.getByTestId('export-md-btn').click();
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="export-preview"]')?.textContent?.includes('.md')
      );

      // Multi-user isolation: switch to User B / tenant_b -> User B sees NO User A sessions!
      await page.getByTestId('account-tab-account').click();
      await page.getByTestId('auth-switch-name').fill('User B 隔离测试');
      await page.getByTestId('auth-switch-tenant').fill('tenant_isolated_b');
      await page.getByTestId('auth-switch-submit').click();
      await page.waitForSelector('[data-testid="account-panel-notice"]');
      await page.getByTestId('account-tab-sessions').click();
      await page.waitForSelector('[data-testid="session-history-empty"]');

      // Live mode E2E verification on fresh User B quota (before wiping User B account)
      await page.keyboard.press('Escape');
      await page.getByTestId('nav-compiler').click();
      await page.waitForSelector('[data-testid="load-sample-pack-btn"]');
      await page.getByTestId('load-sample-pack-btn').click();
      await page.waitForSelector('[data-testid="compiled-pack-panel"]');
      const consentCheckbox = page.getByTestId('privacy-consent-checkbox');
      if (!(await consentCheckbox.isChecked())) {
        await consentCheckbox.check();
      }
      await page.getByTestId('launch-live-btn').click();
      await page.waitForSelector('[data-testid="stage-workspace"]');
      await page.waitForSelector('[data-testid="focus-l0-quiet"]');
      const liveStageText = await page.getByTestId('stage-workspace').innerText();
      assert(liveStageText.includes('正式演讲'), 'Live mode session launches with 正式演讲 badge');
      await page.getByTestId('end-session-btn').click();
      await page.waitForSelector('[data-testid="reflection-view"]', { timeout: 15000 });

      // Account Wipe receipt test on User B
      await page.getByTestId('open-account-drawer').click();
      await page.waitForSelector('[data-testid="account-panel"]');
      await page.getByTestId('account-tab-privacy').click();
      await page.getByTestId('confirm-account-wipe-checkbox').check();
      await page.getByTestId('wipe-account-data-btn').click();
      await page.waitForSelector('[data-testid="account-deletion-receipt"]', { timeout: 10000 });
      const receiptText = await page.getByTestId('account-deletion-receipt').innerText();
      assert(
        receiptText.includes('billing_audit_logs'),
        'Account deletion receipt transparently reports preserved billing_audit_logs'
      );

      // Close Account Drawer cleanly
      await page.keyboard.press('Escape');

      assert.deepEqual(consoleErrors, [], `Expected zero console errors, got: ${consoleErrors.join('; ')}`);
      assert.deepEqual(pageErrors, [], `Expected zero page errors, got: ${pageErrors.join('; ')}`);
    } finally {
      await context.close();
    }
  }
);
