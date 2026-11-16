import assert from 'node:assert/strict';
import test from 'node:test';
import type { Evidence } from '@cuex/protocol';
import {
  FallbackFastDecisionProvider,
  HeuristicFastDecisionProvider,
  LexicalBm25RetrievalProvider,
  LlamaFastDecisionProvider,
  msToIso,
} from '../src/runtime';
import { LlamaSystemOne } from '../src/system1';
import { SAMPLE_PRESENTATION_PACK } from '../src/scenarios';

test('LexicalBm25RetrievalProvider ranks bilingual evidence accurately and returns empty on unrelated query', async () => {
  const retrieval = new LexicalBm25RetrievalProvider();
  const ev = SAMPLE_PRESENTATION_PACK.evidence;

  const hits = await retrieval.search('净效用 V = H - λI 默认惩罚系数 λ 是多少？', ev);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].evidence.id, 'ev_sample_7');

  const ungrounded = await retrieval.search('明年出海市场推广预算和签约大客户数量是多少？', ev);
  assert.equal(ungrounded.length, 0);

  // Unverified or archived evidence must never be retrieved.
  const archivedOnly: Evidence[] = [
    { ...ev[0], id: 'ev_revoked', lifecycle: 'revoked' },
    { ...ev[1], id: 'ev_unverified', verified: false },
  ];
  const hidden = await retrieval.search('传统对话框 AI', archivedOnly);
  assert.equal(hidden.length, 0);
});

test('LexicalBm25RetrievalProvider supports pluggable EmbeddingScorer fusion', async () => {
  const retrieval = new LexicalBm25RetrievalProvider({
    embeddingScorer: {
      id: 'mock-embed',
      async score(_query, docs) {
        return docs.map((d) => (d.includes('自动撤回') ? 1 : 0.1));
      },
    },
  });
  const hits = await retrieval.search('Controller 怎么撤回提示', SAMPLE_PRESENTATION_PACK.evidence);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].evidence.id, 'ev_sample_4');
  assert.ok(hits[0].semanticScore > 0);
});

test('LlamaFastDecisionProvider calls generic completion API and falls back cleanly when offline', async () => {
  const jevClient = new LlamaSystemOne({
    baseUrl: 'http://127.0.0.1:18080',
    promptFormat: 'jev-v1',
    fetch: async () =>
      new Response(
        JSON.stringify({
          tokens_evaluated: 64,
          tokens_predicted: 1,
          tokens_cached: 0,
          completion_probabilities: [
            {
              top_probs: [
                { id: 3721, prob: 0.85 },
                { id: 1802, prob: 0.15 },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  });

  const llamaProvider = new LlamaFastDecisionProvider(jevClient);
  const verdict = await llamaProvider.evaluate({
    sessionId: 's_llama',
    scenarioId: 'presentation',
    contextVersion: 1,
    timestamp: msToIso(Date.now()),
    activeGoal: '演示双脑协同',
    expectedPoints: [{ id: 'p1', label: 'System 1 快速判别', covered: false }],
    recentSegments: [
      {
        segmentId: 'seg1',
        sessionId: 's_llama',
        speaker: 'presenter',
        text: '我们通过 System 1 快速判别实现低延迟响应。',
        delta: '我们通过 System 1 快速判别实现低延迟响应。',
        isFinal: true,
        confidence: 0.95,
        startMs: 0,
        endMs: 1000,
      },
    ],
    recentTextDigest: 'System 1 快速判别',
    silenceDurationMs: 0,
  });

  assert.equal(verdict.usage?.inputTokens, 128);
  assert.equal(verdict.usage?.outputTokens, 2);
  assert.equal(verdict.usage?.cachedInputTokens, 0);
  assert.equal(verdict.usage?.modelCalls, 2);
  assert.equal(verdict.usage?.usageSource, 'provider_reported');
  assert.equal(verdict.usage?.degraded, false);

  // Verify fallback when primary rejects (unreachable local server)
  const failingPrimary = new LlamaFastDecisionProvider(
    new LlamaSystemOne({
      baseUrl: 'http://127.0.0.1:18089',
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    }),
  );
  const fallbackWrapped = new FallbackFastDecisionProvider(
    failingPrimary,
    new HeuristicFastDecisionProvider(),
  );
  const fbVerdict = await fallbackWrapped.evaluate({
    sessionId: 's_fb',
    scenarioId: 'presentation',
    contextVersion: 1,
    timestamp: msToIso(Date.now()),
    activeGoal: '目标',
    expectedPoints: [],
    recentSegments: [],
    recentTextDigest: '',
    silenceDurationMs: 2_500,
  });

  assert.equal(fallbackWrapped.mode, 'local_fallback');
  assert.equal(fbVerdict.usage?.usageSource, 'local_rule_zero');
  assert.equal(fbVerdict.usage?.degraded, true);
  assert.equal(fbVerdict.usage?.inputTokens, 0);
  assert.equal(fbVerdict.usage?.modelCalls, 0);
  assert.equal(fbVerdict.recommendedLevel, 'L0');
});
