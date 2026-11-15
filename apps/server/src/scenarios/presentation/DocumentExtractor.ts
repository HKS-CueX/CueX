import path from 'node:path';
import { inflateRawSync, inflateSync } from 'node:zlib';
import type {
  ExtractedPresentationSection,
  PresentationExtractInput,
  PresentationExtractResult,
} from '@cuex/protocol';

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  // Locate End of Central Directory (PK\x05\x06) scanning backwards from file tail.
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Invalid .pptx ZIP archive: missing End of Central Directory record.');
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map<string, Buffer>();

  let ptr = cdOffset;
  for (let i = 0; i < totalEntries && ptr + 46 <= buffer.length; i++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);

    const fileName = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    ptr += 46 + nameLen + extraLen + commentLen;

    if (
      fileName.endsWith('/') ||
      localHeaderOffset + 30 > buffer.length ||
      buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50
    ) {
      continue;
    }

    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) continue;

    const slice = buffer.subarray(dataStart, dataEnd);
    if (method === 0) {
      entries.set(fileName, Buffer.from(slice));
    } else if (method === 8) {
      try {
        entries.set(fileName, inflateRawSync(slice));
      } catch {
        // Ignore corrupted individual asset entries rather than failing the whole deck.
      }
    }
  }

  return entries;
}

function extractDrawingMlParagraphs(xml: string): string[] {
  const paragraphs: string[] = [];
  const pBlocks = xml.match(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g) ?? [];
  for (const pBlock of pBlocks) {
    const runs = [...pBlock.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) =>
      decodeXmlEntities(m[1]),
    );
    const line = runs.join('').replace(/\s+/g, ' ').trim();
    if (line) paragraphs.push(line);
  }
  if (paragraphs.length === 0) {
    const fallback = [...xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)]
      .map((m) => decodeXmlEntities(m[1]).trim())
      .filter(Boolean);
    if (fallback.length > 0) paragraphs.push(fallback.join(' '));
  }
  return paragraphs;
}

function extractPptx(filename: string, buffer: Buffer): PresentationExtractResult {
  const warnings: string[] = [];
  let entries: Map<string, Buffer>;
  try {
    entries = readZipEntries(buffer);
  } catch (error) {
    return {
      filename,
      fileType: 'pptx',
      extractedText: '',
      sections: [],
      warnings: [
        `PPTX 解析失败：${error instanceof Error ? error.message : '无法读取 ZIP 容器'}。`,
      ],
      unreadable: true,
      characterCount: 0,
    };
  }

  const slideFiles = [...entries.keys()]
    .map((name) => {
      const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(name);
      return m ? { name, slideNum: Number(m[1]) } : undefined;
    })
    .filter((item): item is { name: string; slideNum: number } => Boolean(item))
    .sort((a, b) => a.slideNum - b.slideNum);

  if (slideFiles.length === 0) {
    return {
      filename,
      fileType: 'pptx',
      extractedText: '',
      sections: [],
      warnings: ['未在 PPTX 中找到 ppt/slides/slide*.xml 幻灯片节点。'],
      unreadable: true,
      characterCount: 0,
    };
  }

  const sections: ExtractedPresentationSection[] = [];
  for (const { name, slideNum } of slideFiles) {
    const xml = entries.get(name)?.toString('utf8') ?? '';
    const lines = extractDrawingMlParagraphs(xml);
    const title = lines[0] ?? `Slide ${slideNum}`;
    const bodyLines = lines.length > 1 ? lines.slice(1) : lines;

    // Resolve speaker notes via slide .rels first, falling back to index-matched notesSlide.
    let notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
    const relsBuf = entries.get(`ppt/slides/_rels/slide${slideNum}.xml.rels`);
    if (relsBuf) {
      const relsXml = relsBuf.toString('utf8');
      const relMatch = /Target=["']\.\.\/(notesSlides\/notesSlide\d+\.xml)["']/.exec(relsXml);
      if (relMatch) notesPath = `ppt/${relMatch[1]}`;
    }
    const notesXml = entries.get(notesPath)?.toString('utf8');
    let notesText: string | undefined;
    if (notesXml) {
      const noteLines = extractDrawingMlParagraphs(notesXml).filter(
        (line) => !/^\d+$/.test(line.trim()),
      );
      if (noteLines.length > 0) notesText = noteLines.join('\n');
    }

    sections.push({
      index: slideNum,
      title,
      content: bodyLines.join('\n'),
      ...(notesText ? { notes: notesText } : {}),
    });
  }

  const extractedText = sections
    .map((sec) =>
      [
        `## 第 ${sec.index} 页：${sec.title}`,
        sec.content,
        sec.notes ? `演讲备注：${sec.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');

  if (!extractedText.trim()) {
    warnings.push('PPTX 页面中未检测到可读文本（可能全部为图片占位），请补充演讲备注或 Markdown。');
  }

  return {
    filename,
    fileType: 'pptx',
    extractedText,
    sections,
    warnings,
    unreadable: !extractedText.trim(),
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
    // Capture literal strings inside TJ arrays or standalone (...) Tj operators.
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

function extractPdf(filename: string, buffer: Buffer): PresentationExtractResult {
  const warnings: string[] = [];
  const latin = buffer.toString('latin1');
  if (!latin.includes('%PDF-')) {
    return {
      filename,
      fileType: 'pdf',
      extractedText: '',
      sections: [],
      warnings: ['文件缺少 %PDF- 文件头，无法解析。'],
      unreadable: true,
      characterCount: 0,
    };
  }
  if (/\/Encrypt\b/.test(latin)) {
    return {
      filename,
      fileType: 'pdf',
      extractedText: '',
      sections: [],
      warnings: ['该 PDF 已加密，无法提取正文；请导出无密码 PDF、PPTX 或粘贴 Markdown。'],
      unreadable: true,
      characterCount: 0,
    };
  }

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < latin.length) {
    const streamIdx = latin.indexOf('stream', cursor);
    if (streamIdx < 0) break;
    const dictWindow = latin.slice(Math.max(0, streamIdx - 300), streamIdx);
    const lineEnd = latin[streamIdx + 6] === '\r' && latin[streamIdx + 7] === '\n'
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
        contentStr = inflateSync(rawBytes).toString('latin1');
      } catch {
        contentStr = '';
      }
    } else if (!/\/Image\b|\/DCTDecode\b|\/JPXDecode\b/.test(dictWindow)) {
      contentStr = rawBytes.toString('latin1');
    }

    if (contentStr && contentStr.includes('Tj') || contentStr.includes('TJ')) {
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
    return {
      filename,
      fileType: 'pdf',
      extractedText: '',
      sections: [],
      warnings,
      unreadable: true,
      characterCount: 0,
    };
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
): PresentationExtractResult {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return {
      filename,
      fileType,
      extractedText: '',
      sections: [],
      warnings: ['上传文件内容为空。'],
      unreadable: true,
      characterCount: 0,
    };
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
 * Never hallucinates unreadable content: marks scanned/unreadable PDFs honestly.
 */
export function extractPresentationDocument(
  input: PresentationExtractInput,
): PresentationExtractResult {
  const ext = path.extname(input.filename || '').toLowerCase();
  const decodedBuffer = input.contentBase64
    ? Buffer.from(input.contentBase64, 'base64')
    : undefined;

  if (ext === '.pptx') {
    if (!decodedBuffer || decodedBuffer.length === 0) {
      return {
        filename: input.filename,
        fileType: 'pptx',
        extractedText: '',
        sections: [],
        warnings: ['PPTX 解析需要二进制 base64 内容（contentBase64）。'],
        unreadable: true,
        characterCount: 0,
      };
    }
    return extractPptx(input.filename, decodedBuffer);
  }

  if (ext === '.pdf') {
    if (!decodedBuffer || decodedBuffer.length === 0) {
      return {
        filename: input.filename,
        fileType: 'pdf',
        extractedText: '',
        sections: [],
        warnings: ['PDF 解析需要二进制 base64 内容（contentBase64）。'],
        unreadable: true,
        characterCount: 0,
      };
    }
    return extractPdf(input.filename, decodedBuffer);
  }

  if (ext === '.md' || ext === '.markdown' || ext === '.txt' || input.textContent !== undefined) {
    const fileType = ext === '.md' || ext === '.markdown' ? 'md' : 'txt';
    const text = input.textContent ?? decodedBuffer?.toString('utf8') ?? '';
    return extractMarkdownOrText(input.filename, fileType, text);
  }

  if (decodedBuffer && decodedBuffer.subarray(0, 2).toString('latin1') === 'PK') {
    return extractPptx(input.filename, decodedBuffer);
  }
  if (decodedBuffer && decodedBuffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return extractPdf(input.filename, decodedBuffer);
  }

  return {
    filename: input.filename,
    fileType: 'unknown',
    extractedText: '',
    sections: [],
    warnings: [`暂不支持该文件扩展名 "${ext || '未知'}"，请上传 .pptx / .md / .txt 或 .pdf。`],
    unreadable: true,
    characterCount: 0,
  };
}
