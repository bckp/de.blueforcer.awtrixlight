const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const { AwtrixNgApiError } = require('../.homeybuild/lib/awtrixng/Api/ErrorParser');
const { AwtrixNgInvalidResponseError } = require('../.homeybuild/lib/awtrixng/Api/InvalidResponseError');
const { createFakeHomey } = require('./helpers/fake-homey');

const expectedUid = '48e7291211d8';

const createDeviceState = (overrides = {}) => ({
  uid: expectedUid,
  version: '1.0.4-dev',
  boardType: 'awtrixng',
  ipAddress: '192.0.2.60',
  matrixPower: true,
  currentApp: 'Time',
  indicators: [{
    on: false,
    color: '#000000',
    blinkMs: 0,
    fadeMs: 0,
  }],
  ...overrides,
});

const loadAwtrixNgDevice = (transport, clientCreations) => {
  const originalLoad = Module._load;

  function FakeHomeyDevice() {}

  function FakeAxiosTransport(options) {
    clientCreations.push(options);
    return transport;
  }

  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') {
      return { Device: FakeHomeyDevice };
    }
    if (request === '../../lib/awtrixng/Http/AxiosTransport') {
      return FakeAxiosTransport;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../.homeybuild/drivers/awtrixng/device');
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    return require('../.homeybuild/drivers/awtrixng/device');
  } finally {
    Module._load = originalLoad;
  }
};

const createDiscoveryHarness = ({
  available = false,
  request,
} = {}) => {
  const events = [];
  const clientCreations = [];
  const store = new Map([
    ['baseUrl', 'http://192.0.2.10:80'],
    ['address', '192.0.2.10'],
    ['port', 80],
  ]);
  const settings = {
    authUser: 'homey',
    authPass: 'secret',
  };
  const transport = {
    calls: [],
    async request(httpRequest) {
      this.calls.push(httpRequest);
      events.push({ type: 'request', path: httpRequest.path });
      return request === undefined
        ? {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: createDeviceState(),
        }
        : request(httpRequest);
    },
  };
  const AwtrixNgDevice = loadAwtrixNgDevice(transport, clientCreations);
  const device = new AwtrixNgDevice();
  const oldClient = { kind: 'old-client' };
  const oldIcons = { kind: 'old-icons' };
  const setSettingsCalls = [];

  Object.assign(device, {
    homey: createFakeHomey(),
    client: oldClient,
    icons: oldIcons,
    available,
    log() {},
    error() {},
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
      events.push({ type: 'getSettings' });
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
    async setCapabilityValue() {
      return undefined;
    },
  });

  return {
    clientCreations,
    device,
    events,
    oldClient,
    oldIcons,
    setSettingsCalls,
    settings,
    store,
    transport,
  };
};

const discoveryResult = {
  id: expectedUid,
  address: '192.0.2.60',
  port: '8080',
};

const assertConnectionUnchanged = (harness) => {
  assert.equal(harness.store.get('baseUrl'), 'http://192.0.2.10:80');
  assert.equal(harness.store.get('address'), '192.0.2.10');
  assert.equal(harness.store.get('port'), 80);
  assert.deepEqual(harness.setSettingsCalls, []);
  assert.equal(harness.device.client, harness.oldClient);
  assert.equal(harness.device.icons, harness.oldIcons);
};

test('AWTRIX NG discovery results match the paired device by the verified mDNS id and API uid', () => {
  const harness = createDiscoveryHarness();

  assert.equal(harness.device.onDiscoveryResult(discoveryResult), true);
  assert.equal(harness.device.onDiscoveryResult({
    ...discoveryResult,
    id: 'different-device',
  }), false);
});

test('AWTRIX NG discovery address change probes before committing store, settings and active client', async () => {
  const harness = createDiscoveryHarness();

  assert.equal(await harness.device.onDiscoveryAddressChanged(discoveryResult), true);
  assert.deepEqual(harness.events.map((event) => event.type), [
    'getSettings',
    'request',
    'store',
    'store',
    'store',
    'settings',
    'request',
    'available',
  ]);
  assert.deepEqual(harness.clientCreations.map(({ baseUrl, auth }) => ({ baseUrl, auth })), [{
    baseUrl: 'http://192.0.2.60:8080',
    auth: {
      username: 'homey',
      password: 'secret',
    },
  }]);
  assert.equal(harness.store.get('baseUrl'), 'http://192.0.2.60:8080');
  assert.equal(harness.store.get('address'), '192.0.2.60');
  assert.equal(harness.store.get('port'), 8080);
  assert.deepEqual(harness.setSettingsCalls, [{
    address: '192.0.2.60',
    port: 8080,
  }]);
  assert.notEqual(harness.device.client, harness.oldClient);
  assert.equal(harness.transport.calls.length, 2, 'the promoted candidate client performs the state refresh');
});

test('AWTRIX NG discovery available reuses the verified commit path only while unavailable', async () => {
  const harness = createDiscoveryHarness();
  const calls = [];

  harness.device.commitDiscoveredConnection = async (result) => {
    calls.push(result);
    return true;
  };

  assert.equal(await harness.device.onDiscoveryAvailable(discoveryResult), true);
  assert.deepEqual(calls, [discoveryResult]);

  harness.device.available = true;
  assert.equal(await harness.device.onDiscoveryAvailable(discoveryResult), false);
  assert.deepEqual(calls, [discoveryResult]);
});

for (const scenario of [{
  name: 'authentication failure',
  error: new AwtrixNgApiError({
    method: 'GET',
    url: 'http://192.0.2.60:8080/api/v1/device',
    message: 'invalid credentials',
    code: 'unauthorized',
    field: 'authorization',
    httpStatus: 401,
  }),
}, {
  name: 'offline API failure',
  error: new AwtrixNgApiError({
    method: 'GET',
    url: 'http://192.0.2.60:8080/api/v1/device',
    message: 'service unavailable',
    code: 'serviceBusy',
    field: 'device',
    httpStatus: 503,
  }),
}]) {
  test(`AWTRIX NG discovery ${scenario.name} preserves the original error and active connection`, async () => {
    const harness = createDiscoveryHarness({
      request: async () => {
        throw scenario.error;
      },
    });

    await assert.rejects(
      () => harness.device.onDiscoveryAddressChanged(discoveryResult),
      (error) => error === scenario.error,
    );
    assertConnectionUnchanged(harness);
    assert.equal(harness.clientCreations.length, 1, 'only a temporary candidate client was created');
  });
}

test('AWTRIX NG discovery rejects a different device uid without changing the active connection', async () => {
  const harness = createDiscoveryHarness({
    request: async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: createDeviceState({ uid: 'different-device' }),
    }),
  });

  await assert.rejects(
    () => harness.device.onDiscoveryAddressChanged(discoveryResult),
    (error) => {
      assert.equal(error.name, 'AwtrixNgDeviceIdentityMismatchError');
      assert.equal(error.expectedUid, expectedUid);
      assert.equal(error.actualUid, 'different-device');
      return true;
    },
  );
  assertConnectionUnchanged(harness);
});

test('AWTRIX NG discovery rejects an invalid probe response with the structured shape error', async () => {
  const harness = createDiscoveryHarness({
    request: async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { uid: expectedUid },
    }),
  });

  await assert.rejects(
    () => harness.device.onDiscoveryAddressChanged(discoveryResult),
    (error) => {
      assert.equal(error instanceof AwtrixNgInvalidResponseError, true);
      assert.equal(error.endpoint, '/api/v1/device');
      assert.equal(error.expectedShape, 'a valid AWTRIX NG device state object');
      assert.equal(error.actualType, 'object');
      return true;
    },
  );
  assertConnectionUnchanged(harness);
});

test('AWTRIX NG discovery rejects an invalid port before creating a candidate client', async () => {
  const harness = createDiscoveryHarness();

  await assert.rejects(
    () => harness.device.onDiscoveryAddressChanged({
      ...discoveryResult,
      port: '70000',
    }),
    RangeError,
  );
  assert.equal(harness.clientCreations.length, 0);
  assertConnectionUnchanged(harness);
});

test('AWTRIX NG onInit without a stored address registers controls and allows settings repair', async () => {
  const events = [];
  const clientCreations = [];
  const capabilityListeners = new Map();
  const store = new Map();
  const transport = {
    async request(httpRequest) {
      events.push({ type: 'request', path: httpRequest.path });
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: createDeviceState(),
      };
    },
  };
  const AwtrixNgDevice = loadAwtrixNgDevice(transport, clientCreations);
  const device = new AwtrixNgDevice();

  Object.assign(device, {
    homey: createFakeHomey(),
    available: true,
    log() {},
    error() {},
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
    registerCapabilityListener(capabilityId, listener) {
      capabilityListeners.set(capabilityId, listener);
    },
    getStoreValue(key) {
      return store.get(key);
    },
    async setStoreValue(key, value) {
      events.push({ type: 'store', key, value });
      store.set(key, value);
    },
    async getSettings() {
      return {};
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
    async setCapabilityValue() {
      return undefined;
    },
  });

  await device.onInit();

  assert.equal(device.available, false);
  assert.deepEqual([...capabilityListeners.keys()], [
    'awtrix_matrix',
    'button_next',
    'button_prev',
    'awtrixng_weather_overlay',
  ]);
  assert.equal(device.poll.isActive(), false);
  await assert.rejects(
    () => capabilityListeners.get('button_next')(),
    /Device address is not configured yet/,
  );

  await device.onSettings({
    oldSettings: {},
    newSettings: {
      address: '192.0.2.60',
      port: 8080,
      authUser: '',
      authPass: '',
    },
    changedKeys: ['address', 'port'],
  });

  assert.equal(store.get('baseUrl'), 'http://192.0.2.60:8080');
  assert.notEqual(device.client, undefined);
  assert.equal(device.poll.isActive(), true);
  assert.equal(device.available, true);
  assert.deepEqual(events.map((event) => event.type), [
    'unavailable',
    'request',
    'store',
    'store',
    'store',
    'request',
    'available',
  ]);
});

test('AWTRIX NG connection settings send device settings through the candidate before activation', async () => {
  let harness;
  const request = async (httpRequest) => {
    if (httpRequest.method === 'GET' && httpRequest.path === '/api/v1/device') {
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: createDeviceState(),
      };
    }

    if (httpRequest.method === 'PATCH' && httpRequest.path === '/api/v1/settings') {
      assert.equal(harness.device.client, harness.oldClient, 'candidate must remain inactive during remote writes');
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { autoBrightness: true },
      };
    }

    throw new Error(`Unexpected request: ${httpRequest.method} ${httpRequest.path}`);
  };

  harness = createDiscoveryHarness({ request });

  await harness.device.onSettings({
    oldSettings: {},
    newSettings: {
      address: '192.0.2.60',
      port: 8080,
      authUser: 'homey',
      authPass: 'secret',
      autoBrightness: true,
    },
    changedKeys: ['address', 'port', 'authUser', 'authPass', 'autoBrightness'],
  });

  assert.deepEqual(harness.transport.calls.map(({ method, path }) => ({ method, path })), [
    { method: 'GET', path: '/api/v1/device' },
    { method: 'PATCH', path: '/api/v1/settings' },
    { method: 'GET', path: '/api/v1/device' },
  ]);
  assert.equal(harness.store.get('baseUrl'), 'http://192.0.2.60:8080');
  assert.notEqual(harness.device.client, harness.oldClient);
  assert.deepEqual(harness.setSettingsCalls, [], 'onSettings must not call setSettings while Homey settings are pending');
});

test('AWTRIX NG connection settings preserve the active connection and original remote error', async () => {
  const sourceError = new AwtrixNgApiError({
    method: 'PATCH',
    url: 'http://192.0.2.60:8080/api/v1/settings',
    message: 'invalid brightness',
    code: 'validationFailed',
    field: 'autoBrightness',
    httpStatus: 422,
  });
  let requestCount = 0;
  const harness = createDiscoveryHarness({
    request: async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: createDeviceState(),
        };
      }

      throw sourceError;
    },
  });

  await assert.rejects(
    () => harness.device.onSettings({
      oldSettings: {},
      newSettings: {
        address: '192.0.2.60',
        port: 8080,
        authUser: 'homey',
        authPass: 'secret',
        autoBrightness: true,
      },
      changedKeys: ['address', 'port', 'autoBrightness'],
    }),
    (error) => error === sourceError,
  );
  assertConnectionUnchanged(harness);
});

test('AWTRIX NG connection settings prepare apps and settings before the first write request', async () => {
  const apps = ['Time', 'Date', 'Temperature', 'Humidity', 'Battery'].map((name, slot) => ({
    name,
    enabled: true,
    inLoop: true,
    slot,
    present: true,
    origin: 'builtin',
  }));
  const requestSequence = [];
  const harness = createDiscoveryHarness({
    request: async (httpRequest) => {
      requestSequence.push(`${httpRequest.method} ${httpRequest.path}`);

      if (httpRequest.method === 'GET' && httpRequest.path === '/api/v1/device') {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: createDeviceState(),
        };
      }

      if (httpRequest.method === 'GET' && httpRequest.path === '/api/v1/apps') {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: apps,
        };
      }

      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: httpRequest.path === '/api/v1/settings' ? { autoBrightness: true } : { ok: true },
      };
    },
  });

  await harness.device.onSettings({
    oldSettings: {},
    newSettings: {
      address: '192.0.2.60',
      port: 8080,
      authUser: 'homey',
      authPass: 'secret',
      autoBrightness: true,
      showBuiltinTime: true,
      showBuiltinDate: true,
      showBuiltinTemperature: true,
      showBuiltinHumidity: true,
      showBuiltinBattery: false,
    },
    changedKeys: ['address', 'autoBrightness', 'showBuiltinBattery'],
  });

  assert.deepEqual(requestSequence, [
    'GET /api/v1/device',
    'GET /api/v1/apps',
    'PUT /api/v1/apps/order',
    'PATCH /api/v1/settings',
    'GET /api/v1/device',
  ]);
});

test('AWTRIX NG invalid local device setting blocks candidate probe and every write', async () => {
  const harness = createDiscoveryHarness();

  await assert.rejects(
    () => harness.device.onSettings({
      oldSettings: {},
      newSettings: {
        address: '192.0.2.60',
        port: 8080,
        autoBrightness: 'yes',
      },
      changedKeys: ['address', 'autoBrightness'],
    }),
    /autoBrightness/,
  );
  assert.equal(harness.clientCreations.length, 0);
  assert.equal(harness.transport.calls.length, 0);
  assertConnectionUnchanged(harness);
});
