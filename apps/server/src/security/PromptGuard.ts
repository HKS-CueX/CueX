/**
 * Prompt injection defense & delimiter sanitization for untrusted transcripts, slides, and audience Q&A.
 */

const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeUntrustedText(raw: string, maxChars = 4_000): string {
  const cleaned = raw
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(/<\/?untrusted_data\b[^>]*>/gi, '[escaped_tag]')
    .replace(/<\/?system\b[^>]*>/gi, '[escaped_tag]')
    .trim();
  return cleaned.length > maxChars ? cleaned.slice(0, maxChars) : cleaned;
}

export function wrapUntrustedPromptBlock(label: string, raw: string, maxChars = 4_000): string {
  const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeContent = sanitizeUntrustedText(raw, maxChars);
  return `<untrusted_data source="${safeLabel}">\n${safeContent}\n</untrusted_data>`;
}

/**
 * Extracts and validates the outermost JSON object from model output without throwing raw parser noise.
 */
export function extractJsonObjectSafely(rawText: string): Record<string, unknown> | undefined {
  const trimmed = rawText.trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return undefined;
  try {
    const parsed = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
