const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const Api = require('../.homeybuild/lib/awtrix3/Api/Api').default;
const Poll = require('../.homeybuild/lib/awtrix3/Poll').default;
const { Status } = require('../.homeybuild/lib/awtrix3/Api/Response');
const {
  createFakeHomey,
  createFakeAwtrix3Device,
  fakeAwtrix3Client,
} = require('./helpers/fake-homey');

const loadAwtrixLightDevice = () => {
  const originalLoad = Module._load;

  function FakeHomeyDevice() {}
  function FakeDiscoveryResultMDNSSD() {}

  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') {
      return {
        Device: FakeHomeyDevice,
        DiscoveryResultMDNSSD: FakeDiscoveryResultMDNSSD,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../.homeybuild/drivers/awtrixlight/device');
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    return require('../.homeybuild/drivers/awtrixlight/device');
  } finally {
    Module._load = originalLoad;
  }
};

const AwtrixLightDevice = loadAwtrixLightDevice();
const asyncNoop = async () => undefined;
const flushTasks = () => new Promise((resolve) => {
  setImmediate(resolve);
});

const deferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

test('AWTRIX 3 availability counts consecutive failures and recovers', async () => {
  const device = createFakeAwtrix3Device({ available: true });
  const api = new Api(fakeAwtrix3Client(), device);

  await api.processResponseCode(Status.Error, 'failure 1');
  await api.processResponseCode(Status.Error, 'failure 2');
  assert.equal(device.failCount, 2);

  await api.processResponseCode(Status.Ok);
  assert.equal(device.failCount, 0, 'success resets the consecutive failure counter');
  assert.equal(device.calls.setAvailable.length, 0);
  assert.deepEqual(device.calls.setUnavailable, []);

  for (let failure = 1; failure <= 3; failure += 1) {
    await api.processResponseCode(Status.Error, `consecutive failure ${failure}`);
  }

  assert.equal(device.failCount, 3);
  assert.deepEqual(device.calls.setUnavailable, ['consecutive failure 3']);
  assert.equal(device.calls.pollExtend.length, 1);
  assert.equal(device.poll.isExtended(), true);
  assert.equal(device.getAvailable(), false);

  await api.processResponseCode(Status.Error, 'failure after transition');
  assert.equal(device.calls.setUnavailable.length, 1, 'unavailable transition happens once');
  assert.equal(device.calls.pollExtend.length, 1);

  await api.processResponseCode(Status.Ok);
  assert.equal(device.failCount, 0);
  assert.equal(device.getAvailable(), true);
  assert.equal(device.calls.setAvailable.length, 1);
  assert.equal(device.calls.pollStart.length, 1);
  assert.equal(device.poll.isExtended(), false);
});

test('AWTRIX 3 concurrent failures trigger one unavailable transition', async () => {
  const device = createFakeAwtrix3Device({ available: true });
  const api = new Api(fakeAwtrix3Client(), device);

  await Promise.all([
    api.processResponseCode(Status.Error, 'concurrent failure 1'),
    api.processResponseCode(Status.Error, 'concurrent failure 2'),
    api.processResponseCode(Status.Error, 'concurrent failure 3'),
  ]);

  assert.equal(device.failCount, 3);
  assert.deepEqual(device.calls.setUnavailable, ['concurrent failure 3']);
  assert.equal(device.calls.pollExtend.length, 1);
});

test('AWTRIX 3 onInit waits for device initialization', async () => {
  const initialization = deferred();
  const context = {
    homey: createFakeHomey(),
    log() {},
    error() {},
    setUnavailable: asyncNoop,
    migrate: asyncNoop,
    initFlows() {},
    getStoreValue() {
      return '127.0.0.1';
    },
    async initializeDevice() {
      await initialization.promise;
    },
  };

  let settled = false;
  const operation = AwtrixLightDevice.prototype.onInit.call(context);
  operation.then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);

  initialization.resolve();
  await operation;
  assert.equal(settled, true);
});

test('AWTRIX 3 poll awaits lifecycle work and reports original errors', async () => {
  const refreshError = new Error('refresh failed');
  const rediscoveryError = new Error('rediscovery failed');
  const errors = [];
  let refreshFailure = refreshError;
  const context = {
    homey: createFakeHomey(),
    log() {},
    error(error) {
      errors.push(error);
    },
    setUnavailable: asyncNoop,
    migrate: asyncNoop,
    initFlows() {},
    getStoreValue() {
      return '127.0.0.1';
    },
    initializeDevice: asyncNoop,
    async refreshCapabilities() {
      if (refreshFailure) {
        throw refreshFailure;
      }
    },
    getAvailable() {
      return false;
    },
    async tryRediscover() {
      throw rediscoveryError;
    },
  };

  await AwtrixLightDevice.prototype.onInit.call(context);
  context.poll.start();
  await context.homey.tick(60000);

  refreshFailure = undefined;
  await context.homey.tick(60000);

  assert.deepEqual(errors, [refreshError, rediscoveryError]);
});

test('AWTRIX 3 refreshAll runs concurrently, waits for all work and preserves causes', async () => {
  const capabilitiesError = new Error('capabilities failed');
  const effectsError = new Error('effects failed');
  const settings = deferred();
  const started = [];
  const context = {
    async refreshCapabilities() {
      started.push('capabilities');
      throw capabilitiesError;
    },
    async refreshSettings() {
      started.push('settings');
      await settings.promise;
    },
    async refreshEffects() {
      started.push('effects');
      throw effectsError;
    },
  };

  let outcome;
  const operation = AwtrixLightDevice.prototype.refreshAll.call(context);
  operation.then(
    () => {
      outcome = 'resolved';
    },
    (error) => {
      outcome = error;
    },
  );

  await Promise.resolve();
  assert.deepEqual(started, ['capabilities', 'settings', 'effects']);
  assert.equal(outcome, undefined, 'refreshAll waits for the still-pending settings refresh');

  settings.resolve();
  await assert.rejects(operation, (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.deepEqual(error.errors, [capabilitiesError, effectsError]);
    return true;
  });
});

test('AWTRIX 3 initialization keeps fail-critical mode until refreshAll settles', async () => {
  const refresh = deferred();
  const events = [];
  const context = {
    api: {
      setDebug() {},
    },
    async getSettings() {
      return {};
    },
    async testDevice() {
      return Status.Ok;
    },
    setAvailable: asyncNoop,
    poll: {
      stop() {
        events.push('poll.stop');
      },
      start() {
        events.push('poll.start');
      },
    },
    failsReset() {},
    failsCritical(value) {
      events.push(`critical:${value}`);
    },
    getAvailable() {
      return true;
    },
    log() {},
    async refreshAll() {
      events.push('refresh.start');
      await refresh.promise;
      events.push('refresh.end');
    },
    connected() {
      events.push('connected');
    },
    registerCapabilityListener() {},
  };

  const operation = AwtrixLightDevice.prototype.initializeDevice.call(context);
  await flushTasks();
  assert.deepEqual(events, ['poll.stop', 'critical:true', 'refresh.start']);

  refresh.resolve();
  await operation;
  assert.deepEqual(events, [
    'poll.stop',
    'critical:true',
    'refresh.start',
    'refresh.end',
    'connected',
    'poll.start',
    'critical:false',
  ]);
});

test('AWTRIX 3 refreshSettings waits for Homey settings persistence', async () => {
  const persistence = deferred();
  let settled = false;
  const context = {
    async cmdGetSettings() {
      return {};
    },
    async setSettings() {
      await persistence.promise;
    },
    log() {},
  };

  const operation = AwtrixLightDevice.prototype.refreshSettings.call(context);
  operation.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);

  persistence.resolve();
  await operation;
  assert.equal(settled, true);
});

test('AWTRIX 3 non-credential settings do not probe credentials while offline', async () => {
  const calls = {
    verify: 0,
    settings: [],
    reboot: 0,
  };
  const context = {
    homey: createFakeHomey(),
    log() {},
    async testDevice() {
      calls.verify += 1;
      return Status.Error;
    },
    api: {
      async setSettings(settings) {
        calls.settings.push(settings);
      },
      async reboot() {
        calls.reboot += 1;
      },
    },
    poll: {
      isActive() {
        return false;
      },
      start() {},
    },
    error(error) {
      throw error;
    },
  };
  const newSettings = {
    user: 'admin',
    pass: 'secret',
    TIM: true,
  };

  await AwtrixLightDevice.prototype.onSettings.call(context, {
    oldSettings: { ...newSettings, TIM: false },
    newSettings,
    changedKeys: ['TIM'],
  });

  assert.equal(calls.verify, 0);
  assert.deepEqual(calls.settings, [newSettings]);
  assert.equal(calls.reboot, 1);
});

test('AWTRIX 3 credential settings distinguish unreachable device from invalid credentials', async () => {
  const oldSettings = { user: 'old-user', pass: 'old-pass' };
  const newSettings = { user: 'new-user', pass: 'new-pass' };

  for (const { status, messageKey } of [
    { status: Status.Error, messageKey: 'states.deviceUnreachable' },
    { status: Status.NotFound, messageKey: 'states.deviceUnreachable' },
    { status: Status.AuthRequired, messageKey: 'states.invalidCredentials' },
    { status: Status.AuthFailed, messageKey: 'states.invalidCredentials' },
  ]) {
    const credentialRestores = [];
    let settingsWrites = 0;
    const context = {
      homey: createFakeHomey(),
      log() {},
      async testDevice(user, pass) {
        assert.equal(user, newSettings.user);
        assert.equal(pass, newSettings.pass);
        return status;
      },
      api: {
        setCredentials(user, pass) {
          credentialRestores.push({ user, pass });
        },
        async setSettings() {
          settingsWrites += 1;
        },
      },
      poll: {
        isActive() {
          return false;
        },
        start() {},
      },
    };

    await assert.rejects(
      () => AwtrixLightDevice.prototype.onSettings.call(context, {
        oldSettings,
        newSettings,
        changedKeys: ['user'],
      }),
      { message: messageKey },
    );
    assert.deepEqual(credentialRestores, [oldSettings]);
    assert.equal(settingsWrites, 0);
  }
});

test('AWTRIX 3 rediscover button awaits verified availability recovery', async () => {
  const recovery = deferred();
  const device = createFakeAwtrix3Device({ available: false });
  device.failCount = 2;
  device.poll.extend();
  device.setAvailable = async () => {
    device.calls.setAvailable.push(undefined);
    await recovery.promise;
    device.available = true;
  };
  const client = fakeAwtrix3Client({ status: Status.Ok });
  const api = new Api(client, device);
  let rediscoverListener;
  const context = {
    api,
    async getSettings() {
      return {};
    },
    async testDevice() {
      return Status.Ok;
    },
    setAvailable: asyncNoop,
    poll: {
      stop() {},
      start() {},
    },
    failsReset() {},
    failsCritical() {},
    getAvailable() {
      return false;
    },
    log() {},
    connected() {},
    registerCapabilityListener(capabilityId, listener) {
      if (capabilityId === 'button.rediscover') {
        rediscoverListener = listener;
      }
    },
  };

  await AwtrixLightDevice.prototype.initializeDevice.call(context);
  assert.equal(typeof rediscoverListener, 'function');

  let settled = false;
  const operation = rediscoverListener();
  operation.then(() => {
    settled = true;
  });
  await flushTasks();

  assert.equal(settled, false);
  assert.equal(device.calls.setAvailable.length, 1);
  assert.equal(device.calls.pollStart.length, 0);

  recovery.resolve();
  await operation;
  assert.equal(device.failCount, 0);
  assert.equal(device.getAvailable(), true);
  assert.equal(device.calls.pollStart.length, 1);
  assert.equal(device.poll.isExtended(), false);
});

test('AWTRIX 3 onAdded uploads all bundled icons sequentially and contains failures', async () => {
  const iconDirectory = path.join(__dirname, '../.homeybuild/drivers/awtrixlight/assets/images/icons');
  const expectedFiles = await fs.readdir(iconDirectory);
  const uploadError = new Error('upload failed');
  const uploads = [];
  const diagnostics = [];
  let activeUploads = 0;
  let maxActiveUploads = 0;
  let cacheInvalidations = 0;
  const context = {
    log() {},
    connected() {},
    getStoreValue() {
      return '127.0.0.1';
    },
    setCapabilityValue: asyncNoop,
    api: {
      async uploadImage(data, fileName) {
        assert.equal(Buffer.isBuffer(data), true);
        uploads.push(fileName);
        activeUploads += 1;
        maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
        await Promise.resolve();
        activeUploads -= 1;
        if (fileName === 'homey.jpg') {
          throw uploadError;
        }
      },
    },
    icons: {
      invalidate() {
        cacheInvalidations += 1;
      },
    },
    error(error) {
      diagnostics.push(error);
    },
  };

  await assert.doesNotReject(
    () => AwtrixLightDevice.prototype.onAdded.call(context),
  );

  assert.deepEqual(uploads, expectedFiles);
  assert.equal(maxActiveUploads, 1);
  assert.equal(cacheInvalidations, expectedFiles.length - 1, 'only successful uploads invalidate the icon cache');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0] instanceof AggregateError, true);
  assert.equal(diagnostics[0].errors.length, 1);
  assert.match(diagnostics[0].errors[0].message, /homey\.jpg/);
  assert.equal(diagnostics[0].errors[0].cause, uploadError);
});

const countUnhandledRejections = async (operation) => {
  let unhandled = 0;
  const listener = () => {
    unhandled += 1;
  };
  process.on('unhandledRejection', listener);
  try {
    await operation();
    // Unhandled rejections are reported on a later macrotask tick.
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  } finally {
    process.off('unhandledRejection', listener);
  }
  return unhandled;
};

test('AWTRIX 3 initialization survives a failing welcome notification', async () => {
  const notifyError = new Error('notify failed');
  const errors = [];
  const events = [];
  const context = {
    api: {
      setDebug() {},
    },
    async getSettings() {
      return {};
    },
    async testDevice() {
      return Status.Ok;
    },
    setAvailable: asyncNoop,
    poll: {
      stop() {},
      start() {
        events.push('poll.start');
      },
    },
    failsReset() {},
    failsCritical() {},
    getAvailable() {
      return true;
    },
    log() {},
    error(error) {
      errors.push(error);
    },
    async refreshAll() {
      events.push('refresh');
    },
    connected: AwtrixLightDevice.prototype.connected,
    async cmdNotify() {
      events.push('notify');
      throw notifyError;
    },
    registerCapabilityListener() {},
  };

  const unhandled = await countUnhandledRejections(
    () => AwtrixLightDevice.prototype.initializeDevice.call(context),
  );

  assert.deepEqual(events, ['refresh', 'notify', 'poll.start']);
  assert.deepEqual(errors, [notifyError], 'the best-effort greeting failure is logged');
  assert.equal(unhandled, 0);
});

test('AWTRIX 3 onAdded contains greeting and capability write failures', async () => {
  const notifyError = new Error('notify failed');
  const capabilityError = new Error('capability write failed');
  const errors = [];
  const uploads = [];
  const context = {
    log() {},
    error(error) {
      errors.push(error);
    },
    connected: AwtrixLightDevice.prototype.connected,
    async cmdNotify() {
      throw notifyError;
    },
    getStoreValue() {
      return '127.0.0.1';
    },
    async setCapabilityValue() {
      throw capabilityError;
    },
    api: {
      async uploadImage(data, fileName) {
        uploads.push(fileName);
      },
    },
    icons: {
      invalidate() {},
    },
  };

  const unhandled = await countUnhandledRejections(
    () => AwtrixLightDevice.prototype.onAdded.call(context),
  );

  assert.deepEqual(errors, [notifyError, capabilityError]);
  assert.equal(unhandled, 0);
  assert.equal(uploads.length > 0, true, 'pairing continues with the bundled icon upload');
});

test('AWTRIX 3 discovery address change persists state before verification', async () => {
  const storeWrite = deferred();
  const capabilityWrite = deferred();
  const events = [];
  const context = {
    api: {
      setIp(address) {
        events.push(`api:${address}`);
      },
    },
    async setStoreValue(key, value) {
      events.push(`store.start:${key}:${value}`);
      await storeWrite.promise;
      events.push('store.end');
    },
    async setCapabilityValue(key, value) {
      events.push(`capability.start:${key}:${value}`);
      await capabilityWrite.promise;
      events.push('capability.end');
    },
    async testDevice() {
      events.push('verify');
      return Status.Ok;
    },
    error(error) {
      throw error;
    },
  };

  const operation = AwtrixLightDevice.prototype.onDiscoveryAddressChanged.call(context, {
    address: '192.0.2.10',
  });
  await Promise.resolve();
  assert.deepEqual(events, ['api:192.0.2.10', 'store.start:address:192.0.2.10']);

  storeWrite.resolve();
  await flushTasks();
  assert.deepEqual(events, [
    'api:192.0.2.10',
    'store.start:address:192.0.2.10',
    'store.end',
    'capability.start:ip:192.0.2.10',
  ]);

  capabilityWrite.resolve();
  assert.equal(await operation, true);
  assert.equal(events.at(-1), 'verify');
});

const createMigrationHarness = (capabilities) => {
  const device = new AwtrixLightDevice();
  const calls = [];
  const capabilityValues = [];
  const errors = [];

  Object.assign(device, {
    homey: createFakeHomey(),
    log() {},
    error(...args) {
      errors.push(args);
    },
    getCapabilities() {
      return [...capabilities];
    },
    getStoreValue(key) {
      return key === 'address' ? '192.0.2.10' : undefined;
    },
    async removeCapability(capabilityId) {
      calls.push({ type: 'remove', capabilityId });
    },
    async addCapability(capabilityId) {
      calls.push({ type: 'add', capabilityId });
    },
    async setCapabilityValue(capabilityId, value) {
      capabilityValues.push({ capabilityId, value });
    },
  });

  return {
    calls,
    capabilityValues,
    device,
    errors,
  };
};

const allCapabilities = [
  'button_prev',
  'button_next',
  'awtrix_matrix',
  'rssi',
  'ip',
  'button.rediscover',
];

test('AWTRIX 3 migration is a no-op when every capability is present in the right order', async () => {
  const harness = createMigrationHarness(allCapabilities);

  await harness.device.migrate();

  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.capabilityValues, []);
  assert.deepEqual(harness.errors, []);
});

test('AWTRIX 3 migration rebuilds the button and matrix capabilities when their order drifted', async () => {
  const harness = createMigrationHarness([
    'awtrix_matrix',
    'button_next',
    'button_prev',
    'rssi',
    'ip',
    'button.rediscover',
  ]);

  await harness.device.migrate();

  assert.deepEqual(harness.calls, [
    { type: 'remove', capabilityId: 'button_prev' },
    { type: 'remove', capabilityId: 'button_next' },
    { type: 'remove', capabilityId: 'awtrix_matrix' },
    { type: 'add', capabilityId: 'button_prev' },
    { type: 'add', capabilityId: 'button_next' },
    { type: 'add', capabilityId: 'awtrix_matrix' },
  ]);
  assert.deepEqual(harness.capabilityValues, []);
});

test('AWTRIX 3 migration adds the ordered capabilities that are missing entirely', async () => {
  const harness = createMigrationHarness(['rssi', 'ip', 'button.rediscover']);

  await harness.device.migrate();

  assert.deepEqual(harness.calls, [
    { type: 'add', capabilityId: 'button_prev' },
    { type: 'add', capabilityId: 'button_next' },
    { type: 'add', capabilityId: 'awtrix_matrix' },
  ], 'nothing is removed because nothing is there');
});

test('AWTRIX 3 migration adds rssi, ip and rediscover when missing and seeds the ip value', async () => {
  const harness = createMigrationHarness(['button_prev', 'button_next', 'awtrix_matrix']);

  await harness.device.migrate();

  assert.deepEqual(harness.calls, [
    { type: 'add', capabilityId: 'rssi' },
    { type: 'add', capabilityId: 'ip' },
    { type: 'add', capabilityId: 'button.rediscover' },
  ]);
  assert.deepEqual(harness.capabilityValues, [
    { capabilityId: 'ip', value: '192.0.2.10' },
  ], 'the ip capability is seeded from the stored address');
});

test('AWTRIX 3 migration adds only the individually missing capability', async () => {
  for (const missing of ['rssi', 'ip', 'button.rediscover']) {
    const harness = createMigrationHarness(allCapabilities.filter((id) => id !== missing));

    await harness.device.migrate();

    assert.deepEqual(harness.calls, [
      { type: 'add', capabilityId: missing },
    ], missing);
  }
});

test('AWTRIX 3 migration contains capability errors instead of failing onInit', async () => {
  const harness = createMigrationHarness(['rssi', 'ip', 'button.rediscover']);
  const failure = new Error('capability rejected');

  harness.device.addCapability = async () => {
    throw failure;
  };

  await harness.device.migrate();

  assert.deepEqual(harness.errors, [[failure]]);
});

test('AWTRIX 3 capability writes report every failure with its capability key', async () => {
  const batteryError = new Error('battery rejected');
  const rssiError = new Error('rssi rejected');
  const written = [];
  const context = {
    async setCapabilityValue(key, value) {
      written.push(key);

      if (key === 'measure_battery') {
        throw batteryError;
      }

      if (key === 'rssi') {
        throw rssiError;
      }

      return value;
    },
  };

  await assert.rejects(
    () => AwtrixLightDevice.prototype.setCapabilityValues.call(context, {
      measure_battery: 50,
      measure_humidity: 40,
      rssi: -70,
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.deepEqual(error.errors, [batteryError, rssiError]);
      assert.match(error.message, /measure_battery, rssi/);
      return true;
    },
  );

  assert.deepEqual(written, ['measure_battery', 'measure_humidity', 'rssi'], 'every capability is still attempted');
});

test('AWTRIX 3 capability writes resolve when all of them succeed', async () => {
  const context = {
    async setCapabilityValue() {
      return undefined;
    },
  };

  await AwtrixLightDevice.prototype.setCapabilityValues.call(context, { rssi: -70 });
});

test('AWTRIX 3 refreshCapabilities and refreshSettings propagate failures to refreshAll', async () => {
  const capabilityError = new Error('capability rejected');
  const settingsError = new Error('settings rejected');
  const capabilitiesContext = {
    log() {},
    async cmdGetStats() {
      return { bat: 50 };
    },
    async setCapabilityValues() {
      throw capabilityError;
    },
    async setStoreValue() {
      return undefined;
    },
  };
  const settingsContext = {
    log() {},
    async cmdGetSettings() {
      return { TIM: true };
    },
    async setSettings() {
      throw settingsError;
    },
  };

  await assert.rejects(
    () => AwtrixLightDevice.prototype.refreshCapabilities.call(capabilitiesContext),
    capabilityError,
    'refreshCapabilities no longer swallows the error',
  );
  await assert.rejects(
    () => AwtrixLightDevice.prototype.refreshSettings.call(settingsContext),
    settingsError,
    'refreshSettings no longer swallows the error',
  );
});

test('AWTRIX 3 refresh keeps returning early when an endpoint reports no payload', async () => {
  const logged = [];
  const context = {
    log(...args) {
      logged.push(args[0]);
    },
    async cmdGetStats() {
      return null;
    },
    async cmdGetSettings() {
      return null;
    },
    async setCapabilityValues() {
      throw new Error('must not be called');
    },
    async setSettings() {
      throw new Error('must not be called');
    },
  };

  await AwtrixLightDevice.prototype.refreshCapabilities.call(context);
  await AwtrixLightDevice.prototype.refreshSettings.call(context);

  assert.deepEqual(logged.filter((message) => typeof message === 'string' && message.endsWith('endpoint failed')), [
    'status endpoint failed',
    'settings endpoint failed',
  ]);
});

test('AWTRIX 3 initialization survives a failing refresh and still starts polling', async () => {
  const refreshError = new Error('refresh rejected');
  const events = [];
  const errors = [];
  const context = {
    api: {
      setDebug() {},
    },
    async getSettings() {
      return {};
    },
    async testDevice() {
      return Status.Ok;
    },
    setAvailable: asyncNoop,
    poll: {
      stop() {
        events.push('poll.stop');
      },
      start() {
        events.push('poll.start');
      },
    },
    failsReset() {},
    failsCritical(value) {
      events.push(`critical:${value}`);
    },
    getAvailable() {
      return true;
    },
    log() {},
    error(...args) {
      errors.push(args);
    },
    async refreshAll() {
      throw refreshError;
    },
    connected() {
      events.push('connected');
    },
    registerCapabilityListener() {},
  };

  const unhandled = await countUnhandledRejections(
    () => AwtrixLightDevice.prototype.initializeDevice.call(context),
  );

  assert.equal(unhandled, 0);
  assert.deepEqual(errors, [[refreshError]], 'the refresh failure is logged');
  assert.deepEqual(events, [
    'poll.stop',
    'critical:true',
    'connected',
    'poll.start',
    'critical:false',
  ], 'the welcome notification and polling still happen');
});

test('AWTRIX 3 poll reports a failing capability refresh through onError', async () => {
  const refreshError = new Error('capability refresh rejected');
  const errors = [];
  const context = {
    error(...args) {
      errors.push(args);
    },
    log() {},
    getAvailable() {
      return true;
    },
    async refreshCapabilities() {
      throw refreshError;
    },
    async tryRediscover() {
      return false;
    },
  };
  const captured = [];
  const fakeHomey = createFakeHomey();
  let pollCallback;

  fakeHomey.setInterval = (callback) => {
    pollCallback = callback;
    return 1;
  };
  fakeHomey.clearInterval = () => undefined;

  const poll = new Poll(
    async () => {
      await context.refreshCapabilities();

      if (!context.getAvailable()) {
        await context.tryRediscover();
      }
    },
    fakeHomey,
    (error) => captured.push(error),
    60000,
    300000,
  );

  poll.start();

  const unhandled = await countUnhandledRejections(() => pollCallback());

  assert.equal(unhandled, 0, 'the poll callback never leaks a rejection');
  assert.deepEqual(captured, [refreshError]);
  assert.deepEqual(errors, []);

  poll.stop();
});

test('AWTRIX 3 refreshEffects waits for the store write and propagates its failure', async () => {
  const storeError = new Error('store write rejected');
  const order = [];
  const failing = {
    log() {},
    async cmdGetEffects() {
      order.push('read');
      return ['Fade'];
    },
    async setStoreValue(key, value) {
      order.push(`write:${key}=${JSON.stringify(value)}`);
      throw storeError;
    },
  };

  const unhandled = await countUnhandledRejections(async () => {
    await assert.rejects(
      () => AwtrixLightDevice.prototype.refreshEffects.call(failing),
      storeError,
    );
  });

  assert.equal(unhandled, 0);
  assert.deepEqual(order, ['read', 'write:effects=["Fade"]']);
});

test('AWTRIX 3 refreshAll aggregates a failing effects store write', async () => {
  const storeError = new Error('store write rejected');
  const context = {
    log() {},
    async refreshCapabilities() {
      return undefined;
    },
    async refreshSettings() {
      return undefined;
    },
    async cmdGetEffects() {
      return ['Fade'];
    },
    async setStoreValue() {
      throw storeError;
    },
  };
  context.refreshEffects = AwtrixLightDevice.prototype.refreshEffects.bind(context);

  await assert.rejects(
    () => AwtrixLightDevice.prototype.refreshAll.call(context),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.deepEqual(error.errors, [storeError]);
      return true;
    },
  );
});
