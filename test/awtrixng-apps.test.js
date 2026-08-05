const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AwtrixNgBuiltinAppNamesBySetting,
  AwtrixNgBuiltinAppSettingIds,
  AwtrixNgBuiltinAppUnavailableError,
  applyAwtrixNgBuiltinAppSettingsChange,
  createAwtrixNgAppsOrderPayloadFromBuiltinSettings,
  createAwtrixNgAppsOrderPayloadFromBuiltinSettingsChange,
  hasAwtrixNgBuiltinAppSettingsChange,
  isAwtrixNgBuiltinAppSetting,
  toAwtrixNgBuiltinAppSettingsFromApps,
  toAwtrixNgBuiltinAppSettingsUpdate,
} = require('../.homeybuild/lib/awtrixng/Services/Apps');

const createAppsInventory = (overrides = []) => [
  {
    name: 'Time',
    enabled: true,
    inLoop: true,
    slot: 0,
    present: true,
    origin: 'builtin',
  },
  {
    name: 'Date',
    enabled: true,
    inLoop: true,
    slot: 1,
    present: true,
    origin: 'builtin',
  },
  {
    name: 'homey-weather',
    enabled: true,
    inLoop: true,
    slot: 2,
    present: true,
    origin: 'pushed',
    icon: '1',
  },
  {
    name: 'clock',
    enabled: true,
    inLoop: true,
    slot: 3,
    present: true,
    origin: 'script',
    skipped: false,
    headless: false,
    config: true,
    error: null,
    meta: {
      name: 'Wall Clock',
      desc: '',
      author: 'me',
      version: '1.2',
    },
  },
  {
    name: 'Temperature',
    enabled: false,
    inLoop: false,
    slot: null,
    present: true,
    origin: 'builtin',
  },
  {
    name: 'Humidity',
    enabled: false,
    inLoop: false,
    slot: null,
    present: true,
    origin: 'builtin',
  },
  ...overrides,
];

const allBuiltinSettings = {
  showBuiltinTime: true,
  showBuiltinDate: true,
  showBuiltinTemperature: false,
  showBuiltinHumidity: false,
  showBuiltinBattery: false,
};

const createFakeAppsClient = (apps = createAppsInventory()) => {
  const calls = [];

  return {
    calls,
    client: {
      async getApps() {
        calls.push({ method: 'getApps' });
        return apps;
      },
      async putAppsOrder(payload) {
        calls.push({ method: 'putAppsOrder', payload });
        return { ok: true };
      },
    },
  };
};

test('AWTRIX NG built-in app mapping uses NG app names and Homey setting ids', () => {
  assert.deepEqual(AwtrixNgBuiltinAppNamesBySetting, {
    showBuiltinTime: 'Time',
    showBuiltinDate: 'Date',
    showBuiltinTemperature: 'Temperature',
    showBuiltinHumidity: 'Humidity',
    showBuiltinBattery: 'Battery',
  });
  assert.deepEqual(AwtrixNgBuiltinAppSettingIds, [
    'showBuiltinTime',
    'showBuiltinDate',
    'showBuiltinTemperature',
    'showBuiltinHumidity',
    'showBuiltinBattery',
  ]);

  const serializedMapping = JSON.stringify(AwtrixNgBuiltinAppNamesBySetting);

  for (const legacyKey of ['TIM', 'DAT', 'TEMP', 'HUM', 'BAT']) {
    assert.equal(serializedMapping.includes(legacyKey), false);
  }
});

test('AWTRIX NG built-in app setting guards detect relevant settings only', () => {
  assert.equal(isAwtrixNgBuiltinAppSetting('showBuiltinTime'), true);
  assert.equal(isAwtrixNgBuiltinAppSetting('showBuiltinBattery'), true);
  assert.equal(isAwtrixNgBuiltinAppSetting('TIM'), false);
  assert.equal(isAwtrixNgBuiltinAppSetting('transitionEffect'), false);
  assert.equal(hasAwtrixNgBuiltinAppSettingsChange(['authUser', 'showBuiltinDate']), true);
  assert.equal(hasAwtrixNgBuiltinAppSettingsChange(['authUser', 'transitionEffect']), false);
});

test('AWTRIX NG built-in app settings sync maps inventory to Homey settings', () => {
  assert.deepEqual(toAwtrixNgBuiltinAppSettingsFromApps(createAppsInventory()), allBuiltinSettings);
});

test('AWTRIX NG built-in app settings update includes only changed Homey settings', () => {
  assert.deepEqual(toAwtrixNgBuiltinAppSettingsUpdate(createAppsInventory(), {
    showBuiltinTime: true,
    showBuiltinDate: false,
    showBuiltinTemperature: false,
    showBuiltinHumidity: false,
    showBuiltinBattery: false,
  }), {
    showBuiltinDate: true,
  });
  assert.deepEqual(toAwtrixNgBuiltinAppSettingsUpdate(createAppsInventory(), allBuiltinSettings), {});
});

test('AWTRIX NG app order disables selected built-in apps and preserves other app order', () => {
  assert.deepEqual(createAwtrixNgAppsOrderPayloadFromBuiltinSettings(createAppsInventory(), {
    ...allBuiltinSettings,
    showBuiltinDate: false,
  }), {
    order: ['Time', 'homey-weather', 'clock'],
    disabled: ['Temperature', 'Humidity', 'Date', 'Battery'],
  });
});

test('AWTRIX NG app order appends a re-enabled available built-in app', () => {
  assert.deepEqual(createAwtrixNgAppsOrderPayloadFromBuiltinSettings(createAppsInventory(), {
    ...allBuiltinSettings,
    showBuiltinTemperature: true,
  }), {
    order: ['Time', 'Date', 'homey-weather', 'clock', 'Temperature'],
    disabled: ['Humidity', 'Battery'],
  });
});

test('AWTRIX NG app order preserves pushed and script apps when changing built-in visibility', () => {
  assert.deepEqual(createAwtrixNgAppsOrderPayloadFromBuiltinSettings(createAppsInventory(), {
    ...allBuiltinSettings,
    showBuiltinTime: false,
    showBuiltinTemperature: true,
  }), {
    order: ['Date', 'homey-weather', 'clock', 'Temperature'],
    disabled: ['Humidity', 'Time', 'Battery'],
  });
});

test('AWTRIX NG app order rejects unavailable built-in app when enabling it', () => {
  assert.throws(
    () => createAwtrixNgAppsOrderPayloadFromBuiltinSettings(createAppsInventory(), {
      ...allBuiltinSettings,
      showBuiltinBattery: true,
    }),
    (error) => {
      assert.equal(error instanceof AwtrixNgBuiltinAppUnavailableError, true);
      assert.equal(error.setting, 'showBuiltinBattery');
      assert.equal(error.appName, 'Battery');
      assert.match(error.message, /Battery is not available/);
      return true;
    },
  );
});

test('AWTRIX NG app order rejects invalid setting values before creating payload', () => {
  assert.throws(
    () => createAwtrixNgAppsOrderPayloadFromBuiltinSettings(createAppsInventory(), {
      ...allBuiltinSettings,
      showBuiltinDate: 'false',
    }),
    /showBuiltinDate must be a boolean/,
  );
});

test('AWTRIX NG app order change helper returns undefined for unrelated setting changes', () => {
  assert.equal(createAwtrixNgAppsOrderPayloadFromBuiltinSettingsChange(createAppsInventory(), allBuiltinSettings, [
    'transitionEffect',
  ]), undefined);
  assert.deepEqual(createAwtrixNgAppsOrderPayloadFromBuiltinSettingsChange(createAppsInventory(), {
    ...allBuiltinSettings,
    showBuiltinDate: false,
  }, [
    'showBuiltinDate',
  ]), {
    order: ['Time', 'homey-weather', 'clock'],
    disabled: ['Temperature', 'Humidity', 'Date', 'Battery'],
  });
});

test('AWTRIX NG app settings apply helper sends the complete order payload', async () => {
  const fake = createFakeAppsClient();

  assert.deepEqual(await applyAwtrixNgBuiltinAppSettingsChange(fake.client, {
    ...allBuiltinSettings,
    showBuiltinDate: false,
    showBuiltinTemperature: true,
  }, [
    'showBuiltinDate',
    'showBuiltinTemperature',
  ]), {
    order: ['Time', 'homey-weather', 'clock', 'Temperature'],
    disabled: ['Humidity', 'Date', 'Battery'],
  });
  assert.deepEqual(fake.calls, [{
    method: 'getApps',
  }, {
    method: 'putAppsOrder',
    payload: {
      order: ['Time', 'homey-weather', 'clock', 'Temperature'],
      disabled: ['Humidity', 'Date', 'Battery'],
    },
  }]);
});

test('AWTRIX NG app order preserves disabled apps, headless slots, placeholders and duplicates', () => {
  const apps = createAppsInventory([{
    name: 'headless-script',
    enabled: true,
    inLoop: false,
    slot: 4,
    present: true,
    origin: 'script',
    headless: true,
    config: false,
    skipped: false,
    error: null,
  }, {
    name: 'future-app',
    enabled: true,
    inLoop: false,
    slot: 5,
    present: false,
    origin: null,
  }, {
    name: 'Time',
    enabled: true,
    inLoop: true,
    slot: 6,
    present: true,
    origin: 'builtin',
  }, {
    name: 'disabled-script',
    enabled: false,
    inLoop: false,
    slot: null,
    present: true,
    origin: 'script',
    skipped: false,
    error: null,
  }, {
    name: 'shared-module',
    origin: 'module',
    import: 'shared',
    config: true,
    error: null,
  }]);

  assert.deepEqual(createAwtrixNgAppsOrderPayloadFromBuiltinSettings(apps, allBuiltinSettings), {
    order: ['Time', 'Date', 'homey-weather', 'clock', 'headless-script', 'future-app', 'Time'],
    disabled: ['Temperature', 'Humidity', 'disabled-script', 'Battery'],
  });
});

test('AWTRIX NG does not treat an absent app placeholder as an available built-in app', () => {
  const apps = createAppsInventory([{
    name: 'Battery',
    enabled: true,
    inLoop: false,
    slot: 4,
    present: false,
    origin: null,
  }]);

  assert.throws(
    () => createAwtrixNgAppsOrderPayloadFromBuiltinSettings(apps, {
      ...allBuiltinSettings,
      showBuiltinBattery: true,
    }),
    AwtrixNgBuiltinAppUnavailableError,
  );
});

test('AWTRIX NG app settings apply helper skips API calls for unrelated changes', async () => {
  const fake = createFakeAppsClient();

  assert.deepEqual(await applyAwtrixNgBuiltinAppSettingsChange(fake.client, allBuiltinSettings, [
    'transitionEffect',
  ]), {});
  assert.deepEqual(fake.calls, []);
});

test('AWTRIX NG app settings apply helper rejects unavailable app without an order write', async () => {
  const fake = createFakeAppsClient();

  await assert.rejects(
    () => applyAwtrixNgBuiltinAppSettingsChange(fake.client, {
      ...allBuiltinSettings,
      showBuiltinBattery: true,
    }, [
      'showBuiltinBattery',
    ]),
    AwtrixNgBuiltinAppUnavailableError,
  );
  assert.deepEqual(fake.calls, [{
    method: 'getApps',
  }]);
});
