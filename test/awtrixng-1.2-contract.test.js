const assert = require('node:assert/strict');
const test = require('node:test');
const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const { AwtrixNgHttpError } = require('../.homeybuild/lib/awtrixng/Http/Transport');
const { toAwtrixNgNotificationPayload, toAwtrixNgPushedAppPayload } = require('../.homeybuild/lib/awtrixng/Payload/Transformers');

// Documentation snapshot, 2026-10-05: TC002 1.2.0 HTTP, payload and device references.
// Synthetic fixtures; this does not claim verification against a physical 1.2.0 clock.
const script = (name, extra = {}) => ({
  name, origin: 'script', present: true, enabled: true, headless: false, error: null, ...extra,
});
const createApi = (overrides = {}) => {
  const calls = [];
  const routes = {
    'GET /api/v1/version': { version: '1.2.0' },
    'GET /api/v1/capabilities': { platform: { id: 'tc002' }, sensors: { light: false }, audio: { song: true, rtttl: true } },
    'GET /api/v1/device': { scriptingRunning: true },
    'GET /api/v1/apps': [script('Racer', { ondemand: true })],
    'POST /api/v1/notifications': { ok: true },
    'PUT /api/v1/apps/pushed/test': { ok: true },
    'PUT /api/v1/apps/active': { ok: true },
    'PATCH /api/v1/settings': { autoBrightness: true },
    ...overrides,
  };
  const client = new AwtrixNgClient({
    async request(request) {
      calls.push(request);
      const route = routes[`${request.method} ${request.path}`];
      if (route === undefined) throw new Error(`Unexpected route: ${request.path}`);
      const data = typeof route === 'function' ? route(request) : route;
      if (data.responseStatus !== undefined) {
        throw new AwtrixNgHttpError({
          method: request.method, url: `http://192.0.2.10${request.path}`, message: 'HTTP error', status: data.responseStatus, rawBody: data.body,
        });
      }
      return { status: 200, headers: {}, data };
    },
  });
  return { api: new AwtrixNgApi(client, { baseUrl: 'http://192.0.2.10', icons: { emptyIcon: { name: 'None', id: '-' } } }), calls };
};

test('1.2.0 sends native textAlign and adapts legacy centering without mutating input', async () => {
  for (const textAlign of ['start', 'center', 'end']) {
    const { api, calls } = createApi();
    const page = {
      text: '21 C', icon: 'weather', textAlign, scroll: { mode: 'static' },
    };
    await api.sendNotification(toAwtrixNgNotificationPayload(page));
    assert.deepEqual(calls.at(-1).body, page);
    await api.putPushedApp('test', toAwtrixNgPushedAppPayload(page));
    assert.deepEqual(calls.at(-1).body, page);
  }
  for (const textCenter of [true, false]) {
    const { api, calls } = createApi();
    const input = Object.freeze({ text: 'A', textCenter });
    await api.sendNotification(input);
    assert.deepEqual(calls.at(-1).body, { text: 'A', textAlign: textCenter ? 'center' : 'start' });
    await api.putPushedApp('test', input);
    assert.deepEqual(calls.at(-1).body, { text: 'A', textAlign: textCenter ? 'center' : 'start' });
    assert.deepEqual(input, { text: 'A', textCenter });
  }
  const audio = createApi();
  await audio.api.sendNotification({ textCenter: false, soundRtttl: 'beep:d=4,o=5,b=120:c', soundLoop: true });
  assert.deepEqual(audio.calls.at(-1).body, {
    textAlign: 'start', sound: { rtttl: 'beep:d=4,o=5,b=120:c', loop: true },
  });
});

test('alignment validates conflicts, preserves older centering and never emulates textAlign', async () => {
  for (const transform of [toAwtrixNgNotificationPayload, toAwtrixNgPushedAppPayload]) {
    for (const textAlign of ['left', '', 0, null]) assert.throws(() => transform({ textAlign }), (error) => error.field === 'textAlign');
    assert.throws(() => transform({ textAlign: 'center', textCenter: true }), (error) => error.field === 'textAlign');
  }
  for (const version of ['1.1.2', '1.1.6']) {
    const { api, calls } = createApi({ 'GET /api/v1/version': { version } });
    await api.sendNotification({ textCenter: false });
    assert.deepEqual(calls.at(-1).body, { textCenter: false });
    await assert.rejects(api.putPushedApp('test', { textAlign: 'end' }), (error) => error.field === 'textAlign' && error.reason === 'unsupported-field');
    assert.equal(calls.some((call) => call.method === 'PUT'), false);
  }
  const beta = createApi({ 'GET /api/v1/version': { version: '1.1.7' } });
  await beta.api.sendNotification({ textCenter: false });
  assert.deepEqual(beta.calls.at(-1).body, { textAlign: 'start' });
  const invalid = createApi({ 'GET /api/v1/version': { version: 'unknown' } });
  await assert.rejects(invalid.api.sendNotification({ textAlign: 'end' }), (error) => error.endpoint === '/api/v1/version');
  assert.equal(invalid.calls.some((call) => call.method === 'POST'), false);
});

test('positioned icons and gap work from 1.1.2 and validate the complete request', async () => {
  const page = { iconGap: 0, icons: [{ icon: 'weather', x: -65535, y: 65535 }] };
  for (const version of ['1.1.2', '1.2.0']) {
    const { api, calls } = createApi({ 'GET /api/v1/version': { version } });
    await api.sendNotification(page);
    await api.putPushedApp('test', page);
    assert.deepEqual(calls.at(-1).body, page);
    await api.putPushedApp('test', { icons: [] });
    assert.deepEqual(calls.at(-1).body, { icons: [] });
  }
  const old = createApi({ 'GET /api/v1/version': { version: '1.1.1' } });
  await assert.rejects(old.api.sendNotification(page), (error) => error.field === 'iconGap');
  assert.equal(old.calls.some((call) => call.method === 'POST'), false);
  for (const [input, field] of [[{ icons: [null] }, 'icons[0]'], [{ iconGap: '0' }, 'iconGap']]) {
    assert.throws(() => toAwtrixNgNotificationPayload(input), (error) => error.field === field && error.reason === 'invalid-value');
  }
});

test('1.2.0 selection includes on-demand scripts and excludes modules, background, errors and wrong panels', async () => {
  const apps = [
    script('Racer', { ondemand: true }), script('Weather'),
    script('Module', { origin: 'module' }), script('Background', { headless: true }),
    script('Off', { enabled: false }), script('Gone', { present: false }),
    script('Broken', { error: { message: 'syntax error', line: 12 } }),
    script('WrongPanel', { meta: { display: { width: 32, height: 8, fits: false } } }),
    { name: 'Time', origin: 'builtin', enabled: true },
  ];
  const { api, calls } = createApi({ 'GET /api/v1/apps': apps });
  assert.deepEqual((await api.readSelectableScripts()).map((app) => app.name), ['Racer', 'Weather']);
  await api.showScript('Racer');
  assert.deepEqual(calls.at(-1), { method: 'PUT', path: '/api/v1/apps/active', body: { name: 'Racer', fast: true } });
  for (const name of ['Module', 'Background', 'Off', 'Gone', 'Broken', 'WrongPanel', 'Time', 'Missing', '../Racer']) {
    await assert.rejects(api.showScript(name));
  }
  assert.equal(calls.filter((call) => call.method === 'PUT').length, 1);
  assert.equal(calls.some((call) => call.path.includes('/script/')), false, 'selection never reads script source');
});

test('script selection checks live state and preserves native failure details', async () => {
  const disabled = createApi({ 'GET /api/v1/device': { scriptingRunning: false } });
  await assert.rejects(disabled.api.showScript('Racer'), /disabled/);
  assert.equal(disabled.calls.some((call) => call.method === 'PUT'), false);
  const invalid = createApi({ 'GET /api/v1/apps': { apps: [] } });
  await assert.rejects(invalid.api.readSelectableScripts(), (error) => error.endpoint === '/api/v1/apps');
  for (const device of [{}, []]) {
    const malformed = createApi({ 'GET /api/v1/device': device });
    await assert.rejects(malformed.api.readSelectableScripts(), (error) => error.endpoint === '/api/v1/device');
  }
  const busy = createApi({
    'PUT /api/v1/apps/active': {
      responseStatus: 503, body: { error: { code: 'serviceBusy', message: 'Download running', field: 'name' } },
    },
  });
  await assert.rejects(busy.api.showScript('Racer'), (error) => error.httpStatus === 503 && error.code === 'serviceBusy' && error.field === 'name' && error.message === 'Download running');
});

test('TC002 rejects automatic brightness before any settings or app-order write', async () => {
  const { api, calls } = createApi();
  await assert.rejects(api.applySettingsChange({ autoBrightness: true, showBuiltinTime: true }, ['autoBrightness', 'showBuiltinTime']), (error) => error.field === 'autoBrightness');
  assert.deepEqual(calls.map((call) => call.method), ['GET']);
  const invalid = createApi({ 'GET /api/v1/capabilities': [] });
  await assert.rejects(invalid.api.applySettingsChange({ autoBrightness: true }, ['autoBrightness']), (error) => error.endpoint === '/api/v1/capabilities');
  const tc001 = createApi({ 'GET /api/v1/capabilities': { platform: { id: 'tc001' }, sensors: { light: true } } });
  await tc001.api.applySettingsChange({ autoBrightness: true }, ['autoBrightness']);
  assert.deepEqual(tc001.calls.at(-1).body, { autoBrightness: true });
});
