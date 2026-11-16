import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { InterventionFeedback, InterventionLevel } from '@cuex/protocol';
import { ensureAuthSession, getStoredAuthToken } from '@/lib/api';
import { CueXWSClient } from '../driver/CueXWSClient';
import {
  initialPresentationSessionState,
  presentationSessionReducer,
} from './presentationSession';

/**
 * 独立演讲伴随窗（Companion Window）专用会话 Hook。
 * 严格约束：
 * 1. 仅以 `role=companion` 附着已有活跃会话，绝不新建第二套 Runtime 或发送 `session.start` / `session.end`。
 * 2. 绝不初始化 AudioCapture 或浏览器麦克风，绝不发送 `audio.chunk` / `speech.delta`。
 * 3. 仅允许只读同步与安全轻量交互（`intervention.request_help`、`intervention.dismiss`、`intervention.feedback`）。
 */
export function useCompanionSession(sessionId: string | null) {
  const [state, dispatch] = useReducer(
    presentationSessionReducer,
    initialPresentationSessionState
  );

  const clientRef = useRef<CueXWSClient | null>(null);
  const attachTimerRef = useRef<number | undefined>();
  const withdrawTimerRef = useRef<number | undefined>();
  const readyReceivedRef = useRef(false);

  // 自动清理已撤回提示的展示横幅（与主舞台保持一致）
  useEffect(() => {
    if (!state.lastWithdrawn) return;
    window.clearTimeout(withdrawTimerRef.current);
    withdrawTimerRef.current = window.setTimeout(() => {
      dispatch({ type: 'clear_withdrawn' });
    }, 4500);
    return () => window.clearTimeout(withdrawTimerRef.current);
  }, [state.lastWithdrawn]);

  const connectCompanion = useCallback(
    (targetSessionId: string) => {
      window.clearTimeout(attachTimerRef.current);
      readyReceivedRef.current = false;
      dispatch({ type: 'reset' });

      clientRef.current?.disconnect();
      const client = new CueXWSClient({
        onStatusChange: (status) => {
          dispatch({ type: 'ws_status', status });
          if (status === 'connected') {
            // 若服务端在握手后未立即下发 session.ready，主动补发一次显式 session.attach
            window.clearTimeout(attachTimerRef.current);
            attachTimerRef.current = window.setTimeout(() => {
              if (!readyReceivedRef.current && clientRef.current === client) {
                client.attachSession(targetSessionId, 'companion');
              }
            }, 60);
          }
        },
        onMessage: (message) => {
          if (message.type === 'session.ready' || message.type === 'session.attach_state') {
            readyReceivedRef.current = true;
            window.clearTimeout(attachTimerRef.current);
          }
          dispatch({ type: 'server_message', message });
        },
        onError: (message) => {
          dispatch({ type: 'error', message });
        },
      });
      clientRef.current = client;

      const doConnect = (token: string | null) => {
        if (clientRef.current !== client) return;
        client.connect({
          token,
          sessionId: targetSessionId,
          role: 'companion',
          autoReconnect: true,
        });
      };

      const storedToken = getStoredAuthToken();
      if (storedToken) {
        doConnect(storedToken);
      } else {
        void ensureAuthSession()
          .then((auth) => doConnect(auth.token ?? getStoredAuthToken()))
          .catch(() => doConnect(getStoredAuthToken()));
      }
    },
    []
  );

  useEffect(() => {
    if (!sessionId) {
      dispatch({ type: 'reset' });
      return;
    }
    connectCompanion(sessionId);
    return () => {
      window.clearTimeout(attachTimerRef.current);
      window.clearTimeout(withdrawTimerRef.current);
      clientRef.current?.disconnect();
    };
  }, [sessionId, connectCompanion]);

  const requestHelp = useCallback(
    (preferredLevel: InterventionLevel = 'L2', question?: string) => {
      const targetId = state.session?.sessionId ?? sessionId;
      if (!targetId) return;
      clientRef.current?.send({
        type: 'intervention.request_help',
        payload: { sessionId: targetId, preferredLevel, question },
      });
    },
    [state.session?.sessionId, sessionId]
  );

  const dismissHint = useCallback(
    (reason = 'user_dismissed_in_companion') => {
      const targetId = state.session?.sessionId ?? sessionId;
      if (!targetId) return;
      clientRef.current?.send({
        type: 'intervention.dismiss',
        payload: {
          sessionId: targetId,
          interventionId: state.activeIntervention?.interventionId,
          candidateId: state.cognitiveState?.activeCandidate?.candidateId,
          reason,
        },
      });
    },
    [
      state.session?.sessionId,
      sessionId,
      state.activeIntervention?.interventionId,
      state.cognitiveState?.activeCandidate?.candidateId,
    ]
  );

  const sendFeedback = useCallback(
    (interventionId: string, feedback: InterventionFeedback, note?: string) => {
      const targetId = state.session?.sessionId ?? sessionId;
      if (!targetId) return;
      dispatch({ type: 'local_feedback', interventionId, feedback });
      clientRef.current?.send({
        type: 'intervention.feedback',
        payload: { sessionId: targetId, interventionId, feedback, note },
      });
    },
    [state.session?.sessionId, sessionId]
  );

  const reconnect = useCallback(() => {
    if (!sessionId) return;
    connectCompanion(sessionId);
  }, [sessionId, connectCompanion]);

  const disconnect = useCallback(() => {
    window.clearTimeout(attachTimerRef.current);
    clientRef.current?.disconnect();
  }, []);

  return {
    state,
    requestHelp,
    dismissHint,
    sendFeedback,
    reconnect,
    disconnect,
  };
}
