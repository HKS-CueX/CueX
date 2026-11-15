import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { getChromium } from '../../scripts/browser-runtime.mjs';
import { renderBmcAndBillHtml, renderCoverPosterHtml, renderJobSpecHtml } from './hks-doc-templates.mjs';

const pptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pptRoot, '..');
const outDir = path.join(repoRoot, 'deliverables', 'hks-2026');
const previewDir = path.join(outDir, 'preview');
const pptOutDir = path.join(pptRoot, 'out');

function toDataUri(filePath, mime) {
  const buf = readFileSync(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function detectTokenProof() {
  const candidates = [
    ['token-usage-proof.png', 'image/png'],
    ['token-usage-proof.jpg', 'image/jpeg'],
    ['token-usage-proof.jpeg', 'image/jpeg'],
    ['token-usage-proof.webp', 'image/webp'],
  ];
  for (const [filename, mime] of candidates) {
    const full = path.join(repoRoot, 'assets', 'hks', filename);
    if (existsSync(full)) {
      console.log(`[Token Proof] Found official screenshot: ${full}`);
      return toDataUri(full, mime);
    }
  }
  console.log('[Token Proof] No assets/hks/token-usage-proof.* found yet — rendering structured proof placeholder slot.');
  return null;
}

async function isServerUp(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureOpenSlideServer() {
  const baseUrl = 'http://localhost:5180';
  if (await isServerUp(`${baseUrl}/s/cuex-hks/preview?p=1`)) {
    return { baseUrl, stop: async () => {} };
  }
  console.log('[open-slide] Starting local preview server on port 5180...');
  const bin = path.join(pptRoot, 'node_modules', '.bin', 'open-slide');
  const child = spawn(bin, ['dev'], {
    cwd: pptRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 60; i++) {
    if (await isServerUp(`${baseUrl}/s/cuex-hks/preview?p=1`)) {
      return {
        baseUrl,
        stop: async () => {
          child.kill('SIGTERM');
        },
      };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill('SIGTERM');
  throw new Error('Timed out waiting for open-slide dev server on port 5180.');
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(previewDir, { recursive: true });
  await mkdir(pptOutDir, { recursive: true });
  await mkdir(path.join(repoRoot, 'assets', 'hks'), { recursive: true });

  const fonts = {
    serif: toDataUri(path.join(repoRoot, 'assets/fonts/NotoSerifSC-VF.ttf'), 'font/ttf'),
    sans: toDataUri(path.join(repoRoot, 'assets/fonts/NotoSansSC-VF.ttf'), 'font/ttf'),
    instrument: toDataUri(path.join(repoRoot, 'assets/fonts/InstrumentSerif-Regular.ttf'), 'font/ttf'),
    mono: toDataUri(path.join(repoRoot, 'assets/fonts/JetBrainsMono-VF.ttf'), 'font/ttf'),
  };
  const symbolDataUri = toDataUri(path.join(repoRoot, 'assets/brand/cuex-symbol-dimensional.svg'), 'image/svg+xml');
  const dimensionalXDataUri = toDataUri(path.join(repoRoot, 'assets/brand/x-dimensional.png'), 'image/png');
  const tokenProofDataUri = detectTokenProof();

  const server = await ensureOpenSlideServer();
  const browser = await getChromium().launch({ channel: 'chrome', headless: true });

  try {
    /* =========================================================================
     * 1. Export 8-Page 16:9 BP (`记性好了一点-CueX-BP.pdf` + `.html` + PNGs)
     * ======================================================================= */
    const slideCount = 8;
    const bpPage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    const sections = [];
    let slideCss = '';

    for (let n = 1; n <= slideCount; n++) {
      await bpPage.goto(`${server.baseUrl}/s/cuex-hks/preview?p=${n}`, { waitUntil: 'networkidle' });
      await bpPage.locator('.cuex-wide').waitFor();
      await bpPage.waitForFunction(() =>
        [...document.querySelectorAll('.cuex-wide canvas')].every(
          (c) => getComputedStyle(c).display === 'none' || c.getAttribute('data-3d-ready') === 'true',
        ),
      );
      await bpPage.evaluate(() => document.fonts.ready);
      await bpPage.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));

      if (tokenProofDataUri) {
        await bpPage.evaluate((dataUri) => {
          const slot = document.querySelector('[data-token-proof-slot="true"]');
          if (slot) {
            slot.innerHTML = `<img src="${dataUri}" alt="赛事官方算力平台真实 Token 消耗截图" style="max-width:100%;max-height:100%;object-fit:contain;display:block;" />`;
            slot.style.border = '1.5px solid #A6C7BA';
            slot.style.padding = '8px';
          }
        }, tokenProofDataUri);
      }

      // Save visual verification screenshot for each slide
      await bpPage.locator('.cuex-wide').screenshot({
        path: path.join(previewDir, `bp-p${n}.png`),
      });

      const content = await bpPage.locator('.cuex-wide').evaluate((el) => {
        const clone = el.cloneNode(true);
        const cs = getComputedStyle(el);
        for (const key of cs) {
          if (key.startsWith('--osd')) clone.style.setProperty(key, cs.getPropertyValue(key));
        }
        const originals = [...el.querySelectorAll('canvas')];
        [...clone.querySelectorAll('canvas')].forEach((canvas, index) => {
          const image = document.createElement('img');
          for (const attribute of canvas.attributes) image.setAttribute(attribute.name, attribute.value);
          image.src = originals[index].toDataURL('image/png');
          canvas.replaceWith(image);
        });
        for (const img of clone.querySelectorAll('img')) {
          img.src = new URL(img.getAttribute('src'), document.baseURI).href;
        }
        const css = [...document.querySelectorAll('style')]
          .map((s) => s.textContent)
          .join('\n')
          .replace(/\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\//g, '')
          .replace(/url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/g, (original, _quote, quoted, unquoted) => {
            const url = (quoted ?? unquoted).trim();
            if (!url || /^(?:data:|blob:|#)/i.test(url)) return original;
            return `url("${new URL(url, document.baseURI).href}")`;
          });
        return { html: clone.outerHTML, css };
      });
      slideCss = content.css;
      sections.push(content.html);
    }

    let bpHtml = `<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><title>记性好了一点-CueX-BP</title><style>${slideCss}
@page{size:20in 11.25in;margin:0}
html,body{margin:0!important;padding:0!important;width:1920px!important;background:#ECEDE7!important}
.print-page{width:1920px;height:1080px;overflow:hidden;position:relative;break-after:page}
.print-page:last-child{break-after:auto}
.cuex-wide{position:relative!important;left:0!important;top:0!important;margin:0!important;transform:none!important}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
</style><body>${sections.map((s) => `<div class="print-page">${s}</div>`).join('')}</body></html>`;

    const externalUrls = [...new Set([...bpHtml.matchAll(/(?:src=["']|url\(["']?)(https?:\/\/[^"')\s>]+)/g)].map((m) => m[1]))];
    for (const url of externalUrls) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Asset ${res.status}: ${url}`);
      const mime = res.headers.get('content-type') ?? 'application/octet-stream';
      const data = `data:${mime};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
      bpHtml = bpHtml.split(url).join(data);
    }
    if (/(?:url\(\s*["']?|src=["'])https?:\/\/|\/@fs\/|file:\/\//i.test(bpHtml)) {
      throw new Error('BP HTML export still references an external or authoring-only resource.');
    }

    const bpHtmlPath = path.join(outDir, '记性好了一点-CueX-BP.html');
    const bpPdfPath = path.join(outDir, '记性好了一点-CueX-BP.pdf');
    await writeFile(bpHtmlPath, bpHtml);

    await bpPage.setContent(bpHtml, { waitUntil: 'load' });
    await bpPage.evaluate(() => document.fonts.ready);
    await bpPage.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    const rawBpPdf = await bpPage.pdf({
      width: '20in',
      height: '11.25in',
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
      preferCSSPageSize: true,
    });
    const bpDoc = await PDFDocument.load(rawBpPdf, { updateMetadata: false });
    if (bpDoc.getPageCount() !== slideCount) {
      throw new Error(`Expected ${slideCount} BP pages, got ${bpDoc.getPageCount()}`);
    }
    for (const [idx, p] of bpDoc.getPages().entries()) {
      const { width, height } = p.getSize();
      if (Math.abs(width / height - 16 / 9) > 0.002) {
        throw new Error(`BP page ${idx + 1} is not 16:9: ${width}x${height}`);
      }
    }
    const savedBpPdf = await bpDoc.save({ useObjectStreams: false });
    await writeFile(bpPdfPath, savedBpPdf);
    await writeFile(path.join(pptOutDir, '记性好了一点-CueX-BP.pdf'), savedBpPdf);
    await bpPage.close();

    /* =========================================================================
     * 2. Export 1-Page Job Spec (`记性好了一点-CueX-AI员工岗位说明书.pdf`)
     * ======================================================================= */
    const jobPage = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
    const jobHtml = renderJobSpecHtml({ fonts, symbolDataUri });
    await jobPage.setContent(jobHtml, { waitUntil: 'load' });
    await jobPage.evaluate(() => document.fonts.ready);
    await jobPage.screenshot({ path: path.join(previewDir, 'job-spec-p1.png'), fullPage: true });
    const rawJobPdf = await jobPage.pdf({
      format: 'A4',
      landscape: false,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
      preferCSSPageSize: true,
    });
    const jobDoc = await PDFDocument.load(rawJobPdf, { updateMetadata: false });
    if (jobDoc.getPageCount() !== 1) {
      throw new Error(`Job Spec must fit strictly on 1 page, got ${jobDoc.getPageCount()} pages!`);
    }
    const jobPdfPath = path.join(outDir, '记性好了一点-CueX-AI员工岗位说明书.pdf');
    await writeFile(jobPdfPath, await jobDoc.save({ useObjectStreams: false }));
    await jobPage.close();

    /* =========================================================================
     * 3. Export 2-Page BMC + Unit Economics Bill (`记性好了一点-CueX-商业模式画布与单位经济账单.pdf`)
     * ======================================================================= */
    const bmcPage = await browser.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 2 });
    const bmcHtml = renderBmcAndBillHtml({ fonts, symbolDataUri, tokenProofDataUri });
    await bmcPage.setContent(bmcHtml, { waitUntil: 'load' });
    await bmcPage.evaluate(() => document.fonts.ready);
    const bmcSections = bmcPage.locator('.page');
    await bmcSections.nth(0).screenshot({ path: path.join(previewDir, 'bmc-bill-p1.png') });
    await bmcSections.nth(1).screenshot({ path: path.join(previewDir, 'bmc-bill-p2.png') });
    const rawBmcPdf = await bmcPage.pdf({
      format: 'A4',
      landscape: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
      preferCSSPageSize: true,
    });
    const bmcDoc = await PDFDocument.load(rawBmcPdf, { updateMetadata: false });
    if (bmcDoc.getPageCount() !== 2) {
      throw new Error(`BMC + Unit Economics Bill must be strictly 2 pages, got ${bmcDoc.getPageCount()} pages!`);
    }
    const bmcPdfPath = path.join(outDir, '记性好了一点-CueX-商业模式画布与单位经济账单.pdf');
    await writeFile(bmcPdfPath, await bmcDoc.save({ useObjectStreams: false }));
    await bmcPage.close();

    /* =========================================================================
     * 4. Export 16:9 Gallery Cover Image (`记性好了一点-CueX-封面.png`)
     * ======================================================================= */
    const coverPage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const coverHtml = renderCoverPosterHtml({ fonts, symbolDataUri, dimensionalXDataUri });
    await coverPage.setContent(coverHtml, { waitUntil: 'load' });
    await coverPage.evaluate(() => document.fonts.ready);
    await coverPage.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    const coverPath = path.join(outDir, '记性好了一点-CueX-封面.png');
    await coverPage.screenshot({ path: coverPath });
    await coverPage.close();

    const guideSrc = path.join(repoRoot, 'docs/HKS_2026_SUBMISSION_GUIDE.md');
    const guideDst = path.join(outDir, '官网提交文案与封版核查清单.md');
    if (existsSync(guideSrc)) {
      await writeFile(guideDst, readFileSync(guideSrc));
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      tokenProofEmbedded: Boolean(tokenProofDataUri),
      deliverables: {
        bpPdf: { path: bpPdfPath, pages: bpDoc.getPageCount(), aspectRatio: '16:9 (1440x810pt)' },
        jobSpecPdf: { path: jobPdfPath, pages: jobDoc.getPageCount(), format: 'A4 portrait' },
        bmcAndBillPdf: { path: bmcPdfPath, pages: bmcDoc.getPageCount(), format: 'A4 landscape' },
        coverPng: { path: coverPath, dimensions: '1920x1080' },
      },
    };
    await writeFile(path.join(outDir, 'verification.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
