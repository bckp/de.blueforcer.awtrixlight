const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const { createFakeHomey } = require('./helpers/fake-homey');

const root = path.resolve(__dirname, '..');
const readSource = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const getMethodBody = (source, methodName) => {
  const methodStart = source.indexOf(methodName);

  assert.notEqual(methodStart, -1, `${methodName} must exist`);

  const bodyStart = source.indexOf('{', methodStart);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    }

    if (source[index] === '}') {
      depth -= 1;
    }

    if (depth === 0) {
      return source.slice(bodyStart, index + 1);
    }
  }

  throw new Error(`Could not parse ${methodName} body`);
};

const getSourceBetween = (source, startText, endText) => {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);

  assert.notEqual(start, -1, `${startText} must exist`);
  assert.notEqual(end, -1, `${endText} must exist after ${startText}`);

  return source.slice(start, end);
};

test('AWTRIX NG device refreshes Homey settings from the device during init', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const onInitBody = getMethodBody(source, 'async onInit()');

  assert.equal(onInitBody.includes('await this.refreshSettingsFromDevice();'), true);
  assert.equal(onInitBody.includes('await this.refreshDisplayFromDevice();'), true);
  assert.equal(onInitBody.includes('await this.refreshAppsFromDevice();'), true);
  assert.equal(onInitBody.includes("deviceStateResult?.status === 'detected'"), true);
  assert.equal(onInitBody.indexOf('this.initCapabilityListeners();') < onInitBody.indexOf('if (baseUrl === undefined)'), true);
  assert.equal(onInitBody.indexOf('this.initializePoll();') < onInitBody.indexOf('if (baseUrl === undefined)'), true);
});

test('AWTRIX NG onSettings does not call setSettings while Homey settings are pending', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const onSettingsBody = getSourceBetween(source, 'async onSettings({', 'async refreshAvailability');

  assert.equal(onSettingsBody.includes('prepareLocalSettingsChanges'), true);
  assert.equal(onSettingsBody.includes('prepareSettingsChanges'), true);
  assert.equal(onSettingsBody.includes('writePreparedSettingsChanges'), true);
  assert.equal(onSettingsBody.includes('applySettingsChangesWithCandidateConnection'), true);
  assert.equal(onSettingsBody.includes('setSettings('), false);
});

test('AWTRIX NG connection settings use the verified candidate for writes before activation', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const candidateBody = getMethodBody(source, 'private async applySettingsChangesWithCandidateConnection(');

  assert.equal(candidateBody.includes('await this.verifyCandidateConnection'), true);
  assert.equal(candidateBody.includes('await this.prepareSettingsChanges'), true);
  assert.equal(candidateBody.includes('await this.writePreparedSettingsChanges'), true);
  assert.equal(candidateBody.includes('await this.commitConnection(connection, client, false);'), true);
  assert.equal(candidateBody.indexOf('await this.verifyCandidateConnection') < candidateBody.indexOf('await this.prepareSettingsChanges'), true);
  assert.equal(candidateBody.indexOf('await this.writePreparedSettingsChanges') < candidateBody.indexOf('await this.commitConnection'), true);
  assert.equal(candidateBody.includes('setSettings('), false);
});

test('AWTRIX NG settings validate locally before reads and write sequentially without claiming a transaction', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const localPrepareBody = getMethodBody(source, 'private prepareLocalSettingsChanges(');
  const writeBody = getMethodBody(source, 'private async writePreparedSettingsChanges(');

  assert.equal(localPrepareBody.includes('createAwtrixNgSettingsPatchFromChangedSettings'), true);
  assert.equal(localPrepareBody.includes('validateAwtrixNgBuiltinAppSettingsChange'), true);
  assert.equal(writeBody.includes('do not provide a transaction'), true);
  assert.equal(writeBody.includes('sequential and fail-fast'), true);
  assert.equal(writeBody.indexOf('await writeAwtrixNgAppsOrder') < writeBody.indexOf('await writeAwtrixNgSettingsPatch'), true);
  assert.equal(writeBody.includes('catch'), false);
  assert.equal(writeBody.includes('allSettled'), false);
});

test('AWTRIX NG device settings refresh uses GET settings and setSettings outside onSettings', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const refreshBody = getMethodBody(source, 'private async refreshSettingsFromDevice()');

  assert.equal(refreshBody.includes('await this.getClient().getSettings();'), true);
  assert.equal(refreshBody.includes('toAwtrixNgHomeySettingsUpdate'), true);
  assert.equal(refreshBody.includes('await this.setSettings(homeySettingsUpdate);'), true);
});

test('AWTRIX NG device display refresh syncs weather overlay capability from GET display', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const refreshBody = getMethodBody(source, 'private async refreshDisplayFromDevice()');

  assert.equal(refreshBody.includes('await this.getClient().getDisplay();'), true);
  assert.equal(refreshBody.includes('toAwtrixNgHomeyWeatherOverlayValue(display.overlay)'), true);
  assert.equal(refreshBody.includes('await this.setCapabilityValue(AwtrixNgWeatherOverlayCapabilityId, weatherOverlay);'), true);
  assert.equal(refreshBody.includes('setSettings('), false);
});

test('AWTRIX NG device apps refresh syncs built-in app settings from GET apps outside onSettings', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const refreshBody = getMethodBody(source, 'private async refreshAppsFromDevice()');

  assert.equal(refreshBody.includes('await this.getClient().getApps();'), true);
  assert.equal(refreshBody.includes('toAwtrixNgBuiltinAppSettingsUpdate'), true);
  assert.equal(refreshBody.includes('await this.setSettings(homeySettingsUpdate);'), true);
});

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

const createSettingsHarness = ({ storeEntries, settings: initialSettings }) => {
  const events = [];
  const clientCreations = [];
  const store = new Map(storeEntries);
  const settings = { ...initialSettings };
  const setSettingsCalls = [];
  const errors = [];
  const transport = {
    calls: [],
    async request(httpRequest) {
      this.calls.push(httpRequest);
      events.push({ type: 'request', method: httpRequest.method, path: httpRequest.path });

      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: createDeviceState(),
      };
    },
  };
  const AwtrixNgDevice = loadAwtrixNgDevice(transport, clientCreations);
  const device = new AwtrixNgDevice();
  const oldClient = { kind: 'old-client' };

  Object.assign(device, {
    homey: createFakeHomey(),
    client: oldClient,
    icons: { kind: 'old-icons' },
    available: true,
    log() {},
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
    async setCapabilityValue() {
      return undefined;
    },
  });

  return {
    clientCreations,
    device,
    errors,
    events,
    oldClient,
    setSettingsCalls,
    settings,
    store,
    transport,
  };
};

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
