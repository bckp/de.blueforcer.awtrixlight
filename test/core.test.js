const assert = require('node:assert/strict');
const test = require('node:test');

const normalizer = require('../.homeybuild/lib/awtrix3/Normalizer');
const validator = require('../.homeybuild/lib/awtrix3/Validator');
const Poll = require('../.homeybuild/lib/awtrix3/Poll').default;
const { statusFromHttpCode } = require('../.homeybuild/lib/awtrix3/Api/Client');
const { Status } = require('../.homeybuild/lib/awtrix3/Api/Response');

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

test('settings retain transition effect zero', () => {
  assert.deepEqual(normalizer.settingOptions({ TEFF: 0 }), { TEFF: 0 });
});

test('HTTP status mapping does not treat bad requests as success', () => {
  assert.equal(statusFromHttpCode(200), Status.Ok);
  assert.equal(statusFromHttpCode(399), Status.Ok);
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
  const poll = new Poll(() => {}, homey, 10, 50);

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
