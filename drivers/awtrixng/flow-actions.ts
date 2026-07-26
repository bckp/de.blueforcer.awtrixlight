import { AwtrixNgIndicatorId } from '../../lib/awtrixng/Api/Client';
import parseAwtrixNgJsonObjectPayload from '../../lib/awtrixng/Payload/JsonPayload';
import {
  AwtrixNgWeatherOverlayCapabilityId,
  AwtrixNgWeatherOverlayValue,
  toAwtrixNgWeatherOverlayPatch,
} from '../../lib/awtrixng/Services/Display';
import {
  AwtrixNgIndicatorInput,
  AwtrixNgNotificationInput,
  AwtrixNgPushedAppInput,
  toAwtrixNgDisplayPowerPatch,
  toAwtrixNgHomeyPushedAppName,
  toAwtrixNgIndicatorPayload,
  toAwtrixNgNotificationPayload,
  toAwtrixNgPushedAppPayload,
} from '../../lib/awtrixng/Payload/Transformers';
import {
  AwtrixNgApiDisplayPatch,
  AwtrixNgApiIndicatorPayload,
  AwtrixNgApiNotificationPayload,
  AwtrixNgApiOkResponse,
  AwtrixNgApiPushedAppPayload,
} from '../../lib/awtrixng/Api/Types';

export interface AwtrixNgFlowActionClient {
  sendNotification(payload: AwtrixNgApiNotificationPayload): Promise<AwtrixNgApiOkResponse>;
  dismissActiveNotification(): Promise<AwtrixNgApiOkResponse>;
  patchDisplay(patch: AwtrixNgApiDisplayPatch): Promise<AwtrixNgApiOkResponse>;
  playRtttl(rtttl: string): Promise<AwtrixNgApiOkResponse>;
  putIndicator(id: AwtrixNgIndicatorId, payload: AwtrixNgApiIndicatorPayload): Promise<AwtrixNgApiOkResponse>;
  deleteIndicator(id: AwtrixNgIndicatorId): Promise<AwtrixNgApiOkResponse>;
  putPushedApp(name: string, payload: AwtrixNgApiPushedAppPayload): Promise<AwtrixNgApiOkResponse>;
  deleteApp(name: string): Promise<AwtrixNgApiOkResponse>;
}

export interface AwtrixNgFlowActionDevice {
  client?: AwtrixNgFlowActionClient;
  setCapabilityValue(capabilityId: string, value: string): Promise<void>;
}

export interface AwtrixNgFlowIconArg {
  id: string;
  name: string;
  description?: string;
}

export interface AwtrixNgNotificationActionArgs {
  device: AwtrixNgFlowActionDevice;
  msg: string;
  icon?: AwtrixNgFlowIconArg;
  textColor?: string;
  duration?: number;
  hold?: boolean;
}

export interface AwtrixNgNotificationRawActionArgs {
  device: AwtrixNgFlowActionDevice;
  options: string;
}

export interface AwtrixNgDeviceOnlyActionArgs {
  device: AwtrixNgFlowActionDevice;
}

export interface AwtrixNgDisplaySetActionArgs {
  device: AwtrixNgFlowActionDevice;
  power: '0' | '1';
}

export interface AwtrixNgWeatherOverlayActionArgs {
  device: AwtrixNgFlowActionDevice;
  overlay: AwtrixNgWeatherOverlayValue;
}

export interface AwtrixNgRtttlActionArgs {
  device: AwtrixNgFlowActionDevice;
  rtttl: string;
}

export interface AwtrixNgIndicatorActionArgs {
  device: AwtrixNgFlowActionDevice;
  indicator: '1' | '2' | '3';
  color: string;
  effect: '-' | 'blink' | 'fade';
  durationMs: number;
}

export interface AwtrixNgCustomAppActionArgs {
  device: AwtrixNgFlowActionDevice;
  name: string;
  msg?: string;
  icon?: AwtrixNgFlowIconArg;
  textColor?: string;
  duration?: number;
  options?: string;
}

export interface AwtrixNgCustomAppRawActionArgs {
  device: AwtrixNgFlowActionDevice;
  name: string;
  options: string;
}

export interface AwtrixNgRemoveCustomAppActionArgs {
  device: AwtrixNgFlowActionDevice;
  name: string;
}

export interface AwtrixNgIndicatorDismissActionArgs {
  device: AwtrixNgFlowActionDevice;
  indicator: '1' | '2' | '3';
}

const getClient = (device: AwtrixNgFlowActionDevice): AwtrixNgFlowActionClient => {
  if (device.client === undefined) {
    throw new Error('Device client is not initialized.');
  }

  return device.client;
};

const toIndicatorId = (indicator: AwtrixNgIndicatorActionArgs['indicator'] | AwtrixNgIndicatorDismissActionArgs['indicator']): AwtrixNgIndicatorId => {
  if (indicator === '1' || indicator === '2' || indicator === '3') {
    return Number(indicator) as AwtrixNgIndicatorId;
  }

  throw new Error(`Invalid indicator id: ${indicator}`);
};

const toNotificationInput = (args: AwtrixNgNotificationActionArgs): AwtrixNgApiNotificationPayload => {
  const input: AwtrixNgNotificationInput = {
    text: args.msg,
  };

  if (args.textColor !== undefined) {
    input.textColor = args.textColor;
  }

  if (args.icon !== undefined && args.icon.id !== '-') {
    input.icon = args.icon.id;
  }

  if (args.duration !== undefined) {
    input.durationMs = args.duration;
  }

  if (args.hold !== undefined) {
    input.hold = args.hold;
  }

  return toAwtrixNgNotificationPayload(input);
};

const toRawNotificationPayload = (args: AwtrixNgNotificationRawActionArgs): AwtrixNgApiNotificationPayload => toAwtrixNgNotificationPayload(
  parseAwtrixNgJsonObjectPayload(args.options, 'notification') as AwtrixNgNotificationInput,
);

const toRawCustomAppPayload = (args: AwtrixNgCustomAppRawActionArgs): AwtrixNgApiPushedAppPayload => toAwtrixNgPushedAppPayload(
  parseAwtrixNgJsonObjectPayload(args.options, 'pushedApp') as AwtrixNgPushedAppInput,
);

const toCustomAppPayload = (args: AwtrixNgCustomAppActionArgs): AwtrixNgApiPushedAppPayload => {
  const inputRecord: Record<string, unknown> = {
    ...parseAwtrixNgJsonObjectPayload(args.options, 'pushedApp'),
  };

  if (args.msg !== undefined && args.msg.length > 0) {
    inputRecord.text = args.msg;
  }

  if (args.textColor !== undefined) {
    inputRecord.textColor = args.textColor;
  }

  if (args.duration !== undefined) {
    inputRecord.durationMs = args.duration;
  }

  if (args.icon !== undefined && args.icon.id !== '-') {
    inputRecord.icon = args.icon.id;
  }

  return toAwtrixNgPushedAppPayload(inputRecord as AwtrixNgPushedAppInput);
};

const toIndicatorInput = (args: AwtrixNgIndicatorActionArgs): AwtrixNgApiIndicatorPayload => {
  const input: AwtrixNgIndicatorInput = {
    color: args.color,
  };

  if (args.effect === 'blink') {
    input.blinkMs = args.durationMs;
  }

  if (args.effect === 'fade') {
    input.fadeMs = args.durationMs;
  }

  return toAwtrixNgIndicatorPayload(input);
};

export const runAwtrixNgNotificationAction = async (args: AwtrixNgNotificationActionArgs): Promise<void> => {
  await getClient(args.device).sendNotification(toNotificationInput(args));
};

export const runAwtrixNgNotificationRawAction = async (args: AwtrixNgNotificationRawActionArgs): Promise<void> => {
  await getClient(args.device).sendNotification(toRawNotificationPayload(args));
};

export const runAwtrixNgDismissNotificationAction = async (args: AwtrixNgDeviceOnlyActionArgs): Promise<void> => {
  await getClient(args.device).dismissActiveNotification();
};

export const runAwtrixNgDisplaySetAction = async (args: AwtrixNgDisplaySetActionArgs): Promise<void> => {
  await getClient(args.device).patchDisplay(toAwtrixNgDisplayPowerPatch(args.power === '1'));
};

export const runAwtrixNgWeatherOverlayAction = async (args: AwtrixNgWeatherOverlayActionArgs): Promise<void> => {
  await getClient(args.device).patchDisplay(toAwtrixNgWeatherOverlayPatch(args.overlay));
  await args.device.setCapabilityValue(AwtrixNgWeatherOverlayCapabilityId, args.overlay);
};

export const runAwtrixNgRtttlAction = async (args: AwtrixNgRtttlActionArgs): Promise<void> => {
  await getClient(args.device).playRtttl(args.rtttl);
};

export const runAwtrixNgIndicatorAction = async (args: AwtrixNgIndicatorActionArgs): Promise<void> => {
  await getClient(args.device).putIndicator(toIndicatorId(args.indicator), toIndicatorInput(args));
};

export const runAwtrixNgIndicatorDismissAction = async (args: AwtrixNgIndicatorDismissActionArgs): Promise<void> => {
  await getClient(args.device).deleteIndicator(toIndicatorId(args.indicator));
};

export const runAwtrixNgCustomAppAction = async (args: AwtrixNgCustomAppActionArgs): Promise<void> => {
  await getClient(args.device).putPushedApp(toAwtrixNgHomeyPushedAppName(args.name), toCustomAppPayload(args));
};

export const runAwtrixNgCustomAppRawAction = async (args: AwtrixNgCustomAppRawActionArgs): Promise<void> => {
  await getClient(args.device).putPushedApp(toAwtrixNgHomeyPushedAppName(args.name), toRawCustomAppPayload(args));
};

export const runAwtrixNgRemoveCustomAppAction = async (args: AwtrixNgRemoveCustomAppActionArgs): Promise<void> => {
  await getClient(args.device).deleteApp(toAwtrixNgHomeyPushedAppName(args.name));
};
