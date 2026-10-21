const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const Api = require('../.homeybuild/lib/awtrix3/Api/Api').default;
const { Status } = require('../.homeybuild/lib/awtrix3/Api/Response');
const {
  runSharedDismissNotificationAction,
  runSharedDisplaySetAction,
  autocompleteSharedIconAction,
  runSharedIndicatorAction,
  runSharedIndicatorDismissAction,
  runSharedNotificationAction,
  runSharedNotificationRawAction,
  runSharedApplicationAction,
  runSharedApplicationRawAction,
  runSharedApplicationRemoveAction,
  runSharedRtttlAction,
  runSharedStickyNotificationAction,
  runSharedWeatherOverlayAction,
} = require('../.homeybuild/drivers/shared-flow-actions');
const {
  createFakeAwtrix3Device,
  fakeAwtrix3Client,
} = require('./helpers/fake-homey');

const ok = { ok: true };

const loadAwtrixApp = () => {
  const originalLoad = Module._load;

  class FakeHomeyApp {}

  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') {
      return { App: FakeHomeyApp };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../.homeybuild/app');
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    return require('../.homeybuild/app');
  } finally {
    Module._load = originalLoad;
  }
};

const createAppFlowHarness = () => {
  const actionCards = new Map();
  const homey = {
    flow: {
      getActionCard(id) {
        if (!actionCards.has(id)) {
          const flowArguments = new Map();
          const card = {
            flowArguments,
            runListener: undefined,
            registerRunListener(listener) {
              this.runListener = listener;
              return this;
            },
            getArgument(name) {
              if (!flowArguments.has(name)) {
                flowArguments.set(name, {
                  autocompleteListener: undefined,
                  registerAutocompleteListener(listener) {
                    this.autocompleteListener = listener;
                    return this;
                  },
                });
              }
              return flowArguments.get(name);
            },
          };
          actionCards.set(id, card);
        }
        return actionCards.get(id);
      },
    },
  };
  const AwtrixApp = loadAwtrixApp();
  const app = new AwtrixApp();
  app.homey = homey;
  app.log = () => undefined;

  return { actionCards, app };
};

const createAwtrix3Device = () => {
  const calls = [];

  return {
    calls,
    device: {
      getAwtrixDeviceType() {
        return 'awtrix3';
      },
      icons: {
        async find(query) {
          calls.push({ method: 'findIcon', query });
          return [{ id: 'homey', name: 'homey' }];
        },
      },
      async cmdNotify(msg, params) {
        calls.push({ method: 'cmdNotify', msg, params });
      },
      async cmdDismiss() {
        calls.push({ method: 'cmdDismiss' });
      },
      async cmdPower(power) {
        calls.push({ method: 'cmdPower', power });
      },
      async cmdRtttl(rtttl) {
        calls.push({ method: 'cmdRtttl', rtttl });
      },
      async cmdIndicator(id, options) {
        calls.push({ method: 'cmdIndicator', id, options });
      },
      async cmdCustomApp(name, params) {
        calls.push({ method: 'cmdCustomApp', name, params });
      },
      async cmdRemoveCustomApp(name) {
        calls.push({ method: 'cmdRemoveCustomApp', name });
      },
    },
  };
};

const createAwtrixNgDevice = () => {
  const calls = [];

  return {
    calls,
    device: {
      getAwtrixDeviceType() {
        return 'awtrixng';
      },
      icons: {
        async find(query) {
          calls.push({ method: 'findIcon', query });
          return [{ id: 'ng-icon', name: 'ng icon' }];
        },
      },
      hasCapability(capabilityId) {
        return capabilityId === 'awtrixng_weather_overlay';
      },
      async setCapabilityValue(capabilityId, value) {
        calls.push({ method: 'setCapabilityValue', capabilityId, value });
      },
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
    },
  };
};

test('shared icon autocomplete dispatches to selected device icon service', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  assert.deepEqual(await autocompleteSharedIconAction('home', { device: awtrix3.device }), [{ id: 'homey', name: 'homey' }]);
  assert.deepEqual(await autocompleteSharedIconAction('ng', { device: awtrixNg.device }), [{ id: 'ng-icon', name: 'ng icon' }]);

  assert.deepEqual(awtrix3.calls, [{ method: 'findIcon', query: 'home' }]);
  assert.deepEqual(awtrixNg.calls, [{ method: 'findIcon', query: 'ng' }]);
});

test('deprecated applicationIcon registers a compatible AWTRIX 3 runtime adapter', async () => {
  const awtrix3 = createAwtrix3Device();
  const { actionCards, app } = createAppFlowHarness();

  await app.onInit();

  const card = actionCards.get('applicationIcon');
  assert.ok(card);
  assert.equal(typeof card.runListener, 'function');

  await card.runListener({
    device: awtrix3.device,
    name: 'weather',
    msg: '21C',
    icon: { id: 'homey', name: 'homey' },
    options: '{"effect":"Rainbow"}',
  });
  await card.runListener({
    device: awtrix3.device,
    name: { id: 'forecast', name: 'Forecast label' },
    msg: '22C',
    icon: { id: '-', name: 'None' },
    options: '',
  });
  await card.runListener({
    device: awtrix3.device,
    name: { name: 'fallback' },
    msg: '23C',
    icon: { id: '-', name: 'None' },
    options: '',
  });

  assert.deepEqual(awtrix3.calls, [
    {
      method: 'cmdCustomApp',
      name: 'weather',
      params: { effect: 'Rainbow', text: '21C', icon: 'homey' },
    },
    {
      method: 'cmdCustomApp',
      name: 'forecast',
      params: { text: '22C' },
    },
    {
      method: 'cmdCustomApp',
      name: 'fallback',
      params: { text: '23C' },
    },
  ]);

  const iconAutocomplete = card.flowArguments.get('icon').autocompleteListener;
  assert.deepEqual(await iconAutocomplete('hom', { device: awtrix3.device }), [{ id: 'homey', name: 'homey' }]);
  assert.deepEqual(awtrix3.calls.at(-1), { method: 'findIcon', query: 'hom' });

  const nameAutocomplete = card.flowArguments.get('name').autocompleteListener;
  assert.deepEqual(await nameAutocomplete('my app'), [{ id: 'my app', name: 'my app' }]);
  assert.deepEqual(await nameAutocomplete('   '), []);
});

test('deprecated applicationIcon rejects blank and invalid legacy names before AWTRIX 3 dispatch', async () => {
  const awtrix3 = createAwtrix3Device();
  const { actionCards, app } = createAppFlowHarness();

  await app.onInit();
  const { runListener } = actionCards.get('applicationIcon');
  const invalidNames = ['', '   ', {}, { id: ' ', name: '' }, 42, null, []];

  for (const name of invalidNames) {
    await assert.rejects(
      () => runListener({
        device: awtrix3.device,
        name,
        msg: 'ignored',
        icon: { id: '-', name: 'None' },
        options: '',
      }),
      /Legacy application name must be a non-empty string or autocomplete selection\./,
    );
  }

  assert.deepEqual(awtrix3.calls, []);
});

test('shared notification flow dispatches to AWTRIX 3 and AWTRIX NG implementations', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedNotificationAction({
    device: awtrix3.device,
    msg: 'hello',
    color: '#ffffff',
    duration: 2500,
    icon: { id: 'homey', name: 'homey' },
  });
  await runSharedNotificationAction({
    device: awtrixNg.device,
    msg: 'hi',
    color: '#00ff00',
    duration: 3000,
    icon: { id: 'ng-icon', name: 'ng icon' },
  });

  assert.deepEqual(awtrix3.calls, [{
    method: 'cmdNotify',
    msg: 'hello',
    params: {
      color: '#ffffff',
      duration: 3,
      icon: 'homey',
    },
  }]);
  assert.deepEqual(awtrixNg.calls, [{
    method: 'sendNotification',
    payload: {
      text: 'hi',
      textColor: '#00ff00',
      durationMs: 3000,
      icon: 'ng-icon',
    },
  }]);
});

test('shared raw notification flow dispatches options-only payloads to AWTRIX 3 and AWTRIX NG implementations', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedNotificationRawAction({
    device: awtrix3.device,
    options: '{"text":"legacy message","color":"#ffffff","duration":2}',
  });
  await runSharedNotificationRawAction({
    device: awtrixNg.device,
    options: '{"text":"ng message","textColor":"#00ff00","durationMs":2000}',
  });

  assert.deepEqual(awtrix3.calls, [{
    method: 'cmdNotify',
    msg: '',
    params: {
      text: 'legacy message',
      color: '#ffffff',
      duration: 2,
    },
  }]);
  assert.deepEqual(awtrixNg.calls, [{
    method: 'sendNotification',
    payload: {
      text: 'ng message',
      textColor: '#00ff00',
      durationMs: 2000,
    },
  }]);
});

test('shared AWTRIX 3 JSON flows reject malformed and non-object options before device calls', async () => {
  const notificationDevice = createAwtrix3Device();
  const applicationDevice = createAwtrix3Device();

  await assert.rejects(
    () => runSharedNotificationRawAction({
      device: notificationDevice.device,
      options: '{invalid',
    }),
    /Notification options must be valid JSON\./,
  );
  await assert.rejects(
    () => runSharedNotificationRawAction({
      device: notificationDevice.device,
      options: '[]',
    }),
    /Notification options must be a JSON object\./,
  );
  await assert.rejects(
    () => runSharedApplicationAction({
      device: applicationDevice.device,
      name: 'weather',
      msg: '',
      options: 'null',
    }),
    /Custom app options must be a JSON object\./,
  );
  await assert.rejects(
    () => runSharedApplicationAction({
      device: applicationDevice.device,
      name: 'weather',
      msg: '',
      options: '{invalid',
    }),
    /Custom app options must be valid JSON\./,
  );

  assert.deepEqual(notificationDevice.calls, []);
  assert.deepEqual(applicationDevice.calls, []);
});

test('shared sticky notification flow dispatches to AWTRIX 3 and AWTRIX NG implementations', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedStickyNotificationAction({
    device: awtrix3.device,
    msg: 'sticky',
    color: '#ffffff',
    icon: { id: 'homey', name: 'homey' },
  });
  await runSharedStickyNotificationAction({
    device: awtrixNg.device,
    msg: 'ng sticky',
    color: '#00ff00',
    icon: { id: 'ng-icon', name: 'ng icon' },
  });

  assert.deepEqual(awtrix3.calls, [{
    method: 'cmdNotify',
    msg: 'sticky',
    params: {
      color: '#ffffff',
      hold: true,
      icon: 'homey',
    },
  }]);
  assert.deepEqual(awtrixNg.calls, [{
    method: 'sendNotification',
    payload: {
      text: 'ng sticky',
      textColor: '#00ff00',
      hold: true,
      icon: 'ng-icon',
    },
  }]);
});

test('shared dismiss notification flow dispatches to AWTRIX 3 and AWTRIX NG implementations', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedDismissNotificationAction({ device: awtrix3.device });
  await runSharedDismissNotificationAction({ device: awtrixNg.device });

  assert.deepEqual(awtrix3.calls, [{ method: 'cmdDismiss' }]);
  assert.deepEqual(awtrixNg.calls, [{ method: 'dismissActiveNotification' }]);
});

test('shared display flow dispatches to AWTRIX 3 and AWTRIX NG implementations', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedDisplaySetAction({ device: awtrix3.device, power: '1' });
  await runSharedDisplaySetAction({ device: awtrixNg.device, power: '0' });

  assert.deepEqual(awtrix3.calls, [{ method: 'cmdPower', power: true }]);
  assert.deepEqual(awtrixNg.calls, [{ method: 'patchDisplay', patch: { power: false } }]);
});

test('shared AWTRIX 3 flow propagates failed writes and resolves successful writes', async () => {
  const client = fakeAwtrix3Client({ status: Status.Error });
  const api = new Api(client, createFakeAwtrix3Device());
  const device = {
    getAwtrixDeviceType() {
      return 'awtrix3';
    },
    async cmdPower(power) {
      await api.power(power);
    },
  };

  await assert.rejects(
    () => runSharedDisplaySetAction({ device, power: '1' }),
    /api\.error\.commandFailed/,
  );

  client.response = { status: Status.Ok };
  await assert.doesNotReject(
    () => runSharedDisplaySetAction({ device, power: '0' }),
  );
});

test('shared RTTTL flow dispatches to AWTRIX 3 and AWTRIX NG implementations', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedRtttlAction({ device: awtrix3.device, rtttl: 'beep:d=4,o=5,b=120:c' });
  await runSharedRtttlAction({ device: awtrixNg.device, rtttl: 'beep:d=4,o=5,b=120:d' });

  assert.deepEqual(awtrix3.calls, [{ method: 'cmdRtttl', rtttl: 'beep:d=4,o=5,b=120:c' }]);
  assert.deepEqual(awtrixNg.calls, [{ method: 'playRtttl', rtttl: 'beep:d=4,o=5,b=120:d' }]);
});

test('shared indicator flow dispatches to AWTRIX 3 and AWTRIX NG implementations', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedIndicatorAction({
    device: awtrix3.device,
    indicator: '2',
    color: '#ff0000',
    effect: 'blink',
    duration: 1200,
  });
  await runSharedIndicatorAction({
    device: awtrixNg.device,
    indicator: '3',
    color: '#00ff00',
    effect: 'fade',
    duration: 2500,
  });

  assert.deepEqual(awtrix3.calls, [{
    method: 'cmdIndicator',
    id: '2',
    options: { color: '#ff0000', effect: 'blink', duration: 1200 },
  }]);
  assert.deepEqual(awtrixNg.calls, [{ method: 'putIndicator', id: 3, payload: { color: '#00ff00', fadeMs: 2500 } }]);
});

test('shared indicator dismiss flow dispatches to AWTRIX 3 and AWTRIX NG implementations', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedIndicatorDismissAction({ device: awtrix3.device, indicator: '2' });
  await runSharedIndicatorDismissAction({ device: awtrixNg.device, indicator: '3' });

  assert.deepEqual(awtrix3.calls, [{ method: 'cmdIndicator', id: '2', options: {} }]);
  assert.deepEqual(awtrixNg.calls, [{ method: 'deleteIndicator', id: 3 }]);
});

test('shared application flow dispatches to AWTRIX 3 and AWTRIX NG implementations', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedApplicationAction({
    device: awtrix3.device,
    name: 'weather',
    msg: '21C',
    color: '#ffffff',
    duration: 2500,
    icon: { id: 'homey', name: 'homey' },
    options: '{"text":"from options","effect":"Rainbow","duration":9}',
  });
  await runSharedApplicationAction({
    device: awtrixNg.device,
    name: 'weather',
    msg: '22C',
    color: '#00ff00',
    duration: 3000,
    icon: { id: 'ng-icon', name: 'ng icon' },
    options: '{"scroll":{"mode":"static"},"durationMs":9999}',
  });

  assert.deepEqual(awtrix3.calls, [{
    method: 'cmdCustomApp',
    name: 'weather',
    params: {
      text: '21C',
      effect: 'Rainbow',
      duration: 3,
      color: '#ffffff',
      icon: 'homey',
    },
  }]);
  assert.deepEqual(awtrixNg.calls, [{
    method: 'putPushedApp',
    name: 'homey-weather',
    payload: {
      scroll: {
        mode: 'static',
      },
      text: '22C',
      textColor: '#00ff00',
      durationMs: 3000,
      icon: 'ng-icon',
    },
  }]);
});

test('shared application raw flow remains AWTRIX NG-only', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedApplicationRawAction({
    device: awtrixNg.device,
    name: 'weather',
    options: '{"text":"22C","textColor":"#00ff00","durationMs":3000}',
  });

  assert.deepEqual(awtrixNg.calls, [{
    method: 'putPushedApp',
    name: 'homey-weather',
    payload: {
      text: '22C',
      textColor: '#00ff00',
      durationMs: 3000,
    },
  }]);

  await assert.rejects(
    () => runSharedApplicationRawAction({
      device: awtrix3.device,
      name: 'weather',
      options: '{"text":"21C"}',
    }),
    /Selected device does not support this flow action\./,
  );
  assert.deepEqual(awtrix3.calls, []);
});

test('shared weather overlay flow remains AWTRIX NG-only', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedWeatherOverlayAction({
    device: awtrixNg.device,
    overlay: 'rain',
  });

  assert.deepEqual(awtrixNg.calls, [
    { method: 'patchDisplay', patch: { overlay: 'rain' } },
    { method: 'setCapabilityValue', capabilityId: 'awtrixng_weather_overlay', value: 'rain' },
  ]);

  await assert.rejects(
    () => runSharedWeatherOverlayAction({
      device: awtrix3.device,
      overlay: 'rain',
    }),
    /Selected device does not support this flow action\./,
  );
  assert.deepEqual(awtrix3.calls, []);
});

test('shared application remove flow dispatches to AWTRIX 3 and AWTRIX NG implementations', async () => {
  const awtrix3 = createAwtrix3Device();
  const awtrixNg = createAwtrixNgDevice();

  await runSharedApplicationRemoveAction({ device: awtrix3.device, name: 'weather' });
  await runSharedApplicationRemoveAction({ device: awtrixNg.device, name: 'weather' });

  assert.deepEqual(awtrix3.calls, [{ method: 'cmdRemoveCustomApp', name: 'weather' }]);
  assert.deepEqual(awtrixNg.calls, [{ method: 'deleteApp', name: 'homey-weather' }]);
});

test('shared flow dispatcher rejects unsupported device shapes explicitly', async () => {
  await assert.rejects(
    () => runSharedDisplaySetAction({ device: {}, power: '1' }),
    /Selected device does not support this flow action\./,
  );
});

test('shared flow dispatcher requires an explicit AWTRIX device type discriminator', async () => {
  const legacyShapeOnlyDevice = {
    async cmdPower() {
      return undefined;
    },
    async cmdDismiss() {
      return undefined;
    },
    async cmdRtttl() {
      return undefined;
    },
    async cmdIndicator() {
      return undefined;
    },
  };

  await assert.rejects(
    () => runSharedDisplaySetAction({ device: legacyShapeOnlyDevice, power: '1' }),
    /Selected device does not support this flow action\./,
  );
});
