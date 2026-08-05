import fs from 'fs';
import { Device } from 'homey';
import path from 'path';
import AxiosAwtrixNgHttpTransport from '../../lib/awtrixng/Http/AxiosTransport';
import AwtrixNgClient from '../../lib/awtrixng/Api/Client';
import { AwtrixNgAvailabilityState, toAwtrixNgAvailabilityState } from '../../lib/awtrixng/Device/Availability';
import {
  runAwtrixNgMatrixPowerCapability,
  runAwtrixNgNextAppCapability,
  runAwtrixNgPreviousAppCapability,
  runAwtrixNgWeatherOverlayCapability,
} from '../../lib/awtrixng/Device/Controls';
import { createAwtrixNgCapabilityUpdatePlan } from '../../lib/awtrixng/Device/State';
import { AwtrixNgDeviceProbeResult, probeAwtrixNgDevice, toAwtrixNgBaseUrl } from '../../lib/awtrixng/Discovery/Detection';
import { AwtrixNgBasicAuthOptions } from '../../lib/awtrixng/Http/Transport';
import AwtrixNgIcons from '../../lib/awtrixng/Services/Icons';
import {
  applyAwtrixNgBuiltinAppSettingsChange,
  isAwtrixNgBuiltinAppSetting,
  toAwtrixNgBuiltinAppSettingsUpdate,
} from '../../lib/awtrixng/Services/Apps';
import {
  AwtrixNgWeatherOverlayCapabilityId,
  toAwtrixNgHomeyWeatherOverlayValue,
} from '../../lib/awtrixng/Services/Display';
import AwtrixNgPoll from '../../lib/awtrixng/Device/Poll';
import {
  AwtrixNgHomeySettings,
  applyAwtrixNgHomeySettingsChange,
  hasAwtrixNgLocalSettingsChange,
  toAwtrixNgHomeySettingsUpdate,
} from '../../lib/awtrixng/Services/Settings';
import { AwtrixNgApiDeviceStateResponse } from '../../lib/awtrixng/Api/Types';
import { AwtrixDeviceType } from '../awtrix-device-type';

const PollIntervalMs = 60000;
const BundledIconsDirectory = path.join(__dirname, 'assets/images/icons');

interface AwtrixNgDeviceStore {
  baseUrl?: string;
  address?: string;
  port?: number;
}

interface AwtrixNgDeviceSettings extends AwtrixNgHomeySettings {
  authUser?: string;
  authPass?: string;
}

interface AwtrixNgDeviceSettingsChange {
  oldSettings: AwtrixNgHomeySettings;
  newSettings: AwtrixNgHomeySettings;
  changedKeys: string[];
}

class AwtrixNgDevice extends Device {

  client?: AwtrixNgClient;

  icons?: AwtrixNgIcons;

  poll?: AwtrixNgPoll;

  getAwtrixDeviceType(): AwtrixDeviceType {
    return 'awtrixng';
  }

  async onInit(): Promise<void> {
    this.log('AwtrixNgDevice has been initialized');

    const baseUrl = this.getBaseUrlFromStore();

    if (baseUrl === undefined) {
      await this.setUnavailable('Device address is not configured yet.');
      return;
    }

    this.configureClient(baseUrl, await this.getSettings() as AwtrixNgDeviceSettings);
    this.initCapabilityListeners();

    this.poll = new AwtrixNgPoll(async () => {
      await this.refreshDeviceState({ allowAddCapabilities: false });
    }, this.homey, PollIntervalMs);

    const deviceStateResult = await this.refreshDeviceState({ allowAddCapabilities: true });

    if (deviceStateResult?.status === 'detected') {
      await this.refreshSettingsFromDevice();
      await this.refreshDisplayFromDevice();
      await this.refreshAppsFromDevice();
    }

    this.poll.start();
  }

  async onAdded(): Promise<void> {
    this.log('AwtrixNgDevice has been added');
    await this.uploadBundledIcons();
  }

  async onDeleted(): Promise<void> {
    this.log('AwtrixNgDevice has been deleted');
    this.poll?.stop();
  }

  async onSettings({ oldSettings, newSettings, changedKeys }: AwtrixNgDeviceSettingsChange): Promise<void> {
    this.log('AwtrixNgDevice settings were changed', oldSettings, newSettings, changedKeys);

    const baseUrl = this.getBaseUrlFromStore();

    if (baseUrl === undefined) {
      throw new Error('Device address is not configured yet.');
    }

    if (hasAwtrixNgLocalSettingsChange(changedKeys)) {
      this.configureClient(baseUrl, newSettings as AwtrixNgDeviceSettings);
    }

    const client = this.getClient();

    await applyAwtrixNgBuiltinAppSettingsChange(client, newSettings, changedKeys);
    await applyAwtrixNgHomeySettingsChange(
      client,
      newSettings,
      changedKeys.filter((key) => !isAwtrixNgBuiltinAppSetting(key)),
    );
  }

  async refreshAvailability(): Promise<AwtrixNgDeviceProbeResult | undefined> {
    return this.refreshDeviceState({ allowAddCapabilities: false });
  }

  private initCapabilityListeners(): void {
    this.registerCapabilityListener('awtrix_matrix', async (value: unknown): Promise<void> => {
      await runAwtrixNgMatrixPowerCapability(this.getClient(), value);
    });

    this.registerCapabilityListener('button_next', async (): Promise<void> => {
      await runAwtrixNgNextAppCapability(this.getClient());
    });

    this.registerCapabilityListener('button_prev', async (): Promise<void> => {
      await runAwtrixNgPreviousAppCapability(this.getClient());
    });

    this.registerCapabilityListener(AwtrixNgWeatherOverlayCapabilityId, async (value: unknown): Promise<void> => {
      await runAwtrixNgWeatherOverlayCapability(this.getClient(), value);
    });
  }

  private getClient(): AwtrixNgClient {
    if (this.client === undefined) {
      throw new Error('Device client is not initialized.');
    }

    return this.client;
  }

  async refreshDeviceState(options: { allowAddCapabilities: boolean }): Promise<AwtrixNgDeviceProbeResult | undefined> {
    if (this.client === undefined) {
      await this.setUnavailable('Device client is not initialized.');
      return undefined;
    }

    const result = await probeAwtrixNgDevice(this.client);

    if (result.status === 'detected') {
      await this.applyDeviceState(result.device, options.allowAddCapabilities);
      await this.setAvailable();
      return result;
    }

    const availability = toAwtrixNgAvailabilityState(result) as Extract<AwtrixNgAvailabilityState, { available: false }>;

    await this.setUnavailable(availability.message);

    return result;
  }

  private async refreshSettingsFromDevice(): Promise<void> {
    const apiSettings = await this.getClient().getSettings();
    const currentSettings = await this.getSettings() as AwtrixNgHomeySettings;
    const homeySettingsUpdate = toAwtrixNgHomeySettingsUpdate(apiSettings, currentSettings);

    if (Object.keys(homeySettingsUpdate).length > 0) {
      await this.setSettings(homeySettingsUpdate);
    }
  }

  private async refreshDisplayFromDevice(): Promise<void> {
    const display = await this.getClient().getDisplay();
    const weatherOverlay = toAwtrixNgHomeyWeatherOverlayValue(display.overlay);

    if (this.hasCapability(AwtrixNgWeatherOverlayCapabilityId)) {
      await this.setCapabilityValue(AwtrixNgWeatherOverlayCapabilityId, weatherOverlay);
    }
  }

  private async refreshAppsFromDevice(): Promise<void> {
    const apps = await this.getClient().getApps();
    const currentSettings = await this.getSettings() as AwtrixNgHomeySettings;
    const homeySettingsUpdate = toAwtrixNgBuiltinAppSettingsUpdate(apps, currentSettings);

    if (Object.keys(homeySettingsUpdate).length > 0) {
      await this.setSettings(homeySettingsUpdate);
    }
  }

  private async applyDeviceState(deviceState: AwtrixNgApiDeviceStateResponse, allowAddCapabilities: boolean): Promise<void> {
    const plan = createAwtrixNgCapabilityUpdatePlan(deviceState, this.getCapabilities(), {
      allowAddCapabilities,
    });

    for (const capabilityId of plan.capabilitiesToAdd) {
      if (!this.hasCapability(capabilityId)) {
        await this.addCapability(capabilityId);
      }
    }

    for (const update of plan.valuesToSet) {
      if (this.hasCapability(update.capabilityId)) {
        await this.setCapabilityValue(update.capabilityId, update.value);
      }
    }
  }

  private configureClient(baseUrl: string, settings: AwtrixNgDeviceSettings): void {
    this.client = new AwtrixNgClient(new AxiosAwtrixNgHttpTransport({
      baseUrl,
      auth: this.getAuthFromSettingsSnapshot(settings),
      debug: process.env.DEBUG === '1',
      log: this.log.bind(this),
    }));
    this.icons = new AwtrixNgIcons(this.client, {
      emptyIcon: {
        name: this.homey.__('list.icons.empty.name'),
        id: '-',
        description: this.homey.__('list.icons.empty.description'),
      },
      timerHost: this.homey,
    });
  }

  private async uploadBundledIcons(): Promise<void> {
    if (this.icons === undefined) {
      throw new Error('Icon service is not initialized.');
    }

    const iconFiles = fs.readdirSync(BundledIconsDirectory)
      .filter((fileName) => fs.statSync(path.join(BundledIconsDirectory, fileName)).isFile());

    for (const fileName of iconFiles) {
      await this.icons.upload({
        fileName,
        body: fs.readFileSync(path.join(BundledIconsDirectory, fileName)),
      });
    }
  }

  private getBaseUrlFromStore(): string | undefined {
    const store = this.getStoreSnapshot();

    if (store.baseUrl !== undefined) {
      return store.baseUrl;
    }

    if (store.address !== undefined && store.port !== undefined) {
      return toAwtrixNgBaseUrl({
        address: store.address,
        port: store.port,
      });
    }

    return undefined;
  }

  private getStoreSnapshot(): AwtrixNgDeviceStore {
    const baseUrl = this.getStoreValue('baseUrl') as unknown;
    const address = this.getStoreValue('address') as unknown;
    const port = this.getStoreValue('port') as unknown;

    return {
      baseUrl: typeof baseUrl === 'string' && baseUrl.length > 0 ? baseUrl : undefined,
      address: typeof address === 'string' && address.length > 0 ? address : undefined,
      port: typeof port === 'number' ? port : undefined,
    };
  }

  private getAuthFromSettingsSnapshot(settings: AwtrixNgDeviceSettings): AwtrixNgBasicAuthOptions | undefined {
    if (typeof settings.authUser === 'string' && settings.authUser.length > 0
      && typeof settings.authPass === 'string' && settings.authPass.length > 0) {
      return {
        username: settings.authUser,
        password: settings.authPass,
      };
    }

    return undefined;
  }

}

export default AwtrixNgDevice;
module.exports = AwtrixNgDevice;
