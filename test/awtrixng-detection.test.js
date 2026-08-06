const assert = require('node:assert/strict');
const test = require('node:test');

const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const {
  isAwtrixNgDeviceStateResponse,
  isAwtrixNgMdnsCandidate,
  probeAwtrixNgDevice,
  toAwtrixNgBaseUrl,
} = require('../.homeybuild/lib/awtrixng/Discovery/Detection');
const { AwtrixNgApiError } = require('../.homeybuild/lib/awtrixng/Api/ErrorParser');
const { AwtrixNgHttpError } = require('../.homeybuild/lib/awtrixng/Http/Transport');

const ngDeviceResponse = {
  uid: 'aabbccddeeff',
  version: '1.0.14',
  boardType: 'awtrixng',
  soc: 'esp32',
  ipAddress: '192.168.1.44',
  hostname: 'awtrixng-ddeeff',
  wifiRssi: -62,
  uptimeSeconds: 1234,
  resetReason: 'poweron',
  freeHeapBytes: 100000,
  minFreeHeapBytes: 90000,
  largestFreeBlockBytes: 80000,
  scriptingRunning: true,
  scriptHeapPool: 'internal',
  scriptHeapBudgetBytes: 4096,
  fps: 30,
  brightness: 128,
  lightLevel: 40,
  ldrRaw: 300,
  matrixPower: true,
  currentApp: 'Time',
  indicators: [{
    on: false,
    color: '#000000',
    blinkMs: 0,
    fadeMs: 0,
  }],
  messageCount: 0,
  wifi: {
    enabled: true,
    state: 'connected',
    host: 'Home',
    endpoint: '192.168.1.44',
    attempts: 0,
    retryInMs: 0,
    connects: 1,
    error: null,
    lastError: null,
  },
  mqtt: {
    enabled: false,
    state: 'disabled',
    host: '',
    endpoint: '',
    attempts: 0,
    retryInMs: 0,
    connects: 0,
    error: null,
    lastError: null,
  },
  batteryPinMillivolts: 2300,
  lowBattery: false,
  temperature: 22.5,
  humidity: 45,
};

const awtrix3StatsLikeResponse = {
  bat: 82,
  lux: 120,
  ram: 123456,
  bri: 128,
  temp: 22,
  hum: 45,
  uptime: 1234,
  wifi_signal: -62,
  messages: 1,
  version: '0.96',
  indicator1: false,
  indicator2: false,
  indicator3: false,
  app: 'Time',
  uid: 'aabbccddeeff',
  matrix: true,
};

class FakeTransport {

  calls = [];

  responseData = ngDeviceResponse;

  error = null;

  async request(request) {
    this.calls.push(request);

    if (this.error) {
      throw this.error;
    }

    return {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
      data: this.responseData,
    };
  }

}

const createProbeClient = () => {
  const transport = new FakeTransport();

  return {
    client: new AwtrixNgClient(transport),
    transport,
  };
};

test('AWTRIX NG mDNS candidate relies on the txt type after Homey discovery filtering', () => {
  assert.equal(isAwtrixNgMdnsCandidate({
    txt: { type: 'awtrixng' },
  }), true);

  assert.equal(isAwtrixNgMdnsCandidate({
    txt: { type: 'awtrix3' },
  }), false);

  assert.equal(isAwtrixNgMdnsCandidate({}), false);
});

test('AWTRIX NG base URL includes discovered port', () => {
  assert.equal(toAwtrixNgBaseUrl({
    address: '192.168.1.44',
    port: 8080,
  }), 'http://192.168.1.44:8080');

  assert.equal(toAwtrixNgBaseUrl({
    protocol: 'https',
    address: 'awtrix-ng.local',
    port: 443,
  }), 'https://awtrix-ng.local:443');

  assert.throws(() => toAwtrixNgBaseUrl({
    address: '192.168.1.44',
    port: 0,
  }), RangeError);
});

test('AWTRIX NG probe detects documented /api/v1/device shape using read-only GET', async () => {
  const { client, transport } = createProbeClient();
  const result = await probeAwtrixNgDevice(client);

  assert.equal(result.status, 'detected');
  assert.deepEqual(result.device, ngDeviceResponse);
  assert.deepEqual(transport.calls, [{
    method: 'GET',
    path: '/api/v1/device',
  }]);
});

test('AWTRIX NG device shape rejects an invalid batteryPinMillivolts value', () => {
  assert.equal(isAwtrixNgDeviceStateResponse({
    ...ngDeviceResponse,
    batteryPinMillivolts: '2300',
  }), false);
});

test('AWTRIX NG probe reports auth-required for 401 unauthorized envelope', async () => {
  const { client, transport } = createProbeClient();
  const rawBody = {
    error: {
      code: 'unauthorized',
      message: 'authentication required',
    },
  };

  transport.error = new AwtrixNgHttpError({
    method: 'GET',
    url: 'http://192.168.1.44:8080/api/v1/device',
    message: 'Request failed with status code 401',
    status: 401,
    headers: {
      'content-type': 'application/json',
    },
    rawBody,
  });

  const result = await probeAwtrixNgDevice(client);

  assert.equal(result.status, 'auth-required');
  assert.equal(result.error instanceof AwtrixNgApiError, true);
  assert.equal(result.error.httpStatus, 401);
  assert.equal(result.error.code, 'unauthorized');
  assert.equal(result.error.message, 'authentication required');
  assert.deepEqual(transport.calls, [{
    method: 'GET',
    path: '/api/v1/device',
  }]);
});

test('AWTRIX NG probe reports auth-required for 401 without an error envelope', async () => {
  const { client, transport } = createProbeClient();
  const rawBody = 'authentication required';

  transport.error = new AwtrixNgHttpError({
    method: 'GET',
    url: 'http://192.168.1.44:8080/api/v1/device',
    message: 'Request failed with status code 401',
    status: 401,
    headers: {
      'content-type': 'text/plain',
    },
    rawBody,
  });

  const result = await probeAwtrixNgDevice(client);

  assert.equal(result.status, 'auth-required');
  assert.equal(result.error instanceof AwtrixNgApiError, true);
  assert.equal(result.error.httpStatus, 401);
  assert.equal(result.error.code, 'unknownErrorEnvelope');
  assert.equal(result.error.message, 'Request failed with status code 401');
  assert.equal(result.error.rawBody, rawBody);
});

test('AWTRIX NG probe preserves an unknown 401 envelope while classifying it as auth-required', async () => {
  const { client, transport } = createProbeClient();
  const rawBody = {
    error: {
      code: 'unknownErrorEnvelope',
      message: 'credentials rejected',
      field: 'authorization',
    },
  };

  transport.error = new AwtrixNgHttpError({
    method: 'GET',
    url: 'http://192.168.1.44:8080/api/v1/device',
    message: 'Request failed with status code 401',
    status: 401,
    headers: {
      'content-type': 'application/json',
    },
    rawBody,
  });

  const result = await probeAwtrixNgDevice(client);

  assert.equal(result.status, 'auth-required');
  assert.equal(result.error instanceof AwtrixNgApiError, true);
  assert.equal(result.error.httpStatus, 401);
  assert.equal(result.error.code, 'unknownErrorEnvelope');
  assert.equal(result.error.message, 'credentials rejected');
  assert.equal(result.error.field, 'authorization');
  assert.equal(result.error.rawBody, rawBody);
});

test('AWTRIX NG probe keeps HTTP 403 and 500 errors offline', async () => {
  for (const errorCase of [
    { status: 403, code: 'forbidden' },
    { status: 500, code: 'internalError' },
  ]) {
    const { client, transport } = createProbeClient();
    const rawBody = {
      error: {
        code: errorCase.code,
        message: `HTTP ${errorCase.status}`,
        field: 'device',
      },
    };

    transport.error = new AwtrixNgHttpError({
      method: 'GET',
      url: 'http://192.168.1.44:8080/api/v1/device',
      message: `Request failed with status code ${errorCase.status}`,
      status: errorCase.status,
      headers: {
        'content-type': 'application/json',
      },
      rawBody,
    });

    const result = await probeAwtrixNgDevice(client);

    assert.equal(result.status, 'offline');
    assert.equal(result.error instanceof AwtrixNgApiError, true);
    assert.equal(result.error.httpStatus, errorCase.status);
    assert.equal(result.error.code, errorCase.code);
    assert.equal(result.error.message, `HTTP ${errorCase.status}`);
    assert.equal(result.error.field, 'device');
    assert.equal(result.error.rawBody, rawBody);
  }
});

test('AWTRIX NG probe reports offline for timeout or network errors', async () => {
  const { client, transport } = createProbeClient();

  transport.error = new AwtrixNgHttpError({
    method: 'GET',
    url: 'http://192.168.1.44:8080/api/v1/device',
    message: 'timeout of 1000ms exceeded',
  });

  const result = await probeAwtrixNgDevice(client);

  assert.equal(result.status, 'offline');
  assert.equal(result.error instanceof AwtrixNgApiError, true);
  assert.equal(result.error.httpStatus, undefined);
  assert.equal(result.error.code, 'unknownErrorEnvelope');
});

test('AWTRIX NG probe rejects wrong response shape', async () => {
  const { client, transport } = createProbeClient();
  const wrongShape = {
    version: '1.0.4-dev',
    uid: 'aabbccddeeff',
  };

  transport.responseData = wrongShape;

  const result = await probeAwtrixNgDevice(client);

  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'wrong-shape');
  assert.deepEqual(result.rawResponse, wrongShape);
});

test('AWTRIX NG probe rejects AWTRIX 3 stats shape on /api/v1/device', async () => {
  const { client, transport } = createProbeClient();

  transport.responseData = awtrix3StatsLikeResponse;

  const result = await probeAwtrixNgDevice(client);

  assert.equal(isAwtrixNgDeviceStateResponse(awtrix3StatsLikeResponse), false);
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'wrong-shape');
  assert.deepEqual(result.rawResponse, awtrix3StatsLikeResponse);
});
