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
