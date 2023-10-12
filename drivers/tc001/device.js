'use strict';

const { Device } = require('homey');
const AwtrixClient = require('../../lib/AwtrixClient');

class TC001 extends Device {

  REBOOT_FIELDS = ['tim', 'dat', 'hum', 'temp', 'bat'];

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('TC001 has been initialized');
    this.initFlows();
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
    if (changedKeys.some((key) => this.REBOOT_FIELDS.includes(key))) {
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
  }

  onDiscoveryResult(discoveryResult) {
    return discoveryResult.id === this.getData().id;
  }

  async onDiscoveryAvailable(discoveryResult) {
    this.log(this.getCapabilities());

    this.api = new AwtrixClient({ ip: discoveryResult.address });
    this.api.setDebug(true);
    this.refreshCapabilities(this.api, true);

    // Reset poll
    this.homey.clearInterval(this.poll);
    this.poll = this.homey.setInterval(async () => {
      this.log('polling...');
      this.refreshCapabilities(this.api);
    }, 60000);
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
    });
    api.getSettings().then((settings) => {
      this.setCapabilityValue('ulanzi_matrix', !!settings.MATP);

      if (!full) {
        return;
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
        teff: settings.TEFF.toString(),
      });
    });
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

}

module.exports = TC001;
