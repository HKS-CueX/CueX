import type {
  CognitiveEvent,
  ControllerDecision,
  Evidence,
  FastDecisionInput,
  FastDecisionVerdict,
  Intervention,
  InterventionLevel,
  Observation,
  ScenarioId,
  Session,
  SharedCognitiveState,
  SlowReasoningCandidateRequest,
  SlowReasoningCandidateResult,
  SlowReasoningTriggerKind,
  TranscriptSegment,
  WithdrawalReason,
  Candidate,
} from '@cuex/protocol';

export interface RuntimeClock {
  now(): number;
}

export const systemClock: RuntimeClock = {
  now: () => Date.now(),
};

export class ManualClock implements RuntimeClock {
  private current: number;

  constructor(initialMs = 1_700_000_000_000) {
    this.current = initialMs;
  }

  now(): number {
    return this.current;
  }

  advance(ms: number): number {
    this.current += ms;
    return this.current;
  }

  set(ms: number): void {
    this.current = ms;
  }
}

export interface FastDecisionProvider {
  readonly backend: string;
  readonly mode: 'real' | 'local_fallback';
  health(): Promise<{ ok: boolean; detail?: string }>;
  evaluate(input: FastDecisionInput, signal?: AbortSignal): Promise<FastDecisionVerdict>;
}

export interface SlowReasoningProvider {
  readonly backend: string;
  readonly mode: 'real' | 'local_fallback';
  health(): Promise<{ ok: boolean; detail?: string }>;
  synthesize(
    request: SlowReasoningCandidateRequest,
    signal?: AbortSignal,
  ): Promise<SlowReasoningCandidateResult>;
}

export interface EmbeddingScorer {
  readonly id: string;
  score(query: string, documents: string[]): Promise<number[]>;
}

export interface RetrievedEvidence {
  evidence: Evidence;
  score: number;
  lexicalScore: number;
  semanticScore: number;
}

export interface RetrievalProvider {
  search(
    query: string,
    evidence: Evidence[],
    opts?: { topK?: number; minScore?: number },
  ): Promise<RetrievedEvidence[]>;
}

export interface PluginSegmentAnalysis {
  chapterChangedTo?: string;
  chapterChangedTitle?: string;
  contextBumped?: boolean;
  newlyCoveredPointIds?: string[];
  extraObservations?: Observation[];
  topicDriftTopic?: string;
  questionText?: string;
  directRecoveryDetected?: boolean;
  preferredTriggerKind?: SlowReasoningTriggerKind;
}

export interface PluginTickAnalysis {
  extraObservations?: Observation[];
  triggerCandidate?: {
    kind: SlowReasoningTriggerKind;
    requestedLevel: InterventionLevel;
    title: string;
    cueText: string;
    bullets?: string[];
    reason: string;
    basedOnSegmentId: string;
    targetChapterId?: string;
    targetKeyPointId?: string;
    priority: number;
    evidenceIds?: string[];
  };
}

export interface ScenarioRuntimePlugin<TState = Record<string, unknown>, TReflection = unknown> {
  readonly scenarioId: ScenarioId;
  onChapterChange?(chapterId: string, now: number): { chapterTitle?: string; contextBumped?: boolean };
  onSegment?(segment: TranscriptSegment, now: number, contextVersion: number): PluginSegmentAnalysis;
  onTick?(now: number, contextVersion: number, lastSegmentId: string): PluginTickAnalysis;
  getExpectedPoints(): Array<{ id: string; label: string; covered: boolean }>;
  getTargetContextSnapshot(): {
    goal: string;
    chapterId?: string;
    chapterTitle?: string;
    constraints: string[];
    forbiddenClaims: string[];
  };
  onQuestionEvidence?(
    segmentId: string,
    questionText: string,
    retrieved: RetrievedEvidence[],
  ): void;
  onCandidatePrepared?(candidate: Candidate): void;
  onInterventionShown?(intervention: Intervention): void;
  onInterventionWithdrawn?(intervention: Intervention, reason: WithdrawalReason): void;
  onInterventionDismissed?(intervention: Intervention): void;
  getProjection(state: SharedCognitiveState, now: number): TState;
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
  }): TReflection;
}
