const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const test = require('node:test');
const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const FetchTransport = require('../.homeybuild/lib/awtrixng/Http/FetchTransport').default;
const { AwtrixNgHttpError } = require('../.homeybuild/lib/awtrixng/Http/Transport');

const createApi = (overrides = {}) => {
  const calls = [];
  const state = {
    device: { scriptingRunning: true },
    apps: [{
      name: 'Weather', origin: 'script', present: true, enabled: false,
    }],
    response: { ok: true },
    ...overrides,
  };
  const client = new AwtrixNgClient({
    async request(request) {
      calls.push(request);
      if (request.method === 'GET' && state.readError) throw state.readError;
      if (request.method === 'PUT') {
        if (state.error) throw state.error;
        return { status: 200, headers: {}, data: state.response };
      }
      const routes = { '/api/v1/device': state.device, '/api/v1/apps': state.apps };
      assert.ok(Object.hasOwn(routes, request.path), `Unexpected route ${request.path}`);
      return { status: 200, headers: {}, data: routes[request.path] };
    },
  });
  return { api: new AwtrixNgApi(client, { baseUrl: 'http://192.0.2.10', icons: {} }), calls, state };
};

test('script switches allow disabled and background scripts and only write the named switch', async () => {
  const fake = createApi({
    apps: [
      {
        name: 'Weather', origin: 'script', present: true, enabled: false, headless: true, error: { message: 'broken' },
      },
      { name: 'Time', origin: 'builtin', enabled: false },
      { name: 'homey-test', origin: 'pushed', enabled: true },
    ],
  });
  const inventory = structuredClone(fake.state.apps);
  for (const enabled of [true, false, false, true]) await fake.api.setScriptEnabled('Weather', enabled);
  assert.deepEqual(fake.calls, [true, false, false, true].flatMap((body) => [
    { method: 'GET', path: '/api/v1/device' },
    { method: 'GET', path: '/api/v1/apps' },
    { method: 'PUT', path: '/api/v1/apps/Weather/enabled', body },
  ]));
  assert.deepEqual(fake.state.apps, inventory);
});

test('script switches reject invalid values, stale selections and non-scripts before writing', async () => {
  const fake = createApi();
  for (const enabled of ['false', 0, null, undefined]) {
    await assert.rejects(fake.api.setScriptEnabled('Weather', enabled), (error) => error.field === 'enabled');
  }
  for (const name of ['../Weather', '', 'a'.repeat(33)]) {
    await assert.rejects(fake.api.setScriptEnabled(name, false), (error) => error.field === 'name');
  }
  assert.equal(fake.calls.length, 0);
  for (const app of [
    { name: 'Weather', origin: 'builtin', present: true },
    { name: 'Weather', origin: 'module', present: true },
    { name: 'Weather', origin: 'pushed', present: true },
    { name: 'Weather', origin: 'script', present: false },
  ]) {
    fake.state.apps = [app];
    await assert.rejects(fake.api.setScriptEnabled('Weather', false), (error) => error.field === 'name');
  }
  fake.state.apps = [];
  await assert.rejects(fake.api.setScriptEnabled('Weather', true), /No installed script/);
  fake.state.device.scriptingRunning = false;
  await assert.rejects(fake.api.setScriptEnabled('Weather', false), /Scripting is disabled/);
  assert.equal(fake.calls.some((call) => call.method !== 'GET'), false);
});

test('script switches preserve native errors without trying a global order fallback', async () => {
  for (const [status, code, message] of [
    [404, 'notFound', 'route not found'],
    [405, 'methodNotAllowed', 'allowed: GET'],
    [422, 'validationFailed', 'must be true or false'],
    [503, 'serviceBusy', 'busy, try again'],
    [507, 'insufficientStorage', 'applied, not saved yet'],
  ]) {
    const fake = createApi({
      error: new AwtrixNgHttpError({
        method: 'PUT',
        url: 'http://192.0.2.10/api/v1/apps/Weather/enabled',
        status,
        message: 'HTTP failure',
        rawBody: { error: { code, message, field: 'enabled' } },
      }),
    });
    await assert.rejects(fake.api.setScriptEnabled('Weather', false), (error) => (
      error.httpStatus === status && error.code === code && error.message === message && error.field === 'enabled'
    ));
    assert.deepEqual(fake.calls.filter((call) => call.method !== 'GET'), [
      { method: 'PUT', path: '/api/v1/apps/Weather/enabled', body: false },
    ]);
  }
  for (const response of [null, {}, { ok: false }, 'ok']) {
    const fake = createApi({ response });
    await assert.rejects(fake.api.setScriptEnabled('Weather', true), (error) => error.endpoint === '/api/v1/apps/Weather/enabled');
  }
});

test('script conditions read live enabled flags and reject missing scripts, malformed flags and read failures', async () => {
  const fake = createApi();
  for (const enabled of [false, true, false]) {
    fake.state.apps[0].enabled = enabled;
    assert.equal(await fake.api.isScriptEnabled('Weather'), enabled);
  }
  for (const enabled of [undefined, null, 'false', 0]) {
    fake.state.apps[0].enabled = enabled;
    await assert.rejects(fake.api.isScriptEnabled('Weather'), (error) => error.endpoint === '/api/v1/apps');
  }
  fake.state.apps = [];
  await assert.rejects(fake.api.isScriptEnabled('Weather'), (error) => error.field === 'name');
  fake.state.device.scriptingRunning = false;
  await assert.rejects(fake.api.isScriptEnabled('Weather'), /Scripting is disabled/);
  const error = new Error('Connection failed');
  fake.state.readError = error;
  await assert.rejects(fake.api.isScriptEnabled('Weather'), (failure) => failure === error);
  assert.equal(fake.calls.some((call) => call.method !== 'GET'), false);
});

test('script switches serialize false and true as JSON booleans through native fetch', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const client = new AwtrixNgClient(new FetchTransport({ baseUrl: 'http://192.0.2.10' }));
    await client.setAppEnabled('Weather', false);
    await client.setAppEnabled('Weather', true);
    assert.deepEqual(calls.map(({ url, options }) => ({
      url, method: options.method, body: options.body, type: options.headers['Content-Type'],
    })), ['false', 'true'].map((body) => ({
      url: 'http://192.0.2.10/api/v1/apps/Weather/enabled', method: 'PUT', body, type: 'application/json',
    })));
  } finally {
    global.fetch = originalFetch;
  }
});

test('NG-only Flow switches autocomplete installed scripts and pass native IDs and errors through Device', async () => {
  const originalLoad = Module._load;
  let Driver;
  let Device;
  function FakeHomey() {}
  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') return { Driver: FakeHomey, Device: FakeHomey };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    // eslint-disable-next-line global-require
    Driver = require('../.homeybuild/drivers/awtrixng/driver');
    // eslint-disable-next-line global-require
    Device = require('../.homeybuild/drivers/awtrixng/device');
  } finally {
    Module._load = originalLoad;
  }
  const cards = new Map();
  const driver = new Driver();
  driver.log = () => {};
  driver.homey = {
    flow: {
      getDeviceTriggerCard: () => ({}),
      getConditionCard(id) {
        return this.getActionCard(id);
      },
      getActionCard(id) {
        const card = {
          registerRunListener(fn) {
            this.run = fn;
          },
          registerArgumentAutocompleteListener(arg, fn) {
            this.autocomplete = fn;
          },
        };
        cards.set(id, card);
        return card;
      },
    },
  };
  await driver.onInit();
  const fake = createApi();
  fake.state.apps[0].meta = { name: 'Počasí' };
  const device = new Device();
  device.getApi = () => fake.api;
  const manifest = JSON.parse(fs.readFileSync(`${__dirname}/../app.json`, 'utf8'));
  for (const enabled of [true, false]) {
    const id = `awtrixng_script_${enabled ? 'enable' : 'disable'}`;
    const card = cards.get(id);
    for (const query of ['weather', 'POČASÍ']) {
      assert.deepEqual(await card.autocomplete(query, { device }), [{ id: 'Weather', name: 'Počasí' }]);
    }
    assert.deepEqual(await card.autocomplete('missing', { device }), []);
    await card.run({ device, script: { id: 'Weather', name: 'Počasí' } });
    assert.deepEqual(fake.calls.at(-1), { method: 'PUT', path: '/api/v1/apps/Weather/enabled', body: enabled });
    const declaration = manifest.flow.actions.find((action) => action.id === id);
    assert.equal(declaration.args.find((arg) => arg.name === 'device').filter, 'driver_id=awtrixng');
    for (const locale of ['en', 'cs', 'de', 'nl']) {
      assert.ok(declaration.title[locale] && declaration.hint[locale]);
      assert.equal(declaration.titleFormatted[locale].includes('[[script]]'), true);
    }
    const error = new Error('Connection failed');
    fake.state.error = error;
    await assert.rejects(card.run({ device, script: { id: 'Weather' } }), (failure) => failure === error);
    delete fake.state.error;
  }
  const condition = cards.get('awtrixng_script_enabled');
  assert.deepEqual(await condition.autocomplete('POČASÍ', { device }), [{ id: 'Weather', name: 'Počasí' }]);
  for (const enabled of [false, true, false]) {
    fake.state.apps[0].enabled = enabled;
    assert.equal(await condition.run({ device, script: { id: 'Weather', name: 'Počasí' } }), enabled);
  }
  const declaration = manifest.flow.conditions.find((card) => card.id === 'awtrixng_script_enabled');
  assert.equal(declaration.args.find((arg) => arg.name === 'device').filter, 'driver_id=awtrixng');
  for (const locale of ['en', 'cs', 'de', 'nl']) {
    assert.match(declaration.title[locale], /!\{\{[^|]+\|[^}]+\}\}/);
    assert.match(declaration.titleFormatted[locale], /!\{\{[^|]+\|[^}]+\}\}/);
    assert.ok(declaration.hint[locale]);
  }
  const error = new Error('Connection failed');
  fake.state.readError = error;
  await assert.rejects(condition.run({ device, script: { id: 'Weather' } }), (failure) => failure === error);
});
