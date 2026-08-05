import type {
  AwtrixNgApiCapabilitiesResponse,
  AwtrixNgApiDeviceStateResponse,
  AwtrixNgApiFilesResponse,
  AwtrixNgApiAppInventoryItem,
  AwtrixNgApiAppsOrderPayload,
  AwtrixNgApiIndicatorPayload,
  AwtrixNgApiNotificationPayload,
  AwtrixNgApiOkResponse,
  AwtrixNgApiPushedAppPayload,
  AwtrixNgApiSettingsPatch,
  AwtrixNgApiSettingsResponse,
  AwtrixNgApiVersionResponse,
} from '../../lib/awtrixng/Api/Types';

const inventoryItem: AwtrixNgApiAppInventoryItem = {
  name: 'Time',
  origin: 'builtin',
  enabled: true,
  inLoop: true,
  slot: 0,
  present: true,
};

// @ts-expect-error position belonged to the old inventory contract; AWTRIX NG now returns slot.
const inventoryItemWithLegacyPosition: AwtrixNgApiAppInventoryItem = { name: 'Time', origin: 'builtin', position: 0 };

const appsOrder: AwtrixNgApiAppsOrderPayload = { order: ['Time'], disabled: ['Battery'] };

// @ts-expect-error disabled is required by PUT /api/v1/apps/order.
const appsOrderWithoutDisabled: AwtrixNgApiAppsOrderPayload = { order: ['Time'] };

const capabilities: AwtrixNgApiCapabilitiesResponse = {
  effects: ['Fireworks', 'Matrix'],
  paletteEffects: ['Fireworks'],
  transitions: ['Fade'],
  overlays: ['rain'],
  palettes: ['Rainbow'],
  radio: true,
  gpio: {
    soc: 'esp32s3',
    label: 'ESP32-S3',
    max: 48,
    missing: [[22, 25]],
    inputOnly: [],
    reserved: [{ lo: 19, hi: 20, why: 'the USB-JTAG interface' }],
    adc1: [[1, 10]],
    strapping: [[0, 0], [3, 3], [45, 46]],
    rtc: [[0, 21]],
    matrix: [13, 14, 15],
    defaults: { pinMatrix: 21, pinLdr: -1 },
  },
};

const minimalDeviceState: AwtrixNgApiDeviceStateResponse = {
  version: '1.0.4-dev',
  uid: 'a1b2c3',
  boardType: 'awtrix',
  soc: 'esp32s3',
  ipAddress: '192.0.2.10',
  hostname: 'awtrixng-a1b2c3',
  wifiRssi: -55,
  uptimeSeconds: 10,
  resetReason: 'poweron',
  freeHeapBytes: 100000,
  minFreeHeapBytes: 90000,
  largestFreeBlockBytes: 80000,
  scriptingRunning: true,
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
  wifi: {
    enabled: true,
    state: 'connected',
    host: 'Home',
    endpoint: '192.0.2.10',
    attempts: 0,
    retryInMs: 0,
    connects: 1,
    error: null,
    lastError: null,
  },
  mqtt: {
    enabled: false,
    state: 'disabled',
    host: '',
    endpoint: '',
    attempts: 0,
    retryInMs: 0,
    connects: 0,
    error: null,
    lastError: null,
  },
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
    holdMs: 1000,
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
  font: 'large',
  textColor: 'palette',
  durationMs: 5000,
  repeat: 2,
  iconMode: 'pushOnce',
  hold: true,
  stack: true,
  wakeup: true,
  soundRtttl: 'beep:d=4,o=5,b=120:c',
  soundLoop: false,
  scroll: {
    mode: 'bounce',
    holdMs: 250,
  },
  palette: [
    { color: '#FF0000', pos: 0 },
    { color: ['HSV', 120, 100, 100], pos: 100 },
  ],
  draw: [
    ['pixel', 0, 0, '#FF0000'],
    ['pixels', null, 1, 1, 2, 2],
    ['line', 0, 0, 31, 7],
    ['rect', 0, 0, 10, 5, [0, 255, 0]],
    ['rectFill', 1, 1, 8, 3],
    ['circle', 4, 4, 2, 0x0000FF],
    ['circleFill', 4, 4, 1],
    ['text', 9, 1, 'Hi', '#FFFFFF'],
    ['bitmap', 0, 0, 2, 1, ['#FF0000', '#00FF00']],
    ['bitmap', 0, 0, 1, 1, '/wAA'],
  ],
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
  appsOrder,
  capabilities,
  files,
  indicator,
  inventoryItem,
  inventoryItemWithLegacyPosition,
  appsOrderWithoutDisabled,
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
