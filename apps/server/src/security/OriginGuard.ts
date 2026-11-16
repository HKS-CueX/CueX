import type { IncomingMessage, ServerResponse } from 'node:http';

export interface OriginCheckResult {
  allowed: boolean;
  allowOriginHeader?: string;
}

/**
 * Validates HTTP & WebSocket Origin headers against CUEX_ALLOWED_ORIGINS.
 */
export class OriginGuard {
  private readonly allowedOrigins: string[];
  private readonly allowAll: boolean;

  constructor(allowedOrigins: string[], private readonly env: string = 'development') {
    this.allowedOrigins = allowedOrigins.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
    this.allowAll = this.env !== 'production' && this.allowedOrigins.includes('*');
  }

  evaluate(originHeader: string | string[] | undefined): OriginCheckResult {
    const raw = (Array.isArray(originHeader) ? originHeader[0] : originHeader)?.trim();
    if (!raw) {
      // Non-browser HTTP/CLI/test requests omit Origin; allow without wildcard ACAO unless explicitly matched.
      return { allowed: true };
    }
    const normalized = raw.replace(/\/+$/, '');
    if (this.allowAll) {
      return { allowed: true, allowOriginHeader: normalized };
    }
    if (this.allowedOrigins.includes(normalized)) {
      return { allowed: true, allowOriginHeader: normalized };
    }
    return { allowed: false };
  }

  applyCorsHeaders(req: IncomingMessage, res: ServerResponse): OriginCheckResult {
    const result = this.evaluate(req.headers.origin);
    if (result.allowed && result.allowOriginHeader) {
      res.setHeader('Access-Control-Allow-Origin', result.allowOriginHeader);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Correlation-Id, Idempotency-Key',
      );
      res.setHeader('Access-Control-Expose-Headers', 'X-Correlation-Id, Retry-After');
    }
    return result;
  }
}
