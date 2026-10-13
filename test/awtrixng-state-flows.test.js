const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeHomey } = require('./helpers/fake-homey');
const { AwtrixNgStateFlowCardIds, createAwtrixNgStateFlowEvents, readAwtrixNgObservedAudio } = require('../.homeybuild/lib/awtrixng/Services/StateFlows');
const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const Client = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const { AwtrixNgHttpError } = require('../.homeybuild/lib/awtrixng/Http/Transport');

const all = {
  application: true, audio: true, radio: true, error: true,
};
const idle = () => ({
  uid: 'clock',
  uptime: 10,
  application: 'Time',
  audio: { alert: { playing: false, name: '', error: '' }, app: { playing: false, name: '', error: '' } },
  radio: {
    playing: false, station: '', title: '', error: '',
  },
});

test('state observations baseline startup and reboot, preserve empty apps, and report playback and radio metadata changes', () => {
  const before = idle();
  const after = idle();
  after.uptime = 11;
  after.application = '';
  after.audio.alert = { playing: true, name: 'ding', error: '' };
  after.radio = {
    playing: true, station: 'News', title: 'Track', error: '',
  };
  assert.deepEqual(createAwtrixNgStateFlowEvents(undefined, after, all), []);
  assert.deepEqual(createAwtrixNgStateFlowEvents(before, before, all), []);
  const events = createAwtrixNgStateFlowEvents(before, after, all);
  assert.deepEqual(events.map((event) => event.card), ['application', 'audio', 'radio']);
  assert.deepEqual(events[0].tokens, { application: '', previous: 'Time' });
  assert.equal(events[1].tokens.playing, true);
  assert.equal(events[2].tokens.station, 'News');
  const stop = idle();
  stop.uptime = 12;
  assert.equal(createAwtrixNgStateFlowEvents(after, stop, all).find((event) => event.card === 'audio').tokens.playing, false);
  const metadata = { ...after, radio: { ...after.radio, title: 'Next track' } };
  assert.deepEqual(createAwtrixNgStateFlowEvents(after, metadata, all).map((event) => event.card), ['radio']);
  assert.deepEqual(createAwtrixNgStateFlowEvents(after, { ...after, uid: 'another' }, all), []);
  assert.deepEqual(createAwtrixNgStateFlowEvents(after, { ...after, uptime: 0 }, all), []);
});

test('errors report new nonempty messages once, clear without events, and can recur after a successful playback', () => {
  const before = idle();
  const failed = idle();
  failed.audio.app.error = 'HTTP 404';
  failed.radio.error = 'connection failed';
  const errors = createAwtrixNgStateFlowEvents(before, failed, all);
  assert.deepEqual(errors, [
    { card: 'error', tokens: { group: 'app', error: 'HTTP 404' } },
    { card: 'error', tokens: { group: 'radio', error: 'connection failed' } },
  ]);
  assert.deepEqual(createAwtrixNgStateFlowEvents(failed, failed, all), []);
  assert.deepEqual(createAwtrixNgStateFlowEvents(failed, before, all), []);
  assert.equal(createAwtrixNgStateFlowEvents(before, failed, all).length, 2);
  assert.deepEqual(createAwtrixNgStateFlowEvents(before, failed, { ...all, error: false }), []);
  for (const malformed of [null, { alert: {} }, { ...before.audio, radio: { playing: false, error: '' } }]) {
    assert.throws(() => readAwtrixNgObservedAudio(malformed, true, true), (error) => error.endpoint === '/api/v1/audio');
  }
  assert.deepEqual(readAwtrixNgObservedAudio(before.audio, true, false), { audio: before.audio });
});

const createApi = () => {
  const calls = [];
  const state = {
    device: {
      uid: 'clock', version: '1.2.0', boardType: 'awtrixng', ipAddress: '192.0.2.10', matrixPower: true, currentApp: 'Time', indicators: [], uptimeSeconds: 10,
    },
    caps: { audio: { rtttl: true, song: true, radio: true } },
    audio: { ...idle().audio, radio: idle().radio },
  };
  const api = new AwtrixNgApi(new Client({
    async request(request) {
      calls.push(request);
      if (state.failure) throw state.failure;
      const data = { '/api/v1/device': state.device, '/api/v1/capabilities': state.caps, '/api/v1/audio': state.audio }[request.path];
      assert.ok(data, request.path);
      return { status: 200, headers: {}, data };
    },
  }), { baseUrl: 'http://192.0.2.10', icons: { emptyIcon: { id: '-', name: 'None' } } });
  return { api, calls, state };
};

test('state facade verifies identity, scopes reads to subscribed domains and checks audio capabilities', async () => {
  const fake = createApi();
  const appOnly = {
    application: true, audio: false, radio: false, error: false,
  };
  assert.deepEqual(await fake.api.readStateFlowSnapshot('clock', appOnly), { uid: 'clock', uptime: 10, application: 'Time' });
  assert.deepEqual(fake.calls.map((call) => call.path), ['/api/v1/device']);
  await assert.rejects(fake.api.readStateFlowSnapshot('other', all), /identity/i);
  const observed = await fake.api.readStateFlowSnapshot('clock', all);
  assert.deepEqual(observed, idle());
  fake.state.caps.audio.radio = false;
  const count = fake.calls.filter((call) => call.path === '/api/v1/audio').length;
  await assert.rejects(fake.api.readStateFlowSnapshot('clock', all), /no internet radio/);
  assert.equal(fake.calls.filter((call) => call.path === '/api/v1/audio').length, count);
  assert.equal((await fake.api.readStateFlowSnapshot('clock', { ...all, radio: false })).radio, undefined);
  fake.state.caps = { audio: { synth: true } };
  await assert.rejects(fake.api.readStateFlowSnapshot('clock', { ...all, radio: false }), /group API/);
  fake.state.failure = new AwtrixNgHttpError({
    method: 'GET', url: 'http://192.0.2.10/api/v1/device', status: 503, message: 'busy', rawBody: { error: { code: 'serviceBusy', message: 'busy', field: 'device' } },
  });
  await assert.rejects(fake.api.readStateFlowSnapshot('clock', appOnly), (error) => error.httpStatus === 503 && error.code === 'serviceBusy' && error.field === 'device');
});

const harness = () => {
  const originalLoad = Module._load;
  let Device;
  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') return { Device: class {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const file = require.resolve('../.homeybuild/drivers/awtrixng/device');
    delete require.cache[file];
    // eslint-disable-next-line global-require
    Device = require('../.homeybuild/drivers/awtrixng/device');
  } finally {
    Module._load = originalLoad;
  }
  const homey = createFakeHomey();
  const events = [];
  const errors = [];
  const state = {
    subscriptions: { ...all }, next: idle(), calls: 0, argumentReads: 0,
  };
  for (const [key, id] of Object.entries(AwtrixNgStateFlowCardIds)) {
    const card = homey.flow.getDeviceTriggerCard(id);
    card.getArgumentValues = async () => {
      state.argumentReads += 1;
      return state.subscriptions[key] ? [{}] : [];
    };
    card.trigger = async (device, tokens) => {
      events.push({ id, tokens }); if (state.triggerFailure) throw state.triggerFailure;
    };
  }
  const api = {
    async readStateFlowSnapshot() {
      state.calls += 1; if (state.failure) throw state.failure; return typeof state.next === 'function' ? state.next() : structuredClone(state.next);
    },
  };
  const device = new Device();
  Object.assign(device, {
    homey, api, getData: () => ({ id: 'clock' }), error: (error) => errors.push(error), log: () => {}, clearOwnedButtonCallbackOnDelete: async () => {},
  });
  return {
    device, state, events, errors, homey, api,
  };
};

test('state poll makes no reads without Flow, suppresses subscription baselines and resets after an outage', async () => {
  const {
    device, state, events, errors, homey,
  } = harness();
  state.subscriptions = {
    application: false, audio: false, radio: false, error: false,
  };
  await device.startStateFlowPoll();
  await homey.tick(5000);
  assert.equal(state.calls, 0);
  state.subscriptions.application = true;
  homey.flow.getDeviceTriggerCard(AwtrixNgStateFlowCardIds.application).emit('update');
  await device.stateFlowSubscriptionSync;
  await homey.tick(5000);
  assert.equal(events.length, 0);
  state.next.application = 'homey-weather';
  await homey.tick(5000);
  assert.deepEqual(events[0], { id: 'awtrixng_app_changed', tokens: { application: 'homey-weather', previous: 'Time' } });
  await homey.tick(5000);
  assert.equal(events.length, 1);
  state.failure = new Error('offline');
  await homey.tick(5000);
  assert.equal(errors[0], state.failure);
  state.failure = undefined;
  state.next.application = 'Date';
  await homey.tick(5000);
  assert.equal(events.length, 1, 'reconnection establishes a baseline');
  state.next.application = '';
  await homey.tick(5000);
  assert.equal(events.length, 2);
  state.subscriptions.audio = true;
  homey.flow.getDeviceTriggerCard(AwtrixNgStateFlowCardIds.audio).emit('update');
  await device.stateFlowSubscriptionSync;
  state.next.audio.alert.playing = true;
  await homey.tick(5000);
  assert.equal(events.length, 2, 'new subscriptions baseline the snapshot');
  await device.onDeleted();
  const count = state.calls;
  await homey.tick(10000);
  assert.equal(state.calls, count);
});

test('connection replacement or deletion discards in-flight observations; Flow failure does not replay the event', async () => {
  for (const operation of ['replace', 'delete']) {
    const {
      device, state, events, api,
    } = harness();
    await device.startStateFlowPoll();
    await device.refreshStateFlows();
    let resolve;
    state.next = () => new Promise((done) => {
      resolve = done;
    });
    const pending = device.refreshStateFlows();
    while (!resolve) await Promise.resolve();
    if (operation === 'replace') device.activateApi(api);
    else await device.onDeleted();
    resolve({ ...idle(), application: 'Date' });
    await pending;
    assert.equal(events.length, 0);
  }
  const {
    device, state, events, errors,
  } = harness();
  await device.startStateFlowPoll();
  await device.refreshStateFlows();
  state.next.application = 'Date';
  state.triggerFailure = new Error('Flow failed');
  await device.refreshStateFlows();
  await device.refreshStateFlows();
  assert.equal(events.length, 1);
  assert.equal(errors[0], state.triggerFailure);
});

test('state trigger manifest exposes typed tokens with NG/audio/radio device filters', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8'));
  for (const [key, id] of Object.entries(AwtrixNgStateFlowCardIds)) {
    const card = manifest.flow.triggers.find((item) => item.id === id);
    assert.ok(card.title.cs && card.hint.cs);
    const { filter } = card.args[0];
    assert.ok(filter.startsWith('driver_id=awtrixng'));
    if (key === 'radio') assert.ok(filter.includes('awtrixng_audio_radio'));
    if (key === 'audio' || key === 'error') assert.ok(filter.includes('awtrixng_audio_groups'));
    const tokenName = {
      application: 'application', error: 'error', audio: 'playing', radio: 'playing',
    }[key];
    const tokenType = key === 'audio' || key === 'radio' ? 'boolean' : 'string';
    assert.equal(card.tokens.find((token) => token.name === tokenName).type, tokenType);
  }
});

test('state subscriptions only read at init and update, stop when empty, and release listeners on deletion', async () => {
  const { device, state, homey } = harness();
  state.subscriptions = {
    application: false, audio: false, radio: false, error: false,
  };
  await device.startStateFlowPoll();
  assert.equal(state.argumentReads, 4);
  assert.equal(homey.setIntervalCalls.length, 0);
  await homey.tick(60000);
  assert.equal(state.argumentReads, 4);
  const card = homey.flow.getDeviceTriggerCard(AwtrixNgStateFlowCardIds.application);
  state.subscriptions.application = true;
  card.emit('update');
  await device.stateFlowSubscriptionSync;
  assert.equal(state.argumentReads, 8);
  assert.equal(device.stateFlowPoll.isActive(), true);
  await homey.tick(15000);
  assert.equal(state.calls, 3);
  assert.equal(state.argumentReads, 8);
  state.subscriptions.application = false;
  card.emit('update');
  await device.stateFlowSubscriptionSync;
  assert.equal(device.stateFlowPoll.isActive(), false);
  await homey.tick(15000);
  assert.equal(state.calls, 3);
  await device.onDeleted();
  for (const id of Object.values(AwtrixNgStateFlowCardIds)) assert.equal(homey.flow.getDeviceTriggerCard(id).listenerCount('update'), 0);
  const reads = state.argumentReads;
  card.emit('update');
  await device.stateFlowSubscriptionSync;
  assert.equal(state.argumentReads, reads);
});

test('deletion stops all polling before awaiting callback cleanup and drops an in-flight subscription sync', async () => {
  const { device, homey } = harness();
  await device.startStateFlowPoll();
  const order = [];
  device.poll = { stop: () => order.push('stop') };
  let release;
  device.clearOwnedButtonCallbackOnDelete = () => new Promise((resolve) => {
    order.push('cleanup'); release = resolve;
  });
  const pending = device.onDeleted();
  assert.deepEqual(order, ['stop', 'cleanup']);
  assert.equal(device.stateFlowPoll.isActive(), false);
  await homey.tick(10000);
  release();
  await pending;
});

test('restoring polling catches subscription errors, recovers on update, and never restarts deleted devices', async () => {
  const { device, homey, errors } = harness();
  const card = homey.flow.getDeviceTriggerCard(AwtrixNgStateFlowCardIds.application);
  const read = card.getArgumentValues;
  const failure = new Error('SDK unavailable');
  card.getArgumentValues = async () => {
    throw failure;
  };
  device.poll = { isActive: () => true, stop: () => {} };
  device.ensurePollingStarted();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(errors, [failure]);
  card.getArgumentValues = read;
  card.emit('update');
  await device.stateFlowSubscriptionSync;
  assert.equal(device.stateFlowPoll.isActive(), true);
  await device.onDeleted();
  let starts = 0;
  device.poll = {
    isActive: () => false,
    start: () => {
      starts += 1;
    },
  };
  device.ensurePollingStarted();
  assert.equal(starts, 0);
});

test('discovery completed after deletion is discarded before connection or callback writes', async () => {
  const { device, api, homey } = harness();
  let release;
  let writes = 0;
  device.getSettings = async () => ({});
  device.verifyCandidateConnection = () => new Promise((resolve) => {
    release = resolve;
  });
  device.commitConnection = async () => {
    writes += 1;
  };
  device.reconcileButtonCallbackSafely = async () => {
    writes += 1;
  };
  const pending = device.commitDiscoveredConnection({ address: '192.0.2.10', port: 80 });
  while (!release) await Promise.resolve();
  await device.onDeleted();
  release(api);
  assert.equal(await pending, false);
  assert.equal(writes, 0);
  assert.equal(homey.setIntervalCalls.length, 0);
});
