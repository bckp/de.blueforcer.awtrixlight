'use strict';

const fs = require('fs');
const mime = require('mime-types');
const { Device } = require('homey');
const AwtrixClient = require('../../lib/AwtrixClient');
const AwtrixClientResponses = require('../../lib/AwtrixClientResponses');
const DataNormalizer = require('../../lib/DataNormalizer');

module.exports = class AwtrixLightDevice extends Device {

  static REBOOT_FIELDS = ['TIM', 'DAT', 'HUM', 'TEMP', 'BAT'];
  static POLL_INTERVAL = 60000;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('AwtrixLightDevice has been initialized');
    await this.setUnavailable(this.homey.__('loading'));

    // Setup flows
    this.initFlows();

    // Create API
    this.api = new AwtrixClient({ ip: this.getStoreValue('address') });

    // this.api.setDebug(true);

    // Setup user and pass if exists
    const settings = await this.getSettings();
    if (settings.user && settings.pass) {
      this.log('Setting user and pass');
      this.api.setCredentials(settings.user, settings.pass);
    }

    // Clear interval and verify device
    this.testDevice().then((result) => {
      this.homey.clearInterval(this.poll);
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
      if (!files) {
        return;
      }

      files.forEach((file) => this.api._uploadImage(file, fs.readFileSync(`${__dirname}/assets/images/icons/${file}`), mime.lookup(file)));
    }).error((error) => {
      this.log(error);
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
      if (test.state !== AwtrixClientResponses.Ok) {
        return Promise.reject(new Error('username or password not valid'));
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
      this.api.reboot();
    }

    return true;
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
    this.api.setIp(discoveryResult.address);
    this.setAvailable();
  }

  onDiscoveryAddressChanged(discoveryResult) {
    this.api.ip(discoveryResult.address);
    this.api.getStats().then((stats) => {
      this.log('address changes', stats);
    });
  }

  onDiscoveryLastSeenChanged(discoveryResult) {
    this.api.getStats().then((stats) => {
      this.log('lastSeen', stats);
    });
  }

  refreshAll() {
    this.refreshCapabilities();
    this.refreshSettings();
    this.refreshApps();
  }

  // Refresh device capabilities, this is expensive so we do not want to poll too often
  refreshCapabilities() {
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
      this.setCapabilityValue('awtrix_matrix', !!stats.matp); // check data

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
  }

  initPolling() {
    this.homey.clearInterval(this.poll);
    this.poll = this.homey.setInterval(async () => {
      this.log('polling...');
      this.refreshCapabilities();
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

  async notify(msg, params) {
    return this.api.notify(msg, params).catch((error) => this.error);
  }

  async notifyDismiss() {
    return this.api.dismiss();
  }

  async rtttl(melody) {
    return this.api.rtttl(melody);
  }

  async indicator(id, options) {
    return this.api.indicator(id, options);
  }

};
