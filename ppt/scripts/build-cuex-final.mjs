import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { runMetricsSyncCheck } from './verify-metrics-sync.mjs';
import { getChromium } from '../../scripts/browser-runtime.mjs';
import {
  renderBmcHtml,
  renderCoverHtml,
  renderJobSpecHtml,
  renderTokenProofHtml,
  renderUnitEconomicsHtml,
} from './cuex-final-doc-templates.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PPT_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PPT_ROOT, '..');
const OUT_ROOT = path.join(REPO_ROOT, 'deliverables', 'cuex-final');

function toRepoRel(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

async function ensureDirs() {
  for (const sub of ['', 'brand', 'pitch', 'business', 'evidence', 'previews']) {
    await fs.mkdir(path.join(OUT_ROOT, sub), { recursive: true });
  }
}

async function getAssetUrls() {
  const fontUrl = (name) => pathToFileURL(path.join(REPO_ROOT, 'assets', 'fonts', name)).href;
  const svgPath = path.join(REPO_ROOT, 'assets', 'brand', 'cuex-symbol-dimensional.svg');
  const svgContent = await fs.readFile(svgPath, 'utf8');
  return {
    fonts: {
      instrumentSerif: fontUrl('InstrumentSerif-Regular.ttf'),
      notoSansSc: fontUrl('NotoSansSC-VF.ttf'),
      notoSerifSc: fontUrl('NotoSerifSC-VF.ttf'),
      jetbrainsMono: fontUrl('JetBrainsMono-VF.ttf'),
      inter: fontUrl('Inter-VF.ttf'),
    },
    symbolDim: `data:image/svg+xml;base64,${Buffer.from(svgContent, 'utf8').toString('base64')}`,
  };
}

function findFreePort(start = 5188) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => resolve(findFreePort(start + 1)));
    srv.listen(start, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : start;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for Open-Slide dev server at ${url}`);
}

function startOpenSlideServer(port) {
  const bin = path.join(PPT_ROOT, 'node_modules', '.bin', 'open-slide');
  const child = spawn(bin, ['dev', '--port', String(port), '--host', '127.0.0.1'], {
    cwd: PPT_ROOT,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

async function renderHtmlToPdfAndPreview(browser, { html, widthPx, heightPx, pdfWidth, pdfHeight, pdfPath, previewPath, expectPages = 1 }) {
  const ctx = await browser.newContext({
    viewport: { width: widthPx, height: heightPx },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise((res) => { img.onload = res; img.onerror = res; })
      )
    );
  });
  await page.waitForTimeout(150);

  if (previewPath) {
    await page.screenshot({ path: previewPath, type: 'png' });
  }
  if (pdfPath) {
    const pdfBytes = await page.pdf({
      width: pdfWidth,
      height: pdfHeight,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      printBackground: true,
      preferCSSPageSize: true,
    });
    const doc = await PDFDocument.load(pdfBytes);
    const pages = doc.getPageCount();
    if (pages !== expectPages) {
      throw new Error(`Expected ${expectPages} page(s) in ${toRepoRel(pdfPath)}, got ${pages}`);
    }
    await fs.writeFile(pdfPath, pdfBytes);
  }
  await ctx.close();
  return expectPages;
}

async function renderHtmlToPng(browser, { html, widthPx, heightPx, pngPath, scale = 1 }) {
  const ctx = await browser.newContext({
    viewport: { width: widthPx, height: heightPx },
    deviceScaleFactor: scale,
  });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise((res) => { img.onload = res; img.onerror = res; })
      )
    );
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: pngPath, type: 'png' });
  await ctx.close();
}

async function exportBpDeck(browser, baseUrl) {
  const totalPages = 8;
  const singlePagePdfs = [];

  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  for (let p = 1; p <= totalPages; p++) {
    const page = await ctx.newPage();
    page.on('pageerror', (err) => console.error(`[Slide p=${p} pageerror]`, err));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[Slide p=${p} console.error]`, msg.text());
    });
    const url = `${baseUrl}/s/cuex-final/preview?p=${p}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('[data-osd-preview="ready"], [data-osd-preview="error"]', { timeout: 15000 });
    const previewState = await page.getAttribute('[data-osd-preview]', 'data-osd-preview');
    if (previewState === 'error') {
      const errMsg = await page.textContent('[data-osd-preview-error]').catch(() => 'unknown preview error');
      throw new Error(`Slide preview p=${p} entered error state: ${errMsg}`);
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.waitForTimeout(250);

    // Screenshot PNG preview before canvas snapshotting
    const previewPath = path.join(OUT_ROOT, 'previews', `bp-p${p}.png`);
    await page.screenshot({ path: previewPath, type: 'png' });

    // Freeze any WebGL canvases to crisp raster images & enforce exact 20in x 11.25in @page
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `
        @page { size: 20in 11.25in; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; width: 1920px !important; height: 1080px !important; overflow: hidden !important; background: #F8F7F3 !important; }
        }
      `;
      document.head.appendChild(style);

      document.querySelectorAll('canvas').forEach((canvas) => {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const img = document.createElement('img');
          img.src = dataUrl;
          img.style.width = canvas.style.width || `${canvas.clientWidth}px`;
          img.style.height = canvas.style.height || `${canvas.clientHeight}px`;
          img.style.display = 'block';
          img.style.objectFit = 'contain';
          canvas.replaceWith(img);
        } catch {
          // ignore if canvas unreadable
        }
      });
    });

    await page.waitForTimeout(100);
    const pdfBytes = await page.pdf({
      width: '20in',
      height: '11.25in',
      margin: { top: '0in', bottom: '0in', left: '0in', right: '0in' },
      printBackground: true,
      preferCSSPageSize: true,
    });
    const checkDoc = await PDFDocument.load(pdfBytes);
    if (checkDoc.getPageCount() !== 1) {
      throw new Error(`BP page ${p} overflowed to ${checkDoc.getPageCount()} pages!`);
    }
    singlePagePdfs.push(pdfBytes);
    await page.close();
  }

  await ctx.close();

  const merged = await PDFDocument.create();
  for (const bytes of singlePagePdfs) {
    const src = await PDFDocument.load(bytes);
    const [copied] = await merged.copyPages(src, [0]);
    merged.addPage(copied);
  }
  if (merged.getPageCount() !== totalPages) {
    throw new Error(`Merged BP expected ${totalPages} pages, got ${merged.getPageCount()}`);
  }
  const mergedBytes = await merged.save();

  const pitchBp = path.join(OUT_ROOT, 'pitch', 'CueX-BP.pdf');
  const bizBp = path.join(OUT_ROOT, 'business', 'CueX-Business-Plan.pdf');
  await fs.writeFile(pitchBp, mergedBytes);
  await fs.writeFile(bizBp, mergedBytes);

  return { pitchBp, bizBp, pageCount: merged.getPageCount() };
}

async function findCachedHeadlessShell() {
  const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  try {
    const entries = await fs.readdir(cacheDir);
    for (const entry of entries.sort().reverse()) {
      if (entry.startsWith('chromium_headless_shell-')) {
        for (const archDir of ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64', 'chrome-headless-shell-linux']) {
          const candidate = path.join(cacheDir, entry, archDir, 'chrome-headless-shell');
          try {
            await fs.access(candidate);
            return candidate;
          } catch {}
        }
      }
    }
  } catch {}
  return null;
}

async function launchBrowser(chromium) {
  const launchArgs = ['--enable-webgl', '--ignore-gpu-blocklist'];
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: launchArgs });
  }
  try {
    return await chromium.launch({ headless: true, args: launchArgs });
  } catch {
    const cached = await findCachedHeadlessShell();
    if (cached) {
      return chromium.launch({ headless: true, executablePath: cached, args: launchArgs });
    }
    return chromium.launch({ headless: true, channel: 'chrome', args: launchArgs });
  }
}

async function main() {
  await ensureDirs();
  const metricsRaw = await fs.readFile(path.join(__dirname, 'cuex-final-metrics.json'), 'utf8');
  const metrics = JSON.parse(metricsRaw);
  const assets = await getAssetUrls();

  const port = await findFreePort(5188);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startOpenSlideServer(port);

  let serverLogs = '';
  server.stdout.on('data', (d) => { serverLogs += d.toString(); });
  server.stderr.on('data', (d) => { serverLogs += d.toString(); });

  const chromium = await getChromium();
  const browser = await launchBrowser(chromium);

  try {
    await waitForHttp(baseUrl);

    const bpResult = await exportBpDeck(browser, baseUrl);

    const coverPng = path.join(OUT_ROOT, 'brand', 'CueX-Cover.png');
    await renderHtmlToPng(browser, {
      html: renderCoverHtml(metrics, assets),
      widthPx: 1920,
      heightPx: 1080,
      pngPath: coverPng,
      scale: 1,
    });
    await fs.copyFile(coverPng, path.join(OUT_ROOT, 'previews', 'cover.png'));

    const tokenProofPng = path.join(OUT_ROOT, 'evidence', 'token-usage-proof.png');
    await renderHtmlToPng(browser, {
      html: renderTokenProofHtml(metrics, assets),
      widthPx: 1600,
      heightPx: 960,
      pngPath: tokenProofPng,
      scale: 1,
    });

    const jobSpecPdf = path.join(OUT_ROOT, 'business', 'CueX-AI-Employee-Job-Spec.pdf');
    const jobSpecPreview = path.join(OUT_ROOT, 'previews', 'job-spec-p1.png');
    await renderHtmlToPdfAndPreview(browser, {
      html: renderJobSpecHtml(metrics, assets),
      widthPx: 794,
      heightPx: 1120,
      pdfWidth: '210mm',
      pdfHeight: '296.4mm',
      pdfPath: jobSpecPdf,
      previewPath: jobSpecPreview,
      expectPages: 1,
    });

    const bmcPdf = path.join(OUT_ROOT, 'business', 'CueX-Business-Model-Canvas.pdf');
    const bmcPreview = path.join(OUT_ROOT, 'previews', 'bmc-p1.png');
    await renderHtmlToPdfAndPreview(browser, {
      html: renderBmcHtml(metrics, assets),
      widthPx: 1123,
      heightPx: 792,
      pdfWidth: '297mm',
      pdfHeight: '209.4mm',
      pdfPath: bmcPdf,
      previewPath: bmcPreview,
      expectPages: 1,
    });

    const uePdf = path.join(OUT_ROOT, 'business', 'CueX-Unit-Economics.pdf');
    const uePreview = path.join(OUT_ROOT, 'previews', 'unit-economics-p1.png');
    await renderHtmlToPdfAndPreview(browser, {
      html: renderUnitEconomicsHtml(metrics, assets),
      widthPx: 1123,
      heightPx: 792,
      pdfWidth: '297mm',
      pdfHeight: '209.4mm',
      pdfPath: uePdf,
      previewPath: uePreview,
      expectPages: 1,
    });

    // Combine BMC + Unit Economics into exact 2-page A4 landscape PDF
    const combinedPdf = path.join(OUT_ROOT, 'business', 'CueX-BMC-and-Unit-Economics.pdf');
    const combinedDoc = await PDFDocument.create();
    for (const p of [bmcPdf, uePdf]) {
      const src = await PDFDocument.load(await fs.readFile(p));
      const [cp] = await combinedDoc.copyPages(src, [0]);
      combinedDoc.addPage(cp);
    }
    if (combinedDoc.getPageCount() !== 2) {
      throw new Error(`Expected 2 pages in combined BMC+UE PDF, got ${combinedDoc.getPageCount()}`);
    }
    await fs.writeFile(combinedPdf, await combinedDoc.save());

    const verification = {
      schemaVersion: 'cuex-final-verification-v1',
      generatedAt: new Date().toISOString(),
      dataStatus: metrics.dataStatus,
      evalSource: metrics.eval.sourceLabel,
      tokenProofEmbedded: true,
      outputs: {
        coverPng: toRepoRel(coverPng),
        tokenProofPng: toRepoRel(tokenProofPng),
        bpPitchPdf: { path: toRepoRel(bpResult.pitchBp), pages: bpResult.pageCount },
        bpBusinessPdf: { path: toRepoRel(bpResult.bizBp), pages: bpResult.pageCount },
        jobSpecPdf: { path: toRepoRel(jobSpecPdf), pages: 1 },
        bmcPdf: { path: toRepoRel(bmcPdf), pages: 1 },
        unitEconomicsPdf: { path: toRepoRel(uePdf), pages: 1 },
        combinedBmcUePdf: { path: toRepoRel(combinedPdf), pages: 2 },
        previewsDir: toRepoRel(path.join(OUT_ROOT, 'previews')),
      },
      checks: {
        strictPageCountsPassed: true,
        allArtifactsGenerated: true,
        noExternalMockConsoleScreenshot: true,
      },
    };

    const verPath = path.join(OUT_ROOT, 'evidence', 'verification.json');
    await fs.writeFile(verPath, JSON.stringify(verification, null, 2) + '\n', 'utf8');

    const syncResult = await runMetricsSyncCheck({ checkPdfs: true });
    if (!syncResult.ok) {
      throw new Error(`Metrics sync verification failed:\n${syncResult.errors.join('\n')}`);
    }
    verification.checks.metricsSyncPassed = true;
    verification.checks.scannedFiles = syncResult.scannedFiles;
    await fs.writeFile(verPath, JSON.stringify(verification, null, 2) + '\n', 'utf8');

    console.log('CueX-Final build succeeded:', JSON.stringify(verification, null, 2));
  } catch (err) {
    console.error('Server logs:\n', serverLogs);
    throw err;
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
