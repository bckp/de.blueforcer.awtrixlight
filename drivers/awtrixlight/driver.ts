import { Device, Driver } from 'homey';
import PairSession from 'homey/lib/PairSession';
import AwtrixLightDevice from './device';

type ListenerArgs = {
  device: AwtrixLightDevice,
};

type ListenerArgsDisplay = ListenerArgs & {
  power: string,
}

type ListenerArgsRtttl = ListenerArgs & {
  rtttl: string,
}

type ListenerArgsIndicator = ListenerArgs & {
  indicator: string,
  color?: string,
  duration?: number,
  effect?: string,
}

type ListenerArgsNotification = ListenerArgs & {
  msg: string,
  color: string,
  duration?: number,
  icon?: string
}

/*  duration?: number,
  msg?: string,
} & {
  [key: string]: string | number | boolean;
} */
export default class UlanziAwtrix extends Driver {

  static EnableManualAdd = false;

  async onInit(): Promise<void> {
    this.log('UlanziAwtrix has been initialized');
    this.initFlows();
  }

  async initFlows(): Promise<void> {
    // Notification
    this.homey.flow.getActionCard('notification').registerRunListener(async (args: ListenerArgsNotification) => {
      const duration = typeof args.duration === 'number' ? Math.ceil(args.duration/1000) : undefined;
      args.device.cmdNotify(args.msg, { color: args.color, duration, icon: args.icon });
    });

    // Sticky notification
    this.homey.flow.getActionCard('notificationSticky').registerRunListener(async (args: ListenerArgsNotification) => {
      const msg = args.msg || '';
      args.device.cmdNotify(msg, { color: args.color, hold: true, icon: args.icon });
    });
    this.homey.flow.getActionCard('notificationDismiss').registerRunListener(async (args: ListenerArgs) => {
      args.device.cmdDismiss();
    });

    // Displau
    this.homey.flow.getActionCard('displaySet').registerRunListener(async (args: ListenerArgsDisplay) => {
      args.device.cmdPower(args.power === '1');
    });

    // RTTTL sound
    this.homey.flow.getActionCard('playRTTTL').registerRunListener(async (args: ListenerArgsRtttl) => {
      args.device.cmdRtttl(args.rtttl);
    });

    // Indicators
    this.homey.flow.getActionCard('indicator').registerRunListener(async (args: ListenerArgsIndicator) => {
      args.device.cmdIndicator(args.indicator, { color: args.color, duration: args.duration, effect: args.effect });
    });
    this.homey.flow.getActionCard('indicatorDismiss').registerRunListener(async (args: ListenerArgsIndicator) => {
      args.device.cmdIndicator(args.indicator, {});
    });
  }

  async onPair(session: PairSession) {
    this.log('onPair', session);

    const discoveryStrategy = this.getDiscoveryStrategy();
    const discoveryResults = discoveryStrategy.getDiscoveryResults();

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
      if (UlanziAwtrix.EnableManualAdd) {
        devices.push({
          name: 'Manual',
          data: {
            id: `custom_${Date.now().toString()}`,
          },
          store: {
            address: '',
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

    session.setHandler('list_devices_selection', async (data: any) => {
      this.log('list_devices_selection', data);
      // let selectedDeviceId = data[0].data.id;
      // return selectedDeviceId;
    });

    session.setHandler('get_device', async (data: any) => {
      this.log('get_device', data);
    });

    session.setHandler('add_device', async (data: any) => {
      this.log('add_device', data);
    });
  }

}

module.exports = UlanziAwtrix;
