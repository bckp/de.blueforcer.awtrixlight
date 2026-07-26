import { AwtrixNgApiDisplayPatch, AwtrixNgApiOkResponse } from '../Api/Types';
import { toAwtrixNgWeatherOverlayPatch } from '../Services/Display';

export interface AwtrixNgDeviceControlClient {
  patchDisplay(patch: AwtrixNgApiDisplayPatch): Promise<AwtrixNgApiOkResponse>;
  appNext(): Promise<AwtrixNgApiOkResponse>;
  appPrevious(): Promise<AwtrixNgApiOkResponse>;
}

const toMatrixPowerValue = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  throw new Error('Matrix capability value must be a boolean.');
};

export const runAwtrixNgMatrixPowerCapability = async (
  client: AwtrixNgDeviceControlClient,
  value: unknown,
): Promise<void> => {
  await client.patchDisplay({ power: toMatrixPowerValue(value) });
};

export const runAwtrixNgNextAppCapability = async (client: AwtrixNgDeviceControlClient): Promise<void> => {
  await client.appNext();
};

export const runAwtrixNgPreviousAppCapability = async (client: AwtrixNgDeviceControlClient): Promise<void> => {
  await client.appPrevious();
};

export const runAwtrixNgWeatherOverlayCapability = async (
  client: AwtrixNgDeviceControlClient,
  value: unknown,
): Promise<void> => {
  await client.patchDisplay(toAwtrixNgWeatherOverlayPatch(value));
};
