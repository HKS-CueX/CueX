import { createHash } from 'node:crypto';
import path from 'node:path';
import { inflateRawSync, inflateSync } from 'node:zlib';
import type {
  ExtractedPresentationSection,
  PresentationExtractInput,
  PresentationExtractResult,
} from '@cuex/protocol';

export interface ExtractDocumentOptions {
  maxUploadBytes?: number;
  maxZipEntries?: number;
  maxTotalUncompressedBytes?: number;
  maxCompressionRatio?: number;
  sourceDocumentId?: string;
}

const DEFAULT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const DEFAULT_MAX_ZIP_ENTRIES = 500;
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_ENTRY_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_COMPRESSION_RATIO = 100;

interface ZipCentralEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function rejectedResult(
  filename: string,
  fileType: PresentationExtractResult['fileType'],
  warning: string,
  meta: { sourceDocumentId?: string; contentHash?: string },
): PresentationExtractResult {
  return {
    filename,
    fileType,
    status: 'rejected',
    ...(meta.sourceDocumentId ? { sourceDocumentId: meta.sourceDocumentId } : {}),
    ...(meta.contentHash ? { contentHash: meta.contentHash } : {}),
    extractedText: '',
    sections: [],
    warnings: [warning],
    unreadable: true,
    characterCount: 0,
  };
}

function unreadableResult(
  filename: string,
  fileType: PresentationExtractResult['fileType'],
  warnings: string[],
  meta: { sourceDocumentId?: string; contentHash?: string },
): PresentationExtractResult {
  return {
    filename,
    fileType,
    status: 'unreadable',
    ...(meta.sourceDocumentId ? { sourceDocumentId: meta.sourceDocumentId } : {}),
    ...(meta.contentHash ? { contentHash: meta.contentHash } : {}),
    extractedText: '',
    sections: [],
    warnings,
    unreadable: true,
    characterCount: 0,
  };
}

function decodeXmlEntities(xml: string): string {
  return xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function hasUnsafeXmlEntityDecl(xml: string): boolean {
  return /<!(?:ENTITY|DOCTYPE)\b/i.test(xml);
}

function extractDrawingMlText(xml: string): { lines: string[]; title?: string } {
  const paragraphs = xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) ?? [];
  const lines: string[] = [];

  for (const para of paragraphs) {
    const runs = [...para.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) =>
      decodeXmlEntities(m[1]).trim(),
    );
    const joined = runs.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (joined) lines.push(joined);
  }

  return {
    lines,
    title: lines[0],
  };
}

function parseZipEntries(
  buffer: Buffer,
  limits: Required<Omit<ExtractDocumentOptions, 'sourceDocumentId'>>,
): { ok: true; entries: ZipCentralEntry[] } | { ok: false; error: string } {
  const minEocdOffset = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= minEocdOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    return { ok: false, error: '无效的 ZIP/PPTX 文件结构（缺少中央目录结束标记）。' };
  }

  const declaredCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (declaredCount > limits.maxZipEntries) {
    return {
      ok: false,
      error: `压缩包条目数 (${declaredCount}) 超过安全上限 (${limits.maxZipEntries})，已拒绝解析。`,
    };
  }
  if (centralDirOffset + centralDirSize > buffer.length) {
    return { ok: false, error: 'PPTX 中央目录偏移超出文件长度，文件可能已损坏。' };
  }

  const entries: ZipCentralEntry[] = [];
  let cursor = centralDirOffset;
  let totalUncompressed = 0;

  while (cursor + 46 <= centralDirOffset + centralDirSize) {
    if (entries.length >= limits.maxZipEntries) {
      return {
        ok: false,
        error: `压缩包条目数超过安全上限 (${limits.maxZipEntries})，已拒绝解析。`,
      };
    }
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');

    if (
      name.includes('\0') ||
      name.startsWith('/') ||
      name.startsWith('\\') ||
      name.split(/[\\/]/).includes('..')
    ) {
      return {
        ok: false,
        error: `压缩包包含非法路径条目 "${name}"，已触发安全拒绝。`,
      };
    }

    if (uncompressedSize > DEFAULT_MAX_ENTRY_BYTES) {
      return {
        ok: false,
        error: `PPTX 条目 "${name}" 解压声明体积过大（>${DEFAULT_MAX_ENTRY_BYTES} bytes），已拒绝解析。`,
      };
    }

    if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxCompressionRatio) {
      return {
        ok: false,
        error: `PPTX 条目 "${name}" 压缩比异常（疑似 ZIP 炸弹），已拒绝解析。`,
      };
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxTotalUncompressedBytes) {
      return {
        ok: false,
        error: `PPTX 解压总大小超过安全上限 (${limits.maxTotalUncompressedBytes} bytes)，已拒绝解析。`,
      };
    }

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor += 46 + nameLen + extraLen + commentLen;
  }

  return { ok: true, entries };
}

function readZipEntryBytes(buffer: Buffer, entry: ZipCentralEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`Invalid local ZIP header for ${entry.name}`);
  }
  const nameLen = buffer.readUInt16LE(offset + 26);
  const extraLen = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) {
    throw new Error(`Truncated ZIP entry payload for ${entry.name}`);
  }
  const compressed = buffer.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) {
    if (compressed.length > DEFAULT_MAX_ENTRY_BYTES) {
      throw new Error(`Entry ${entry.name} exceeds entry byte limit`);
    }
    return compressed;
  }
  if (entry.compressionMethod === 8) {
    const out = inflateRawSync(compressed, { maxOutputLength: DEFAULT_MAX_ENTRY_BYTES });
    if (
      compressed.length > 0 &&
      out.length / compressed.length > DEFAULT_MAX_COMPRESSION_RATIO &&
      out.length > 64 * 1024
    ) {
      throw new Error(`ZIP inflation ratio exceeded limit for ${entry.name}`);
    }
    return out;
  }
  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod}`);
}

function extractPptx(
  filename: string,
  buffer: Buffer,
  limits: Required<Omit<ExtractDocumentOptions, 'sourceDocumentId'>>,
  meta: { sourceDocumentId: string; contentHash: string },
): PresentationExtractResult {
  if (buffer.length < 4 || buffer.subarray(0, 4).toString('latin1') !== 'PK\x03\x04') {
    return rejectedResult(
      filename,
      'pptx',
      'PPTX 文件魔数校验失败（缺少 PK\\x03\\x04 ZIP 头），已拒绝解析。',
      meta,
    );
  }

  const parsed = parseZipEntries(buffer, limits);
  if (!parsed.ok) {
    return rejectedResult(filename, 'pptx', parsed.error, meta);
  }

  const slideEntries = parsed.entries
    .filter((e) => /^ppt\/slides\/slide(\d+)\.xml$/i.test(e.name))
    .sort((a, b) => {
      const nA = Number(/^ppt\/slides\/slide(\d+)\.xml$/i.exec(a.name)?.[1] ?? 0);
      const nB = Number(/^ppt\/slides\/slide(\d+)\.xml$/i.exec(b.name)?.[1] ?? 0);
      return nA - nB;
    });

  if (slideEntries.length === 0) {
    return unreadableResult(
      filename,
      'pptx',
      ['未在 PPTX 中检测到 ppt/slides/slide*.xml 幻灯片内容。'],
      meta,
    );
  }

  const notesMap = new Map<number, ZipCentralEntry>();
  for (const e of parsed.entries) {
    const match = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/i.exec(e.name);
    if (match) notesMap.set(Number(match[1]), e);
  }

  const sections: ExtractedPresentationSection[] = [];
  const warnings: string[] = [];
  let totalInflatedBytes = 0;

  for (const slide of slideEntries) {
    const slideNum = Number(/^ppt\/slides\/slide(\d+)\.xml$/i.exec(slide.name)?.[1] ?? sections.length + 1);
    let xmlBytes: Buffer;
    try {
      xmlBytes = readZipEntryBytes(buffer, slide);
    } catch (error) {
      return rejectedResult(
        filename,
        'pptx',
        `PPTX 解析安全拦截（${error instanceof Error ? error.message : 'invalid entry'}）。`,
        meta,
      );
    }

    totalInflatedBytes += xmlBytes.length;
    if (totalInflatedBytes > limits.maxTotalUncompressedBytes) {
      return rejectedResult(
        filename,
        'pptx',
        `PPTX 累计解压体积超过 ${limits.maxTotalUncompressedBytes} bytes，已中止。`,
        meta,
      );
    }

    const xml = xmlBytes.toString('utf8');
    if (hasUnsafeXmlEntityDecl(xml)) {
      return rejectedResult(
        filename,
        'pptx',
        `PPTX 幻灯片 ${slide.name} 含有禁用 XML DOCTYPE/ENTITY 声明，已触发安全拒绝。`,
        meta,
      );
    }

    const parsedSlide = extractDrawingMlText(xml);
    let notesText: string | undefined;
    const notesEntry = notesMap.get(slideNum);
    if (notesEntry) {
      try {
        const notesBytes = readZipEntryBytes(buffer, notesEntry);
        totalInflatedBytes += notesBytes.length;
        const notesXml = notesBytes.toString('utf8');
        if (hasUnsafeXmlEntityDecl(notesXml)) {
          return rejectedResult(
            filename,
            'pptx',
            `PPTX 备注 ${notesEntry.name} 含有禁用 XML DOCTYPE/ENTITY 声明，已触发安全拒绝。`,
            meta,
          );
        }
        const notesParsed = extractDrawingMlText(notesXml);
        if (notesParsed.lines.length > 0) {
          notesText = notesParsed.lines.join(' ');
        }
      } catch {
        warnings.push(`幻灯片第 ${slideNum} 页演讲者备注未完整读取。`);
      }
    }

    const content = parsedSlide.lines.join('\n').trim();
    if (content || notesText) {
      sections.push({
        index: slideNum,
        title: parsedSlide.title || `第 ${slideNum} 页`,
        content: content || notesText || '',
        ...(notesText ? { notes: notesText } : {}),
      });
    }
  }

  const extractedText = sections
    .map((s) => `## ${s.title}\n${s.content}${s.notes ? `\n[演讲备注] ${s.notes}` : ''}`)
    .join('\n\n')
    .trim();

  if (!extractedText) {
    warnings.push('PPTX 幻灯片中未发现可读文字（可能全部为纯图片内容）。');
    return unreadableResult(filename, 'pptx', warnings, meta);
  }

  return {
    filename,
    fileType: 'pptx',
    status: 'parsed',
    ...meta,
    extractedText,
    sections,
    warnings,
    unreadable: false,
    characterCount: extractedText.length,
  };
}

function decodePdfLiteral(raw: string): string {
  if (raw.startsWith('\xFE\xFF')) {
    const bytes = Buffer.from(raw, 'latin1');
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (code >= 0x20 && code !== 0x7f) out += String.fromCharCode(code);
    }
    return out;
  }
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = raw[++i];
    if (next === undefined) break;
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === 'b' || next === 'f') continue;
    else if (/[0-7]/.test(next)) {
      const oct = raw.slice(i, i + 3).match(/^[0-7]{1,3}/)?.[0] ?? next;
      i += oct.length - 1;
      out += String.fromCharCode(Number.parseInt(oct, 8));
    } else {
      out += next;
    }
  }
  return out;
}

function extractTextOperators(chunk: string): string[] {
  const pieces: string[] = [];
  const btBlocks = chunk.match(/BT[\s\S]*?ET/g) ?? [chunk];
  for (const block of btBlocks) {
    let i = 0;
    while (i < block.length) {
      if (block[i] === '(') {
        let depth = 1;
        let j = i + 1;
        while (j < block.length && depth > 0) {
          if (block[j] === '\\') {
            j += 2;
            continue;
          }
          if (block[j] === '(') depth += 1;
          else if (block[j] === ')') depth -= 1;
          j += 1;
        }
        const literal = block.slice(i + 1, j - 1);
        const tail = block.slice(j, j + 16);
        if (/^\s*(?:Tj|'|")/.test(tail) || /\[[\s\S]*\]\s*TJ/.test(block.slice(Math.max(0, i - 100), j + 100))) {
          const decoded = decodePdfLiteral(literal);
          if (decoded.trim()) pieces.push(decoded);
        }
        i = j;
      } else {
        i += 1;
      }
    }
  }
  return pieces;
}

function extractPdf(
  filename: string,
  buffer: Buffer,
  limits: Required<Omit<ExtractDocumentOptions, 'sourceDocumentId'>>,
  meta: { sourceDocumentId: string; contentHash: string },
): PresentationExtractResult {
  const warnings: string[] = [];
  const headerSlice = buffer.subarray(0, 1024).toString('latin1');
  if (!headerSlice.includes('%PDF-')) {
    return rejectedResult(
      filename,
      'pdf',
      'PDF 魔数校验失败（文件头部缺少 %PDF- 标识），已拒绝解析。',
      meta,
    );
  }

  const latin = buffer.toString('latin1');
  if (/\/Encrypt\b/.test(latin)) {
    return rejectedResult(
      filename,
      'pdf',
      '该 PDF 已加密（含 /Encrypt 字典），无法提取正文；请导出无密码 PDF、PPTX 或粘贴 Markdown。',
      meta,
    );
  }

  const chunks: string[] = [];
  let cursor = 0;
  let totalInflatedBytes = 0;

  while (cursor < latin.length) {
    const streamIdx = latin.indexOf('stream', cursor);
    if (streamIdx < 0) break;
    const dictWindow = latin.slice(Math.max(0, streamIdx - 300), streamIdx);
    const lineEnd =
      latin[streamIdx + 6] === '\r' && latin[streamIdx + 7] === '\n'
        ? streamIdx + 8
        : latin[streamIdx + 6] === '\n' || latin[streamIdx + 6] === '\r'
          ? streamIdx + 7
          : streamIdx + 6;
    const endStreamIdx = latin.indexOf('endstream', lineEnd);
    if (endStreamIdx < 0) break;

    const rawBytes = buffer.subarray(lineEnd, endStreamIdx);
    let contentStr = '';
    if (/\/FlateDecode\b/.test(dictWindow)) {
      try {
        const inflated = inflateSync(rawBytes, { maxOutputLength: DEFAULT_MAX_ENTRY_BYTES });
        totalInflatedBytes += inflated.length;
        if (totalInflatedBytes > limits.maxTotalUncompressedBytes) {
          return rejectedResult(
            filename,
            'pdf',
            `PDF 流解压总体积超过安全上限 (${limits.maxTotalUncompressedBytes} bytes)，已中止。`,
            meta,
          );
        }
        contentStr = inflated.toString('latin1');
      } catch {
        contentStr = '';
      }
    } else if (!/\/Image\b|\/DCTDecode\b|\/JPXDecode\b/.test(dictWindow)) {
      contentStr = rawBytes.toString('latin1');
    }

    if ((contentStr && contentStr.includes('Tj')) || contentStr.includes('TJ')) {
      chunks.push(...extractTextOperators(contentStr));
    }
    cursor = endStreamIdx + 9;
  }

  const joined = chunks
    .join(' ')
    .replace(/[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const readableChars = (joined.match(/[a-zA-Z0-9\u4e00-\u9fff]/g) ?? []).length;
  if (readableChars < 12) {
    warnings.push(
      '该 PDF 可能为扫描件、图片型幻灯片或采用自定义字体编码，纯服务端轻量提取未能获得可读文本。建议上传 .pptx / .md / .txt，或直接粘贴讲稿正文。',
    );
    return unreadableResult(filename, 'pdf', warnings, meta);
  }

  warnings.push('PDF 文本已通过最佳努力方式提取；若包含复杂多栏排版或公式图，建议核对后再生成白名单。');
  const sections: ExtractedPresentationSection[] = [
    {
      index: 1,
      title: filename.replace(/\.pdf$/i, ''),
      content: joined,
    },
  ];
  return {
    filename,
    fileType: 'pdf',
    status: 'parsed',
    ...meta,
    extractedText: joined,
    sections,
    warnings,
    unreadable: false,
    characterCount: joined.length,
  };
}

function extractMarkdownOrText(
  filename: string,
  fileType: 'md' | 'txt',
  text: string,
  meta: { sourceDocumentId: string; contentHash: string },
): PresentationExtractResult {
  if (text.includes('\0')) {
    return rejectedResult(
      filename,
      fileType,
      '文本文件包含非法空字节 (NUL)，疑似二进制文件伪装，已拒绝解析。',
      meta,
    );
  }

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return unreadableResult(filename, fileType, ['上传文件内容为空。'], meta);
  }

  const lines = normalized.split('\n');
  const sections: ExtractedPresentationSection[] = [];
  let currentTitle = filename.replace(/\.(?:md|markdown|txt)$/i, '') || 'Section 1';
  let currentBody: string[] = [];

  const flush = () => {
    const content = currentBody.join('\n').trim();
    if (content || sections.length > 0) {
      sections.push({
        index: sections.length + 1,
        title: currentTitle,
        content: content || currentTitle,
      });
    }
    currentBody = [];
  };

  for (const line of lines) {
    const heading = /^#{1,3}\s+(.+)$/.exec(line.trim());
    if (heading) {
      if (currentBody.length > 0 || sections.length > 0) flush();
      currentTitle = heading[1].trim();
    } else {
      currentBody.push(line);
    }
  }
  flush();

  return {
    filename,
    fileType,
    status: 'parsed',
    ...meta,
    extractedText: normalized,
    sections:
      sections.length > 0
        ? sections
        : [{ index: 1, title: currentTitle, content: normalized }],
    warnings: [],
    unreadable: false,
    characterCount: normalized.length,
  };
}

/**
 * Extracts structured presentation materials from `.md`, `.txt`, `.pptx`, or `.pdf`.
 * Enforces byte size limits, magic bytes, ZIP-bomb guards, XXE rejection, and honest unreadable status.
 */
export function extractPresentationDocument(
  input: PresentationExtractInput,
  opts: ExtractDocumentOptions = {},
): PresentationExtractResult {
  const limits = {
    maxUploadBytes: opts.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES,
    maxZipEntries: opts.maxZipEntries ?? DEFAULT_MAX_ZIP_ENTRIES,
    maxTotalUncompressedBytes: opts.maxTotalUncompressedBytes ?? DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES,
    maxCompressionRatio: opts.maxCompressionRatio ?? DEFAULT_MAX_COMPRESSION_RATIO,
  };

  const ext = path.extname(input.filename || '').toLowerCase();
  const decodedBuffer = input.contentBase64
    ? Buffer.from(input.contentBase64, 'base64')
    : undefined;
  const rawPayloadForHash =
    decodedBuffer ?? Buffer.from(input.textContent ?? '', 'utf8');
  const contentHash = sha256Hex(rawPayloadForHash);
  const meta = {
    sourceDocumentId: opts.sourceDocumentId ?? `doc_${contentHash.slice(0, 12)}`,
    contentHash,
  };

  if (rawPayloadForHash.byteLength > limits.maxUploadBytes) {
    const fileType =
      ext === '.pptx'
        ? 'pptx'
        : ext === '.pdf'
          ? 'pdf'
          : ext === '.md' || ext === '.markdown'
            ? 'md'
            : ext === '.txt'
              ? 'txt'
              : 'unknown';
    return rejectedResult(
      input.filename,
      fileType,
      `文件大小 (${rawPayloadForHash.byteLength} bytes) 超过最大限制 (${limits.maxUploadBytes} bytes)。`,
      meta,
    );
  }

  if (ext === '.pptx') {
    if (!decodedBuffer || decodedBuffer.length === 0) {
      return rejectedResult(
        input.filename,
        'pptx',
        'PPTX 解析需要二进制 base64 内容（contentBase64）。',
        meta,
      );
    }
    return extractPptx(input.filename, decodedBuffer, limits, meta);
  }

  if (ext === '.pdf') {
    if (!decodedBuffer || decodedBuffer.length === 0) {
      return rejectedResult(
        input.filename,
        'pdf',
        'PDF 解析需要二进制 base64 内容（contentBase64）。',
        meta,
      );
    }
    return extractPdf(input.filename, decodedBuffer, limits, meta);
  }

  if (ext === '.md' || ext === '.markdown' || ext === '.txt' || input.textContent !== undefined) {
    if (decodedBuffer && decodedBuffer.includes(0)) {
      return rejectedResult(
        input.filename,
        ext === '.md' || ext === '.markdown' ? 'md' : 'txt',
        '文件包含二进制 NUL 字节，非有效文本/Markdown 文件，已拒绝解析。',
        meta,
      );
    }
    const fileType = ext === '.md' || ext === '.markdown' ? 'md' : 'txt';
    const text = input.textContent ?? decodedBuffer?.toString('utf8') ?? '';
    return extractMarkdownOrText(input.filename, fileType, text, meta);
  }

  if (decodedBuffer && decodedBuffer.subarray(0, 4).toString('latin1') === 'PK\x03\x04') {
    return extractPptx(input.filename, decodedBuffer, limits, meta);
  }
  if (decodedBuffer && decodedBuffer.subarray(0, 1024).toString('latin1').includes('%PDF-')) {
    return extractPdf(input.filename, decodedBuffer, limits, meta);
  }

  return rejectedResult(
    input.filename,
    'unknown',
    `暂不支持该文件扩展名 "${ext || '未知'}"，请上传 .pptx / .md / .txt 或 .pdf。`,
    meta,
  );
}
