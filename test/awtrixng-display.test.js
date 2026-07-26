const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AwtrixNgWeatherOverlayCapabilityId,
  AwtrixNgWeatherOverlayValues,
  isAwtrixNgWeatherOverlayValue,
  toAwtrixNgHomeyWeatherOverlayValue,
  toAwtrixNgWeatherOverlayPatch,
} = require('../.homeybuild/lib/awtrixng/Services/Display');
const { UnsupportedAwtrixNgPayloadFieldError } = require('../.homeybuild/lib/awtrixng/Payload/Transformers');

test('AWTRIX NG weather overlay values are the documented Homey values', () => {
  assert.deepEqual(AwtrixNgWeatherOverlayValues, [
    'none',
    'drizzle',
    'frost',
    'rain',
    'snow',
    'storm',
    'thunder',
  ]);
});

test('AWTRIX NG weather overlay mapper creates display patches without overlaySettings', () => {
  assert.deepEqual(toAwtrixNgWeatherOverlayPatch('none'), {
    overlay: null,
  });
  assert.deepEqual(toAwtrixNgWeatherOverlayPatch('drizzle'), {
    overlay: 'drizzle',
  });
  assert.deepEqual(toAwtrixNgWeatherOverlayPatch('frost'), {
    overlay: 'frost',
  });
  assert.deepEqual(toAwtrixNgWeatherOverlayPatch('rain'), {
    overlay: 'rain',
  });
  assert.deepEqual(toAwtrixNgWeatherOverlayPatch('snow'), {
    overlay: 'snow',
  });
  assert.deepEqual(toAwtrixNgWeatherOverlayPatch('storm'), {
    overlay: 'storm',
  });
  assert.deepEqual(toAwtrixNgWeatherOverlayPatch('thunder'), {
    overlay: 'thunder',
  });
});

test('AWTRIX NG weather overlay mapper rejects unknown Homey values before HTTP', () => {
  for (const value of ['Rain', 'clear', '', null, undefined, 1, true]) {
    assert.throws(
      () => toAwtrixNgWeatherOverlayPatch(value),
      (error) => {
        assert.equal(error instanceof UnsupportedAwtrixNgPayloadFieldError, true);
        assert.equal(error.field, AwtrixNgWeatherOverlayCapabilityId);
        assert.equal(error.target, 'displayOverlay');
        assert.equal(error.reason, 'invalid-value');
        return true;
      },
    );
  }
});

test('AWTRIX NG weather overlay response mapper converts display response overlay to Homey value', () => {
  assert.equal(toAwtrixNgHomeyWeatherOverlayValue(null), 'none');
  assert.equal(toAwtrixNgHomeyWeatherOverlayValue('drizzle'), 'drizzle');
  assert.equal(toAwtrixNgHomeyWeatherOverlayValue('frost'), 'frost');
  assert.equal(toAwtrixNgHomeyWeatherOverlayValue('rain'), 'rain');
  assert.equal(toAwtrixNgHomeyWeatherOverlayValue('snow'), 'snow');
  assert.equal(toAwtrixNgHomeyWeatherOverlayValue('storm'), 'storm');
  assert.equal(toAwtrixNgHomeyWeatherOverlayValue('thunder'), 'thunder');
});

test('AWTRIX NG weather overlay response mapper rejects unknown device values', () => {
  assert.throws(
    () => toAwtrixNgHomeyWeatherOverlayValue('unknown'),
    (error) => {
      assert.equal(error instanceof UnsupportedAwtrixNgPayloadFieldError, true);
      assert.equal(error.field, 'overlay');
      assert.equal(error.target, 'displayOverlay');
      assert.equal(error.reason, 'invalid-value');
      return true;
    },
  );
});

test('AWTRIX NG weather overlay capability id is NG-specific', () => {
  assert.equal(AwtrixNgWeatherOverlayCapabilityId, 'awtrixng_weather_overlay');
});

test('AWTRIX NG weather overlay type guard accepts only supported Homey values', () => {
  assert.equal(isAwtrixNgWeatherOverlayValue('none'), true);
  assert.equal(isAwtrixNgWeatherOverlayValue('rain'), true);
  assert.equal(isAwtrixNgWeatherOverlayValue('Rain'), false);
  assert.equal(isAwtrixNgWeatherOverlayValue(null), false);
});
