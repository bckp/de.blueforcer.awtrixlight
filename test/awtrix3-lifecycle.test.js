const assert = require('node:assert/strict');
const test = require('node:test');

const Api = require('../.homeybuild/lib/awtrix3/Api/Api').default;
const { Status } = require('../.homeybuild/lib/awtrix3/Api/Response');
const {
  createFakeAwtrix3Device,
  fakeAwtrix3Client,
} = require('./helpers/fake-homey');

test('AWTRIX 3 availability counts consecutive failures and recovers', async () => {
  const device = createFakeAwtrix3Device({ available: true });
  const api = new Api(fakeAwtrix3Client(), device);

  await api.processResponseCode(Status.Error, 'failure 1');
  await api.processResponseCode(Status.Error, 'failure 2');
  assert.equal(device.failCount, 2);

  await api.processResponseCode(Status.Ok);
  assert.equal(device.failCount, 0, 'success resets the consecutive failure counter');
  assert.equal(device.calls.setAvailable.length, 0);
  assert.deepEqual(device.calls.setUnavailable, []);

  for (let failure = 1; failure <= 3; failure += 1) {
    await api.processResponseCode(Status.Error, `consecutive failure ${failure}`);
  }

  assert.equal(device.failCount, 3);
  assert.deepEqual(device.calls.setUnavailable, ['consecutive failure 3']);
  assert.equal(device.calls.pollExtend.length, 1);
  assert.equal(device.poll.isExtended(), true);
  assert.equal(device.getAvailable(), false);

  await api.processResponseCode(Status.Error, 'failure after transition');
  assert.equal(device.calls.setUnavailable.length, 1, 'unavailable transition happens once');
  assert.equal(device.calls.pollExtend.length, 1);

  await api.processResponseCode(Status.Ok);
  assert.equal(device.failCount, 0);
  assert.equal(device.getAvailable(), true);
  assert.equal(device.calls.setAvailable.length, 1);
  assert.equal(device.calls.pollStart.length, 1);
  assert.equal(device.poll.isExtended(), false);
});

test('AWTRIX 3 concurrent failures trigger one unavailable transition', async () => {
  const device = createFakeAwtrix3Device({ available: true });
  const api = new Api(fakeAwtrix3Client(), device);

  await Promise.all([
    api.processResponseCode(Status.Error, 'concurrent failure 1'),
    api.processResponseCode(Status.Error, 'concurrent failure 2'),
    api.processResponseCode(Status.Error, 'concurrent failure 3'),
  ]);

  assert.equal(device.failCount, 3);
  assert.deepEqual(device.calls.setUnavailable, ['concurrent failure 3']);
  assert.equal(device.calls.pollExtend.length, 1);
});
