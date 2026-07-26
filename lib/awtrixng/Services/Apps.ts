import { AwtrixNgApiAppInventoryItem, AwtrixNgApiAppsResponse, AwtrixNgApiOkResponse } from '../Api/Types';

export const AwtrixNgBuiltinAppNamesBySetting = {
  showBuiltinTime: 'Time',
  showBuiltinDate: 'Date',
  showBuiltinTemperature: 'Temperature',
  showBuiltinHumidity: 'Humidity',
  showBuiltinBattery: 'Battery',
} as const;

export type AwtrixNgBuiltinAppSetting = keyof typeof AwtrixNgBuiltinAppNamesBySetting;

export type AwtrixNgBuiltinAppName = typeof AwtrixNgBuiltinAppNamesBySetting[AwtrixNgBuiltinAppSetting];

export type AwtrixNgBuiltinAppSettings = Partial<Record<AwtrixNgBuiltinAppSetting, boolean>>;

export interface AwtrixNgAppsClient {
  getApps(): Promise<AwtrixNgApiAppsResponse>;
  putAppsOrder(order: readonly string[]): Promise<AwtrixNgApiOkResponse>;
}

export interface AwtrixNgBuiltinAppSettingsApplyResult {
  order?: string[];
}

export const AwtrixNgBuiltinAppSettingIds = Object.keys(AwtrixNgBuiltinAppNamesBySetting) as AwtrixNgBuiltinAppSetting[];

export class AwtrixNgBuiltinAppUnavailableError extends Error {

  readonly setting: AwtrixNgBuiltinAppSetting;

  readonly appName: AwtrixNgBuiltinAppName;

  constructor(setting: AwtrixNgBuiltinAppSetting, appName: AwtrixNgBuiltinAppName) {
    super(`Built-in app ${appName} is not available on this device.`);
    this.name = 'AwtrixNgBuiltinAppUnavailableError';
    this.setting = setting;
    this.appName = appName;
  }

}

const builtinAppSettingIds = new Set<string>(AwtrixNgBuiltinAppSettingIds);

export const isAwtrixNgBuiltinAppSetting = (setting: string): setting is AwtrixNgBuiltinAppSetting => (
  builtinAppSettingIds.has(setting)
);

export const hasAwtrixNgBuiltinAppSettingsChange = (changedKeys: readonly string[]): boolean => (
  changedKeys.some(isAwtrixNgBuiltinAppSetting)
);

const isAvailableBuiltinApp = (app: AwtrixNgApiAppInventoryItem, appName: AwtrixNgBuiltinAppName): boolean => (
  app.origin === 'builtin' && app.name === appName
);

const findAvailableBuiltinApp = (
  apps: AwtrixNgApiAppsResponse,
  appName: AwtrixNgBuiltinAppName,
): AwtrixNgApiAppInventoryItem | undefined => apps.find((app) => isAvailableBuiltinApp(app, appName));

const isBuiltinAppInLoop = (apps: AwtrixNgApiAppsResponse, appName: AwtrixNgBuiltinAppName): boolean => (
  apps.some((app) => isAvailableBuiltinApp(app, appName) && app.inLoop)
);

const getCurrentLoopAppNames = (apps: AwtrixNgApiAppsResponse): string[] => apps
  .map((app, index) => ({ app, index }))
  .filter(({ app }) => app.inLoop)
  .sort((left, right) => {
    if (left.app.position !== null && right.app.position !== null) {
      return left.app.position - right.app.position;
    }

    if (left.app.position !== null) {
      return -1;
    }

    if (right.app.position !== null) {
      return 1;
    }

    return left.index - right.index;
  })
  .map(({ app }) => app.name);

const getDesiredBuiltinAppVisibility = (
  apps: AwtrixNgApiAppsResponse,
  settings: Record<string, unknown>,
  setting: AwtrixNgBuiltinAppSetting,
): boolean => {
  const value = settings[setting];

  if (value === undefined) {
    return isBuiltinAppInLoop(apps, AwtrixNgBuiltinAppNamesBySetting[setting]);
  }

  if (typeof value !== 'boolean') {
    throw new Error(`Built-in app setting ${setting} must be a boolean.`);
  }

  return value;
};

export const toAwtrixNgBuiltinAppSettingsFromApps = (
  apps: AwtrixNgApiAppsResponse,
): Required<AwtrixNgBuiltinAppSettings> => {
  const settings = {} as Required<AwtrixNgBuiltinAppSettings>;

  for (const setting of AwtrixNgBuiltinAppSettingIds) {
    settings[setting] = isBuiltinAppInLoop(apps, AwtrixNgBuiltinAppNamesBySetting[setting]);
  }

  return settings;
};

export const toAwtrixNgBuiltinAppSettingsUpdate = (
  apps: AwtrixNgApiAppsResponse,
  currentSettings: Record<string, unknown>,
): AwtrixNgBuiltinAppSettings => {
  const nextSettings = toAwtrixNgBuiltinAppSettingsFromApps(apps);
  const update: AwtrixNgBuiltinAppSettings = {};

  for (const setting of AwtrixNgBuiltinAppSettingIds) {
    if (currentSettings[setting] !== nextSettings[setting]) {
      update[setting] = nextSettings[setting];
    }
  }

  return update;
};

export const createAwtrixNgAppsOrderFromBuiltinSettings = (
  apps: AwtrixNgApiAppsResponse,
  newSettings: Record<string, unknown>,
): string[] => {
  const disabledBuiltinApps = new Set<string>();
  const enabledBuiltinApps: AwtrixNgBuiltinAppName[] = [];

  for (const setting of AwtrixNgBuiltinAppSettingIds) {
    const appName = AwtrixNgBuiltinAppNamesBySetting[setting];
    const desiredVisible = getDesiredBuiltinAppVisibility(apps, newSettings, setting);

    if (!desiredVisible) {
      disabledBuiltinApps.add(appName);
      continue;
    }

    if (findAvailableBuiltinApp(apps, appName) === undefined) {
      throw new AwtrixNgBuiltinAppUnavailableError(setting, appName);
    }

    enabledBuiltinApps.push(appName);
  }

  const nextOrder = getCurrentLoopAppNames(apps)
    .filter((appName) => !disabledBuiltinApps.has(appName));

  for (const appName of enabledBuiltinApps) {
    if (!nextOrder.includes(appName)) {
      nextOrder.push(appName);
    }
  }

  return nextOrder;
};

export const createAwtrixNgAppsOrderFromBuiltinSettingsChange = (
  apps: AwtrixNgApiAppsResponse,
  newSettings: Record<string, unknown>,
  changedKeys: readonly string[],
): string[] | undefined => {
  if (!hasAwtrixNgBuiltinAppSettingsChange(changedKeys)) {
    return undefined;
  }

  return createAwtrixNgAppsOrderFromBuiltinSettings(apps, newSettings);
};

export const applyAwtrixNgBuiltinAppSettingsChange = async (
  client: AwtrixNgAppsClient,
  newSettings: Record<string, unknown>,
  changedKeys: readonly string[],
): Promise<AwtrixNgBuiltinAppSettingsApplyResult> => {
  if (!hasAwtrixNgBuiltinAppSettingsChange(changedKeys)) {
    return {};
  }

  const apps = await client.getApps();
  const order = createAwtrixNgAppsOrderFromBuiltinSettings(apps, newSettings);

  await client.putAppsOrder(order);

  return { order };
};
