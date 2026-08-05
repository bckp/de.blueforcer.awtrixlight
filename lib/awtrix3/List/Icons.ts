import Device from 'homey/lib/Device';
import path from 'path';
import Api from '../Api/Api';
import { AwtrixImage, HomeyAwtrixIcon } from '../Types';

// AWTRIX 3 parses an expensive HTML icon provider, so retain the longer cache duration.
const CacheTtlMs = 120000;

export default class Icons {

  api: Api;
  device: Device;
  empty: HomeyAwtrixIcon;

  list: HomeyAwtrixIcon[] = [];
  private inFlight?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;

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
      this.inFlight ??= this.loadIcons().finally(() => {
        this.inFlight = undefined;
      });
      await this.inFlight;
    }

    this.resetTimer();
    return this.list;
  }

  resetTimer(): void {
    if (this.timer !== undefined) {
      this.device.homey.clearTimeout(this.timer);
    }
    this.timer = this.device.homey.setTimeout(() => {
      this.list = [];
      this.timer = undefined;
    }, CacheTtlMs);
  }

  invalidate(): void {
    this.list = [];

    if (this.timer !== undefined) {
      this.device.homey.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  async loadIcons(): Promise<void> {
    const icons = await this.api.getImages();
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
