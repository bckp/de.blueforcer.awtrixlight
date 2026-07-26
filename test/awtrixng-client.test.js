const assert = require('node:assert/strict');
const test = require('node:test');

const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const { AwtrixNgApiError } = require('../.homeybuild/lib/awtrixng/Api/ErrorParser');
const { AwtrixNgHttpError } = require('../.homeybuild/lib/awtrixng/Http/Transport');

const ok = { ok: true };

class FakeTransport {

  calls = [];

  responseData = ok;

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

const createClient = () => {
  const transport = new FakeTransport();

  return {
    client: new AwtrixNgClient(transport),
    transport,
  };
};

test('AWTRIX NG client maps read endpoints to /api/v1 routes', async () => {
  const { client, transport } = createClient();
  const settingsResponse = {
    autoBrightness: false,
    brightness: 120,
  };
  const displayResponse = {
    power: true,
    brightness: 120,
    overlay: null,
    overlaySettings: {
      speed: 100,
      palette: null,
      blend: true,
    },
    moodlight: null,
  };

  transport.responseData = { version: '1.0.4-dev' };
  assert.deepEqual(await client.getVersion(), { version: '1.0.4-dev' });

  transport.responseData = { uid: 'abc', version: '1.0.4-dev' };
  assert.deepEqual(await client.getDevice(), { uid: 'abc', version: '1.0.4-dev' });

  transport.responseData = { effects: ['Matrix'] };
  assert.deepEqual(await client.getCapabilities(), { effects: ['Matrix'] });

  transport.responseData = settingsResponse;
  assert.deepEqual(await client.getSettings(), settingsResponse);

  transport.responseData = displayResponse;
  assert.deepEqual(await client.getDisplay(), displayResponse);

  assert.deepEqual(transport.calls, [{
    method: 'GET',
    path: '/api/v1/version',
  }, {
    method: 'GET',
    path: '/api/v1/device',
  }, {
    method: 'GET',
    path: '/api/v1/capabilities',
  }, {
    method: 'GET',
    path: '/api/v1/settings',
  }, {
    method: 'GET',
    path: '/api/v1/display',
  }]);
});

test('AWTRIX NG client maps settings and display writes', async () => {
  const { client, transport } = createClient();
  const settingsResponse = {
    autoBrightness: true,
    brightness: 80,
  };

  transport.responseData = settingsResponse;
  assert.deepEqual(await client.patchSettings({
    autoBrightness: true,
    brightness: 80,
  }), settingsResponse);

  transport.responseData = ok;
  assert.deepEqual(await client.patchDisplay({ power: false }), ok);
  assert.deepEqual(await client.patchDisplay({ overlay: null }), ok);
  assert.deepEqual(await client.patchDisplay({ overlay: 'rain' }), ok);

  assert.deepEqual(transport.calls, [{
    method: 'PATCH',
    path: '/api/v1/settings',
    body: {
      autoBrightness: true,
      brightness: 80,
    },
  }, {
    method: 'PATCH',
    path: '/api/v1/display',
    body: {
      power: false,
    },
  }, {
    method: 'PATCH',
    path: '/api/v1/display',
    body: {
      overlay: null,
    },
  }, {
    method: 'PATCH',
    path: '/api/v1/display',
    body: {
      overlay: 'rain',
    },
  }]);
});

test('AWTRIX NG client maps notification routes', async () => {
  const { client, transport } = createClient();

  assert.deepEqual(await client.sendNotification({
    text: 'Hello',
    durationMs: 5000,
    hold: true,
  }), ok);
  assert.deepEqual(await client.dismissActiveNotification(), ok);

  assert.deepEqual(transport.calls, [{
    method: 'POST',
    path: '/api/v1/notifications',
    body: {
      text: 'Hello',
      durationMs: 5000,
      hold: true,
    },
  }, {
    method: 'DELETE',
    path: '/api/v1/notifications/active',
  }]);
});

test('AWTRIX NG client maps indicator set and clear routes', async () => {
  const { client, transport } = createClient();

  assert.deepEqual(await client.putIndicator(2, {
    color: '#FF0000',
    blinkMs: 500,
  }), ok);
  assert.deepEqual(await client.deleteIndicator(2), ok);

  assert.deepEqual(transport.calls, [{
    method: 'PUT',
    path: '/api/v1/indicators/2',
    body: {
      color: '#FF0000',
      blinkMs: 500,
    },
  }, {
    method: 'DELETE',
    path: '/api/v1/indicators/2',
  }]);
});

test('AWTRIX NG client maps app inventory and order routes', async () => {
  const { client, transport } = createClient();
  const appsResponse = [{
    name: 'Time',
    inLoop: true,
    position: 0,
    origin: 'builtin',
  }, {
    name: 'homey-weather',
    inLoop: true,
    position: 1,
    origin: 'pushed',
    icon: '1',
  }, {
    name: 'clock',
    inLoop: false,
    position: null,
    origin: 'script',
    skipped: false,
    error: null,
    meta: {
      name: 'Wall Clock',
      desc: '',
      author: 'me',
      version: '1.2',
    },
  }];

  transport.responseData = appsResponse;
  assert.deepEqual(await client.getApps(), appsResponse);

  transport.responseData = ok;
  assert.deepEqual(await client.putAppsOrder(['Time', 'homey-weather', 'Date']), ok);

  assert.deepEqual(transport.calls, [{
    method: 'GET',
    path: '/api/v1/apps',
  }, {
    method: 'PUT',
    path: '/api/v1/apps/order',
    body: {
      order: ['Time', 'homey-weather', 'Date'],
    },
  }]);
});

test('AWTRIX NG client maps sounds, apps and reboot routes', async () => {
  const { client, transport } = createClient();

  assert.deepEqual(await client.playRtttl('beep:d=4,o=5,b=120:c'), ok);
  assert.deepEqual(await client.putPushedApp('weather', {
    text: '21C',
    lifetimeMs: 60000,
  }), ok);
  assert.deepEqual(await client.deleteApp('weather'), ok);
  assert.deepEqual(await client.appNext(), ok);
  assert.deepEqual(await client.appPrevious(), ok);
  assert.deepEqual(await client.reboot(), ok);

  assert.deepEqual(transport.calls, [{
    method: 'POST',
    path: '/api/v1/sounds/play',
    body: {
      rtttl: 'beep:d=4,o=5,b=120:c',
    },
  }, {
    method: 'PUT',
    path: '/api/v1/apps/pushed/weather',
    body: {
      text: '21C',
      lifetimeMs: 60000,
    },
  }, {
    method: 'DELETE',
    path: '/api/v1/apps/weather',
  }, {
    method: 'POST',
    path: '/api/v1/apps/next',
  }, {
    method: 'POST',
    path: '/api/v1/apps/previous',
  }, {
    method: 'POST',
    path: '/api/v1/device/reboot',
  }]);
});

test('AWTRIX NG client maps files list and upload routes', async () => {
  const { client, transport } = createClient();
  const filesResponse = {
    files: [{ name: 'homey.gif', size: 123 }],
    usedBytes: 123,
    totalBytes: 1048576,
  };
  const uploadBody = { multipart: true };

  transport.responseData = filesResponse;
  assert.deepEqual(await client.listFiles('/ICONS'), filesResponse);

  transport.responseData = ok;
  assert.deepEqual(await client.uploadFile({
    dir: '/ICONS',
    body: uploadBody,
  }), ok);

  assert.deepEqual(transport.calls, [{
    method: 'GET',
    path: '/api/v1/files',
    query: {
      dir: '/ICONS',
    },
  }, {
    method: 'POST',
    path: '/api/v1/files',
    query: {
      dir: '/ICONS',
    },
    body: uploadBody,
  }]);
});

test('AWTRIX NG client does not call AWTRIX 3 endpoints', async () => {
  const { client, transport } = createClient();

  await client.getDevice();
  await client.getSettings();
  await client.getDisplay();
  await client.sendNotification({ text: 'Hello' });
  await client.deleteIndicator(1);
  await client.listFiles('/ICONS');

  const forbiddenAwtrix3Paths = new Set([
    '/api/stats',
    '/api/settings',
    '/api/notify',
    '/api/notify/dismiss',
    '/api/custom',
    '/api/indicator1',
    '/api/indicator2',
    '/api/indicator3',
    '/api/rtttl',
    '/api/power',
    '/list',
    '/edit',
  ]);

  for (const call of transport.calls) {
    assert.equal(forbiddenAwtrix3Paths.has(call.path), false, call.path);
    assert.equal(call.path.startsWith('/api/v1/'), true, call.path);
  }
});

test('AWTRIX NG client converts transport HTTP errors to AWTRIX NG API errors', async () => {
  const { client, transport } = createClient();
  const rawBody = {
    error: {
      code: 'validationFailed',
      message: 'out of range',
      field: 'brightness',
    },
  };

  transport.error = new AwtrixNgHttpError({
    method: 'PATCH',
    url: 'http://awtrix-ng.local/api/v1/settings',
    message: 'Request failed with status code 422',
    status: 422,
    headers: {
      'content-type': 'application/json',
    },
    rawBody,
  });

  try {
    await client.patchSettings({ brightness: 999 });
    assert.fail('Expected client request to throw');
  } catch (error) {
    assert.equal(error instanceof AwtrixNgApiError, true);
    assert.equal(error.protocol, 'awtrix-ng');
    assert.equal(error.httpStatus, 422);
    assert.equal(error.code, 'validationFailed');
    assert.equal(error.message, 'out of range');
    assert.equal(error.field, 'brightness');
    assert.equal(error.rawBody, rawBody);
  }
});
