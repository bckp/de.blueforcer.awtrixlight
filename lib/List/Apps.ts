import { Homey } from 'homey/lib/Device';
import { AppOptions } from '../Types';
import Api from '../Api/Api';
import AwtrixLightDevice from '../../drivers/awtrixlight/device';

type AppBase = {
  name: string,
  updated?: number,
};

type AppFull = AppBase & {
  options: AppOptions,
};

export default class Apps {

  device: AwtrixLightDevice;
  api: Api;

  constructor(api: Api, device: AwtrixLightDevice) {
    this.api = api;
    this.device = device;
  }

  async refresh(): Promise<string[]> {
    return [];
  }

  async find(query: string): Promise<AppBase[]> {
    return [];
  }

  async save(name: string, options: AppOptions): Promise<boolean> {
    return false;
  }

  async load(name: string): Promise<AppFull | null> {
    return null;
  }

}
