/* eslint-disable mocha/handle-done-callback -- node:test supplies a TestContext rather than a completion callback. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const FetchTransport = require('../.homeybuild/lib/awtrixng/Http/FetchTransport').default;
const { AwtrixNgHttpError } = require('../.homeybuild/lib/awtrixng/Http/Transport');
const { downloadAwtrixNgClip, AwtrixNgMaxClipBytes } = require('../.homeybuild/lib/awtrixng/Services/Audio');
const { getSoundboardAudioFiles, resolveSoundboardClipUrl } = require('../.homeybuild/drivers/awtrixng/soundboard');
const { toAwtrixNgNotificationPayload, toAwtrixNgPushedAppPayload } = require('../.homeybuild/lib/awtrixng/Payload/Transformers');

const caps = {
  platform: { id: 'tc002' },
  display: { width: 52, height: 16 },
  fonts: [{ name: 'small' }, { name: 'matrix-light6' }],
  audio: {
    song: true, rtttl: true, mp3: true, url: true, clip: true, radio: true, speech: true,
  },
};
const levels = {
  volume: 90, alertVolume: 100, appVolume: 80, radioVolume: 60,
};
const createApi = (overrides = {}) => {
  const calls = [];
  const routes = {
    'GET /api/v1/capabilities': caps,
    'GET /api/v1/version': { version: '1.1.6' },
    'GET /api/v1/settings': levels,
    'PATCH /api/v1/settings': (request) => ({ ...levels, ...request.body }),
    'POST /api/v1/audio/stop': { ok: true },
    'POST /api/v1/audio/play': { ok: true },
    'POST /api/v1/audio/clip': { ok: true },
    'GET /api/v1/audio': { stations: [], radio: { playing: true, error: '' } },
    'POST /api/v1/notifications': { ok: true },
    'PUT /api/v1/apps/pushed/test': { ok: true },
    ...overrides,
  };
  const client = new AwtrixNgClient({
    async request(request) {
      calls.push(request);
      const route = routes[`${request.method} ${request.path}`];
      if (route === undefined) throw new Error(`Unexpected request ${request.path}`);
      return { status: 200, headers: {}, data: typeof route === 'function' ? await route(request) : route };
    },
  });
  return { api: new AwtrixNgApi(client, { baseUrl: 'http://192.0.2.10', icons: { emptyIcon: { name: 'None', id: '-' } } }), calls };
};

test('mixer changes only the selected level, validates hardware and preserves zero', async () => {
  const { api, calls } = createApi();
  assert.deepEqual(await api.setMixerLevel('alertVolume', 0), { ...levels, alertVolume: 0 });
  assert.deepEqual(calls.at(-1).body, { alertVolume: 0 });
  for (const value of [-1, 101, 0.5, '50', NaN]) await assert.rejects(api.setMixerLevel('volume', value));
  await assert.rejects(api.setMixerLevel('other', 20), /Unknown/);
  const old = createApi({ 'GET /api/v1/capabilities': { audio: { mixer: true, synth: true } } });
  await assert.rejects(old.api.setMixerLevel('volume', 10), /group API/);
  assert.equal(old.calls.some((call) => call.method === 'PATCH'), false);
  const invalid = createApi({ 'GET /api/v1/settings': { volume: 20 } });
  await assert.rejects(invalid.api.setMixerLevel('volume', 30), /four mixer levels/);
  assert.equal(invalid.calls.some((call) => call.method === 'PATCH'), false);
});

test('group stops use the documented bodies; old API and absent radio fail before writing', async () => {
  const { api, calls } = createApi();
  for (const group of ['alert', 'app', 'radio', 'all']) await api.stopAudioGroup(group);
  assert.deepEqual(calls.filter((call) => call.method === 'POST').map((call) => call.body), [
    { group: 'alert' }, { group: 'app' }, { group: 'radio' }, {},
  ]);
  await assert.rejects(api.stopAudioGroup('stream'), /Unknown/);
  const absent = createApi({ 'GET /api/v1/capabilities': { audio: { rtttl: true, song: false, radio: false } } });
  await assert.rejects(absent.api.stopAudioGroup('radio'), /no internet radio/);
  await assert.rejects(absent.api.setMixerLevel('radioVolume', 10), /no internet radio/);
  const old = createApi({ 'GET /api/v1/capabilities': { audio: { mp3: true } } });
  await assert.rejects(old.api.stopAudioGroup('all'), /group API/);
});

test('radio accepts a saved name, index and stream URL, and reports asynchronous errors', async () => {
  const { api, calls } = createApi();
  for (const station of ['News', 0, 'https://example.com/radio.m3u']) await api.playRadio(station);
  assert.deepEqual(calls.filter((call) => call.method === 'POST').map((call) => call.body), [
    { station: 'News' }, { station: 0 }, { station: 'https://example.com/radio.m3u' },
  ]);
  await assert.rejects(api.playRadioUrl('News'));
  await assert.rejects(api.playRadio(-1));
  const offline = createApi({ 'GET /api/v1/audio': { radio: { playing: false, error: 'HTTP 404' } } });
  await assert.rejects(offline.api.playRadio('News'), (error) => error.httpStatus === 404 && error.field === 'radio.error');
  const absent = createApi({ 'GET /api/v1/capabilities': { audio: { song: true, rtttl: true, radio: false } } });
  await assert.rejects(absent.api.playRadio('News'), /no internet radio/);
});

test('station save keeps other stations and serializes concurrent updates', async () => {
  let stations = [{ name: 'Existing', url: 'http://example.com/old' }];
  const { api } = createApi({
    'GET /api/v1/audio': () => ({ stations }),
    'PUT /api/v1/audio/stations': (request) => {
      stations = request.body.stations; return { ok: true };
    },
  });
  await Promise.all([api.saveRadioStation('One', 'http://example.com/one'), api.saveRadioStation('Two', 'http://example.com/two')]);
  await api.saveRadioStation('One', 'http://example.com/new');
  assert.deepEqual(stations, [
    { name: 'Existing', url: 'http://example.com/old' },
    { name: 'One', url: 'http://example.com/new' },
    { name: 'Two', url: 'http://example.com/two' },
  ]);
  await assert.rejects(api.saveRadioStation('x'.repeat(25), 'http://example.com/x'));
});

test('clip sends binary bytes without storage and preserves firmware error details', async () => {
  const bytes = Buffer.from('ID3synthetic');
  const { api, calls } = createApi();
  await api.playAudioClip(bytes);
  assert.equal(calls.at(-1).path, '/api/v1/audio/clip');
  assert.strictEqual(calls.at(-1).body, bytes);
  assert.equal(calls.at(-1).headers['Content-Type'], 'application/octet-stream');
  for (const body of [Buffer.alloc(0), Buffer.alloc(AwtrixNgMaxClipBytes + 1)]) await assert.rejects(api.playAudioClip(body));
  const unsupported = createApi({ 'GET /api/v1/capabilities': { audio: { song: true, rtttl: true, clip: false } } });
  await assert.rejects(unsupported.api.playAudioClip(bytes), /does not support transient/);
  const invalid = createApi({
    'POST /api/v1/audio/clip': () => {
      throw new AwtrixNgHttpError({
        method: 'POST',
        url: 'http://192.0.2.10/api/v1/audio/clip',
        status: 422,
        message: 'Rejected',
        rawBody: { error: { code: 'validationFailed', message: 'unsupported WAV', field: 'body' } },
      });
    },
  });
  await assert.rejects(invalid.api.playAudioClip(bytes), (error) => error.httpStatus === 422 && error.code === 'validationFailed' && error.message === 'unsupported WAV' && error.field === 'body');
});

test('native transport does not JSON-encode a clip', async (context) => {
  const bytes = Buffer.from('ID3synthetic');
  let sent;
  context.mock.method(global, 'fetch', async (url, request) => {
    sent = request; return new Response('{"ok":true}');
  });
  const client = new AwtrixNgClient(new FetchTransport({ baseUrl: 'http://192.0.2.10' }));
  await client.playClip(bytes);
  assert.strictEqual(sent.body, bytes);
  assert.equal(sent.headers['Content-Type'], 'application/octet-stream');
});

test('clip download enforces declared and streamed sizes and reports source HTTP status', async (context) => {
  const fetch = context.mock.method(global, 'fetch');
  fetch.mock.mockImplementation(async () => new Response('ID3synthetic'));
  assert.equal(Buffer.from(await downloadAwtrixNgClip('http://example.com/a.mp3')).toString(), 'ID3synthetic');
  fetch.mock.mockImplementation(async () => new Response('missing', { status: 404 }));
  await assert.rejects(downloadAwtrixNgClip('http://example.com/a.mp3'), (error) => error.httpStatus === 404);
  fetch.mock.mockImplementation(async () => new Response('a', { headers: { 'content-length': String(AwtrixNgMaxClipBytes + 1) } }));
  await assert.rejects(downloadAwtrixNgClip('http://example.com/a.mp3'), /exceeds/);
  fetch.mock.mockImplementation(async () => new Response(Buffer.alloc(AwtrixNgMaxClipBytes + 1)));
  await assert.rejects(downloadAwtrixNgClip('http://example.com/a.mp3'), /exceeds/);
});

test('stop cancels clip preparation before a late play command', async (context) => {
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  context.mock.method(global, 'fetch', async () => wait);
  const { api, calls } = createApi();
  const playing = assert.rejects(api.playAudioClipUrl('http://example.com/a.mp3'), /cancelled/);
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  const stopping = api.stopAudioGroup('all');
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  release(new Response('ID3synthetic'));
  await Promise.all([playing, stopping]);
  assert.equal(calls.some((call) => call.path === '/api/v1/audio/clip'), false);
});

test('Soundboard clip resolves fresh MP3 or WAV metadata, rejecting other file paths', async () => {
  const wav = {
    id: '0123456789abcdef01234567', name: 'Voice', type: 'audio/wav', path: 'userdata/0123456789abcdef01234567.wav',
  };
  const source = { getInstalled: async () => true, get: async () => [wav, { ...wav, type: 'audio/ogg' }] };
  assert.deepEqual(await getSoundboardAudioFiles(source), [wav]);
  assert.equal(await resolveSoundboardClipUrl(source, '192.0.2.20', wav.id), `http://192.0.2.20/app/com.athom.soundboard/${wav.path}`);
});

test('extended JSON preserves icons and named fonts and checks precise nested fields', () => {
  const page = {
    text: 'Home', font: 'matrix-light6', iconGap: 0, icons: [{ icon: 'weather', x: -1, y: 8 }],
  };
  assert.deepEqual(toAwtrixNgNotificationPayload(page), page);
  assert.deepEqual(toAwtrixNgPushedAppPayload(page), page);
  for (const [change, field] of [
    [{ iconGap: 129 }, 'iconGap'], [{ iconGap: 0.5 }, 'iconGap'], [{ icons: [{ icon: 'a', typo: 0 }] }, 'icons[0].typo'],
    [{ icons: [{ icon: 'a', x: 65536 }] }, 'icons[0].x'], [{ icons: [{ icon: '' }] }, 'icons[0].icon'],
    [{ icons: Array(5).fill({ icon: 'a' }) }, 'icons'],
  ]) assert.throws(() => toAwtrixNgNotificationPayload({ ...page, ...change }), (error) => error.field === field);
});

test('extended JSON works on both panel sizes but fails for unknown fonts and old contracts', async () => {
  const page = {
    text: 'Home', font: 'matrix-light6', iconGap: 2, icons: [{ icon: 'weather', x: 16, y: 0 }],
  };
  for (const display of [{ width: 52, height: 16 }, { width: 32, height: 8 }]) {
    const { api, calls } = createApi({ 'GET /api/v1/capabilities': { ...caps, display } });
    await api.sendNotification(page);
    await api.putPushedApp('test', page);
    assert.deepEqual(calls.at(-1).body, page);
  }
  const { api, calls } = createApi({ 'GET /api/v1/version': { version: '1.1.1' } });
  await assert.rejects(api.sendNotification(page), (error) => error.field === 'iconGap');
  await assert.rejects(api.sendNotification({ font: 'unknown' }), (error) => error.field === 'font');
  assert.equal(calls.some((call) => call.method === 'POST'), false);
  const old = createApi({ 'GET /api/v1/capabilities': { platform: { id: 'tc001' } } });
  await assert.rejects(old.api.sendNotification({ icon: 'https://example.com/icon.png' }), (error) => error.field === 'icon');
});

test('new JSON radio source requires radio hardware and rejects fallback/loop options', async () => {
  const { api, calls } = createApi();
  await api.sendNotification(toAwtrixNgNotificationPayload({ sound: { station: 0 } }));
  assert.deepEqual(calls.at(-1).body.sound, { station: 0 });
  for (const sound of [[{ station: 'News' }], { station: 'News', loop: false }, { speech: 'é'.repeat(257) }]) {
    assert.throws(() => toAwtrixNgNotificationPayload({ sound }));
  }
  const unsupported = createApi({ 'GET /api/v1/capabilities': { audio: { song: true, rtttl: true, radio: false } } });
  await assert.rejects(unsupported.api.sendNotification({ sound: { station: 'News' } }), (error) => error.field === 'sound.station');
});

test('new Flow cards have capability filters; the old stop card keeps its ID and arguments', () => {
  const flows = JSON.parse(fs.readFileSync('drivers/awtrixng/driver.flow.compose.json', 'utf8'));
  const filters = {
    awtrixng_audio_speech: 'audio_speech',
    awtrixng_audio_volume: 'audio_mixer',
    awtrixng_audio_stop_group: 'audio_groups',
    awtrixng_radio_station: 'audio_radio',
    awtrixng_radio_url: 'audio_radio',
    awtrixng_radio_save: 'audio_radio',
    awtrixng_audio_clip_url: 'audio_clip',
    awtrixng_audio_clip_soundboard: 'audio_clip',
  };
  for (const [id, filter] of Object.entries(filters)) {
    const card = flows.actions.find((entry) => entry.id === id);
    assert.equal(card.$filter, `capabilities=awtrixng_${filter}`);
    const names = card.args.map((arg) => arg.name).sort();
    for (const title of Object.values(card.titleFormatted)) assert.deepEqual([...title.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]).sort(), names);
  }
  const old = flows.actions.find((entry) => entry.id === 'awtrixng_audio_stop');
  assert.equal(old.args, undefined);
  assert.equal(old.$filter, 'capabilities=awtrixng_audio_url');
});

test('speech sends exact text, validates UTF-8 bytes and checks device support before playback', async () => {
  const { api, calls } = createApi();
  for (const text of ['Window open.', 'Ž'.repeat(256), '🐱'.repeat(128)]) {
    await api.speakText(text);
    assert.deepEqual(calls.at(-1).body, { speech: text });
    assert.equal(calls.at(-1).path, '/api/v1/audio/play');
  }
  const before = calls.length;
  for (const text of ['', '   ', 'Ž'.repeat(257), '🐱'.repeat(129), null, 42]) {
    await assert.rejects(api.speakText(text), /512 UTF-8 bytes/);
  }
  assert.equal(calls.length, before);
  for (const speech of [false, undefined]) {
    const unsupported = createApi({ 'GET /api/v1/capabilities': { ...caps, audio: { ...caps.audio, speech } } });
    await assert.rejects(unsupported.api.speakText('Hello'), /does not support speech/);
    assert.equal(unsupported.calls.some((call) => call.method === 'POST'), false);
  }
});

test('speech preserves firmware error details', async () => {
  const error = new AwtrixNgHttpError({
    method: 'POST',
    url: 'http://192.0.2.10/api/v1/audio/play',
    status: 422,
    message: 'Rejected',
    rawBody: { error: { code: 'voiceMissing', message: 'Install a voice', field: 'speech' } },
  });
  const { api } = createApi({
    'POST /api/v1/audio/play': () => {
      throw error;
    },
  });
  await assert.rejects(api.speakText('Hello'), (result) => result.httpStatus === 422
    && result.code === 'voiceMissing' && result.message === 'Install a voice' && result.field === 'speech');
});

test('speech capability marker follows reported support, independently of panel size', async () => {
  for (const speech of [true, false, undefined]) {
    const { api } = createApi({ 'GET /api/v1/capabilities': { ...caps, audio: { ...caps.audio, speech } } });
    const features = await api.readFeatures({ boardType: 'awtrixng', version: '1.2.0' });
    assert.equal(features.includes('awtrixng_audio_speech'), speech === true);
  }
});
