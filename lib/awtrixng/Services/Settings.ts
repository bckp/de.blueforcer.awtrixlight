import {
  AwtrixNgSettingsPatchInput,
  AwtrixNgWritableSettingsFields,
  UnsupportedAwtrixNgPayloadFieldError,
  toAwtrixNgSettingsPatch,
} from '../Payload/Transformers';
import {
  AwtrixNgApiSettingsPatch,
  AwtrixNgApiSettingsResponse,
} from '../Api/Types';
import { AwtrixNgInvalidResponseError } from '../Api/InvalidResponseError';

export type AwtrixNgHomeySettingValue = boolean | string | number | undefined | null;

export type AwtrixNgHomeySettings = Record<string, AwtrixNgHomeySettingValue>;

export type AwtrixNgWritableSettingsField = keyof AwtrixNgSettingsPatchInput;

export type AwtrixNgLocalSettingsField = 'address' | 'port' | 'authUser' | 'authPass' | 'buttonCallbackEnabled';

export type AwtrixNgHomeySettingsPatch = Partial<Record<AwtrixNgWritableSettingsField, boolean | string | number>>;

export const AwtrixNgPanelSettingsFields = ['saturation', 'gamma', 'colorCorrection', 'colorTint'] as const;

export interface AwtrixNgSettingsClient {
  patchSettings(patch: AwtrixNgApiSettingsPatch): Promise<AwtrixNgApiSettingsResponse>;
}

export interface AwtrixNgHomeySettingsApplyResult {
  patch?: AwtrixNgApiSettingsPatch;
  apiSettings?: AwtrixNgApiSettingsResponse;
  homeySettingsUpdate: AwtrixNgHomeySettingsPatch;
}

const writableSettingsFields = new Set<string>(AwtrixNgWritableSettingsFields);

const localSettingsFields = new Set<string>([
  'address',
  'authPass',
  'authUser',
  'buttonCallbackEnabled',
  'port',
]);

const isWritableSettingsField = (field: string): field is AwtrixNgWritableSettingsField => writableSettingsFields.has(field);

export const isAwtrixNgLocalSettingsField = (field: string): field is AwtrixNgLocalSettingsField => localSettingsFields.has(field);

export const hasAwtrixNgLocalSettingsChange = (changedKeys: readonly string[]): boolean => changedKeys.some(isAwtrixNgLocalSettingsField);

export const hasAwtrixNgConnectionSettingsChange = (changedKeys: readonly string[]): boolean => changedKeys.some((field) => (
  field === 'address' || field === 'port' || field === 'authUser' || field === 'authPass'
));

export const createAwtrixNgSettingsPatchFromChangedSettings = (
  newSettings: AwtrixNgHomeySettings,
  changedKeys: readonly string[],
): AwtrixNgApiSettingsPatch | undefined => {
  const patchInput: Record<string, unknown> = {};

  for (const key of changedKeys) {
    if (isAwtrixNgLocalSettingsField(key)) {
      if (key === 'buttonCallbackEnabled' && typeof newSettings[key] !== 'boolean') {
        throw new TypeError('AWTRIX NG buttonCallbackEnabled must be a boolean.');
      }
      continue;
    }

    if (!isWritableSettingsField(key)) {
      throw new UnsupportedAwtrixNgPayloadFieldError({
        field: key,
        target: 'settings',
        reason: 'unknown-field',
        details: 'Only documented settings exposed by this driver can be changed from Homey.',
      });
    }

    if (newSettings[key] !== undefined) {
      patchInput[key] = (key === 'colorCorrection' || key === 'colorTint') && newSettings[key] === '' ? null : newSettings[key];
    }
  }

  if (Object.keys(patchInput).length === 0) {
    return undefined;
  }

  return toAwtrixNgSettingsPatch(patchInput as AwtrixNgSettingsPatchInput);
};

export const writeAwtrixNgSettingsPatch = (
  client: AwtrixNgSettingsClient,
  patch: AwtrixNgApiSettingsPatch,
): Promise<AwtrixNgApiSettingsResponse> => client.patchSettings(patch);

const toHomeyPanelSettings = (settings: AwtrixNgApiSettingsResponse): AwtrixNgHomeySettingsPatch => {
  const result: AwtrixNgHomeySettingsPatch = {};
  for (const key of AwtrixNgPanelSettingsFields) {
    const value = settings[key];
    if (value === undefined) continue;
    let valid: boolean;
    if (key === 'saturation') valid = Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100;
    else if (key === 'gamma') valid = typeof value === 'number' && Number.isFinite(value) && value > 0;
    else valid = value === null || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
    if (!valid) throw new AwtrixNgInvalidResponseError({ endpoint: '/api/v1/settings', expectedShape: `a valid ${key}`, actualValue: value });
    result[key] = value === null ? '' : value;
  }
  return result;
};

export const toAwtrixNgHomeySettingsFromApiSettings = (settings: AwtrixNgApiSettingsResponse): AwtrixNgHomeySettingsPatch => ({
  autoBrightness: settings.autoBrightness,
  autoTransition: settings.autoTransition,
  blockNavigation: settings.blockNavigation,
  transitionEffect: settings.transitionEffect,
  uppercase: settings.uppercase,
  ...toHomeyPanelSettings(settings),
});

export const toAwtrixNgHomeySettingsUpdate = (
  settings: AwtrixNgApiSettingsResponse,
  currentSettings: AwtrixNgHomeySettings,
): AwtrixNgHomeySettingsPatch => {
  const nextSettings = toAwtrixNgHomeySettingsFromApiSettings(settings);
  const update: AwtrixNgHomeySettingsPatch = {};

  for (const [key, value] of Object.entries(nextSettings)) {
    if (value !== undefined && currentSettings[key] !== value) {
      update[key as AwtrixNgWritableSettingsField] = value;
    }
  }

  return update;
};

export const applyAwtrixNgHomeySettingsChange = async (
  client: AwtrixNgSettingsClient,
  newSettings: AwtrixNgHomeySettings,
  changedKeys: readonly string[],
): Promise<AwtrixNgHomeySettingsApplyResult> => {
  const patch = createAwtrixNgSettingsPatchFromChangedSettings(newSettings, changedKeys);

  if (patch === undefined) {
    return {
      homeySettingsUpdate: {},
    };
  }

  const apiSettings = await writeAwtrixNgSettingsPatch(client, patch);

  return {
    patch,
    apiSettings,
    homeySettingsUpdate: toAwtrixNgHomeySettingsUpdate(apiSettings, newSettings),
  };
};
