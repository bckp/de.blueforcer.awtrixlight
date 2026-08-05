export interface AwtrixNgTimerHost {
  setInterval(callback: () => void | Promise<void>, ms: number): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
}

export default class AwtrixNgPoll {

  readonly #callback: () => void | Promise<void>;

  readonly #onError: (error: unknown) => void;

  readonly #timerHost: AwtrixNgTimerHost;

  readonly #intervalMs: number;

  #timer?: ReturnType<typeof setInterval>;

  #running = false;

  constructor(
    callback: () => void | Promise<void>,
    timerHost: AwtrixNgTimerHost,
    intervalMs: number,
    onError: (error: unknown) => void,
  ) {
    this.#callback = callback;
    this.#timerHost = timerHost;
    this.#intervalMs = intervalMs;
    this.#onError = onError;
  }

  start(): void {
    this.stop();
    this.#timer = this.#timerHost.setInterval(() => this.#executeCallback(), this.#intervalMs);
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

  #executeCallback(): Promise<void> | undefined {
    if (this.#running) {
      return undefined;
    }

    this.#running = true;
    return Promise.resolve()
      .then(() => this.#callback())
      .catch(this.#onError)
      .finally(() => {
        this.#running = false;
      });
  }

}
