/**
 * Unified API & Runtime Error Codes and Error Envelope Contract.
 */

import { nowUtcIso8601 } from '#src/versions';
import type { UtcIso8601 } from '#src/versions';

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'QUOTA_EXCEEDED',
  'SCHEMA_VERSION_UNSUPPORTED',
  'SESSION_EXPIRED',
  'ASR_UNAVAILABLE',
  'INSUFFICIENT_EVIDENCE',
  'COMPANION_READ_ONLY',
  'PRIMARY_MIC_CONFLICT',
  'PAYMENT_NOT_CONFIGURED',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_UNAVAILABLE: 503,
  QUOTA_EXCEEDED: 402,
  SCHEMA_VERSION_UNSUPPORTED: 422,
  SESSION_EXPIRED: 410,
  ASR_UNAVAILABLE: 503,
  INSUFFICIENT_EVIDENCE: 422,
  /** 演讲伴随窗（companion）尝试发送只读禁止的写入/控制指令。 */
  COMPANION_READ_ONLY: 403,
  /** 主控端（primary）与伴随窗或其他客户端发生麦克风采集权冲突。 */
  PRIMARY_MIC_CONFLICT: 409,
  PAYMENT_NOT_CONFIGURED: 501,
  INTERNAL_ERROR: 500,
};

export interface ApiErrorDetail {
  path: string;
  message: string;
  code?: string;
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    httpStatus: number;
    retryable: boolean;
    correlationId?: string;
    requestId?: string;
    timestamp: UtcIso8601;
    details?: ApiErrorDetail[];
  };
}

export function createApiErrorResponse(params: {
  code: ApiErrorCode;
  message: string;
  httpStatus?: number;
  retryable?: boolean;
  correlationId?: string;
  requestId?: string;
  timestamp?: UtcIso8601;
  details?: ApiErrorDetail[];
}): ApiErrorResponse {
  return {
    ok: false,
    error: {
      code: params.code,
      message: params.message,
      httpStatus: params.httpStatus ?? ERROR_HTTP_STATUS[params.code],
      retryable:
        params.retryable ??
        (params.code === 'RATE_LIMITED' ||
          params.code === 'PROVIDER_TIMEOUT' ||
          params.code === 'PROVIDER_UNAVAILABLE'),
      ...(params.correlationId !== undefined ? { correlationId: params.correlationId } : {}),
      ...(params.requestId !== undefined ? { requestId: params.requestId } : {}),
      timestamp: params.timestamp ?? nowUtcIso8601(),
      ...(params.details !== undefined ? { details: params.details } : {}),
    },
  };
}
