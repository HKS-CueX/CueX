export interface BrowserSpeechCallbacks {
  onResult: (text: string, isFinal: boolean, confidence: number) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition;
}

export class BrowserSpeechRecognizer {
  private recognition: SpeechRecognitionInstance | null = null;
  private active = false;

  static isSupported(): boolean {
    return typeof getConstructor() === 'function';
  }

  get isRunning(): boolean {
    return this.active;
  }

  start(callbacks: BrowserSpeechCallbacks, lang = 'zh-CN'): boolean {
    const Ctor = getConstructor();
    if (!Ctor) {
      callbacks.onError('当前浏览器不支持 Web Speech API，请改用麦克风 PCM 流或文本仿真输入。');
      return false;
    }

    this.stop();
    try {
      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        let interimText = '';
        let finalText = '';
        let bestConfidence = 0.85;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const alt = res[0];
          if (!alt) continue;
          if (typeof alt.confidence === 'number' && alt.confidence > 0) {
            bestConfidence = alt.confidence;
          }
          if (res.isFinal) {
            finalText += alt.transcript;
          } else {
            interimText += alt.transcript;
          }
        }
        if (finalText.trim()) {
          callbacks.onResult(finalText.trim(), true, bestConfidence);
        } else if (interimText.trim()) {
          callbacks.onResult(interimText.trim(), false, bestConfidence);
        }
      };

      rec.onerror = (event) => {
        if (event.error === 'aborted') return;
        const friendly =
          event.error === 'not-allowed'
            ? '浏览器拒绝了语音识别麦克风权限，请检查权限设置或改用文本仿真。'
            : event.error === 'network'
              ? '浏览器 Web Speech 识别服务网络不可用，请改用本地 Sherpa ASR 或文本仿真。'
              : `浏览器语音识别异常：${event.error}`;
        callbacks.onError(friendly);
      };

      rec.onend = () => {
        if (this.active) {
          this.active = false;
          this.recognition = null;
          callbacks.onEnd();
        }
      };

      this.recognition = rec;
      this.active = true;
      rec.start();
      return true;
    } catch (error) {
      this.active = false;
      this.recognition = null;
      callbacks.onError(
        error instanceof Error ? error.message : '无法启动浏览器 Web Speech 识别。'
      );
      return false;
    }
  }

  stop(): void {
    this.active = false;
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      try {
        this.recognition.abort();
      } catch {
        // Ignore cleanup errors from inactive recognition instances.
      }
      this.recognition = null;
    }
  }
}
