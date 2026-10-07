const assert = require('node:assert/strict');
const test = require('node:test');
const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const { createAwtrixNgCapabilityUpdatePlan } = require('../.homeybuild/lib/awtrixng/Device/State');

const createApi = (settings = { autoBrightness: false }, caps = {}, response) => {
  const calls = [];
  const client = new AwtrixNgClient({
    async request(request) {
      calls.push(request);
      let data;
      if (request.method === 'GET') data = request.path.endsWith('/settings') ? settings : caps;
      else data = response ?? { ...settings, ...request.body };
      return { status: 200, headers: {}, data };
    },
  });
  return { calls, api: new AwtrixNgApi(client, { baseUrl: 'http://192.0.2.10', icons: { emptyIcon: { id: '-', name: 'None' } } }) };
};

test('NG brightness maps Homey 0..1 to raw 0..255 including off, half and full brightness', async () => {
  for (const [input, raw] of [[0, 0], [0.5, 128], [1, 255]]) {
    const { api, calls } = createApi();
    assert.deepEqual(await api.setBrightness(input), { brightness: raw / 255, autoBrightness: false });
    assert.deepEqual(calls.at(-1).body, { brightness: raw });
    assert.equal(calls.some((call) => call.path === '/api/v1/display'), false);
  }
  const { api, calls } = createApi();
  for (const input of [NaN, Infinity, -0.1, 1.1, '0.5', false]) await assert.rejects(api.setBrightness(input));
  assert.equal(calls.length, 0);
});

test('manual brightness disables LDR control but does not write a sensor option on TC002', async () => {
  const tc001 = createApi({ autoBrightness: true }, { sensors: { light: true } });
  await tc001.api.setBrightness(0.2);
  assert.deepEqual(tc001.calls.at(-1).body, { brightness: 51, autoBrightness: false });
  const tc002 = createApi({ autoBrightness: true }, { platform: { id: 'tc002' }, sensors: { light: false } });
  await tc002.api.setBrightness(0.2);
  assert.deepEqual(tc002.calls.at(-1).body, { brightness: 51 });
  const legacy = createApi({ autoBrightness: true });
  await legacy.api.setBrightness(1);
  assert.deepEqual(legacy.calls.at(-1).body, { brightness: 255, autoBrightness: false });
});

test('brightness validates responses and reflects externally changed brightness in Homey', async () => {
  const malformed = createApi({});
  await assert.rejects(malformed.api.setBrightness(0), (error) => error.endpoint === '/api/v1/settings');
  assert.equal(malformed.calls.some((call) => call.method === 'PATCH'), false);
  for (const brightness of [-1, 256, '120']) {
    const fake = createApi({ autoBrightness: false }, {}, { brightness, autoBrightness: false });
    await assert.rejects(fake.api.setBrightness(0.5), (error) => error.endpoint === '/api/v1/settings');
  }
  const base = { indicators: [], brightness: 0 };
  const init = createAwtrixNgCapabilityUpdatePlan(base, [], { allowAddCapabilities: true });
  assert.ok(init.capabilitiesToAdd.includes('dim'));
  assert.deepEqual(init.valuesToSet.find((item) => item.capabilityId === 'dim'), { capabilityId: 'dim', value: 0 });
  assert.deepEqual(createAwtrixNgCapabilityUpdatePlan({ ...base, brightness: 128 }, ['dim'], { allowAddCapabilities: false }).valuesToSet,
    [{ capabilityId: 'dim', value: 128 / 255 }]);
  assert.equal(createAwtrixNgCapabilityUpdatePlan({ ...base, brightness: 256 }, ['dim'], { allowAddCapabilities: false }).valuesToSet.length, 0);
});
