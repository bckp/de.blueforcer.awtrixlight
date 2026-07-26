const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AwtrixNgBuiltinAppNamesBySetting,
  AwtrixNgBuiltinAppSettingIds,
  AwtrixNgBuiltinAppUnavailableError,
  applyAwtrixNgBuiltinAppSettingsChange,
  createAwtrixNgAppsOrderFromBuiltinSettings,
  createAwtrixNgAppsOrderFromBuiltinSettingsChange,
  hasAwtrixNgBuiltinAppSettingsChange,
  isAwtrixNgBuiltinAppSetting,
  toAwtrixNgBuiltinAppSettingsFromApps,
  toAwtrixNgBuiltinAppSettingsUpdate,
} = require('../.homeybuild/lib/awtrixng/Services/Apps');

const createAppsInventory = (overrides = []) => [
  {
    name: 'Time',
    inLoop: true,
    position: 0,
    origin: 'builtin',
  },
  {
    name: 'Date',
    inLoop: true,
    position: 1,
    origin: 'builtin',
  },
  {
    name: 'homey-weather',
    inLoop: true,
    position: 2,
    origin: 'pushed',
    icon: '1',
  },
  {
    name: 'clock',
    inLoop: true,
    position: 3,
    origin: 'script',
    skipped: false,
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
    inLoop: false,
    position: null,
    origin: 'builtin',
  },
  {
    name: 'Humidity',
    inLoop: false,
    position: null,
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
      async putAppsOrder(order) {
        calls.push({ method: 'putAppsOrder', order });
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

test('AWTRIX NG built-in app order disables selected built-in apps and preserves other app order', () => {
  assert.deepEqual(createAwtrixNgAppsOrderFromBuiltinSettings(createAppsInventory(), {
    ...allBuiltinSettings,
    showBuiltinDate: false,
  }), [
    'Time',
    'homey-weather',
    'clock',
  ]);
});

test('AWTRIX NG built-in app order appends re-enabled available built-in apps to the end', () => {
  assert.deepEqual(createAwtrixNgAppsOrderFromBuiltinSettings(createAppsInventory(), {
    ...allBuiltinSettings,
    showBuiltinTemperature: true,
  }), [
    'Time',
    'Date',
    'homey-weather',
    'clock',
    'Temperature',
  ]);
});

test('AWTRIX NG built-in app order preserves pushed and script apps when changing built-in visibility', () => {
  assert.deepEqual(createAwtrixNgAppsOrderFromBuiltinSettings(createAppsInventory(), {
    ...allBuiltinSettings,
    showBuiltinTime: false,
    showBuiltinTemperature: true,
  }), [
    'Date',
    'homey-weather',
    'clock',
    'Temperature',
  ]);
});

test('AWTRIX NG built-in app order rejects unavailable built-in app when enabling it', () => {
  assert.throws(
    () => createAwtrixNgAppsOrderFromBuiltinSettings(createAppsInventory(), {
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

test('AWTRIX NG built-in app order rejects invalid setting values before creating order', () => {
  assert.throws(
    () => createAwtrixNgAppsOrderFromBuiltinSettings(createAppsInventory(), {
      ...allBuiltinSettings,
      showBuiltinDate: 'false',
    }),
    /showBuiltinDate must be a boolean/,
  );
});

test('AWTRIX NG built-in app order change helper returns undefined for unrelated setting changes', () => {
  assert.equal(createAwtrixNgAppsOrderFromBuiltinSettingsChange(createAppsInventory(), allBuiltinSettings, [
    'transitionEffect',
  ]), undefined);
  assert.deepEqual(createAwtrixNgAppsOrderFromBuiltinSettingsChange(createAppsInventory(), {
    ...allBuiltinSettings,
    showBuiltinDate: false,
  }, [
    'showBuiltinDate',
  ]), [
    'Time',
    'homey-weather',
    'clock',
  ]);
});

test('AWTRIX NG built-in app settings apply helper calls getApps then putAppsOrder for relevant changes', async () => {
  const fake = createFakeAppsClient();

  assert.deepEqual(await applyAwtrixNgBuiltinAppSettingsChange(fake.client, {
    ...allBuiltinSettings,
    showBuiltinDate: false,
    showBuiltinTemperature: true,
  }, [
    'showBuiltinDate',
    'showBuiltinTemperature',
  ]), {
    order: [
      'Time',
      'homey-weather',
      'clock',
      'Temperature',
    ],
  });
  assert.deepEqual(fake.calls, [{
    method: 'getApps',
  }, {
    method: 'putAppsOrder',
    order: [
      'Time',
      'homey-weather',
      'clock',
      'Temperature',
    ],
  }]);
});

test('AWTRIX NG built-in app settings apply helper skips API calls for unrelated changes', async () => {
  const fake = createFakeAppsClient();

  assert.deepEqual(await applyAwtrixNgBuiltinAppSettingsChange(fake.client, allBuiltinSettings, [
    'transitionEffect',
  ]), {});
  assert.deepEqual(fake.calls, []);
});

test('AWTRIX NG built-in app settings apply helper rejects unavailable enabled app without putAppsOrder', async () => {
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
