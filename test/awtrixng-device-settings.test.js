const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const { createFakeHomey } = require('./helpers/fake-homey');

const expectedUid = '48e7291211d8';

const createDeviceState = () => ({
  uid: expectedUid,
  version: '1.0.4-dev',
  boardType: 'awtrixng',
  ipAddress: '192.0.2.10',
  matrixPower: true,
  currentApp: 'Time',
  indicators: [{
    on: false,
    color: '#000000',
    blinkMs: 0,
    fadeMs: 0,
  }],
});

function FakeDiscoveryResultMDNSSD() {}

const loadAwtrixNgDevice = (transport, clientCreations) => {
  const originalLoad = Module._load;

  function FakeHomeyDevice() {}

  function FakeAxiosTransport(options) {
    clientCreations.push(options);
    return transport;
  }

  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') {
      return {
        Device: FakeHomeyDevice,
        DiscoveryResultMDNSSD: FakeDiscoveryResultMDNSSD,
      };
    }
    // The transport is created inside the AwtrixNgApi facade since update-plan-3 (M3).
    if (request === '../Http/AxiosTransport') {
      return FakeAxiosTransport;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    // The facade module is reloaded together with the device so each harness gets its own
    // fake transport instead of the one captured by a previously cached facade.
    delete require.cache[require.resolve('../.homeybuild/lib/awtrixng/Api/Api')];
    const modulePath = require.resolve('../.homeybuild/drivers/awtrixng/device');
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    return require('../.homeybuild/drivers/awtrixng/device');
  } finally {
    Module._load = originalLoad;
  }
};

const jsonResponse = (data) => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  data,
});

/**
 * Default API responses keyed by `METHOD path`. Individual tests override single
 * entries; a function value is invoked with the request so it can throw or record.
 */
const createDefaultResponses = () => ({
  'GET /api/v1/device': () => jsonResponse(createDeviceState()),
  'GET /api/v1/settings': () => jsonResponse({
    autoBrightness: true,
    autoTransition: false,
    blockNavigation: false,
    transitionEffect: 'fade',
    uppercase: true,
  }),
  'GET /api/v1/display': () => jsonResponse({ overlay: 'snow' }),
  'GET /api/v1/apps': () => jsonResponse([
    {
      name: 'Time', origin: 'builtin', present: true, enabled: true, slot: 0,
    },
    {
      name: 'Date', origin: 'builtin', present: true, enabled: false, slot: null,
    },
  ]),
  'PATCH /api/v1/settings': () => jsonResponse({
    autoBrightness: true,
    autoTransition: false,
    blockNavigation: false,
    transitionEffect: 'fade',
    uppercase: true,
  }),
  'PUT /api/v1/apps/order': () => jsonResponse({ ok: true }),
});

const discoveryResult = (address, port) => Object.assign(
  Object.create(FakeDiscoveryResultMDNSSD.prototype),
  { address, port },
);

const createSettingsHarness = ({
  storeEntries,
  settings: initialSettings,
  responses: responseOverrides = {},
  discovered,
}) => {
  const events = [];
  const clientCreations = [];
  const store = new Map(storeEntries);
  const settings = { ...initialSettings };
  const setSettingsCalls = [];
  const errors = [];
  const logs = [];
  const capabilityListeners = [];
  const capabilityValues = [];
  const responses = { ...createDefaultResponses(), ...responseOverrides };
  const transport = {
    calls: [],
    async request(httpRequest) {
      this.calls.push(httpRequest);
      events.push({ type: 'request', method: httpRequest.method, path: httpRequest.path });

      const responder = responses[`${httpRequest.method} ${httpRequest.path}`];

      assert.notEqual(responder, undefined, `unexpected request ${httpRequest.method} ${httpRequest.path}`);

      return responder(httpRequest);
    },
  };
  const AwtrixNgDevice = loadAwtrixNgDevice(transport, clientCreations);
  const device = new AwtrixNgDevice();
  const oldClient = { kind: 'old-client' };

  Object.assign(device, {
    homey: createFakeHomey(),
    // device.client is a read-only view of device.api since update-plan-3 (M3).
    api: oldClient,
    available: true,
    log(...args) {
      logs.push(args);
    },
    error(...args) {
      errors.push(args);
    },
    getData() {
      return { id: expectedUid };
    },
    getAvailable() {
      return this.available;
    },
    async setAvailable() {
      events.push({ type: 'available' });
      this.available = true;
    },
    async setUnavailable(message) {
      events.push({ type: 'unavailable', message });
      this.available = false;
    },
    getStoreValue(key) {
      return store.get(key);
    },
    async setStoreValue(key, value) {
      events.push({ type: 'store', key, value });
      store.set(key, value);
    },
    async getSettings() {
      return { ...settings };
    },
    async setSettings(update) {
      events.push({ type: 'settings', update });
      setSettingsCalls.push(update);
      Object.assign(settings, update);
    },
    getCapabilities() {
      return [];
    },
    hasCapability() {
      return false;
    },
    async addCapability() {
      return undefined;
    },
    async setCapabilityValue(capabilityId, value) {
      capabilityValues.push({ capabilityId, value });
      return undefined;
    },
    registerCapabilityListener(capabilityId, listener) {
      capabilityListeners.push({ capabilityId, listener });
    },
    driver: {
      getDiscoveryStrategy() {
        return {
          getDiscoveryResult() {
            return discovered;
          },
        };
      },
    },
  });

  return {
    capabilityListeners,
    capabilityValues,
    clientCreations,
    device,
    errors,
    events,
    logs,
    oldClient,
    requestLog: () => transport.calls.map(({ method, path }) => `${method} ${path}`),
    setSettingsCalls,
    settings,
    store,
    transport,
  };
};

test('AWTRIX NG settings logs redact credentials without changing the submitted settings', async () => {
  const harness = createSettingsHarness({
    storeEntries: [['baseUrl', 'http://192.0.2.10:80']],
    settings: {
      address: '192.0.2.10',
      port: 80,
      authUser: 'homey',
      authPass: 'new-secret',
    },
  });

  await harness.device.onInit();
  harness.logs.length = 0;
  const oldSettings = {
    authUser: 'old-user',
    authPass: 'old-secret',
    uppercase: false,
  };
  const newSettings = {
    authUser: 'new-user',
    authPass: 'new-secret',
    uppercase: true,
  };

  await harness.device.onSettings({
    oldSettings,
    newSettings,
    changedKeys: ['uppercase'],
  });

  assert.deepEqual(harness.logs, [[
    'AwtrixNgDevice settings were changed',
    { authUser: '<redacted>', authPass: '<redacted>', uppercase: false },
    { authUser: '<redacted>', authPass: '<redacted>', uppercase: true },
    ['uppercase'],
  ]]);
  assert.equal(oldSettings.authUser, 'old-user');
  assert.equal(oldSettings.authPass, 'old-secret');
  assert.equal(newSettings.authUser, 'new-user');
  assert.equal(newSettings.authPass, 'new-secret');
  assert.deepEqual(harness.transport.calls.at(-1).body, { uppercase: true });
});

test('AWTRIX NG local settings change falls back to the stored address when settings carry none', async () => {
  const harness = createSettingsHarness({
    storeEntries: [
      ['baseUrl', 'http://192.0.2.10:80'],
      ['address', '192.0.2.10'],
      ['port', 80],
    ],
    settings: {
      address: '',
      port: 80,
      authUser: 'homey',
      authPass: 'secret',
    },
  });

  await harness.device.onSettings({
    oldSettings: {
      address: '',
      port: 80,
      authUser: 'homey',
      authPass: 'old-secret',
    },
    newSettings: {
      address: '',
      port: 80,
      authUser: 'homey',
      authPass: 'secret',
    },
    changedKeys: ['authPass'],
  });

  assert.deepEqual(harness.clientCreations.map(({ baseUrl, auth }) => ({ baseUrl, auth })), [{
    baseUrl: 'http://192.0.2.10:80',
    auth: {
      username: 'homey',
      password: 'secret',
    },
  }], 'the candidate is probed against the stored address with the new credentials');
  assert.deepEqual(harness.transport.calls.map(({ method, path }) => ({ method, path })), [
    { method: 'GET', path: '/api/v1/device' },
    { method: 'GET', path: '/api/v1/device' },
  ]);
  assert.equal(harness.store.get('baseUrl'), 'http://192.0.2.10:80');
  assert.equal(harness.store.get('address'), '192.0.2.10');
  assert.equal(harness.store.get('port'), 80);
  assert.notEqual(harness.device.client, harness.oldClient);
  assert.equal(harness.device.poll.isActive(), true);
  assert.equal(harness.device.available, true);
  assert.deepEqual(harness.setSettingsCalls, [], 'no setSettings while the Homey settings are pending');

  await harness.device.pendingSettingsSync;

  assert.deepEqual(harness.setSettingsCalls, [{
    address: '192.0.2.10',
    port: 80,
  }], 'the restored connection is written back after onSettings resolved');
  assert.deepEqual(harness.errors, []);
});

test('AWTRIX NG local settings change without an address in settings or store stays not configured', async () => {
  const harness = createSettingsHarness({
    storeEntries: [],
    settings: {
      address: '',
      port: 80,
      authUser: 'homey',
      authPass: 'secret',
    },
  });

  await assert.rejects(
    () => harness.device.onSettings({
      oldSettings: {
        address: '',
        port: 80,
        authPass: 'old-secret',
      },
      newSettings: {
        address: '',
        port: 80,
        authUser: 'homey',
        authPass: 'secret',
      },
      changedKeys: ['authPass'],
    }),
    /states\.awtrixNg\.connectionNotConfigured/,
  );
  assert.equal(harness.clientCreations.length, 0);
  assert.deepEqual(harness.transport.calls, []);
  assert.equal(harness.device.client, harness.oldClient);
  assert.deepEqual(harness.setSettingsCalls, []);
  assert.equal(harness.device.pendingSettingsSync, undefined);
});

test('AWTRIX NG local settings change with an explicit address does not schedule a settings sync', async () => {
  const harness = createSettingsHarness({
    storeEntries: [
      ['baseUrl', 'http://192.0.2.10:80'],
      ['address', '192.0.2.10'],
      ['port', 80],
    ],
    settings: {
      address: '192.0.2.20',
      port: 8080,
      authUser: '',
      authPass: '',
    },
  });

  await harness.device.onSettings({
    oldSettings: {
      address: '192.0.2.10',
      port: 80,
    },
    newSettings: {
      address: '192.0.2.20',
      port: 8080,
      authUser: '',
      authPass: '',
    },
    changedKeys: ['address', 'port'],
  });

  assert.equal(harness.store.get('baseUrl'), 'http://192.0.2.20:8080');
  assert.equal(harness.device.pendingSettingsSync, undefined);
  assert.deepEqual(harness.setSettingsCalls, []);
});

/**
 * H5: the assertions below used to parse device.ts as text. They now exercise the real
 * onInit/onSettings code paths against a fake transport, so they fail on behaviour
 * changes rather than on renamed helpers.
 */

test('AWTRIX NG onInit synchronises settings, display and built-in apps from the device', async () => {
  const harness = createSettingsHarness({
    storeEntries: [
      ['baseUrl', 'http://192.0.2.10:80'],
      ['address', '192.0.2.10'],
      ['port', 80],
    ],
    settings: {
      address: '192.0.2.10',
      port: 80,
      autoBrightness: false,
      uppercase: false,
      showBuiltinTime: false,
      showBuiltinDate: true,
    },
  });

  harness.device.hasCapability = () => true;

  await harness.device.onInit();

  assert.deepEqual(harness.requestLog(), [
    'GET /api/v1/device',
    'GET /api/v1/settings',
    'GET /api/v1/display',
    'GET /api/v1/apps',
  ], 'the device state is probed first, then settings, display and apps are read');

  assert.deepEqual(harness.setSettingsCalls, [
    {
      autoBrightness: true,
      autoTransition: false,
      blockNavigation: false,
      transitionEffect: 'fade',
      uppercase: true,
    },
    {
      showBuiltinTime: true,
      showBuiltinDate: false,
      showBuiltinTemperature: false,
      showBuiltinHumidity: false,
      showBuiltinBattery: false,
    },
  ], 'settings and built-in app state are written back to Homey');

  assert.deepEqual(
    harness.capabilityValues.filter(({ capabilityId }) => capabilityId === 'awtrixng_weather_overlay'),
    [{ capabilityId: 'awtrixng_weather_overlay', value: 'snow' }],
    'the weather overlay capability mirrors GET display',
  );
  assert.equal(harness.device.available, true);
  assert.equal(harness.device.poll.isActive(), true);
  assert.deepEqual(harness.errors, []);
});

test('AWTRIX NG onInit registers capability listeners and polls even without a stored connection', async () => {
  const harness = createSettingsHarness({
    storeEntries: [],
    settings: {},
  });

  await harness.device.onInit();

  assert.deepEqual(harness.capabilityListeners.map(({ capabilityId }) => capabilityId), [
    'awtrix_matrix',
    'button_next',
    'button_prev',
    'awtrixng_weather_overlay',
    'button.rediscover',
  ], 'listeners are registered before the connection is checked');
  assert.equal(harness.device.poll !== undefined, true);
  assert.deepEqual(harness.transport.calls, [], 'no request is made without a connection');
  assert.equal(harness.device.available, false);
});

test('AWTRIX NG onInit stays available-driven when the initial synchronisation fails', async () => {
  const harness = createSettingsHarness({
    storeEntries: [['baseUrl', 'http://192.0.2.10:80']],
    settings: { address: '192.0.2.10', port: 80 },
    responses: {
      'GET /api/v1/settings': () => jsonResponse('not-an-object'),
    },
  });

  await harness.device.onInit();

  assert.deepEqual(harness.requestLog(), ['GET /api/v1/device', 'GET /api/v1/settings']);
  assert.equal(harness.errors.length, 1, 'the invalid response is logged');
  assert.equal(harness.device.available, false);
  assert.equal(harness.device.poll.isActive(), true, 'polling still starts so the device can recover');
});

test('AWTRIX NG built-in app change reads the inventory and writes the app order only', async () => {
  const harness = createSettingsHarness({
    storeEntries: [['baseUrl', 'http://192.0.2.10:80']],
    settings: { address: '192.0.2.10', port: 80 },
  });

  await harness.device.onInit();
  harness.transport.calls.length = 0;
  harness.setSettingsCalls.length = 0;

  await harness.device.onSettings({
    oldSettings: { showBuiltinDate: false },
    newSettings: { showBuiltinDate: true },
    changedKeys: ['showBuiltinDate'],
  });

  assert.deepEqual(harness.requestLog(), [
    'GET /api/v1/apps',
    'PUT /api/v1/apps/order',
  ], 'no settings PATCH is issued for a pure built-in app change');
  assert.deepEqual(harness.setSettingsCalls, [], 'onSettings never calls setSettings');
  assert.deepEqual(harness.clientCreations.length, 1, 'the existing connection is reused');
});

test('AWTRIX NG combined change writes the app order before the settings patch', async () => {
  const harness = createSettingsHarness({
    storeEntries: [['baseUrl', 'http://192.0.2.10:80']],
    settings: { address: '192.0.2.10', port: 80 },
  });

  await harness.device.onInit();
  harness.transport.calls.length = 0;
  harness.setSettingsCalls.length = 0;

  await harness.device.onSettings({
    oldSettings: { showBuiltinDate: false, uppercase: false },
    newSettings: { showBuiltinDate: true, uppercase: true },
    changedKeys: ['showBuiltinDate', 'uppercase'],
  });

  assert.deepEqual(harness.requestLog(), [
    'GET /api/v1/apps',
    'PUT /api/v1/apps/order',
    'PATCH /api/v1/settings',
  ]);
  assert.deepEqual(harness.setSettingsCalls, []);
});

test('AWTRIX NG settings writes are sequential and fail fast (R7)', async () => {
  const orderFailure = new Error('apps order rejected');
  const harness = createSettingsHarness({
    storeEntries: [['baseUrl', 'http://192.0.2.10:80']],
    settings: { address: '192.0.2.10', port: 80 },
    responses: {
      'PUT /api/v1/apps/order': () => {
        throw orderFailure;
      },
    },
  });

  await harness.device.onInit();
  harness.transport.calls.length = 0;

  await assert.rejects(
    () => harness.device.onSettings({
      oldSettings: { showBuiltinDate: false, uppercase: false },
      newSettings: { showBuiltinDate: true, uppercase: true },
      changedKeys: ['showBuiltinDate', 'uppercase'],
    }),
    orderFailure,
    'the first failing write rejects onSettings',
  );

  assert.deepEqual(harness.requestLog(), [
    'GET /api/v1/apps',
    'PUT /api/v1/apps/order',
  ], 'the settings patch is never attempted after the app order failed');
});

test('AWTRIX NG local settings change validates unknown keys before touching the device', async () => {
  const harness = createSettingsHarness({
    storeEntries: [['baseUrl', 'http://192.0.2.10:80']],
    settings: { address: '192.0.2.10', port: 80 },
  });

  await harness.device.onInit();
  harness.transport.calls.length = 0;

  await assert.rejects(
    () => harness.device.onSettings({
      oldSettings: { address: '192.0.2.10', port: 80 },
      newSettings: { address: '192.0.2.11', port: 80, somethingUnknown: true },
      changedKeys: ['address', 'somethingUnknown'],
    }),
    /somethingUnknown/,
  );

  assert.deepEqual(harness.transport.calls, [], 'local validation happens before any request');
});

test('AWTRIX NG local settings change verifies the candidate before writing and activates it afterwards', async () => {
  const harness = createSettingsHarness({
    storeEntries: [
      ['baseUrl', 'http://192.0.2.10:80'],
      ['address', '192.0.2.10'],
      ['port', 80],
    ],
    settings: { address: '192.0.2.10', port: 80 },
  });

  await harness.device.onInit();
  const clientAfterInit = harness.device.client;
  harness.transport.calls.length = 0;
  harness.setSettingsCalls.length = 0;

  await harness.device.onSettings({
    oldSettings: { address: '192.0.2.10', port: 80, uppercase: false },
    newSettings: { address: '192.0.2.11', port: 80, uppercase: true },
    changedKeys: ['address', 'uppercase'],
  });

  assert.deepEqual(harness.requestLog(), [
    'GET /api/v1/device',
    'PATCH /api/v1/settings',
    'GET /api/v1/device',
  ], 'the candidate is probed, then written to, then re-read after activation');
  assert.equal(harness.store.get('baseUrl'), 'http://192.0.2.11:80');
  assert.notEqual(harness.device.client, clientAfterInit, 'the verified candidate becomes the active client');
  assert.deepEqual(harness.setSettingsCalls, [], 'onSettings never calls setSettings');
  assert.equal(harness.device.pendingSettingsSync, undefined);
});

test('AWTRIX NG clearing the address adopts the discovered one instead of the stored one', async () => {
  const harness = createSettingsHarness({
    storeEntries: [
      ['baseUrl', 'http://192.0.2.10:80'],
      ['address', '192.0.2.10'],
      ['port', 80],
    ],
    settings: { address: '192.0.2.10', port: 80 },
    discovered: discoveryResult('192.0.2.55', 80),
  });

  await harness.device.onInit();
  harness.transport.calls.length = 0;
  harness.setSettingsCalls.length = 0;

  await harness.device.onSettings({
    oldSettings: { address: '192.0.2.10', port: 80 },
    newSettings: { address: '', port: 80 },
    changedKeys: ['address'],
  });

  assert.equal(harness.store.get('address'), '192.0.2.55', 'the stored address is not reused');
  assert.equal(harness.store.get('baseUrl'), 'http://192.0.2.55:80');

  await harness.device.pendingSettingsSync;

  assert.deepEqual(harness.setSettingsCalls, [{
    address: '192.0.2.55',
    port: 80,
  }], 'the discovered address is written back into the settings');
  assert.deepEqual(harness.errors, []);
});

test('AWTRIX NG clearing the address without a discovery result leaves the device unconfigured', async () => {
  const harness = createSettingsHarness({
    storeEntries: [
      ['baseUrl', 'http://192.0.2.10:80'],
      ['address', '192.0.2.10'],
      ['port', 80],
    ],
    settings: { address: '192.0.2.10', port: 80 },
    discovered: undefined,
  });

  await harness.device.onInit();
  harness.transport.calls.length = 0;

  await assert.rejects(
    () => harness.device.onSettings({
      oldSettings: { address: '192.0.2.10', port: 80 },
      newSettings: { address: '', port: 80 },
      changedKeys: ['address'],
    }),
    /states\.awtrixNg\.connectionNotConfigured/,
    'the stored address must not silently come back',
  );

  assert.equal(harness.store.get('address'), '192.0.2.10', 'the store is left untouched');
  assert.deepEqual(harness.transport.calls, []);
  assert.equal(harness.device.pendingSettingsSync, undefined);
});

test('AWTRIX NG migration fallback still applies when the address was not the changed key', async () => {
  const harness = createSettingsHarness({
    storeEntries: [
      ['baseUrl', 'http://192.0.2.10:80'],
      ['address', '192.0.2.10'],
      ['port', 80],
    ],
    settings: {
      address: '', port: 80, authUser: 'homey', authPass: 'secret',
    },
    discovered: discoveryResult('192.0.2.55', 80),
  });

  await harness.device.onSettings({
    oldSettings: {
      address: '', port: 80, authUser: 'homey', authPass: 'old',
    },
    newSettings: {
      address: '', port: 80, authUser: 'homey', authPass: 'secret',
    },
    changedKeys: ['authPass'],
  });

  assert.equal(harness.store.get('address'), '192.0.2.10', 'a credentials change keeps using the store');
  await harness.device.pendingSettingsSync;
  assert.deepEqual(harness.setSettingsCalls, [{ address: '192.0.2.10', port: 80 }]);
});

test('AWTRIX NG rediscover button commits the discovered connection', async () => {
  const harness = createSettingsHarness({
    storeEntries: [
      ['baseUrl', 'http://192.0.2.10:80'],
      ['address', '192.0.2.10'],
      ['port', 80],
    ],
    settings: { address: '192.0.2.10', port: 80 },
    discovered: discoveryResult('192.0.2.55', 80),
  });

  await harness.device.onInit();
  harness.transport.calls.length = 0;
  harness.setSettingsCalls.length = 0;

  const rediscover = harness.capabilityListeners
    .find(({ capabilityId }) => capabilityId === 'button.rediscover');

  assert.ok(rediscover, 'the maintenance action is registered');

  await rediscover.listener();

  assert.equal(harness.store.get('address'), '192.0.2.55');
  assert.equal(harness.store.get('baseUrl'), 'http://192.0.2.55:80');
  assert.deepEqual(harness.setSettingsCalls, [{ address: '192.0.2.55', port: 80 }]);
  assert.deepEqual(harness.errors, []);
});

test('AWTRIX NG rediscover button reports failure when nothing is discovered', async () => {
  const harness = createSettingsHarness({
    storeEntries: [['baseUrl', 'http://192.0.2.10:80']],
    settings: { address: '192.0.2.10', port: 80 },
    discovered: undefined,
  });

  await harness.device.onInit();

  const rediscover = harness.capabilityListeners
    .find(({ capabilityId }) => capabilityId === 'button.rediscover');

  await assert.rejects(() => rediscover.listener(), /states\.awtrixNg\.rediscoveryFailed/);
});

test('AWTRIX NG rediscover button contains a failing commit instead of leaking it', async () => {
  const probeFailure = new Error('candidate offline');
  const harness = createSettingsHarness({
    storeEntries: [['baseUrl', 'http://192.0.2.10:80']],
    settings: { address: '192.0.2.10', port: 80 },
    discovered: discoveryResult('192.0.2.55', 80),
  });

  await harness.device.onInit();
  harness.errors.length = 0;
  harness.transport.request = async () => {
    throw probeFailure;
  };

  const rediscover = harness.capabilityListeners
    .find(({ capabilityId }) => capabilityId === 'button.rediscover');

  await assert.rejects(() => rediscover.listener(), /states\.awtrixNg\.rediscoveryFailed/);
  assert.equal(harness.errors.length, 1, 'the underlying failure is logged');
});
