const assert = require('node:assert/strict');
const test = require('node:test');
const AwtrixNgApi = require('../.homeybuild/lib/awtrixng/Api/Api').default;
const AwtrixNgClient = require('../.homeybuild/lib/awtrixng/Api/Client').default;
const { toAwtrixNgSettingsPatch } = require('../.homeybuild/lib/awtrixng/Payload/Transformers');
const { createAwtrixNgSettingsPatchFromChangedSettings, toAwtrixNgHomeySettingsUpdate } = require('../.homeybuild/lib/awtrixng/Services/Settings');

test('panel settings preserve zero, positive decimal gamma, black and explicit disabled colors', () => {
  const input = {
    saturation: 0, gamma: 0.01, colorCorrection: '#000000', colorTint: null,
  };
  assert.deepEqual(toAwtrixNgSettingsPatch(input), input);
  assert.deepEqual(toAwtrixNgSettingsPatch({ gamma: 20 }), { gamma: 20 }, 'documentation has no upper gamma limit');
  assert.deepEqual(createAwtrixNgSettingsPatchFromChangedSettings({ ...input, colorTint: '' }, Object.keys(input)), input);
  assert.deepEqual(toAwtrixNgHomeySettingsUpdate(input, {}), { ...input, colorTint: '' });
  assert.deepEqual(toAwtrixNgHomeySettingsUpdate(input, { ...input, colorTint: '' }), {});
  for (const [field, values] of [
    ['saturation', [-1, 101, 0.5, '50', null]], ['gamma', [0, -1, NaN, Infinity, '1.9', null]],
    ['colorTint', ['', '2700', '#FFF', false]],
  ]) {
    for (const value of values) assert.throws(() => toAwtrixNgSettingsPatch({ [field]: value }), (error) => error.field === field && error.reason === 'invalid-value');
  }
  assert.throws(() => toAwtrixNgHomeySettingsUpdate({ saturation: 101 }, {}), (error) => error.endpoint === '/api/v1/settings');
});

test('panel settings check the device before writing and reconcile its normalized colors', async () => {
  const calls = [];
  let settings = {
    saturation: 100, gamma: 1.9, colorCorrection: null, colorTint: null,
  };
  const client = new AwtrixNgClient({
    async request(request) {
      calls.push(request);
      if (request.method === 'PATCH') settings = { ...settings, ...request.body, colorTint: '#FFD6AA' };
      return { status: 200, headers: {}, data: settings };
    },
  });
  const api = new AwtrixNgApi(client, { baseUrl: 'http://192.0.2.10', icons: { emptyIcon: { id: '-', name: 'None' } } });
  const result = await api.applySettingsChange({
    saturation: 0, colorTint: '#ffd6aa', gamma: 1.9, colorCorrection: '',
  }, ['saturation', 'colorTint']);
  assert.deepEqual(calls.at(-1).body, { saturation: 0, colorTint: '#ffd6aa' });
  assert.deepEqual(result.homeyUpdate, { colorTint: '#FFD6AA' });
  settings = {};
  calls.length = 0;
  await assert.rejects(api.applySettingsChange({ saturation: 50, showBuiltinTime: true }, ['saturation', 'showBuiltinTime']),
    (error) => error.field === 'saturation' && error.reason === 'unsupported-field');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
});
