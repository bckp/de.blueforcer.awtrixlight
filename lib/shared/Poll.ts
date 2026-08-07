/**
 * Protocol-agnostic polling infrastructure shared by both drivers - the only sanctioned
 * shared class (see AGENTS.md). It knows nothing about the AWTRIX 3 or AWTRIX NG APIs;
 * anything protocol-aware must stay in its own lib layer.
 */

/** The timer surface Homey provides; consumers depend on the narrowed views below. */
export interface TimerHost {
  setInterval(callback: () => void | Promise<void>, ms: number): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

export type IntervalTimerHost = Pick<TimerHost, 'setInterval' | 'clearInterval'>;

export type TimeoutTimerHost = Pick<TimerHost, 'setTimeout' | 'clearTimeout'>;

export interface PollOptions {
  intervalMs: number;
  /**
   * Interval used while the extended (failsafe) mode is active. Only the AWTRIX 3 driver
   * uses it; extend() throws without it instead of silently doing nothing.
   */
  failsafeMs?: number;
  onError: (error: unknown) => void;
}

export default class Poll {

  readonly #callback: () => void | Promise<void>;

  readonly #onError: (error: unknown) => void;

  readonly #timerHost: IntervalTimerHost;

  readonly #intervalMs: number;

  readonly #failsafeMs?: number;

  #timer?: ReturnType<typeof setInterval>;

  #running = false;

  #extended = false;

  constructor(
    callback: () => void | Promise<void>,
    timerHost: IntervalTimerHost,
    options: PollOptions,
  ) {
    this.#callback = callback;
    this.#timerHost = timerHost;
    this.#intervalMs = options.intervalMs;
    this.#failsafeMs = options.failsafeMs;
    this.#onError = options.onError;
  }

  start(): void {
    this.stop();
    this.#timer = this.#timerHost.setInterval(() => this.#executeCallback(), this.#intervalMs);
  }

  /** Switches to the slow failsafe interval until start() or stop() resets it. */
  extend(): void {
    if (this.#failsafeMs === undefined) {
      throw new Error('Poll.extend() requires failsafeMs in the options.');
    }

    this.stop();
    this.#extended = true;
    this.#timer = this.#timerHost.setInterval(() => this.#executeCallback(), this.#failsafeMs);
  }

  stop(): void {
    this.#extended = false;

    if (this.#timer !== undefined) {
      this.#timerHost.clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  isActive(): boolean {
    return this.#timer !== undefined;
  }

  isExtended(): boolean {
    return this.#extended;
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
