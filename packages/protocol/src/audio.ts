/**
 * Audio & ASR Stream Contracts.
 * Honestly exposes ASR capability status without synthetic playback claims.
 */

import type { TranscriptSegment, TranscriptSpeaker } from '#src/entities';
import type { UtcIso8601 } from '#src/versions';

export interface AudioChunkPayload {
  sessionId?: string;
  format: 'pcm16' | 'opus';
  sampleRate: number;
  channels: number;
  /** Base64-encoded audio frame bytes. */
  data: string;
  /** Client capture offset or epoch ms timestamp on streaming binary frame. */
  timestamp: number;
  speaker?: TranscriptSpeaker;
}

export const COLAB_ASR_LIFECYCLE_STATES = [
  'not_configured',
  'starting',
  'ready',
  'degraded',
  'disconnected',
  'restarting',
  'unavailable',
] as const;

export type ColabAsrLifecycleState = (typeof COLAB_ASR_LIFECYCLE_STATES)[number];

export const ASR_BACKEND_MODES = [
  'colab_gpu',
  'local_sherpa',
  'remote_sherpa',
  'browser_webspeech',
  'text_simulation',
] as const;

export type AsrBackendMode = (typeof ASR_BACKEND_MODES)[number];

export interface AsrCapabilityStatus {
  backend: string;
  mode: AsrBackendMode;
  available: boolean;
  streaming: boolean;
  detail: string;
  lifecycleState?: ColabAsrLifecycleState;
  gpuName?: string;
  modelId?: string;
  rtf?: number;
  lastHealthCheckAt?: UtcIso8601;
  fallbackActive?: boolean;
  fallbackReason?: string;
}

export interface AsrTranscriptEvent {
  segment: TranscriptSegment;
  asrStatus?: AsrCapabilityStatus;
}
