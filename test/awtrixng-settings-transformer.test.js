const assert = require('node:assert/strict');
const test = require('node:test');

const {
  UnsupportedAwtrixNgPayloadFieldError,
  toAwtrixNgSettingsPatch,
} = require('../.homeybuild/lib/awtrixng/Payload/Transformers');
const {
  applyAwtrixNgHomeySettingsChange,
  createAwtrixNgSettingsPatchFromChangedSettings,
  hasAwtrixNgLocalSettingsChange,
  toAwtrixNgHomeySettingsFromApiSettings,
  toAwtrixNgHomeySettingsUpdate,
} = require('../.homeybuild/lib/awtrixng/Services/Settings');

const createFullSettingsResponse = (overrides = {}) => ({
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
  ...overrides,
});

const assertSettingsError = (input, field, reason = 'unknown-field') => {
  assert.throws(() => toAwtrixNgSettingsPatch(input), (error) => {
    assert.equal(error instanceof UnsupportedAwtrixNgPayloadFieldError, true);
    assert.equal(error.field, field);
    assert.equal(error.target, 'settings');
    assert.equal(error.reason, reason);
    return true;
  });
};

test('AWTRIX NG settings transformer accepts autoBrightness', () => {
  assert.deepEqual(toAwtrixNgSettingsPatch({
    autoBrightness: true,
  }), {
    autoBrightness: true,
  });
});

test('AWTRIX NG settings transformer accepts autoTransition', () => {
  assert.deepEqual(toAwtrixNgSettingsPatch({
    autoTransition: false,
  }), {
    autoTransition: false,
  });
});

test('AWTRIX NG settings transformer accepts blockNavigation', () => {
  assert.deepEqual(toAwtrixNgSettingsPatch({
    blockNavigation: true,
  }), {
    blockNavigation: true,
  });
});

test('AWTRIX NG settings transformer accepts uppercase', () => {
  assert.deepEqual(toAwtrixNgSettingsPatch({
    uppercase: false,
  }), {
    uppercase: false,
  });
});

test('AWTRIX NG settings transformer accepts transitionEffect string', () => {
  assert.deepEqual(toAwtrixNgSettingsPatch({
    transitionEffect: 'Rain',
  }), {
    transitionEffect: 'Rain',
  });
});

test('AWTRIX NG settings transformer accepts supported settings together', () => {
  const input = {
    autoBrightness: true,
    autoTransition: false,
    blockNavigation: true,
    uppercase: false,
    transitionEffect: 'Slide',
  };

  assert.deepEqual(toAwtrixNgSettingsPatch(input), input);
});

test('AWTRIX NG settings transformer rejects unknown settings instead of dropping them', () => {
  assertSettingsError({ brightness: 120 }, 'brightness');
  assertSettingsError({ showTime: true }, 'showTime');
  assertSettingsError({ unsupportedSetting: true }, 'unsupportedSetting');
});

test('AWTRIX NG settings transformer rejects invalid supported setting values', () => {
  assertSettingsError({ autoBrightness: 1 }, 'autoBrightness', 'invalid-value');
  assertSettingsError({ autoTransition: 'true' }, 'autoTransition', 'invalid-value');
  assertSettingsError({ blockNavigation: 0 }, 'blockNavigation', 'invalid-value');
  assertSettingsError({ uppercase: 'false' }, 'uppercase', 'invalid-value');
  assertSettingsError({ transitionEffect: 1 }, 'transitionEffect', 'invalid-value');
});

test('AWTRIX NG settings transformer rejects non-object input', () => {
  assertSettingsError(null, '<payload>', 'invalid-value');
  assertSettingsError([], '<payload>', 'invalid-value');
});

test('AWTRIX NG settings change helper ignores local auth credentials and does not create a PATCH', () => {
  assert.equal(hasAwtrixNgLocalSettingsChange(['authUser']), true);
  assert.equal(hasAwtrixNgLocalSettingsChange(['authPass']), true);
  assert.equal(hasAwtrixNgLocalSettingsChange(['autoBrightness']), false);
  assert.equal(createAwtrixNgSettingsPatchFromChangedSettings({
    authUser: 'homey',
    authPass: 'secret',
  }, ['authUser', 'authPass']), undefined);
});

test('AWTRIX NG settings change helper builds a patch only from changed supported NG settings', () => {
  assert.deepEqual(createAwtrixNgSettingsPatchFromChangedSettings({
    authUser: 'homey',
    authPass: 'secret',
    autoBrightness: true,
    autoTransition: false,
    blockNavigation: true,
    uppercase: false,
    transitionEffect: 'Rain',
  }, ['authUser', 'autoBrightness', 'uppercase']), {
    autoBrightness: true,
    uppercase: false,
  });
});

test('AWTRIX NG settings change helper rejects unsupported Homey setting keys before HTTP', () => {
  assert.throws(
    () => createAwtrixNgSettingsPatchFromChangedSettings({
      brightness: 120,
    }, ['brightness']),
    (error) => {
      assert.equal(error instanceof UnsupportedAwtrixNgPayloadFieldError, true);
      assert.equal(error.field, 'brightness');
      assert.equal(error.target, 'settings');
      assert.equal(error.reason, 'unknown-field');
      return true;
    },
  );
});

test('AWTRIX NG settings change helper passes transitionEffect through without capabilities preflight', () => {
  assert.deepEqual(createAwtrixNgSettingsPatchFromChangedSettings({
    transitionEffect: 'Rain',
  }, ['transitionEffect']), {
    transitionEffect: 'Rain',
  });
});

test('AWTRIX NG settings response mapper keeps only Homey-supported settings subset', () => {
  assert.deepEqual(toAwtrixNgHomeySettingsFromApiSettings(createFullSettingsResponse({
    autoBrightness: true,
    brightness: 220,
    autoTransition: false,
    blockNavigation: true,
    uppercase: false,
    transitionEffect: 'Slide',
  })), {
    autoBrightness: true,
    autoTransition: false,
    blockNavigation: true,
    transitionEffect: 'Slide',
    uppercase: false,
  });
});

test('AWTRIX NG settings response update includes only values changed by returned full settings resource', () => {
  assert.deepEqual(toAwtrixNgHomeySettingsUpdate(createFullSettingsResponse({
    autoBrightness: true,
    transitionEffect: 'Rain',
  }), {
    autoBrightness: false,
    autoTransition: true,
    blockNavigation: false,
    uppercase: true,
    transitionEffect: 'Rain',
  }), {
    autoBrightness: true,
  });
});

test('AWTRIX NG settings apply helper calls PATCH directly, then returns Homey update from full resource', async () => {
  const calls = [];
  const client = {
    async patchSettings(patch) {
      calls.push({ method: 'patchSettings', patch });
      return createFullSettingsResponse({
        autoBrightness: true,
        transitionEffect: 'Rain',
      });
    },
  };

  const result = await applyAwtrixNgHomeySettingsChange(client, {
    authUser: 'homey',
    transitionEffect: 'Rain',
    autoBrightness: true,
    autoTransition: true,
    blockNavigation: false,
    uppercase: true,
  }, ['authUser', 'transitionEffect', 'autoBrightness']);

  assert.deepEqual(calls, [{
    method: 'patchSettings',
    patch: {
      transitionEffect: 'Rain',
      autoBrightness: true,
    },
  }]);
  assert.deepEqual(result.patch, {
    transitionEffect: 'Rain',
    autoBrightness: true,
  });
  assert.deepEqual(result.homeySettingsUpdate, {});
});

test('AWTRIX NG settings apply helper does not call PATCH for auth-only changes', async () => {
  const calls = [];
  const client = {
    async patchSettings(patch) {
      calls.push({ method: 'patchSettings', patch });
      return createFullSettingsResponse();
    },
  };

  const result = await applyAwtrixNgHomeySettingsChange(client, {
    authUser: 'homey',
    authPass: 'secret',
  }, ['authUser', 'authPass']);

  assert.deepEqual(calls, []);
  assert.deepEqual(result, {
    homeySettingsUpdate: {},
  });
});
