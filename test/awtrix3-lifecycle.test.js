const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const Api = require('../.homeybuild/lib/awtrix3/Api/Api').default;
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
const flushTasks = () => new Promise((resolve) => setImmediate(resolve));

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
    error(error) {
      diagnostics.push(error);
    },
  };

  await assert.doesNotReject(
    () => AwtrixLightDevice.prototype.onAdded.call(context),
  );

  assert.deepEqual(uploads, expectedFiles);
  assert.equal(maxActiveUploads, 1);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0] instanceof AggregateError, true);
  assert.equal(diagnostics[0].errors.length, 1);
  assert.match(diagnostics[0].errors[0].message, /homey\.jpg/);
  assert.equal(diagnostics[0].errors[0].cause, uploadError);
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
