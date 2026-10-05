const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const buttonCallbackTriggerHint = 'Enable button callbacks in the AWTRIX NG device settings before using this trigger.';

test('button callback API route is public POST-only with both security path parameters', () => {
  const compose = readJson('.homeycompose/app.json');
  const route = compose.api.awtrixNgButtonCallback;
  assert.deepEqual(route, {
    method: 'POST', path: '/awtrixng/button/:uid/:token', public: true,
  });
});

test('AWTRIX NG driver compose declares physical and knob Flow cards', () => {
  const flow = readJson('drivers/awtrixng/driver.flow.compose.json');
  assert.deepEqual(flow.triggers.slice(0, 5).map(({ id, title }) => ({ id, title: title.en })), [
    { id: 'awtrixng_button_left_pressed', title: 'Left button was pressed' },
    { id: 'awtrixng_button_middle_pressed', title: 'Middle button was pressed' },
    { id: 'awtrixng_button_right_pressed', title: 'Right button was pressed' },
    { id: 'awtrixng_knob_pressed', title: 'Knob was pressed' },
    { id: 'awtrixng_knob_turned', title: 'Knob was turned' },
  ]);
  for (const trigger of flow.triggers.slice(0, 4)) {
    assert.equal(trigger.hint.en, buttonCallbackTriggerHint);
  }
  assert.deepEqual(flow.triggers.slice(3, 5).map((trigger) => trigger.$filter), [
    'capabilities=awtrixng_knob', 'capabilities=awtrixng_knob',
  ]);
  assert.deepEqual(flow.triggers[4].tokens, [{ name: 'turn', type: 'number', title: { en: 'Turn', cs: 'Otočení' } }]);
  assert.equal(flow.actions[0].$filter, 'capabilities=awtrixng_audio_synth');
  assert.equal(readJson('drivers/awtrixlight/driver.compose.json').flow, undefined);
});

test('generated manifest includes the App API route and NG device triggers', () => {
  const app = readJson('app.json');
  assert.deepEqual(app.api.awtrixNgButtonCallback, {
    method: 'POST', path: '/awtrixng/button/:uid/:token', public: true,
  });
  assert.deepEqual(app.flow.triggers.slice(0, 5).map(({ id, title }) => ({ id, title: title.en })), [
    { id: 'awtrixng_button_left_pressed', title: 'Left button was pressed' },
    { id: 'awtrixng_button_middle_pressed', title: 'Middle button was pressed' },
    { id: 'awtrixng_button_right_pressed', title: 'Right button was pressed' },
    { id: 'awtrixng_knob_pressed', title: 'Knob was pressed' },
    { id: 'awtrixng_knob_turned', title: 'Knob was turned' },
  ]);
  assert.deepEqual(app.flow.triggers.slice(0, 5).map((trigger) => trigger.args[0].filter), [
    'driver_id=awtrixng', 'driver_id=awtrixng', 'driver_id=awtrixng',
    'driver_id=awtrixng&capabilities=awtrixng_knob',
    'driver_id=awtrixng&capabilities=awtrixng_knob',
  ]);
  assert.equal(app.flow.actions.find(({ id }) => id === 'awtrixng_audio_fx').args[0].filter,
    'driver_id=awtrixng&capabilities=awtrixng_audio_synth');
  for (const id of ['awtrixng_audio_url', 'awtrixng_audio_soundboard', 'awtrixng_audio_stop']) {
    assert.equal(app.flow.actions.find((action) => action.id === id).args[0].filter,
      'driver_id=awtrixng&capabilities=awtrixng_audio_url');
  }
  assert.ok(app.permissions.includes('homey:app:com.athom.soundboard'));
});
