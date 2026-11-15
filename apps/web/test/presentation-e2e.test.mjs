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
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    });
  }
  try {
    return await chromium.launch({ headless: true });
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
          const macArm = path.join(cacheDir, entry, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
          const linux = path.join(cacheDir, entry, 'chrome-linux/headless_shell');
          for (const candidate of [macArm, linux]) {
            if (await fileExists(candidate)) {
              return chromium.launch({ headless: true, executablePath: candidate });
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
            return chromium.launch({ headless: true, executablePath: macArm });
          }
        }
      }
    }
    const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (await fileExists(systemChrome)) {
      return chromium.launch({ headless: true, executablePath: systemChrome });
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

async function startProcess(command, args, env, detectReady) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.push(child);
  let output = '';
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Startup timeout for ${command} ${args.join(' ')}:\n${output}`));
    }, 30000);
    const onChunk = (chunk) => {
      output += chunk.toString();
      const match = detectReady(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match);
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.once('exit', (code) => {
      if (code) {
        clearTimeout(timeout);
        reject(new Error(`${command} exited with code ${code}:\n${output}`));
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
  const runtimeDir = path.join(tempDir, 'runtime');

  await startProcess(
    path.join(root, 'apps/server/node_modules/.bin/tsx'),
    ['apps/server/src/index.ts'],
    {
      PORT: String(serverPort),
      CUEX_SYSTEM1: 'fake',
      CUEX_SYSTEM2: 'fake',
      CUEX_ASR: 'fake',
      CUEX_COOLDOWN_MS: '250',
      CUEX_RUNTIME_DIR: runtimeDir,
      CUEX_MEMORY_DIR: path.join(runtimeDir, 'memory'),
      CUEX_PACKS_DIR: path.join(runtimeDir, 'packs'),
      CUEX_LIBRARY_DIR: path.join(runtimeDir, 'library'),
    },
    (log) => {
      if (log.includes(String(serverPort)) || /listening|ready|started/i.test(log)) {
        return `http://127.0.0.1:${serverPort}`;
      }
      return null;
    }
  );
  serverOrigin = `http://127.0.0.1:${serverPort}`;

  // Wait until /health responds 200
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
    ['--config', 'apps/web/vite.config.ts', 'apps/web', '--host', '127.0.0.1', '--port', '0'],
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
  'CueX Presentation end-to-end: Home -> Compiler -> Stage Focus & Inspector -> Reflection & Memory Governance',
  { timeout: 120000 },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    try {
      // 1. HOME VIEW
      await page.goto(webOrigin, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="scenario-matrix"]');
      const homeText = await page.locator('body').innerText();
      assert(homeText.includes('你的快思考外挂'), 'Home renders primary CueX headline');
      assert(homeText.includes('在深度思考之外，接住当下'), 'Home renders CueX subheadline');
      assert(homeText.includes('CueX Presentation'), 'Home renders implemented Presentation scenario');

      for (const roadmapId of ['social', 'teaching', 'sales', 'custom']) {
        const cardText = await page.getByTestId(`scenario-card-${roadmapId}`).innerText();
        assert(
          cardText.includes('路线图规划中 · 暂未开放实机'),
          `Roadmap card ${roadmapId} clearly labeled as unimplemented`
        );
      }

      // 2. COMPILER VIEW (Extract + Compile Demo Pack + Lock Facts)
      await page.getByTestId('home-cta-compiler').click();
      await page.waitForSelector('[data-testid="file-upload-input"]');

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

      // Switch to FactWhitelist tab, add and lock a custom confirmed fact
      await page.getByTestId('tab-facts').click();
      await page.waitForSelector('[data-testid="fact-whitelist"]');
      await page.getByTestId('new-fact-input').fill('CueX Presentation 本地离线端到端评测已通过');
      await page.getByTestId('add-fact-btn').click();
      await page.waitForFunction(() =>
        document.body.innerText.includes('CueX Presentation 本地离线端到端评测已通过')
      );

      // Verify QACards explicitly labeled as AI predictions
      await page.getByTestId('tab-qa').click();
      const qaText = await page.getByTestId('qa-cards-panel').innerText();
      assert(qaText.includes('AI 预测问题 · 非已确认事实'), 'QACards carry explicit prediction badge');

      // Accept Privacy Notice & launch Rehearsal mode
      await page.getByTestId('privacy-consent-checkbox').check();
      await page.getByTestId('launch-rehearsal-btn').click();

      // 3. STAGE VIEW (Focus & Inspector + L0 + L1/L2 + Auto-Withdraw + Q&A Missing Warning)
      await page.waitForSelector('[data-testid="stage-workspace"]');
      await page.waitForSelector('[data-testid="focus-view"]');
      const asrBadge = await page.getByTestId('asr-capability-badge').innerText();
      assert(asrBadge.length > 0, 'ASR capability badge is visible');

      // Verify L0 Silent Mode toggle
      await page.getByTestId('toggle-silent-btn').click();
      await page.waitForSelector('[data-testid="focus-silent-state"]');
      await page.getByTestId('toggle-silent-btn').click();
      await page.waitForSelector('[data-testid="focus-l0-quiet"]');

      // Verify fluent on-topic speech remains quiet in L0 without false trigger
      await page.getByTestId('sim-speaker-select').selectOption('presenter');
      await page
        .getByTestId('sim-speech-input')
        .fill('传统对话框 AI 需要用户停下来阅读长段输出，而自然停顿不等于卡壳。');
      await page.getByTestId('sim-speech-submit').click();
      await page.waitForTimeout(250);
      await page.waitForSelector('[data-testid="focus-l0-quiet"]');

      // Trigger L1/L2 intervention via off-topic drift simulation
      await page
        .getByTestId('sim-speech-input')
        .fill('顺便聊聊昨天咖啡厅的装修配色和个人旅游见闻，先不讲产品架构。');
      await page.getByTestId('sim-speech-submit').click();
      await page.waitForSelector('[data-testid="focus-active-intervention"]', { timeout: 10000 });

      // Record positive feedback H
      await page.getByTestId('feedback-helpful-btn').click();

      // Recover by addressing core architecture -> intervention should auto-withdraw!
      await page
        .getByTestId('sim-speech-input')
        .fill('回到核心架构：CueX 采用 System 1 与 System 2 双层并行，由独立 InterventionController 控制介入并用 V = H - λI 评估。');
      await page.getByTestId('sim-speech-submit').click();
      await page.waitForSelector('[data-testid="focus-withdrawn-banner"]', { timeout: 10000 });

      // Live Q&A missing-info warning test (audience asks an ungrounded question)
      await page.waitForTimeout(350);
      await page.getByTestId('sim-speaker-select').selectOption('audience');
      await page
        .getByTestId('sim-speech-input')
        .fill('请问明年海外扩张的精确付费合同总额和未公开投资协议条款是什么？');
      await page.getByTestId('sim-speech-submit').click();
      await page.waitForSelector('[data-testid="missing-evidence-warning"]', { timeout: 10000 });

      // Switch to Inspector view and verify real live runtime state
      await page.getByTestId('view-toggle-inspector').click();
      await page.waitForSelector('[data-testid="inspector-view"]');
      await page.waitForSelector('[data-testid="inspector-system1"]');
      await page.waitForSelector('[data-testid="inspector-controller"]');
      const decisionCount = await page.locator('[data-testid="controller-decision-row"]').count();
      assert(decisionCount >= 1, 'Inspector shows live ControllerDecision arbitration logs');

      // 4. REFLECTION VIEW & MEMORY DELETION
      await page.getByTestId('end-session-btn').click();
      await page.waitForSelector('[data-testid="reflection-view"]', { timeout: 15000 });
      await page.waitForSelector('[data-testid="utility-score-card"]');
      await page.waitForSelector('[data-testid="reflection-timeline"]');
      await page.waitForSelector('[data-testid="single-point-rehearsal"]');

      // Create/accept memory item and delete it via Memory Inspector
      await page.getByTestId('memory-add-toggle').click();
      await page.locator('[data-testid="memory-inspector"] input[type="text"]').fill('E2E 临时偏好记忆');
      await page.locator('[data-testid="memory-inspector"] textarea').fill('保持 5 分钟以内紧凑节奏');
      await page.locator('[data-testid="memory-inspector"] button[type="submit"]').click();
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="memory-inspector"]')?.textContent?.includes('E2E 临时偏好记忆')
      );

      const deleteBtn = page.locator('[data-testid^="memory-delete-"]').first();
      await deleteBtn.click();
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="memory-inspector"]')?.textContent?.includes('E2E 临时偏好记忆')
      );

      // Single-point rehearsal re-entry + clean session wipe
      await page.waitForSelector('[data-testid="start-single-rehearsal-btn"]');
      await page.getByTestId('start-single-rehearsal-btn').click();
      await page.waitForSelector('[data-testid="stage-workspace"]', { timeout: 10000 });
      await page.getByTestId('wipe-session-btn').click();
      await page.waitForSelector('[data-testid="session-wiped-notice"]', { timeout: 10000 });

      assert.deepEqual(consoleErrors, [], `Expected zero console errors, got: ${consoleErrors.join('; ')}`);
      assert.deepEqual(pageErrors, [], `Expected zero page errors, got: ${pageErrors.join('; ')}`);
    } finally {
      await context.close();
    }
  }
);
