import { nowUtcIso8601 } from '@cuex/protocol';
import type { CuexEnvironment } from '../config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  requestId?: string;
  traceId?: string;
  sessionId?: string;
  userId?: string;
  eventType?: string;
  errorCode?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEY_PATTERN =
  /^(?:authorization|token|bearer|apiKey|api_key|secret|webhookSecret|password|signature|cookie|contentBase64|rawMaterials|data)$/i;

/**
 * Redacts credentials, Bearer headers, personal paths, raw audio buffers, and large untrusted document payloads.
 */
export function redactLogText(input: string): string {
  return input
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-|ghp_|github_pat_|cuex_tok_)[A-Za-z0-9._\-]{8,}/g, '[REDACTED_SECRET]');
}

export function redactLogValue(value: unknown, key?: string, depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED]';
  if (key && SENSITIVE_KEY_PATTERN.test(key)) {
    if (typeof value === 'string') {
      if (key === 'contentBase64' || key === 'data' || key === 'rawMaterials') {
        return `[REDACTED_${key.toUpperCase()} len=${value.length}]`;
      }
    }
    return '[REDACTED]';
  }
  if (typeof value === 'string') {
    const clean = redactLogText(value);
    return clean.length > 500 ? `${clean.slice(0, 200)}...[len=${clean.length}]` : clean;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactLogValue(item, undefined, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactLogValue(v, k, depth + 1);
    }
    return out;
  }
  return value;
}

export class StructuredLogger {
  constructor(
    private readonly service: string,
    private readonly environment: CuexEnvironment,
    private readonly sink: (line: string, level: LogLevel) => void = defaultLogSink,
  ) {}

  log(level: LogLevel, message: string, fields: LogFields = {}): void {
    const entry = {
      timestamp: nowUtcIso8601(),
      level,
      service: this.service,
      environment: this.environment,
      ...(fields.requestId ? { requestId: fields.requestId } : {}),
      ...(fields.traceId ? { traceId: fields.traceId } : {}),
      ...(fields.sessionId ? { sessionId: fields.sessionId } : {}),
      ...(fields.userId ? { userId: fields.userId } : {}),
      ...(fields.eventType ? { eventType: fields.eventType } : {}),
      ...(fields.errorCode ? { errorCode: fields.errorCode } : {}),
      message: redactLogText(message),
      ...Object.fromEntries(
        Object.entries(fields)
          .filter(
            ([k]) =>
              !['requestId', 'traceId', 'sessionId', 'userId', 'eventType', 'errorCode'].includes(k),
          )
          .map(([k, v]) => [k, redactLogValue(v, k)]),
      ),
    };
    this.sink(JSON.stringify(entry), level);
  }

  info(message: string, fields?: LogFields): void {
    this.log('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.log('warn', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.log('error', message, fields);
  }
}

function defaultLogSink(line: string, level: LogLevel): void {
  if (process.env.CUEX_LOG_SILENT === '1' || process.env.CUEX_TEST_OFFLINE === '1') {
    if (level !== 'error') return;
  }
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}
