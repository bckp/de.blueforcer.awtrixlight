const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const { AwtrixNgHttpError } = require('../.homeybuild/lib/awtrixng/Http/Transport');
const { parseAwtrixNgScriptSettingValue, assertAwtrixNgSharedScriptValues } = require('../.homeybuild/lib/awtrixng/Services/Scripts');

const createApi = (overrides = {}) => {
  const calls = [];
  const state = {
    device: { scriptingRunning: true },
    apps: [{ name: 'Weather', origin: 'script', present: true }],
    config: { name: 'Weather', fields: [{ key: 'metric', type: 'bool', value: false }], warnings: [] },
    data: {
      empty: '', flag: false, zero: 0, nested: { items: [1, 2] },
    },
    shared: [{
      owner: 'Weather', key: 'temp', type: 'real', value: 0, ageMs: 10,
    }],
    saved: { ok: true, name: 'Weather', error: null },
    ...overrides,
  };
  const client = new AwtrixNgClient({
    async request(request) {
      calls.push(request);
      if (request.method === 'PATCH') {
        if (state.writeStatus >= 400) {
          throw new AwtrixNgHttpError({
            method: request.method, url: `http://192.0.2.10${request.path}`, status: state.writeStatus, headers: {}, rawBody: state.saved, message: 'HTTP failure',
          });
        }
        return { status: 200, headers: {}, data: state.saved };
      }
      const routes = {
        '/api/v1/device': state.device,
        '/api/v1/apps': state.apps,
        '/api/v1/apps/Weather/config': state.config,
        '/api/v1/apps/Weather/data': state.data,
        '/api/v1/scripts/shared': state.shared,
      };
      assert.ok(Object.hasOwn(routes, request.path), `Unexpected route ${request.path}`);
      return { status: 200, headers: {}, data: routes[request.path] };
    },
  });
  return { state, calls, api: new AwtrixNgApi(client, { baseUrl: 'http://192.0.2.10', icons: { emptyIcon: { id: '-', name: 'None' } } }) };
};

test('script settings validate declared types, bounds and Unicode without losing false, zero or text', () => {
  const parse = (type, source, extra = {}) => parseAwtrixNgScriptSettingValue({
    key: 'value', type, value: null, ...extra,
  }, source);
  assert.equal(parse('bool', 'false'), false);
  assert.equal(parse('number', '0', { min: 0, max: 10 }), 0);
  assert.equal(parse('slider', '1.5', { min: 1, max: 2 }), 1.5);
  assert.equal(parse('text', ' 😀 ', { maxlen: 6 }), ' 😀 ');
  assert.equal(parse('text', 'Ž🐱', { maxlen: 6 }), 'Ž🐱');
  assert.equal(parse('text', '', { maxlen: 0 }), '');
  assert.equal(parse('text', ''), '');
  assert.equal(parse('select', 'now', { options: ['now', 'today'] }), 'now');
  assert.equal(parse('color', '0'), 0);
  assert.equal(parse('color', '#aBcDEF'), '#aBcDEF');
  for (const [type, source, extra] of [
    ['bool', '0'], ['bool', '"false"'], ['number', 'null'], ['number', '1e999'],
    ['number', '11', { max: 10 }], ['slider', '-1', { min: 0 }],
    ['text', '😀😀', { maxlen: 1 }], ['text', ' 😀 ', { maxlen: 5 }],
    ['text', 'Žluť🐱', { maxlen: 8 }], ['select', 'new', { options: ['now'] }],
    ['color', '-1'], ['color', '16777216'], ['color', '#FFF'], ['color', '0.5'],
  ]) assert.throws(() => parse(type, source, extra), (error) => error.field === 'value');
});

test('config writes re-read the schema, patch one key and allow broken or headless scripts', async () => {
  const fake = createApi({
    apps: [
      {
        name: 'Weather', origin: 'script', present: true, enabled: false, headless: true, error: { message: 'broken' },
      },
      { name: 'Library', origin: 'module', present: true }, { name: 'Time', origin: 'builtin' },
    ],
  });
  assert.deepEqual((await fake.api.readManageableScripts()).map((app) => app.name), ['Weather']);
  await fake.api.writeScriptSetting('Weather', 'metric', 'false');
  assert.deepEqual(fake.calls.at(-1), { method: 'PATCH', path: '/api/v1/apps/Weather/config', body: { metric: false } });
  fake.state.config.fields = [];
  const writes = fake.calls.filter((call) => call.method === 'PATCH').length;
  await assert.rejects(fake.api.writeScriptSetting('Weather', 'metric', 'true'), (error) => error.field === 'key');
  await assert.rejects(fake.api.writeScriptSetting('Library', 'metric', 'true'), (error) => error.field === 'name');
  assert.equal(fake.calls.filter((call) => call.method === 'PATCH').length, writes);
  fake.state.device.scriptingRunning = false;
  await assert.rejects(fake.api.readManageableScripts(), /Scripting is disabled/);
  const count = fake.calls.length;
  await assert.rejects(fake.api.writeScriptSetting('../Weather', 'metric', 'true'));
  assert.equal(fake.calls.length, count);
});

test('script text limits reject oversized UTF-8 before a config write', async () => {
  const fake = createApi({
    config: {
      name: 'Weather',
      fields: [{
        key: 'label', type: 'text', value: '', maxlen: 8,
      }],
      warnings: [],
    },
  });
  await assert.rejects(fake.api.writeScriptSetting('Weather', 'label', 'Žluť🐱'), (error) => (
    error.field === 'label' && /UTF-8 bytes/.test(error.message)
  ));
  assert.equal(fake.calls.filter((call) => call.method === 'PATCH').length, 0);
  await fake.api.writeScriptSetting('Weather', 'label', 'Ž🐱');
  assert.deepEqual(fake.calls.at(-1), { method: 'PATCH', path: '/api/v1/apps/Weather/config', body: { label: 'Ž🐱' } });
});

test('script save reports restart failures even at HTTP 200 and preserves native API errors', async () => {
  const fake = createApi({ saved: { ok: true, name: 'Weather', error: { message: 'bad expression', line: 12, hook: 'setup' } } });
  await assert.rejects(fake.api.writeScriptSetting('Weather', 'metric', 'true'), (error) => (
    error.httpStatus === 200 && error.line === 12 && error.hook === 'setup' && /Saved.*bad expression/.test(error.message)
  ));
  await assert.rejects(fake.api.writeScriptData('Weather', '{"counter":0}'), (error) => error.line === 12);
  fake.state.writeStatus = 503;
  fake.state.saved = { error: { code: 'serviceBusy', message: 'waiting for a web request', field: 'name' } };
  await assert.rejects(fake.api.writeScriptSetting('Weather', 'metric', 'true'), (error) => (
    error.httpStatus === 503 && error.code === 'serviceBusy' && error.field === 'name' && /waiting/.test(error.message)
  ));
  fake.state.writeStatus = 200;
  fake.state.saved = { ok: true, name: 'Weather' };
  await assert.rejects(fake.api.writeScriptData('Weather', '{"counter":0}'), (error) => error.endpoint.endsWith('/data'));
});

test('script data is a partial JSON patch with explicit null deletion; invalid bodies never write', async () => {
  const fake = createApi();
  for (const input of ['{}', '[]', 'null', 'false', 'broken']) await assert.rejects(fake.api.writeScriptData('Weather', input));
  assert.equal(fake.calls.length, 0);
  await fake.api.writeScriptData('Weather', '{"counter":0,"stale":null}');
  assert.deepEqual(fake.calls.at(-1), { method: 'PATCH', path: '/api/v1/apps/Weather/data', body: { counter: 0, stale: null } });
  fake.state.writeStatus = 422;
  fake.state.saved = { error: { code: 'validationFailed', message: 'key is a declared setting', field: 'metric' } };
  await assert.rejects(fake.api.writeScriptData('Weather', '{"metric":false}'), (error) => error.httpStatus === 422 && error.field === 'metric');
});

test('script readers preserve values in text tokens and fail on disappeared fields or malformed responses', async () => {
  const fake = createApi();
  assert.deepEqual(await fake.api.readScriptSettingValue('Weather', 'metric'), { value: 'false' });
  for (const [key, value] of [['empty', ''], ['flag', 'false'], ['zero', '0'], ['nested', '{"items":[1,2]}']]) {
    assert.deepEqual(await fake.api.readScriptDataValue('Weather', key), { value });
  }
  assert.deepEqual(await fake.api.readSharedScriptChoices(), [{ id: 'Weather.temp', name: 'Weather.temp' }]);
  assert.deepEqual(await fake.api.readSharedScriptValue('Weather.temp'), { value: '0' });
  fake.state.shared = [];
  await assert.rejects(fake.api.readSharedScriptValue('Weather.temp'), (error) => error.field === 'key');
  await assert.rejects(fake.api.readScriptDataValue('Weather', 'absent'), (error) => error.field === 'key');
  fake.state.config.fields[0].type = 'futureType';
  await assert.rejects(fake.api.readScriptSettingChoices('Weather'), (error) => error.endpoint.endsWith('/config'));
  for (const item of [
    { type: 'int', value: 1.5 }, { type: 'real', value: Infinity }, { type: 'bool', value: null },
    { type: 'string', value: false }, { type: 'real', value: 1, ageMs: -1 },
  ]) {
    assert.throws(() => assertAwtrixNgSharedScriptValues([{
      owner: 'Weather', key: 'test', ageMs: 0, ...item,
    }]));
  }
  assert.doesNotThrow(() => assertAwtrixNgSharedScriptValues([{
    owner: 'Weather', key: 'test', type: 'real', value: null, ageMs: 0,
  }]));
});

test('script Flow cards select declared keys, return Advanced Flow tokens and propagate device errors', async () => {
  const originalLoad = Module._load;
  let Driver;
  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') return { Driver: class {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const modulePath = require.resolve('../.homeybuild/drivers/awtrixng/driver');
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    Driver = require('../.homeybuild/drivers/awtrixng/driver');
  } finally {
    Module._load = originalLoad;
  }
  const cards = new Map();
  const driver = new Driver();
  driver.homey = {
    flow: {
      getActionCard(id) {
        const card = {
          autocomplete: {},
          registerRunListener(fn) {
            this.run = fn;
          },
          registerArgumentAutocompleteListener(key, fn) {
            this.autocomplete[key] = fn;
          },
        };
        cards.set(id, card);
        return card;
      },
    },
  };
  driver.registerScriptSettingsCards();
  const fake = createApi();
  const device = {
    getManageableScripts: async () => [{ id: 'Weather', name: 'Počasí' }],
    getScriptSettingChoices: (name) => fake.api.readScriptSettingChoices(name),
    setScriptSetting: (...args) => fake.api.writeScriptSetting(...args),
    getScriptSetting: (...args) => fake.api.readScriptSettingValue(...args),
    setScriptData: (...args) => fake.api.writeScriptData(...args),
    getScriptData: (...args) => fake.api.readScriptDataValue(...args),
    getScriptDataChoices: (...args) => fake.api.readScriptDataChoices(...args),
    getSharedScriptChoices: () => fake.api.readSharedScriptChoices(),
    getSharedScriptValue: (...args) => fake.api.readSharedScriptValue(...args),
  };
  const args = {
    device, script: { id: 'Weather' }, key: { id: 'metric' }, value: 'false',
  };
  const set = cards.get('awtrixng_script_setting_set');
  assert.deepEqual(await set.autocomplete.key('', { device }), []);
  assert.equal(fake.calls.length, 0);
  assert.equal((await set.autocomplete.script('weather', args))[0].name, 'Počasí');
  assert.deepEqual(await set.autocomplete.key('met', args), [{ id: 'metric', name: 'metric', description: 'bool' }]);
  await set.run(args);
  assert.deepEqual(await cards.get('awtrixng_script_setting_get').run(args), { value: 'false' });
  await cards.get('awtrixng_script_data_set').run({ ...args, value: '{"flag":false}' });
  assert.equal((await cards.get('awtrixng_script_data_get').autocomplete.key('zero', args))[0].id, 'zero');
  assert.deepEqual(await cards.get('awtrixng_script_data_get').run({ ...args, key: { id: 'zero' } }), { value: '0' });
  const shared = cards.get('awtrixng_script_shared_get');
  assert.equal((await shared.autocomplete.key('temp', args))[0].id, 'Weather.temp');
  assert.deepEqual(await shared.run({ ...args, key: { id: 'Weather.temp' } }), { value: '0' });
  fake.state.device.scriptingRunning = false;
  await assert.rejects(set.run(args), /Scripting is disabled/);
});

test('script output tokens are declared on NG-only read cards in the generated manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8'));
  for (const suffix of ['setting_set', 'setting_get', 'data_set', 'data_get', 'shared_get']) {
    const card = manifest.flow.actions.find((item) => item.id === `awtrixng_script_${suffix}`);
    assert.ok(card);
    assert.equal(card.args.find((arg) => arg.name === 'device').filter, 'driver_id=awtrixng');
    assert.ok(card.title.cs && card.hint.cs);
    if (suffix.endsWith('get')) assert.deepEqual(card.tokens.map(({ name, type }) => ({ name, type })), [{ name: 'value', type: 'string' }]);
    else assert.equal(card.tokens, undefined);
  }
});
