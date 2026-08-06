import {
  AwtrixNgSettingsPatchInput,
  UnsupportedAwtrixNgPayloadFieldError,
  toAwtrixNgSettingsPatch,
} from '../Payload/Transformers';
import {
  AwtrixNgApiSettingsPatch,
  AwtrixNgApiSettingsResponse,
} from '../Api/Types';

export type AwtrixNgHomeySettingValue = boolean | string | number | undefined | null;

export type AwtrixNgHomeySettings = Record<string, AwtrixNgHomeySettingValue>;

export type AwtrixNgWritableSettingsField = 'autoBrightness' | 'autoTransition' | 'blockNavigation' | 'uppercase' | 'transitionEffect';

export type AwtrixNgLocalSettingsField = 'address' | 'port' | 'authUser' | 'authPass';

export type AwtrixNgHomeySettingsPatch = Partial<Record<AwtrixNgWritableSettingsField, boolean | string>>;

export interface AwtrixNgSettingsClient {
  patchSettings(patch: AwtrixNgApiSettingsPatch): Promise<AwtrixNgApiSettingsResponse>;
}

export interface AwtrixNgHomeySettingsApplyResult {
  patch?: AwtrixNgApiSettingsPatch;
  apiSettings?: AwtrixNgApiSettingsResponse;
  homeySettingsUpdate: AwtrixNgHomeySettingsPatch;
}

const writableSettingsFields = new Set<string>([
  'autoBrightness',
  'autoTransition',
  'blockNavigation',
  'transitionEffect',
  'uppercase',
]);

const localSettingsFields = new Set<string>([
  'address',
  'authPass',
  'authUser',
  'port',
]);

const isWritableSettingsField = (field: string): field is AwtrixNgWritableSettingsField => writableSettingsFields.has(field);

export const isAwtrixNgLocalSettingsField = (field: string): field is AwtrixNgLocalSettingsField => localSettingsFields.has(field);

export const hasAwtrixNgLocalSettingsChange = (changedKeys: readonly string[]): boolean => changedKeys.some(isAwtrixNgLocalSettingsField);

export const createAwtrixNgSettingsPatchFromChangedSettings = (
  newSettings: AwtrixNgHomeySettings,
  changedKeys: readonly string[],
): AwtrixNgApiSettingsPatch | undefined => {
  const patchInput: Record<string, unknown> = {};

  for (const key of changedKeys) {
    if (isAwtrixNgLocalSettingsField(key)) {
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
      patchInput[key] = newSettings[key];
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

export const toAwtrixNgHomeySettingsFromApiSettings = (settings: AwtrixNgApiSettingsResponse): AwtrixNgHomeySettingsPatch => ({
  autoBrightness: settings.autoBrightness,
  autoTransition: settings.autoTransition,
  blockNavigation: settings.blockNavigation,
  transitionEffect: settings.transitionEffect,
  uppercase: settings.uppercase,
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
