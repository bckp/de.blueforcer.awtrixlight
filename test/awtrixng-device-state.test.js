const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AwtrixNgBaseCapabilityIds,
  createAwtrixNgCapabilityUpdatePlan,
  getAwtrixNgInitialCapabilityIds,
} = require('../.homeybuild/lib/awtrixng/Device/State');

const baseDeviceState = {
  uid: 'aabbccddeeff',
  version: '1.0.14',
  boardType: 'awtrixng',
  soc: 'esp32',
  ipAddress: '192.168.1.44',
  hostname: 'awtrixng-ddeeff',
  wifiRssi: -62,
  uptimeSeconds: 1234,
  resetReason: 'poweron',
  freeHeapBytes: 100000,
  minFreeHeapBytes: 90000,
  largestFreeBlockBytes: 80000,
  scriptingRunning: true,
  scriptHeapPool: 'internal',
  scriptHeapBudgetBytes: 4096,
  fps: 30,
  brightness: 128,
  lightLevel: 40,
  ldrRaw: 300,
  matrixPower: true,
  currentApp: 'Time',
  indicators: [{
    on: false,
    color: '#000000',
    blinkMs: 0,
    fadeMs: 0,
  }, {
    on: true,
    color: '#ff0000',
    blinkMs: 500,
    fadeMs: 0,
  }, {
    on: false,
    color: '#000000',
    blinkMs: 0,
    fadeMs: 0,
  }],
  messageCount: 0,
  wifi: {
    enabled: true,
    state: 'connected',
    host: 'Home',
    endpoint: '192.168.1.44',
    attempts: 0,
    retryInMs: 0,
    connects: 1,
    error: null,
    lastError: null,
  },
  mqtt: {
    enabled: false,
    state: 'disabled',
    host: '',
    endpoint: '',
    attempts: 0,
    retryInMs: 0,
    connects: 0,
    error: null,
    lastError: null,
  },
};

const baseCapabilityValues = [{
  capabilityId: 'alarm_generic.indicator1',
  value: false,
}, {
  capabilityId: 'alarm_generic.indicator2',
  value: true,
}, {
  capabilityId: 'alarm_generic.indicator3',
  value: false,
}, {
  capabilityId: 'awtrix_matrix',
  value: true,
}, {
  capabilityId: 'rssi',
  value: -62,
}, {
  capabilityId: 'ip',
  value: '192.168.1.44',
}];

test('AWTRIX NG initial capability ids include base controls and supported optional fields present at init/pairing', () => {
  const deviceState = {
    ...baseDeviceState,
    batteryPercent: 0,
    lowBattery: false,
    temperature: 22.5,
    humidity: 45,
  };

  assert.deepEqual(getAwtrixNgInitialCapabilityIds(deviceState), [
    ...AwtrixNgBaseCapabilityIds,
    'measure_battery',
    'alarm_battery',
    'measure_temperature',
    'measure_humidity',
  ]);
});

test('AWTRIX NG initial capability ids ignore unsupported fields', () => {
  const deviceState = {
    ...baseDeviceState,
    pressureHpa: 1013,
    lightLevel: 80,
  };

  assert.deepEqual(getAwtrixNgInitialCapabilityIds(deviceState), [
    ...AwtrixNgBaseCapabilityIds,
  ]);
});

test('AWTRIX NG capability plan adds base controls and supported optional values during init', () => {
  const deviceState = {
    ...baseDeviceState,
    lowBattery: true,
    temperature: 0,
    humidity: 0,
    batteryPercent: 82,
    pressureHpa: 1013,
    lightLevel: 80,
  };

  assert.deepEqual(createAwtrixNgCapabilityUpdatePlan(deviceState, [], {
    allowAddCapabilities: true,
  }), {
    capabilitiesToAdd: [
      ...AwtrixNgBaseCapabilityIds,
      'measure_battery',
      'alarm_battery',
      'measure_temperature',
      'measure_humidity',
    ],
    valuesToSet: [
      ...baseCapabilityValues,
      {
        capabilityId: 'measure_battery',
        value: 82,
      }, {
        capabilityId: 'alarm_battery',
        value: true,
      }, {
        capabilityId: 'measure_temperature',
        value: 0,
      }, {
        capabilityId: 'measure_humidity',
        value: 0,
      },
    ],
  });
});

test('AWTRIX NG capability plan migrates measure_battery for an existing device during init', () => {
  const deviceState = {
    ...baseDeviceState,
    batteryPercent: 82,
  };

  assert.deepEqual(createAwtrixNgCapabilityUpdatePlan(deviceState, AwtrixNgBaseCapabilityIds, {
    allowAddCapabilities: true,
  }), {
    capabilitiesToAdd: ['measure_battery'],
    valuesToSet: [
      ...baseCapabilityValues,
      {
        capabilityId: 'measure_battery',
        value: 82,
      },
    ],
  });
});

test('AWTRIX NG capability plan does not add capabilities during polling', () => {
  const deviceState = {
    ...baseDeviceState,
    batteryPercent: 100,
    lowBattery: false,
    temperature: 22.5,
    humidity: 45,
  };

  assert.deepEqual(createAwtrixNgCapabilityUpdatePlan(deviceState, ['measure_battery', 'alarm_battery', 'awtrix_matrix', 'rssi', 'ip'], {
    allowAddCapabilities: false,
  }), {
    capabilitiesToAdd: [],
    valuesToSet: [{
      capabilityId: 'awtrix_matrix',
      value: true,
    }, {
      capabilityId: 'rssi',
      value: -62,
    }, {
      capabilityId: 'ip',
      value: '192.168.1.44',
    }, {
      capabilityId: 'measure_battery',
      value: 100,
    }, {
      capabilityId: 'alarm_battery',
      value: false,
    }],
  });
});

test('AWTRIX NG capability plan skips a newly detected battery measurement during polling', () => {
  const plan = createAwtrixNgCapabilityUpdatePlan({
    ...baseDeviceState,
    batteryPercent: 50,
  }, AwtrixNgBaseCapabilityIds, {
    allowAddCapabilities: false,
  });

  assert.deepEqual(plan, {
    capabilitiesToAdd: [],
    valuesToSet: baseCapabilityValues,
  });
});

test('AWTRIX NG capability plan skips missing optional fields instead of writing null or zero', () => {
  assert.deepEqual(createAwtrixNgCapabilityUpdatePlan(baseDeviceState, [
    ...AwtrixNgBaseCapabilityIds,
    'measure_battery',
    'alarm_battery',
    'measure_temperature',
    'measure_humidity',
  ], {
    allowAddCapabilities: false,
  }), {
    capabilitiesToAdd: [],
    valuesToSet: baseCapabilityValues,
  });
});

test('AWTRIX NG capability plan skips battery percentages outside Homey\'s 0-100 range', () => {
  for (const batteryPercent of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
    const plan = createAwtrixNgCapabilityUpdatePlan({
      ...baseDeviceState,
      batteryPercent,
    }, [], {
      allowAddCapabilities: true,
    });

    assert.equal(plan.capabilitiesToAdd.includes('measure_battery'), false);
    assert.equal(plan.valuesToSet.some((update) => update.capabilityId === 'measure_battery'), false);
  }
});
