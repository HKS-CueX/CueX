import type { CognitiveEvent, CognitiveEventType } from '@cuex/protocol';

export type CognitiveEventListener = (event: CognitiveEvent) => void | Promise<void>;

export interface EmitEventInput<TPayload = Record<string, unknown>> {
  sessionId: string;
  eventType: CognitiveEventType;
  timestamp: number;
  source: string;
  payload: TPayload;
  confidence: number;
  contextVersion: number;
}

/**
 * Event-driven Cognitive Event Bus.
 * Avoids periodic full-history LLM polling; dispatches only when real signals arrive.
 */
export class CognitiveEventBus {
  private seq = 0;
  private readonly listeners = new Map<CognitiveEventType | '*', Set<CognitiveEventListener>>();
  private readonly history: CognitiveEvent[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory = 1000) {
    this.maxHistory = maxHistory;
  }

  subscribe(eventType: CognitiveEventType | '*', listener: CognitiveEventListener): () => void {
    let bucket = this.listeners.get(eventType);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(eventType, bucket);
    }
    bucket.add(listener);
    return () => {
      bucket?.delete(listener);
    };
  }

  emit<TPayload extends Record<string, unknown>>(input: EmitEventInput<TPayload>): CognitiveEvent<TPayload> {
    const event: CognitiveEvent<TPayload> = {
      event_id: `evt_${++this.seq}_${input.timestamp}`,
      session_id: input.sessionId,
      event_type: input.eventType,
      timestamp: input.timestamp,
      source: input.source,
      payload: input.payload,
      confidence: Math.max(0, Math.min(1, input.confidence)),
      context_version: input.contextVersion,
    };

    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }

    const targets = [
      ...(this.listeners.get(input.eventType) ?? []),
      ...(this.listeners.get('*') ?? []),
    ];
    for (const listener of targets) {
      try {
        void listener(event);
      } catch (error) {
        console.warn(`[event-bus] listener error for ${input.eventType}: ${(error as Error).message}`);
      }
    }

    return event;
  }

  getEvents(sessionId?: string): CognitiveEvent[] {
    if (!sessionId) return [...this.history];
    return this.history.filter((event) => event.session_id === sessionId);
  }

  clearSession(sessionId: string): void {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].session_id === sessionId) {
        this.history.splice(i, 1);
      }
    }
  }
}
