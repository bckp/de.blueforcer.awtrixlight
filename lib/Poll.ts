import { Homey } from 'homey/lib/Device';

export default class Poll {

  callback: () => void;
  homey: Homey;

  interval: number;
  failsafe: number;
  extended: boolean = false;

  poll!: NodeJS.Timeout;

  constructor(callback: () => void, homey: Homey, interval: number = 30000, failsafe: number = 18000000) {
    this.callback = callback;
    this.homey = homey;

    this.interval = interval;
    this.failsafe = failsafe;
  }

  start(): void {
    this.stop();
    this.poll = this.homey.setInterval(() => this.callback(), this.interval);
  }

  extend(): void {
    this.stop();
    this.extended = true;
    this.poll = this.homey.setInterval(() => this.callback(), this.failsafe);
  }

  stop(): void {
    this.extended = false;
    this.homey.clearTimeout(this.poll);
  }

  isActive(): boolean {
    return !!this.poll;
  }

  isExtended(): boolean {
    return this.extended;
  }

}
