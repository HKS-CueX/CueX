import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  InterventionFeedback,
  InterventionLevel,
  PresentationContextPack,
  PresentationMode,
  SessionStartRehearsalTarget,
  TranscriptSpeaker,
  ViewMode,
} from '@cuex/protocol';
import { ensureAuthSession, getStoredAuthToken, wipeSession } from '@/lib/api';
import { AudioCapture } from '../audio/AudioCapture';
import { BrowserSpeechRecognizer } from '../audio/BrowserSpeechRecognizer';
import { CueXWSClient } from '../driver/CueXWSClient';
import {
  initialPresentationSessionState,
  presentationSessionReducer,
} from './presentationSession';

export type MicInputMode = 'off' | 'pcm_mic' | 'browser_webspeech';

export interface StartPresentationSessionOptions {
  packId?: string;
  contextPack?: PresentationContextPack;
  mode: PresentationMode;
  viewMode?: ViewMode;
  maxInterventionLevel?: InterventionLevel;
  silentMode?: boolean;
  privacyNoticeAccepted: boolean;
  rehearsalTarget?: SessionStartRehearsalTarget;
}

export function usePresentationSession() {
  const [state, dispatch] = useReducer(
    presentationSessionReducer,
    initialPresentationSessionState
  );
  const [micMode, setMicMode] = useState<MicInputMode>('off');
  const [micVolume, setMicVolume] = useState(0);
  const [micError, setMicError] = useState<string>();
  const [simulatingText, setSimulatingText] = useState(false);

  const clientRef = useRef<CueXWSClient | null>(null);
  const captureRef = useRef<AudioCapture>(new AudioCapture());
  const speechRecRef = useRef<BrowserSpeechRecognizer>(new BrowserSpeechRecognizer());
  const simTimerRef = useRef<number | undefined>();
  const withdrawTimerRef = useRef<number | undefined>();

  const stopAllAudio = useCallback(() => {
    captureRef.current.stop();
    speechRecRef.current.stop();
    setMicMode('off');
    setMicVolume(0);
  }, []);

  const stopSimulation = useCallback(() => {
    window.clearInterval(simTimerRef.current);
    simTimerRef.current = undefined;
    setSimulatingText(false);
  }, []);

  useEffect(() => {
    if (!state.lastWithdrawn) return;
    window.clearTimeout(withdrawTimerRef.current);
    withdrawTimerRef.current = window.setTimeout(() => {
      dispatch({ type: 'clear_withdrawn' });
    }, 4500);
    return () => window.clearTimeout(withdrawTimerRef.current);
  }, [state.lastWithdrawn]);

  useEffect(() => {
    return () => {
      stopSimulation();
      stopAllAudio();
      clientRef.current?.disconnect();
      window.clearTimeout(withdrawTimerRef.current);
    };
  }, [stopSimulation, stopAllAudio]);

  const startSession = useCallback(
    (options: StartPresentationSessionOptions) => {
      if (!options.privacyNoticeAccepted) {
        dispatch({ type: 'error', message: '请先阅读并确认麦克风与隐私告知后再进入会话。' });
        return;
      }
      stopSimulation();
      stopAllAudio();
      setMicError(undefined);
      dispatch({ type: 'reset' });

      clientRef.current?.disconnect();
      const client = new CueXWSClient({
        onStatusChange: (status) => {
          dispatch({ type: 'ws_status', status });
          if (status === 'error' || status === 'closed') {
            stopAllAudio();
            stopSimulation();
          }
        },
        onMessage: (message) => {
          dispatch({ type: 'server_message', message });
          if (message.type === 'session.ended' || message.type === 'session.wiped') {
            stopAllAudio();
            stopSimulation();
          }
        },
        onError: (message) => {
          dispatch({ type: 'error', message });
        },
      });
      clientRef.current = client;

      const connectAndStart = (token: string | null) => {
        if (clientRef.current !== client) return;
        client.connect({ token, autoReconnect: true });
        client.send({
          type: 'session.start',
          payload: {
            scenarioId: 'presentation',
            packId: options.packId,
            contextPack: options.contextPack,
            mode: options.mode,
            viewMode: options.viewMode ?? 'focus',
            maxInterventionLevel: options.maxInterventionLevel ?? 'L3',
            silentMode: options.silentMode ?? false,
            privacyNoticeAccepted: options.privacyNoticeAccepted,
            rehearsalTarget: options.rehearsalTarget,
          },
        });
      };

      const storedToken = getStoredAuthToken();
      if (storedToken) {
        connectAndStart(storedToken);
      } else {
        void ensureAuthSession()
          .then((auth) => connectAndStart(auth.token ?? getStoredAuthToken()))
          .catch(() => connectAndStart(getStoredAuthToken()));
      }
    },
    [stopAllAudio, stopSimulation]
  );

  const startPcmMic = useCallback(async () => {
    const sessionId = state.session?.sessionId;
    if (!sessionId || state.session?.status !== 'active') return false;
    stopAllAudio();
    setMicError(undefined);
    const ok = await captureRef.current.start({
      onAudioChunk: (data, timestamp) => {
        clientRef.current?.send({
          type: 'audio.chunk',
          payload: {
            sessionId,
            format: 'pcm16',
            sampleRate: 16000,
            channels: 1,
            data,
            timestamp,
            speaker: 'presenter',
          },
        });
      },
      onVolumeChange: (rms) => setMicVolume(rms),
      onError: (err) => {
        setMicError(
          err.name === 'NotAllowedError'
            ? '麦克风权限被拒绝，请在浏览器中授权或使用文本仿真测试。'
            : err.message
        );
        setMicMode('off');
      },
    });
    if (ok) {
      setMicMode('pcm_mic');
    }
    return ok;
  }, [state.session?.sessionId, state.session?.status, stopAllAudio]);

  const startWebSpeech = useCallback(() => {
    const sessionId = state.session?.sessionId;
    if (!sessionId || state.session?.status !== 'active') return false;
    stopAllAudio();
    setMicError(undefined);
    const ok = speechRecRef.current.start({
      onResult: (text, isFinal, confidence) => {
        clientRef.current?.send({
          type: 'speech.delta',
          payload: {
            sessionId,
            speaker: 'presenter',
            text,
            isFinal,
            confidence,
            source: 'browser_webspeech',
          },
        });
      },
      onError: (msg) => {
        setMicError(msg);
        setMicMode('off');
      },
      onEnd: () => {
        setMicMode('off');
      },
    });
    if (ok) {
      setMicMode('browser_webspeech');
    }
    return ok;
  }, [state.session?.sessionId, state.session?.status, stopAllAudio]);

  const sendSimulatedSpeech = useCallback(
    (text: string, speaker: TranscriptSpeaker = 'presenter', progressive = false) => {
      const sessionId = state.session?.sessionId;
      const clean = text.trim();
      if (!sessionId || !clean || state.session?.status === 'ended') return;
      stopSimulation();
      dispatch({ type: 'error', message: undefined });

      if (!progressive || clean.length <= 16) {
        clientRef.current?.send({
          type: 'speech.delta',
          payload: {
            sessionId,
            speaker,
            text: clean,
            isFinal: true,
            confidence: 0.98,
            source: 'text_simulation',
          },
        });
        return;
      }

      setSimulatingText(true);
      let cursor = 0;
      const step = Math.max(4, Math.ceil(clean.length / 5));
      const emit = () => {
        cursor = Math.min(clean.length, cursor + step);
        const isFinal = cursor >= clean.length;
        clientRef.current?.send({
          type: 'speech.delta',
          payload: {
            sessionId,
            speaker,
            text: clean.slice(0, cursor),
            isFinal,
            confidence: 0.96,
            source: 'text_simulation',
          },
        });
        if (isFinal) {
          stopSimulation();
        }
      };
      emit();
      if (cursor < clean.length) {
        simTimerRef.current = window.setInterval(emit, 180);
      }
    },
    [state.session?.sessionId, state.session?.status, stopSimulation]
  );

  const pauseSession = useCallback(() => {
    const sessionId = state.session?.sessionId;
    if (!sessionId) return;
    stopAllAudio();
    clientRef.current?.send({ type: 'session.pause', payload: { sessionId } });
  }, [state.session?.sessionId, stopAllAudio]);

  const resumeSession = useCallback(() => {
    const sessionId = state.session?.sessionId;
    if (!sessionId) return;
    clientRef.current?.send({ type: 'session.resume', payload: { sessionId } });
  }, [state.session?.sessionId]);

  const setSilentMode = useCallback(
    (silentMode: boolean) => {
      const sessionId = state.session?.sessionId;
      if (!sessionId) return;
      clientRef.current?.send({ type: 'session.silent', payload: { sessionId, silentMode } });
    },
    [state.session?.sessionId]
  );

  const setCeilingLevel = useCallback(
    (maxLevel: InterventionLevel) => {
      const sessionId = state.session?.sessionId;
      if (!sessionId) return;
      clientRef.current?.send({
        type: 'intervention.set_ceiling',
        payload: { sessionId, maxLevel },
      });
    },
    [state.session?.sessionId]
  );

  const setViewMode = useCallback(
    (viewMode: ViewMode) => {
      const sessionId = state.session?.sessionId;
      if (!sessionId) return;
      clientRef.current?.send({ type: 'view.mode', payload: { sessionId, viewMode } });
    },
    [state.session?.sessionId]
  );

  const setChapter = useCallback(
    (chapterId: string) => {
      const sessionId = state.session?.sessionId;
      if (!sessionId) return;
      clientRef.current?.send({ type: 'chapter.set', payload: { sessionId, chapterId } });
    },
    [state.session?.sessionId]
  );

  const requestHelp = useCallback(
    (preferredLevel: InterventionLevel = 'L2', question?: string) => {
      const sessionId = state.session?.sessionId;
      if (!sessionId) return;
      clientRef.current?.send({
        type: 'intervention.request_help',
        payload: { sessionId, preferredLevel, question },
      });
    },
    [state.session?.sessionId]
  );

  const dismissHint = useCallback(
    (reason = 'user_dismissed_in_focus') => {
      const sessionId = state.session?.sessionId;
      if (!sessionId) return;
      clientRef.current?.send({
        type: 'intervention.dismiss',
        payload: {
          sessionId,
          interventionId: state.activeIntervention?.interventionId,
          candidateId: state.cognitiveState?.activeCandidate?.candidateId,
          reason,
        },
      });
    },
    [
      state.session?.sessionId,
      state.activeIntervention?.interventionId,
      state.cognitiveState?.activeCandidate?.candidateId,
    ]
  );

  const sendFeedback = useCallback(
    (interventionId: string, feedback: InterventionFeedback, note?: string) => {
      const sessionId = state.session?.sessionId;
      if (!sessionId) return;
      dispatch({ type: 'local_feedback', interventionId, feedback });
      clientRef.current?.send({
        type: 'intervention.feedback',
        payload: { sessionId, interventionId, feedback, note },
      });
    },
    [state.session?.sessionId]
  );

  const endSession = useCallback(
    (reason: 'completed' | 'user_requested' | 'aborted' = 'completed') => {
      const sessionId = state.session?.sessionId;
      if (!sessionId) return;
      stopSimulation();
      stopAllAudio();
      clientRef.current?.send({ type: 'session.end', payload: { sessionId, reason } });
    },
    [state.session?.sessionId, stopAllAudio, stopSimulation]
  );

  const wipeCurrentSession = useCallback(async () => {
    const sessionId = state.session?.sessionId;
    stopSimulation();
    stopAllAudio();
    if (!sessionId) {
      dispatch({ type: 'reset' });
      return;
    }
    if (state.wsStatus === 'connected') {
      clientRef.current?.send({ type: 'session.wipe', payload: { sessionId } });
      return;
    }
    try {
      const res = await wipeSession(sessionId);
      if (res.receipt) {
        dispatch({ type: 'deletion_receipt', receipt: res.receipt });
      } else {
        dispatch({ type: 'reset' });
      }
    } catch {
      dispatch({ type: 'reset' });
    }
  }, [state.session?.sessionId, state.wsStatus, stopAllAudio, stopSimulation]);

  const disconnect = useCallback(() => {
    stopSimulation();
    stopAllAudio();
    clientRef.current?.disconnect();
    dispatch({ type: 'reset' });
  }, [stopAllAudio, stopSimulation]);

  return {
    state,
    micMode,
    micVolume,
    micError,
    webSpeechSupported: BrowserSpeechRecognizer.isSupported(),
    simulatingText,
    startSession,
    startPcmMic,
    startWebSpeech,
    stopAllAudio,
    sendSimulatedSpeech,
    stopSimulation,
    pauseSession,
    resumeSession,
    setSilentMode,
    setCeilingLevel,
    setViewMode,
    setChapter,
    requestHelp,
    dismissHint,
    sendFeedback,
    endSession,
    wipeCurrentSession,
    disconnect,
  };
}
