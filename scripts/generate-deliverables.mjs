#!/usr/bin/env node
/**
 * Top-level unified deliverables generator wrapper.
 * 1. Recomputes cuex-final-metrics.json from .cuex-runtime/eval-latest.json + Phase 3 telemetry
 * 2. Exports OpenSlide BP Deck, Cover, Sanitized Token Proof, Unit Economics, BMC, Job Spec & Competitive PDFs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

function runStep(cmd, args, cwd = REPO_ROOT) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env } });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

runStep('node', ['ppt/scripts/compute-unit-economics.mjs', '--write']);
runStep('node', ['ppt/scripts/build-cuex-final.mjs']);
