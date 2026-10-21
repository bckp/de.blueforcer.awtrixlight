const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const { createAwtrixNgHeaderLayout } = require('../.homeybuild/lib/awtrixng/Services/Layouts');
const { toAwtrixNgNotificationPayload, toAwtrixNgPushedAppPayload } = require('../.homeybuild/lib/awtrixng/Payload/Transformers');
const { runAwtrixNgNotificationRawAction, runAwtrixNgCustomAppRawAction } = require('../.homeybuild/drivers/awtrixng/flow-actions');

const caps = (width = 52, height = 16) => ({
  display: { width, height },
  fonts: [{ name: 'small' }, { name: 'matrix-light6' }],
  layouts: {
    version: 1,
    limits: {
      regions: 16, scrollers: 8, assets: 4, chartPoints: 128, textBytes: 8192,
    },
  },
  effects: ['Plasma'],
  overlays: ['Snow'],
  palettes: ['Rainbow'],
});
const page = (width = 52, height = 16) => ({
  layout: {
    version: 1,
    regions: [{
      id: 'title', box: [0, 0, width, height], text: 'Home', font: 'matrix-light6',
    }],
  },
});
const createApi = (capabilities, write = async () => ({ ok: true })) => {
  const calls = [];
  const client = new AwtrixNgClient({
    async request(request) {
      calls.push(request);
      return { status: 200, headers: {}, data: request.path === '/api/v1/capabilities' ? capabilities : await write(request) };
    },
  });
  return { api: new AwtrixNgApi(client, { baseUrl: 'http://192.0.2.41', icons: { emptyIcon: { id: '-', name: 'None' } } }), calls };
};
const assertField = (fn, field) => assert.throws(fn, (error) => error.field === field);

test('layout JSON accepts every region content and preserves the complete payload', () => {
  const input = {
    durationMs: 10000,
    repeat: 2,
    hold: false,
    layout: {
      version: 1,
      palette: 'Rainbow',
      regions: [
        {
          id: 'text', box: [17, 0, 35, 8], text: [{ text: 'Hello', color: '#FFFFFF' }], scroll: 'static', align: 'start',
        },
        { id: 'icon', box: [0, 0, 16, 16], icon: '1234' },
        {
          id: 'chart',
          box: [17, 8, 10, 8],
          chart: {
            values: [1, 2], type: 'bar', min: 0, max: 3,
          },
        },
        {
          id: 'progress', box: [28, 8, 10, 8], progress: 50, trackColor: '#202020',
        },
        {
          id: 'draw', box: [39, 8, 13, 8], draw: [['text', 0, 0, 'Hi']], font: 'small',
        },
      ],
    },
  };
  assert.deepEqual(toAwtrixNgNotificationPayload(input), input);
  const { hold, ...app } = input;
  assert.deepEqual(toAwtrixNgPushedAppPayload({ ...app, lifetimeMs: 60000 }), { ...app, lifetimeMs: 60000 });
});

test('layout JSON reports precise unknown, conflicting and malformed nested fields', () => {
  assertField(() => toAwtrixNgNotificationPayload({ ...page(), text: 'ignored?' }), 'text');
  assertField(() => toAwtrixNgNotificationPayload({ layout: { ...page().layout, typo: 1 } }), 'layout.typo');
  for (const [change, field] of [
    [{ fake: true }, 'fake'], [{ id: '' }, 'id'], [{ box: [0, 0, -1, 8] }, 'box'], [{ icon: '123' }, '<content>'],
    [{ align: 'left' }, 'align'], [{ scroll: { mode: 'fast' } }, 'scroll.mode'], [{ scroll: { gap: 32768 } }, 'scroll.gap'],
    [{ repeat: -1 }, 'repeat'], [{ text: [{ text: 'hi', typo: true }] }, 'text[0].typo'],
  ]) {
    const input = page();
    Object.assign(input.layout.regions[0], change);
    assertField(() => toAwtrixNgNotificationPayload(input), `layout.regions[0].${field}`);
  }
  const duplicate = page();
  duplicate.layout.regions.push({ ...duplicate.layout.regions[0] });
  assertField(() => toAwtrixNgNotificationPayload(duplicate), 'layout.regions[1].id');
  assertField(() => toAwtrixNgNotificationPayload({ layout: { version: 2, regions: [] } }), 'layout.version');
});

test('layout chart and background errors are rejected before any HTTP call', () => {
  const input = page();
  input.layout.regions = [{ id: 'chart', box: [0, 0, 20, 8], chart: { values: [1, 2], min: 0 } }];
  assertField(() => toAwtrixNgPushedAppPayload(input), 'layout.regions[0].chart.min');
  input.layout.regions[0].chart = { values: [1, 2], extra: true };
  assertField(() => toAwtrixNgPushedAppPayload(input), 'layout.regions[0].chart.extra');
  assertField(() => toAwtrixNgNotificationPayload({ layout: { ...page().layout, effect: 'Plasma', backgroundColor: '#000000' } }), 'layout.effect');
});

test('raw Flow layouts work on both 32x8 and 52x16 with live capability checks', async () => {
  for (const [width, height] of [[32, 8], [52, 16]]) {
    const { api, calls } = createApi(caps(width, height));
    const input = page(width, height);
    await runAwtrixNgNotificationRawAction({ device: { client: api }, options: JSON.stringify(input) });
    await runAwtrixNgCustomAppRawAction({ device: { client: api }, name: 'weather', options: JSON.stringify(input) });
    assert.deepEqual(calls.map((call) => call.path), ['/api/v1/capabilities', '/api/v1/notifications', '/api/v1/capabilities', '/api/v1/apps/pushed/homey-weather']);
    assert.deepEqual(calls[1].body, input);
    assert.deepEqual(calls[3].body, input);
  }
});

test('a 16-row layout is refused on an 8-row panel without sending a write', async () => {
  const { api, calls } = createApi(caps(32, 8));
  await assert.rejects(api.sendNotification(page()), (error) => error.field === 'layout.regions[0].box' && /32x8/.test(error.message));
  assert.equal(calls.length, 1);
});

test('layout support and fonts are explicit; older devices get a descriptive error', async () => {
  for (const capability of [{}, { ...caps(), layouts: { ...caps().layouts, version: 2 } }]) {
    const { api, calls } = createApi(capability);
    await assert.rejects(api.sendNotification(page()), (error) => error.field === 'layout');
    assert.equal(calls.length, 1);
  }
  const { api } = createApi({ ...caps(), fonts: [{ name: 'small' }] });
  await assert.rejects(api.putPushedApp('homey-test', page()), (error) => error.field === 'layout.regions[0].font');
  const malformed = createApi({ ...caps(), display: { width: '52', height: 16 } });
  await assert.rejects(malformed.api.sendNotification(page()), /layout limits/);
});

test('layout budgets, effects and palettes are checked against advertised limits', async () => {
  for (const limit of ['regions', 'scrollers', 'textBytes']) {
    const capability = caps();
    capability.layouts.limits[limit] = 0;
    const { api, calls } = createApi(capability);
    await assert.rejects(api.sendNotification(page()), new RegExp(`limit ${limit}`));
    assert.equal(calls.length, 1);
  }
  for (const field of ['effect', 'overlay', 'palette']) {
    const { api } = createApi(caps());
    await assert.rejects(api.sendNotification({ layout: { ...page().layout, [field]: 'unknown' } }), (error) => error.field === `layout.${field}`);
  }
  const { api } = createApi(caps());
  await api.sendNotification({
    layout: {
      ...page().layout, palette: 'Rainbow', effect: 'Plasma', overlay: 'Snow',
    },
  });
});

test('header preset fills 52x16 with two independent rows and supports omitting the icon', async () => {
  const input = {
    header: 'Weather', text: '21.5 C', icon: '1234', durationMs: 10000,
  };
  const payload = createAwtrixNgHeaderLayout(input);
  assert.deepEqual(payload.layout.regions.map((region) => region.box), [[0, 0, 16, 16], [17, 0, 35, 8], [17, 8, 35, 8]]);
  assert.equal(payload.layout.regions[1].scroll.mode, 'loop');
  assert.equal(payload.layout.regions[2].scroll.mode, 'loop');
  assert.deepEqual(createAwtrixNgHeaderLayout({ ...input, icon: '-' }).layout.regions.map((region) => region.box), [[0, 0, 52, 8], [0, 8, 52, 8]]);
  assert.throws(() => createAwtrixNgHeaderLayout({ ...input, durationMs: -1 }));
  const { api, calls } = createApi(caps());
  await api.sendHeaderNotification(input);
  await api.putHeaderApp('weather', input);
  assert.deepEqual(calls[1].body, payload);
  assert.equal(calls[3].path, '/api/v1/apps/pushed/homey-weather');
  const small = createApi(caps(32, 8));
  await assert.rejects(small.api.sendHeaderNotification(input), /32x8/);
});

test('layout HTTP errors propagate unchanged after capability validation', async () => {
  const error = Object.assign(new Error('Icon missing'), { httpStatus: 422, code: 'validationFailed', field: 'layout.regions[0].icon' });
  const { api } = createApi(caps(), async () => {
    throw error;
  });
  await assert.rejects(api.sendNotification(page()), (caught) => caught === error);
});

test('header cards require both layout and 16-row capabilities and expose the three content fields', () => {
  const manifest = JSON.parse(fs.readFileSync('drivers/awtrixng/driver.flow.compose.json', 'utf8'));
  for (const id of ['awtrixng_notification_header', 'awtrixng_application_header']) {
    const card = manifest.actions.find((entry) => entry.id === id);
    assert.equal(card.$filter, 'capabilities=awtrixng_layout,awtrixng_display_16px');
    assert.ok(['icon', 'header', 'text', 'color', 'options'].every((name) => card.args.some((argument) => argument.name === name)));
    assert.equal(card.args.find((arg) => arg.name === 'color').type, 'color');
    assert.equal(card.args.find((arg) => arg.name === 'color').required, false);
    assert.equal(card.args.find((arg) => arg.name === 'options').value, '{}');
    assert.equal(card.duration, true);
  }
});

test('header colors preserve black and legacy blue while short rows explicitly stay still', () => {
  const input = { header: 'Počasí', text: '21 °C', icon: '-' };
  const payload = createAwtrixNgHeaderLayout({ ...input, color: '#000000' });
  assert.equal(payload.layout.regions[0].color, '#000000');
  assert.equal(payload.layout.regions[1].color, '#FFFFFF');
  assert.equal(createAwtrixNgHeaderLayout(input).layout.regions[0].color, '#00AAFF');
  assert.equal(payload.repeat, 1);
  for (const region of payload.layout.regions) {
    assert.deepEqual(region.scroll, { mode: 'loop', whenFits: 'static' });
    assert.equal(region.valign, 'center');
    assert.equal(region.font, 'small');
  }
  for (const color of ['', '#FFF', 'palette', null, false]) assertField(() => createAwtrixNgHeaderLayout({ ...input, color }), 'color');
  assert.deepEqual(createAwtrixNgHeaderLayout({ header: '', text: '', icon: 'weather' }).layout.regions.map((region) => region.box),
    [[0, 0, 16, 16], [17, 0, 35, 8], [17, 8, 35, 8]]);
});

test('header timing honors explicit zero repeat and JSON duration without silently overriding Homey duration', () => {
  const input = { header: 'Title', text: 'Long text' };
  assert.equal(createAwtrixNgHeaderLayout(input).repeat, 1);
  const zero = createAwtrixNgHeaderLayout({ ...input, options: '{"repeat":0}' });
  assert.equal(zero.repeat, 0);
  assert.equal(zero.durationMs, undefined);
  for (const durationMs of [0, -1, 5000]) {
    const pageWithDuration = createAwtrixNgHeaderLayout({ ...input, options: JSON.stringify({ durationMs }) });
    assert.equal(pageWithDuration.durationMs, durationMs);
    assert.equal(pageWithDuration.repeat, undefined);
  }
  const duration = createAwtrixNgHeaderLayout({ ...input, durationMs: 5000 });
  assert.equal(duration.durationMs, 5000);
  assert.equal(duration.repeat, undefined);
  const minimum = createAwtrixNgHeaderLayout({ ...input, durationMs: 5000, options: '{"repeat":2}' });
  assert.equal(minimum.repeat, 2);
  assert.equal(minimum.durationMs, 5000);
  assertField(() => createAwtrixNgHeaderLayout({ ...input, durationMs: 5000, options: '{"durationMs":5000}' }), 'durationMs');
  for (const repeat of [-1, 1.5, null, '1']) assertField(() => createAwtrixNgHeaderLayout({ ...input, options: JSON.stringify({ repeat }) }), 'repeat');
});

test('header options reject every visual override and wrong target before HTTP, but preserve notification/app options', async () => {
  const input = { header: 'Title', text: 'Text', color: '#ff8800' };
  const { api, calls } = createApi(caps());
  for (const field of ['layout', 'text', 'icon', 'icons', 'iconGap', 'font', 'color', 'textColor', 'scroll', 'textAlign',
    'textCase', 'textBlinkMs', 'backgroundColor', 'effect', 'overlay', 'palette', 'draw', 'barChart', 'header', 'typo']) {
    await assert.rejects(api.sendHeaderNotification({ ...input, options: JSON.stringify({ [field]: null }) }),
      (error) => error.field === field && error.reason === 'unsupported-field');
  }
  for (const options of ['[]', 'null', 'false', 'broken']) await assert.rejects(api.sendHeaderNotification({ ...input, options }));
  for (const [field, value] of [['name', 42], ['soundRtttl', false], ['hold', 'true'], ['stack', null], ['durationMs', 1.5]]) {
    await assert.rejects(api.sendHeaderNotification({ ...input, options: JSON.stringify({ [field]: value }) }), (error) => error.field === field);
  }
  await assert.rejects(api.putHeaderApp('test', { ...input, options: '{"lifetimeMs":1.5}' }), (error) => error.field === 'lifetimeMs');
  await assert.rejects(api.sendHeaderNotification({ ...input, options: '{"lifetimeMs":5000}' }), (error) => error.field === 'lifetimeMs');
  await assert.rejects(api.putHeaderApp('test', { ...input, options: '{"name":"other"}' }), (error) => error.field === 'name');
  await assert.rejects(api.putHeaderApp('test', { ...input, options: '{"hold":true}' }), (error) => error.field === 'hold');
  assert.equal(calls.length, 0);
  const notify = {
    name: 'window', hold: true, stack: false, wakeup: false, repeat: 0,
  };
  await api.sendHeaderNotification({ ...input, options: JSON.stringify(notify) });
  assert.deepEqual(calls.at(-1).body, createAwtrixNgHeaderLayout({ ...input, options: JSON.stringify(notify) }));
  const lifetime = { lifetimeMs: 60000, lifetimeExpiry: 'mark' };
  await api.putHeaderApp('weather', { ...input, options: JSON.stringify(lifetime) });
  assert.equal(calls.at(-1).path, '/api/v1/apps/pushed/homey-weather');
  assert.equal(calls.at(-1).body.lifetimeMs, 60000);
  assert.equal(calls.at(-1).body.lifetimeExpiry, 'mark');
  assert.equal(calls.at(-1).body.hold, undefined);
});

test('header notification options pass supported sound objects through the existing audio validation', async () => {
  const capabilities = { ...caps(), audio: { rtttl: true, song: true, speech: true } };
  const { api, calls } = createApi(capabilities);
  await api.sendHeaderNotification({ header: 'Dveře', text: 'Otevřeno', options: '{"name":"door","sound":{"speech":"Door open"}}' });
  assert.deepEqual(calls.at(-1).body.sound, { speech: 'Door open' });
  assert.equal(calls.at(-1).body.name, 'door');
  const unsupportedAudio = createApi({ ...caps(), audio: { rtttl: true, song: true, speech: false } });
  await assert.rejects(unsupportedAudio.api.sendHeaderNotification({ header: 'Door', text: 'Open', options: '{"sound":{"speech":"Door open"}}' }),
    (error) => error.field === 'sound.speech');
  assert.equal(unsupportedAudio.calls.some((call) => call.method === 'POST'), false);
});
