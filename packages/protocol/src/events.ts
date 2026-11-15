/**
 * Full-Duplex Client/Server WebSocket Protocol for CueX Cognitive Runtime.
 */

import type { AsrCapabilityStatus, AsrTranscriptEvent, AudioChunkPayload } from './audio';
import type { InterventionLevel, TelemetryUsage } from './common';
import type { ControllerDecision, WithdrawalReason } from './controller';
import type {
  CognitiveEvent,
  ContextPack,
  Evidence,
  Intervention,
  InterventionFeedback,
  Outcome,
  Session,
  TranscriptSpeaker,
} from './entities';
import type {
  PresentationContextPack,
  PresentationLiveState,
  PresentationMode,
  PresentationReflection,
  PresentationWeakSegment,
  ViewMode,
} from './presentation';
import type { FastDecisionVerdict, SlowReasoningCandidateResult } from './reasoning';
import type { ScenarioCapabilityDescriptor, ScenarioId } from './scenario';
import type { SharedCognitiveState } from './state';

export interface SessionStartRehearsalTarget {
  weakSegmentId: string;
  chapterId: string;
  promptText?: string;
  targetPointLabels?: string[];
}

export type ClientMessage =
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

export type ServerMessage =
  | {
      type: 'session.ready';
      payload: {
        session: Session;
        serverTime: number;
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
        serverTime: number;
      };
    }
  | {
      type: 'session.ended';
      payload: {
        sessionId: string;
        endedAt: number;
        durationMs: number;
        outcome: Outcome;
        reflection?: PresentationReflection;
      };
    }
  | {
      type: 'session.wiped';
      payload: {
        sessionId: string;
        wipedAt: number;
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
        withdrawnAt: number;
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
  | { type: 'pong'; payload: { t: number; serverTime: number } }
  | { type: 'session.error'; payload: { code: string; message: string; sessionId?: string } };
