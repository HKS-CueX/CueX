import { toUtcIso8601, type TelemetryLatencyStats, type UtcIso8601 } from '@cuex/protocol';

export function msToIso(ms: number): UtcIso8601 {
  return toUtcIso8601(ms);
}

export function isoToMs(value: UtcIso8601 | number | undefined, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (!value || typeof value !== 'string') return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function computeLatencyStats(samples: readonly number[]): TelemetryLatencyStats {
  if (samples.length === 0) {
    return { avgMs: 0, p95Ms: 0, maxMs: 0 };
  }
  let sum = 0;
  let maxMs = 0;
  const clean: number[] = [];
  for (const raw of samples) {
    const val = Math.max(0, Math.round(raw));
    clean.push(val);
    sum += val;
    if (val > maxMs) maxMs = val;
  }
  clean.sort((a, b) => a - b);
  const p95Index = Math.min(clean.length - 1, Math.max(0, Math.ceil(clean.length * 0.95) - 1));
  return {
    avgMs: Math.round(sum / clean.length),
    p95Ms: clean[p95Index],
    maxMs,
  };
}

/** 计算给定耗时样本列表的最近值、P50 与 P95（用于双系统延迟分位数统计）。 */
export function computeQuantiles(samples: readonly number[]): {
  lastMs: number;
  p50Ms: number;
  p95Ms: number;
} | null {
  if (samples.length === 0) return null;
  const clean = samples.map((raw) => Math.max(0, Math.round(raw)));
  const lastMs = clean[clean.length - 1];
  const sorted = [...clean].sort((a, b) => a - b);
  const p50Idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.5));
  const p95Idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return {
    lastMs,
    p50Ms: sorted[p50Idx],
    p95Ms: sorted[p95Idx],
  };
}
