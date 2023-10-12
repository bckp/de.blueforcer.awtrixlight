'use strict';

const { Driver } = require('homey');
const AwtrixClient = require('../../lib/AwtrixClient');

class UlanziAwtrix extends Driver {

  ENABLE_MANUAL_ADD = false;

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('MyDriver has been initialized');

    this._notificationTextAction = this.homey.flow.getActionCard('notificationText');
    this._notificationDismissAction = this.homey.flow.getActionCard('notificationDismiss');
    this._showDisplySetAction = this.homey.flow.getActionCard('displaySet');

    this.log('register run listener');
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    const discoveryStrategy = this.getDiscoveryStrategy();
    const discoveryResults = discoveryStrategy.getDiscoveryResults();

    this.log(discoveryStrategy);
    this.log(discoveryResults);

    const devices = Object.values(discoveryResults).map((discoveryResult) => {
      return {
        name: discoveryResult.id,
        data: {
          id: discoveryResult.id,
        },
      };
    });

    // If we do not find device, push custom one so user can set IP directly
    if (devices.length === 0 && this.ENABLE_MANUAL_ADD) {
      devices.push({
        name: 'Manual',
        data: {
          id: 'custom',
        },
      });
    }

    return devices;
  }

}

module.exports = UlanziAwtrix;
