import fs from 'fs';
// import mime from 'mime-types';
import { Device } from 'homey';
import { indicatorNumber, indicatorOptions, powerOptions, settingOptions } from '../../lib/Normalizer';
import ApiClient from '../../lib/Api/Client';
import { Status } from '../../lib/Api/Response';
import Api from '../../lib/Api/Api';

module.exports = class AwtrixLightDevice extends Device {

  static RebootFields = ['TIM', 'DAT', 'HUM', 'TEMP', 'BAT'];
  static PollInterval = 30000;

  // @deprecated
  static REBOOT_FIELDS = ['TIM', 'DAT', 'HUM', 'TEMP', 'BAT'];
  // @deprecated
  static POLL_INTERVAL = 60000;

  api!: Api;

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

    // Clear interval and verify device
    this.testDevice().then((result) => {
      this.homey.clearInterval(this.poll);
      result = result || this.tryRediscover();
      if (result) {
        this.log('Device availalible');

        // Refresh all data
        this.refreshAll();

        // Initialize polling
        this.initPolling();

        // Welcome message
        this.connected();
      } else {
        this.log('Pooling not set, there is issue with device');
      }
    }).catch((error) => this.error);
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('AwtrixLightDevice has been added');
    this.connected();

    // Upload files
    fs.readdir(`${__dirname}/assets/images/icons`, (err, files) => {
      if (err) {
        this.error(err);
        return;
      }

      if (!files) {
        return;
      }

      files.forEach((file) => this.api._uploadImage(file, fs.readFileSync(`${__dirname}/assets/images/icons/${file}`)));
    });
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('AwtrixLightDevice settings where changed', oldSettings, newSettings, changedKeys);

    // If user or pass changed, update credentials
    if (changedKeys.some((key) => ['user', 'pass'].includes(key))) {
      this.log('New user and password set, testing...');
      this.api.setCredentials(newSettings.user, newSettings.pass);
      const test = await this.api.test();
      if (test.state === AwtrixClientResponses.LoginFailed) {
        throw new Error(this.homey.__('login.invalidCredentials'));
      }

      if (test.state !== AwtrixClientResponses.Ok) {
        throw new Error('Unknown error');
      }

      if (!this.poll) {
        this.initPolling();
      }
    }

    const set = DataNormalizer.settings(newSettings);
    this.log('settings', set);

    // Save settings
    await this.api.setSettings(DataNormalizer.settings(newSettings));

    // Reboot if needed
    if (changedKeys.some((key) => AwtrixLightDevice.REBOOT_FIELDS.includes(key))) {
      this.log('rebooting device');
      await this.api.reboot();
    }
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('AwtrixLightDevice has been deleted');

    this.homey.clearInterval(this.poll);
  }

  onDiscoveryResult(discoveryResult) {
    return discoveryResult.id === this.getData().id;
  }

  async onDiscoveryAvailable(discoveryResult) {
    if ('address' in discoveryResult && this.getStoreValue('address') !== discoveryResult.address) {
      this.onDiscoveryAddressChanged(discoveryResult);
      await this.setAvailableIfNot();
    }
  }

  onDiscoveryAddressChanged(discoveryResult) {
    this.api.setIp(discoveryResult.address);
    this.setStoreValue('address', discoveryResult.address).catch((error) => this.error(error));
    this.testDevice().then((result) => this.log('address change with result', result));
  }

  refreshAll() {
    this.refreshCapabilities();
    this.refreshSettings();
    this.refreshApps();
  }

  tryRediscover() {
    const result = this.driver.getDiscoveryStrategy().getDiscoveryResult(this.getData().id);
    if (result) {
      this.onDiscoveryAvailable(result);
    }
  }

  // Refresh device capabilities, this is expensive so we do not want to poll too often
  async refreshCapabilities() {
    const stats = await this.api.getStats();
    this.api.getStats().then((stats) => {
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
      this.setCapabilityValue('awtrix_matrix', !!stats.matrix); // check data

      if (stats.uptime <= this.getStoreValue('uptime')) {
        this.log('reboot detected');
        this.refreshApps().catch((error) => this.error);
      }

      this.setStoreValue('uptime', stats.uptime);
      this.setAvailableIfNot();
    }).catch((error) => {
      this.setUnavailable(error?.cause?.code || 'unknown error').catch(this.error);
      this.log(error.message ?? 'unknown error');
    });
  }

  refreshSettings() {
    this.api.getSettings().then((settings) => {
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

      this.setAvailableIfNot();
    }).catch((error) => {
      this.setUnavailable(error?.cause?.code || 'unknown error').catch(this.error);
      this.log(error.message ?? 'unknown error');
    });
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
    this.registerCapabilityListener('awtrix_matrix', async (value) => this.api.power(value));

    // Buttons
    this.registerCapabilityListener('button_next', async (value) => this.api.appNext());
    this.registerCapabilityListener('button_prev', async (value) => this.api.appPrev());
  }

  initPolling() {
    this.homey.clearInterval(this.poll);
    this.poll = this.homey.setInterval(async () => {
      this.log('polling...');
      this.refreshCapabilities();

      if (!this.getAvailable()) {
        this.tryRediscover();
      }
    }, AwtrixLightDevice.POLL_INTERVAL);
  }

  async testDevice() {
    return this.api.test().then((result) => {
      this.log(result);
      switch (result.state) {
        case AwtrixClientResponses.LoginRequired:
          this.setUnavailable('Repair required!').catch(this.error);
          return false;

        case AwtrixClientResponses.NotFound:
          this.setUnavailable('Device not found!').catch(this.error);
          return false;

        case AwtrixClientResponses.Error:
          this.setUnavailable('Network error!').catch(this.error);
          return false;

        default:
          this.setAvailable().catch(this.error);
      }
      return true;
    });
  }

  async setAvailableIfNot() {
    if (this.getAvailable()) {
      return;
    }
    this.setAvailable().catch(this.error);
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
  }


  async notify(msg, params) {
    return this.api.notify(msg, params).catch((error) => this.error);
  }


  /** bckp ******* Commands ******* */
  async cmdDismiss() {
    return this.clientPost('notify/dismiss');
  }

  async cmdRtttl(melody: string): Promise<boolean> {
    return this.clientPost('rtttl', melody);
  }

  async cmdPower(power: boolean): Promise<boolean> {
    return this.clientPost('power', powerOptions({ power }));
  }

  async cmdIndicator(id: number | string, options: any): Promise<boolean> {
    return this.clientPost(`indicator${indicatorNumber(id)}`, indicatorOptions(options));
  }

  async cmdAppNext(): Promise<boolean> {
    return this.clientPost('nextapp');
  }

  async cmdAppPrev(): Promise<boolean> {
    return this.clientPost('previousapp');
  }

  async cmdReboot(): Promise<boolean> {
    return this.clientPost('reboot');
  }

  async cmdSetSettings(options: any): Promise<boolean> {
    return this.clientPost('settings', settingOptions(options));
  }

  async cmdGetSettings(): Promise<object> {
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

  processResponseCode(status: Status, message?: string): void {
    switch (status) {
      case Status.Ok:
        this.setAvailableIfNot();
        return;

      case Status.AuthRequired:
        this.setUnavailable('Authentication required!').catch((error) => this.log(error));
        return;

      case Status.AuthFailed:
        this.setUnavailable('Authentication failed!').catch((error) => this.log(error));
        return;

      default:
        this.setUnavailable(message ?? 'Unknown error.').catch((error) => this.log(error));
    }
  }

};