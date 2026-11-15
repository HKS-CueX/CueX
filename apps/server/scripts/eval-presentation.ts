import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMoneyAmount,
  type ControllerDecision,
  type ServerMessage,
  type TelemetryUsage,
  type TelemetryUsageSource,
} from '@cuex/protocol';
import { loadServerConfig } from '../src/config';
import {
  CognitiveRuntimeSession,
  InterventionController,
  LexicalBm25RetrievalProvider,
  ManualClock,
  MemoryStore,
  createFastDecisionProvider,
  createSlowReasoningProvider,
  msToIso,
} from '../src/runtime';
import {
  PresentationRuntimePlugin,
  SAMPLE_PRESENTATION_PACK,
  toUniversalContextPack,
} from '../src/scenarios';

interface EvalCaseOutcome {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
  shownCount: number;
  helpfulShownCount: number;
  falseIntervention: boolean;
  withdrawalsExpected: number;
  withdrawalsMatched: number;
  suppressedCount: number;
  latencySamplesMs: number[];
  netUtilityV: number;
}

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SERVER_DIR, '..', '..');

async function main() {
  const config = loadServerConfig();
  const runtimeOutDir = path.resolve(config.runtimeDir || path.join(REPO_ROOT, '.cuex-runtime'));
  mkdirSync(runtimeOutDir, { recursive: true });

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cuex-eval-'));
  try {
    const memoryStore = new MemoryStore(path.join(tmpDir, 'memory'));
    const fastDecision = createFastDecisionProvider(config.system1Mode);
    const slowReasoning = createSlowReasoningProvider(config.system2Mode, {
      candidateTtlMs: 12_000,
    });
    const retrieval = new LexicalBm25RetrievalProvider();

    const makeSession = (id: string, clock: ManualClock, ceiling: 'L0' | 'L1' | 'L2' | 'L3' = 'L2') => {
      const emitted: ServerMessage[] = [];
      const pack = structuredClone(SAMPLE_PRESENTATION_PACK);
      const plugin = new PresentationRuntimePlugin({
        sessionId: id,
        mode: 'live',
        viewMode: 'focus',
        pack,
        startedAt: clock.now(),
      });
      const runtime = new CognitiveRuntimeSession({
        sessionId: id,
        mode: 'live',
        viewMode: 'focus',
        silentMode: false,
        maxInterventionLevel: ceiling,
        privacyNoticeAccepted: true,
        contextPack: toUniversalContextPack(pack),
        goal: pack.goal,
        audience: pack.audience,
        targetDurationSec: pack.targetDurationSec,
        constraints: pack.cueSheet.chapters.map((c) => c.coreMessage),
        forbiddenClaims: pack.forbiddenClaims,
        initialChapterId: pack.progressNodes[0].chapterId,
        initialChapterTitle: pack.progressNodes[0].title,
        asrStatus: {
          backend: 'text-only',
          mode: 'text_simulation',
          available: true,
          streaming: false,
          detail: 'Deterministic offline benchmark session',
        },
        plugin,
        fastDecision,
        slowReasoning,
        retrieval,
        controller: new InterventionController({
          cooldownMs: 15_000,
          candidateTtlMs: 12_000,
          dismissSuppressionMs: 45_000,
        }),
        memoryStore,
        clock,
        emitMessage: (msg) => emitted.push(msg),
      });
      return { runtime, plugin, emitted };
    };

    const outcomes: EvalCaseOutcome[] = [];
    const observedSources = new Set<TelemetryUsageSource>();
    const aggregateTelemetry = {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
      modelCalls: 0,
      retries: 0,
      localRuleEvaluations: 0,
      costFen: 0,
      degradedSessions: 0,
    };

    const accumulateTelemetry = (t: TelemetryUsage) => {
      observedSources.add(t.usageSource);
      aggregateTelemetry.inputTokens += t.inputTokens;
      aggregateTelemetry.outputTokens += t.outputTokens;
      aggregateTelemetry.cachedInputTokens += t.cachedInputTokens;
      aggregateTelemetry.totalTokens += t.totalTokens;
      aggregateTelemetry.modelCalls += t.modelCalls;
      aggregateTelemetry.retries += t.retries;
      aggregateTelemetry.localRuleEvaluations += t.localRuleEvaluations;
      aggregateTelemetry.costFen += t.costFen;
      if (t.degraded) {
        aggregateTelemetry.degradedSessions += 1;
      }
    };

    // Case 1: Fluent normal speech covering chapter 1 -> must stay L0 silent.
    {
      const clock = new ManualClock(1_700_001_000_000);
      const { runtime, emitted } = makeSession('eval_case_1', clock);
      const t0 = performance.now();
      await runtime.ingestSpeech({
        text: '传统对话框 AI 需要用户停下来阅读长段输出，直接打断现场语言流与目光接触。',
        isFinal: true,
      });
      clock.advance(4_000);
      await runtime.ingestSpeech({
        text: '而且自然停顿本身不等于卡壳，Controller 会结合语义遗漏与开放提问判断。',
        isFinal: true,
      });
      const elapsed = performance.now() - t0;
      const ended = runtime.end(2);
      accumulateTelemetry(ended.outcome.telemetry);

      const shown = emitted.filter((m) => m.type === 'intervention.shown');
      const passed = shown.length === 0;
      outcomes.push({
        id: 'case_1_fluent_quiet',
        name: '流畅正常陈述保持 L0 静默',
        passed,
        detail: passed ? '全程 L0 无打扰' : `误触发 ${shown.length} 次干预`,
        shownCount: shown.length,
        helpfulShownCount: 0,
        falseIntervention: shown.length > 0,
        withdrawalsExpected: 0,
        withdrawalsMatched: 0,
        suppressedCount: ended.reflection.utility.suppressedCount,
        latencySamplesMs: [Number(elapsed.toFixed(2))],
        netUtilityV: ended.reflection.utility.netUtilityScore,
      });
    }

    // Case 2: Pause without semantic gap -> must be suppressed cleanly.
    {
      const clock = new ManualClock(1_700_002_000_000);
      const { runtime, emitted } = makeSession('eval_case_2', clock);
      const t0 = performance.now();
      await runtime.ingestSpeech({
        text: '传统对话框 AI 需要用户停下来阅读长段输出，直接打断现场语言流与目光接触。',
        isFinal: true,
      });
      clock.advance(3_000);
      const tickDecision = await runtime.processTick(3_000);
      const elapsed = performance.now() - t0;
      const ended = runtime.end(2);
      accumulateTelemetry(ended.outcome.telemetry);

      const shown = emitted.filter((m) => m.type === 'intervention.shown');
      const suppressedPause =
        tickDecision?.selectedAction === 'stay_silent' &&
        (tickDecision.suppressReason === 'pause_only_without_gap' ||
          tickDecision.suppressReason === 'no_semantic_need');
      const passed = shown.length === 0 && Boolean(suppressedPause);
      outcomes.push({
        id: 'case_2_pause_suppression',
        name: '纯静音停顿无语义缺口抑制触发',
        passed,
        detail: passed
          ? `3000ms 停顿已抑制（${tickDecision?.suppressReason}）`
          : `错误放行或抑制原因异常: ${tickDecision?.suppressReason}`,
        shownCount: shown.length,
        helpfulShownCount: 0,
        falseIntervention: shown.length > 0,
        withdrawalsExpected: 0,
        withdrawalsMatched: 0,
        suppressedCount: ended.reflection.utility.suppressedCount,
        latencySamplesMs: [Number(elapsed.toFixed(2))],
        netUtilityV: ended.reflection.utility.netUtilityScore,
      });
    }

    // Case 3: Topic drift -> triggers intervention, then speaker recovers -> automatic withdrawal.
    {
      const clock = new ManualClock(1_700_003_000_000);
      const { runtime, emitted } = makeSession('eval_case_3', clock);
      const t0 = performance.now();
      await runtime.ingestSpeech({
        text: '顺便聊一下昨天我去喝的那家咖啡店，周末天气真的很不错。',
        isFinal: true,
      });
      clock.advance(2_500);
      await runtime.ingestSpeech({
        text: '回到刚才的主线要点：传统对话框打断语言流与目光接触，而自然停顿不等于卡壳。',
        isFinal: true,
      });
      const elapsed = performance.now() - t0;
      const ended = runtime.end(2);
      accumulateTelemetry(ended.outcome.telemetry);

      const shown = emitted.filter((m) => m.type === 'intervention.shown');
      const withdrawn = emitted.filter((m) => m.type === 'intervention.withdrawn');
      const recoveredWithdraw = withdrawn.some(
        (m) => m.type === 'intervention.withdrawn' && m.payload.reason === 'user_recovered',
      );
      const passed = shown.length === 1 && recoveredWithdraw;
      outcomes.push({
        id: 'case_3_drift_recovery_withdraw',
        name: '话题跑偏触发提示 + 回正后自动撤回',
        passed,
        detail: passed
          ? '触发 1 次 L1/L2 收束提示并在自愈后 user_recovered 撤回'
          : `shown=${shown.length}, recoveredWithdraw=${recoveredWithdraw}`,
        shownCount: shown.length,
        helpfulShownCount: shown.length === 1 ? 1 : 0,
        falseIntervention: false,
        withdrawalsExpected: 1,
        withdrawalsMatched: recoveredWithdraw ? 1 : 0,
        suppressedCount: ended.reflection.utility.suppressedCount,
        latencySamplesMs: [Number(elapsed.toFixed(2))],
        netUtilityV: ended.reflection.utility.netUtilityScore,
      });
    }

    // Case 4: Grounded live Q&A -> cites exact verified evidence (λ = 2).
    {
      const clock = new ManualClock(1_700_004_000_000);
      const { runtime, emitted } = makeSession('eval_case_4', clock);
      const t0 = performance.now();
      await runtime.ingestSpeech({
        speaker: 'audience',
        text: '请问你们净效用评估公式 V = H - λI 默认惩罚系数 λ 是多少？',
        isFinal: true,
      });
      const elapsed = performance.now() - t0;
      const ended = runtime.end(2);
      accumulateTelemetry(ended.outcome.telemetry);

      const shownMsg = emitted.find((m) => m.type === 'intervention.shown');
      const shownInt = shownMsg?.type === 'intervention.shown' ? shownMsg.payload.intervention : undefined;
      const passed = Boolean(
        shownInt &&
          shownInt.grounded === true &&
          shownInt.evidenceIds.includes('ev_sample_7'),
      );
      outcomes.push({
        id: 'case_4_grounded_qa',
        name: '现场提问命中已核验事实白名单',
        passed,
        detail: passed
          ? `命中证据 [${shownInt?.evidenceIds.join(',')}]，输出 ${shownInt?.level} 卡片`
          : `grounded=${shownInt?.grounded}, ids=${shownInt?.evidenceIds.join(',')}`,
        shownCount: shownInt ? 1 : 0,
        helpfulShownCount: passed ? 1 : 0,
        falseIntervention: false,
        withdrawalsExpected: 0,
        withdrawalsMatched: 0,
        suppressedCount: ended.reflection.utility.suppressedCount,
        latencySamplesMs: [Number(elapsed.toFixed(2))],
        netUtilityV: ended.reflection.utility.netUtilityScore,
      });
    }

    // Case 5: Ungrounded out-of-pack Q&A -> honest missing_evidence_notice, zero fabricated metrics.
    {
      const clock = new ManualClock(1_700_005_000_000);
      const { runtime, emitted } = makeSession('eval_case_5', clock);
      const t0 = performance.now();
      await runtime.ingestSpeech({
        speaker: 'audience',
        text: '请问你们明年海外推广总预算金额和付费大客户签约数量是多少？',
        isFinal: true,
      });
      const elapsed = performance.now() - t0;
      const ended = runtime.end(2);
      accumulateTelemetry(ended.outcome.telemetry);

      const shownMsg = emitted.find((m) => m.type === 'intervention.shown');
      const shownInt = shownMsg?.type === 'intervention.shown' ? shownMsg.payload.intervention : undefined;
      const passed = Boolean(
        shownInt &&
          shownInt.grounded === false &&
          shownInt.evidenceIds.length === 0 &&
          Boolean(shownInt.missingEvidenceNotice),
      );
      outcomes.push({
        id: 'case_5_ungrounded_qa_honesty',
        name: '资料外超纲提问触发诚实缺失声明',
        passed,
        detail: passed
          ? '正确返回 grounded=false 且附带 missingEvidenceNotice'
          : `错误编造或未拦截: grounded=${shownInt?.grounded}`,
        shownCount: shownInt ? 1 : 0,
        helpfulShownCount: passed ? 1 : 0,
        falseIntervention: false,
        withdrawalsExpected: 0,
        withdrawalsMatched: 0,
        suppressedCount: ended.reflection.utility.suppressedCount,
        latencySamplesMs: [Number(elapsed.toFixed(2))],
        netUtilityV: ended.reflection.utility.netUtilityScore,
      });
    }

    // Case 6: Adversarial ungrounded numeric candidate blocked by Controller + chapter change auto-withdraw.
    {
      const clock = new ManualClock(1_700_006_000_000);
      const { runtime, emitted } = makeSession('eval_case_6', clock);
      const t0 = performance.now();
      const adv = runtime.submitExternalCandidate(
        {
          candidateId: 'cand_adv_hallucinated',
          sessionId: runtime.sessionId,
          level: 'L2',
          title: '伪造指标',
          cueText: '系统可将幻觉率直接降低 99.8% 并提升收入 300 万元。',
          priority: 99,
          ttlMs: 10_000,
          expiresAt: msToIso(clock.now() + 10_000),
          contextVersion: runtime.state.getContextVersion(),
          evidenceIds: ['ev_sample_1'],
          basedOnSegmentId: 'seg_init',
          status: 'pending',
          kind: 'qa_grounding',
          grounded: true,
        },
        { openQuestion: true },
      );

      // Now trigger a real omission prompt then switch chapter to verify chapter_changed withdrawal.
      clock.advance(1_000);
      await runtime.ingestSpeech({
        text: '这部分先讲到这，进入下一部分前我补充一句。',
        isFinal: true,
      });
      clock.advance(1_500);
      runtime.setChapter('ch_2_architecture');
      const elapsed = performance.now() - t0;
      const ended = runtime.end(2);
      accumulateTelemetry(ended.outcome.telemetry);

      const blockedUngrounded =
        adv.decision.selectedAction === 'stay_silent' &&
        adv.decision.suppressReason === 'ungrounded_evidence';
      const chapterWithdrawn = emitted.some(
        (m) => m.type === 'intervention.withdrawn' && m.payload.reason === 'chapter_changed',
      );
      const passed = blockedUngrounded && chapterWithdrawn;
      outcomes.push({
        id: 'case_6_grounding_guard_and_chapter_withdraw',
        name: '控制器拦截伪造数字 + 切章自动撤回',
        passed,
        detail: passed
          ? '成功拦截 99.8%/300万 未核验数字，并在切章后 chapter_changed 撤回旧提示'
          : `blockedUngrounded=${blockedUngrounded}, chapterWithdrawn=${chapterWithdrawn}`,
        shownCount: emitted.filter((m) => m.type === 'intervention.shown').length,
        helpfulShownCount: chapterWithdrawn ? 1 : 0,
        falseIntervention: !blockedUngrounded,
        withdrawalsExpected: 1,
        withdrawalsMatched: chapterWithdrawn ? 1 : 0,
        suppressedCount: ended.reflection.utility.suppressedCount,
        latencySamplesMs: [Number(elapsed.toFixed(2))],
        netUtilityV: ended.reflection.utility.netUtilityScore,
      });
    }

    const totalCases = outcomes.length;
    const passedCases = outcomes.filter((o) => o.passed).length;
    const allLatencies = outcomes.flatMap((o) => o.latencySamplesMs).sort((a, b) => a - b);
    const avgLatencyMs = Number(
      (allLatencies.reduce((s, v) => s + v, 0) / Math.max(1, allLatencies.length)).toFixed(2),
    );
    const p50LatencyMs =
      allLatencies[Math.floor(Math.max(0, allLatencies.length - 1) * 0.5)] ?? 0;
    const p95LatencyMs =
      allLatencies[Math.min(allLatencies.length - 1, Math.ceil(allLatencies.length * 0.95) - 1)] ?? 0;

    const totalShown = outcomes.reduce((s, o) => s + o.shownCount, 0);
    const totalHelpfulShown = outcomes.reduce((s, o) => s + o.helpfulShownCount, 0);
    const precision = totalShown > 0 ? Number((totalHelpfulShown / totalShown).toFixed(4)) : 1;

    const quietCases = outcomes.filter((o) => o.id === 'case_1_fluent_quiet' || o.id === 'case_2_pause_suppression');
    const falseInterventions = quietCases.filter((o) => o.falseIntervention).length;
    const falseInterventionRate = Number((falseInterventions / Math.max(1, quietCases.length)).toFixed(4));

    const expectedWd = outcomes.reduce((s, o) => s + o.withdrawalsExpected, 0);
    const matchedWd = outcomes.reduce((s, o) => s + o.withdrawalsMatched, 0);
    const withdrawalAccuracy = expectedWd > 0 ? Number((matchedWd / expectedWd).toFixed(4)) : 1;

    const totalNetUtilityV = Number(
      outcomes.reduce((s, o) => s + o.netUtilityV, 0).toFixed(2),
    );

    const measurementSource: TelemetryUsageSource = observedSources.has('provider_reported')
      ? 'provider_reported'
      : observedSources.has('estimated')
        ? 'estimated'
        : 'local_rule_zero';

    const summary = {
      generatedAt: new Date().toISOString(),
      mode: {
        system1: `${fastDecision.backend} (${fastDecision.mode})`,
        system2: `${slowReasoning.backend} (${slowReasoning.mode})`,
      },
      metrics: {
        totalCases,
        passedCases,
        passRate: Number((passedCases / totalCases).toFixed(4)),
        avgLatencyMs,
        p50LatencyMs,
        p95LatencyMs,
        latencyStats: {
          avgMs: avgLatencyMs,
          p50Ms: p50LatencyMs,
          p95Ms: p95LatencyMs,
          sampleCount: allLatencies.length,
        },
        precision,
        falseInterventionRate,
        withdrawalAccuracy,
        totalNetUtilityV,
        utilityFormula: 'V = H - λI (λ = 2)',
      },
      telemetry: {
        ...aggregateTelemetry,
        cost: createMoneyAmount(aggregateTelemetry.costFen),
        measurementSource,
        observedSources: Array.from(observedSources),
        note:
          measurementSource === 'local_rule_zero'
            ? 'Offline deterministic evaluation used local heuristic & grounded rules (0 LLM tokens consumed).'
            : measurementSource === 'estimated'
              ? 'Estimated token counts derived from provider characters because raw usage metadata was unavailable.'
              : 'Exact tokens reported by configured models.',
      },
      cases: outcomes,
    };

    const jsonPath = path.join(runtimeOutDir, 'eval-latest.json');
    const mdPath = path.join(runtimeOutDir, 'eval-latest.md');

    writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8');

    const mdLines = [
      '# CueX Presentation Evaluation Benchmark Report',
      '',
      `- **Generated At**: \`${summary.generatedAt}\``,
      `- **System 1**: \`${summary.mode.system1}\``,
      `- **System 2**: \`${summary.mode.system2}\``,
      `- **Measurement Source**: \`${summary.telemetry.measurementSource}\``,
      '',
      '## Aggregate Metrics',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      `| Cases Passed | ${summary.metrics.passedCases} / ${summary.metrics.totalCases} (${(summary.metrics.passRate * 100).toFixed(1)}%) |`,
      `| Avg / P50 / P95 Case Latency | ${summary.metrics.avgLatencyMs} ms / ${summary.metrics.p50LatencyMs} ms / ${summary.metrics.p95LatencyMs} ms |`,
      `| Intervention Precision | ${(summary.metrics.precision * 100).toFixed(1)}% |`,
      `| False Intervention Rate (Quiet/Pause) | ${(summary.metrics.falseInterventionRate * 100).toFixed(1)}% |`,
      `| Automatic Withdrawal Accuracy | ${(summary.metrics.withdrawalAccuracy * 100).toFixed(1)}% |`,
      `| Aggregate Net Utility (${summary.metrics.utilityFormula}) | ${summary.metrics.totalNetUtilityV} |`,
      `| LLM Tokens (Input / Output / Cached / Total) | ${summary.telemetry.inputTokens} / ${summary.telemetry.outputTokens} / ${summary.telemetry.cachedInputTokens} / ${summary.telemetry.totalTokens} |`,
      `| Model Calls / Retries / Local Rule Evals | ${summary.telemetry.modelCalls} / ${summary.telemetry.retries} / ${summary.telemetry.localRuleEvaluations} |`,
      `| Total Cost / Degraded Sessions | ¥${(summary.telemetry.cost.amountFen / 100).toFixed(2)} (${summary.telemetry.costFen} fen) / ${summary.telemetry.degradedSessions} |`,
      '',
      '## Scenario Breakdown',
      '',
      '| Case | Pass | Shown | Suppressed | Latency (ms) | Net V | Detail |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...outcomes.map(
        (o) =>
          `| ${o.name} | ${o.passed ? 'PASS' : 'FAIL'} | ${o.shownCount} | ${o.suppressedCount} | ${o.latencySamplesMs[0]} | ${o.netUtilityV} | ${o.detail} |`,
      ),
      '',
    ];
    writeFileSync(mdPath, mdLines.join('\n'), 'utf8');

    console.log(JSON.stringify(summary, null, 2));
    if (passedCases !== totalCases) {
      process.exitCode = 1;
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

void main();
