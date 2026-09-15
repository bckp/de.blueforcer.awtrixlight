const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const { parseAwtrixNgButtonCallback } = require('../.homeybuild/drivers/awtrixng/button-callback');

const loadDriver = () => {
  const originalLoad = Module._load;
  function FakeDriver() {}
  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') {
      return { Driver: FakeDriver };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const modulePath = require.resolve('../.homeybuild/drivers/awtrixng/driver');
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    return require('../.homeybuild/drivers/awtrixng/driver');
  } finally {
    Module._load = originalLoad;
  }
};

test('button callback parser accepts firmware 1.1.1 JSON and boolean press/release', () => {
  assert.deepEqual(parseAwtrixNgButtonCallback({ button: 'left', state: true, uid: 'a' }), {
    button: 'left', pressed: true, uid: 'a',
  });
  assert.deepEqual(parseAwtrixNgButtonCallback('{"button":"middle","state":false,"uid":"b"}'), {
    button: 'middle', pressed: false, uid: 'b',
  });
  assert.deepEqual(parseAwtrixNgButtonCallback(Buffer.from('{"button":"right","state":true,"uid":"c"}')), {
    button: 'right', pressed: true, uid: 'c',
  });
  for (const body of [
    { button: 'select', state: true, uid: 'a' },
    { button: 'left', state: '2', uid: 'a' },
    { button: 'left', state: 2, uid: 'a' },
    { button: 'left', state: 1, uid: 'a' },
    { button: 'left', state: '1', uid: 'a' },
    { button: 'left', state: true, uid: '' },
    { button: 'left', state: true, uid: 123 },
    'button=left&state=1&uid=a',
    '{"button":"left","state":true',
    Buffer.from('button=left&state=1&uid=a'),
    null,
  ]) {
    assert.equal(parseAwtrixNgButtonCallback(body), undefined);
  }
});

test('driver validates the device before firing exactly one matching pressed trigger', async () => {
  const AwtrixNgDriver = loadDriver();
  const triggered = [];
  const errors = [];
  const triggers = new Map(['left', 'middle', 'right'].map((button) => [
    `awtrixng_button_${button}_pressed`,
    {
      trigger(device) {
        triggered.push({ button, device }); return Promise.resolve();
      },
    },
  ]));
  const device = {
    async acceptsButtonCallback(input) {
      return input.routeUid === 'aabb' && input.bodyUid === 'aabb' && input.token === 'token-a';
    },
  };
  const driver = new AwtrixNgDriver();
  Object.assign(driver, {
    log() {},
    error(error) {
      errors.push(error);
    },
    homey: { flow: { getDeviceTriggerCard: (id) => triggers.get(id) } },
    getDevice(data) {
      assert.deepEqual(data, { id: 'aabb' }); return device;
    },
  });
  await driver.onInit();

  assert.equal(await driver.handleButtonCallback({ uid: 'aabb', token: 'token-a', body: '{"button":"middle","state":true,"uid":"aabb"}' }), true);
  await Promise.resolve();
  assert.deepEqual(triggered, [{ button: 'middle', device }]);
  assert.deepEqual(errors, []);

  assert.equal(await driver.handleButtonCallback({ uid: 'aabb', token: 'token-a', body: { button: 'middle', state: false, uid: 'aabb' } }), true);
  assert.equal(triggered.length, 1, 'release must not create a second Flow trigger');
  assert.equal(await driver.handleButtonCallback({ uid: 'aabb', token: 'token-a', body: { button: 'left', state: true, uid: 'other' } }), false);
  assert.equal(await driver.handleButtonCallback({ uid: 'aabb', token: 'wrong', body: { button: 'left', state: true, uid: 'aabb' } }), false);
});

test('driver returns before Flow completion and reports a rejected trigger', async () => {
  const AwtrixNgDriver = loadDriver();
  let rejectTrigger;
  const errors = [];
  const driver = new AwtrixNgDriver();
  Object.assign(driver, {
    log() {},
    error(error) {
      errors.push(error);
    },
    homey: {
      flow: {
        getDeviceTriggerCard: () => ({
          trigger: () => new Promise((resolve, reject) => {
            rejectTrigger = reject;
          }),
        }),
      },
    },
    getDevice() {
      return { acceptsButtonCallback: async () => true };
    },
  });
  await driver.onInit();
  assert.equal(await driver.handleButtonCallback({ uid: 'aabb', token: 'token', body: { button: 'left', state: true, uid: 'aabb' } }), true);
  assert.equal(errors.length, 0);
  rejectTrigger(new Error('flow failed'));
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(errors[0].message, 'flow failed');
});

test('App API delegates only normalized route inputs to the AWTRIX NG driver', async () => {
  const api = require('../.homeybuild/api'); // eslint-disable-line global-require
  const calls = [];
  const result = await api.awtrixNgButtonCallback({
    homey: {
      drivers: {
        getDriver(id) {
          assert.equal(id, 'awtrixng'); return {
            async handleButtonCallback(input) {
              calls.push(input); return true;
            },
          };
        },
      },
    },
    params: { uid: 'aabb', token: 'secret' },
    body: { button: 'left', state: true, uid: 'aabb' },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].uid, 'aabb');
  assert.equal(calls[0].token, 'secret');
});

test('driver routes all physical buttons to only the selected NG device Flow card', async () => {
  const AwtrixNgDriver = loadDriver();
  const calls = [];
  const a = {
    async acceptsButtonCallback({ routeUid, bodyUid, token }) {
      return routeUid === 'aabb' && bodyUid === 'aabb' && token === 'token-a';
    },
  };
  const b = {
    async acceptsButtonCallback({ routeUid, bodyUid, token }) {
      return routeUid === 'ccdd' && bodyUid === 'ccdd' && token === 'token-b';
    },
  };
  const devices = new Map([['aabb', a], ['ccdd', b]]);
  const cards = Object.fromEntries(['left', 'middle', 'right'].map((button) => [
    `awtrixng_button_${button}_pressed`,
    {
      trigger(device) {
        calls.push({ button, device }); return Promise.resolve();
      },
    },
  ]));
  const driver = new AwtrixNgDriver();
  Object.assign(driver, {
    log() {},
    error() {},
    homey: { flow: { getDeviceTriggerCard: (id) => cards[id] } },
    getDevice({ id }) {
      if (!devices.has(id)) {
        throw new Error('unknown device');
      }
      return devices.get(id);
    },
  });
  await driver.onInit();

  for (const button of ['left', 'middle', 'right']) {
    assert.equal(await driver.handleButtonCallback({
      uid: 'aabb', token: 'token-a', body: { button, state: true, uid: 'aabb' },
    }), true);
  }
  await Promise.resolve();
  assert.deepEqual(calls, [
    { button: 'left', device: a },
    { button: 'middle', device: a },
    { button: 'right', device: a },
  ]);
  assert.equal(await driver.handleButtonCallback({
    uid: 'ccdd', token: 'token-b', body: { button: 'left', state: true, uid: 'ccdd' },
  }), true);
  await Promise.resolve();
  assert.deepEqual(calls.at(-1), { button: 'left', device: b });

  for (const input of [
    { uid: 'aabb', token: 'token-b', body: { button: 'right', state: true, uid: 'aabb' } },
    { uid: 'ccdd', token: 'token-a', body: { button: 'right', state: true, uid: 'ccdd' } },
    { uid: 'unknown', token: 'token-a', body: { button: 'right', state: true, uid: 'unknown' } },
    { uid: 'aabb', token: 'token-a', body: { button: 'right', state: true, uid: 'ccdd' } },
    { uid: 'aabb', token: 'token-a', body: { button: 'select', state: true, uid: 'aabb' } },
  ]) {
    assert.equal(await driver.handleButtonCallback(input), false);
  }
  assert.equal(await driver.handleButtonCallback({
    uid: 'aabb', token: 'token-a', body: { button: 'left', state: false, uid: 'aabb' },
  }), true);
  assert.equal(calls.length, 4, 'invalid and release events must not fire any extra Flow');
});
