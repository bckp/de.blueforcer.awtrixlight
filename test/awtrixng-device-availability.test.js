const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const {
  formatAwtrixNgErrorDetails,
  toAwtrixNgAvailabilityState,
} = require('../.homeybuild/lib/awtrixng/Device/Availability');
const { AwtrixNgApiError } = require('../.homeybuild/lib/awtrixng/Api/ErrorParser');
const { AwtrixNgInvalidResponseError } = require('../.homeybuild/lib/awtrixng/Api/InvalidResponseError');
const { AwtrixNgHttpError } = require('../.homeybuild/lib/awtrixng/Http/Transport');
const { AwtrixNgBaseCapabilityIds } = require('../.homeybuild/lib/awtrixng/Device/State');
const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const {
  createFakeHomey,
  fakeAwtrixNgTransport,
} = require('./helpers/fake-homey');

/** Wraps a fake client in a real facade so device.api keeps the production classification logic. */
const facadeFor = (fakeClient) => new AwtrixNgApi(fakeClient, {
  baseUrl: 'http://192.0.2.20:80',
  icons: { emptyIcon: { name: 'empty', id: '-', description: '' } },
});

const device = {
  uid: 'aabbccddeeff',
  version: '1.0.4-dev',
};

const fullDeviceState = {
  ...device,
  boardType: 'awtrixng',
  ipAddress: '192.0.2.20',
  matrixPower: true,
  currentApp: 'Time',
  indicators: [{
    on: false,
    color: '#000000',
    blinkMs: 0,
    fadeMs: 0,
  }],
};

const loadAwtrixNgDevice = (transport) => {
  const originalLoad = Module._load;

  function FakeHomeyDevice() {}

  function FakeAxiosTransport() {
    return transport;
  }

  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') {
      return { Device: FakeHomeyDevice };
    }
    // The transport is created inside the AwtrixNgApi facade since update-plan-3 (M3).
    if (request === '../Http/AxiosTransport') {
      return FakeAxiosTransport;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    // The facade module is reloaded together with the device so each harness gets its own
    // fake transport instead of the one captured by a previously cached facade.
    delete require.cache[require.resolve('../.homeybuild/lib/awtrixng/Api/Api')];
    const modulePath = require.resolve('../.homeybuild/drivers/awtrixng/device');
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    return require('../.homeybuild/drivers/awtrixng/device');
  } finally {
    Module._load = originalLoad;
  }
};

const createAwtrixNgDeviceHarness = (transport, { initialCapabilities = [] } = {}) => {
  const homey = createFakeHomey();
  const capabilities = new Set(initialCapabilities);
  const calls = {
    addCapability: [],
    error: [],
    removeCapability: [],
    setCapabilityValue: [],
    setAvailable: [],
    setUnavailable: [],
  };
  const AwtrixNgDevice = loadAwtrixNgDevice(transport);
  const awtrixNgDevice = new AwtrixNgDevice();

  Object.assign(awtrixNgDevice, {
    homey,
    log() {},
    error(error) {
      calls.error.push(error);
    },
    getStoreValue(key) {
      return key === 'baseUrl' ? 'http://192.0.2.20:80' : undefined;
    },
    async getSettings() {
      return {};
    },
    registerCapabilityListener() {},
    getCapabilities() {
      return [...capabilities];
    },
    hasCapability(capabilityId) {
      return capabilities.has(capabilityId);
    },
    async addCapability(capabilityId) {
      calls.addCapability.push(capabilityId);
      capabilities.add(capabilityId);
    },
    async removeCapability(capabilityId) {
      calls.removeCapability.push(capabilityId);
      capabilities.delete(capabilityId);
    },
    async setCapabilityValue(capabilityId, value) {
      calls.setCapabilityValue.push({ capabilityId, value });
      return undefined;
    },
    async setAvailable() {
      calls.setAvailable.push(undefined);
    },
    async setUnavailable(message) {
      calls.setUnavailable.push(message);
    },
  });

  return {
    awtrixNgDevice,
    calls,
    capabilities,
    homey,
  };
};

test('AWTRIX NG availability state marks detected probe as available', () => {
  assert.deepEqual(toAwtrixNgAvailabilityState({
    status: 'detected',
    device,
  }), {
    available: true,
  });
});

test('AWTRIX NG availability state preserves auth error details', () => {
  const error = new AwtrixNgApiError({
    method: 'GET',
    url: 'http://awtrix-ng.local/api/v1/device',
    message: 'authentication required',
    code: 'unauthorized',
    httpStatus: 401,
  });

  assert.deepEqual(toAwtrixNgAvailabilityState({
    status: 'auth-required',
    error,
  }), {
    available: false,
    message: 'Authentication is required. authentication required | code: unauthorized | HTTP status: 401',
  });
});

test('AWTRIX NG availability state preserves offline API error field, code and status', () => {
  const error = new AwtrixNgApiError({
    method: 'GET',
    url: 'http://awtrix-ng.local/api/v1/device',
    message: 'service busy',
    code: 'serviceBusy',
    field: 'device',
    httpStatus: 503,
  });

  assert.deepEqual(toAwtrixNgAvailabilityState({
    status: 'offline',
    error,
  }), {
    available: false,
    message: 'Device is offline. service busy | field: device | code: serviceBusy | HTTP status: 503',
  });
});

test('AWTRIX NG availability state reports wrong-shape probe as unavailable', () => {
  assert.deepEqual(toAwtrixNgAvailabilityState({
    status: 'rejected',
    reason: 'wrong-shape',
    rawResponse: { version: 'not-enough' },
  }), {
    available: false,
    message: 'The device did not return a valid response.',
  });
});

test('AWTRIX NG error detail formatter handles non-API errors explicitly', () => {
  assert.equal(formatAwtrixNgErrorDetails(new Error('socket closed')), 'socket closed');
  assert.equal(formatAwtrixNgErrorDetails(null), 'Unknown error.');
});

test('AWTRIX NG removes the deprecated battery alarm while preserving battery percentage', async () => {
  const { awtrixNgDevice, calls, capabilities } = createAwtrixNgDeviceHarness(fakeAwtrixNgTransport(), {
    initialCapabilities: [
      ...AwtrixNgBaseCapabilityIds,
      'alarm_battery',
    ],
  });
  awtrixNgDevice.api = facadeFor({});

  await awtrixNgDevice.applyDeviceState({
    ...fullDeviceState,
    batteryPercent: 82,
    lowBattery: true,
  }, true);

  assert.deepEqual(calls.removeCapability, ['alarm_battery']);
  assert.equal(capabilities.has('alarm_battery'), false);
  assert.equal(capabilities.has('measure_battery'), true);
  assert.deepEqual(calls.setCapabilityValue.find(({ capabilityId }) => capabilityId === 'measure_battery'), {
    capabilityId: 'measure_battery',
    value: 82,
  });
});

test('AWTRIX NG battery alarm migration failure is contained and retried on a later init', async () => {
  const migrationError = new Error('remove failed');
  const { awtrixNgDevice, calls, capabilities } = createAwtrixNgDeviceHarness(fakeAwtrixNgTransport(), {
    initialCapabilities: [
      ...AwtrixNgBaseCapabilityIds,
      'alarm_battery',
    ],
  });
  awtrixNgDevice.api = facadeFor({});
  awtrixNgDevice.removeCapability = async () => {
    throw migrationError;
  };

  await assert.doesNotReject(() => awtrixNgDevice.applyDeviceState({
    ...fullDeviceState,
    batteryPercent: 82,
    lowBattery: true,
  }, true));

  assert.deepEqual(calls.error, [migrationError]);
  assert.equal(capabilities.has('alarm_battery'), true);
  assert.equal(capabilities.has('measure_battery'), true);
});

test('AWTRIX NG device localizes availability headers and preserves technical error details', async () => {
  const scenarios = [{
    name: 'authentication required',
    getDevice: async () => {
      throw new AwtrixNgApiError({
        method: 'GET',
        url: 'http://awtrix-ng.local/api/v1/device',
        message: 'authentication required',
        code: 'unauthorized',
        field: 'authorization',
        httpStatus: 401,
      });
    },
    expectedMessage: 'states.awtrixNg.authenticationRequired: authentication required | field: authorization | code: unauthorized | HTTP status: 401',
  }, {
    name: 'invalid response',
    getDevice: async () => ({ version: 'not-enough' }),
    expectedMessage: 'states.awtrixNg.invalidResponse',
  }, {
    name: 'offline',
    getDevice: async () => {
      throw new AwtrixNgApiError({
        method: 'GET',
        url: 'http://awtrix-ng.local/api/v1/device',
        message: 'service busy',
        code: 'serviceBusy',
        field: 'device',
        httpStatus: 503,
      });
    },
    expectedMessage: 'states.awtrixNg.offline: service busy | field: device | code: serviceBusy | HTTP status: 503',
  }];

  for (const scenario of scenarios) {
    const { awtrixNgDevice, calls } = createAwtrixNgDeviceHarness(fakeAwtrixNgTransport());
    awtrixNgDevice.api = facadeFor({ getDevice: scenario.getDevice });

    await awtrixNgDevice.refreshAvailability();

    assert.deepEqual(calls.setUnavailable, [scenario.expectedMessage], scenario.name);
  }
});

test('AWTRIX NG settings refresh rejects a response that is not a plain object', async () => {
  const { awtrixNgDevice } = createAwtrixNgDeviceHarness(fakeAwtrixNgTransport());

  awtrixNgDevice.api = facadeFor({
    async getSettings() {
      return [];
    },
  });

  await assert.rejects(
    () => awtrixNgDevice.refreshSettingsFromDevice(),
    (error) => {
      assert.equal(error instanceof AwtrixNgInvalidResponseError, true);
      assert.equal(error.endpoint, '/api/v1/settings');
      assert.equal(error.expectedShape, 'a plain object');
      assert.equal(error.actualType, 'array');
      return true;
    },
  );
});

test('AWTRIX NG apps refresh rejects a response that is not an array', async () => {
  const { awtrixNgDevice } = createAwtrixNgDeviceHarness(fakeAwtrixNgTransport());

  awtrixNgDevice.api = facadeFor({
    async getApps() {
      return null;
    },
  });

  await assert.rejects(
    () => awtrixNgDevice.refreshAppsFromDevice(),
    (error) => {
      assert.equal(error instanceof AwtrixNgInvalidResponseError, true);
      assert.equal(error.endpoint, '/api/v1/apps');
      assert.equal(error.expectedShape, 'an array');
      assert.equal(error.actualType, 'null');
      return true;
    },
  );
});

test('AWTRIX NG starts polling and preserves API error details when initial settings sync fails', async () => {
  const transport = fakeAwtrixNgTransport();
  const sourceError = new AwtrixNgHttpError({
    method: 'GET',
    url: 'http://192.0.2.20:80/api/v1/settings',
    message: 'Request failed with status code 422',
    status: 422,
    rawBody: {
      error: {
        code: 'validationFailed',
        message: 'invalid brightness',
        field: 'brightness',
      },
    },
  });

  transport.request = async (request) => {
    transport.calls.push(request);

    if (request.path === '/api/v1/device') {
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: fullDeviceState,
      };
    }

    if (request.path === '/api/v1/settings') {
      throw sourceError;
    }

    throw new Error(`Unexpected request: ${request.path}`);
  };

  const { awtrixNgDevice, calls, homey } = createAwtrixNgDeviceHarness(transport);

  await assert.doesNotReject(() => awtrixNgDevice.onInit());

  assert.deepEqual(transport.calls.map((request) => request.path), [
    '/api/v1/device',
    '/api/v1/settings',
  ]);
  assert.equal(calls.error.length, 1);
  assert.equal(calls.error[0] instanceof AwtrixNgApiError, true);
  assert.equal(calls.error[0].message, 'invalid brightness');
  assert.equal(calls.error[0].field, 'brightness');
  assert.equal(calls.error[0].code, 'validationFailed');
  assert.equal(calls.error[0].httpStatus, 422);
  assert.deepEqual(calls.setUnavailable, [
    'states.awtrixNg.initialSynchronizationFailed: invalid brightness | field: brightness | code: validationFailed | HTTP status: 422',
  ]);
  assert.equal(homey.setIntervalCalls.length, 1);
  assert.equal(homey.setIntervalCalls[0].intervalMs, 60000);
  assert.equal(awtrixNgDevice.poll.isActive(), true);

  const pollingError = calls.error[0];
  awtrixNgDevice.refreshDeviceState = async () => {
    throw pollingError;
  };

  await homey.tick(60000);

  assert.equal(calls.error[1], pollingError, 'poll logger receives the complete original NG error object');
  assert.equal(awtrixNgDevice.poll.isActive(), true);
});

test('AWTRIX NG onAdded uploads bundled icons with bounded parallelism and reports failures', async () => {
  const iconDirectory = path.join(__dirname, '../.homeybuild/drivers/awtrixng/assets/images/icons');
  const expectedFiles = fs.readdirSync(iconDirectory)
    .filter((fileName) => fs.statSync(path.join(iconDirectory, fileName)).isFile());
  const uploadError = new AwtrixNgApiError({
    method: 'POST',
    url: 'http://awtrix-ng.local/api/v1/files',
    message: 'icon format rejected',
    code: 'validationFailed',
    field: 'file',
    httpStatus: 422,
  });
  const uploads = [];
  let activeUploads = 0;
  let maximumActiveUploads = 0;
  const { awtrixNgDevice, calls } = createAwtrixNgDeviceHarness(fakeAwtrixNgTransport());

  // device.icons is a read-only view of device.api.icons since update-plan-3 (M3).
  awtrixNgDevice.api = {
    icons: {
      async upload({ fileName, body }) {
        assert.equal(Buffer.isBuffer(body), true);
        uploads.push(fileName);
        activeUploads += 1;
        maximumActiveUploads = Math.max(maximumActiveUploads, activeUploads);
        await Promise.resolve();
        activeUploads -= 1;

        if (fileName === 'homey.jpg') {
          throw uploadError;
        }
      },
    },
  };

  await assert.doesNotReject(() => awtrixNgDevice.onAdded());

  assert.deepEqual(uploads.slice().sort(), expectedFiles.slice().sort(), 'R9: every bundled icon is attempted');
  // H12: bounded worker pool of 3 replaces the sequential loop.
  assert.ok(maximumActiveUploads > 1, 'uploads run in parallel');
  assert.ok(maximumActiveUploads <= 3, `at most 3 uploads run at once, saw ${maximumActiveUploads}`);
  const failedUploadIndex = uploads.indexOf('homey.jpg');
  assert.notEqual(failedUploadIndex, -1);
  assert.ok(failedUploadIndex < uploads.length - 1, 'an icon after the failure was uploaded');
  assert.deepEqual(calls.setUnavailable, []);
  assert.equal(calls.error.length, 1);
  assert.equal(Array.isArray(calls.error[0]), true);
  assert.equal(calls.error[0].length, 1);
  assert.equal(calls.error[0][0].fileName, 'homey.jpg');
  assert.equal(calls.error[0][0].error, uploadError);
  assert.equal(calls.error[0][0].error.httpStatus, 422);
  assert.equal(calls.error[0][0].error.code, 'validationFailed');
  assert.equal(calls.error[0][0].error.message, 'icon format rejected');
  assert.equal(calls.error[0][0].error.field, 'file');
});
