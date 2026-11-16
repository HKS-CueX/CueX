import type { ClientMessage, ServerMessage, WsAttachRole } from '@cuex/protocol';
import { generateCorrelationId, generateIdempotencyKey } from '@/lib/api';

export type WsConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed'
  | 'error';

export interface CueXWSClientCallbacks {
  onStatusChange: (status: WsConnectionStatus) => void;
  onMessage: (message: ServerMessage) => void;
  onError: (message: string) => void;
}

export interface CueXWSConnectOptions {
  serverUrl?: string;
  token?: string | null;
  sessionId?: string;
  lastSeenSeq?: number;
  /** 连接附着角色：主控端（primary）或只读伴随窗（companion）。 */
  role?: WsAttachRole;
  autoReconnect?: boolean;
}

export class CueXWSClient {
  private ws: WebSocket | null = null;
  private pingTimer?: number;
  private connectTimer?: number;
  private reconnectTimer?: number;
  private status: WsConnectionStatus = 'idle';
  private pendingMessages: ClientMessage[] = [];
  private manualClose = false;
  private lastSeenSeq = 0;
  private clientSeq = 0;
  private activeSessionId?: string;
  private currentOptions: CueXWSConnectOptions = {};
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;

  constructor(private readonly callbacks: CueXWSClientCallbacks) {}

  private readonly handleOffline = () => {
    this.fail('网络已断开，无法保持实时认知连接。', false);
  };

  setActiveSessionId(sessionId: string | undefined): void {
    this.activeSessionId = sessionId;
  }

  getActiveSessionId(): string | undefined {
    return this.activeSessionId;
  }

  getLastSeenSeq(): number {
    return this.lastSeenSeq;
  }

  /** 发送显式 session.attach 附着指令，供伴随窗首次加入或重连对齐 seq。 */
  attachSession(sessionId: string, role?: WsAttachRole, lastSeenSeq?: number): boolean {
    this.activeSessionId = sessionId;
    return this.send({
      type: 'session.attach',
      payload: {
        sessionId,
        lastSeenSeq: lastSeenSeq ?? this.lastSeenSeq,
        role: role ?? this.currentOptions.role,
      },
    });
  }

  connect(optionsOrUrl?: string | CueXWSConnectOptions): void {
    const opts: CueXWSConnectOptions =
      typeof optionsOrUrl === 'string' ? { serverUrl: optionsOrUrl } : (optionsOrUrl ?? {});
    this.disconnect();
    this.manualClose = false;
    this.lastSeenSeq = opts.lastSeenSeq ?? 0;
    this.clientSeq = 0;
    this.reconnectAttempts = 0;
    this.activeSessionId = opts.sessionId;
    this.currentOptions = opts;
    this.openSocket(opts, false);
  }

  private buildTargetUrl(opts: CueXWSConnectOptions): string {
    const base =
      opts.serverUrl ??
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    const url = new URL(base, window.location.href);
    if (opts.token) {
      url.searchParams.set('token', opts.token);
    }
    // 无论首次附着（如伴随窗）还是断线重连，只要提供 sessionId 均随握手参数传递
    const resumeSessionId = opts.sessionId ?? this.activeSessionId;
    if (resumeSessionId) {
      url.searchParams.set('sessionId', resumeSessionId);
    }
    if (opts.role) {
      url.searchParams.set('role', opts.role);
    }
    if (this.lastSeenSeq > 0) {
      url.searchParams.set('lastSeenSeq', String(this.lastSeenSeq));
    }
    return url.toString();
  }

  private openSocket(opts: CueXWSConnectOptions, isReconnect: boolean): void {
    this.setStatus(isReconnect ? 'reconnecting' : 'connecting');
    window.addEventListener('offline', this.handleOffline);

    try {
      const targetUrl = this.buildTargetUrl(opts);
      const ws = new WebSocket(targetUrl);
      this.ws = ws;

      this.connectTimer = window.setTimeout(() => {
        if (this.ws === ws && (this.status === 'connecting' || this.status === 'reconnecting')) {
          this.fail('连接后端超时，请确认 CueX 服务已启动。', true);
        }
      }, 10000);

      ws.onopen = () => {
        if (this.ws !== ws) return;
        window.clearTimeout(this.connectTimer);
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        const queued = [...this.pendingMessages];
        this.pendingMessages = [];
        for (const msg of queued) {
          this.send(msg);
        }
        this.pingTimer = window.setInterval(() => {
          this.send({ type: 'ping', payload: { t: Date.now() } });
        }, 15000);
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        try {
          const parsed = JSON.parse(String(event.data)) as ServerMessage;
          if (typeof parsed.serverSeq === 'number') {
            if (parsed.serverSeq <= this.lastSeenSeq) {
              return;
            }
            this.lastSeenSeq = parsed.serverSeq;
          }
          if (parsed.type === 'session.ready') {
            this.activeSessionId = parsed.payload.session.sessionId;
          } else if (parsed.type === 'session.ended' || parsed.type === 'session.wiped') {
            this.activeSessionId = undefined;
          }
          this.callbacks.onMessage(parsed);
        } catch {
          this.callbacks.onError('收到无法解析的服务端消息。');
        }
      };

      ws.onerror = () => {
        if (this.ws === ws && !this.manualClose) {
          this.fail('WebSocket 连接失败，请确认服务端运行在 /ws。', true);
        }
      };

      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.clearTimers();
        if (this.manualClose) {
          this.setStatus('closed');
          return;
        }
        if (this.canAutoReconnect(ev.code)) {
          this.scheduleReconnect();
          return;
        }
        if (this.status !== 'error') {
          this.fail('实时会话连接已中断。', false);
        }
      };
    } catch {
      this.fail('无法创建 WebSocket 连接。', false);
    }
  }

  private canAutoReconnect(closeCode?: number): boolean {
    if (this.currentOptions.autoReconnect === false) return false;
    if (!this.activeSessionId) return false;
    // 鉴权、只读策略或主控麦权冲突关闭时不再自动重试
    if (closeCode === 4001 || closeCode === 4003 || closeCode === 4009 || closeCode === 1008) return false;
    return this.reconnectAttempts < this.maxReconnectAttempts;
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const delayMs = Math.min(2400, 500 * Math.pow(2, this.reconnectAttempts - 1));
    this.setStatus('reconnecting');
    this.reconnectTimer = window.setTimeout(() => {
      if (!this.manualClose && this.activeSessionId) {
        this.openSocket(this.currentOptions, true);
      }
    }, delayMs);
  }

  send(message: ClientMessage): boolean {
    const stamped = this.stampMessage(message);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(stamped));
      return true;
    }
    if (this.ws?.readyState === WebSocket.CONNECTING || this.status === 'reconnecting') {
      this.pendingMessages.push(stamped);
      return true;
    }
    return false;
  }

  private stampMessage(message: ClientMessage): ClientMessage {
    if (message.type === 'ping') return message;
    this.clientSeq += 1;
    const isAudio = message.type === 'audio.chunk';
    return {
      ...message,
      correlationId: message.correlationId ?? generateCorrelationId(),
      clientSeq: message.clientSeq ?? this.clientSeq,
      ...(!isAudio && !message.idempotencyKey
        ? { idempotencyKey: generateIdempotencyKey(message.type) }
        : {}),
    };
  }

  disconnect(): void {
    this.manualClose = true;
    this.pendingMessages = [];
    this.activeSessionId = undefined;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
    if (this.status !== 'idle') {
      this.setStatus('closed');
    }
  }

  private fail(message: string, allowReconnect: boolean): void {
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
    if (allowReconnect && this.canAutoReconnect()) {
      this.scheduleReconnect();
      return;
    }
    this.setStatus('error');
    this.callbacks.onError(message);
  }

  private setStatus(status: WsConnectionStatus): void {
    this.status = status;
    this.callbacks.onStatusChange(status);
  }

  private clearTimers(): void {
    window.removeEventListener('offline', this.handleOffline);
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.connectTimer);
    window.clearTimeout(this.reconnectTimer);
  }
}
