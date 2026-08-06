import { Homey } from 'homey/lib/Device';

export default class Poll {

  callback: () => void | Promise<void>;
  onError: (error: unknown) => void;
  homey: Homey;

  interval: number;
  failsafe: number;
  extended: boolean = false;
  running: boolean = false;

  poll?: ReturnType<typeof setInterval>;

  constructor(
    callback: () => void | Promise<void>,
    homey: Homey,
    onError: (error: unknown) => void,
    interval: number = 30000,
    failsafe: number = 18000000,
  ) {
    this.callback = callback;
    this.homey = homey;
    this.onError = onError;

    this.interval = interval;
    this.failsafe = failsafe;
  }

  start(): void {
    this.stop();
    this.poll = this.homey.setInterval(() => this.executeCallback(), this.interval);
  }

  extend(): void {
    this.stop();
    this.extended = true;
    this.poll = this.homey.setInterval(() => this.executeCallback(), this.failsafe);
  }

  stop(): void {
    this.extended = false;
    if (this.poll) {
      this.homey.clearInterval(this.poll);
      this.poll = undefined;
    }
  }

  isActive(): boolean {
    return !!this.poll;
  }

  isExtended(): boolean {
    return this.extended;
  }

  private executeCallback(): Promise<void> | undefined {
    if (this.running) {
      return undefined;
    }

    this.running = true;
    return Promise.resolve()
      .then(() => this.callback())
      .catch(this.onError)
      .finally(() => {
        this.running = false;
      });
  }

}
