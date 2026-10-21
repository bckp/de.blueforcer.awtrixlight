const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const loadAwtrixNgDriver = () => {
  const originalLoad = Module._load;

  function FakeHomeyDriver() {}

  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') {
      return { Driver: FakeHomeyDriver };
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

const deviceState = {
  uid: 'aabbccddeeff',
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
};

const pairInput = {
  name: 'AWTRIX NG',
  address: '192.0.2.60',
  port: 8080,
  baseUrl: 'http://192.0.2.60:8080',
  device: deviceState,
};

test('AWTRIX NG unauthenticated pairing pre-fills connection settings', () => {
  const AwtrixNgDriver = loadAwtrixNgDriver();
  const driver = new AwtrixNgDriver();
  const pairDevice = driver.toPairDevice(pairInput);

  assert.deepEqual(pairDevice.settings, {
    address: '192.0.2.60',
    port: 8080,
    authUser: '',
    authPass: '',
  });
  assert.equal(pairDevice.store.version, '1.0.4-dev');
  assert.equal(pairDevice.store.builtinAppsInitialized, false);
});

test('AWTRIX NG authenticated pairing keeps credentials next to connection settings', () => {
  const AwtrixNgDriver = loadAwtrixNgDriver();
  const driver = new AwtrixNgDriver();
  const pairDevice = driver.toPairDevice({
    ...pairInput,
    settings: {
      authUser: 'homey',
      authPass: 'secret',
    },
  });

  assert.deepEqual(pairDevice.settings, {
    address: '192.0.2.60',
    port: 8080,
    authUser: 'homey',
    authPass: 'secret',
  });
});

test('speech Flow forwards text to its device and propagates playback errors', async () => {
  const Driver = loadAwtrixNgDriver();
  const driver = new Driver();
  const listeners = new Map();
  driver.homey = {
    flow: {
      getActionCard: (id) => ({
        registerRunListener: (listener) => listeners.set(id, listener),
        registerArgumentAutocompleteListener: () => {},
      }),
    },
  };
  driver.registerAudioCards();
  const run = listeners.get('awtrixng_audio_speech');
  let spoken;
  await run({
    text: 'Hello 🐱',
    device: {
      speakText: async (text) => {
        spoken = text;
      },
    },
  });
  assert.equal(spoken, 'Hello 🐱');
  const error = new Error('Speech unavailable');
  await assert.rejects(run({
    text: 'Hello',
    device: {
      speakText: async () => {
        throw error;
      },
    },
  }), (result) => result === error);
});

test('stored sound and RAW Flow cards forward arguments and return RAW response tokens', async () => {
  const Driver = loadAwtrixNgDriver();
  const driver = new Driver();
  const listeners = new Map();
  driver.homey = {
    flow: {
      getActionCard: (id) => ({
        registerRunListener: (listener) => listeners.set(id, listener),
        registerArgumentAutocompleteListener: () => {},
      }),
    },
  };
  driver.registerAudioCards();
  let name;
  await listeners.get('awtrixng_audio_stored')({
    name: 'ding',
    device: {
      playStoredSound: async (value) => {
        name = value;
      },
    },
  });
  assert.equal(name, 'ding');
  const calls = [];
  const device = {
    sendRawCommand: async (...args) => {
      calls.push(args); return { status: 200, response: '{}' };
    },
  };
  assert.deepEqual(await listeners.get('awtrixng_raw_command')({ device, method: 'GET', path: '/api/v1/device' }),
    { status: 200, response: '{}' });
  assert.deepEqual(calls, [['GET', '/api/v1/device', '']]);
});

test('stored sound autocomplete uses the selected device and plays selected IDs while keeping legacy text', async () => {
  const Driver = loadAwtrixNgDriver();
  const driver = new Driver();
  const runs = new Map();
  const completions = new Map();
  driver.homey = {
    flow: {
      getActionCard: (id) => ({
        registerRunListener: (listener) => runs.set(id, listener),
        registerArgumentAutocompleteListener: (name, listener) => completions.set(`${id}:${name}`, listener),
      }),
    },
  };
  driver.registerAudioCards();
  const played = [];
  const device = {
    getStoredMp3Choices: async () => [{ id: 'door', name: 'Door' }, { id: 'ding', name: 'Ding' }],
    playStoredSound: async (name) => played.push(name),
  };
  const lookup = completions.get('awtrixng_audio_stored:name');
  assert.deepEqual(await lookup('DO', { device }), [{ id: 'door', name: 'Door' }]);
  assert.deepEqual(await lookup('', { device: { getStoredMp3Choices: async () => [] } }), []);
  await runs.get('awtrixng_audio_stored')({ device, name: { id: 'door', name: 'Door' } });
  await runs.get('awtrixng_audio_stored')({ device, name: 'Racer/boost' });
  assert.deepEqual(played, ['door', 'Racer/boost']);
  const error = new Error('Device offline');
  await assert.rejects(lookup('', {
    device: {
      getStoredMp3Choices: async () => {
        throw error;
      },
    },
  }), (result) => result === error);
});
