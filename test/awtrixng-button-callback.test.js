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

test('NG script Flow searches names and forwards the native script ID; failures reach the Flow', async () => {
  const Driver = loadDriver();
  const runs = new Map();
  const completions = new Map();
  const driver = new Driver();
  driver.log = () => {};
  driver.homey = {
    flow: {
      getDeviceTriggerCard: () => ({}),
      getActionCard: (id) => ({
        registerRunListener: (listener) => runs.set(id, listener),
        registerArgumentAutocompleteListener: (arg, listener) => completions.set(id, listener),
      }),
    },
  };
  await driver.onInit();
  const calls = [];
  const device = {
    getSelectableScripts: async () => [{ id: 'Racer', name: 'Pixel Race' }, { id: 'Weather', name: 'Forecast' }],
    showScript: async (name) => calls.push(name),
  };
  const autocomplete = completions.get('awtrixng_script_show');
  assert.deepEqual(await autocomplete('race', { device }), [{ id: 'Racer', name: 'Pixel Race' }]);
  assert.deepEqual(await autocomplete('weather', { device }), [{ id: 'Weather', name: 'Forecast' }]);
  await runs.get('awtrixng_script_show')({ device, script: { id: 'Racer', name: 'Pixel Race' } });
  assert.deepEqual(calls, ['Racer']);
  const error = new Error('Script is unavailable');
  device.showScript = async () => {
    throw error;
  };
  await assert.rejects(runs.get('awtrixng_script_show')({ device, script: { id: 'Racer' } }), (failure) => failure === error);
});

test('NG audio Flow listeners resolve Soundboard metadata and call the selected device', async () => {
  const Driver = loadDriver();
  const runs = new Map();
  const completions = new Map();
  const sound = {
    id: '0123456789abcdef01234567', name: 'Doorbell', path: 'userdata/0123456789abcdef01234567.mp3', type: 'audio/mpeg',
  };
  const driver = new Driver();
  driver.log = () => {};
  driver.homey = {
    flow: {
      getDeviceTriggerCard: () => ({}),
      getActionCard: (id) => ({
        registerRunListener: (listener) => runs.set(id, listener),
        registerArgumentAutocompleteListener: (arg, listener) => completions.set(id, listener),
      }),
    },
    api: {
      getApiApp: (id) => {
        assert.equal(id, 'com.athom.soundboard');
        return { getInstalled: async () => true, get: async () => [sound] };
      },
    },
    cloud: { getLocalAddress: async () => '192.0.2.40' },
  };
  await driver.onInit();
  assert.deepEqual(await completions.get('awtrixng_audio_soundboard')('door'), [{ id: sound.id, name: sound.name }]);
  const calls = [];
  const device = { playMp3Url: async (value) => calls.push(value), stopUrlSound: async () => calls.push('stop') };
  await runs.get('awtrixng_audio_soundboard')({ device, sound: { id: sound.id, path: '../untrusted' } });
  await runs.get('awtrixng_audio_url')({ device, url: 'http://192.0.2.41/test.mp3' });
  await runs.get('awtrixng_audio_stop')({ device });
  assert.deepEqual(calls, [`http://192.0.2.40/app/com.athom.soundboard/${sound.path}`, 'http://192.0.2.41/test.mp3', 'stop']);
});

test('NG header Flow listeners forward content, optional duration and icon autocomplete', async () => {
  const Driver = loadDriver();
  const runs = new Map();
  const completions = new Map();
  const driver = new Driver();
  driver.log = () => {};
  driver.homey = {
    flow: {
      getDeviceTriggerCard: () => ({}),
      getActionCard: (id) => ({
        registerRunListener: (listener) => runs.set(id, listener),
        registerArgumentAutocompleteListener: (arg, listener) => completions.set(id, listener),
      }),
    },
  };
  await driver.onInit();
  const calls = [];
  const icon = { id: 'weather', name: 'Weather' };
  const device = {
    sendHeaderNotification: async (input) => calls.push(input),
    putHeaderApp: async (name, input) => calls.push({ name, input }),
    icons: { find: async (query) => (query === 'wea' ? [icon] : []) },
  };
  await runs.get('awtrixng_notification_header')({
    device, header: 'Home', text: '21 C', icon,
  });
  await runs.get('awtrixng_application_header')({
    device, name: 'weather', header: 'Outside', text: '15 C', icon, duration: 4000,
  });
  assert.deepEqual(calls, [
    {
      header: 'Home', text: '21 C', icon: 'weather', durationMs: undefined,
    },
    {
      name: 'weather',
      input: {
        header: 'Outside', text: '15 C', icon: 'weather', durationMs: 4000,
      },
    },
  ]);
  await runs.get('awtrixng_notification_header')({
    device, header: 'Home', text: '21 C', color: '#000000', options: '{"name":"home","hold":true}', duration: 5000,
  });
  assert.deepEqual(calls.at(-1), {
    header: 'Home', text: '21 C', icon: undefined, color: '#000000', options: '{"name":"home","hold":true}', durationMs: 5000,
  });
  await runs.get('awtrixng_application_header')({
    device, name: 'weather', header: 'Outside', text: '15 C', icon, color: '#FF8800', options: '{"lifetimeMs":60000}',
  });
  assert.equal(calls.at(-1).name, 'weather');
  assert.equal(calls.at(-1).input.color, '#FF8800');
  assert.equal(calls.at(-1).input.options, '{"lifetimeMs":60000}');
  assert.deepEqual(await completions.get('awtrixng_notification_header')('wea', { device }), [icon]);
});

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
  assert.deepEqual(parseAwtrixNgButtonCallback({ button: 'knob', state: true, uid: 'c' }), {
    button: 'knob', pressed: true, uid: 'c',
  });
  assert.deepEqual(parseAwtrixNgButtonCallback({ button: 'knob', state: false, uid: 'c' }), {
    button: 'knob', pressed: false, uid: 'c',
  });
  for (const turn of [-1, 1]) {
    assert.deepEqual(parseAwtrixNgButtonCallback({ button: 'knob', turn, uid: 'c' }), {
      button: 'knob', turn, uid: 'c',
    });
  }
  for (const body of [
    { button: 'select', state: true, uid: 'a' },
    { button: 'left', state: '2', uid: 'a' },
    { button: 'left', state: 2, uid: 'a' },
    { button: 'left', state: 1, uid: 'a' },
    { button: 'left', state: '1', uid: 'a' },
    { button: 'left', state: true, uid: '' },
    { button: 'left', state: true, uid: 123 },
    { button: 'knob', turn: 0, uid: 'a' },
    { button: 'knob', turn: 1.5, uid: 'a' },
    { button: 'knob', turn: '1', uid: 'a' },
    {
      button: 'knob', state: true, turn: 1, uid: 'a',
    },
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
    homey: {
      flow: {
        getDeviceTriggerCard: (id) => triggers.get(id),
        getActionCard: () => ({ registerRunListener() {}, registerArgumentAutocompleteListener() {} }),
      },
    },
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

test('knob callback routes press and each signed turn only to a knob-capable device', async () => {
  const AwtrixNgDriver = loadDriver();
  const events = [];
  const cards = {
    awtrixng_knob_pressed: {
      trigger(device) {
        events.push({ kind: 'pressed', device }); return Promise.resolve();
      },
    },
    awtrixng_knob_turned: {
      trigger(device, tokens) {
        events.push({ kind: 'turned', device, tokens }); return Promise.resolve();
      },
    },
  };
  const knob = {
    acceptsButtonCallback: async ({ token }) => token === 'correct',
    hasCapability: (id) => id === 'awtrixng_knob',
  };
  const plain = {
    acceptsButtonCallback: async ({ token }) => token === 'correct',
    hasCapability: () => false,
  };
  const driver = new AwtrixNgDriver();
  Object.assign(driver, {
    log() {},
    error(error) {
      throw error;
    },
    homey: {
      flow: {
        getDeviceTriggerCard: (id) => cards[id],
        getActionCard: () => ({ registerRunListener() {}, registerArgumentAutocompleteListener() {} }),
      },
    },
    getDevice({ id }) {
      return id === 'knob-uid' ? knob : plain;
    },
  });
  await driver.onInit();

  const send = (uid, token, body) => driver.handleButtonCallback({ uid, token, body: { ...body, uid } });
  assert.equal(await send('knob-uid', 'correct', { button: 'knob', state: true }), true);
  assert.equal(await send('knob-uid', 'correct', { button: 'knob', state: false }), true);
  assert.equal(await send('knob-uid', 'correct', { button: 'knob', turn: 1 }), true);
  assert.equal(await send('knob-uid', 'correct', { button: 'knob', turn: 1 }), true);
  assert.equal(await send('knob-uid', 'correct', { button: 'knob', turn: -1 }), true);
  assert.equal(await send('knob-uid', 'wrong', { button: 'knob', turn: -1 }), false);
  assert.equal(await send('plain-uid', 'correct', { button: 'knob', turn: 1 }), false);
  assert.deepEqual(events, [
    { kind: 'pressed', device: knob },
    { kind: 'turned', device: knob, tokens: { turn: 1 } },
    { kind: 'turned', device: knob, tokens: { turn: 1 } },
    { kind: 'turned', device: knob, tokens: { turn: -1 } },
  ]);
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
        getActionCard: () => ({ registerRunListener() {}, registerArgumentAutocompleteListener() {} }),
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
    homey: {
      flow: {
        getDeviceTriggerCard: (id) => cards[id],
        getActionCard: () => ({ registerRunListener() {}, registerArgumentAutocompleteListener() {} }),
      },
    },
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
