#!/usr/bin/env node
/**
 * Automated Source-of-Truth & Hygiene Sync Verifier for CueX Commercial Deliverables.
 * Checks consistency between `ppt/scripts/cuex-final-metrics.json`, `.cuex-runtime/eval-latest.json`,
 * `docs/business/*.md`, `ppt/` templates/slides, `deliverables/cuex-final/**`, and PDF page counts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { inspectPublicText } from '../../scripts/check-public-data.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const DEPRECATED_TOKENS = [
  'breakevenSessionsPro',
  'undefined场',
  '84.2%',
  '92.4%',
  '87.6%',
  '87 场',
  '87场',
  '9 变量敏感性',
  '9 项敏感性',
  '11 项全敏感性',
  '30–50 位',
  '30-50 位',
  '0.75 ms',
  '0.75ms',
  '1.57 ms',
  '1.57ms',
  '0.83 ms',
  '0.83ms',
  '1.7 ms',
  '1.7ms',
  '0.76 ms',
  '0.76ms',
  '0.46 ms',
  '0.46ms',
  '1.63 ms',
  '1.63ms',
  'PENDING PHASE',
  'Pending E2E Lock',
  'Phase 4 Prep Draft',
  'Phase 4 Prep · Pending',
  'Live Phase 3 Telemetry Slot Included',
  '终版合成时此处嵌入',
  'Model vs. Real Measurement Slot',
  '对标同步槽位',
];

async function collectFiles(dir, exts) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'out', 'previews', '.git', 'assets'].includes(entry.name)) continue;
      results.push(...(await collectFiles(full, exts)));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

export async function runMetricsSyncCheck({ checkPdfs = true } = {}) {
  const errors = [];
  const warnings = [];

  const metricsPath = path.join(REPO_ROOT, 'ppt', 'scripts', 'cuex-final-metrics.json');
  const metricsRaw = await fs.readFile(metricsPath, 'utf8');
  const metrics = JSON.parse(metricsRaw);

  // 1. Validate canonical metrics JSON schema & Phase 3/4 locks
  if (metrics.dataStatus !== 'EVAL_LOCKED') {
    errors.push(`cuex-final-metrics.json dataStatus must be EVAL_LOCKED, got ${metrics.dataStatus}`);
  }
  if ((metrics.sensitivities ?? []).length !== 12) {
    errors.push(`Expected 12 sensitivity sweeps in cuex-final-metrics.json, got ${metrics.sensitivities?.length}`);
  }
  if ((metrics.asrModes ?? []).length !== 6) {
    errors.push(`Expected 6 ASR modes in cuex-final-metrics.json, got ${metrics.asrModes?.length}`);
  }
  if (metrics.phase3RealValidation?.status !== 'REAL_E2E_LOCKED') {
    errors.push(`phase3RealValidation.status must be REAL_E2E_LOCKED, got ${metrics.phase3RealValidation?.status}`);
  }
  if (!metrics.paymentChannels?.wechatPay || !metrics.paymentChannels?.alipay) {
    errors.push('Missing split paymentChannels.wechatPay or paymentChannels.alipay in cuex-final-metrics.json');
  }
  if (metrics.companyBreakeven?.status !== 'UNMODELED') {
    errors.push(`companyBreakeven.status must be UNMODELED, got ${metrics.companyBreakeven?.status}`);
  }
  for (const scName of ['conservative', 'base', 'optimistic']) {
    const sc = metrics.scenarios?.[scName];
    if (!sc || typeof sc.maxAffordableSessionsPerProMonth !== 'number') {
      errors.push(`scenarios.${scName}.maxAffordableSessionsPerProMonth is missing`);
    }
    if (sc && 'breakevenSessionsPro' in sc) {
      errors.push(`Deprecated key breakevenSessionsPro still present in scenarios.${scName}`);
    }
  }

  // 2. Compare against live .cuex-runtime/eval-latest.json if present (allow deterministic sub-ms wall-clock jitter on reruns)
  const evalPath = path.join(REPO_ROOT, '.cuex-runtime', 'eval-latest.json');
  try {
    const evalJson = JSON.parse(await fs.readFile(evalPath, 'utf8'));
    const em = evalJson.metrics ?? {};
    if (em.passRate !== 1 || em.precision !== 1 || em.falseInterventionRate !== 0 || em.withdrawalAccuracy !== 1 || em.totalNetUtilityV !== 3) {
      errors.push(`Deterministic eval behavior mismatch in .cuex-runtime/eval-latest.json: ${JSON.stringify(em)}`);
    }
    if (evalJson.telemetry?.totalTokens !== 0 || evalJson.telemetry?.localRuleEvaluations !== 13) {
      errors.push(`Deterministic eval telemetry mismatch: totalTokens=${evalJson.telemetry?.totalTokens}, localRuleEvaluations=${evalJson.telemetry?.localRuleEvaluations}`);
    }
    if (typeof em.avgLatencyMs !== 'number' || em.avgLatencyMs <= 0 || em.avgLatencyMs >= 5) {
      errors.push(`Unexpected eval avgLatencyMs out of sub-5ms deterministic envelope: ${em.avgLatencyMs}`);
    }
    if (evalJson.generatedAt && evalJson.generatedAt !== metrics.generatedAt) {
      warnings.push(`Runtime eval rerun timestamp (${evalJson.generatedAt}) newer/different from locked (${metrics.generatedAt}); deterministic invariants passed.`);
    } else if (em.avgLatencyMs !== metrics.eval?.avgLatencyMs || em.p95LatencyMs !== metrics.eval?.p95LatencyMs) {
      warnings.push(`Sub-ms wall-clock jitter between locked (${metrics.eval?.avgLatencyMs}/${metrics.eval?.p95LatencyMs} ms) and live eval (${em.avgLatencyMs}/${em.p95LatencyMs} ms).`);
    }
  } catch {
    warnings.push('.cuex-runtime/eval-latest.json not found locally; skipped runtime timestamp diff.');
  }

  // 3. Scan owned files for deprecated stale tokens & PII / personal paths
  const scanDirs = [
    path.join(REPO_ROOT, 'docs', 'business'),
    path.join(REPO_ROOT, 'ppt', 'scripts'),
    path.join(REPO_ROOT, 'ppt', 'slides'),
    path.join(REPO_ROOT, 'deliverables', 'cuex-final'),
  ];
  const filesToScan = [];
  for (const dir of scanDirs) {
    try {
      filesToScan.push(...(await collectFiles(dir, ['.md', '.ts', '.tsx', '.mjs', '.json', '.html'])));
    } catch {
      // ignore absent dir
    }
  }

  for (const absPath of filesToScan) {
    const relPath = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    const content = await fs.readFile(absPath, 'utf8');

    const piiFindings = inspectPublicText(relPath, content);
    for (const f of piiFindings) {
      errors.push(`Public-data check failed at ${f.file}:${f.line} [${f.rule}]`);
    }

    if (relPath !== 'ppt/scripts/verify-metrics-sync.mjs') {
      for (const bad of DEPRECATED_TOKENS) {
        if (content.includes(bad)) {
          errors.push(`Deprecated token "${bad}" found in ${relPath}`);
        }
      }
      // Ensure avgLatencyMs / p95LatencyMs do not regress to old 0.69ms / 1.38ms summary values
      if (relPath !== '.cuex-runtime/eval-latest.json') {
        const lines = content.split(/\r?\n/);
        lines.forEach((line, idx) => {
          if (line.includes('1.38ms') || line.includes('1.38 ms') || line.includes('`1.38`')) {
            errors.push(`Stale 1.38 ms P95 reference in ${relPath}:${idx + 1}`);
          }
          if ((line.includes('0.69ms') || line.includes('0.69 ms')) && !line.includes('1.31 ms')) {
            errors.push(`Stale 0.69 ms avg latency summary in ${relPath}:${idx + 1}`);
          }
        });
      }
    }
  }

  // 4. Required exact metric assertions in key docs
  const s12 = metrics.sensitivities?.[11];
  const requiredContains = [
    {
      file: 'docs/business/UNIT_ECONOMICS.md',
      tokens: [`${metrics.eval.avgLatencyMs} ms`, `${metrics.eval.p95LatencyMs} ms`, '43,748', '46,357', '57.82', '0.098', '0.612', '9.37', '48.45', '83.8%', '80.2%', '92.2%', '87.3%', '339.15', '85 场', '66 场', '48.6%', '94.4%', '公司盈亏平衡点尚未测算', '**12**', '20–30', '30–50', '52.57', '15,399'],
    },
    {
      file: 'docs/business/BUSINESS_MODEL.md',
      tokens: [`${metrics.eval.avgLatencyMs} ms`, `${metrics.eval.p95LatencyMs} ms`, '0.612', '83.8%', '92.2%', '87.3%', '85 场', '20–30', '30–50', 'UsageLedger'],
    },
    {
      file: 'docs/business/GTM_PLAN.md',
      tokens: [`${metrics.eval.avgLatencyMs} ms`, 'Stage 12', 'activeFreeUsers', 'paidUsers', '20–30', '30–50', 'UsageLedger'],
    },
    {
      file: 'docs/business/PRICING_AND_PACKAGING.md',
      tokens: ['240 分钟', '120 分钟', '87.3%', '85 场', 'local_sherpa', '2026-11-16'],
    },
    {
      file: 'docs/business/CUSTOMER_VALIDATION.md',
      tokens: ['20–30', '30–50'],
    },
    {
      file: 'docs/business/ROADMAP.md',
      tokens: ['20–30', '30–50', 'UsageLedger'],
    },
    {
      file: 'deliverables/cuex-final/evidence/evaluation-results.md',
      tokens: [metrics.generatedAt, String(metrics.eval.avgLatencyMs), String(metrics.eval.p95LatencyMs), '83.8%', '80.2%', '92.2%', '87.3%', '43,748', '46,357', '85 场', '66 场', '52.57', '15,399'],
    },
    {
      file: 'deliverables/cuex-final/pitch/CueX-Pitch-Script.md',
      tokens: [String(metrics.eval.avgLatencyMs), '83.8%', '80.2%', '92.2%', '87.3%', '85 场', '66 场', '52.57', '15,399'],
    },
    {
      file: 'deliverables/cuex-final/business/CueX-Pitch-Script.md',
      tokens: [String(metrics.eval.avgLatencyMs), '83.8%', '80.2%', '92.2%', '87.3%', '85 场', '66 场', '52.57', '15,399'],
    },
    {
      file: 'deliverables/cuex-final/demo/CueX-Demo-Script.md',
      tokens: ['52.57', 'gemini-4-hydrogen', `${metrics.eval.avgLatencyMs} ms`],
    },
    {
      file: 'deliverables/cuex-final/mandatory/ai-employee-demo/demo-script.md',
      tokens: ['52.57', 'gemini-4-hydrogen'],
    },
    {
      file: 'deliverables/cuex-final/business/CueX-Unit-Economics.md',
      tokens: ['12 项', '83.8%', '80.2%', '46,357', '66 场'],
    },
    {
      file: 'deliverables/cuex-final/business/CueX-Business-Plan.md',
      tokens: [`${metrics.eval.avgLatencyMs} ms`, '52.57', '15,399', '80.2%'],
    },
    {
      file: 'deliverables/cuex-final/business/CueX-Competitive-Analysis.md',
      tokens: ['52.57', '80.2%', 'Poised AI'],
    },
  ];

  if (!s12 || s12.proDirectMarginPct !== 80.2) {
    errors.push(`Expected sensitivity #12 proDirectMarginPct=80.2, got ${s12?.proDirectMarginPct}`);
  }

  for (const check of requiredContains) {
    const abs = path.join(REPO_ROOT, check.file);
    let text = '';
    try {
      text = await fs.readFile(abs, 'utf8');
    } catch {
      errors.push(`Required document missing: ${check.file}`);
      continue;
    }
    for (const token of check.tokens) {
      if (!text.includes(token)) {
        errors.push(`Missing synced metric/clause "${token}" in ${check.file}`);
      }
    }
  }

  // 5. Strict PDF page counts & required binary asset checks (when built or requested)
  if (checkPdfs) {
    const pdfExpectations = [
      { rel: 'deliverables/cuex-final/pitch/CueX-BP.pdf', pages: 8 },
      { rel: 'deliverables/cuex-final/business/CueX-Business-Plan.pdf', pages: 8 },
      { rel: 'deliverables/cuex-final/business/CueX-AI-Employee-Job-Spec.pdf', pages: 1 },
      { rel: 'deliverables/cuex-final/business/CueX-Business-Model-Canvas.pdf', pages: 1 },
      { rel: 'deliverables/cuex-final/business/CueX-Unit-Economics.pdf', pages: 1 },
      { rel: 'deliverables/cuex-final/business/CueX-BMC-and-Unit-Economics.pdf', pages: 2 },
      { rel: 'deliverables/cuex-final/mandatory/business-model-canvas/CueX-Business-Model-Canvas.pdf', pages: 2 },
      { rel: 'deliverables/cuex-final/mandatory/ai-employee-job-spec/CueX-AI-Employee-Job-Specification.pdf', pages: 1 },
      { rel: 'deliverables/cuex-final/business/CueX-Competitive-Analysis.pdf', pages: 2 },
    ];
    for (const item of pdfExpectations) {
      const abs = path.join(REPO_ROOT, item.rel);
      try {
        const bytes = await fs.readFile(abs);
        const doc = await PDFDocument.load(bytes);
        if (doc.getPageCount() !== item.pages) {
          errors.push(`PDF page count mismatch for ${item.rel}: expected ${item.pages}, got ${doc.getPageCount()}`);
        }
      } catch (err) {
        errors.push(`PDF check failed for ${item.rel}: ${err.message}`);
      }
    }
    for (const reqImg of [
      'deliverables/cuex-final/assets/CueX-Cover.png',
      'deliverables/cuex-final/brand/CueX-Cover.png',
      'deliverables/cuex-final/demo/token-usage-proof.png',
      'deliverables/cuex-final/evidence/token-usage-proof.png',
    ]) {
      try {
        await fs.access(path.join(REPO_ROOT, reqImg));
      } catch {
        errors.push(`Required visual artifact missing: ${reqImg}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    scannedFiles: filesToScan.length,
    errors,
    warnings,
    metricsGeneratedAt: metrics.generatedAt,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const skipPdf = process.argv.includes('--skip-pdfs');
  runMetricsSyncCheck({ checkPdfs: !skipPdf })
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      if (!res.ok) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
