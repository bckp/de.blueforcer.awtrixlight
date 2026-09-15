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

test('AWTRIX NG driver compose declares exactly three device button trigger cards', () => {
  const flow = readJson('drivers/awtrixng/driver.flow.compose.json');
  assert.deepEqual(flow.triggers.map(({ id, title }) => ({ id, title: title.en })), [
    { id: 'awtrixng_button_left_pressed', title: 'Left button was pressed' },
    { id: 'awtrixng_button_middle_pressed', title: 'Middle button was pressed' },
    { id: 'awtrixng_button_right_pressed', title: 'Right button was pressed' },
  ]);
  for (const trigger of flow.triggers) {
    assert.equal(trigger.hint.en, buttonCallbackTriggerHint);
  }
  assert.equal(readJson('drivers/awtrixlight/driver.compose.json').flow, undefined);
});

test('generated manifest includes the App API route and NG device triggers', () => {
  const app = readJson('app.json');
  assert.deepEqual(app.api.awtrixNgButtonCallback, {
    method: 'POST', path: '/awtrixng/button/:uid/:token', public: true,
  });
  assert.deepEqual(app.flow.triggers.map(({ id, title }) => ({ id, title: title.en })), [
    { id: 'awtrixng_button_left_pressed', title: 'Left button was pressed' },
    { id: 'awtrixng_button_middle_pressed', title: 'Middle button was pressed' },
    { id: 'awtrixng_button_right_pressed', title: 'Right button was pressed' },
  ]);
  for (const trigger of app.flow.triggers) {
    assert.deepEqual(trigger.args, [{ type: 'device', name: 'device', filter: 'driver_id=awtrixng' }]);
    assert.equal(trigger.hint.en, buttonCallbackTriggerHint);
  }
});
