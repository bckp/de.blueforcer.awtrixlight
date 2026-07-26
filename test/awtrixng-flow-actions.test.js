const assert = require('node:assert/strict');
const test = require('node:test');

const {
  runAwtrixNgCustomAppAction,
  runAwtrixNgCustomAppRawAction,
  runAwtrixNgDismissNotificationAction,
  runAwtrixNgDisplaySetAction,
  runAwtrixNgIndicatorAction,
  runAwtrixNgIndicatorDismissAction,
  runAwtrixNgNotificationAction,
  runAwtrixNgNotificationRawAction,
  runAwtrixNgRemoveCustomAppAction,
  runAwtrixNgRtttlAction,
  runAwtrixNgWeatherOverlayAction,
} = require('../.homeybuild/drivers/awtrixng/flow-actions');
const { AwtrixNgApiError } = require('../.homeybuild/lib/awtrixng/Api/ErrorParser');
const { UnsupportedAwtrixNgPayloadFieldError } = require('../.homeybuild/lib/awtrixng/Payload/Transformers');
const { AwtrixNgWeatherOverlayCapabilityId } = require('../.homeybuild/lib/awtrixng/Services/Display');

const ok = { ok: true };

const createFakeDevice = (client) => {
  const calls = [];

  return {
    calls,
    device: {
      client,
      async setCapabilityValue(capabilityId, value) {
        calls.push({ method: 'setCapabilityValue', capabilityId, value });
      },
    },
  };
};

const createFakeClient = () => {
  const calls = [];

  return {
    calls,
    client: {
      async sendNotification(payload) {
        calls.push({ method: 'sendNotification', payload });
        return ok;
      },
      async dismissActiveNotification() {
        calls.push({ method: 'dismissActiveNotification' });
        return ok;
      },
      async patchDisplay(patch) {
        calls.push({ method: 'patchDisplay', patch });
        return ok;
      },
      async playRtttl(rtttl) {
        calls.push({ method: 'playRtttl', rtttl });
        return ok;
      },
      async putIndicator(id, payload) {
        calls.push({ method: 'putIndicator', id, payload });
        return ok;
      },
      async deleteIndicator(id) {
        calls.push({ method: 'deleteIndicator', id });
        return ok;
      },
      async putPushedApp(name, payload) {
        calls.push({ method: 'putPushedApp', name, payload });
        return ok;
      },
      async deleteApp(name) {
        calls.push({ method: 'deleteApp', name });
        return ok;
      },
    },
  };
};

test('AWTRIX NG notification flow sends Homey duration as NG durationMs', async () => {
  const fake = createFakeClient();

  await runAwtrixNgNotificationAction({
    device: { client: fake.client },
    msg: 'Doorbell',
    icon: {
      id: '1234',
      name: 'doorbell',
    },
    textColor: '#ff0000',
    duration: 5000,
  });

  assert.deepEqual(fake.calls, [{
    method: 'sendNotification',
    payload: {
      text: 'Doorbell',
      icon: '1234',
      textColor: '#ff0000',
      durationMs: 5000,
    },
  }]);
});

test('AWTRIX NG notification flow omits durationMs when Homey duration is not set', async () => {
  const fake = createFakeClient();

  await runAwtrixNgNotificationAction({
    device: { client: fake.client },
    msg: 'Doorbell',
    textColor: '#ff0000',
  });

  assert.deepEqual(fake.calls, [{
    method: 'sendNotification',
    payload: {
      text: 'Doorbell',
      textColor: '#ff0000',
    },
  }]);
});

test('AWTRIX NG notification flow omits empty icon selection', async () => {
  const fake = createFakeClient();

  await runAwtrixNgNotificationAction({
    device: { client: fake.client },
    msg: 'Doorbell',
    icon: {
      id: '-',
      name: 'Empty',
    },
  });

  assert.deepEqual(fake.calls, [{
    method: 'sendNotification',
    payload: {
      text: 'Doorbell',
    },
  }]);
});

test('AWTRIX NG notification flow sends hold when requested by sticky flow', async () => {
  const fake = createFakeClient();

  await runAwtrixNgNotificationAction({
    device: { client: fake.client },
    msg: 'Sticky',
    icon: {
      id: '4321',
      name: 'pin',
    },
    textColor: '#00ff00',
    hold: true,
  });

  assert.deepEqual(fake.calls, [{
    method: 'sendNotification',
    payload: {
      text: 'Sticky',
      icon: '4321',
      textColor: '#00ff00',
      hold: true,
    },
  }]);
});

test('AWTRIX NG notification flow with hold omits empty icon selection', async () => {
  const fake = createFakeClient();

  await runAwtrixNgNotificationAction({
    device: { client: fake.client },
    msg: 'Sticky',
    icon: {
      id: '-',
      name: 'Empty',
    },
    hold: true,
  });

  assert.deepEqual(fake.calls, [{
    method: 'sendNotification',
    payload: {
      text: 'Sticky',
      hold: true,
    },
  }]);
});

test('AWTRIX NG raw notification flow sends supported NG payload unchanged', async () => {
  const fake = createFakeClient();

  await runAwtrixNgNotificationRawAction({
    device: { client: fake.client },
    options: '{"text":"Doorbell","textColor":"#ff0000","durationMs":5000,"scroll":{"mode":"static"},"soundRtttl":"beep:d=4,o=5,b=120:c"}',
  });

  assert.deepEqual(fake.calls, [{
    method: 'sendNotification',
    payload: {
      text: 'Doorbell',
      textColor: '#ff0000',
      durationMs: 5000,
      scroll: {
        mode: 'static',
      },
      soundRtttl: 'beep:d=4,o=5,b=120:c',
    },
  }]);
});

test('AWTRIX NG raw notification flow rejects unknown and AWTRIX 3-only fields before HTTP', async () => {
  const unsupportedPayloads = [
    ['unknownNgField', '{"unknownNgField":true}', 'unknown-field'],
    ['duration', '{"duration":5}', 'unsupported-field'],
    ['noScroll', '{"noScroll":true}', 'unsupported-field'],
    ['clients', '{"clients":["192.0.2.20"]}', 'unsupported-field'],
    ['barBC', '{"barBC":"#000000"}', 'unsupported-field'],
    ['pos', '{"pos":1}', 'unsupported-field'],
    ['save', '{"save":true}', 'unsupported-field'],
  ];

  for (const [field, options, reason] of unsupportedPayloads) {
    const fake = createFakeClient();

    await assert.rejects(
      () => runAwtrixNgNotificationRawAction({
        device: { client: fake.client },
        options,
      }),
      (error) => {
        assert.equal(error instanceof UnsupportedAwtrixNgPayloadFieldError, true);
        assert.equal(error.field, field);
        assert.equal(error.target, 'notification');
        assert.equal(error.reason, reason);
        return true;
      },
    );
    assert.deepEqual(fake.calls, []);
  }
});

test('AWTRIX NG raw notification flow rejects invalid JSON and array payloads before HTTP', async () => {
  const fake = createFakeClient();

  await assert.rejects(
    () => runAwtrixNgNotificationRawAction({
      device: { client: fake.client },
      options: '{',
    }),
    /Payload must be valid JSON/,
  );

  await assert.rejects(
    () => runAwtrixNgNotificationRawAction({
      device: { client: fake.client },
      options: '[{"text":"A"}]',
    }),
    /Payload must be a JSON object/,
  );

  assert.deepEqual(fake.calls, []);
});

test('AWTRIX NG raw notification flow propagates NG API errors with field details', async () => {
  const fake = createFakeClient();
  const apiError = new AwtrixNgApiError({
    method: 'POST',
    url: 'http://awtrix-ng.local/api/v1/notifications',
    httpStatus: 422,
    code: 'validationFailed',
    message: 'unknown effect',
    field: 'effect',
    rawBody: {
      error: {
        code: 'validationFailed',
        message: 'unknown effect',
        field: 'effect',
      },
    },
  });

  fake.client.sendNotification = async (payload) => {
    fake.calls.push({ method: 'sendNotification', payload });
    throw apiError;
  };

  await assert.rejects(
    () => runAwtrixNgNotificationRawAction({
      device: { client: fake.client },
      options: '{"text":"Doorbell","effect":"UnknownEffect"}',
    }),
    (error) => {
      assert.equal(error, apiError);
      assert.equal(error.httpStatus, 422);
      assert.equal(error.code, 'validationFailed');
      assert.equal(error.field, 'effect');
      return true;
    },
  );
  assert.deepEqual(fake.calls, [{
    method: 'sendNotification',
    payload: {
      text: 'Doorbell',
      effect: 'UnknownEffect',
    },
  }]);
});

test('AWTRIX NG dismiss notification flow calls dismiss endpoint helper', async () => {
  const fake = createFakeClient();

  await runAwtrixNgDismissNotificationAction({ device: { client: fake.client } });

  assert.deepEqual(fake.calls, [{ method: 'dismissActiveNotification' }]);
});

test('AWTRIX NG display flow maps dropdown values to power booleans', async () => {
  const fake = createFakeClient();

  await runAwtrixNgDisplaySetAction({ device: { client: fake.client }, power: '1' });
  await runAwtrixNgDisplaySetAction({ device: { client: fake.client }, power: '0' });

  assert.deepEqual(fake.calls, [
    { method: 'patchDisplay', patch: { power: true } },
    { method: 'patchDisplay', patch: { power: false } },
  ]);
});

test('AWTRIX NG weather overlay flow maps overlay values and syncs capability after success', async () => {
  const fake = createFakeClient();
  const fakeDevice = createFakeDevice(fake.client);

  await runAwtrixNgWeatherOverlayAction({ device: fakeDevice.device, overlay: 'none' });
  await runAwtrixNgWeatherOverlayAction({ device: fakeDevice.device, overlay: 'rain' });

  assert.deepEqual(fake.calls, [
    { method: 'patchDisplay', patch: { overlay: null } },
    { method: 'patchDisplay', patch: { overlay: 'rain' } },
  ]);
  assert.deepEqual(fakeDevice.calls, [
    { method: 'setCapabilityValue', capabilityId: AwtrixNgWeatherOverlayCapabilityId, value: 'none' },
    { method: 'setCapabilityValue', capabilityId: AwtrixNgWeatherOverlayCapabilityId, value: 'rain' },
  ]);
});

test('AWTRIX NG weather overlay flow rejects unsupported values before HTTP', async () => {
  const fake = createFakeClient();
  const fakeDevice = createFakeDevice(fake.client);

  await assert.rejects(
    () => runAwtrixNgWeatherOverlayAction({ device: fakeDevice.device, overlay: 'clear' }),
    (error) => {
      assert.equal(error instanceof UnsupportedAwtrixNgPayloadFieldError, true);
      assert.equal(error.field, AwtrixNgWeatherOverlayCapabilityId);
      assert.equal(error.target, 'displayOverlay');
      assert.equal(error.reason, 'invalid-value');
      return true;
    },
  );
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(fakeDevice.calls, []);
});

test('AWTRIX NG RTTTL flow passes transformed RTTTL string to client', async () => {
  const fake = createFakeClient();

  await runAwtrixNgRtttlAction({
    device: { client: fake.client },
    rtttl: 'beep:d=4,o=5,b=120:c',
  });

  assert.deepEqual(fake.calls, [{
    method: 'playRtttl',
    rtttl: 'beep:d=4,o=5,b=120:c',
  }]);
});

test('AWTRIX NG indicator flow maps no effect, blink and fade to NG payloads', async () => {
  const fake = createFakeClient();

  await runAwtrixNgIndicatorAction({
    device: { client: fake.client },
    indicator: '1',
    color: '#111111',
    effect: '-',
    durationMs: 1000,
  });
  await runAwtrixNgIndicatorAction({
    device: { client: fake.client },
    indicator: '2',
    color: '#222222',
    effect: 'blink',
    durationMs: 750,
  });
  await runAwtrixNgIndicatorAction({
    device: { client: fake.client },
    indicator: '3',
    color: '#333333',
    effect: 'fade',
    durationMs: 1250,
  });

  assert.deepEqual(fake.calls, [
    { method: 'putIndicator', id: 1, payload: { color: '#111111' } },
    { method: 'putIndicator', id: 2, payload: { color: '#222222', blinkMs: 750 } },
    { method: 'putIndicator', id: 3, payload: { color: '#333333', fadeMs: 1250 } },
  ]);
});

test('AWTRIX NG indicator dismiss flow clears selected indicator', async () => {
  const fake = createFakeClient();

  await runAwtrixNgIndicatorDismissAction({
    device: { client: fake.client },
    indicator: '2',
  });

  assert.deepEqual(fake.calls, [{ method: 'deleteIndicator', id: 2 }]);
});

test('AWTRIX NG custom app flow maps user name to internal homey-prefixed pushed app and sends NG payload', async () => {
  const fake = createFakeClient();

  await runAwtrixNgCustomAppAction({
    device: { client: fake.client },
    name: 'weather',
    msg: '21C',
    icon: {
      id: 'homey',
      name: 'homey',
    },
    textColor: '#00aaff',
    duration: 5000,
    options: '{"scroll":{"mode":"static"},"repeat":2,"lifetimeMs":60000,"durationMs":9999}',
  });

  assert.deepEqual(fake.calls, [{
    method: 'putPushedApp',
    name: 'homey-weather',
    payload: {
      scroll: {
        mode: 'static',
      },
      repeat: 2,
      lifetimeMs: 60000,
      text: '21C',
      icon: 'homey',
      textColor: '#00aaff',
      durationMs: 5000,
    },
  }]);
  assert.equal(fake.calls[0].name.includes('homey:'), false);
});

test('AWTRIX NG custom app flow omits empty icon selection and keeps NG JSON options durationMs', async () => {
  const fake = createFakeClient();

  await runAwtrixNgCustomAppAction({
    device: { client: fake.client },
    name: 'status',
    icon: {
      id: '-',
      name: 'Empty',
    },
    options: '{"text":"OK","textColor":"palette","palette":"Rainbow","durationMs":1000}',
  });

  assert.deepEqual(fake.calls, [{
    method: 'putPushedApp',
    name: 'homey-status',
    payload: {
      text: 'OK',
      textColor: 'palette',
      palette: 'Rainbow',
      durationMs: 1000,
    },
  }]);
});

test('AWTRIX NG custom app flow omits durationMs when neither Homey duration nor JSON durationMs is set', async () => {
  const fake = createFakeClient();

  await runAwtrixNgCustomAppAction({
    device: { client: fake.client },
    name: 'status',
    msg: 'OK',
    options: '{"textColor":"#ffffff"}',
  });

  assert.deepEqual(fake.calls, [{
    method: 'putPushedApp',
    name: 'homey-status',
    payload: {
      text: 'OK',
      textColor: '#ffffff',
    },
  }]);
});

test('AWTRIX NG custom app flow treats missing or empty JSON options as an empty object', async () => {
  const missingOptionsFake = createFakeClient();
  const emptyOptionsFake = createFakeClient();

  await runAwtrixNgCustomAppAction({
    device: { client: missingOptionsFake.client },
    name: 'status',
    msg: 'OK',
    textColor: '#ffffff',
  });
  await runAwtrixNgCustomAppAction({
    device: { client: emptyOptionsFake.client },
    name: 'weather',
    msg: '21C',
    options: '   ',
  });

  assert.deepEqual(missingOptionsFake.calls, [{
    method: 'putPushedApp',
    name: 'homey-status',
    payload: {
      text: 'OK',
      textColor: '#ffffff',
    },
  }]);
  assert.deepEqual(emptyOptionsFake.calls, [{
    method: 'putPushedApp',
    name: 'homey-weather',
    payload: {
      text: '21C',
    },
  }]);
});

test('AWTRIX NG raw custom app flow maps user name and sends supported NG pushed app payload unchanged', async () => {
  const fake = createFakeClient();

  await runAwtrixNgCustomAppRawAction({
    device: { client: fake.client },
    name: 'weather',
    options: '{"text":"21C","textColor":"#00aaff","durationMs":5000,"repeat":2,"lifetimeMs":60000,"scroll":{"mode":"static"}}',
  });

  assert.deepEqual(fake.calls, [{
    method: 'putPushedApp',
    name: 'homey-weather',
    payload: {
      text: '21C',
      textColor: '#00aaff',
      durationMs: 5000,
      repeat: 2,
      lifetimeMs: 60000,
      scroll: {
        mode: 'static',
      },
    },
  }]);
});

test('AWTRIX NG raw custom app flow rejects unknown and AWTRIX 3-only fields before HTTP', async () => {
  const unsupportedPayloads = [
    ['unknownNgField', '{"unknownNgField":true}', 'unknown-field'],
    ['duration', '{"duration":5}', 'unsupported-field'],
    ['noScroll', '{"noScroll":true}', 'unsupported-field'],
    ['clients', '{"clients":["192.0.2.20"]}', 'unsupported-field'],
    ['barBC', '{"barBC":"#000000"}', 'unsupported-field'],
    ['pos', '{"pos":1}', 'unsupported-field'],
    ['save', '{"save":true}', 'unsupported-field'],
  ];

  for (const [field, options, reason] of unsupportedPayloads) {
    const fake = createFakeClient();

    await assert.rejects(
      () => runAwtrixNgCustomAppRawAction({
        device: { client: fake.client },
        name: 'weather',
        options,
      }),
      (error) => {
        assert.equal(error instanceof UnsupportedAwtrixNgPayloadFieldError, true);
        assert.equal(error.field, field);
        assert.equal(error.target, 'pushedApp');
        assert.equal(error.reason, reason);
        return true;
      },
    );
    assert.deepEqual(fake.calls, []);
  }
});

test('AWTRIX NG raw custom app flow rejects invalid names and array payloads before HTTP', async () => {
  const fake = createFakeClient();

  await assert.rejects(
    () => runAwtrixNgCustomAppRawAction({
      device: { client: fake.client },
      name: 'my weather app',
      options: '{"text":"21C"}',
    }),
    /must match \^\[A-Za-z0-9_-\]\{1,26\}\$/,
  );

  await assert.rejects(
    () => runAwtrixNgCustomAppRawAction({
      device: { client: fake.client },
      name: 'weather',
      options: '[{"text":"21C"}]',
    }),
    /Payload must be a JSON object/,
  );

  assert.deepEqual(fake.calls, []);
});

test('AWTRIX NG remove custom app flow uses the same name mapping as create', async () => {
  const fake = createFakeClient();

  await runAwtrixNgRemoveCustomAppAction({
    device: { client: fake.client },
    name: 'weather',
  });

  assert.deepEqual(fake.calls, [{
    method: 'deleteApp',
    name: 'homey-weather',
  }]);
});

test('AWTRIX NG custom app flow rejects invalid names before HTTP without sanitizing', async () => {
  const fake = createFakeClient();

  await assert.rejects(
    () => runAwtrixNgCustomAppAction({
      device: { client: fake.client },
      name: 'my weather app',
      msg: '21C',
      duration: 5000,
      options: '{}',
    }),
    /must match \^\[A-Za-z0-9_-\]\{1,26\}\$/,
  );

  await assert.rejects(
    () => runAwtrixNgRemoveCustomAppAction({
      device: { client: fake.client },
      name: 'abcdefghijklmnopqrstuvwxyz1',
    }),
    /must match \^\[A-Za-z0-9_-\]\{1,26\}\$/,
  );

  assert.deepEqual(fake.calls, []);
});

test('AWTRIX NG custom app flow rejects unsupported pos and array payloads before HTTP', async () => {
  const fake = createFakeClient();

  await assert.rejects(
    () => runAwtrixNgCustomAppAction({
      device: { client: fake.client },
      name: 'weather',
      options: '{"pos":1}',
    }),
    /field "pos" is not supported/,
  );

  await assert.rejects(
    () => runAwtrixNgCustomAppAction({
      device: { client: fake.client },
      name: 'weather',
      options: '[]',
    }),
    /Array payloads are not supported/,
  );

  assert.deepEqual(fake.calls, []);
});

test('AWTRIX NG flow action fails when device client is not initialized', async () => {
  await assert.rejects(
    () => runAwtrixNgDismissNotificationAction({ device: {} }),
    /Device client is not initialized\./,
  );
});

test('AWTRIX NG flow action propagates invalid argument errors as failures', async () => {
  const fake = createFakeClient();

  await assert.rejects(
    () => runAwtrixNgIndicatorAction({
      device: { client: fake.client },
      indicator: '4',
      color: '#ffffff',
      effect: '-',
      durationMs: 1000,
    }),
    /Invalid indicator id: 4/,
  );

  assert.deepEqual(fake.calls, []);
});
