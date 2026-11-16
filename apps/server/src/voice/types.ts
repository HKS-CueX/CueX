export interface AsrCorrection {
  pattern: string;
  replacement: string;
}

export interface AsrCallbacks {
  onPartial(text: string): void;
  onFinal(text: string): void;
  onError(error: Error): void;
}

export interface AsrStream {
  write(pcm16le: Buffer): void;
  flush?(): void;
  end(): void;
}

export interface AsrEngine {
  readonly backend: string;
  open(opts: { sampleRate: number }, callbacks: AsrCallbacks): Promise<AsrStream>;
}
