const assert = require('node:assert/strict');
const test = require('node:test');

const {
  capabilitySupported,
  capabilityUnsupported,
  isCapabilitySupported,
} = require('../.homeybuild/lib/awtrixng/Errors/Capability');
const {
  AwtrixProtocolError,
  UnsupportedCapabilityError,
} = require('../.homeybuild/lib/awtrixng/Api/ErrorParser');

test('capability helpers represent supported and unsupported capabilities explicitly', () => {
  const supported = capabilitySupported();
  const unsupported = capabilityUnsupported('protocol-unsupported', 'AWTRIX NG has no clients field.');

  assert.deepEqual(supported, { supported: true });
  assert.deepEqual(unsupported, {
    supported: false,
    reason: 'protocol-unsupported',
    details: 'AWTRIX NG has no clients field.',
  });
  assert.equal(isCapabilitySupported(supported), true);
  assert.equal(isCapabilitySupported(unsupported), false);
});

test('unsupported capability error exposes serializable diagnostic properties', () => {
  const error = new UnsupportedCapabilityError({
    capability: 'notificationForwarding',
    reason: 'protocol-unsupported',
    details: 'AWTRIX NG notification payload does not support clients.',
  });

  assert.equal(error.name, 'UnsupportedCapabilityError');
  assert.equal(error.capability, 'notificationForwarding');
  assert.equal(error.reason, 'protocol-unsupported');
  assert.equal(error.details, 'AWTRIX NG notification payload does not support clients.');
  assert.equal(error instanceof UnsupportedCapabilityError, true);
  assert.match(error.message, /notificationForwarding/);
  assert.match(error.message, /protocol-unsupported/);
});

test('protocol error keeps the protocol discriminator', () => {
  const error = new AwtrixProtocolError({
    protocol: 'awtrix-ng',
    message: 'Request failed',
  });

  assert.equal(error.name, 'AwtrixProtocolError');
  assert.equal(error.protocol, 'awtrix-ng');
  assert.equal(error.message, 'Request failed');
  assert.equal(error instanceof AwtrixProtocolError, true);
});
