const assert = require('node:assert/strict');
const test = require('node:test');

const normalizer = require('../.homeybuild/lib/awtrix3/Normalizer');
const validator = require('../.homeybuild/lib/awtrix3/Validator');
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

// The Poll tests moved to shared-poll.test.js together with the class (update-plan-3, M6).

/**
 * Normalizer behaviour tests. Introduced in H3 as characterization tests; the cases
 * H4 changed on purpose (decision P2 plus literal toText semantics) are now asserted
 * against the new behaviour. Everything else must stay exactly as it is.
 */

test('zero blinkText and fadeText are sent to the device', () => {
  // H4/P2: zero is a valid interval, so it must not be swallowed by a truthy check.
  assert.deepEqual(normalizer.appOptions({ blinkText: 0, fadeText: 0 }, []), {
    blinkText: 0,
    fadeText: 0,
  });
  assert.deepEqual(normalizer.notifyOptions({ blinkText: 0, fadeText: 0 }, []), {
    blinkText: 0,
    fadeText: 0,
  });
});

test('characterization: non-zero blinkText and fadeText pass through', () => {
  assert.deepEqual(normalizer.appOptions({ blinkText: 500, fadeText: 500 }, []), {
    blinkText: 500,
    fadeText: 500,
  });
});

test('invalid basicOptions color is omitted instead of sent as zero', () => {
  // H4/P2: '0' means "black" here, so an unparseable color must be left out entirely.
  assert.deepEqual(normalizer.appOptions({ color: 'red' }, []), {});
  assert.deepEqual(normalizer.appOptions({ color: '' }, []), {});
});

test('indicator options keep the zero color fallback', () => {
  // Unchanged on purpose: for indicators color '0' is the documented "turn off" value.
  assert.deepEqual(normalizer.indicatorOptions({ color: 'red' }), { color: '0' });
  assert.deepEqual(normalizer.indicatorOptions({}), { color: '0' });
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

test('toText shows non-array input literally', () => {
  // H4: JSON is only parsed for fragment arrays, so literal text is never reinterpreted.
  assert.deepEqual(normalizer.appOptions({ text: '123' }, []), { text: '123' });
  assert.deepEqual(normalizer.appOptions({ text: 123 }, []), { text: '123' });
  assert.deepEqual(normalizer.appOptions({ text: 'hello world' }, []), { text: 'hello world' });
  assert.deepEqual(normalizer.appOptions({ text: '' }, []), { text: '' });

  // Previously these were parsed as JSON and dropped or rewritten; now they stay as typed.
  assert.deepEqual(normalizer.appOptions({ text: 'null' }, []), { text: 'null' });
  assert.deepEqual(normalizer.appOptions({ text: 'true' }, []), { text: 'true' });
  assert.deepEqual(normalizer.appOptions({ text: '{"a":1}' }, []), { text: '{"a":1}' });
  assert.deepEqual(normalizer.appOptions({ text: '"abc"' }, []), { text: '"abc"' });
  assert.deepEqual(normalizer.appOptions({ text: ' 123 ' }, []), { text: ' 123 ' });
  assert.deepEqual(normalizer.appOptions({ text: '1e3' }, []), { text: '1e3' });

  // Non-string, non-numeric input without fragments is dropped.
  assert.deepEqual(normalizer.appOptions({ text: null }, []), {});
  assert.deepEqual(normalizer.appOptions({ text: {} }, []), {});
});

test('toText parses bracketed input as text fragments', () => {
  assert.deepEqual(normalizer.appOptions({ text: '[{"t":"a","c":"#FFFFFF"}]' }, []), {
    text: [{ t: 'a', c: '#FFFFFF' }],
  });
  assert.deepEqual(normalizer.appOptions({ text: '  [{"t":"a","c":"#FFFFFF"}]  ' }, []), {
    text: [{ t: 'a', c: '#FFFFFF' }],
  });
  assert.deepEqual(normalizer.appOptions({ text: [{ t: 'a', c: '#FFFFFF' }] }, []), {
    text: [{ t: 'a', c: '#FFFFFF' }],
  });
  assert.deepEqual(normalizer.appOptions({ text: '[]' }, []), { text: [] });

  // A valid JSON array that is not a fragment list is dropped. Fragments require a valid
  // color, so the toColor('0') fallback inside toText stays unreachable - unchanged by H4.
  assert.deepEqual(normalizer.appOptions({ text: '[1,2]' }, []), {});
  assert.deepEqual(normalizer.appOptions({ text: '[{"t":"a","c":"bad"}]' }, []), {});
  assert.deepEqual(normalizer.appOptions({ text: '[{"t":"a"}]' }, []), {});

  // Bracketed but invalid JSON is literal text, not an error.
  assert.deepEqual(normalizer.appOptions({ text: '[abc' }, []), { text: '[abc' });
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

const barLineRange = (length) => Array.from({ length }, (unused, index) => index + 1);

test('bar and line accept up to 16 values without an icon and 11 with one', () => {
  assert.deepEqual(normalizer.appOptions({ bar: barLineRange(16) }, []), { bar: barLineRange(16) });
  assert.deepEqual(normalizer.appOptions({ line: barLineRange(16) }, []), { line: barLineRange(16) });
  assert.deepEqual(normalizer.appOptions({ icon: 'a', bar: barLineRange(11) }, []), {
    icon: 'a',
    bar: barLineRange(11),
  });
});

test('bar and line are dropped when they exceed the runtime limit', () => {
  assert.deepEqual(normalizer.appOptions({ bar: barLineRange(17) }, []), {});
  assert.deepEqual(normalizer.appOptions({ line: barLineRange(17) }, []), {});
  assert.deepEqual(normalizer.appOptions({ icon: 'a', bar: barLineRange(12) }, []), { icon: 'a' });
  assert.deepEqual(normalizer.appOptions({ icon: 'a', line: barLineRange(12) }, []), { icon: 'a' });
});

test('bar and line are dropped when any value is not numeric', () => {
  assert.deepEqual(normalizer.appOptions({ bar: [1, 'x', 3] }, []), {});
  assert.deepEqual(normalizer.appOptions({ line: [1, null] }, []), {});
  assert.deepEqual(normalizer.appOptions({ bar: 'not-an-array' }, []), {});

  // Numeric strings are accepted and forwarded unchanged.
  assert.deepEqual(normalizer.appOptions({ bar: ['1', '2'] }, []), { bar: ['1', '2'] });
});

test('barBC only survives together with bar or line', () => {
  assert.deepEqual(normalizer.appOptions({ barBC: '#111111' }, []), {});
  assert.deepEqual(normalizer.appOptions({ bar: [1], barBC: '#111111' }, []), {
    bar: [1],
    barBC: '#111111',
  });
  assert.deepEqual(normalizer.appOptions({ line: [1], barBC: '#111111' }, []), {
    line: [1],
    barBC: '#111111',
  });
});
