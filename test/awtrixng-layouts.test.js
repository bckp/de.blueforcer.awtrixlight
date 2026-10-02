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
    assert.ok(['icon', 'header', 'text'].every((name) => card.args.some((argument) => argument.name === name)));
  }
});
