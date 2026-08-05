const assert = require('node:assert/strict');
const test = require('node:test');

const Api = require('../.homeybuild/lib/awtrix3/Api/Api').default;
const { Status } = require('../.homeybuild/lib/awtrix3/Api/Response');
const {
  createFakeAwtrix3Device,
  fakeAwtrix3Client,
} = require('./helpers/fake-homey');

// characterization: pre-C1
test('AWTRIX 3 availability preserves current fail counter behavior', async () => {
  const device = createFakeAwtrix3Device({ available: true });
  const api = new Api(fakeAwtrix3Client(), device);

  device.failsAdd();
  api.processResponseCode(Status.Ok);

  assert.equal(device.failCount, 1, 'success while available does not reset the counter');
  assert.equal(device.calls.setAvailable.length, 0);

  device.failsReset();
  for (let failure = 1; failure <= 3; failure += 1) {
    api.processResponseCode(Status.Error, `failure ${failure}`);
  }

  assert.equal(device.failCount, 3);
  assert.deepEqual(device.calls.setUnavailable, []);
  assert.equal(device.calls.pollExtend.length, 0);

  api.processResponseCode(Status.Error, 'failure 4');
  await Promise.resolve();

  assert.equal(device.failCount, 3);
  assert.deepEqual(device.calls.setUnavailable, ['failure 4']);
  assert.equal(device.calls.pollExtend.length, 1);
});
