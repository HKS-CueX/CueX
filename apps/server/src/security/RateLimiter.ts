export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSec: number;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

/**
 * In-memory token-bucket rate limiter keyed by endpoint group + client/user identifier.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private readonly refillRatePerMs: number;

  constructor(
    private readonly capacityPerMinute: number,
    private readonly nowFn: () => number = () => Date.now(),
    private readonly maxBuckets = 10_000,
  ) {
    const safeCapacity = Math.max(1, capacityPerMinute);
    this.refillRatePerMs = safeCapacity / 60_000;
  }

  consume(key: string, cost = 1): RateLimitResult {
    const now = this.nowFn();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxBuckets) {
        const oldestKey = this.buckets.keys().next().value;
        if (oldestKey) this.buckets.delete(oldestKey);
      }
      bucket = { tokens: this.capacityPerMinute, lastRefillMs: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsed = Math.max(0, now - bucket.lastRefillMs);
      bucket.tokens = Math.min(this.capacityPerMinute, bucket.tokens + elapsed * this.refillRatePerMs);
      bucket.lastRefillMs = now;
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return {
        allowed: true,
        limit: this.capacityPerMinute,
        remaining: Math.floor(bucket.tokens),
        resetAtMs: now + Math.ceil((this.capacityPerMinute - bucket.tokens) / this.refillRatePerMs),
        retryAfterSec: 0,
      };
    }

    const deficit = cost - bucket.tokens;
    const waitMs = Math.ceil(deficit / this.refillRatePerMs);
    return {
      allowed: false,
      limit: this.capacityPerMinute,
      remaining: 0,
      resetAtMs: now + waitMs,
      retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)),
    };
  }
}
