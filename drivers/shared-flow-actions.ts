import { AwtrixDeviceType, AwtrixTypedDevice } from './awtrix-device-type';
import {
  AwtrixNgDeviceOnlyActionArgs,
  AwtrixNgWeatherOverlayActionArgs,
  runAwtrixNgCustomAppAction,
  runAwtrixNgCustomAppRawAction,
  runAwtrixNgDismissNotificationAction,
  runAwtrixNgDisplaySetAction,
  runAwtrixNgIndicatorAction,
  runAwtrixNgIndicatorDismissAction,
  runAwtrixNgNotificationAction,
  runAwtrixNgNotificationRawAction,
  runAwtrixNgRemoveCustomAppAction,
  runAwtrixNgWeatherOverlayAction,
  runAwtrixNgRtttlAction,
} from './awtrixng/flow-actions';

interface SharedDeviceOnlyActionArgs {
  device: unknown;
}

interface SharedFlowIconArg {
  id: string;
  name: string;
  description?: string;
}

interface SharedIconAutocompleteArgs extends SharedDeviceOnlyActionArgs {}

interface SharedNotificationActionArgs extends SharedDeviceOnlyActionArgs {
  msg: string;
  icon?: SharedFlowIconArg;
  color?: string;
  duration?: number;
  hold?: boolean;
}

interface SharedNotificationRawActionArgs extends SharedDeviceOnlyActionArgs {
  options: string;
}

interface SharedDisplaySetActionArgs extends SharedDeviceOnlyActionArgs {
  power: '0' | '1';
}

interface SharedRtttlActionArgs extends SharedDeviceOnlyActionArgs {
  rtttl: string;
}

interface SharedIndicatorActionArgs extends SharedDeviceOnlyActionArgs {
  indicator: '1' | '2' | '3';
  color: string;
  effect: '-' | 'blink' | 'fade';
  duration: number;
}

interface SharedIndicatorDismissActionArgs extends SharedDeviceOnlyActionArgs {
  indicator: '1' | '2' | '3';
}

interface SharedApplicationActionArgs extends SharedDeviceOnlyActionArgs {
  name: string;
  msg?: string;
  icon?: SharedFlowIconArg;
  color?: string;
  duration?: number;
  options?: string;
}

interface SharedApplicationRawActionArgs extends SharedDeviceOnlyActionArgs {
  name: string;
  options: string;
}

interface SharedWeatherOverlayActionArgs extends SharedDeviceOnlyActionArgs {
  overlay: AwtrixNgWeatherOverlayActionArgs['overlay'];
}

interface SharedRemoveCustomAppActionArgs extends SharedDeviceOnlyActionArgs {
  name: string;
}

interface Awtrix3NotificationOptions {
  color?: string;
  duration?: number;
  hold?: boolean;
  icon?: string;
}

type Awtrix3JsonNotificationOptions = Record<string, unknown>;
type Awtrix3CustomAppOptions = Record<string, unknown>;

interface Awtrix3IndicatorOptions {
  color: string;
  duration: number;
  effect: '-' | 'blink' | 'fade';
}

interface SharedIconDevice extends AwtrixTypedDevice {
  icons: {
    find(query: string): Promise<SharedFlowIconArg[]>;
  };
}

interface Awtrix3SharedDevice extends AwtrixTypedDevice<'awtrix3'> {
  cmdNotify(msg: string, params: Awtrix3NotificationOptions | Awtrix3JsonNotificationOptions): Promise<void>;
  cmdDismiss(): Promise<void>;
  cmdPower(power: boolean): Promise<void>;
  cmdRtttl(rtttl: string): Promise<void>;
  cmdIndicator(id: string, options: Record<string, never> | Awtrix3IndicatorOptions): Promise<void>;
  cmdCustomApp(name: string, params: Awtrix3CustomAppOptions): Promise<void>;
  cmdRemoveCustomApp(name: string): Promise<void>;
}

type AwtrixNgSharedDevice = AwtrixNgDeviceOnlyActionArgs['device'] & AwtrixTypedDevice<'awtrixng'>;

type SharedDeviceHandlers<TArgs extends SharedDeviceOnlyActionArgs> = {
  awtrix3(device: Awtrix3SharedDevice, args: TArgs): Promise<void>;
  awtrixNg(device: AwtrixNgSharedDevice, args: TArgs): Promise<void>;
};

interface AwtrixDeviceTypeMethod {
  getAwtrixDeviceType(): unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const hasAwtrixDeviceTypeMethod = (device: unknown): device is AwtrixDeviceTypeMethod => {
  if (!isRecord(device)) {
    return false;
  }

  return typeof device.getAwtrixDeviceType === 'function';
};

const readAwtrixDeviceType = (device: unknown): AwtrixDeviceType | undefined => {
  if (!hasAwtrixDeviceTypeMethod(device)) {
    return undefined;
  }

  const deviceType = device.getAwtrixDeviceType();

  if (deviceType === 'awtrix3' || deviceType === 'awtrixng') {
    return deviceType;
  }

  return undefined;
};

const isAwtrix3SharedDevice = (device: unknown): device is Awtrix3SharedDevice => readAwtrixDeviceType(device) === 'awtrix3';

const isAwtrixNgFlowDevice = (device: unknown): device is AwtrixNgSharedDevice => readAwtrixDeviceType(device) === 'awtrixng';

const isSharedIconDevice = (device: unknown): device is SharedIconDevice => {
  if (!hasAwtrixDeviceTypeMethod(device) || !isRecord(device) || !isRecord(device.icons)) {
    return false;
  }

  return typeof device.icons.find === 'function';
};

const getUnsupportedDeviceError = (): Error => new Error('Selected device does not support this flow action.');

const parseAwtrix3JsonOptions = (source: string): Awtrix3JsonNotificationOptions => ({
  ...(JSON.parse(source) as Awtrix3JsonNotificationOptions),
});

const parseOptionalAwtrix3JsonOptions = (source: string | undefined): Awtrix3CustomAppOptions => {
  if (source === undefined || source.trim().length === 0) {
    return {};
  }

  return {
    ...(JSON.parse(source) as Awtrix3CustomAppOptions),
  };
};

const toAwtrix3NotificationOptions = ({
  color, duration, hold, icon,
}: Pick<SharedNotificationActionArgs, 'color' | 'duration' | 'hold' | 'icon'>): Awtrix3NotificationOptions => {
  const options: Awtrix3NotificationOptions = {};

  if (color !== undefined) {
    options.color = color;
  }

  if (typeof duration === 'number') {
    options.duration = Math.ceil(duration / 1000);
  }

  if (hold !== undefined) {
    options.hold = hold;
  }

  if (icon !== undefined) {
    options.icon = icon.id;
  }

  return options;
};

const toAwtrix3CustomAppOptions = ({
  msg, color, duration, icon, options,
}: Pick<SharedApplicationActionArgs, 'msg' | 'color' | 'duration' | 'icon' | 'options'>): Awtrix3CustomAppOptions => {
  const parsed = parseOptionalAwtrix3JsonOptions(options);
  const params: Awtrix3CustomAppOptions = {
    ...parsed,
    text: msg || parsed.text || '',
  };

  if (typeof duration === 'number') {
    params.duration = Math.ceil(duration / 1000);
  } else if (parsed.duration !== undefined) {
    params.duration = parsed.duration;
  }

  if (color !== undefined) {
    params.color = color;
  }

  if (icon !== undefined && icon.id !== '-') {
    params.icon = icon.id;
  }

  return params;
};

const runForSharedDevice = async <TArgs extends SharedDeviceOnlyActionArgs>(
  args: TArgs,
  handlers: SharedDeviceHandlers<TArgs>,
): Promise<void> => {
  const { device } = args;

  if (isAwtrix3SharedDevice(device)) {
    await handlers.awtrix3(device, args);
    return;
  }

  if (isAwtrixNgFlowDevice(device)) {
    await handlers.awtrixNg(device, args);
    return;
  }

  throw getUnsupportedDeviceError();
};

export const autocompleteSharedIconAction = async (query: string, args: SharedIconAutocompleteArgs): Promise<SharedFlowIconArg[]> => {
  if (!isSharedIconDevice(args.device)) {
    throw getUnsupportedDeviceError();
  }

  return args.device.icons.find(query);
};

export const runSharedNotificationAction = async (args: SharedNotificationActionArgs): Promise<void> => runForSharedDevice(args, {
  awtrix3: (device, {
    msg, color, duration, icon, hold,
  }) => device.cmdNotify(msg, toAwtrix3NotificationOptions({
    color,
    duration,
    hold,
    icon,
  })),
  awtrixNg: (device, {
    msg, color, duration, icon, hold,
  }) => runAwtrixNgNotificationAction({
    device,
    msg,
    textColor: color,
    duration,
    hold,
    icon,
  }),
});

export const runSharedStickyNotificationAction = async (args: SharedNotificationActionArgs): Promise<void> => runSharedNotificationAction({
  ...args,
  hold: true,
});

export const runSharedNotificationRawAction = async (args: SharedNotificationRawActionArgs): Promise<void> => runForSharedDevice(args, {
  awtrix3: (device, { options }) => device.cmdNotify('', parseAwtrix3JsonOptions(options)),
  awtrixNg: (device, { options }) => runAwtrixNgNotificationRawAction({ device, options }),
});

export const runSharedDismissNotificationAction = async (args: SharedDeviceOnlyActionArgs): Promise<void> => runForSharedDevice(args, {
  awtrix3: (device) => device.cmdDismiss(),
  awtrixNg: (device) => runAwtrixNgDismissNotificationAction({ device }),
});

export const runSharedDisplaySetAction = async (args: SharedDisplaySetActionArgs): Promise<void> => runForSharedDevice(args, {
  awtrix3: (device, { power }) => device.cmdPower(power === '1'),
  awtrixNg: (device, { power }) => runAwtrixNgDisplaySetAction({ device, power }),
});

export const runSharedRtttlAction = async (args: SharedRtttlActionArgs): Promise<void> => runForSharedDevice(args, {
  awtrix3: (device, { rtttl }) => device.cmdRtttl(rtttl),
  awtrixNg: (device, { rtttl }) => runAwtrixNgRtttlAction({ device, rtttl }),
});

export const runSharedIndicatorAction = async (args: SharedIndicatorActionArgs): Promise<void> => runForSharedDevice(args, {
  awtrix3: (device, {
    indicator, color, duration, effect,
  }) => device.cmdIndicator(indicator, { color, duration, effect }),
  awtrixNg: (device, {
    indicator, color, duration, effect,
  }) => runAwtrixNgIndicatorAction({
    device,
    indicator,
    color,
    durationMs: duration,
    effect,
  }),
});

export const runSharedIndicatorDismissAction = async (args: SharedIndicatorDismissActionArgs): Promise<void> => runForSharedDevice(args, {
  awtrix3: (device, { indicator }) => device.cmdIndicator(indicator, {}),
  awtrixNg: (device, { indicator }) => runAwtrixNgIndicatorDismissAction({ device, indicator }),
});

export const runSharedApplicationAction = async (args: SharedApplicationActionArgs): Promise<void> => runForSharedDevice(args, {
  awtrix3: (device, {
    name, msg, color, duration, icon, options,
  }) => device.cmdCustomApp(name, toAwtrix3CustomAppOptions({
    msg,
    color,
    duration,
    icon,
    options,
  })),
  awtrixNg: (device, {
    name, msg, color, duration, icon, options,
  }) => runAwtrixNgCustomAppAction({
    device,
    name,
    msg,
    textColor: color,
    duration,
    icon,
    options,
  }),
});

export const runSharedApplicationRawAction = async (args: SharedApplicationRawActionArgs): Promise<void> => {
  if (!isAwtrixNgFlowDevice(args.device)) {
    throw getUnsupportedDeviceError();
  }

  await runAwtrixNgCustomAppRawAction({
    device: args.device,
    name: args.name,
    options: args.options,
  });
};

export const runSharedWeatherOverlayAction = async (args: SharedWeatherOverlayActionArgs): Promise<void> => {
  if (!isAwtrixNgFlowDevice(args.device)) {
    throw getUnsupportedDeviceError();
  }

  await runAwtrixNgWeatherOverlayAction({
    device: args.device,
    overlay: args.overlay,
  });
};

export const runSharedApplicationRemoveAction = async (args: SharedRemoveCustomAppActionArgs): Promise<void> => runForSharedDevice(args, {
  awtrix3: (device, { name }) => device.cmdRemoveCustomApp(name),
  awtrixNg: (device, { name }) => runAwtrixNgRemoveCustomAppAction({ device, name }),
});
