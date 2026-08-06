const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const flattenSettingIds = (settings) => settings.flatMap((group) => group.children.map((child) => child.id));
const findSetting = (settings, id) => settings
  .flatMap((group) => group.children)
  .find((child) => child.id === id);
// Copied from docs/vendor/awtrixng-http-api.md, table under "GET /api/v1/capabilities",
// row `transitions` (22 values, firmware's own fixed order). The test below re-reads that
// table so the fixture cannot silently drift away from the vendored documentation.
const documentedTransitionEffects = [
  'Random',
  'Slide',
  'Dim',
  'Zoom',
  'Rotate',
  'Pixelate',
  'Curtain',
  'Ripple',
  'Blink',
  'Reload',
  'Fade',
  'Cover',
  'Uncover',
  'Split',
  'Blinds',
  'Blocks',
  'Flash',
  'Diamond',
  'Wave',
  'Rain',
  'Melt',
  'Interlace',
];
const documentedWeatherOverlays = [
  'none',
  'drizzle',
  'frost',
  'rain',
  'snow',
  'storm',
  'thunder',
];
const documentedWeatherOverlayLabels = [
  'None',
  'Drizzle',
  'Frost',
  'Rain',
  'Snow',
  'Storm',
  'Thunder',
];
const documentedBuiltinAppSettings = [
  ['showBuiltinTime', 'Time'],
  ['showBuiltinDate', 'Date'],
  ['showBuiltinTemperature', 'Temperature'],
  ['showBuiltinHumidity', 'Humidity'],
  ['showBuiltinBattery', 'Battery'],
];

test('AWTRIX NG settings compose exposes only local connection/auth and documented NG settings subset', () => {
  const settings = readJson('drivers/awtrixng/driver.settings.compose.json');
  const ids = flattenSettingIds(settings);

  assert.deepEqual(ids, [
    'address',
    'port',
    'authUser',
    'authPass',
    'autoBrightness',
    'autoTransition',
    'blockNavigation',
    'uppercase',
    'transitionEffect',
    'showBuiltinTime',
    'showBuiltinDate',
    'showBuiltinTemperature',
    'showBuiltinHumidity',
    'showBuiltinBattery',
  ]);
  assert.equal(ids.includes('brightness'), false);
  assert.equal(ids.includes('batteryPercent'), false);
  assert.equal(ids.includes('ABRI'), false);
  assert.equal(ids.includes('TEFF'), false);
});

test('AWTRIX NG settings compose exposes editable connection fields with safe port bounds', () => {
  const settings = readJson('drivers/awtrixng/driver.settings.compose.json');
  const connectionGroup = settings[0];
  const address = findSetting(settings, 'address');
  const port = findSetting(settings, 'port');

  assert.equal(connectionGroup.label.en, 'Connection');
  assert.equal(address.type, 'text');
  assert.equal(address.value, '');
  assert.match(address.hint.en, /filled automatically/);
  assert.equal(port.type, 'number');
  assert.equal(port.value, 80);
  assert.equal(port.min, 1);
  assert.equal(port.max, 65535);
  assert.match(port.hint.en, /filled automatically/);
});

test('AWTRIX NG settings compose exposes transitionEffect as static dropdown', () => {
  const settings = readJson('drivers/awtrixng/driver.settings.compose.json');
  const transitionEffect = findSetting(settings, 'transitionEffect');

  assert.ok(transitionEffect);
  const valueIds = transitionEffect.values.map((value) => value.id);

  assert.equal(transitionEffect.type, 'dropdown');
  assert.equal(transitionEffect.value, 'Rain');
  assert.equal(transitionEffect.hint.en, 'Static list from the documented capabilities.');
  assert.deepEqual(valueIds, documentedTransitionEffects);
  assert.deepEqual(transitionEffect.values.map((value) => value.label.en), valueIds);
});

test('AWTRIX NG documented transitions fixture matches the vendored API documentation', () => {
  const documentation = fs.readFileSync(path.join(root, 'docs/vendor/awtrixng-http-api.md'), 'utf8');
  const row = documentation
    .split('\n')
    .find((line) => line.startsWith('| `transitions` |'));

  assert.ok(row, 'the capabilities table must document a transitions row');

  const cells = row.split('|').map((cell) => cell.trim());
  const documentedCount = Number(cells[2]);
  const documentedNames = [...cells[3].matchAll(/`([^`]+)`/g)].map((match) => match[1]);

  assert.deepEqual(documentedNames, documentedTransitionEffects, 'fixture drifted from the documentation');
  assert.equal(documentedCount, documentedTransitionEffects.length, 'the documented count must match the list');
});

test('AWTRIX NG transitionEffect dropdown only offers documented transitions', () => {
  const settings = readJson('drivers/awtrixng/driver.settings.compose.json');
  const transitionEffect = findSetting(settings, 'transitionEffect');

  assert.ok(transitionEffect);

  const documented = new Set(documentedTransitionEffects);
  const undocumented = transitionEffect.values
    .map((value) => value.id)
    .filter((id) => !documented.has(id));

  assert.deepEqual(undocumented, [], 'every dropdown value must exist in the documented capabilities');
  assert.ok(documented.has(transitionEffect.value), 'the default value must be documented too');
});

test('AWTRIX NG settings compose exposes built-in app visibility checkboxes', () => {
  const settings = readJson('drivers/awtrixng/driver.settings.compose.json');

  for (const [id, label] of documentedBuiltinAppSettings) {
    const setting = findSetting(settings, id);

    assert.ok(setting, `${id} must exist`);
    assert.equal(setting.type, 'checkbox');
    assert.equal(setting.value, false);
    assert.equal(setting.label.en, label);
  }
});

test('AWTRIX NG weather overlay compose exposes enum picker capability', () => {
  const capability = readJson('.homeycompose/capabilities/awtrixng_weather_overlay.json');

  assert.equal(capability.type, 'enum');
  assert.equal(capability.title.en, 'Weather overlay');
  assert.equal(capability.getable, true);
  assert.equal(capability.setable, true);
  assert.equal(capability.uiComponent, 'picker');
  assert.equal(capability.insights, false);
  assert.deepEqual(capability.values.map((value) => value.id), documentedWeatherOverlays);
  assert.deepEqual(capability.values.map((value) => value.title.en), documentedWeatherOverlayLabels);
});

test('AWTRIX NG generated manifest keeps transitionEffect setting and weather overlay capability in sync', () => {
  const app = readJson('app.json');
  const awtrixNgDriver = app.drivers.find((driver) => driver.id === 'awtrixng');

  assert.ok(awtrixNgDriver);
  assert.equal(app.compatibility, '>=12.9.0');
  const transitionEffect = findSetting(awtrixNgDriver.settings, 'transitionEffect');
  const address = findSetting(awtrixNgDriver.settings, 'address');
  const port = findSetting(awtrixNgDriver.settings, 'port');
  const weatherOverlaySetting = findSetting(awtrixNgDriver.settings, 'weatherOverlay');
  const weatherOverlayCapability = app.capabilities.awtrixng_weather_overlay;

  assert.ok(transitionEffect);
  assert.equal(address.type, 'text');
  assert.equal(port.type, 'number');
  assert.equal(port.min, 1);
  assert.equal(port.max, 65535);
  assert.equal(transitionEffect.type, 'dropdown');
  assert.equal(transitionEffect.value, 'Rain');
  assert.deepEqual(transitionEffect.values.map((value) => value.id), documentedTransitionEffects);

  for (const [id, label] of documentedBuiltinAppSettings) {
    const setting = findSetting(awtrixNgDriver.settings, id);

    assert.ok(setting, `${id} must exist in generated manifest`);
    assert.equal(setting.type, 'checkbox');
    assert.equal(setting.value, false);
    assert.equal(setting.label.en, label);
  }

  assert.equal(weatherOverlaySetting, undefined);
  assert.ok(weatherOverlayCapability);
  assert.equal(weatherOverlayCapability.type, 'enum');
  assert.equal(weatherOverlayCapability.uiComponent, 'picker');
  assert.deepEqual(weatherOverlayCapability.values.map((value) => value.id), documentedWeatherOverlays);
});

test('AWTRIX 3 settings compose remains on AWTRIX 3-specific setting ids', () => {
  const awtrix3Settings = readJson('drivers/awtrixlight/driver.settings.compose.json');
  const ids = flattenSettingIds(awtrix3Settings);

  assert.equal(ids.includes('ABRI'), true);
  assert.equal(ids.includes('TEFF'), true);
  assert.equal(ids.includes('authUser'), false);
  assert.equal(ids.includes('transitionEffect'), false);
  assert.equal(ids.includes('weatherOverlay'), false);
  assert.equal(ids.includes('showBuiltinTime'), false);
});
