const assert = require('node:assert/strict');
const test = require('node:test');
const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const {
  assertAwtrixNgSound, toAwtrixNgSoundObjectNotification, validateAwtrixNgMp3Url,
  waitForAwtrixNgUrlSound, AwtrixNgAudioPlaybackError,
} = require('../.homeybuild/lib/awtrixng/Services/Audio');
const { toAwtrixNgNotificationPayload } = require('../.homeybuild/lib/awtrixng/Payload/Transformers');
const {
  getSoundboardMp3s, resolveSoundboardMp3Url,
} = require('../.homeybuild/drivers/awtrixng/soundboard');

const nativeCaps = {
  audio: {
    mp3: true, url: true, song: true, rtttl: true,
  },
};
const url = 'http://192.0.2.40/test.mp3';
const state = (overrides = {}) => ({
  alert: {
    name: url, playing: false, error: '', ...overrides,
  },
});
const createApi = (routes) => {
  const calls = [];
  const client = new AwtrixNgClient({
    async request(request) {
      calls.push(request);
      const handler = routes[`${request.method} ${request.path}`];
      if (handler === undefined) throw new Error(`Unexpected request: ${request.path}`);
      return { status: 200, headers: {}, data: typeof handler === 'function' ? await handler(request) : handler };
    },
  });
  return { api: new AwtrixNgApi(client, { baseUrl: 'http://192.0.2.41', icons: { emptyIcon: { name: 'None', id: '-' } } }), calls };
};

test('new audio schema maps synth to a once-only song and guards unsupported hardware', async () => {
  const { api, calls } = createApi({ 'GET /api/v1/capabilities': nativeCaps, 'POST /api/v1/audio/play': { ok: true } });
  await api.playSynthFx('bpm 120; inst lead wave=sine; lead: c4');
  assert.deepEqual(calls[1].body, { song: 'bpm 120; inst lead wave=sine; lead: c4' });
  const unsupported = createApi({ 'GET /api/v1/capabilities': { audio: { song: false, rtttl: true } } });
  await assert.rejects(unsupported.api.playSynthFx('song'), /no synthesizer/);
  assert.equal(unsupported.calls.length, 1);
});

test('legacy notification sounds adapt without losing looping or track fields', () => {
  assert.deepEqual(toAwtrixNgSoundObjectNotification({ text: 'Door', soundRtttl: 'beep:d=8:c', soundLoop: true }), {
    text: 'Door', sound: { rtttl: 'beep:d=8:c', loop: true },
  });
  assert.deepEqual(toAwtrixNgSoundObjectNotification({ sound: 3 }), { sound: { track: 3 } });
  assert.deepEqual(toAwtrixNgSoundObjectNotification({ sound: 'ding', soundLoop: false }), { sound: { file: 'ding', loop: false } });
  assert.throws(() => toAwtrixNgSoundObjectNotification({ sound: 'ding', soundRtttl: 'beep' }), /not both/);
  assert.throws(() => toAwtrixNgSoundObjectNotification({ sound: { file: 'ding', loop: true }, soundLoop: false }), /conflicts/);
  assert.throws(() => toAwtrixNgSoundObjectNotification({ soundLoop: true }), /requires one sound/);
});

test('notification facade adapts only new firmware audio and preserves old payloads', async () => {
  const payload = { text: 'Door', soundRtttl: 'beep:d=8:c', soundLoop: true };
  for (const caps of [nativeCaps, { audio: { synth: true } }]) {
    const { api, calls } = createApi({ 'GET /api/v1/capabilities': caps, 'POST /api/v1/notifications': { ok: true } });
    await api.sendNotification(payload);
    assert.deepEqual(calls[1].body, caps === nativeCaps ? { text: 'Door', sound: { rtttl: 'beep:d=8:c', loop: true } } : payload);
  }
  const legacy = createApi({ 'GET /api/v1/capabilities': { audio: { synth: true } } });
  await assert.rejects(legacy.api.sendNotification({ sound: [{ speech: 'Hello' }, 'ding'] }), /require the new/);
});

test('raw notification accepts new sound objects and fallback lists, rejects malformed entries', () => {
  const sound = [{ speech: 'Hello' }, 'ding'];
  assert.deepEqual(toAwtrixNgNotificationPayload({ sound }).sound, sound);
  for (const invalid of [[], ['a', 'b', 'c', 'd', 'e'], { file: 'x', song: 'y' }, { file: 'x', fake: true }, { track: 3000 }, { file: 'x', nextBar: true }]) {
    assert.throws(() => assertAwtrixNgSound(invalid));
  }
});

test('URL playback validates addresses and requires native URL hardware before sending', async () => {
  for (const invalid of ['file:///tmp/sound.mp3', 'ftp://example.com/sound.mp3', 'http://user:pass@example.com/x', 'http://example.com/x#frag', 'x']) {
    assert.throws(() => validateAwtrixNgMp3Url(invalid));
  }
  assert.equal(validateAwtrixNgMp3Url(url), url);
  const { api, calls } = createApi({ 'GET /api/v1/capabilities': { audio: { mp3: true, synth: true } } });
  await assert.rejects(api.playMp3Url(url), /does not support native/);
  assert.equal(calls.length, 1);
});

test('URL monitor waits for completion and preserves asynchronous HTTP errors', async () => {
  const queue = [state({ playing: true }), state()];
  await waitForAwtrixNgUrlSound({ getAudio: async () => queue.shift() }, url, { intervalMs: 1 });
  await assert.rejects(waitForAwtrixNgUrlSound({ getAudio: async () => state({ error: 'HTTP 404' }) }, url), (error) => {
    assert.ok(error instanceof AwtrixNgAudioPlaybackError);
    assert.equal(error.httpStatus, 404);
    assert.equal(error.field, 'alert.error');
    assert.equal(error.message, 'HTTP 404');
    return true;
  });
  await assert.rejects(waitForAwtrixNgUrlSound({ getAudio: async () => state({ name: 'other' }) }, url), /replaced/);
  await assert.rejects(waitForAwtrixNgUrlSound({ getAudio: async () => ({ alert: null }) }, url), /alert playback group/);
  await assert.rejects(waitForAwtrixNgUrlSound({ getAudio: async () => state({ playing: true }) }, url, { timeoutMs: 2, intervalMs: 3 }), (error) => error.timedOut);
});

test('URL facade uses file, reports async failures, and preserves transport errors', async () => {
  const { api, calls } = createApi({
    'GET /api/v1/capabilities': nativeCaps,
    'POST /api/v1/audio/play': { ok: true },
    'GET /api/v1/audio': state(),
    'POST /api/v1/audio/stop': { ok: true },
  });
  await api.playMp3Url(url);
  assert.deepEqual(calls[1].body, { file: url });
  await api.stopUrlSound();
  assert.deepEqual(calls.at(-1).body, { group: 'alert' });
  const failure = new Error('offline');
  const bad = createApi({
    'GET /api/v1/capabilities': nativeCaps,
    'POST /api/v1/audio/play': () => {
      throw failure;
    },
  });
  await assert.rejects(bad.api.playMp3Url(url), (error) => error === failure);
  const missing = createApi({ 'GET /api/v1/capabilities': nativeCaps, 'POST /api/v1/audio/play': { ok: true }, 'GET /api/v1/audio': state({ error: 'HTTP 404' }) });
  await assert.rejects(missing.api.playMp3Url(url), /HTTP 404/);
});

test('concurrent URL flows are rejected and stop cancels the active wait', async () => {
  let release;
  const read = new Promise((resolve) => {
    release = resolve;
  });
  const { api } = createApi({
    'GET /api/v1/capabilities': nativeCaps,
    'POST /api/v1/audio/play': { ok: true },
    'GET /api/v1/audio': () => read,
    'POST /api/v1/audio/stop': { ok: true },
  });
  const first = api.playMp3Url(url);
  await assert.rejects(api.playMp3Url(url), /already running/);
  await api.stopUrlSound();
  release(state());
  await assert.rejects(first, /cancelled/);
});

test('stop during URL preparation prevents a late play command', async () => {
  let release;
  let reads = 0;
  const pendingCaps = new Promise((resolve) => {
    release = resolve;
  });
  const { api, calls } = createApi({
    'GET /api/v1/capabilities': () => {
      reads += 1; return reads === 1 ? pendingCaps : nativeCaps;
    },
    'POST /api/v1/audio/stop': { ok: true },
  });
  const first = assert.rejects(api.playMp3Url(url), /cancelled/);
  const stop = api.stopUrlSound();
  // Let the stop read complete and mark the prepared playback as cancelled.
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  release(nativeCaps);
  await Promise.all([first, stop]);
  assert.equal(calls.some((call) => call.path === '/api/v1/audio/play'), false);
});

const mp3 = {
  id: '0123456789abcdef01234567', name: 'Test MP3', type: 'audio/mpeg', path: 'userdata/0123456789abcdef01234567.mp3',
};
const soundboard = (sounds = [mp3], installed = true) => ({ getInstalled: async () => installed, get: async () => sounds });

test('Soundboard resolves fresh metadata by ID and exposes only MP3 choices', async () => {
  assert.deepEqual(await getSoundboardMp3s(soundboard([mp3, { ...mp3, type: 'audio/wav' }])), [mp3]);
  assert.equal(await resolveSoundboardMp3Url(soundboard(), '192.0.2.40:80', mp3.id), `http://192.0.2.40/app/com.athom.soundboard/${mp3.path}`);
  assert.equal(await resolveSoundboardMp3Url(soundboard([{ ...mp3, path: `/${mp3.path}` }]), 'http://192.0.2.40', mp3.id), `http://192.0.2.40/app/com.athom.soundboard/${mp3.path}`);
  await assert.rejects(getSoundboardMp3s(soundboard([], false)), /Install Soundboard/);
  await assert.rejects(resolveSoundboardMp3Url(soundboard([]), '192.0.2.40', mp3.id), /Select the sound again/);
  await assert.rejects(resolveSoundboardMp3Url(soundboard([{ ...mp3, path: '../secret.mp3' }]), '192.0.2.40', mp3.id), /unsupported MP3 file path/);
  await assert.rejects(getSoundboardMp3s(soundboard([{ name: 'bad' }])), /invalid sound list/);
});
