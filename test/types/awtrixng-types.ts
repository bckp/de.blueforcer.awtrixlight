import type {
  AwtrixNgApiDeviceStateResponse,
  AwtrixNgApiFilesResponse,
  AwtrixNgApiIndicatorPayload,
  AwtrixNgApiNotificationPayload,
  AwtrixNgApiOkResponse,
  AwtrixNgApiPushedAppPayload,
  AwtrixNgApiSettingsPatch,
  AwtrixNgApiSettingsResponse,
  AwtrixNgApiVersionResponse,
} from '../../lib/awtrixng/Api/Types';

const minimalDeviceState: AwtrixNgApiDeviceStateResponse = {
  version: '1.0.4-dev',
  uid: 'a1b2c3',
  boardType: 'awtrix',
  soc: 'esp32s3',
  ipAddress: '192.0.2.10',
  wifiRssi: -55,
  uptimeSeconds: 10,
  resetReason: 'poweron',
  freeHeapBytes: 100000,
  minFreeHeapBytes: 90000,
  largestFreeBlockBytes: 80000,
  scriptHeapPool: 'internal',
  scriptHeapBudgetBytes: 32768,
  fps: 60,
  brightness: 120,
  lightLevel: 42.5,
  ldrRaw: 1234,
  matrixPower: true,
  currentApp: 'Time',
  indicators: [
    {
      on: false,
      color: '#000000',
      blinkMs: 0,
      fadeMs: 0,
    },
    {
      on: true,
      color: '#FF0000',
      blinkMs: 500,
      fadeMs: 0,
    },
    {
      on: false,
      color: '#000000',
      blinkMs: 0,
      fadeMs: 0,
    },
  ],
  messageCount: 0,
};

const version: AwtrixNgApiVersionResponse = {
  version: minimalDeviceState.version,
};

const settings: AwtrixNgApiSettingsResponse = {
  autoBrightness: false,
  brightness: 120,
  autoTransition: true,
  textColor: '#FFFFFF',
  transitionEffect: 'Rain',
  transitionDurationMs: 1000,
  appDurationMs: 7000,
  timeMode: 1,
  calendarHeaderColor: '#FF0000',
  calendarTextColor: '#000000',
  calendarBodyColor: '#FFFFFF',
  time24h: true,
  timeLeadingZero: true,
  timeShowSeconds: false,
  timeShowAmPm: false,
  timeSeparatorMode: 'pulse',
  dateOrder: 'dayMonthYear',
  dateSeparator: 'dot',
  dateYearMode: 'twoDigit',
  dateShowWeekday: false,
  dateMonthNames: false,
  useCelsius: true,
  blockNavigation: false,
  soundEnabled: true,
  uppercase: true,
  smoothScroll: false,
  weekdayBar: {
    show: true,
    startOnMonday: true,
    weekendDays: ['sunday', 'saturday'],
    activeColor: '#FFFFFF',
    inactiveColor: '#666666',
    weekendActiveColor: '#FFFFFF',
    weekendInactiveColor: '#666666',
  },
  timeColor: null,
  dateColor: null,
  humidityColor: null,
  temperatureColor: null,
  batteryColor: null,
  scroll: {
    mode: 'wrap',
    direction: 'left',
    entry: 'inline',
    whenFits: 'static',
    speed: 100,
    gap: 8,
  },
  volume: 25,
  radioVolume: 60,
  radioMeta: true,
  saturation: 100,
  gamma: 1.9,
  colorCorrection: null,
  colorTint: null,
};

const patch: AwtrixNgApiSettingsPatch = {
  autoBrightness: true,
  blockNavigation: true,
  transitionEffect: settings.transitionEffect,
};

const notification: AwtrixNgApiNotificationPayload = {
  text: [{ text: 'Door', color: '#FF0000' }],
  textCase: 'asTyped',
  textColor: 'palette',
  durationMs: 5000,
  iconMode: 'pushOnce',
  hold: true,
  stack: true,
  wakeup: true,
  soundRtttl: 'beep:d=4,o=5,b=120:c',
  soundLoop: false,
};

const pushedApp: AwtrixNgApiPushedAppPayload = {
  text: 'Weather',
  icon: '2422',
  lifetimeMs: 60000,
  lifetimeExpiry: 'remove',
  repeat: 1,
};

// @ts-expect-error hold is notification-only and must not be valid for pushed apps.
const pushedAppWithNotificationOnlyField: AwtrixNgApiPushedAppPayload = { text: 'Invalid', hold: true };

const indicator: AwtrixNgApiIndicatorPayload = {
  color: null,
  blinkMs: 500,
};

const files: AwtrixNgApiFilesResponse = {
  files: [{ name: 'homey.gif', size: 1234 }],
  usedBytes: 1234,
  totalBytes: 1048576,
};

const ok: AwtrixNgApiOkResponse = { ok: true };

const awtrixNgTypeSmokeValues = {
  files,
  indicator,
  minimalDeviceState,
  notification,
  ok,
  patch,
  pushedApp,
  pushedAppWithNotificationOnlyField,
  settings,
  version,
};

export default awtrixNgTypeSmokeValues;
