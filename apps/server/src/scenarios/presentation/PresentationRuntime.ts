import type {
  Candidate,
  CognitiveEvent,
  ControllerDecision,
  Evidence,
  Intervention,
  Observation,
  PresentationContextPack,
  PresentationLiveState,
  PresentationMode,
  PresentationProgressNode,
  PresentationReflection,
  Session,
  SharedCognitiveState,
  TranscriptSegment,
  ViewMode,
  WithdrawalReason,
} from '@cuex/protocol';
import type {
  PluginSegmentAnalysis,
  PluginTickAnalysis,
  RetrievedEvidence,
  ScenarioRuntimePlugin,
} from '../../runtime/types';
import {
  detectNextChapterTransition,
  evaluateChapterPace,
  matchChapterKeyPoints,
} from './PresentationPolicies';
import { buildPresentationReflection, type QuestionRecord } from './PresentationReflection';

export interface PresentationRuntimeOptions {
  sessionId: string;
  mode: PresentationMode;
  viewMode: ViewMode;
  pack: PresentationContextPack;
  startedAt: number;
  initialChapterId?: string;
}

/**
 * Presentation Scenario Adapter implementing `ScenarioRuntimePlugin`.
 * Keeps chapter tracking, pace monitoring, omission detection, and reflection generation decoupled from core Runtime.
 */
export class PresentationRuntimePlugin
  implements ScenarioRuntimePlugin<PresentationLiveState, PresentationReflection>
{
  readonly scenarioId = 'presentation' as const;
  readonly pack: PresentationContextPack;
  readonly chapterNodes: PresentationProgressNode[];
  private activeChapterIndex: number;
  private chapterStartedAtMs: number;
  private readonly sessionStartedAtMs: number;
  private readonly mode: PresentationMode;
  private viewMode: ViewMode;
  private activeDriftTopic?: string;
  private activeQuestion?: PresentationLiveState['activeQuestion'];
  private readonly questionRecords: QuestionRecord[] = [];
  private obsSeq = 0;

  constructor(opts: PresentationRuntimeOptions) {
    this.pack = structuredClone(opts.pack);
    this.chapterNodes = structuredClone(opts.pack.progressNodes);
    this.mode = opts.mode;
    this.viewMode = opts.viewMode;
    this.sessionStartedAtMs = opts.startedAt;
    this.chapterStartedAtMs = opts.startedAt;

    let initialIdx = 0;
    if (opts.initialChapterId) {
      const idx = this.chapterNodes.findIndex((n) => n.chapterId === opts.initialChapterId);
      if (idx >= 0) initialIdx = idx;
    }
    this.activeChapterIndex = initialIdx;
    this.syncNodeStatuses();
  }

  private syncNodeStatuses(): void {
    this.chapterNodes.forEach((node, idx) => {
      if (idx < this.activeChapterIndex) node.status = 'completed';
      else if (idx === this.activeChapterIndex) {
        node.status = node.actualDurationSec > node.targetDurationSec + 10 ? 'overtime' : 'active';
      } else {
        node.status = 'upcoming';
      }
    });
  }

  setViewMode(viewMode: ViewMode): void {
    this.viewMode = viewMode;
  }

  onChapterChange(chapterId: string, now: number): { chapterTitle?: string; contextBumped?: boolean } {
    const idx = this.chapterNodes.findIndex((n) => n.chapterId === chapterId);
    if (idx < 0) return {};
    const prevNode = this.chapterNodes[this.activeChapterIndex];
    if (prevNode) {
      prevNode.actualDurationSec = Math.max(
        prevNode.actualDurationSec,
        Math.round((now - this.chapterStartedAtMs) / 1000),
      );
    }
    this.activeChapterIndex = idx;
    this.chapterStartedAtMs = now;
    this.activeDriftTopic = undefined;
    this.syncNodeStatuses();
    return { chapterTitle: this.chapterNodes[idx].title, contextBumped: true };
  }

  getActiveChapter(): PresentationProgressNode | undefined {
    return this.chapterNodes[this.activeChapterIndex];
  }

  getExpectedPoints(): Array<{ id: string; label: string; covered: boolean }> {
    const active = this.getActiveChapter();
    if (!active) return [];
    return active.keyPoints.map((kp) => ({
      id: kp.id,
      label: kp.label,
      covered: kp.covered,
    }));
  }

  getTargetContextSnapshot() {
    const active = this.getActiveChapter();
    return {
      goal: this.pack.goal,
      chapterId: active?.chapterId,
      chapterTitle: active?.title,
      constraints: active
        ? [`章节目标 ${active.targetDurationSec}s`, this.pack.cueSheet.chapters[this.activeChapterIndex]?.coreMessage ?? '']
        : [],
      forbiddenClaims: [...this.pack.forbiddenClaims],
    };
  }

  onSegment(segment: TranscriptSegment, now: number, contextVersion: number): PluginSegmentAnalysis {
    const observations: Observation[] = [];
    const activeNode = this.getActiveChapter();
    if (!activeNode) return {};

    activeNode.actualDurationSec = Math.max(
      activeNode.actualDurationSec,
      Math.round((now - this.chapterStartedAtMs) / 1000),
    );
    this.syncNodeStatuses();

    const nextIdx =
      segment.speaker !== 'audience'
        ? detectNextChapterTransition(segment.text, this.chapterNodes, this.activeChapterIndex)
        : undefined;

    if (nextIdx !== undefined) {
      const targetNode = this.chapterNodes[nextIdx];
      this.onChapterChange(targetNode.chapterId, now);
      observations.push({
        observationId: `obs_${++this.obsSeq}_${now}`,
        sessionId: segment.sessionId,
        kind: 'chapter_transition',
        summary: `已自然切换至第 ${nextIdx + 1} 章「${targetNode.title}」`,
        severity: 'low',
        confidence: 0.9,
        timestamp: now,
        contextVersion,
        relatedSegmentId: segment.segmentId,
        relatedChapterId: targetNode.chapterId,
      });
      const newlyCovered = matchChapterKeyPoints(segment.text, targetNode, now);
      return {
        chapterChangedTo: targetNode.chapterId,
        chapterChangedTitle: targetNode.title,
        contextBumped: true,
        newlyCoveredPointIds: newlyCovered,
        extraObservations: observations,
      };
    }

    if (segment.speaker === 'audience') {
      observations.push({
        observationId: `obs_${++this.obsSeq}_${now}`,
        sessionId: segment.sessionId,
        kind: 'audience_question',
        summary: `收到现场提问：${segment.text}`,
        severity: 'high',
        confidence: segment.confidence,
        timestamp: now,
        contextVersion,
        relatedSegmentId: segment.segmentId,
        relatedChapterId: activeNode.chapterId,
      });
      return {
        questionText: segment.text,
        extraObservations: observations,
        preferredTriggerKind: 'live_qa',
      };
    }

    const newlyCoveredPointIds = matchChapterKeyPoints(segment.text, activeNode, now);
    if (newlyCoveredPointIds.length > 0) {
      this.activeDriftTopic = undefined;
    }

    return {
      newlyCoveredPointIds,
      extraObservations: observations,
      ...(newlyCoveredPointIds.length > 0 ? { directRecoveryDetected: true } : {}),
    };
  }

  onTick(now: number, contextVersion: number, lastSegmentId: string): PluginTickAnalysis {
    const activeNode = this.getActiveChapter();
    if (!activeNode) return {};
    const pace = evaluateChapterPace(activeNode, this.chapterStartedAtMs, now);
    activeNode.actualDurationSec = pace.chapterActualSec;
    this.syncNodeStatuses();

    if (pace.paceStatus === 'overtime') {
      const obs: Observation = {
        observationId: `obs_${++this.obsSeq}_${now}`,
        sessionId: '',
        kind: 'pace_overtime',
        summary: `「${activeNode.title}」已用时 ${pace.chapterActualSec}s（目标 ${pace.chapterTargetSec}s）`,
        severity: 'medium',
        confidence: 0.95,
        timestamp: now,
        contextVersion,
        relatedChapterId: activeNode.chapterId,
      };
      return {
        extraObservations: [obs],
        triggerCandidate: {
          kind: 'pace_overtime',
          requestedLevel: 'L1',
          title: '章节超时提醒',
          cueText: `收束「${activeNode.title.slice(0, 14)}」并过渡下一节`,
          reason: `Chapter elapsed ${pace.chapterActualSec}s > ${pace.chapterTargetSec}s.`,
          basedOnSegmentId: lastSegmentId,
          targetChapterId: activeNode.chapterId,
          priority: 62,
        },
      };
    }
    return {};
  }

  onQuestionEvidence(segmentId: string, questionText: string, retrieved: RetrievedEvidence[]): void {
    const grounded = retrieved.length > 0;
    const matchedEvidenceIds = retrieved.map((r) => r.evidence.id);
    const missingInfoNotice = grounded
      ? undefined
      : '资料库及事实白名单中暂无直接匹配的已核验数据，请勿现场编造指标。';

    this.activeQuestion = {
      segmentId,
      text: questionText,
      grounded,
      matchedEvidenceIds,
      ...(missingInfoNotice ? { missingInfoNotice } : {}),
    };

    this.questionRecords.push({
      segmentId,
      question: questionText,
      grounded,
      evidenceIds: matchedEvidenceIds,
      missingInfoNotice,
      atMs: Date.now(),
      chapterId: this.getActiveChapter()?.chapterId,
    });
  }

  onCandidatePrepared(candidate: Candidate): void {
    if (candidate.kind === 'drift_recovery') {
      this.activeDriftTopic = candidate.cueText;
    }
  }

  onInterventionWithdrawn(_intervention: Intervention, reason: WithdrawalReason): void {
    if (reason === 'user_recovered' || reason === 'chapter_changed' || reason === 'topic_changed') {
      this.activeDriftTopic = undefined;
    }
  }

  getProjection(state: SharedCognitiveState, now: number): PresentationLiveState {
    const activeNode = this.getActiveChapter();
    if (activeNode) {
      activeNode.actualDurationSec = Math.max(
        activeNode.actualDurationSec,
        Math.round((now - this.chapterStartedAtMs) / 1000),
      );
      this.syncNodeStatuses();
    }

    const pace = activeNode
      ? evaluateChapterPace(activeNode, this.chapterStartedAtMs, now).paceStatus
      : 'on_pace';

    const missedKeyPoints = this.chapterNodes.flatMap((node) =>
      node.keyPoints
        .filter((kp) => !kp.covered)
        .map((kp) => ({
          chapterId: node.chapterId,
          pointId: kp.id,
          label: kp.label,
        })),
    );

    return {
      sessionId: state.sessionId,
      mode: this.mode,
      viewMode: this.viewMode,
      packId: this.pack.packId,
      activeChapterId: activeNode?.chapterId ?? '',
      activeChapterIndex: this.activeChapterIndex,
      elapsedSec: Math.max(0, Math.round((now - this.sessionStartedAtMs) / 1000)),
      targetDurationSec: this.pack.targetDurationSec,
      paceStatus: pace,
      chapterNodes: this.chapterNodes.map((node) => ({
        ...node,
        keyPoints: node.keyPoints.map((kp) => ({ ...kp })),
      })),
      missedKeyPoints,
      ...(this.activeDriftTopic ? { activeDriftTopic: this.activeDriftTopic } : {}),
      ...(this.activeQuestion ? { activeQuestion: { ...this.activeQuestion } } : {}),
    };
  }

  buildReflection(params: {
    session: Session;
    state: SharedCognitiveState;
    events: CognitiveEvent[];
    decisions: ControllerDecision[];
    interventions: Intervention[];
    observations: Observation[];
    segments: TranscriptSegment[];
    evidence: Evidence[];
    lambda?: number;
    now: number;
  }): PresentationReflection {
    return buildPresentationReflection({
      pack: this.pack,
      chapterNodes: this.chapterNodes,
      questionRecords: this.questionRecords,
      ...params,
    });
  }
}
