import { Driver } from 'homey';
import PairSession from 'homey/lib/PairSession';
import { isIP } from 'net';
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(args.options);
      } catch {
        throw new TypeError('Notification options must be valid JSON.');
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new TypeError('Notification options must be a JSON object.');
      }
      await args.device.cmdNotify(args.msg, { ...(parsed as Record<string, unknown>) });
    });

    // Custom app
    this.homey.flow.getActionCard('customApp').registerRunListener(async (args: ListenerArgsCustomApp) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(args.options);
      } catch {
        throw new TypeError('Custom app options must be valid JSON.');
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new TypeError('Custom app options must be a JSON object.');
      }
      const parsedRecord = parsed as Record<string, unknown>;
      const text = args.msg || (parsedRecord.text as string | undefined) || '';
      const duration = args.duration ?? parsedRecord.duration;
      const params: Record<string, unknown> = { ...parsedRecord, text, duration };

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

    session.setHandler('list_devices', async () => {
      const discoveryResults = discoveryStrategy.getDiscoveryResults();

      this.log(discoveryResults);

      const devices = Object.values(discoveryResults).flatMap((discoveryResult) => {
        const address = typeof discoveryResult?.address === 'string' ? discoveryResult.address.trim() : '';

        if (isIP(address) === 0) {
          return [];
        }

        return [{
          name: discoveryResult.id,
          data: {
            id: discoveryResult.id,
          },
          store: {
            address,
          },
          settings: {
            user: '',
            pass: '',
          },
        }];
      });

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
