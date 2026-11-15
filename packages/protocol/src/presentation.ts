/**
 * Presentation Scenario Contracts (CueX Presentation).
 * Supports pre-session Context Compiler, live Focus/Inspector views, Q&A grounding, and post-session Reflection.
 */

import type { InterventionLevel, TelemetryUsage } from './common';
import type { WithdrawalReason } from './controller';
import type { Evidence, InterventionFeedback, MemoryProposal, TranscriptSpeaker } from './entities';

export type PresentationMode = 'rehearsal' | 'live';

export type ViewMode = 'focus' | 'inspector';

export type PresentationSceneType = 'pitch' | 'defense' | 'academic' | 'keynote' | 'general';

export interface PresentationExtractInput {
  filename: string;
  mimeType?: string;
  /** Base64 encoded file payload for binary formats such as .pptx or .pdf. */
  contentBase64?: string;
  /** Direct UTF-8 text payload for .md or .txt documents. */
  textContent?: string;
}

export interface ExtractedPresentationSection {
  index: number;
  title: string;
  content: string;
  notes?: string;
}

export interface PresentationExtractResult {
  filename: string;
  fileType: 'md' | 'txt' | 'pptx' | 'pdf' | 'unknown';
  extractedText: string;
  sections: ExtractedPresentationSection[];
  warnings: string[];
  unreadable: boolean;
  characterCount: number;
}

export interface PresentationCompileInput {
  packId?: string;
  title: string;
  sceneType: PresentationSceneType;
  mode?: PresentationMode;
  goal: string;
  audience: string;
  targetDurationSec: number;
  rawMaterials: string;
  sourceFilenames?: string[];
  keyFactsInput?: string[];
  forbiddenClaims?: string[];
  useSamplePack?: boolean;
}

export interface PresentationCueSheetChapter {
  chapterId: string;
  title: string;
  targetDurationSec: number;
  coreMessage: string;
  transitionCue: string;
  mustMentionFactIds: string[];
}

export interface PresentationCueSheet {
  title: string;
  sceneType: PresentationSceneType;
  oneLineThesis: string;
  audienceHook: string;
  targetDurationSec: number;
  chapters: PresentationCueSheetChapter[];
  closingCallToAction: string;
  forbiddenClaims: string[];
}

export interface PresentationFactItem {
  id: string;
  text: string;
  category: 'metric' | 'claim' | 'milestone' | 'definition' | 'boundary' | 'quote';
  source: string;
  userConfirmed: boolean;
  locked: boolean;
  verified: boolean;
  evidenceId: string;
  notes?: string;
}

export interface PresentationQACard {
  id: string;
  question: string;
  rationale: string;
  suggestedAnswer: string;
  keywords: string[];
  evidenceIds: string[];
  /** Explicit safeguard distinguishing AI-predicted questions from confirmed factual evidence. */
  isPrediction: true;
  prepared: boolean;
  gapNote?: string;
}

export interface PresentationProgressKeyPoint {
  id: string;
  label: string;
  covered: boolean;
  coveredAtMs?: number;
  evidenceId?: string;
}

export interface PresentationProgressNode {
  chapterId: string;
  order: number;
  title: string;
  targetDurationSec: number;
  actualDurationSec: number;
  status: 'upcoming' | 'active' | 'completed' | 'overtime';
  keyPoints: PresentationProgressKeyPoint[];
}

export interface PresentationContextPack {
  packId: string;
  scenarioId: 'presentation';
  title: string;
  sceneType: PresentationSceneType;
  goal: string;
  audience: string;
  targetDurationSec: number;
  cueSheet: PresentationCueSheet;
  facts: PresentationFactItem[];
  qaCards: PresentationQACard[];
  unpreparedGaps: string[];
  progressNodes: PresentationProgressNode[];
  evidence: Evidence[];
  forbiddenClaims: string[];
  compiledBy: 'local_compiler' | 'llm_compiler';
  warnings: string[];
  isSample?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PresentationPackSummary {
  packId: string;
  title: string;
  sceneType: PresentationSceneType;
  targetDurationSec: number;
  factCount: number;
  qaCount: number;
  chapterCount: number;
  isSample?: boolean;
  updatedAt: string;
}

export interface PresentationPackPatchInput {
  title?: string;
  goal?: string;
  audience?: string;
  targetDurationSec?: number;
  cueSheet?: PresentationCueSheet;
  facts?: PresentationFactItem[];
  qaCards?: PresentationQACard[];
  forbiddenClaims?: string[];
}

export interface PresentationLiveState {
  sessionId: string;
  mode: PresentationMode;
  viewMode: ViewMode;
  packId: string;
  activeChapterId: string;
  activeChapterIndex: number;
  elapsedSec: number;
  targetDurationSec: number;
  paceStatus: 'on_pace' | 'slightly_fast' | 'slightly_behind' | 'overtime';
  chapterNodes: PresentationProgressNode[];
  missedKeyPoints: Array<{
    chapterId: string;
    pointId: string;
    label: string;
  }>;
  activeDriftTopic?: string;
  activeQuestion?: {
    segmentId: string;
    text: string;
    grounded: boolean;
    matchedEvidenceIds: string[];
    missingInfoNotice?: string;
  };
}

export interface UtilitySummary {
  helpfulCount: number;
  distractingCount: number;
  lambda: number;
  netUtilityScore: number;
  explicitHelpfulCount: number;
  explicitDistractingCount: number;
  withdrawnBeforeDisruptionCount: number;
  suppressedCount: number;
  formula: 'V = H - λI';
}

export interface PresentationTimelineEvent {
  id: string;
  atMs: number;
  kind:
    | 'segment'
    | 'chapter_switch'
    | 'intervention_shown'
    | 'intervention_withdrawn'
    | 'intervention_dismissed'
    | 'qa_question'
    | 'observation';
  chapterId?: string;
  speaker?: TranscriptSpeaker;
  text: string;
  detail?: string;
  level?: InterventionLevel;
  withdrawalReason?: WithdrawalReason;
  userFeedback?: InterventionFeedback;
  evidenceIds?: string[];
}

export interface PresentationWeakSegment {
  weakSegmentId: string;
  atMs: number;
  chapterId: string;
  chapterTitle: string;
  reason: 'missed_key_point' | 'topic_drift' | 'overtime' | 'unanswered_qa' | 'distracting_moment';
  promptText: string;
  excerptText: string;
  targetPointLabels: string[];
  supportingEvidence: Evidence[];
  recommendedCue: string;
}

export interface PresentationDiagnosis {
  overallSummary: string;
  coverageRatio: number;
  missedPoints: Array<{
    chapterId: string;
    chapterTitle: string;
    pointId: string;
    label: string;
  }>;
  overtimeChapters: Array<{
    chapterId: string;
    title: string;
    targetSec: number;
    actualSec: number;
  }>;
  unansweredQuestions: Array<{
    segmentId: string;
    question: string;
    missingInfoNotice?: string;
  }>;
  driftCount: number;
  autoWithdrawCount: number;
}

export interface PresentationReflection {
  reflectionId: string;
  sessionId: string;
  packId: string;
  mode: PresentationMode;
  generatedAt: string;
  durationMs: number;
  timeline: PresentationTimelineEvent[];
  diagnosis: PresentationDiagnosis;
  weakSegments: PresentationWeakSegment[];
  memoryProposals: MemoryProposal[];
  utility: UtilitySummary;
  telemetry: TelemetryUsage;
}
