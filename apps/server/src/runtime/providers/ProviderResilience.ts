export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
}

export interface ExecuteResilienceOptions<T> {
  breakerKey: string;
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  operation: (attemptSignal: AbortSignal, attemptIndex: number) => Promise<T>;
}

export type ResilienceOutcome<T> =
  | {
      ok: true;
      value: T;
      attempts: number;
      retries: number;
      latencyMs: number;
    }
  | {
      ok: false;
      errorCode: 'PROVIDER_TIMEOUT' | 'PROVIDER_UNAVAILABLE';
      message: string;
      retryable: boolean;
      attempts: number;
      retries: number;
      latencyMs: number;
      circuitOpen: boolean;
    };

interface BreakerState {
  consecutiveFailures: number;
  openUntilMs: number;
}

function isAbortOrTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    /abort|timeout|timed out/i.test(err.message)
  );
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Bounded exponential-backoff retry, timeout AbortController, and circuit-breaker guard for external LLM/ASR calls.
 */
export class ProviderResilience {
  private readonly breakers = new Map<string, BreakerState>();
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(
    opts?: CircuitBreakerOptions,
    private readonly nowFn: () => number = () => Date.now(),
  ) {
    this.failureThreshold = opts?.failureThreshold ?? 3;
    this.cooldownMs = opts?.cooldownMs ?? 15_000;
  }

  getCircuitState(breakerKey: string): { isOpen: boolean; consecutiveFailures: number; openUntilMs: number } {
    const state = this.breakers.get(breakerKey);
    if (!state) return { isOpen: false, consecutiveFailures: 0, openUntilMs: 0 };
    return {
      isOpen: this.nowFn() < state.openUntilMs,
      consecutiveFailures: state.consecutiveFailures,
      openUntilMs: state.openUntilMs,
    };
  }

  resetCircuit(breakerKey: string): void {
    this.breakers.delete(breakerKey);
  }

  async execute<T>(opts: ExecuteResilienceOptions<T>): Promise<ResilienceOutcome<T>> {
    const start = performance.now();
    const state = this.breakers.get(opts.breakerKey) ?? { consecutiveFailures: 0, openUntilMs: 0 };
    this.breakers.set(opts.breakerKey, state);

    if (this.nowFn() < state.openUntilMs) {
      return {
        ok: false,
        errorCode: 'PROVIDER_UNAVAILABLE',
        message: `Circuit breaker open for ${opts.breakerKey}`,
        retryable: true,
        attempts: 0,
        retries: 0,
        latencyMs: 0,
        circuitOpen: true,
      };
    }

    const maxAttempts = Math.max(1, 1 + opts.maxRetries);
    const baseDelayMs = opts.baseDelayMs ?? 150;
    let lastError: unknown;
    let attempts = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (opts.signal?.aborted) {
        throw opts.signal.reason instanceof Error ? opts.signal.reason : new Error('Aborted');
      }
      attempts += 1;

      const timeoutCtrl = new AbortController();
      const timer = setTimeout(() => {
        timeoutCtrl.abort(new Error(`Provider call timed out after ${opts.timeoutMs}ms`));
      }, Math.max(50, opts.timeoutMs));

      const onExternalAbort = () => {
        timeoutCtrl.abort(opts.signal?.reason);
      };
      opts.signal?.addEventListener('abort', onExternalAbort, { once: true });

      try {
        const value = await opts.operation(timeoutCtrl.signal, attempt);
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onExternalAbort);
        state.consecutiveFailures = 0;
        state.openUntilMs = 0;
        return {
          ok: true,
          value,
          attempts,
          retries: Math.max(0, attempts - 1),
          latencyMs: Math.max(1, Math.round(performance.now() - start)),
        };
      } catch (error) {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onExternalAbort);
        if (opts.signal?.aborted) throw error;
        lastError = error;

        if ((error as { retryable?: boolean })?.retryable === false) {
          break;
        }

        if (attempt + 1 < maxAttempts) {
          const jitter = Math.floor(Math.random() * 40);
          const delayMs = baseDelayMs * 2 ** attempt + jitter;
          await sleepWithAbort(delayMs, opts.signal);
        }
      }
    }

    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= this.failureThreshold) {
      state.openUntilMs = this.nowFn() + this.cooldownMs;
    }

    const timedOut = isAbortOrTimeout(lastError);
    return {
      ok: false,
      errorCode: timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      message: lastError instanceof Error ? lastError.message : String(lastError),
      retryable: true,
      attempts,
      retries: Math.max(0, attempts - 1),
      latencyMs: Math.max(1, Math.round(performance.now() - start)),
      circuitOpen: this.nowFn() < state.openUntilMs,
    };
  }
}
