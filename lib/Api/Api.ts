import { Device } from 'homey';
import FormData from 'form-data';
import Client, { RequestHeaders } from './Client';
import {
  indicatorNumber,
  indicatorOptions,
  notifyOptions,
  powerOptions,
  settingOptions,
  appOptions
} from '../Normalizer';
import { Status } from './Response';
import { AwtrixImage, AwtrixStats, SettingOptions } from '../Types';
import { DeviceFailer, DevicePoll } from '../../drivers/awtrixlight/interfaces';

export default class Api {

  client: Client;
  device: Device & DeviceFailer & DevicePoll;

  constructor(client: Client, device: Device & DeviceFailer & DevicePoll) {
    this.client = client;
    this.device = device;
  }

  setCredentials(user: string, pass: string) {
    this.client.setCredentials(user, pass);
  }

  setIp(ip: string) {
    this.client.setIp(ip);
  }

  setDebug(debug: boolean) {
    this.client.setDebug(debug);
  }

  async isAvaible(): Promise<boolean> {
    return await this.clientVerify() === Status.Ok;
  }

  /** bckp ******* Commands ******* */
  async dismiss() {
    return this.clientPost('notify/dismiss');
  }

  async rtttl(melody: string): Promise<boolean> {
    return this.clientPost('rtttl', melody, { 'Content-Type': 'text/plain' });
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

  async notify(msg: string, options: any): Promise<boolean> {
    return this.clientPost('notify', notifyOptions({ ...options, text: msg }, this.device.getStoreValue('effects') || []));
  }

  async customApp(name: string, options: any): Promise<boolean> {
    return this.clientPost(`custom?name=homey:${name}`, appOptions(options, this.device.getStoreValue('effects') || []));
  }

  async removeCustomApp(name: string): Promise<boolean> {
    return this.clientPost(`custom?name=homey:${name}`, {});
  }

  async setSettings(options: any): Promise<boolean> {
    return this.clientPost('settings', settingOptions(options));
  }

  async getSettings(): Promise<SettingOptions|null> {
    return this.clientGet('settings');
  }

  async getStats(): Promise<AwtrixStats|null> {
    return this.clientGet('stats');
  }

  async getEffects(): Promise<string[]|null> {
    return this.clientGet('effects');
  }

  async uploadImage(data: any, name: string): Promise<boolean> {
    const form = new FormData();
    form.append('image', data, { filepath: `/ICONS/${name}` });

    return this.clientUpload('edit', form);
  }

  async getImages(): Promise<AwtrixImage[]> {
    return this.clientGetDirect('list?dir=/ICONS/');
  }

  /** bckp ******* NETWORK LAYER  ******* */
  async clientGet<T>(endpoint: string): Promise<T|null> {
    try {
      const response = await this.client.get(endpoint);
      this.processResponseCode(response.status, response.message);

      return response.data || null;
    } catch (error: any) {
      this.device.log(error);
      return null;
    }
  }

  async clientGetDirect(endpoint: string): Promise<any> {
    try {
      const response = await this.client.getDirect(endpoint);
      this.processResponseCode(response.status, response.message);

      return response.data || null;
    } catch (error: any) {
      this.device.log(error);
      return null;
    }
  }

  async clientPost(endpoint: string, options?: any, headers?: RequestHeaders): Promise<boolean> {
    const response = await this.client.post(endpoint, options, headers);
    this.processResponseCode(response.status, response.message);

    return response?.status === Status.Ok;
  }

  async clientUpload(endpoint: string, data: FormData): Promise<boolean> {
    const response = await this.client.upload(endpoint, data);
    this.processResponseCode(response.status, response.message);

    return response?.status === Status.Ok;
  }

  async clientVerify(verify: boolean = false, user?: string, pass?: string): Promise<Status> {
    if (user && pass) {
      this.client.setCredentials(user, pass);
    }
    const response = await this.client.get('stats');

    if (verify) {
      this.processResponseCode(response.status, response.message);
    }

    return response.status;
  }

  processResponseCode(status: Status, message?: string): void {
    switch (status) {
      case Status.Ok:
        if (this.device.getAvailable()) {
          return;
        }

        this.device.setAvailable().catch((error: any) => this.device.log(error.message ?? error));
        this.device.failsReset();
        this.device.poll.start();
        return;

      case Status.AuthRequired:
        this.processUnavailability(this.device.homey.__('api.error.loginRequired'));
        return;

      case Status.AuthFailed:
        this.processUnavailability(this.device.homey.__('api.error.loginFailed'));
        return;

      default:
        this.processUnavailability(message ?? this.device.homey.__('api.error.unknownError'));
    }
  }

  processUnavailability(message: string): void {
    if (this.device.failsExceeded()) {
      this.device.setUnavailable(message).catch((error: any) => this.device.log(error));
      this.device.poll.extend();
    } else {
      this.device.failsAdd();
    }
  }

}
