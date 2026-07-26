const assert = require('node:assert/strict');
const test = require('node:test');

const {
  runAwtrixNgMatrixPowerCapability,
  runAwtrixNgNextAppCapability,
  runAwtrixNgPreviousAppCapability,
  runAwtrixNgWeatherOverlayCapability,
} = require('../.homeybuild/lib/awtrixng/Device/Controls');

const ok = { ok: true };

const createFakeClient = () => {
  const calls = [];

  return {
    calls,
    client: {
      async patchDisplay(patch) {
        calls.push({ method: 'patchDisplay', patch });
        return ok;
      },
      async appNext() {
        calls.push({ method: 'appNext' });
        return ok;
      },
      async appPrevious() {
        calls.push({ method: 'appPrevious' });
        return ok;
      },
    },
  };
};

test('AWTRIX NG matrix capability sends display power patch', async () => {
  const fake = createFakeClient();

  await runAwtrixNgMatrixPowerCapability(fake.client, false);

  assert.deepEqual(fake.calls, [{
    method: 'patchDisplay',
    patch: {
      power: false,
    },
  }]);
});

test('AWTRIX NG matrix capability rejects non-boolean values before HTTP', async () => {
  const fake = createFakeClient();

  await assert.rejects(
    () => runAwtrixNgMatrixPowerCapability(fake.client, 'false'),
    /Matrix capability value must be a boolean/,
  );
  assert.deepEqual(fake.calls, []);
});

test('AWTRIX NG weather overlay capability sends display overlay patch', async () => {
  const fake = createFakeClient();

  await runAwtrixNgWeatherOverlayCapability(fake.client, 'none');
  await runAwtrixNgWeatherOverlayCapability(fake.client, 'rain');

  assert.deepEqual(fake.calls, [{
    method: 'patchDisplay',
    patch: {
      overlay: null,
    },
  }, {
    method: 'patchDisplay',
    patch: {
      overlay: 'rain',
    },
  }]);
});

test('AWTRIX NG weather overlay capability rejects unsupported values before HTTP', async () => {
  const fake = createFakeClient();

  await assert.rejects(
    () => runAwtrixNgWeatherOverlayCapability(fake.client, 'clear'),
    /Expected one of: none, drizzle, frost, rain, snow, storm, thunder/,
  );
  assert.deepEqual(fake.calls, []);
});

test('AWTRIX NG next and previous app capabilities call app navigation helpers', async () => {
  const fake = createFakeClient();

  await runAwtrixNgNextAppCapability(fake.client);
  await runAwtrixNgPreviousAppCapability(fake.client);

  assert.deepEqual(fake.calls, [{
    method: 'appNext',
  }, {
    method: 'appPrevious',
  }]);
});
