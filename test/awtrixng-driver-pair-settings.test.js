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
  uid: '48e7291211d8',
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
