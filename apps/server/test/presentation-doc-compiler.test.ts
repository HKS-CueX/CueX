import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import {
  PresentationPackStore,
  compilePresentationPack,
  extractPresentationDocument,
} from '../src/scenarios';

function buildMinimalZip(files: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const rawBuf = Buffer.from(file.content, 'utf8');
    const compressed = deflateRawSync(rawBuf);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(rawBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    localParts.push(local, nameBuf, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(rawBuf.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    cdParts.push(cd, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const cdBuf = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, cdBuf, eocd]);
}

test('DocumentExtractor extracts .pptx slides, speaker notes, .md, and marks unreadable .pdf honestly', () => {
  const slide1Xml = `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree><p:sp><p:txBody>
        <a:p><a:r><a:t>第一页：架构概览</a:t></a:r></a:p>
        <a:p><a:r><a:t>延迟控制在 1460 ms 以内。</a:t></a:r></a:p>
      </p:txBody></p:sp></p:spTree></p:cSld>
    </p:sld>`;
  const notes1Xml = `<?xml version="1.0" encoding="UTF-8"?>
    <p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree><p:sp><p:txBody>
        <a:p><a:r><a:t>讲者备注：强调事件驱动不做每秒全量轮询。</a:t></a:r></a:p>
      </p:txBody></p:sp></p:spTree></p:cSld>
    </p:notes>`;
  const slide2Xml = `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree><p:sp><p:txBody>
        <a:p><a:r><a:t>第二页：净效用评估</a:t></a:r></a:p>
        <a:p><a:r><a:t>V = H - 2I，惩罚系数为 2。</a:t></a:r></a:p>
      </p:txBody></p:sp></p:spTree></p:cSld>
    </p:sld>`;

  const pptxBuf = buildMinimalZip([
    { name: 'ppt/slides/slide1.xml', content: slide1Xml },
    { name: 'ppt/notesSlides/notesSlide1.xml', content: notes1Xml },
    { name: 'ppt/slides/slide2.xml', content: slide2Xml },
  ]);

  const pptxRes = extractPresentationDocument({
    filename: 'deck.pptx',
    contentBase64: pptxBuf.toString('base64'),
  });
  assert.equal(pptxRes.fileType, 'pptx');
  assert.equal(pptxRes.unreadable, false);
  assert.equal(pptxRes.sections.length, 2);
  assert.match(pptxRes.sections[0].content, /1460 ms/);
  assert.match(pptxRes.sections[0].notes ?? '', /不做每秒全量轮询/);
  assert.match(pptxRes.sections[1].title, /净效用评估/);

  const mdRes = extractPresentationDocument({
    filename: 'notes.md',
    textContent: '# 开场问题\n现场演示需要低打扰。\n# 技术核心\n检索只引用已核验事实。',
  });
  assert.equal(mdRes.fileType, 'md');
  assert.equal(mdRes.sections.length, 2);
  assert.equal(mdRes.unreadable, false);

  const scannedPdfStub = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 5 >>\nstream\n\x00\x01\x02\nendstream\nendobj\n%%EOF', 'latin1');
  const pdfRes = extractPresentationDocument({
    filename: 'scan.pdf',
    contentBase64: scannedPdfStub.toString('base64'),
  });
  assert.equal(pdfRes.fileType, 'pdf');
  assert.equal(pdfRes.unreadable, true);
  assert.ok(pdfRes.warnings.length >= 1);
});

test('PresentationCompiler preserves grounded facts without fabricating numbers and PresentationPackStore enforces locks', () => {
  const compiled = compilePresentationPack({
    title: '端侧语音检索方案答辩',
    sceneType: 'defense',
    goal: '阐述低延迟端侧检索系统设计',
    audience: '毕业答辩委员会',
    targetDurationSec: 300,
    rawMaterials: [
      '## 研究背景',
      '传统检索方案端到端耗时为 480 ms，难以支撑实时汇报场景。',
      '## 核心设计',
      '本方案仅使用本地索引与已核验资料，不支持云端未经审核的实时联网生成。',
    ].join('\n'),
    keyFactsInput: ['测试集共包含 1200 条真实汇报问答语料。'],
  });

  assert.equal(compiled.scenarioId, 'presentation');
  assert.ok(compiled.cueSheet.chapters.length >= 2);
  assert.equal(
    compiled.cueSheet.chapters.reduce((sum, ch) => sum + ch.targetDurationSec, 0),
    300,
  );
  assert.ok(compiled.facts.some((f) => f.userConfirmed && f.text.includes('1200')));
  assert.ok(compiled.qaCards.every((q) => q.isPrediction === true));

  const dir = mkdtempSync(path.join(os.tmpdir(), 'cuex-packstore-'));
  try {
    const store = new PresentationPackStore(dir);
    store.save(compiled);

    const lockedFact = compiled.facts[0];
    assert.equal(lockedFact.locked, true);

    // Attempt to overwrite a locked fact without unlocking it -> store preserves locked text.
    const patched = store.patch(compiled.packId, {
      facts: compiled.facts.map((f, i) =>
        i === 0 ? { ...f, text: '被偷偷篡改的 99999 数据' } : f,
      ),
    });
    assert.ok(patched);
    assert.equal(patched.facts[0].text, lockedFact.text);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
