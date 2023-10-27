import fs from 'fs';
// import mime from 'mime-types';
import { Device, DiscoveryResultMDNSSD } from 'homey';
import ApiClient from '../../lib/Api/Client';
import { Status } from '../../lib/Api/Response';
import Api from '../../lib/Api/Api';
import { AwtrixImage, AwtrixStats, SettingOptions } from '../../lib/Types';

const RebootFields: ['TIM', 'DAT', 'HUM', 'TEMP', 'BAT'] = ['TIM', 'DAT', 'HUM', 'TEMP', 'BAT'];
const PollInterval: number = 30000;

export default class AwtrixLightDevice extends Device {

  api!: Api;
  pool!: NodeJS.Timeout;
  failCritical: boolean = false;
  failCount: number = 0;
  failThreshold: number = 3;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('AwtrixLightDevice has been initialized');
    await this.setUnavailable(this.homey.__('loading'));
    await this.migrate();

    // Setup flows
    this.initFlows();

    // Create API
    this.api = new Api(
      new ApiClient({ ip: this.getStoreValue('address') }),
      this,
    );

    // Setup user and pass if exists
    const settings = await this.getSettings();
    if (settings.user && settings.pass) {
      this.log('Setting user and pass');
      this.api.setCredentials(settings.user, settings.pass);
    }

    // Test device if possible
    if (!await this.testDevice()) {
      this.tryRediscover();
    }
    this.homey.clearInterval(this.poll);

    // Setup polling
    try {
      this.failsReset();
      this.failsCritical(true);
      if (this.getAvailable()) {
        this.log('Device availalible');
        this.refreshAll();
        this.initPolling();
        this.connected();
      } else {
        this.log('Pooling not set, there is issue with device');
      }
    } finally {
      this.failsCritical(false);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('AwtrixLightDevice has been added');
    this.connected();

    // Upload files
    fs.readdir(`${__dirname}/assets/images/icons`, (err, files) => {
      if (files) {
        files.forEach((file) => this.api.uploadImage(fs.readFileSync(`${__dirname}/assets/images/icons/${file}`), file));
      }

      if (err) {
        this.log(err);
      }
    });
  }

  async onSettings({ oldSettings, newSettings, changedKeys }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log('AwtrixLightDevice settings where changed', oldSettings, newSettings, changedKeys);

    // If user or pass changed, update credentials
    if (typeof newSettings.user === 'string' && typeof newSettings.pass === 'string') {
      if (!await this.testDevice(newSettings.user, newSettings.pass)) {
        this.api.setCredentials(
          typeof oldSettings.user === 'string' ? oldSettings.user : '',
          typeof oldSettings.pass === 'string' ? oldSettings.pass : '',
        );
        throw new Error(this.homey.__('login.invalidCredentials'));
      }

      // Enable pooling if not
      if (!this.poll) {
        this.initPolling();
      }
    }

    this.api.setSettings(newSettings).catch(this.error);
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
    this.homey.clearInterval(this.poll);
  }

  onDiscoveryResult(discoveryResult: DiscoveryResultMDNSSD) {
    return discoveryResult.id === this.getData().id;
  }

  async onDiscoveryAvailable(discoveryResult: DiscoveryResultMDNSSD) {
    if ('address' in discoveryResult && this.getStoreValue('address') !== discoveryResult.address) {
      this.onDiscoveryAddressChanged(discoveryResult);
      await this.setAvailable();
    }
  }

  onDiscoveryAddressChanged(discoveryResult: DiscoveryResultMDNSSD) {
    this.api.setIp(discoveryResult.address);
    this.setStoreValue('address', discoveryResult.address).catch((error) => this.error(error));
    this.testDevice().then((result) => this.log('Device address changed with result: ', result));
  }

  refreshAll() {
    this.refreshCapabilities();
    this.refreshSettings();
    this.refreshApps();
  }

  tryRediscover() {
    const result = this.driver.getDiscoveryStrategy().getDiscoveryResult(this.getData().id);
    if (result && result instanceof DiscoveryResultMDNSSD) {
      this.onDiscoveryAvailable(result);
    }
  }

  // Refresh device capabilities, this is expensive so we do not want to poll too often
  async refreshCapabilities(): Promise<void> {
    try {
      const stats = await this.cmdGetStats();
      if (!stats) {
        this.log('status endpoint failed');
        return;
      }

      // Battery
      this.setCapabilityValue('measure_battery', stats.bat);

      // Measurements
      this.setCapabilityValue('measure_humidity', stats.hum);
      this.setCapabilityValue('measure_luminance', stats.lux);
      this.setCapabilityValue('measure_temperature', stats.temp);

      // Indicators
      this.setCapabilityValue('alarm_generic.indicator1', !!stats.indicator1);
      this.setCapabilityValue('alarm_generic.indicator2', !!stats.indicator2);
      this.setCapabilityValue('alarm_generic.indicator3', !!stats.indicator3);

      // Display
      this.setCapabilityValue('awtrix_matrix', !!stats.matrix);

      // RSSI
      this.setCapabilityValue('rssi', stats.wifi_signal);

      if (stats.uptime <= this.getStoreValue('uptime')) {
        this.log('reboot detected');
        this.refreshApps().catch((error) => this.error);
      }

      this.setStoreValue('uptime', stats.uptime);
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

      this.setSettings({
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
    } catch (error: any ) {
      this.log(error.message || error);
    };
  }

  connected() {
    this.api.notify('HOMEY', { color: '#FFFFFF', duration: '2', icon: 'homey' });
  }

  async refreshApps() {
    return [];
    /*
    const homeyApps = this.getStoreKeys().filter((key) => DataNormalizer.isHomeyApp(key));
    const awtrixApps = this.api.getApps().then((apps) => {

      //TODO: verify all apps are ok, or we need to resync them
    });
    return awtrixApps;
    */
  }

  initFlows() {
    // Matrix
    this.registerCapabilityListener('awtrix_matrix', async (value) => this.cmdPower(value));

    // Buttons
    this.registerCapabilityListener('button_next', async () => this.cmdAppNext());
    this.registerCapabilityListener('button_prev', async () => this.cmdAppPrev());
  }

  initPolling() {
    this.homey.clearInterval(this.poll);
    this.poll = this.homey.setInterval(async () => {
      this.log('polling...');
      this.refreshCapabilities();

      if (!this.getAvailable()) {
        this.tryRediscover();
      }
    }, PollInterval);
  }

  async testDevice(user?: string, pass?: string) {
    const status = await this.api.clientVerify(true, user, pass).catch(this.error);
    if (status === Status.Ok) {
      return true;
    }

    return false;
  }

  async migrate() {
    ['button_prev', 'button_next', 'awtrix_matrix'].forEach(async (name) => {
      if (this.hasCapability(name)) {
        await this.removeCapability(name);
      }
    });

    await this.addCapability('button_prev');
    await this.addCapability('button_next');
    await this.addCapability('awtrix_matrix');

    // Add rssi capability if not exists
    if (!this.hasCapability('rssi')) {
      await this.addCapability('rssi');
    }
  }

  /** bckp ******* Commands ******* */
  async cmdNotify(msg: string, params: any): Promise<void> {
    this.api.notify(msg, params).catch(this.error);
  }

  async cmdDismiss(): Promise<void> {
    this.api.dismiss().catch(this.error);
  }

  async cmdRtttl(melody: string): Promise<void> {
    this.api.rtttl(melody).catch(this.error);
  }

  async cmdPower(power: boolean): Promise<void> {
    this.api.power(power).catch(this.error);
  }

  async cmdIndicator(id: number | string, options: any): Promise<void> {
    this.api.indicator(id, options).catch(this.error);
  }

  async cmdAppNext(): Promise<void> {
    this.api.appNext().catch(this.error);
  }

  async cmdAppPrev(): Promise<void> {
    this.api.appPrev().catch(this.error);
  }

  async cmdReboot(): Promise<void> {
    this.api.reboot().catch(this.error);
  }

  async cmdSetSettings(options: any): Promise<void> {
    this.api.setSettings(options).catch(this.error);
  }

  async cmdGetSettings(): Promise<SettingOptions|void> {
    return this.api.getSettings().catch(this.error);
  }

  async cmdGetStats(): Promise<AwtrixStats|void> {
    return this.api.getStats().catch(this.error);
  }

  async cmdGetImages(): Promise<AwtrixImage[]|void> {
    return this.api.getImages().catch(this.error);
  }

  /** bckp ******* API related ****** */
  failsReset(): void {
    this.failCount = 0;
  }

  failsAdd(): void {
    this.failCount++;
  }

  failsExceeded(): boolean {
    return this.failCritical || this.failCount >= this.failThreshold;
  }

  failsCritical(value: boolean): void {
    this.failCritical = value;
  }

};
