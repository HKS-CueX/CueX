import type {
  ContextPack,
  Evidence,
  MemoryItem,
  Observation,
  Session,
  TaskContext,
  TranscriptSegment,
} from '@cuex/protocol';

export interface ContextStoreInit {
  session: Session;
  taskContext: TaskContext;
  contextPack?: ContextPack;
  confirmedMemories?: MemoryItem[];
}

/**
 * Manages structured TaskContext, ContextPack, verified Evidence[], real-time Observations,
 * TranscriptSegments, and opt-in MemoryItems with provenance and lifecycle hygiene.
 */
export class ContextStore {
  readonly session: Session;
  readonly taskContext: TaskContext;
  private contextPack?: ContextPack;
  private readonly evidenceMap = new Map<string, Evidence>();
  private readonly memoryItems: MemoryItem[] = [];
  private readonly observations: Observation[] = [];
  private readonly segments: TranscriptSegment[] = [];
  private lastSpeechAtMs: number;
  private segCounter = 0;

  constructor(init: ContextStoreInit) {
    this.session = { ...init.session };
    this.taskContext = { ...init.taskContext };
    this.lastSpeechAtMs = init.session.startedAt;

    if (init.contextPack) {
      this.setContextPack(init.contextPack);
    }
    if (init.confirmedMemories?.length) {
      for (const item of init.confirmedMemories) {
        if (item.userConfirmed) {
          this.memoryItems.push({ ...item });
          this.ingestMemoryAsEvidence(item);
        }
      }
    }
  }

  private ingestMemoryAsEvidence(item: MemoryItem): void {
    if (!item.userConfirmed || item.category !== 'fact') return;
    this.upsertEvidence({
      id: `mem_ev_${item.memoryId}`,
      text: `${item.title}: ${item.content}`,
      source: `user_confirmed_memory:${item.memoryId}`,
      sourceType: 'user_confirmed_memory',
      timestamp: Date.parse(item.updatedAt) || Date.now(),
      confidence: 0.95,
      scope: item.scope,
      privacyLevel: item.privacyLevel,
      userConfirmed: true,
      verified: true,
      lifecycle: 'active',
      title: item.title,
      tags: item.tags,
    });
  }

  setContextPack(pack: ContextPack): void {
    this.contextPack = pack;
    this.evidenceMap.clear();
    for (const item of pack.evidence) {
      this.upsertEvidence(item);
    }
    for (const mem of this.memoryItems) {
      this.ingestMemoryAsEvidence(mem);
    }
  }

  getContextPack(): ContextPack | undefined {
    return this.contextPack;
  }

  upsertEvidence(evidence: Evidence): void {
    this.evidenceMap.set(evidence.id, { ...evidence });
  }

  getEvidenceById(id: string): Evidence | undefined {
    return this.evidenceMap.get(id);
  }

  getAllEvidence(): Evidence[] {
    return [...this.evidenceMap.values()];
  }

  getVerifiedActiveEvidence(): Evidence[] {
    return [...this.evidenceMap.values()].filter(
      (item) => item.verified && item.lifecycle === 'active',
    );
  }

  getConfirmedMemories(): MemoryItem[] {
    return [...this.memoryItems];
  }

  recordSegment(input: {
    speaker: TranscriptSegment['speaker'];
    text: string;
    isFinal: boolean;
    confidence: number;
    startMs: number;
    endMs: number;
    source?: TranscriptSegment['source'];
    chapterId?: string;
  }): TranscriptSegment {
    const trimmed = input.text.trim();
    const last = this.segments.at(-1);

    // Update the in-flight partial segment in place so partial-to-final transitions stay linear.
    if (last && !last.isFinal && last.speaker === input.speaker) {
      const prevLen = last.text.length;
      last.text = trimmed;
      last.delta = trimmed.slice(Math.min(prevLen, trimmed.length)) || trimmed;
      last.isFinal = input.isFinal;
      last.confidence = input.confidence;
      last.endMs = input.endMs;
      last.source = input.source ?? last.source;
      last.chapterId = input.chapterId ?? last.chapterId;
      this.lastSpeechAtMs = input.endMs;
      return { ...last };
    }

    const segment: TranscriptSegment = {
      segmentId: `seg_${++this.segCounter}_${input.endMs}`,
      sessionId: this.session.sessionId,
      speaker: input.speaker,
      text: trimmed,
      delta: trimmed,
      isFinal: input.isFinal,
      confidence: Math.max(0, Math.min(1, input.confidence)),
      startMs: input.startMs,
      endMs: input.endMs,
      source: input.source,
      chapterId: input.chapterId ?? this.taskContext.activeChapterId,
    };
    this.segments.push(segment);
    if (this.segments.length > 400) {
      this.segments.splice(0, this.segments.length - 400);
    }
    this.lastSpeechAtMs = input.endMs;
    return { ...segment };
  }

  getRecentSegments(limit = 16): TranscriptSegment[] {
    return this.segments.slice(-limit).map((seg) => ({ ...seg }));
  }

  getAllSegments(): TranscriptSegment[] {
    return this.segments.map((seg) => ({ ...seg }));
  }

  getLastSegmentId(): string {
    return this.segments.at(-1)?.segmentId ?? 'seg_init';
  }

  getRecentTextDigest(limitSegments = 8, maxChars = 600): string {
    const text = this.segments
      .slice(-limitSegments)
      .map((s) => `${s.speaker === 'audience' ? '[Audience]' : '[Speaker]'} ${s.text}`)
      .join('\n');
    return text.length > maxChars ? text.slice(-maxChars) : text;
  }

  getSilenceDurationMs(now: number): number {
    return Math.max(0, now - this.lastSpeechAtMs);
  }

  addObservation(observation: Observation): void {
    this.observations.push({ ...observation });
    if (this.observations.length > 300) {
      this.observations.splice(0, this.observations.length - 300);
    }
  }

  getRecentObservations(limit = 20): Observation[] {
    return this.observations.slice(-limit).map((obs) => ({ ...obs }));
  }

  getAllObservations(): Observation[] {
    return this.observations.map((obs) => ({ ...obs }));
  }

  updateChapter(chapterId: string | undefined, chapterTitle: string | undefined, now: number): void {
    this.taskContext.activeChapterId = chapterId;
    this.taskContext.activeChapterTitle = chapterTitle;
    this.taskContext.updatedAt = now;
  }

  wipeEphemeralData(): void {
    this.observations.length = 0;
    this.segments.length = 0;
    this.memoryItems.length = 0;
    this.evidenceMap.clear();
  }
}
