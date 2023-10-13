'use strict';

const { Device } = require('homey');
const AwtrixClient = require('../../lib/AwtrixClient');
const AwtrixClientResponses = require('../../lib/AwtrixClientResponses');

class TC001 extends Device {

  static REBOOT_FIELDS = ['tim', 'dat', 'hum', 'temp', 'bat'];
  static POLL_INTERVAL = 60000;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('TC001 has been initialized');
    this.initFlows();

    // Create API
    this.api = new AwtrixClient({ ip: this.getStoreValue('ip') });

    // Setup user and pass if exists
    const settings = await this.getSettings();
    if (settings.user && settings.pass) {
      this.api.setCredentials(settings.user, settings.pass);
    }

    // Clear interval and verify device
    this.testDevice();
    this.homey.clearInterval(this.poll);

    // Refresh capabilities
    if (this.getAvailable()) {
      this.refreshCapabilities(this.api, true);
      this.initPolling();
      return true;
    }

    return false;
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('TC001 has been added');
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
    this.log('TC001 settings where changed', oldSettings, newSettings, changedKeys);

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
    if (changedKeys.some((key) => TC001.REBOOT_FIELDS.includes(key))) {
      this.log('rebooting device');
      this.api.reboot();
    }

    return true;
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('TC001 has been deleted');

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
    }).catch((error) => {
      this.setUnavailable('Device error!').catch(this.error);
      return false;
    });

    api.getSettings().then((settings) => {
      this.setCapabilityValue('ulanzi_matrix', !!settings.MATP);

      if (!full) {
        return true;
      }

      this.setSettings({
        tim: !!settings.TIM,
        dat: !!settings.DAT,
        hum: !!settings.HUM,
        temp: !!settings.TEMP,
        bat: !!settings.BAT,
        abri: !!settings.ABRI,
        atrans: !!settings.ATRANS,
        blockn: !!settings.BLOCKN,
        uppercase: !!settings.UPPERCASE,
        teff: settings?.TEFF?.toString(),
      });
    }).catch((error) => {
      this.setUnavailable('Device error!').catch(this.error);
      return false;
    });

    return true;
  }

  initFlows() {
    // Notification flows
    this.driver._notificationTextAction.registerRunListener(async (args, state) => {
      this.log('action:notificationText', args, state);
      args.device.api.notify(args.msg, { color: args.color ?? null, duration: args.duration });
    });
    this.driver._notificationDismissAction.registerRunListener(async (args, state) => {
      this.log('action:notificationDismiss', args, state);
      args.device.api.dismiss();
    });

    // App flows
    //TODO: implement app flows

    // Display flows
    this.driver._showDisplySetAction.registerRunListener(async (args, state) => {
      this.log('action:displaySet', args, state);
      args.device.api.power(args.power === '1');
    });
  }

  initPolling() {
    this.homey.clearInterval(this.poll);
    this.poll = this.homey.setInterval(async () => {
      this.log('polling...');
      this.refreshCapabilities(this.api);
    }, TC001.POLL_INTERVAL);
  }

  async testDevice() {
    return this.api.test().then((result) => {
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

}

module.exports = TC001;
