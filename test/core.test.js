const assert = require('node:assert/strict');
const test = require('node:test');

const normalizer = require('../.homeybuild/lib/awtrix3/Normalizer');
const validator = require('../.homeybuild/lib/awtrix3/Validator');
const Poll = require('../.homeybuild/lib/awtrix3/Poll').default;
const Api = require('../.homeybuild/lib/awtrix3/Api/Api').default;
const { statusFromHttpCode } = require('../.homeybuild/lib/awtrix3/Api/Client');
const { Status } = require('../.homeybuild/lib/awtrix3/Api/Response');
const {
  createFakeAwtrix3Device,
  fakeAwtrix3Client,
} = require('./helpers/fake-homey');

test('isNumeric accepts complete finite values only', () => {
  for (const value of [0, -3, 1.5, '0', '-3', '1.5']) {
    assert.equal(validator.isNumeric(value), true, String(value));
  }

  for (const value of ['', ' ', '12px', Infinity, NaN, null, undefined]) {
    assert.equal(validator.isNumeric(value), false, String(value));
  }
});

test('normalizers retain explicit zero and false values', () => {
  assert.deepEqual(normalizer.appOptions({
    text: '',
    textCase: 0,
    textOffset: 0,
    center: false,
    pushIcon: 0,
    duration: 0,
    noScroll: false,
    progress: 0,
    lifetime: 0,
    lifetimeMode: 0,
    pos: 0,
  }, []), {
    text: '',
    textCase: 0,
    textOffset: 0,
    center: false,
    pushIcon: 0,
    duration: 0,
    noScroll: false,
    progress: 0,
    lifetime: 0,
    lifetimeMode: 0,
    pos: 0,
  });

  assert.deepEqual(normalizer.appOptions({ repeat: 0 }, []), { repeat: 0 });
});

test('normalizer supports text fragments from JSON input', () => {
  assert.deepEqual(normalizer.appOptions({
    text: '[{"t":"Hot","c":"#FF0000"},{"t":" cold","c":"#0000FF"}]',
  }, []), {
    text: [
      { t: 'Hot', c: '#FF0000' },
      { t: ' cold', c: '#0000FF' },
    ],
  });
});

test('AWTRIX 3 indicator rejects invalid ids before HTTP', async () => {
  let requestCount = 0;
  const api = new Api({
    async post() {
      requestCount += 1;
      return { status: Status.Ok };
    },
  }, {});

  for (const id of ['invalid', 0, 4, 1.5]) {
    await assert.rejects(() => api.indicator(id, { color: '#ffffff' }), RangeError);
  }

  assert.equal(requestCount, 0);
});

test('AWTRIX 3 app names lowercase before removing separators and reject empty results', () => {
  assert.equal(normalizer.appName('My App & co'), 'homey:myappco');
  assert.equal(normalizer.appName('UPPER_case'), 'homey:uppercase');
  assert.equal(normalizer.appName('a-b_c.d'), 'homey:abcd');
  assert.throws(() => normalizer.appName('--- ___ ...'), RangeError);
});

test('AWTRIX 3 custom app API uses encoded normalized names and rejects before HTTP', async () => {
  const client = fakeAwtrix3Client();
  const api = new Api(client, createFakeAwtrix3Device());

  await api.customApp('My App & co', { text: 'hello' });
  await api.removeCustomApp('My App & co');

  assert.deepEqual(client.calls.map((call) => call.endpoint), [
    'custom?name=homey%3Amyappco',
    'custom?name=homey%3Amyappco',
  ]);

  const requestCount = client.calls.length;
  await assert.rejects(() => api.customApp('---', {}), RangeError);
  await assert.rejects(() => api.removeCustomApp('___'), RangeError);
  assert.equal(client.calls.length, requestCount);
});

test('settings retain transition effect zero', () => {
  assert.deepEqual(normalizer.settingOptions({ TEFF: 0 }), { TEFF: 0 });
});

test('settings omit unknown keys', () => {
  assert.deepEqual(normalizer.settingOptions({ user: 'a', pass: 'b', TIM: true }), { TIM: true });
});

test('HTTP status mapping treats only 2xx responses as success', () => {
  assert.equal(statusFromHttpCode(200), Status.Ok);
  assert.equal(statusFromHttpCode(299), Status.Ok);
  assert.equal(statusFromHttpCode(300), Status.Error);
  assert.equal(statusFromHttpCode(302), Status.Error);
  assert.equal(statusFromHttpCode(399), Status.Error);
  assert.equal(statusFromHttpCode(400), Status.Error);
  assert.equal(statusFromHttpCode(401), Status.AuthRequired);
  assert.equal(statusFromHttpCode(403), Status.AuthFailed);
  assert.equal(statusFromHttpCode(404), Status.NotFound);
  assert.equal(statusFromHttpCode(500), Status.Error);
});

test('Poll clears its interval and active state when stopped', () => {
  const handles = [];
  const cleared = [];
  const homey = {
    setInterval(callback, delay) {
      const handle = { callback, delay };
      handles.push(handle);
      return handle;
    },
    clearInterval(handle) {
      cleared.push(handle);
    },
  };
  const poll = new Poll(() => {}, homey, () => {}, 10, 50);

  poll.start();
  assert.equal(poll.isActive(), true);
  assert.equal(handles[0].delay, 10);

  poll.extend();
  assert.equal(poll.isExtended(), true);
  assert.equal(handles[1].delay, 50);
  assert.deepEqual(cleared, [handles[0]]);

  poll.stop();
  assert.equal(poll.isActive(), false);
  assert.equal(poll.isExtended(), false);
  assert.deepEqual(cleared, handles);
});

test('AWTRIX 3 Poll skips overlapping callbacks', async () => {
  let intervalCallback;
  const homey = {
    setInterval(callback) {
      intervalCallback = callback;
      return 1;
    },
    clearInterval() {},
  };
  let finishFirstRun;
  const firstRun = new Promise((resolve) => {
    finishFirstRun = resolve;
  });
  let callbackCalls = 0;
  const poll = new Poll(async () => {
    callbackCalls += 1;
    if (callbackCalls === 1) {
      await firstRun;
    }
  }, homey, () => {}, 10, 50);

  poll.start();
  const pendingRun = intervalCallback();
  await Promise.resolve();

  await intervalCallback();
  assert.equal(callbackCalls, 1);

  finishFirstRun();
  await pendingRun;
  await intervalCallback();
  assert.equal(callbackCalls, 2);
});

test('AWTRIX 3 Poll reports rejection and continues polling', async () => {
  let intervalCallback;
  const homey = {
    setInterval(callback) {
      intervalCallback = callback;
      return 1;
    },
    clearInterval() {},
  };
  const callbackError = new Error('AWTRIX 3 poll failed');
  const errors = [];
  let callbackCalls = 0;
  const poll = new Poll(async () => {
    callbackCalls += 1;
    if (callbackCalls === 1) {
      throw callbackError;
    }
  }, homey, (error) => errors.push(error), 10, 50);

  poll.start();
  await intervalCallback();

  assert.deepEqual(errors, [callbackError]);
  assert.equal(poll.isActive(), true);

  await intervalCallback();
  assert.equal(callbackCalls, 2);
});

/**
 * H3 characterization tests: these pin the CURRENT normalizer behaviour so that H4
 * can only change it deliberately. Cases marked `characterization: pre-H4` are the
 * ones H4 is allowed to change (decision P2); all others must stay as they are.
 */

test('characterization: pre-H4 - zero blinkText and fadeText are dropped', () => {
  assert.deepEqual(normalizer.appOptions({ blinkText: 0, fadeText: 0 }, []), {});
  assert.deepEqual(normalizer.notifyOptions({ blinkText: 0, fadeText: 0 }, []), {});
});

test('characterization: non-zero blinkText and fadeText pass through', () => {
  assert.deepEqual(normalizer.appOptions({ blinkText: 500, fadeText: 500 }, []), {
    blinkText: 500,
    fadeText: 500,
  });
});

test('characterization: pre-H4 - invalid basicOptions color falls back to zero', () => {
  assert.deepEqual(normalizer.appOptions({ color: 'red' }, []), { color: '0' });
});

test('characterization: valid basicOptions color passes through unchanged', () => {
  assert.deepEqual(normalizer.appOptions({ color: '#ABCDEF' }, []), { color: '#ABCDEF' });
});

test('characterization: gradient is dropped as a whole when one color is invalid', () => {
  assert.deepEqual(normalizer.appOptions({ gradient: ['#ABCDEF', 'nope'] }, []), {});
  assert.deepEqual(normalizer.appOptions({ gradient: ['#ABCDEF', '#123456'] }, []), {
    gradient: ['#ABCDEF', '#123456'],
  });
});

test('characterization: invalid background, progress and bar colors are omitted', () => {
  assert.deepEqual(normalizer.appOptions({
    background: 'x',
    progressC: 'x',
    progressBC: 'x',
    barBC: 'x',
    bar: [1, 2, 3],
  }, []), { bar: [1, 2, 3] });
});

test('characterization: blinkText and fadeText are mutually exclusive with rainbow and gradient', () => {
  assert.deepEqual(normalizer.appOptions({ blinkText: 500, rainbow: true }, []), { rainbow: true });
  assert.deepEqual(normalizer.appOptions({ fadeText: 500, gradient: ['#ABCDEF', '#123456'] }, []), {
    gradient: ['#ABCDEF', '#123456'],
  });
});

test('characterization: toText handles numeric, JSON and plain string inputs', () => {
  // Numeric-looking strings and numbers stringify.
  assert.deepEqual(normalizer.appOptions({ text: '123' }, []), { text: '123' });
  assert.deepEqual(normalizer.appOptions({ text: 123 }, []), { text: '123' });

  // JSON scalars that are neither string nor numeric are dropped.
  assert.deepEqual(normalizer.appOptions({ text: 'null' }, []), {});
  assert.deepEqual(normalizer.appOptions({ text: 'true' }, []), {});
  assert.deepEqual(normalizer.appOptions({ text: '{"a":1}' }, []), {});

  // Non-JSON strings pass through untouched.
  assert.deepEqual(normalizer.appOptions({ text: 'hello world' }, []), { text: 'hello world' });
  assert.deepEqual(normalizer.appOptions({ text: '' }, []), { text: '' });

  // Fragments require a valid color: isTextFragment rejects the whole array otherwise,
  // so the toColor('0') fallback inside toText is unreachable today.
  assert.deepEqual(normalizer.appOptions({ text: '[{"t":"a","c":"bad"}]' }, []), {});
  assert.deepEqual(normalizer.appOptions({ text: '[{"t":"a"}]' }, []), {});
  assert.deepEqual(normalizer.appOptions({ text: '[{"t":"a","c":"#FFFFFF"}]' }, []), {
    text: [{ t: 'a', c: '#FFFFFF' }],
  });
});

test('characterization: repeat wins over duration and clears it on the input object', () => {
  assert.deepEqual(normalizer.appOptions({ repeat: 2, duration: 10 }, []), { repeat: 2 });
  assert.deepEqual(normalizer.appOptions({ duration: 10, repeat: 2 }, []), { repeat: 2 });
  assert.deepEqual(normalizer.appOptions({ duration: 10 }, []), { duration: 10 });

  // Side effect: basicOptions mutates the caller's options object.
  const options = { repeat: 2, duration: 10 };
  normalizer.appOptions(options, []);
  assert.equal(options.duration, undefined);
});
