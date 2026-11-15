import { describe, expect, it } from 'vitest';
import { CuexApiError } from '../src/lib/api';
import {
  formatApiError,
  formatBytes,
  formatDateTime,
  formatMoneyFen,
  formatTime,
} from '../src/lib/format';
import { MAX_UPLOAD_BYTES, validatePresentationUploadFile } from '../src/lib/validation';

describe('validatePresentationUploadFile', () => {
  it('accepts supported formats within 15 MB limit', () => {
    expect(validatePresentationUploadFile({ name: 'slides.pptx', size: 1024 })).toEqual({
      ok: true,
      extension: '.pptx',
    });
    expect(validatePresentationUploadFile({ name: 'NOTES.MD', size: 512 })).toEqual({
      ok: true,
      extension: '.md',
    });
    expect(validatePresentationUploadFile({ name: 'paper.pdf', size: MAX_UPLOAD_BYTES })).toEqual({
      ok: true,
      extension: '.pdf',
    });
  });

  it('rejects unsupported file extensions before network upload', () => {
    const res = validatePresentationUploadFile({ name: 'payload.exe', size: 120 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('UNSUPPORTED_FILE_TYPE');
    }
  });

  it('rejects files larger than 15 MB', () => {
    const res = validatePresentationUploadFile({
      name: 'huge.pdf',
      size: MAX_UPLOAD_BYTES + 1,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('FILE_TOO_LARGE');
      expect(res.message).toContain('15 MB');
    }
  });
});

describe('formatters & ApiError formatting', () => {
  it('formats CNY minor-unit MoneyAmount cleanly', () => {
    expect(formatMoneyFen(0)).toBe('¥0.00');
    expect(formatMoneyFen(9900)).toBe('¥99.00');
    expect(formatMoneyFen({ currency: 'CNY', amountFen: 2990, formatted: '¥29.90' })).toBe(
      '¥29.90'
    );
    expect(formatMoneyFen(-105)).toBe('-¥1.05');
  });

  it('formats byte sizes and UTC ISO-8601 timestamps safely', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime('2026-11-16T04:00:00.000Z')).not.toBe('—');
    expect(formatTime('2026-11-16T04:00:00.000Z')).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('formats structured CuexApiError with code, retryable hint, and requestId', () => {
    const err = new CuexApiError({
      code: 'QUOTA_EXCEEDED',
      message: '本月免费场次已耗尽',
      httpStatus: 403,
      retryable: false,
      requestId: 'req-abc-123',
    });
    const formatted = formatApiError(err);
    expect(formatted).toContain('QUOTA_EXCEEDED');
    expect(formatted).toContain('本月免费场次已耗尽');
    expect(formatted).toContain('req-abc-123');
  });
});
