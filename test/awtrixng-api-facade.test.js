const assert = require('node:assert/strict');
const test = require('node:test');

const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const { AwtrixNgDeviceIdentityMismatchError } = require('../.homeybuild/lib/awtrixng/Api/IdentityMismatchError');
const { AwtrixNgInvalidResponseError } = require('../.homeybuild/lib/awtrixng/Api/InvalidResponseError');
const { AwtrixNgUnsupportedVersionError } = require('../.homeybuild/lib/awtrixng/Api/UnsupportedVersionError');
const { AwtrixNgBuiltinAppUnavailableError } = require('../.homeybuild/lib/awtrixng/Services/Apps');

const BaseUrl = 'http://192.168.1.44:8080';

const emptyIcon = {
  name: 'None',
  id: '-',
  description: 'No icon',
};

const deviceStateResponse = {
  uid: 'aabbccddeeff',
  version: '1.0.14',
  boardType: 'awtrixng',
  ipAddress: '192.168.1.44',
  matrixPower: true,
  currentApp: 'Time',
  indicators: [{
    on: false,
    color: '#000000',
    blinkMs: 0,
    fadeMs: 0,
  }],
};

const builtinApp = (name, extra = {}) => ({
  name,
  origin: 'builtin',
  present: true,
  enabled: true,
  slot: 0,
  ...extra,
});

const createFakeTransport = (routes) => {
  const calls = [];

  return {
    calls,
    async request(request) {
      calls.push(request);
      const key = `${request.method} ${request.path}`;
      const handler = routes[key];

      if (handler === undefined) {
        throw new Error(`Unexpected request: ${key}`);
      }

      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: typeof handler === 'function' ? handler(request) : handler,
      };
    },
  };
};

const createApi = (routes = {}) => {
  const transport = createFakeTransport(routes);
  const api = new AwtrixNgApi(new AwtrixNgClient(transport), {
    baseUrl: BaseUrl,
    icons: { emptyIcon },
  });

  return { api, transport };
};

test('fromConnection constructs a facade with baseUrl and icons', () => {
  const api = AwtrixNgApi.fromConnection({ baseUrl: BaseUrl }, { emptyIcon });

  assert.equal(api.baseUrl, BaseUrl);
  assert.ok(api.icons);
});

test('facade delegates flow client and control methods to the client endpoints', async () => {
  const { api, transport } = createApi({
    'POST /api/v1/notifications': { ok: true },
    'PATCH /api/v1/display': { ok: true },
    'POST /api/v1/apps/next': { ok: true },
    'POST /api/v1/apps/previous': { ok: true },
    'GET /api/v1/device': deviceStateResponse,
    'DELETE /api/v1/apps/homey%3Aclock': { ok: true },
  });

  await api.sendNotification({ pages: [{ text: 'hello' }] });
  await api.setMatrixPower(true);
  await api.nextApp();
  await api.previousApp();
  await api.deleteApp('homey:clock');
  const state = await api.getDeviceState();

  assert.equal(state.uid, 'aabbccddeeff');
  assert.deepEqual(
    transport.calls.map((call) => `${call.method} ${call.path}`),
    [
      'POST /api/v1/notifications',
      'PATCH /api/v1/display',
      'POST /api/v1/apps/next',
      'POST /api/v1/apps/previous',
      'DELETE /api/v1/apps/homey%3Aclock',
      'GET /api/v1/device',
    ],
  );
  assert.deepEqual(transport.calls[0].body, { pages: [{ text: 'hello' }] });
  assert.deepEqual(transport.calls[1].body, { power: true });
});

test('setMatrixPower rejects non-boolean values without touching the device', async () => {
  const { api, transport } = createApi();

  await assert.rejects(api.setMatrixPower('on'), /must be a boolean/);
  assert.equal(transport.calls.length, 0);
});

test('playRtttl uses the cached device version and the audio endpoint on firmware 1.1.0', async () => {
  const { api, transport } = createApi({
    'GET /api/v1/device': { ...deviceStateResponse, version: '1.1.0' },
    'POST /api/v1/audio/play': { ok: true },
  });

  await api.probe();
  await api.playRtttl('beep:d=4,o=5,b=120:c');

  assert.deepEqual(
    transport.calls.map((call) => `${call.method} ${call.path}`),
    ['GET /api/v1/device', 'POST /api/v1/audio/play'],
  );
  assert.deepEqual(transport.calls[1].body, { rtttl: 'beep:d=4,o=5,b=120:c' });
});

test('playRtttl rejects cached firmware below 1.1.0 without calling the audio endpoint', async () => {
  const { api, transport } = createApi({
    'GET /api/v1/device': deviceStateResponse,
  });

  await api.probe();

  await assert.rejects(api.playRtttl('beep:d=4,o=5,b=120:c'), (error) => {
    assert.ok(error instanceof AwtrixNgUnsupportedVersionError);
    assert.equal(error.name, 'AwtrixNgUnsupportedVersionError');
    assert.equal(error.currentVersion, '1.0.14');
    assert.equal(error.minimumVersion, '1.1.0');
    assert.match(error.message, /requires AWTRIX NG firmware 1\.1\.0 or newer/);
    return true;
  });

  assert.deepEqual(
    transport.calls.map((call) => `${call.method} ${call.path}`),
    ['GET /api/v1/device'],
  );
});

test('playRtttl rejects with the same version error when no device version is known yet', async () => {
  const { api, transport } = createApi();

  await assert.rejects(api.playRtttl('beep:d=4,o=5,b=120:c'), (error) => {
    assert.ok(error instanceof AwtrixNgUnsupportedVersionError);
    assert.equal(error.currentVersion, undefined);
    assert.equal(error.minimumVersion, '1.1.0');
    return true;
  });

  assert.equal(transport.calls.length, 0);
});

test('verifyIdentity resolves with the detected probe result on a uid match', async () => {
  const { api } = createApi({
    'GET /api/v1/device': deviceStateResponse,
  });

  const result = await api.verifyIdentity('aabbccddeeff');

  assert.equal(result.status, 'detected');
  assert.equal(result.device.uid, 'aabbccddeeff');
});

test('verifyIdentity throws an identity mismatch error for a different uid', async () => {
  const { api } = createApi({
    'GET /api/v1/device': deviceStateResponse,
  });

  await assert.rejects(api.verifyIdentity('001122334455'), (error) => {
    assert.ok(error instanceof AwtrixNgDeviceIdentityMismatchError);
    assert.equal(error.name, 'AwtrixNgDeviceIdentityMismatchError');
    assert.equal(error.expectedUid, '001122334455');
    assert.equal(error.actualUid, 'aabbccddeeff');
    return true;
  });
});

test('verifyIdentity throws an invalid response error for a wrong-shaped response', async () => {
  const { api } = createApi({
    'GET /api/v1/device': { hello: 'world' },
  });

  await assert.rejects(api.verifyIdentity('aabbccddeeff'), (error) => {
    assert.ok(error instanceof AwtrixNgInvalidResponseError);
    assert.equal(error.endpoint, '/api/v1/device');
    return true;
  });
});

test('verifyIdentity rethrows the probe error for an unreachable device', async () => {
  const { api } = createApi({
    'GET /api/v1/device': () => {
      throw new Error('connect ECONNREFUSED');
    },
  });

  await assert.rejects(api.verifyIdentity('aabbccddeeff'), /ECONNREFUSED/);
});

test('applySettingsChange writes the apps order before the settings patch', async () => {
  const { api, transport } = createApi({
    'GET /api/v1/apps': [builtinApp('Time'), builtinApp('Date', { slot: 1 })],
    'PUT /api/v1/apps/order': { ok: true },
    'PATCH /api/v1/settings': { uppercase: true },
  });

  const result = await api.applySettingsChange(
    { uppercase: true, showBuiltinTime: false },
    ['uppercase', 'showBuiltinTime'],
  );

  assert.deepEqual(
    transport.calls.map((call) => `${call.method} ${call.path}`),
    ['GET /api/v1/apps', 'PUT /api/v1/apps/order', 'PATCH /api/v1/settings'],
  );
  assert.deepEqual(transport.calls[1].body.order, ['Date']);
  assert.deepEqual(transport.calls[1].body.disabled, ['Time', 'Temperature', 'Humidity', 'Battery']);
  assert.deepEqual(transport.calls[2].body, { uppercase: true });
  assert.deepEqual(result, {});
});

test('applySettingsChange reports the homey update when the device normalizes a value', async () => {
  const { api, transport } = createApi({
    'PATCH /api/v1/settings': { uppercase: false },
  });

  const result = await api.applySettingsChange({ uppercase: true }, ['uppercase']);

  assert.deepEqual(
    transport.calls.map((call) => `${call.method} ${call.path}`),
    ['PATCH /api/v1/settings'],
  );
  assert.deepEqual(result, { homeyUpdate: { uppercase: false } });
});

test('applySettingsChange fails before any write when a built-in app is unavailable', async () => {
  const { api, transport } = createApi({
    'GET /api/v1/apps': [builtinApp('Time')],
    'PUT /api/v1/apps/order': { ok: true },
    'PATCH /api/v1/settings': { uppercase: true },
  });

  await assert.rejects(
    api.applySettingsChange(
      { uppercase: true, showBuiltinBattery: true },
      ['uppercase', 'showBuiltinBattery'],
    ),
    (error) => {
      assert.ok(error instanceof AwtrixNgBuiltinAppUnavailableError);
      assert.equal(error.setting, 'showBuiltinBattery');
      return true;
    },
  );
  assert.deepEqual(
    transport.calls.map((call) => `${call.method} ${call.path}`),
    ['GET /api/v1/apps'],
  );
});

test('readSettings returns undefined when Homey settings are already in sync', async () => {
  const { api } = createApi({
    'GET /api/v1/settings': { uppercase: true, autoBrightness: false },
  });

  const update = await api.readSettings({ uppercase: true, autoBrightness: false });

  assert.equal(update, undefined);
});

test('readSettings returns only the diverged settings values', async () => {
  const { api } = createApi({
    'GET /api/v1/settings': { uppercase: true, autoBrightness: false },
  });

  const update = await api.readSettings({ uppercase: false, autoBrightness: false });

  assert.deepEqual(update, { uppercase: true });
});

test('readSettings rejects a non-object settings response', async () => {
  const { api } = createApi({
    'GET /api/v1/settings': ['not', 'an', 'object'],
  });

  await assert.rejects(api.readSettings({}), (error) => {
    assert.ok(error instanceof AwtrixNgInvalidResponseError);
    assert.equal(error.endpoint, '/api/v1/settings');
    return true;
  });
});

test('readWeatherOverlay maps a null overlay to none', async () => {
  const { api } = createApi({
    'GET /api/v1/display': { overlay: null },
  });

  assert.equal(await api.readWeatherOverlay(), 'none');
});

test('readBuiltinAppSettings returns the update derived from the app inventory', async () => {
  const { api } = createApi({
    'GET /api/v1/apps': [builtinApp('Time'), builtinApp('Date', { slot: null, enabled: false })],
  });

  const update = await api.readBuiltinAppSettings({
    showBuiltinTime: false,
    showBuiltinDate: false,
    showBuiltinTemperature: false,
    showBuiltinHumidity: false,
    showBuiltinBattery: false,
  });

  assert.deepEqual(update, { showBuiltinTime: true });
});

test('readBuiltinAppSettings rejects a non-array apps response', async () => {
  const { api } = createApi({
    'GET /api/v1/apps': { apps: [] },
  });

  await assert.rejects(api.readBuiltinAppSettings({}), (error) => {
    assert.ok(error instanceof AwtrixNgInvalidResponseError);
    assert.equal(error.endpoint, '/api/v1/apps');
    return true;
  });
});

test('planCapabilityUpdate delegates to the capability update plan', () => {
  const { api } = createApi();

  const plan = api.planCapabilityUpdate(deviceStateResponse, ['awtrix_matrix'], { allowAddCapabilities: false });

  assert.deepEqual(plan.capabilitiesToRemove, []);
  assert.deepEqual(plan.capabilitiesToAdd, []);
  assert.ok(plan.valuesToSet.some((update) => update.capabilityId === 'awtrix_matrix' && update.value === true));
});
