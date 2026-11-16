/**
 * Protocol & Schema Version Constants and Fundamental Time/Money Primitives.
 */

export const PROTOCOL_PACKAGE_VERSION = '2.1.0' as const;
export const API_VERSION = '2026-11' as const;
export const WS_PROTOCOL_VERSION = '2.0' as const;
export const PACK_SCHEMA_VERSION = 2 as const;
export const EVIDENCE_SCHEMA_VERSION = 2 as const;
export const MEMORY_SCHEMA_VERSION = 2 as const;
export const EVENT_ENVELOPE_VERSION = 1 as const;

/**
 * UTC ISO-8601 timestamp string (e.g. "2026-11-16T04:00:00.000Z").
 * Used for all wall-clock instants across persisted and protocol records.
 */
export type UtcIso8601 = string;

/**
 * Integer minor-unit monetary value in CNY Fen (1 CNY = 100 Fen).
 * Floating-point yuan values are prohibited in protocol/persistence models.
 */
export interface MoneyAmount {
  /** Safe integer >= 0 (or signed delta in refunds when explicitly documented). */
  amountFen: number;
  currency: 'CNY';
}

export function nowUtcIso8601(): UtcIso8601 {
  return new Date().toISOString();
}

export function createMoneyAmount(amountFen: number): MoneyAmount {
  if (!Number.isSafeInteger(amountFen)) {
    throw new RangeError(`MoneyAmount.amountFen must be a safe integer, got ${String(amountFen)}`);
  }
  return { amountFen, currency: 'CNY' };
}
