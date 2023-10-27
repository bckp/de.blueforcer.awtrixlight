import { Device } from 'homey';
import Client from './Client';
import {
  indicatorNumber,
  indicatorOptions,
  notifyOptions,
  powerOptions,
  settingOptions,
} from '../Normalizer';
import { Status } from './Response';
import { SettingOptions } from '../Types';

export default class Api {

  client: Client;
  device: Device;

  constructor(client: Client, device: Device) {
    this.client = client;
    this.device = device;
  }

  setCredentials(user: string, pass: string) {
    this.client.setCredentials(user, pass);
  }

  setIp(ip: string) {
    this.client.setIp(ip);
  }

  async isAvaible(): Promise<boolean> {
    return await this.clientVerify() === Status.Ok;
  }

  /** bckp ******* Commands ******* */
  async dismiss() {
    return this.clientPost('notify/dismiss');
  }

  async rtttl(melody: string): Promise<boolean> {
    return this.clientPost('rtttl', melody);
  }

  async power(power: boolean): Promise<boolean> {
    return this.clientPost('power', powerOptions({ power }));
  }

  async indicator(id: number | string, options: any): Promise<boolean> {
    return this.clientPost(`indicator${indicatorNumber(id)}`, indicatorOptions(options));
  }

  async appNext(): Promise<boolean> {
    return this.clientPost('nextapp');
  }

  async appPrev(): Promise<boolean> {
    return this.clientPost('previousapp');
  }

  async reboot(): Promise<boolean> {
    return this.clientPost('reboot');
  }

  async notify(msg: string, options: object): Promise<boolean> {
    return this.clientPost('notify', notifyOptions({ text: msg, ...options }));
  }

  async setSettings(options: any): Promise<boolean> {
    return this.clientPost('settings', settingOptions(options));
  }

  async getSettings(): Promise<SettingOptions> {
    return this.clientGet('settings');
  }

  /** bckp ******* NETWORK LAYER  ******* */
  async clientGet(endpoint: string): Promise<object> {
    const response = await this.client.get(endpoint);
    this.processResponseCode(response.status, response.message);

    return response.data || {};
  }

  async clientPost(endpoint: string, options?: any): Promise<boolean> {
    const response = await this.client.post(endpoint, options);
    this.processResponseCode(response.status, response.message);

    return response?.status === Status.Ok;
  }

  async clientVerify(): Promise<Status> {
    return (await this.client.get('stats')).status;
  }

  processResponseCode(status: Status, message?: string): void {
    switch (status) {
      case Status.Ok:
        if (this.device.getAvailable()) {
          return;
        }
        this.device.setAvailable().catch((error) => this.device.log(error.message ?? error));
        return;

      case Status.AuthRequired:
        this.device.setUnavailable('Authentication required!').catch((error) => this.device.log(error));
        return;

      case Status.AuthFailed:
        this.device.setUnavailable('Authentication failed!').catch((error) => this.device.log(error));
        return;

      default:
        this.device.setUnavailable(message ?? 'Unknown error.').catch((error) => this.device.log(error));
    }
  }

}
