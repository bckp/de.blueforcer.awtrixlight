import fs from 'fs';
import { Device, DiscoveryResultMDNSSD } from 'homey';
import ApiClient from '../../lib/awtrix3/Api/Client';
import { Status } from '../../lib/awtrix3/Api/Response';
import Api from '../../lib/awtrix3/Api/Api';
import { AwtrixStats, SettingOptions } from '../../lib/awtrix3/Types';
import { DeviceFailer, DevicePoll } from './interfaces';
import Icons from '../../lib/awtrix3/List/Icons';
import Poll from '../../lib/awtrix3/Poll';
import { AwtrixDeviceType } from '../awtrix-device-type';

const RebootFields: ['TIM', 'DAT', 'HUM', 'TEMP', 'BAT'] = ['TIM', 'DAT', 'HUM', 'TEMP', 'BAT'];
const PollInterval: number = 60000; // 1 minute
const PollIntervalLong: number = 300000; // 5 minutes

export default class AwtrixLightDevice extends Device implements DeviceFailer, DevicePoll {

  api!: Api;
  failCritical: boolean = false;
  failCount: number = 0;
  failThreshold: number = 3;

  icons!: Icons;
  poll!: Poll;

  getAwtrixDeviceType(): AwtrixDeviceType {
    return 'awtrix3';
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('AwtrixLightDevice has been initialized');
    try {
      await this.setUnavailable(this.homey.__('states.loading'));
      await this.migrate();
    } catch (error: any) {
      this.error(error.message || error);
    }
    // Setup flows
    this.initFlows();

    // Create API
    this.api = new Api(
      new ApiClient({ ip: this.getStoreValue('address') }),
      this,
    );
    // this.api.setDebug(true);

    // Create icons service
    this.icons = new Icons(
      this.api,
      this,
    );

    // Setup polling
    this.poll = new Poll(
      async () => {
        this.log('polling...');
        await this.refreshCapabilities();

        if (!this.getAvailable()) {
          await this.tryRediscover();
        }
      },
      this.homey,
      (error: unknown) => this.error(error),
      PollInterval,
      PollIntervalLong,
    );

    // Initialize API etc
    await this.initializeDevice();
  }

  async initializeDevice(): Promise<void> {
    // Setup user and pass if exists
    const settings = await this.getSettings();
    if (settings.user && settings.pass) {
      this.log('Setting user and pass');
      this.api.setCredentials(settings.user, settings.pass);
    }

    this.api.setDebug(process.env.DEBUG === '1');

    // Test device if possible
    if (await this.testDevice() !== Status.Ok) {
      this.log('Device not available, trying to rediscover');
      this.setUnavailable(this.homey.__('states.unavailable')).catch(this.error);
      this.tryRediscover();
    } else {
      await this.setAvailable();
    }
    this.poll.stop();

    // Setup polling
    try {
      this.failsReset();
      this.failsCritical(true);
      if (this.getAvailable()) {
        this.log('Device availalible');
        await this.refreshAll();
        this.connected();
      } else {
        this.log('Polling set to extended mode, device is not available');
      }
    } finally {
      this.poll.start();
      this.failsCritical(false);
    }

    this.registerCapabilityListener('button.rediscover', async (): Promise<void> => {
      this.log('Rediscover button pressed');
      try {
        // Device is OK, no need to rediscover
        if (await this.api.clientVerify(true) === Status.Ok) {
          return;
        }

        // Try to rediscover
        if (await this.tryRediscover()) {
          this.setCapabilityValue('ip', this.getStoreValue('address'));
          return;
        }
      } catch (error: any) {
        this.error(error);
      }

      throw new Error('Rediscovery failed');
    });
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('AwtrixLightDevice has been added');
    this.connected();

    this.setCapabilityValue('ip', this.getStoreValue('address'));

    // Upload files
    const directory = `${__dirname}/assets/images/icons`;
    let files: string[];
    try {
      files = await fs.promises.readdir(directory);
    } catch (cause) {
      this.error(new AggregateError([
        new Error('Failed to read bundled icon directory', { cause }),
      ], 'Failed to upload bundled AWTRIX 3 icons'));
      return;
    }

    const uploadErrors: Error[] = [];
    for (const file of files) {
      try {
        await this.api.uploadImage(fs.readFileSync(`${directory}/${file}`), file);
        this.icons.invalidate();
      } catch (cause) {
        uploadErrors.push(new Error(`Failed to upload bundled icon: ${file}`, { cause }));
      }
    }

    if (uploadErrors.length > 0) {
      this.error(new AggregateError(uploadErrors, 'Failed to upload bundled AWTRIX 3 icons'));
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log('AwtrixLightDevice settings where changed', oldSettings, newSettings, changedKeys);

    // If user or pass changed, update credentials
    const credentialsChanged = changedKeys.includes('user') || changedKeys.includes('pass');
    if (credentialsChanged && typeof newSettings.user === 'string' && typeof newSettings.pass === 'string') {
      const status = await this.testDevice(newSettings.user, newSettings.pass);
      if (status !== Status.Ok) {
        this.api.setCredentials(
          typeof oldSettings.user === 'string' ? oldSettings.user : '',
          typeof oldSettings.pass === 'string' ? oldSettings.pass : '',
        );

        const messageKey = status === Status.AuthRequired || status === Status.AuthFailed
          ? 'states.invalidCredentials'
          : 'states.deviceUnreachable';
        throw new Error(this.homey.__(messageKey));
      }

      // Enable pooling if not
      if (!this.poll.isActive()) {
        this.poll.start();
      }
    }

    await this.api.setSettings(newSettings);
    if (RebootFields.some((key: string) => changedKeys.includes(key))) {
      this.log('rebooting device');
      await this.api.reboot().catch(this.error);
    }
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('AwtrixLightDevice has been deleted');
    this.poll.stop();
  }

  onDiscoveryResult(discoveryResult: DiscoveryResultMDNSSD) {
    return discoveryResult.id === this.getData().id;
  }

  async onDiscoveryAvailable(discoveryResult: DiscoveryResultMDNSSD): Promise<boolean> {
    if ('address' in discoveryResult && this.getStoreValue('address') !== discoveryResult.address) {
      if (await this.onDiscoveryAddressChanged(discoveryResult)) {
        await this.setAvailable();
        return true;
      }
    }
    return false;
  }

  async onDiscoveryAddressChanged(discoveryResult: DiscoveryResultMDNSSD): Promise<boolean> {
    // Set IP
    this.api.setIp(discoveryResult.address);
    await this.setStoreValue('address', discoveryResult.address);
    await this.setCapabilityValue('ip', discoveryResult.address);

    // Verify
    try {
      return await this.testDevice() === Status.Ok;
    } catch (error) {
      this.error(error);
    }
    return false;
  }

  async refreshAll(): Promise<void> {
    const results = await Promise.allSettled([
      this.refreshCapabilities(),
      this.refreshSettings(),
      this.refreshEffects(),
    ]);
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to refresh AWTRIX 3 device state');
    }
  }

  async tryRediscover(): Promise<boolean> {
    try {
      const result = this.driver.getDiscoveryStrategy().getDiscoveryResult(this.getData().id);
      if (result && result instanceof DiscoveryResultMDNSSD && result.address) {
        return this.onDiscoveryAvailable(result);
      }
    } catch (error: any) {
      this.log('Discovery error: ', error);
    }
    return false;
  }

  async refreshEffects(): Promise<void> {
    this.setStoreValue('effects', await this.cmdGetEffects());
  }

  // Refresh device capabilities, this is expensive so we do not want to poll too often
  async refreshCapabilities(): Promise<void> {
    try {
      const stats = await this.cmdGetStats();
      this.log('refreshCapabilities', stats);
      if (!stats) {
        this.log('status endpoint failed');
        return;
      }

      await this.setCapabilityValues({
        // Battery
        measure_battery: stats.bat,

        // Measurements
        measure_humidity: stats.hum,
        measure_luminance: stats.lux,
        measure_temperature: stats.temp,

        // Indicators
        'alarm_generic.indicator1': !!stats.indicator1,
        'alarm_generic.indicator2': !!stats.indicator2,
        'alarm_generic.indicator3': !!stats.indicator3,

        // Display
        awtrix_matrix: !!stats.matrix,

        // RSSI
        rssi: stats.wifi_signal,
      });

      await this.setStoreValue('uptime', stats.uptime);
    } catch (error: any) {
      this.log(error.message || error);
    }
  }

  async refreshSettings(): Promise<void> {
    try {
      const settings = await this.cmdGetSettings();
      if (!settings) {
        this.log('settings endpoint failed');
        return;
      }

      await this.setSettings({
        TIM: !!settings.TIM,
        DAT: !!settings.DAT,
        HUM: !!settings.HUM,
        TEMP: !!settings.TEMP,
        BAT: !!settings.BAT,
        ABRI: !!settings.ABRI,
        ATRANS: !!settings.ATRANS,
        BLOCKN: !!settings.BLOCKN,
        UPPERCASE: !!settings.UPPERCASE,
        TEFF: settings?.TEFF?.toString(),
      });
    } catch (error: any) {
      this.log(error.message || error);
    }
  }

  connected() {
    this.cmdNotify('HOMEY', { color: '#FFFFFF', duration: '2', icon: 'homey' });
  }

  initFlows() {
    // Matrix
    this.registerCapabilityListener('awtrix_matrix', async (value) => this.cmdPower(value));

    // Buttons
    this.registerCapabilityListener('button_next', async () => this.cmdAppNext());
    this.registerCapabilityListener('button_prev', async () => this.cmdAppPrev());
  }

  async testDevice(user?: string, pass?: string): Promise<Status> {
    try {
      return await this.api.clientVerify(true, user, pass);
    } catch (error) {
      this.error(error);
      return Status.Error;
    }
  }

  async migrate() {
    this.log('Migrating device...');
    const capabilities = this.getCapabilities();
    this.log('onInit', capabilities);

    try {
      // Only reset capabilities if they are in bad order
      if (!(
        capabilities.indexOf('awtrix_matrix') > capabilities.indexOf('button_next')
        && capabilities.indexOf('button_next') > capabilities.indexOf('button_prev')
      )) {
        this.log('Capabilities are in bad order, resetting...');
        if (capabilities.includes('button_prev')) {
          await this.removeCapability('button_prev');
          this.log('removed capability button_prev');
        }
        if (capabilities.includes('button_next')) {
          await this.removeCapability('button_next');
          this.log('removed capability button_next');
        }
        if (capabilities.includes('awtrix_matrix')) {
          await this.removeCapability('awtrix_matrix');
          this.log('removed capability awtrix_matrix');
        }

        // Re/add in correct order
        this.log('re-add capabilities');
        await this.addCapability('button_prev');
        await this.addCapability('button_next');
        await this.addCapability('awtrix_matrix');
      }

      // Add rssi capability if not exists
      if (!capabilities.includes('rssi')) {
        await this.addCapability('rssi');
        this.log('added capability rssi');
      }

      // Add rssi capability if not exists
      if (!capabilities.includes('ip')) {
        await this.addCapability('ip');
        await this.setCapabilityValue('ip', this.getStoreValue('address'));
        this.log('added capability ip');
      }

      // Add rediscover
      if (!capabilities.includes('button.rediscover')) {
        await this.addCapability('button.rediscover');
      }
    } catch (error: any) {
      this.error(error);
    }
  }

  /** bckp ******* Commands ******* */
  async cmdNotify(msg: string, params: any): Promise<void> {
    await this.api.notify(msg, params);
  }

  async cmdCustomApp(name: string, params: any): Promise<void> {
    await this.api.customApp(name, params);
  }

  async cmdRemoveCustomApp(name: string): Promise<void> {
    await this.api.removeCustomApp(name);
  }

  async cmdDismiss(): Promise<void> {
    await this.api.dismiss();
  }

  async cmdRtttl(melody: string): Promise<void> {
    await this.api.rtttl(melody);
  }

  async cmdPower(power: boolean): Promise<void> {
    await this.api.power(power);
  }

  async cmdIndicator(id: number | string, options: any): Promise<void> {
    await this.api.indicator(id, options);
  }

  async cmdAppNext(): Promise<void> {
    await this.api.appNext();
  }

  async cmdAppPrev(): Promise<void> {
    await this.api.appPrev();
  }

  async cmdGetSettings(): Promise<SettingOptions|null> {
    try {
      return await this.api.getSettings();
    } catch (error: any) {
      this.error(error);
      return null;
    }
  }

  async cmdGetStats(): Promise<AwtrixStats|null> {
    try {
      return await this.api.getStats();
    } catch (error: any) {
      this.error(error);
      return null;
    }
  }

  async cmdGetEffects(): Promise<string[]|null> {
    try {
      return await this.api.getEffects();
    } catch (error: any) {
      this.error(error);
      return null;
    }
  }

  async setCapabilityValues(values: { [key: string]: any }): Promise<void> {
    await Promise.all(
      Object.entries(values).map(([key, value]) => this.setCapabilityValue(key, value)),
    );
  }

  /** bckp ******* API related ****** */
  failsReset(): void {
    this.failCount = 0;
  }

  failsAdd(): void {
    this.failCount += 1;
  }

  failsExceeded(): boolean {
    return this.failCritical || this.failCount >= this.failThreshold;
  }

  failsCritical(value: boolean): void {
    this.failCritical = value;
  }

}

module.exports = AwtrixLightDevice;
