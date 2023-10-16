'use strict';

const { Driver } = require('homey');
const AwtrixClient = require('../../lib/AwtrixClient');
const AwtrixResponses = require('../../lib/AwtrixClientResponses');

class UlanziAwtrix extends Driver {

  static ENABLE_MANUAL_ADD = false;

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('MyDriver has been initialized');
    this.initFlows();
  }

  async initFlows() {
    // Register flows
    this._notificationAction = this.homey.flow.getActionCard('notification');
    this._notificationStickyAction = this.homey.flow.getActionCard('notificationSticky');
    this._notificationDismissAction = this.homey.flow.getActionCard('notificationDismiss');
    this._showDisplySetAction = this.homey.flow.getActionCard('displaySet');
    this._playRtttlAction = this.homey.flow.getActionCard('playRTTTL');

    // Notification flows
    this._notificationAction.registerRunListener(async (args, state) => {
      args.device.notify(args.msg, { color: args.color, duration: args.duration });
    });
    this._notificationStickyAction.registerRunListener(async (args, state) => {
      args.device.notify(args.msg, { color: args.color, hold: true, icon: args.icon });
    });
    this._notificationDismissAction.registerRunListener(async (args, state) => {
      args.device.notifyDismiss();
    });
    this._playRtttlAction.registerRunListener(async (args, state) => {
      args.device.rtttl(args.rtttl);
    });

    // App flows
    //TODO: implement app flows

    // Display flows
    this._showDisplySetAction.registerRunListener(async (args, state) => {
      this.log('action:displaySet', args, state);
      args.device.api.power(args.power === '1');
    });
  }

  async onPair(session) {
    this.log('onPair', session);

    const discoveryStrategy = this.getDiscoveryStrategy();
    const discoveryResults = discoveryStrategy.getDiscoveryResults();

    let selectedDeviceId;

    this.log(discoveryResults);

    session.setHandler('list_devices', async () => {
      const devices = Object.values(discoveryResults).map((discoveryResult) => {
        return {
          name: discoveryResult.id,
          data: {
            id: discoveryResult.id,
          },
          store: {
            address: discoveryResult.address,
          },
          settings: {
            user: null,
            pass: null,
          },
        };
      });

      // If we do not find device, push custom one so user can set IP directly
      if (UlanziAwtrix.ENABLE_MANUAL_ADD) {
        devices.push({
          name: 'Manual',
          data: {
            id: `custom_${Date.now().toString()}`,
          },
          store: {
            address: null,
          },
          settings: {
            user: null,
            pass: null,
          },
        });
      }

      this.log(devices);
      return devices;
    });

    session.setHandler('list_devices_selection', async (data) => {
      this.log('list_devices_selection', data);
      selectedDeviceId = data[0].data.id;
      return selectedDeviceId;
    });

    session.setHandler('get_device', async (data) => {
      this.log('get_device', data);
    });

    session.setHandler('add_device', async (data) => {
      this.log('add_device', data);
    });
  }

}

module.exports = UlanziAwtrix;
