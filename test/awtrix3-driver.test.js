const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const loadAwtrixLightDriver = () => {
  const originalLoad = Module._load;

  function FakeHomeyDriver() {}

  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') {
      return { Driver: FakeHomeyDriver };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = require.resolve('../.homeybuild/drivers/awtrixlight/driver');
    delete require.cache[modulePath];
    // eslint-disable-next-line global-require
    const loadedDriver = require('../.homeybuild/drivers/awtrixlight/driver');
    return loadedDriver.default || loadedDriver;
  } finally {
    Module._load = originalLoad;
  }
};

const createActionCard = () => ({
  runListener: undefined,
  registerRunListener(listener) {
    this.runListener = listener;
    return this;
  },
  getArgument() {
    return {
      registerAutocompleteListener() {
        return this;
      },
    };
  },
});

const createDriver = () => {
  const actionCards = new Map();
  const Driver = loadAwtrixLightDriver();
  const driver = new Driver();

  driver.homey = {
    flow: {
      getActionCard(id) {
        if (!actionCards.has(id)) {
          actionCards.set(id, createActionCard());
        }
        return actionCards.get(id);
      },
    },
  };
  driver.log = () => undefined;

  return { actionCards, driver };
};

test('deprecated AWTRIX 3 JSON flow cards reject invalid and non-object JSON', async () => {
  const { actionCards, driver } = createDriver();
  const calls = [];
  const device = {
    async cmdNotify(...args) {
      calls.push(['notify', ...args]);
    },
    async cmdCustomApp(...args) {
      calls.push(['customApp', ...args]);
    },
  };

  await driver.initFlows();

  await assert.rejects(
    () => actionCards.get('notificationJson').runListener({ device, msg: 'hello', options: '{invalid' }),
    /Notification options must be valid JSON\./,
  );
  await assert.rejects(
    () => actionCards.get('notificationJson').runListener({ device, msg: 'hello', options: '[]' }),
    /Notification options must be a JSON object\./,
  );
  await assert.rejects(
    () => actionCards.get('customApp').runListener({
      device,
      name: 'weather',
      msg: '',
      icon: { id: '-' },
      options: 'null',
    }),
    /Custom app options must be a JSON object\./,
  );

  assert.deepEqual(calls, []);
});

test('deprecated AWTRIX 3 JSON flow cards still accept JSON objects', async () => {
  const { actionCards, driver } = createDriver();
  const calls = [];
  const device = {
    async cmdNotify(msg, options) {
      calls.push({ method: 'notify', msg, options });
    },
    async cmdCustomApp(name, options) {
      calls.push({ method: 'customApp', name, options });
    },
  };

  await driver.initFlows();
  await actionCards.get('notificationJson').runListener({
    device,
    msg: 'hello',
    options: '{"color":"#ffffff"}',
  });
  await actionCards.get('customApp').runListener({
    device,
    name: 'weather',
    msg: '21C',
    duration: 3,
    icon: { id: '-' },
    options: '{"effect":"Rainbow"}',
  });

  assert.deepEqual(calls, [{
    method: 'notify',
    msg: 'hello',
    options: { color: '#ffffff' },
  }, {
    method: 'customApp',
    name: 'weather',
    options: { effect: 'Rainbow', text: '21C', duration: 3 },
  }]);
});

test('AWTRIX 3 pairing returns only devices with valid IPv4 or IPv6 addresses', async () => {
  const { driver } = createDriver();
  const handlers = new Map();
  const discoveryResults = {
    ipv4: { id: 'ipv4', address: '192.0.2.10' },
    ipv6: { id: 'ipv6', address: ' 2001:db8::10 ' },
    missing: { id: 'missing' },
    blank: { id: 'blank', address: '   ' },
    invalid: { id: 'invalid', address: 'not-an-ip' },
  };

  driver.getDiscoveryStrategy = () => ({
    getDiscoveryResults() {
      return discoveryResults;
    },
  });

  await driver.onPair({
    setHandler(name, handler) {
      handlers.set(name, handler);
    },
  });

  const devices = await handlers.get('list_devices')();

  assert.deepEqual(devices.map(({ data, store }) => ({ id: data.id, address: store.address })), [
    { id: 'ipv4', address: '192.0.2.10' },
    { id: 'ipv6', address: '2001:db8::10' },
  ]);
});
