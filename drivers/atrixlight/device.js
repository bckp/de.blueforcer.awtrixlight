'use strict';

const { Device } = require('homey');
const AwtrixClient = require('../../lib/AwtrixClient');
const AwtrixClientResponses = require('../../lib/AwtrixClientResponses');

module.exports = class AwtrixLightDevice extends Device {

  static REBOOT_FIELDS = ['tim', 'dat', 'hum', 'temp', 'bat'];
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
        this.refreshCapabilities(this.api, true);
        this.initPolling();
      }
    }).catch((error) => this.error);
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('AwtrixLightDevice has been added');
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

    // Save settings
    await this.api.setSettings({
      TIM: !!newSettings.tim,
      DAT: !!newSettings.dat,
      HUM: !!newSettings.hum,
      TEMP: !!newSettings.temp,
      BAT: !!newSettings.bat,
      ABRI: !!newSettings.abri,
      ATRANS: !!newSettings.atrans,
      BLOCKN: !!newSettings.blockn,
      UPPERCASE: !!newSettings.uppercase,
      TEFF: Number.parseInt(newSettings.teff, 10),
    });

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

  // Refresh device capabilities, this is expensive so we do not want to poll too often
  refreshCapabilities(api, full = false) {
    const currentUptime = this.getStoreValue('uptime');

    api.getStats().then((stats) => {
      // Battery
      this.setCapabilityValue('measure_battery', stats.bat);
      this.setCapabilityValue('alarm_battery', stats.bat < 20);

      // Measurements
      this.setCapabilityValue('measure_humidity', stats.hum);
      this.setCapabilityValue('measure_luminance', stats.lux);
      this.setCapabilityValue('measure_temperature', stats.temp);

      // Indicators
      this.setCapabilityValue('alarm_generic.indicator1', !!stats.indicator1);
      this.setCapabilityValue('alarm_generic.indicator2', !!stats.indicator2);
      this.setCapabilityValue('alarm_generic.indicator3', !!stats.indicator3);

      if (stats.uptime <= currentUptime) {
        this.log('reboot detected');
        this.refreshApps().catch((error) => this.error);
      }

      this.setStoreValue('uptime', stats.uptime);
      this.setAvailable();
    }).catch((error) => {
      this.setUnavailable(error?.cause?.code || 'unknown error').catch(this.error);
    });

    api.getSettings().then((settings) => {
      this.setCapabilityValue('awtrix_matrix', !!settings.MATP);

      if (!full) {
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

      this.setAvailable();
    }).catch((error) => {
      this.setUnavailable(error?.cause?.code || 'unknown error').catch(this.error);
    });

    return true;
  }

  async refreshApps() {
    const apps = this.api.apps();
    return apps;
  }

  initFlows() {
  }

  initPolling() {
    this.homey.clearInterval(this.poll);
    this.poll = this.homey.setInterval(async () => {
      this.log('polling...');
      this.refreshCapabilities(this.api);
    }, AwtrixLightDevice.POLL_INTERVAL);
  }

  async testDevice() {
    return this.api.test().then((result) => {
      this.log(result);
      switch (result.state) {
        case AwtrixClientResponses.LoginRequired:
          this.setWarning('Repair required!').catch(this.error);
          return false;

        case AwtrixClientResponses.NotFound:
          this.setWarning('Device not found!').catch(this.error);
          return false;

        case AwtrixClientResponses.Error:
          this.setWarning('Network error!').catch(this.error);
          return false;

        default:
          this.setAvailable().catch(this.error);
          this.unsetWarning().catch(this.error);
      }
      return true;
    });
  }

};
