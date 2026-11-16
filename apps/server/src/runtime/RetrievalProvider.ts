import type { Candidate, Evidence } from '@cuex/protocol';
import { numbersIn } from '../system2/numbers';
import type { EmbeddingScorer, RetrievedEvidence, RetrievalProvider } from './types';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'and', 'or', 'in', 'on', 'for',
  'with', 'by', 'as', 'at', 'from', 'that', 'this', 'it', 'its', 'we', 'our', 'you', 'your',
  'can', 'could', 'will', 'would', 'should', 'what', 'how', 'why', 'when', 'where', 'which',
  'do', 'does', 'did', 'have', 'has', 'had', 'about', 'into', 'than',
  '的', '了', '在', '是', '我', '们', '我们', '你们', '他们', '这', '那', '这个', '那个',
  '和', '与', '及', '或', '对', '把', '被', '让', '给', '有', '没有', '没',
  '什么', '怎么', '如何', '为什么', '为何', '多少', '几', '哪些', '哪个', '是否', '能否', '可以',
  '请问', '一下', '情况', '问题', '说明', '解释', '介绍', '回答', '知道', '支持', '进行', '通过',
]);

/**
 * Bilingual CJK+Latin tokenizer producing normalized terms for BM25 and overlap checks.
 */
export function tokenizeBilingual(text: string): string[] {
  const clean = text.toLowerCase();
  const tokens: string[] = [];

  for (const latin of clean.match(/[a-z0-9][a-z0-9._-]{0,}/g) ?? []) {
    if (latin.length >= 2 && !STOP_WORDS.has(latin)) {
      tokens.push(latin);
    }
  }

  for (const num of numbersIn(text)) {
    tokens.push(`#num:${num}`);
  }

  for (const cjkRun of clean.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (cjkRun.length === 1) {
      if (!STOP_WORDS.has(cjkRun)) tokens.push(cjkRun);
      continue;
    }
    for (let i = 0; i < cjkRun.length - 1; i++) {
      const bigram = cjkRun.slice(i, i + 2);
      if (!STOP_WORDS.has(bigram)) {
        tokens.push(bigram);
      }
    }
    if (cjkRun.length >= 3 && cjkRun.length <= 6 && !STOP_WORDS.has(cjkRun)) {
      tokens.push(cjkRun);
    }
  }

  return tokens;
}

export function computeTermOverlap(queryText: string, docText: string): {
  ratio: number;
  matchedDistinct: number;
  matchedTerms: string[];
} {
  const qTerms = [...new Set(tokenizeBilingual(queryText))];
  if (qTerms.length === 0) return { ratio: 0, matchedDistinct: 0, matchedTerms: [] };
  const dSet = new Set(tokenizeBilingual(docText));
  const matchedTerms = qTerms.filter((t) => dSet.has(t));
  return {
    ratio: matchedTerms.length / qTerms.length,
    matchedDistinct: matchedTerms.length,
    matchedTerms,
  };
}

/**
 * Lexical + BM25 retrieval over verified Evidence[], with optional pluggable EmbeddingScorer fusion.
 */
export class LexicalBm25RetrievalProvider implements RetrievalProvider {
  private readonly embeddingScorer?: EmbeddingScorer;

  constructor(opts?: { embeddingScorer?: EmbeddingScorer }) {
    this.embeddingScorer = opts?.embeddingScorer;
  }

  async search(
    query: string,
    evidence: Evidence[],
    opts: { topK?: number; minScore?: number } = {},
  ): Promise<RetrievedEvidence[]> {
    const activeEvidence = evidence.filter((item) => item.verified && item.lifecycle === 'active');
    if (!query.trim() || activeEvidence.length === 0) return [];

    const queryTokens = [...new Set(tokenizeBilingual(query))];
    if (queryTokens.length === 0) return [];

    const docs = activeEvidence.map((item) => {
      const combined = [item.title ?? '', item.text, ...(item.tags ?? [])].join(' ');
      const tokens = tokenizeBilingual(combined);
      const tf = new Map<string, number>();
      for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
      return { item, combined: combined.toLowerCase(), tokens, tf };
    });

    const avgLen = Math.max(1, docs.reduce((sum, d) => sum + d.tokens.length, 0) / docs.length);
    const k1 = 1.5;
    const b = 0.75;
    const N = docs.length;

    const df = new Map<string, number>();
    for (const qTok of queryTokens) {
      let count = 0;
      for (const d of docs) {
        if (d.tf.has(qTok)) count += 1;
      }
      df.set(qTok, count);
    }

    const rawLexicalScores = docs.map((d) => {
      let score = 0;
      let matched = 0;
      for (const qTok of queryTokens) {
        const freq = d.tf.get(qTok) ?? 0;
        if (freq === 0) continue;
        matched += 1;
        const nDf = df.get(qTok) ?? 0;
        const idf = Math.log(1 + (N - nDf + 0.5) / (nDf + 0.5));
        const denom = freq + k1 * (1 - b + (b * d.tokens.length) / avgLen);
        score += idf * ((freq * (k1 + 1)) / denom);
      }

      // Bonus for exact tag or English technical term matches.
      const tags = d.item.tags ?? [];
      for (const tag of tags) {
        const tagLower = tag.toLowerCase();
        if (tagLower.length >= 2 && query.toLowerCase().includes(tagLower)) {
          score += 1.2;
          matched += 1;
        }
      }

      // Require at least 1 strong distinctive token (>= 3 chars ASCII/CJK or number) or >= 2 matched terms.
      const hasStrongMatch = queryTokens.some(
        (tok) => d.tf.has(tok) && (tok.startsWith('#num:') || /^[a-z0-9._-]{3,}$/.test(tok)),
      );
      if (matched < 2 && !hasStrongMatch) {
        score = 0;
      }
      return score;
    });

    const maxLex = Math.max(1e-6, ...rawLexicalScores);
    const normalizedLexical = rawLexicalScores.map((s) => (s > 0 ? Math.min(1, s / maxLex) : 0));

    let semanticScores: number[] | undefined;
    if (this.embeddingScorer) {
      semanticScores = await this.embeddingScorer.score(
        query,
        docs.map((d) => `${d.item.title ?? ''} ${d.item.text}`),
      );
    }

    const minScore = opts.minScore ?? 0.2;
    const topK = opts.topK ?? 4;

    const scored: RetrievedEvidence[] = docs.map((d, idx) => {
      const lexicalScore = normalizedLexical[idx];
      const semanticScore = Math.max(0, Math.min(1, semanticScores?.[idx] ?? 0));
      const score = semanticScores
        ? lexicalScore > 0
          ? 0.7 * lexicalScore + 0.3 * semanticScore
          : 0
        : lexicalScore;
      return {
        evidence: d.item,
        score: Number(score.toFixed(4)),
        lexicalScore: Number(lexicalScore.toFixed(4)),
        semanticScore: Number(semanticScore.toFixed(4)),
      };
    });

    return scored
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

export interface GroundingVerificationResult {
  ok: boolean;
  grounded: boolean;
  reason?: string;
  verifiedEvidenceIds: string[];
}

function stripStructuralTokens(text: string): string {
  return text
    .replace(/\bL[0-3]\b/g, ' ')
    .replace(/\bSystem\s*[12]\b/gi, ' ')
    .replace(/第\s*\d+\s*[章页节条点]/g, ' ');
}

/**
 * Enforces evidence grounding & forbidden-claim checks inside the Controller.
 * Prevents ungrounded or fabricated metrics from ever surfacing on screen.
 */
export function verifyCandidateGrounding(
  candidate: Candidate,
  evidenceMap: ReadonlyMap<string, Evidence>,
  forbiddenClaims: readonly string[] = [],
  allowedAuxiliaryNumbers: ReadonlySet<string> = new Set(),
): GroundingVerificationResult {
  const combinedText = [candidate.title, candidate.cueText, ...(candidate.bullets ?? [])]
    .join(' ')
    .toLowerCase();

  for (const forbidden of forbiddenClaims) {
    const cleanForbidden = forbidden.trim().toLowerCase();
    if (cleanForbidden && combinedText.includes(cleanForbidden)) {
      return {
        ok: false,
        grounded: false,
        reason: `Candidate violates forbidden claim boundary: "${forbidden}"`,
        verifiedEvidenceIds: [],
      };
    }
  }

  if (candidate.kind === 'missing_evidence_notice') {
    const claimNums = numbersIn(stripStructuralTokens([candidate.cueText, ...(candidate.bullets ?? [])].join(' ')));
    if (claimNums.length > 0) {
      return {
        ok: false,
        grounded: false,
        reason: `missing_evidence_notice must not state unverified numeric figures (${claimNums.join(', ')})`,
        verifiedEvidenceIds: [],
      };
    }
    return {
      ok: true,
      grounded: false,
      verifiedEvidenceIds: [],
    };
  }

  const verifiedCited: Evidence[] = [];
  for (const id of candidate.evidenceIds) {
    const item = evidenceMap.get(id);
    if (!item || !item.verified || item.lifecycle !== 'active') {
      return {
        ok: false,
        grounded: false,
        reason: `Cited evidence "${id}" is missing, unverified, or inactive`,
        verifiedEvidenceIds: [],
      };
    }
    verifiedCited.push(item);
  }

  if (candidate.kind === 'qa_grounding' && verifiedCited.length === 0) {
    return {
      ok: false,
      grounded: false,
      reason: 'Q&A candidate requires at least one verified active Evidence item',
      verifiedEvidenceIds: [],
    };
  }

  const evidenceNumbers = new Set<string>(allowedAuxiliaryNumbers);
  for (const ev of verifiedCited) {
    for (const num of numbersIn(`${ev.title ?? ''} ${ev.text}`)) {
      evidenceNumbers.add(num);
    }
  }

  const candidateNumbers = numbersIn(
    stripStructuralTokens([candidate.cueText, ...(candidate.bullets ?? [])].join(' ')),
  );

  // Structural pace/drift/omission nudges with 0 numbers are allowed even without numeric evidence;
  // any numeric figure in a candidate must match cited evidence or chapter pace constraints.
  if (candidateNumbers.length > 0) {
    const ungroundedNums = candidateNumbers.filter((n) => !evidenceNumbers.has(n));
    if (ungroundedNums.length > 0) {
      return {
        ok: false,
        grounded: false,
        reason: `Candidate contains ungrounded numeric figure(s): ${ungroundedNums.join(', ')}`,
        verifiedEvidenceIds: verifiedCited.map((e) => e.id),
      };
    }
  }

  const isGrounded =
    verifiedCited.length > 0 ||
    candidate.kind === 'pace_nudge' ||
    candidate.kind === 'drift_recovery' ||
    (candidate.kind === 'omission_cue' && candidateNumbers.length === 0) ||
    (candidate.kind === 'manual_scaffold' && candidateNumbers.length === 0);

  if (!isGrounded) {
    return {
      ok: false,
      grounded: false,
      reason: 'Candidate lacks verified evidence backing',
      verifiedEvidenceIds: [],
    };
  }

  return {
    ok: true,
    grounded: verifiedCited.length > 0 || Boolean(candidate.grounded),
    verifiedEvidenceIds: verifiedCited.map((e) => e.id),
  };
}
