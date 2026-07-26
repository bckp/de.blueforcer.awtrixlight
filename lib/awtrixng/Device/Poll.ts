export interface AwtrixNgTimerHost {
  setInterval(callback: () => void | Promise<void>, ms: number): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
}

export default class AwtrixNgPoll {

  readonly #callback: () => void | Promise<void>;

  readonly #timerHost: AwtrixNgTimerHost;

  readonly #intervalMs: number;

  #timer?: ReturnType<typeof setInterval>;

  constructor(callback: () => void | Promise<void>, timerHost: AwtrixNgTimerHost, intervalMs: number) {
    this.#callback = callback;
    this.#timerHost = timerHost;
    this.#intervalMs = intervalMs;
  }

  start(): void {
    this.stop();
    this.#timer = this.#timerHost.setInterval(this.#callback, this.#intervalMs);
  }

  stop(): void {
    if (this.#timer !== undefined) {
      this.#timerHost.clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  isActive(): boolean {
    return this.#timer !== undefined;
  }

}
