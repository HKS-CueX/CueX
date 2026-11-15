/**
 * Full-Duplex Client/Server WebSocket Protocol for CueX Cognitive Runtime.
 * Backward-compatible with optional EventEnvelope metadata, idempotency keys, correlation IDs, and monotonic serverSeq.
 */

import type { AsrCapabilityStatus, AsrTranscriptEvent, AudioChunkPayload } from '#src/audio';
import type { InterventionLevel, TelemetryUsage } from '#src/common';
import type { ControllerDecision, WithdrawalReason } from '#src/controller';
import type {
  CognitiveEvent,
  ContextPack,
  Evidence,
  Intervention,
  InterventionFeedback,
  Outcome,
  Session,
  TranscriptSpeaker,
} from '#src/entities';
import type { EventEnvelopeMeta } from '#src/envelope';
import type { ApiErrorCode } from '#src/errors';
import type {
  PresentationContextPack,
  PresentationLiveState,
  PresentationMode,
  PresentationReflection,
  PresentationWeakSegment,
  ViewMode,
} from '#src/presentation';
import type { FastDecisionVerdict, SlowReasoningCandidateResult } from '#src/reasoning';
import type { ScenarioCapabilityDescriptor, ScenarioId } from '#src/scenario';
import type { SharedCognitiveState } from '#src/state';
import type { UtcIso8601 } from '#src/versions';

export interface SessionStartRehearsalTarget {
  weakSegmentId: string;
  chapterId: string;
  promptText?: string;
  targetPointLabels?: string[];
}

export interface ClientMessageEnvelopeFields {
  envelope?: EventEnvelopeMeta;
  idempotencyKey?: string;
  correlationId?: string;
  clientSeq?: number;
}

export interface ServerMessageEnvelopeFields {
  envelope?: EventEnvelopeMeta;
  correlationId?: string;
  /** Monotonic per-connection/session server sequence number for reconnect deduplication. */
  serverSeq?: number;
}

type DistributeFields<TUnion, TExtra> = TUnion extends unknown ? TUnion & TExtra : never;

export type ClientMessagePayloadUnion =
  | {
      type: 'session.start';
      payload: {
        scenarioId: ScenarioId;
        packId?: string;
        contextPack?: PresentationContextPack | ContextPack;
        mode: PresentationMode;
        viewMode?: ViewMode;
        maxInterventionLevel?: InterventionLevel;
        silentMode?: boolean;
        privacyNoticeAccepted: boolean;
        rehearsalTarget?: SessionStartRehearsalTarget;
      };
    }
  | { type: 'session.stop'; payload: { sessionId: string; reason?: string } }
  | { type: 'session.pause'; payload: { sessionId: string } }
  | { type: 'session.resume'; payload: { sessionId: string } }
  | { type: 'session.silent'; payload: { sessionId: string; silentMode: boolean } }
  | {
      type: 'session.end';
      payload: { sessionId: string; reason?: 'completed' | 'user_requested' | 'aborted' };
    }
  | { type: 'session.wipe'; payload: { sessionId: string } }
  | { type: 'audio.chunk'; payload: AudioChunkPayload }
  | {
      type: 'speech.delta';
      payload: {
        sessionId?: string;
        speaker?: TranscriptSpeaker;
        text: string;
        isFinal: boolean;
        confidence?: number;
        startMs?: number;
        endMs?: number;
        source?: 'browser_webspeech' | 'text_simulation' | 'external_asr';
      };
    }
  | { type: 'chapter.set'; payload: { sessionId: string; chapterId: string } }
  | {
      type: 'intervention.request_help';
      payload: { sessionId: string; preferredLevel?: InterventionLevel; question?: string };
    }
  | {
      type: 'intervention.dismiss';
      payload: {
        sessionId: string;
        interventionId?: string;
        candidateId?: string;
        reason?: string;
      };
    }
  | {
      type: 'intervention.set_ceiling';
      payload: { sessionId: string; maxLevel: InterventionLevel };
    }
  | {
      type: 'intervention.feedback';
      payload: {
        sessionId: string;
        interventionId: string;
        feedback: InterventionFeedback;
        note?: string;
      };
    }
  | {
      type: 'rehearsal.start';
      payload: {
        sessionId?: string;
        sourceSessionId: string;
        packId: string;
        weakSegmentId: string;
        chapterId: string;
      };
    }
  | { type: 'view.mode'; payload: { sessionId: string; viewMode: ViewMode } }
  | { type: 'ping'; payload: { t: number } };

export type ClientMessage = DistributeFields<ClientMessagePayloadUnion, ClientMessageEnvelopeFields>;

export type ServerMessagePayloadUnion =
  | {
      type: 'session.ready';
      payload: {
        session: Session;
        serverTime: UtcIso8601;
        scenario: ScenarioCapabilityDescriptor;
        asrStatus: AsrCapabilityStatus;
        initialState: SharedCognitiveState;
        presentationState?: PresentationLiveState;
      };
    }
  | {
      type: 'session.state';
      payload: {
        session: Session;
        serverTime: UtcIso8601;
      };
    }
  | {
      type: 'session.ended';
      payload: {
        sessionId: string;
        endedAt: UtcIso8601;
        durationMs: number;
        outcome: Outcome;
        reflection?: PresentationReflection;
      };
    }
  | {
      type: 'session.wiped';
      payload: {
        sessionId: string;
        wipedAt: UtcIso8601;
      };
    }
  | { type: 'asr.status'; payload: AsrCapabilityStatus }
  | { type: 'asr.transcript'; payload: AsrTranscriptEvent }
  | { type: 'cognitive.event'; payload: CognitiveEvent }
  | { type: 'cognitive.state'; payload: SharedCognitiveState }
  | { type: 'system1.verdict'; payload: FastDecisionVerdict }
  | { type: 'system2.candidate'; payload: SlowReasoningCandidateResult }
  | { type: 'controller.decision'; payload: ControllerDecision }
  | {
      type: 'intervention.shown';
      payload: {
        sessionId: string;
        intervention: Intervention;
        decision: ControllerDecision;
      };
    }
  | {
      type: 'intervention.withdrawn';
      payload: {
        sessionId: string;
        interventionId: string;
        candidateId?: string;
        reason: WithdrawalReason;
        decision: ControllerDecision;
        withdrawnAt: UtcIso8601;
      };
    }
  | { type: 'presentation.progress'; payload: PresentationLiveState }
  | {
      type: 'rehearsal.ready';
      payload: {
        sessionId: string;
        weakSegment: PresentationWeakSegment;
        promptText: string;
        supportingEvidence: Evidence[];
      };
    }
  | { type: 'telemetry.updated'; payload: TelemetryUsage }
  | { type: 'pong'; payload: { t: number; serverTime: UtcIso8601 } }
  | {
      type: 'session.error';
      payload: {
        code: ApiErrorCode | string;
        message: string;
        sessionId?: string;
        retryable?: boolean;
      };
    };

export type ServerMessage = DistributeFields<ServerMessagePayloadUnion, ServerMessageEnvelopeFields>;
