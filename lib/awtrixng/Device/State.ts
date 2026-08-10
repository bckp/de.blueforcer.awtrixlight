import { AwtrixNgApiDeviceStateResponse } from '../Api/Types';
import { AwtrixNgWeatherOverlayCapabilityId } from '../Services/Display';

export type AwtrixNgHomeyBaseCapabilityId = 'button_prev'
  | 'button_next'
  | 'alarm_generic.indicator1'
  | 'alarm_generic.indicator2'
  | 'alarm_generic.indicator3'
  | 'awtrix_matrix'
  | typeof AwtrixNgWeatherOverlayCapabilityId
  | 'rssi'
  | 'ip'
  | 'button.rediscover';

export type AwtrixNgHomeyOptionalCapabilityId = 'measure_battery' | 'alarm_battery' | 'measure_temperature' | 'measure_humidity';

export type AwtrixNgHomeyCapabilityId = AwtrixNgHomeyBaseCapabilityId | AwtrixNgHomeyOptionalCapabilityId;

export type AwtrixNgHomeyCapabilityValue = boolean | number | string;

export interface AwtrixNgCapabilityValueUpdate {
  capabilityId: AwtrixNgHomeyCapabilityId;
  value: AwtrixNgHomeyCapabilityValue;
}

export interface AwtrixNgCapabilityUpdatePlan {
  capabilitiesToAdd: AwtrixNgHomeyCapabilityId[];
  valuesToSet: AwtrixNgCapabilityValueUpdate[];
}

export interface AwtrixNgCapabilityUpdateOptions {
  allowAddCapabilities: boolean;
}

export const AwtrixNgBaseCapabilityIds: readonly AwtrixNgHomeyBaseCapabilityId[] = [
  'button_prev',
  'button_next',
  'alarm_generic.indicator1',
  'alarm_generic.indicator2',
  'alarm_generic.indicator3',
  'awtrix_matrix',
  AwtrixNgWeatherOverlayCapabilityId,
  'rssi',
  'ip',
  // Maintenance action, no value is ever set for it. Listed here so devices paired before
  // it existed get it added by the capability update plan on the next init.
  'button.rediscover',
];

const isValidBatteryPercent = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isFinite(value)
  && value >= 0
  && value <= 100
);

const optionalCapabilityFields = [{
  field: 'batteryPercent',
  capabilityId: 'measure_battery',
  isValidValue: isValidBatteryPercent,
}, {
  field: 'lowBattery',
  capabilityId: 'alarm_battery',
  isValidValue: (value: unknown): value is boolean => typeof value === 'boolean',
}, {
  field: 'temperature',
  capabilityId: 'measure_temperature',
  isValidValue: (value: unknown): value is number => typeof value === 'number',
}, {
  field: 'humidity',
  capabilityId: 'measure_humidity',
  isValidValue: (value: unknown): value is number => typeof value === 'number',
}] as const;

const getAwtrixNgOptionalCapabilityIds = (deviceState: AwtrixNgApiDeviceStateResponse): AwtrixNgHomeyOptionalCapabilityId[] => (
  optionalCapabilityFields.reduce<AwtrixNgHomeyOptionalCapabilityId[]>((result, mapping) => {
    const value = deviceState[mapping.field];

    if (mapping.isValidValue(value)) {
      result.push(mapping.capabilityId);
    }

    return result;
  }, [])
);

export const getAwtrixNgInitialCapabilityIds = (deviceState: AwtrixNgApiDeviceStateResponse): AwtrixNgHomeyCapabilityId[] => [
  ...AwtrixNgBaseCapabilityIds,
  ...getAwtrixNgOptionalCapabilityIds(deviceState),
];

export const createAwtrixNgCapabilityUpdatePlan = (
  deviceState: AwtrixNgApiDeviceStateResponse,
  currentCapabilities: readonly string[],
  options: AwtrixNgCapabilityUpdateOptions,
): AwtrixNgCapabilityUpdatePlan => {
  const capabilitiesToAdd: AwtrixNgHomeyCapabilityId[] = [];
  const valuesToSet: AwtrixNgCapabilityValueUpdate[] = [];
  const knownCapabilities = new Set<string>(currentCapabilities);

  const ensureCapability = (capabilityId: AwtrixNgHomeyCapabilityId): boolean => {
    if (knownCapabilities.has(capabilityId)) {
      return true;
    }

    if (options.allowAddCapabilities) {
      capabilitiesToAdd.push(capabilityId);
      knownCapabilities.add(capabilityId);
      return true;
    }

    return false;
  };

  const addValue = (capabilityId: AwtrixNgHomeyCapabilityId, value: AwtrixNgHomeyCapabilityValue): void => {
    if (ensureCapability(capabilityId)) {
      valuesToSet.push({
        capabilityId,
        value,
      });
    }
  };

  for (const capabilityId of AwtrixNgBaseCapabilityIds) {
    ensureCapability(capabilityId);
  }

  const baseValueMappings = [
    ['alarm_generic.indicator1', deviceState.indicators[0]?.on],
    ['alarm_generic.indicator2', deviceState.indicators[1]?.on],
    ['alarm_generic.indicator3', deviceState.indicators[2]?.on],
    ['awtrix_matrix', deviceState.matrixPower],
    ['rssi', deviceState.wifiRssi],
    ['ip', deviceState.ipAddress],
  ] as const;

  for (const [capabilityId, value] of baseValueMappings) {
    if (value !== undefined) {
      addValue(capabilityId, value);
    }
  }

  for (const mapping of optionalCapabilityFields) {
    const value = deviceState[mapping.field];

    if (!mapping.isValidValue(value)) {
      continue;
    }

    addValue(mapping.capabilityId, value);
  }

  return {
    capabilitiesToAdd,
    valuesToSet,
  };
};
