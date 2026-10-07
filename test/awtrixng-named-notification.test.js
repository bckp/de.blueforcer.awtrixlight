const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const { AwtrixNgHttpError } = require('../.homeybuild/lib/awtrixng/Http/Transport');

const createApi = (response = { ok: true }, status = 200) => {
  const calls = [];
  const client = new AwtrixNgClient({
    async request(request) {
      calls.push(request);
      if (status >= 400) {
        throw new AwtrixNgHttpError({
          method: request.method, url: `http://192.0.2.10${request.path}`, status, rawBody: response, message: 'HTTP failure',
        });
      }
      return { status, headers: {}, data: response };
    },
  });
  return { calls, api: new AwtrixNgApi(client, { baseUrl: 'http://192.0.2.10', icons: { emptyIcon: { id: '-', name: 'None' } } }) };
};

test('named dismissal targets the named queue item, encodes the full name and keeps active dismissal separate', async () => {
  const { api, calls } = createApi();
  await api.dismissNamedNotification('backup-job');
  await api.dismissNamedNotification('Dveře / patro?');
  assert.deepEqual(calls, [
    { method: 'DELETE', path: '/api/v1/notifications/backup-job' },
    { method: 'DELETE', path: '/api/v1/notifications/Dve%C5%99e%20%2F%20patro%3F' },
  ]);
  await api.dismissActiveNotification();
  assert.equal(calls.at(-1).path, '/api/v1/notifications/active');
});

test('named dismissal rejects reserved or unsafe targets without deleting the active notification', async () => {
  const { api, calls } = createApi();
  for (const name of ['', 'active', '.', '..', undefined, 0, null]) await assert.rejects(api.dismissNamedNotification(name), TypeError);
  assert.equal(calls.length, 0);
});

test('a disappeared queued notification remains a native 404 error and malformed success is rejected', async () => {
  const missing = createApi({ error: { code: 'notFound', message: 'no queued notification with this name', field: 'name' } }, 404);
  await assert.rejects(missing.api.dismissNamedNotification('backup-job'), (error) => (
    error.httpStatus === 404 && error.code === 'notFound' && error.field === 'name' && /queued notification/.test(error.message)
  ));
  assert.equal(missing.calls.length, 1);
  assert.equal(missing.calls[0].path, '/api/v1/notifications/backup-job');
  await assert.rejects(createApi({}).api.dismissNamedNotification('backup-job'), (error) => error.endpoint.endsWith('/backup-job'));
});

test('named notification Flow is scoped to NG and forwards the exact name and failure', async () => {
  const originalLoad = Module._load;
  let Driver;
  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') return { Driver: class {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const modulePath = require.resolve('../.homeybuild/drivers/awtrixng/driver');
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    Driver = require('../.homeybuild/drivers/awtrixng/driver');
  } finally {
    Module._load = originalLoad;
  }
  let run;
  const driver = new Driver();
  driver.log = () => {};
  driver.homey = {
    flow: {
      getDeviceTriggerCard: () => ({}),
      getActionCard: (id) => ({
        registerRunListener(listener) {
          if (id === 'awtrixng_notification_dismiss_named') run = listener;
        },
        registerArgumentAutocompleteListener() {},
      }),
    },
  };
  await driver.onInit();
  const fake = createApi();
  await run({ device: { dismissNamedNotification: (name) => fake.api.dismissNamedNotification(name) }, name: 'backup-job' });
  assert.equal(fake.calls[0].path, '/api/v1/notifications/backup-job');
  const failure = new Error('offline');
  await assert.rejects(run({
    device: {
      dismissNamedNotification: async () => {
        throw failure;
      },
    },
    name: 'backup-job',
  }), (error) => error === failure);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8'));
  const card = manifest.flow.actions.find((item) => item.id === 'awtrixng_notification_dismiss_named');
  assert.equal(card.args.find((arg) => arg.name === 'device').filter, 'driver_id=awtrixng');
  assert.equal(card.args.find((arg) => arg.name === 'name').type, 'text');
});
