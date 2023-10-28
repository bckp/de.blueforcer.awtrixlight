import Device from 'homey/lib/Device';
import path from 'path';
import Api from '../Api/Api';
import { AwtrixImage, HomeyAwtrixIcon } from '../Types';

const Timeout = 120000; // 2 minutes

export default class Icons {

  api: Api;
  device: Device;
  empty: HomeyAwtrixIcon;

  list: HomeyAwtrixIcon[] = [];
  timer!: NodeJS.Timer;

  constructor(api: Api, device: Device) {
    this.api = api;
    this.device = device;
    this.empty = {
      name: this.device.homey.__('list.icons.empty.name'),
      id: '-',
      description: this.device.homey.__('list.icons.empty.description'),
    };
  }

  async find(query: string): Promise<HomeyAwtrixIcon[]> {
    return (await this.all()).filter((result) => {
      return result.name.toLowerCase().includes(query.toLowerCase());
    });
  }

  async all(): Promise<HomeyAwtrixIcon[]> {
    if (this.list.length === 0) {
      await this.loadIcons();
    }

    this.resetTimer();
    return this.list;
  }

  resetTimer(): void {
    this.device.homey.clearTimeout(this.timer);
    this.timer = this.device.homey.setTimeout(() => {
      this.list = [];
    }, Timeout);
  }

  async loadIcons(): Promise<void> {
    const icons = await this.api.getImages().catch(this.device.error) || [];
    this.list = [
      this.empty,
      ...icons.map((icon: AwtrixImage): HomeyAwtrixIcon => {
        const value: string = path.parse(icon.name).name;

        return {
          name: value,
          id: value,
        };
      }),
    ];
  }

}
