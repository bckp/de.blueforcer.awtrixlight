import { Device } from 'homey';
import FormData from 'form-data';
import Client, { RequestHeaders } from './Client';
import {
  indicatorNumber,
  indicatorOptions,
  notifyOptions,
  powerOptions,
  settingOptions,
  appName,
  appOptions,
} from '../Normalizer';
import { Status } from './Response';
import { AwtrixImage, AwtrixStats, SettingOptions } from '../Types';
import { DeviceFailer, DevicePoll } from '../../../drivers/awtrixlight/interfaces';

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

  async #requireOk(promise: Promise<boolean>): Promise<void> {
    if (!await promise) {
      throw new Error(this.device.homey.__('api.error.commandFailed'));
    }
  }

  /** bckp ******* Commands ******* */
  async dismiss(): Promise<void> {
    await this.#requireOk(this.clientPost('notify/dismiss'));
  }

  async rtttl(melody: string): Promise<void> {
    await this.#requireOk(this.clientPost('rtttl', melody, { 'Content-Type': 'text/plain' }));
  }

  async power(power: boolean): Promise<void> {
    await this.#requireOk(this.clientPost('power', powerOptions({ power })));
  }

  async indicator(id: number | string, options: any): Promise<void> {
    await this.#requireOk(this.clientPost(`indicator${indicatorNumber(id)}`, indicatorOptions(options)));
  }

  async appNext(): Promise<void> {
    await this.#requireOk(this.clientPost('nextapp'));
  }

  async appPrev(): Promise<void> {
    await this.#requireOk(this.clientPost('previousapp'));
  }

  async reboot(): Promise<void> {
    await this.#requireOk(this.clientPost('reboot'));
  }

  async notify(msg: string, options: any): Promise<void> {
    await this.#requireOk(this.clientPost('notify', notifyOptions({ text: msg, ...options }, this.device.getStoreValue('effects') || [])));
  }

  async customApp(name: string, options: any): Promise<void> {
    await this.#requireOk(this.clientPost(`custom?name=${encodeURIComponent(appName(name))}`, appOptions(options, this.device.getStoreValue('effects') || [])));
  }

  async removeCustomApp(name: string): Promise<void> {
    await this.#requireOk(this.clientPost(`custom?name=${encodeURIComponent(appName(name))}`, {}));
  }

  async setSettings(options: any): Promise<void> {
    await this.#requireOk(this.clientPost('settings', settingOptions(options)));
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

  async uploadImage(data: any, name: string): Promise<void> {
    const form = new FormData();
    form.append('image', data, { filepath: `/ICONS/${name}` });

    await this.#requireOk(this.clientUpload('edit', form));
  }

  async getImages(): Promise<AwtrixImage[]> {
    return this.clientGetDirect('list?dir=/ICONS/');
  }

  /** bckp ******* NETWORK LAYER  ******* */
  async clientGet<T>(endpoint: string): Promise<T|null> {
    try {
      const response = await this.client.get(endpoint);
      await this.processResponseCode(response.status, response.message);

      return response.data ?? null;
    } catch (error: any) {
      this.device.log(error);
      return null;
    }
  }

  async clientGetDirect(endpoint: string): Promise<any> {
    try {
      const response = await this.client.getDirect(endpoint);
      await this.processResponseCode(response.status, response.message);

      return response.data ?? null;
    } catch (error: any) {
      this.device.log(error);
      return null;
    }
  }

  async clientPost(endpoint: string, options?: any, headers?: RequestHeaders): Promise<boolean> {
    const response = await this.client.post(endpoint, options, headers);
    await this.processResponseCode(response.status, response.message);

    return response?.status === Status.Ok;
  }

  async clientUpload(endpoint: string, data: FormData): Promise<boolean> {
    const response = await this.client.upload(endpoint, data);
    await this.processResponseCode(response.status, response.message);

    return response?.status === Status.Ok;
  }

  async clientVerify(verify: boolean = false, user?: string, pass?: string): Promise<Status> {
    if (user && pass) {
      this.client.setCredentials(user, pass);
    }
    const response = await this.client.get('stats');

    if (verify) {
      await this.processResponseCode(response.status, response.message);
    }

    return response.status;
  }

  async processResponseCode(status: Status, message?: string): Promise<void> {
    switch (status) {
      case Status.Ok:
        this.device.failsReset();
        if (this.device.getAvailable()) {
          return;
        }

        await this.device.setAvailable();
        this.device.poll.start();
        return;

      case Status.AuthRequired:
        await this.processUnavailability(this.device.homey.__('api.error.loginRequired'));
        return;

      case Status.AuthFailed:
        await this.processUnavailability(this.device.homey.__('api.error.loginFailed'));
        return;

      default:
        await this.processUnavailability(message ?? this.device.homey.__('api.error.unknownError'));
    }
  }

  async processUnavailability(message: string): Promise<void> {
    this.device.failsAdd();
    if (!this.device.failsExceeded() || this.device.poll.isExtended()) {
      return;
    }

    this.device.poll.extend();
    await this.device.setUnavailable(message);
  }

}
