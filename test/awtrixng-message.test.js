const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const test = require('node:test');
const { parseAwtrixNgMessage } = require('../.homeybuild/drivers/awtrixng/message');

test('messages preserve events and serialize all JSON data values into a text token', () => {
  for (const data of [{ program: 'cotton', minutes: 65 }, [0, false, null], false, 0, null, '', 'hello']) {
    const message = { event: ' door opened ', data };
    for (const input of [message, JSON.stringify(message), Buffer.from(JSON.stringify(message))]) {
      assert.deepEqual(parseAwtrixNgMessage(input), { event: message.event, data: JSON.stringify(data) });
    }
  }
  const message = { event: 'Ž'.repeat(64), data: { 'key.with.dots': { nested: true } } };
  assert.deepEqual(JSON.parse(parseAwtrixNgMessage(message).data), message.data);
});

test('invalid envelopes and oversized UTF-8 messages are rejected rather than truncated', () => {
  for (const body of [
    undefined, null, [], 1, true, '', '{', '{}', 'null',
    { event: '', data: {} }, { event: '  ', data: {} }, { event: 1, data: {} },
    { data: {} }, { event: 'test' }, { event: 'test', data: undefined },
    { event: 'test', data: {}, extra: true }, { event: 'Ž'.repeat(65), data: {} },
  ]) assert.throws(() => parseAwtrixNgMessage(body), TypeError);
  const prefix = Buffer.byteLength(JSON.stringify({ event: 'x', data: '' }));
  const valid = { event: 'x', data: 'a'.repeat(16384 - prefix) };
  assert.equal(Buffer.byteLength(JSON.stringify(valid)), 16384);
  assert.equal(JSON.parse(parseAwtrixNgMessage(valid).data), valid.data);
  for (const input of [{ ...valid, data: `${valid.data}a` }, JSON.stringify({ event: 'x', data: '🐱'.repeat(4096) })]) {
    assert.throws(() => parseAwtrixNgMessage(input), RangeError);
  }
  const circular = { event: 'x' };
  circular.data = circular;
  assert.throws(() => parseAwtrixNgMessage(circular), TypeError);
});

const createDriver = async () => {
  const originalLoad = Module._load;
  let Driver;
  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') return { Driver: class {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    // eslint-disable-next-line global-require
    Driver = require('../.homeybuild/drivers/awtrixng/driver');
  } finally {
    Module._load = originalLoad;
  }
  const deliveries = [];
  const errors = [];
  const devices = new Map([['clock-a', { name: 'A' }], ['clock-b', { name: 'B' }]]);
  const driver = new Driver();
  driver.log = () => {};
  driver.error = (...args) => errors.push(args);
  const state = {};
  driver.homey = {
    flow: {
      getDeviceTriggerCard(id) {
        if (id !== 'awtrixng_message_received') return {};
        return {
          trigger(device, tokens) {
            deliveries.push({ device, tokens });
            return state.delivery || Promise.resolve();
          },
        };
      },
      getActionCard: () => ({ registerRunListener() {}, registerArgumentAutocompleteListener() {} }),
      getConditionCard: () => ({ registerRunListener() {}, registerArgumentAutocompleteListener() {} }),
    },
  };
  driver.getDevice = ({ id }) => {
    if (!devices.has(id)) throw new Error('No such device');
    return devices.get(id);
  };
  await driver.onInit();
  return {
    driver, devices, deliveries, errors, state,
  };
};

test('message route submits only the selected paired NG device trigger and does not wait for Flow completion', async () => {
  const {
    driver, devices, deliveries, errors, state,
  } = await createDriver();
  let reject;
  state.delivery = new Promise((resolve, fail) => {
    reject = fail;
  });
  await driver.handleMessage({ uid: 'clock-b', body: { event: 'finished', data: { value: false } } });
  assert.deepEqual(deliveries, [{ device: devices.get('clock-b'), tokens: { event: 'finished', data: '{"value":false}' } }]);
  reject(new Error('Private payload in Flow error'));
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(errors, [['AWTRIX NG message Flow delivery failed.']]);
  for (const input of [
    { uid: undefined, body: { event: 'x', data: 1 } },
    { uid: 'missing', body: { event: 'x', data: 1 } },
    { uid: 'clock-a', body: { event: 'x' } },
  ]) await assert.rejects(driver.handleMessage(input));
  assert.equal(deliveries.length, 1);
  state.delivery = undefined;
  await driver.handleMessage({ uid: 'clock-a', body: { event: 'x', data: 0 } });
  assert.equal(deliveries[1].device, devices.get('clock-a'));
});

test('App API returns acceptance and propagates message errors', async () => {
  // eslint-disable-next-line global-require
  const api = require('../.homeybuild/api');
  const fake = await createDriver();
  const homey = {
    drivers: {
      getDriver(id) {
        assert.equal(id, 'awtrixng'); return fake.driver;
      },
    },
  };
  assert.deepEqual(await api.awtrixNgMessage({ homey, params: { uid: 'clock-a' }, body: { event: 'x', data: null } }), { ok: true });
  await assert.rejects(api.awtrixNgMessage({ homey, params: { uid: 'clock-a' }, body: { event: 'x' } }));
  await assert.rejects(api.awtrixNgMessage({ homey, params: { uid: 'unknown' }, body: { event: 'x', data: 1 } }));
});

test('message trigger is NG-only with static Event and Data text tokens and a protected API route', () => {
  const app = JSON.parse(fs.readFileSync(`${__dirname}/../app.json`, 'utf8'));
  assert.deepEqual(app.api.awtrixNgMessage, { method: 'POST', path: '/awtrixng/message/:uid', public: false });
  const card = app.flow.triggers.find((entry) => entry.id === 'awtrixng_message_received');
  assert.deepEqual(card.tokens.map(({ name, type }) => ({ name, type })), [{ name: 'event', type: 'string' }, { name: 'data', type: 'string' }]);
  assert.equal(card.args.find((arg) => arg.name === 'device').filter, 'driver_id=awtrixng');
  for (const locale of ['en', 'cs', 'de', 'nl']) assert.ok(card.title[locale] && card.hint[locale]);
  assert.equal(app.flow.actions.some((entry) => entry.id === 'awtrixng_message_received'), false);
});
