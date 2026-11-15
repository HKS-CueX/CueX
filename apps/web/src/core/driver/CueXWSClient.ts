import type { ClientMessage, ServerMessage } from '@cuex/protocol';

export type WsConnectionStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

export interface CueXWSClientCallbacks {
  onStatusChange: (status: WsConnectionStatus) => void;
  onMessage: (message: ServerMessage) => void;
  onError: (message: string) => void;
}

export class CueXWSClient {
  private ws: WebSocket | null = null;
  private pingTimer?: number;
  private connectTimer?: number;
  private status: WsConnectionStatus = 'idle';
  private pendingMessages: ClientMessage[] = [];
  private manualClose = false;

  constructor(private readonly callbacks: CueXWSClientCallbacks) {}

  private readonly handleOffline = () => {
    this.fail('网络已断开，无法保持实时认知连接。');
  };

  connect(serverUrl?: string): void {
    this.disconnect();
    this.manualClose = false;
    this.setStatus('connecting');
    window.addEventListener('offline', this.handleOffline);

    try {
      const targetUrl =
        serverUrl ??
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
      const ws = new WebSocket(targetUrl);
      this.ws = ws;

      this.connectTimer = window.setTimeout(() => {
        if (this.ws === ws && this.status === 'connecting') {
          this.fail('连接后端超时，请确认 CueX 服务已启动。');
        }
      }, 10000);

      ws.onopen = () => {
        if (this.ws !== ws) return;
        window.clearTimeout(this.connectTimer);
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
          this.callbacks.onMessage(parsed);
        } catch {
          this.callbacks.onError('收到无法解析的服务端消息。');
        }
      };

      ws.onerror = () => {
        if (this.ws === ws && !this.manualClose) {
          this.fail('WebSocket 连接失败，请确认服务端运行在 /ws。');
        }
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.clearTimers();
        if (this.manualClose) {
          this.setStatus('closed');
        } else if (this.status !== 'error') {
          this.fail('实时会话连接已中断。');
        }
      };
    } catch {
      this.fail('无法创建 WebSocket 连接。');
    }
  }

  send(message: ClientMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.pendingMessages.push(message);
      return true;
    }
    return false;
  }

  disconnect(): void {
    this.manualClose = true;
    this.pendingMessages = [];
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

  private fail(message: string): void {
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
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
  }
}
