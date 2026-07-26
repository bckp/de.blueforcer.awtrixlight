import { Driver } from 'homey';
import PairSession from 'homey/lib/PairSession';
import AwtrixLightDevice from './device';
import { HomeyAwtrixIcon } from '../../lib/awtrix3/Types';

type ListenerArgs = {
  device: AwtrixLightDevice,
};

type ListenerArgsNotificationIcon = ListenerArgs & {
  msg: string,
  color: string,
  duration?: number,
  icon: HomeyAwtrixIcon
}

type ListenerArgsNotificationJson = ListenerArgs &{
  msg: string,
  options: string
}

type ListenerArgsCustomApp = ListenerArgs & {
  name: string,
  msg: string,
  color?: string,
  duration?: number,
  icon: HomeyAwtrixIcon,
  options: string
}

type ListenerArgsRemoveCustomApp = ListenerArgs & {
  name: string
}

const ManualAdd = false;

export default class UlanziAwtrix extends Driver {

  async onInit(): Promise<void> {
    this.log('UlanziAwtrix has been initialized');

    this.initFlows();
  }

  async initFlows(): Promise<void> {
    // Deprecated notification with required icon
    this.homey.flow.getActionCard('notificationIcon').registerRunListener(async (args: ListenerArgsNotificationIcon) => {
      const duration = typeof args.duration === 'number' ? Math.ceil(args.duration / 1000) : undefined;
      await args.device.cmdNotify(args.msg, { color: args.color, duration, icon: args.icon.id });
    }).getArgument('icon').registerAutocompleteListener(async (query: string, args: ListenerArgs) => {
      return args.device.icons.find(query);
    });

    this.homey.flow.getActionCard('notificationJson').registerRunListener(async (args: ListenerArgsNotificationJson) => {
      await args.device.cmdNotify(args.msg, { ...JSON.parse(args.options) });
    });

    // Custom app
    this.homey.flow.getActionCard('customApp').registerRunListener(async (args: ListenerArgsCustomApp) => {
      const parsed = JSON.parse(args.options);
      const text = args.msg || parsed.text || '';
      const duration = args.duration ?? parsed.duration;
      const params = { ...parsed, text, duration };

      if (args.color) params.color = args.color;
      if (args.icon.id && args.icon.id !== '-') params.icon = args.icon.id;

      await args.device.cmdCustomApp(args.name, params);
    }).getArgument('icon').registerAutocompleteListener(async (query: string, args: ListenerArgs) => {
      return args.device.icons.find(query);
    });

    this.homey.flow.getActionCard('removeCustomApp').registerRunListener(async (args: ListenerArgsRemoveCustomApp) => {
      await args.device.cmdRemoveCustomApp(args.name);
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
      if (ManualAdd) {
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
