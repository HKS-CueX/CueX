/**
 * Audio & ASR Stream Contracts.
 * Honestly exposes ASR capability status without synthetic playback claims.
 */

import type { TranscriptSegment, TranscriptSpeaker } from './entities';

export interface AudioChunkPayload {
  sessionId?: string;
  format: 'pcm16' | 'opus';
  sampleRate: number;
  channels: number;
  /** Base64-encoded audio frame bytes. */
  data: string;
  timestamp: number;
  speaker?: TranscriptSpeaker;
}

export type AsrBackendMode =
  | 'local_sherpa'
  | 'remote_sherpa'
  | 'browser_webspeech'
  | 'text_simulation';

export interface AsrCapabilityStatus {
  backend: string;
  mode: AsrBackendMode;
  available: boolean;
  streaming: boolean;
  detail: string;
}

export interface AsrTranscriptEvent {
  segment: TranscriptSegment;
  asrStatus?: AsrCapabilityStatus;
}
