import { createHash } from 'node:crypto';
import {
  EVIDENCE_SCHEMA_VERSION,
  PACK_SCHEMA_VERSION,
  toUtcIso8601,
  type Evidence,
  type PresentationCompileInput,
  type PresentationContextPack,
  type PresentationCueSheetChapter,
  type PresentationFactItem,
  type PresentationProgressNode,
  type PresentationQACard,
} from '@cuex/protocol';
import { clampSpoken } from '../../system2/spoken';
import { SAMPLE_PRESENTATION_PACK } from './samplePack';

function splitSectionsFromRaw(raw: string): Array<{ title: string; body: string }> {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const sections: Array<{ title: string; body: string }> = [];
  let title = '';
  let body: string[] = [];

  const flush = () => {
    const content = body.join('\n').trim();
    if (title || content) {
      sections.push({
        title: title || `部分 ${sections.length + 1}`,
        body: content || title,
      });
    }
    body = [];
  };

  for (const line of lines) {
    const heading = /^#{1,3}\s+(.+)$/.exec(line.trim());
    if (heading) {
      flush();
      title = heading[1].trim();
    } else {
      body.push(line);
    }
  }
  flush();

  if (sections.length >= 2) return sections.slice(0, 6);

  const blocks = normalized
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length >= 2) {
    return blocks.slice(0, 6).map((block, idx) => {
      const firstLine = block.split('\n')[0].replace(/^[-*•\d.]+\s*/, '').trim();
      return {
        title: clampSpoken(firstLine, 24) || `章节 ${idx + 1}`,
        body: block,
      };
    });
  }

  const sentences = normalized
    .split(/(?<=[。！？!?；;])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 2) {
    return [{ title: '核心陈述与关键事实', body: normalized }];
  }
  const chunkSize = Math.ceil(sentences.length / 3);
  const grouped: Array<{ title: string; body: string }> = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    const slice = sentences.slice(i, i + chunkSize);
    grouped.push({
      title: clampSpoken(slice[0], 22),
      body: slice.join(' '),
    });
  }
  return grouped;
}

function splitCandidateFacts(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n+|(?<=[。！？!?；;])\s*/)
    .map((line) => line.replace(/^[-*•#>\d.]+\s*/, '').trim())
    .filter((line) => line.length >= 8 && !line.startsWith('演讲备注'));
}

function classifyFactCategory(text: string): PresentationFactItem['category'] {
  if (/\d+(?:\.\d+)?\s*(?:%|ms|秒|分钟|s|万|亿|元|人|倍|λ)/i.test(text)) return 'metric';
  if (/(?:不得|禁止|不|边界|仅|限制|必须|隐私|未覆盖)/.test(text)) return 'boundary';
  if (/(?:阶段|完成|里程碑|上线|发布|版本)/.test(text)) return 'milestone';
  if (/(?:定义|架构|包含|分为|采用)/.test(text)) return 'definition';
  return 'claim';
}

function extractKeywords(text: string): string[] {
  const words = new Set<string>();
  for (const w of text.match(/[A-Za-z0-9][A-Za-z0-9._-]{1,}/g) ?? []) {
    words.add(w);
  }
  for (const run of text.match(/[\u4e00-\u9fff]{2,6}/g) ?? []) {
    words.add(run);
  }
  return [...words].slice(0, 6);
}

function shortHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

export interface CompilePresentationOptions {
  existingPack?: PresentationContextPack;
  userId?: string;
  tenantId?: string;
}

/**
 * Compiles user documents, raw notes, and confirmed facts into a PresentationContextPack.
 * Strictly grounded: zero invented numbers; preserves any locked facts from existingPack on re-compile.
 */
export function compilePresentationPack(
  input: PresentationCompileInput,
  nowMs = Date.now(),
  opts: CompilePresentationOptions = {},
): PresentationContextPack {
  if (input.useSamplePack && !input.rawMaterials.trim() && !input.keyFactsInput?.length) {
    const cloned = structuredClone(SAMPLE_PRESENTATION_PACK);
    if (opts.userId) cloned.userId = opts.userId;
    if (opts.tenantId) cloned.tenantId = opts.tenantId;
    return cloned;
  }

  const warnings: string[] = [];
  const rawMaterials = input.rawMaterials?.trim() ?? '';
  const keyFacts = (input.keyFactsInput ?? []).map((s) => s.trim()).filter(Boolean);
  if (!rawMaterials && keyFacts.length === 0) {
    throw new Error('Compile requires non-empty rawMaterials or keyFactsInput unless useSamplePack=true.');
  }

  const sourceLabel = input.sourceFilenames?.length
    ? input.sourceFilenames.join(', ')
    : '用户提交汇报素材';
  const nowIso = toUtcIso8601(nowMs);
  const packId = input.packId?.trim() || `pack_${nowMs}`;

  const facts: PresentationFactItem[] = [];
  const evidence: Evidence[] = [];
  const seenTexts = new Set<string>();
  const usedFactIds = new Set<string>();
  const usedEvidenceIds = new Set<string>();

  // Preserve locked facts and their verified Evidence on re-compile.
  if (opts.existingPack) {
    const existingEvMap = new Map(opts.existingPack.evidence.map((e) => [e.id, e]));
    for (const lockedFact of opts.existingPack.facts.filter((f) => f.locked)) {
      const clean = lockedFact.text.trim();
      if (!clean || seenTexts.has(clean)) continue;
      seenTexts.add(clean);
      usedFactIds.add(lockedFact.id);
      usedEvidenceIds.add(lockedFact.evidenceId);
      facts.push({ ...lockedFact, locked: true, verified: true, userConfirmed: true });
      const prevEv = existingEvMap.get(lockedFact.evidenceId);
      if (prevEv) {
        evidence.push({ ...prevEv, locked: true, verified: true, userConfirmed: true, updatedAt: nowIso });
      } else {
        evidence.push({
          id: lockedFact.evidenceId,
          schemaVersion: EVIDENCE_SCHEMA_VERSION,
          title: clampSpoken(clean, 24),
          text: clean,
          source: lockedFact.source,
          sourceType: 'user_input',
          locationRef: lockedFact.source,
          contentHash: shortHash(clean),
          timestamp: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
          confidence: 1,
          scope: 'session',
          privacyLevel: 'session',
          userConfirmed: true,
          verified: true,
          lifecycle: 'active',
          locked: true,
          tags: extractKeywords(clean),
        });
      }
    }
    if (facts.length > 0) {
      warnings.push(`已保留 ${facts.length} 条既有锁定事实，未被重新编译覆盖。`);
    }
  }

  let seq = 0;
  const allocFactId = (): string => {
    do {
      seq += 1;
    } while (usedFactIds.has(`fact_${seq}`));
    const id = `fact_${seq}`;
    usedFactIds.add(id);
    return id;
  };
  const allocEvidenceId = (): string => {
    let idx = seq;
    while (usedEvidenceIds.has(`ev_${idx}`)) idx += 1;
    const id = `ev_${idx}`;
    usedEvidenceIds.add(id);
    return id;
  };

  const addFactAndEvidence = (
    text: string,
    source: string,
    userConfirmed: boolean,
    sourceType: Evidence['sourceType'],
  ) => {
    const clean = text.trim();
    if (!clean || seenTexts.has(clean)) return;
    seenTexts.add(clean);

    const factId = allocFactId();
    const evidenceId = allocEvidenceId();
    const category = classifyFactCategory(clean);

    facts.push({
      id: factId,
      text: clean,
      category,
      source,
      userConfirmed,
      locked: userConfirmed,
      verified: true,
      evidenceId,
    });
    evidence.push({
      id: evidenceId,
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      title: clampSpoken(clean, 24),
      text: clean,
      source,
      sourceType,
      locationRef: source,
      contentHash: shortHash(clean),
      timestamp: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      confidence: userConfirmed ? 1 : 0.9,
      scope: 'session',
      privacyLevel: 'session',
      userConfirmed,
      verified: true,
      lifecycle: 'active',
      locked: userConfirmed,
      tags: extractKeywords(clean),
    });
  };

  for (const kf of keyFacts) {
    addFactAndEvidence(kf, '用户显式确认核心事实', true, 'user_input');
  }

  const parsedSections = splitSectionsFromRaw(rawMaterials);
  for (const line of splitCandidateFacts(rawMaterials)) {
    const hasNumberOrBoundary =
      /\d/.test(line) ||
      /(?:架构|核心|方案|指标|对比|局限|边界|结论|隐私|延迟|精度)/.test(line);
    if (hasNumberOrBoundary || facts.length < 6) {
      addFactAndEvidence(line, sourceLabel, false, 'compiler_extracted');
    }
    if (facts.length >= 16) break;
  }

  if (facts.length === 0 && rawMaterials) {
    addFactAndEvidence(clampSpoken(rawMaterials, 120), sourceLabel, false, 'compiler_extracted');
  }

  const effectiveSections =
    parsedSections.length > 0
      ? parsedSections
      : [{ title: input.title || '主题陈述', body: keyFacts.join('\n') || rawMaterials }];

  const totalDur = Math.max(60, input.targetDurationSec || 300);
  const baseSec = Math.floor(totalDur / effectiveSections.length);
  const remainderSec = totalDur - baseSec * effectiveSections.length;

  const cueChapters: PresentationCueSheetChapter[] = [];
  const progressNodes: PresentationProgressNode[] = [];

  effectiveSections.forEach((sec, idx) => {
    const chapterId = `ch_${idx + 1}`;
    const secDuration = baseSec + (idx === 0 ? remainderSec : 0);
    const secStatements = splitCandidateFacts(sec.body);

    const matchingFacts = facts.filter((f) => {
      const kws = extractKeywords(f.text);
      return kws.some((kw) => sec.body.includes(kw) || sec.title.includes(kw));
    });
    const attachedFacts = (matchingFacts.length > 0 ? matchingFacts : facts.slice(idx, idx + 2)).slice(0, 3);

    const keyPoints = (
      secStatements.length > 0
        ? secStatements.slice(0, 3).map((stmt, kIdx) => ({
            id: `kp_${idx + 1}_${kIdx + 1}`,
            label: clampSpoken(stmt, 34),
            covered: false,
            ...(attachedFacts[kIdx] ? { evidenceId: attachedFacts[kIdx].evidenceId } : {}),
          }))
        : attachedFacts.map((f, kIdx) => ({
            id: `kp_${idx + 1}_${kIdx + 1}`,
            label: clampSpoken(f.text, 34),
            covered: false,
            evidenceId: f.evidenceId,
          }))
    );

    if (keyPoints.length === 0) {
      keyPoints.push({
        id: `kp_${idx + 1}_1`,
        label: clampSpoken(sec.title, 34),
        covered: false,
      });
    }

    cueChapters.push({
      chapterId,
      title: sec.title,
      targetDurationSec: secDuration,
      coreMessage: clampSpoken(secStatements[0] ?? sec.body, 56),
      transitionCue:
        idx < effectiveSections.length - 1
          ? `过渡到下一章「${effectiveSections[idx + 1].title}」`
          : '收束核心论点并开启 Q&A 环节',
      mustMentionFactIds: attachedFacts.map((f) => f.id),
    });

    progressNodes.push({
      chapterId,
      order: idx + 1,
      title: sec.title,
      targetDurationSec: secDuration,
      actualDurationSec: 0,
      status: idx === 0 ? 'active' : 'upcoming',
      keyPoints,
    });
  });

  const qaCards: PresentationQACard[] = [];
  const unpreparedGaps: string[] = [];

  for (const fact of facts.filter((f) => f.category === 'metric' || f.category === 'definition').slice(0, 3)) {
    qaCards.push({
      id: `qa_${qaCards.length + 1}`,
      question: `关于「${clampSpoken(fact.text, 22)}」，如何向评委验证具体依据与边界？`,
      rationale: '针对讲稿中核心数据或架构论点的常见细节追问。',
      suggestedAnswer: `依据资料（${fact.source}）：${fact.text}`,
      keywords: extractKeywords(fact.text),
      evidenceIds: [fact.evidenceId],
      isPrediction: true,
      prepared: true,
    });
  }

  const gapChecks: Array<{
    topic: string;
    regex: RegExp;
    question: string;
    gapText: string;
  }> = [
    {
      topic: '量化效果或基线指标',
      regex: /\d+(?:\.\d+)?\s*(?:%|ms|秒|分钟|倍)/,
      question: '相比现有基线方案，你的量化提升或关键指标具体是多少？',
      gapText: '当前上传材料缺少清晰的量化基准数字，建议补充已核验指标后再进场。',
    },
    {
      topic: '局限性与失败边界',
      regex: /(?:局限|边界|不支持|缺陷|风险|依赖|限制|无法)/,
      question: '这套方案在什么边界条件下会失效或能力降级？',
      gapText: '材料尚未明确写出系统限制与失效边界，遇到深度追问时容易陷入被动。',
    },
    {
      topic: '隐私与合规边界',
      regex: /(?:隐私|脱敏|权限|本地|删除|擦除|合规|安全)/,
      question: '涉及用户发言或私有文档数据时，如何保障隐私与删除权？',
      gapText: '尚未在事实白名单中补充数据留存与隐私删除边界说明。',
    },
  ];

  const allCorpus = `${rawMaterials}\n${keyFacts.join('\n')}`;
  for (const check of gapChecks) {
    if (!check.regex.test(allCorpus)) {
      unpreparedGaps.push(check.gapText);
      qaCards.push({
        id: `qa_${qaCards.length + 1}`,
        question: check.question,
        rationale: `常见答辩维度「${check.topic}」未在原文中发现对应证据。`,
        suggestedAnswer: '当前资料中未收录该维度实测依据；建议场前补充事实，或现场如实说明现状边界。',
        keywords: [check.topic, ...extractKeywords(check.question)],
        evidenceIds: [],
        isPrediction: true,
        prepared: false,
        gapNote: check.gapText,
      });
    }
  }

  if (facts.some((f) => !f.userConfirmed)) {
    warnings.push(
      '部分事实条目由编译器自动抽取（userConfirmed=false），建议在准备台核对并锁定关键数字。',
    );
  }

  return {
    packId,
    schemaVersion: PACK_SCHEMA_VERSION,
    ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
    ...(opts.userId ? { userId: opts.userId } : {}),
    scenarioId: 'presentation',
    title: input.title.trim(),
    sceneType: input.sceneType,
    goal: input.goal.trim(),
    audience: input.audience?.trim() || '评委与听众',
    targetDurationSec: totalDur,
    cueSheet: {
      title: input.title.trim(),
      sceneType: input.sceneType,
      oneLineThesis: clampSpoken(input.goal.trim(), 70),
      audienceHook: cueChapters[0]?.coreMessage ?? clampSpoken(rawMaterials, 60),
      targetDurationSec: totalDur,
      chapters: cueChapters,
      closingCallToAction: `围绕「${clampSpoken(input.goal.trim(), 32)}」收尾并承接现场问答。`,
      forbiddenClaims: [...(input.forbiddenClaims ?? [])],
    },
    facts,
    qaCards,
    unpreparedGaps,
    progressNodes,
    evidence,
    forbiddenClaims: [...(input.forbiddenClaims ?? [])],
    compiledBy: 'local_compiler',
    warnings,
    isSample: false,
    createdAt: opts.existingPack?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
}
