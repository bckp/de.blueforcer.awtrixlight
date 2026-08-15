const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const { AwtrixNgApiError } = require('../.homeybuild/lib/awtrixng/Api/ErrorParser');

const root = path.resolve(__dirname, '..');

const createDeviceState = (overrides = {}) => ({
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
  ...overrides,
});

const loadAwtrixNgDriver = ({ onTransportCreated, request }) => {
  const originalLoad = Module._load;

  function FakeHomeyDriver() {}

  function FakeFetchTransport(options) {
    this.options = options;
    onTransportCreated?.(options);
  }

  FakeFetchTransport.prototype.request = function fakeRequest(httpRequest) {
    return request(this.options, httpRequest);
  };

  Module._load = function load(requestPath, parent, isMain) {
    if (requestPath === 'homey') {
      return { Driver: FakeHomeyDriver };
    }
    // The transport is created inside the AwtrixNgApi facade since update-plan-3 (M4).
    if (requestPath === '../Http/FetchTransport') {
      return FakeFetchTransport;
    }
    return originalLoad.call(this, requestPath, parent, isMain);
  };

  try {
    // The facade module is reloaded together with the driver so each harness gets its own
    // fake transport instead of the one captured by a previously cached facade.
    delete require.cache[require.resolve('../.homeybuild/lib/awtrixng/Api/Api')];
    const modulePath = require.resolve('../.homeybuild/drivers/awtrixng/driver');
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    return require('../.homeybuild/drivers/awtrixng/driver');
  } finally {
    Module._load = originalLoad;
  }
};

test('AWTRIX NG manual pairing option uses the localized title', () => {
  const AwtrixNgDriver = loadAwtrixNgDriver({});
  const driver = new AwtrixNgDriver();
  driver.homey = {
    __: (key) => `localized:${key}`,
  };

  assert.equal(driver.createManualPairingOption().name, 'localized:pair.manual.title');
});

test('AWTRIX NG driver probes all three pairing paths through the facade', async () => {
  const driverSource = fs.readFileSync(path.join(root, 'drivers/awtrixng/driver.ts'), 'utf8');
  const clientOptions = [];
  const AwtrixNgDriver = loadAwtrixNgDriver({
    onTransportCreated(options) {
      clientOptions.push(options);
    },
    async request() {
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: createDeviceState(),
      };
    },
  });
  const driver = new AwtrixNgDriver();
  driver.log = () => {};

  const manualResult = await driver.probeManualPairingInput({
    address: '192.0.2.60',
    port: 8080,
  });
  const credentialsResult = await driver.probePendingAuthPairTarget({
    address: '192.0.2.61',
    port: 8081,
    baseUrl: 'http://192.0.2.61:8081',
    name: 'Credentials device',
  }, {
    username: 'homey',
    password: 'secret',
  });
  const discoveryResult = await driver.probeDiscoveryResult({
    id: 'discovery-id',
    address: '192.0.2.62',
    port: 8082,
    txt: { type: 'awtrixng' },
    name: 'Discovery device',
  });

  assert.equal(driverSource.includes('new AwtrixNgClient'), false, 'the driver never builds a client itself');
  assert.equal(driverSource.match(/AwtrixNgApi\.probe\(this\.#createProbeConnection\(\{/g)?.length, 3);
  // Both pairing session paths share one response mapper (owner-approved consolidation);
  // probeDiscoveryResult stays separate because it filters instead of reporting statuses.
  assert.equal(driverSource.match(/this\.#toPairingProbeResponse\(/g)?.length, 2);
  assert.deepEqual(clientOptions.map(({ baseUrl, auth }) => ({ baseUrl, auth })), [{
    baseUrl: 'http://192.0.2.60:8080',
    auth: undefined,
  }, {
    baseUrl: 'http://192.0.2.61:8081',
    auth: {
      username: 'homey',
      password: 'secret',
    },
  }, {
    baseUrl: 'http://192.0.2.62:8082',
    auth: undefined,
  }]);
  assert.equal(manualResult.device.name, 'awtrixng');
  assert.equal(credentialsResult.device.name, 'Credentials device');
  assert.equal(discoveryResult.name, 'Discovery device');
});

test('AWTRIX NG probe workflows preserve their distinct status and error mappings', async () => {
  const authError = new AwtrixNgApiError({
    method: 'GET',
    url: 'http://192.0.2.70:8070/api/v1/device',
    message: 'authentication required',
    code: 'unauthorized',
    field: 'authorization',
    httpStatus: 401,
  });
  const offlineError = new AwtrixNgApiError({
    method: 'GET',
    url: 'http://192.0.2.71:8071/api/v1/device',
    message: 'service busy',
    code: 'serviceBusy',
    field: 'device',
    httpStatus: 503,
  });
  const AwtrixNgDriver = loadAwtrixNgDriver({
    async request(options) {
      if (options.baseUrl === 'http://192.0.2.70:8070') {
        throw authError;
      }
      if (options.baseUrl === 'http://192.0.2.71:8071') {
        throw offlineError;
      }

      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { legacy: 'wrong-shape' },
      };
    },
  });
  const driver = new AwtrixNgDriver();
  driver.log = () => {};

  const manualResult = await driver.probeManualPairingInput({
    address: '192.0.2.70',
    port: 8070,
  });
  const credentialsResult = await driver.probePendingAuthPairTarget({
    address: '192.0.2.71',
    port: 8071,
    baseUrl: 'http://192.0.2.71:8071',
  }, {
    username: 'homey',
    password: 'secret',
  });
  const discoveryResult = await driver.probeDiscoveryResult({
    id: 'wrong-shape',
    address: '192.0.2.72',
    port: 8072,
    txt: { type: 'awtrixng' },
  });

  assert.deepEqual(manualResult, {
    status: 'auth-required',
    error: {
      httpStatus: 401,
      code: 'unauthorized',
      message: 'authentication required',
      field: 'authorization',
    },
  });
  assert.deepEqual(credentialsResult, {
    status: 'offline',
    message: 'service busy',
    error: {
      httpStatus: 503,
      code: 'serviceBusy',
      message: 'service busy',
      field: 'device',
    },
  });
  assert.equal(discoveryResult, undefined);
});

test('AWTRIX NG discovery filters synchronously, probes at most four candidates and sorts by name', async () => {
  const candidateNames = ['Zulu', 'Alpha', 'Echo', 'Bravo', 'Delta', 'Charlie'];
  let inspectedCandidates = 0;
  let activeProbes = 0;
  let maximumActiveProbes = 0;
  const clientOptions = [];
  const discoveryResults = Object.fromEntries([
    ...candidateNames.map((name, index) => [name, {
      id: `device-${index}`,
      address: `192.0.2.${index + 10}`,
      port: 8000 + index,
      get txt() {
        inspectedCandidates += 1;
        return { type: 'awtrixng' };
      },
      name,
    }]),
    ['ignored', {
      id: 'ignored',
      address: '192.0.2.99',
      port: 8099,
      get txt() {
        inspectedCandidates += 1;
        return { type: 'other-device' };
      },
      name: 'Ignored',
    }],
  ]);
  const AwtrixNgDriver = loadAwtrixNgDriver({
    onTransportCreated(options) {
      assert.equal(inspectedCandidates, candidateNames.length + 1, 'all candidates must be filtered before the first probe');
      clientOptions.push(options);
    },
    async request(options) {
      activeProbes += 1;
      maximumActiveProbes = Math.max(maximumActiveProbes, activeProbes);
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      activeProbes -= 1;

      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: createDeviceState({
          uid: options.baseUrl,
        }),
      };
    },
  });
  const driver = new AwtrixNgDriver();
  driver.log = () => {};
  driver.getDiscoveryStrategy = () => ({
    getDiscoveryResults: () => discoveryResults,
  });

  const devices = await driver.findDiscoveredDevices();

  assert.equal(clientOptions.length, candidateNames.length);
  assert.equal(maximumActiveProbes, 4);
  assert.deepEqual(devices.map(({ name }) => name), [...candidateNames].sort((left, right) => left.localeCompare(right)));
});
