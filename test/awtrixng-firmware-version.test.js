const assert = require('node:assert/strict');
const test = require('node:test');

const isAwtrixNgFirmwareVersionSupported = require(
  '../.homeybuild/lib/awtrixng/Api/FirmwareVersion',
).default;

test('AWTRIX NG firmware version comparison accepts the minimum and newer versions', () => {
  assert.equal(isAwtrixNgFirmwareVersionSupported('1.1.0', '1.1.0'), true);
  assert.equal(isAwtrixNgFirmwareVersionSupported('1.1.1', '1.1.0'), true);
  assert.equal(isAwtrixNgFirmwareVersionSupported('2.0.0', '1.1.0'), true);
  assert.equal(isAwtrixNgFirmwareVersionSupported('1.2.0-dev', '1.1.0'), true);
});

test('AWTRIX NG firmware version comparison rejects older, prerelease and malformed versions', () => {
  assert.equal(isAwtrixNgFirmwareVersionSupported('1.0.14', '1.1.0'), false);
  assert.equal(isAwtrixNgFirmwareVersionSupported('1.1.0-dev', '1.1.0'), false);
  assert.equal(isAwtrixNgFirmwareVersionSupported('unknown', '1.1.0'), false);
  assert.equal(isAwtrixNgFirmwareVersionSupported('1.1.0', 'unknown'), false);
});
