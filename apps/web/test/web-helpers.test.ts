import { describe, expect, it } from 'vitest';
import { CueXWSClient } from '../src/core/driver/CueXWSClient';
import { CuexApiError } from '../src/lib/api';
import {
  API_ERROR_LABELS,
  ASR_MODE_LABELS,
  COLAB_ASR_LIFECYCLE_LABELS,
  S1_PROVIDER_KIND_LABELS,
  SYSTEM2_GUIDANCE_BIAS_LABELS,
  USAGE_SOURCE_LABELS,
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

  it('covers protocol v2.1.0 Colab GPU ASR and unreported telemetry labels cleanly', () => {
    expect(ASR_MODE_LABELS.colab_gpu).toContain('Colab GPU');
    expect(USAGE_SOURCE_LABELS.provider_unreported).toContain('未回传');
    expect(COLAB_ASR_LIFECYCLE_LABELS.ready).toContain('就绪');
    expect(COLAB_ASR_LIFECYCLE_LABELS.disconnected).toContain('断开');
    expect(API_ERROR_LABELS.COMPANION_READ_ONLY).toContain('伴随窗');
    expect(API_ERROR_LABELS.PRIMARY_MIC_CONFLICT).toContain('主控端');
    expect(SYSTEM2_GUIDANCE_BIAS_LABELS.qa_grounding).toContain('问答');
    expect(S1_PROVIDER_KIND_LABELS.colab_jev).toContain('JEV');
  });

  it('passes sessionId, lastSeenSeq, and role=companion on initial WS handshake and supports session.attach', () => {
    const prevWindow = (globalThis as { window?: unknown }).window;
    const prevWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
    const openedUrls: string[] = [];
    const sentFrames: string[] = [];

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = MockWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: ((ev: { code?: number }) => void) | null = null;
      constructor(url: string) {
        openedUrls.push(url);
      }
      send(data: string) {
        sentFrames.push(data);
      }
      close() {
        this.readyState = MockWebSocket.CLOSED;
      }
    }

    (globalThis as { window?: unknown }).window = {
      location: { protocol: 'http:', host: '127.0.0.1:4173', href: 'http://127.0.0.1:4173/?view=companion' },
      addEventListener: () => {},
      removeEventListener: () => {},
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    };
    (globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket;

    try {
      const client = new CueXWSClient({
        onStatusChange: () => {},
        onMessage: () => {},
        onError: () => {},
      });
      client.connect({
        token: 'tok-abc',
        sessionId: 'sess-comp-1',
        lastSeenSeq: 12,
        role: 'companion',
      });

      expect(openedUrls).toHaveLength(1);
      const parsed = new URL(openedUrls[0]);
      expect(parsed.searchParams.get('sessionId')).toBe('sess-comp-1');
      expect(parsed.searchParams.get('lastSeenSeq')).toBe('12');
      expect(parsed.searchParams.get('role')).toBe('companion');
      expect(parsed.searchParams.get('token')).toBe('tok-abc');

      const sent = client.attachSession('sess-comp-1', 'companion', 12);
      expect(sent).toBe(true);
      expect(sentFrames).toHaveLength(1);
      const attachMsg = JSON.parse(sentFrames[0]) as { type: string; payload: { role?: string; sessionId: string } };
      expect(attachMsg.type).toBe('session.attach');
      expect(attachMsg.payload.sessionId).toBe('sess-comp-1');
      expect(attachMsg.payload.role).toBe('companion');

      client.disconnect();
    } finally {
      (globalThis as { window?: unknown }).window = prevWindow;
      (globalThis as { WebSocket?: unknown }).WebSocket = prevWebSocket;
    }
  });
});
