#!/usr/bin/env node
/**
 * Top-level metrics & deliverables sync verification entrypoint.
 * Delegates to ppt/scripts/verify-metrics-sync.mjs with PDF page checks enabled.
 */
import { runMetricsSyncCheck } from '../ppt/scripts/verify-metrics-sync.mjs';

const res = await runMetricsSyncCheck({ checkPdfs: true });
console.log(JSON.stringify(res, null, 2));
if (!res.ok) {
  process.exit(1);
}
