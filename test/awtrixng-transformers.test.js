const assert = require('node:assert/strict');
const test = require('node:test');

const {
  InvalidAwtrixNgHomeyPushedAppNameError,
  UnsupportedAwtrixNgPayloadFieldError,
  fromAwtrixNgHomeyPushedAppName,
  toAwtrixNgDisplayPowerPatch,
  toAwtrixNgHomeyPushedAppName,
  toAwtrixNgIndicatorPayload,
  toAwtrixNgNotificationPayload,
  toAwtrixNgPushedAppPayload,
  toAwtrixNgRtttlPayload,
} = require('../.homeybuild/lib/awtrixng/Payload/Transformers');

const assertUnsupportedField = (fn, field, target, reason = 'unsupported-field') => {
  assert.throws(fn, (error) => {
    assert.equal(error instanceof UnsupportedAwtrixNgPayloadFieldError, true);
    assert.equal(error.field, field);
    assert.equal(error.target, target);
    assert.equal(error.reason, reason);
    return true;
  });
};

test('AWTRIX NG Homey pushed app name mapper adds the internal prefix without using homey colon', () => {
  assert.equal(toAwtrixNgHomeyPushedAppName('weather'), 'homey-weather');
  assert.equal(toAwtrixNgHomeyPushedAppName('Weather_1-2'), 'homey-Weather_1-2');
  assert.equal(toAwtrixNgHomeyPushedAppName('abcdefghijklmnopqrstuvwxzy'), 'homey-abcdefghijklmnopqrstuvwxzy');
  assert.equal(toAwtrixNgHomeyPushedAppName('weather').includes('homey:'), false);
});

test('AWTRIX NG Homey pushed app name mapper rejects invalid user input without sanitizing', () => {
  const invalidNames = [
    '',
    'my weather app',
    'weather:outdoor',
    'čidlo',
    'abcdefghijklmnopqrstuvwxyz1',
  ];

  for (const name of invalidNames) {
    assert.throws(
      () => toAwtrixNgHomeyPushedAppName(name),
      (error) => {
        assert.equal(error instanceof InvalidAwtrixNgHomeyPushedAppNameError, true);
        assert.equal(error.value, name);
        assert.equal(error.field, 'name');
        return true;
      },
    );
  }
});

test('AWTRIX NG Homey pushed app name mapper returns user-visible names without prefix', () => {
  assert.equal(fromAwtrixNgHomeyPushedAppName('homey-weather'), 'weather');
  assert.equal(fromAwtrixNgHomeyPushedAppName('homey-Weather_1-2'), 'Weather_1-2');
  assert.equal(fromAwtrixNgHomeyPushedAppName('weather'), undefined);
});

test('AWTRIX NG notification transformer accepts NG-shaped API payload fields unchanged', () => {
  const input = {
    text: 'Doorbell',
    textColor: '#FF0000',
    icon: '1234',
    iconMode: 'pushOnce',
    durationMs: 5000,
    hold: false,
    stack: true,
    wakeup: true,
  };

  assert.deepEqual(toAwtrixNgNotificationPayload(input), input);
});

test('AWTRIX NG notification transformer accepts NG page fields and text fragments unchanged', () => {
  const input = {
    text: [
      { text: 'A', color: '#FF0000' },
      { text: 'B', color: '#00FF00' },
    ],
    textCase: 'asTyped',
    font: 'large',
    textInFront: true,
    textOffsetX: 3,
    textCenter: false,
    backgroundColor: '#000000',
    textBlinkMs: 250,
    textFadeMs: 500,
    progress: 40,
    progressColor: '#FFFFFF',
    progressTrackColor: '#111111',
    scroll: {
      mode: 'static',
      speed: 80,
      direction: 'left',
      entry: 'inline',
      whenFits: 'static',
      gap: 8,
      holdMs: 1000,
    },
    effect: 'Matrix',
    effectSpeed: 2,
    palette: 'Rainbow',
    paletteBlend: true,
    overlay: 'rain',
    barChart: [1, 2, 3],
    lineChart: [3, 2, 1],
    soundRtttl: 'beep:d=4,o=5,b=120:c',
    soundLoop: true,
  };

  assert.deepEqual(toAwtrixNgNotificationPayload(input), input);
});

test('AWTRIX NG notification transformer accepts valid enum values', () => {
  assert.equal(toAwtrixNgNotificationPayload({ textCase: 'inherit' }).textCase, 'inherit');
  assert.equal(toAwtrixNgNotificationPayload({ textCase: 'upper' }).textCase, 'upper');
  assert.equal(toAwtrixNgNotificationPayload({ textCase: 'asTyped' }).textCase, 'asTyped');
  assert.equal(toAwtrixNgNotificationPayload({ iconMode: 'fixed' }).iconMode, 'fixed');
  assert.equal(toAwtrixNgNotificationPayload({ iconMode: 'pushOnce' }).iconMode, 'pushOnce');
  assert.equal(toAwtrixNgNotificationPayload({ iconMode: 'push' }).iconMode, 'push');
  assert.equal(toAwtrixNgNotificationPayload({ font: 'small' }).font, 'small');
  assert.equal(toAwtrixNgNotificationPayload({ font: 'large' }).font, 'large');
  assert.deepEqual(toAwtrixNgNotificationPayload({ scroll: { mode: 'wrap' } }).scroll, { mode: 'wrap' });
});

test('AWTRIX NG display power and RTTTL transformers produce exact API payloads', () => {
  assert.deepEqual(toAwtrixNgDisplayPowerPatch(false), { power: false });
  assert.deepEqual(toAwtrixNgRtttlPayload('beep:d=4,o=5,b=120:c'), {
    rtttl: 'beep:d=4,o=5,b=120:c',
  });
});

test('AWTRIX NG indicator transformer accepts NG-shaped blink and fade payloads', () => {
  assert.deepEqual(toAwtrixNgIndicatorPayload({
    color: '#FF0000',
    blinkMs: 750,
  }), {
    color: '#FF0000',
    blinkMs: 750,
  });
  assert.deepEqual(toAwtrixNgIndicatorPayload({
    color: '#00FF00',
    fadeMs: 1000,
  }), {
    color: '#00FF00',
    fadeMs: 1000,
  });
});

test('AWTRIX NG pushed app transformer accepts NG-shaped app fields unchanged', () => {
  const input = {
    text: '21',
    textColor: '#00AAFF',
    icon: '2422',
    iconMode: 'push',
    durationMs: 7000,
    repeat: 3,
    lifetimeMs: 60000,
    lifetimeExpiry: 'mark',
  };

  assert.deepEqual(toAwtrixNgPushedAppPayload(input), input);
});

test('AWTRIX NG pushed app transformer accepts lifetimeExpiry remove', () => {
  assert.deepEqual(toAwtrixNgPushedAppPayload({
    lifetimeMs: 5000,
    lifetimeExpiry: 'remove',
  }), {
    lifetimeMs: 5000,
    lifetimeExpiry: 'remove',
  });
});

test('AWTRIX NG transformer accepts NG palette payloads unchanged', () => {
  assert.deepEqual(toAwtrixNgNotificationPayload({
    textColor: 'palette',
    palette: ['#111111', '#222222'],
  }), {
    textColor: 'palette',
    palette: ['#111111', '#222222'],
  });
  assert.deepEqual(toAwtrixNgNotificationPayload({
    textColor: 'palette',
    palette: 'Rainbow',
  }), {
    textColor: 'palette',
    palette: 'Rainbow',
  });
  assert.deepEqual(toAwtrixNgNotificationPayload({
    textColor: 'palette',
    palette: [
      { color: '#FF0000', pos: 0 },
      { color: ['HSV', 120, 100, 100], pos: 100 },
    ],
  }), {
    textColor: 'palette',
    palette: [
      { color: '#FF0000', pos: 0 },
      { color: ['HSV', 120, 100, 100], pos: 100 },
    ],
  });
});

test('AWTRIX NG transformer rejects malformed and mixed palette stops', () => {
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    palette: [],
  }), 'palette', 'notification', 'invalid-value');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    palette: ['#FF0000', { color: '#00FF00', pos: 100 }],
  }), 'palette[1]', 'notification', 'invalid-value');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    palette: [{ color: '#FF0000', pos: 101 }],
  }), 'palette[0]', 'notification', 'invalid-value');
});

test('AWTRIX NG transformer accepts native array draw commands unchanged', () => {
  const input = {
    draw: [
      ['pixel', 0, 0, '#FF0000'],
      ['pixels', null, 1, 1, 2, 2],
      ['line', 0, 0, 31, 7],
      ['rect', 0, 0, 10, 5, [0, 255, 0]],
      ['rectFill', 1, 1, 8, 3],
      ['circle', 4, 4, 2, 0x0000FF],
      ['circleFill', 4, 4, 1],
      ['text', 9, 1, 'Hi', '#FFFFFF'],
      ['bitmap', 0, 0, 2, 1, ['#FF0000', '#00FF00']],
      ['bitmap', 0, 0, 1, 1, '/wAA'],
    ],
  };

  assert.deepEqual(toAwtrixNgNotificationPayload(input), input);
});

test('AWTRIX NG transformer rejects legacy object draw commands and malformed native commands', () => {
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    draw: [{ dp: [0, 0, '#FF0000'] }],
  }), 'draw[0]', 'notification', 'invalid-value');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    draw: [['unknown', 0, 0]],
  }), 'draw[0]', 'notification', 'invalid-value');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    draw: [['line', 0, 0, 31]],
  }), 'draw[0]', 'notification', 'invalid-value');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    draw: [['pixels', null, 0, 0, 1]],
  }), 'draw[0]', 'notification', 'invalid-value');
});

test('AWTRIX NG transformer rejects AWTRIX 3 aliases instead of translating them', () => {
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ color: '#FF0000' }), 'color', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ topText: true }), 'topText', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ textOffset: 3 }), 'textOffset', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ center: true }), 'center', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ background: '#000000' }), 'background', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ pushIcon: 1 }), 'pushIcon', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ blinkText: 250 }), 'blinkText', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ fadeText: 500 }), 'fadeText', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ progressC: '#FFFFFF' }), 'progressC', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ progressBC: '#111111' }), 'progressBC', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ noScroll: true }), 'noScroll', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ scrollSpeed: 80 }), 'scrollSpeed', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ gradient: ['#111111', '#222222'] }), 'gradient', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ rainbow: true }), 'rainbow', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ effectSettings: { speed: 2 } }), 'effectSettings', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ rtttl: 'beep:d=4,o=5,b=120:c' }), 'rtttl', 'notification');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ loopSound: true }), 'loopSound', 'notification');
});

test('AWTRIX NG transformer rejects unsupported AWTRIX 3 fields explicitly', () => {
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    text: 'Hello',
    clients: ['192.0.2.20'],
  }), 'clients', 'notification');

  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    barChart: [1, 2, 3],
    barBC: '#000000',
  }), 'barBC', 'notification');

  assertUnsupportedField(() => toAwtrixNgPushedAppPayload({
    text: 'Weather',
    pos: 1,
  }), 'pos', 'pushedApp');
});

test('AWTRIX NG notification transformer accepts repeat as a shared page field', () => {
  const input = {
    text: 'Hello',
    repeat: 3,
  };

  assert.deepEqual(toAwtrixNgNotificationPayload(input), input);
});

test('AWTRIX NG notification transformer keeps pushed-app lifetime fields unsupported', () => {
  assertUnsupportedField(
    () => toAwtrixNgNotificationPayload({ lifetimeMs: 5000 }),
    'lifetimeMs',
    'notification',
  );
  assertUnsupportedField(
    () => toAwtrixNgNotificationPayload({ lifetimeExpiry: 'remove' }),
    'lifetimeExpiry',
    'notification',
  );
});

test('AWTRIX NG pushed app transformer rejects notification-only fields', () => {
  assertUnsupportedField(() => toAwtrixNgPushedAppPayload({ hold: true }), 'hold', 'pushedApp');
  assertUnsupportedField(() => toAwtrixNgPushedAppPayload({ soundRtttl: 'beep:d=4,o=5,b=120:c' }), 'soundRtttl', 'pushedApp');
});

test('AWTRIX NG transformer rejects array pushed app payloads', () => {
  assertUnsupportedField(() => toAwtrixNgPushedAppPayload([
    { text: 'A' },
    { text: 'B' },
  ]), '<payload>', 'pushedApp', 'invalid-value');
});

test('AWTRIX NG transformer rejects unknown fields instead of dropping them', () => {
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    text: 'Hello',
    unknownNgField: true,
  }), 'unknownNgField', 'notification', 'unknown-field');
});

test('AWTRIX NG transformer rejects invalid nested scroll fields and enum values', () => {
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    scroll: {
      mode: 'slide',
    },
  }), 'scroll.mode', 'notification', 'invalid-value');

  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    scroll: {
      mode: 'static',
      delay: 10,
    },
  }), 'scroll.delay', 'notification', 'unknown-field');

  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    scroll: {
      holdMs: -1,
    },
  }), 'scroll.holdMs', 'notification', 'invalid-value');
});

test('AWTRIX NG transformer rejects legacy text fragments', () => {
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({
    text: [
      { t: 'A', c: '#FF0000' },
    ],
  }), 'text[0]', 'notification');
});

test('AWTRIX NG transformer rejects invalid enum values', () => {
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ textCase: 2 }), 'textCase', 'notification', 'invalid-value');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ iconMode: 'push-once' }), 'iconMode', 'notification', 'invalid-value');
  assertUnsupportedField(() => toAwtrixNgNotificationPayload({ font: 'medium' }), 'font', 'notification', 'invalid-value');
  assertUnsupportedField(() => toAwtrixNgPushedAppPayload({ lifetimeExpiry: 1 }), 'lifetimeExpiry', 'pushedApp', 'invalid-value');
});
