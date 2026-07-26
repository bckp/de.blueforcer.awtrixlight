const assert = require('node:assert/strict');
const test = require('node:test');

const { toAwtrixNgAvailabilityState } = require('../.homeybuild/lib/awtrixng/Device/Availability');
const { AwtrixNgApiError } = require('../.homeybuild/lib/awtrixng/Api/ErrorParser');

const device = {
  uid: 'aabbccddeeff',
  version: '1.0.4-dev',
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
