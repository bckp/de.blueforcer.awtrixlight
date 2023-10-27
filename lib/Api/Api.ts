import { Device } from 'homey';
import FormData from 'form-data';
import Client from './Client';
import {
  indicatorNumber,
  indicatorOptions,
  notifyOptions,
  powerOptions,
  settingOptions,
} from '../Normalizer';
import { Status } from './Response';
import { AwtrixImage, AwtrixStats, SettingOptions } from '../Types';
import { DeviceFailer } from '../../drivers/awtrixlight/failer';

export default class Api {

  client: Client;
  device: Device & DeviceFailer;

  constructor(client: Client, device: Device & DeviceFailer) {
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

  async notify(msg: string, options: any): Promise<boolean> {
    return this.clientPost('notify', notifyOptions({ ...options, text: msg }));
  }

  async setSettings(options: any): Promise<boolean> {
    return this.clientPost('settings', settingOptions(options));
  }

  async getSettings(): Promise<SettingOptions> {
    return this.clientGet('settings');
  }

  async getStats(): Promise<AwtrixStats> {
    return this.clientGet('stats');
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
  async clientGet<T>(endpoint: string): Promise<T> {
    const response = await this.client.get(endpoint);
    this.processResponseCode(response.status, response.message);

    return response.data || {};
  }

  async clientGetDirect(endpoint: string): Promise<any> {
    const response = await this.client.getDirect(endpoint);
    this.processResponseCode(response.status, response.message);

    return response.data || null;
  }

  async clientPost(endpoint: string, options?: any): Promise<boolean> {
    const response = await this.client.post(endpoint, options);
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
        return;

      case Status.AuthRequired:
        this.processUnavailability('Authentication required!');
        return;

      case Status.AuthFailed:
        this.processUnavailability('Authentication failed!');
        return;

      default:
        this.processUnavailability(message ?? 'Unknown error.');
    }
  }

  processUnavailability(message: string): void {
    if (this.device.failsExceeded()) {
      this.device.setUnavailable(message).catch((error: any) => this.device.log(error));
    } else {
      this.device.failsAdd();
    }
  }

}
