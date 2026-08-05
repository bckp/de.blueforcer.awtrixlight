const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const actionsDir = path.join(root, '.homeycompose/flow/actions');
const readJson = (fileName) => JSON.parse(fs.readFileSync(path.join(actionsDir, fileName), 'utf8'));
const actionFiles = fs.readdirSync(actionsDir).filter((fileName) => fileName.endsWith('.json')).sort();

const expectedActionTitles = {
  'application.json': 'Create or update an application',
  'applicationIcon.json': 'Create or update an application with an icon (experimental)',
  'applicationRaw.json': 'Create or update a raw application',
  'applicationRemove.json': 'Remove an application',
  'customApp.json': 'Create a custom app',
  'displaySet.json': 'Set display power',
  'indicator.json': 'Show indicator with color and effect for a period of time',
  'indicatorDismiss.json': 'Hide an indicator',
  'notification.json': 'Send a notification',
  'notificationDismiss.json': 'Dismiss a notification',
  'notificationIcon.json': 'Send a notification with an icon',
  'notificationJson.json': 'Send a notification with JSON options',
  'notificationRaw.json': 'Send a raw notification',
  'notificationSticky.json': 'Send a sticky notification',
  'playRTTTL.json': 'Play an RTTTL melody',
  'removeCustomApp.json': 'Remove a custom app',
  'weatherOverlay.json': 'Set the weather overlay',
};

const awtrixNgFlowFiles = [
  'applicationRaw.json',
  'weatherOverlay.json',
];

const sharedFlowFiles = [
  'displaySet.json',
  'indicator.json',
  'indicatorDismiss.json',
  'notification.json',
  'application.json',
  'applicationRemove.json',
  'notificationRaw.json',
  'notificationDismiss.json',
  'notificationSticky.json',
  'playRTTTL.json',
];

const getDeviceArg = (action) => action.args.find((arg) => arg.name === 'device' && arg.type === 'device');

test('Flow action main titles follow the Homey review and contain no arguments', () => {
  assert.deepEqual(actionFiles, Object.keys(expectedActionTitles).sort());

  for (const fileName of actionFiles) {
    const action = readJson(fileName);

    assert.equal(action.title.en, expectedActionTitles[fileName], `${fileName} must use the reviewed main title`);

    for (const [locale, title] of Object.entries(action.title)) {
      assert.equal(title.includes('[['), false, `${fileName} title.${locale} must not contain an argument`);
      assert.equal(title.includes(']]'), false, `${fileName} title.${locale} must not contain an argument`);
    }
  }
});

test('Flow action formatted titles reference every explicit non-device argument exactly once', () => {
  for (const fileName of actionFiles) {
    const action = readJson(fileName);
    const argumentNames = action.args.filter((arg) => arg.name !== 'device').map((arg) => arg.name).sort();

    for (const [locale, title] of Object.entries(action.titleFormatted)) {
      const placeholders = [...title.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]).sort();

      assert.deepEqual(placeholders, argumentNames, `${fileName} titleFormatted.${locale} must reference each argument exactly once`);
    }
  }
});

test('AWTRIX NG-specific flow action compose files are scoped to the AWTRIX NG driver only', () => {
  for (const fileName of awtrixNgFlowFiles) {
    const action = readJson(fileName);
    const deviceArg = getDeviceArg(action);

    assert.ok(deviceArg, `${fileName} must define a device argument`);
    assert.equal(deviceArg.filter, 'driver_id=awtrixng', `${fileName} must target only AWTRIX NG devices`);
  }
});

test('shared AWTRIX flow action compose files are available to both drivers', () => {
  for (const fileName of sharedFlowFiles) {
    const action = readJson(fileName);
    const deviceArg = getDeviceArg(action);

    assert.ok(deviceArg, `${fileName} must define a device argument`);
    assert.equal(deviceArg.filter, 'driver_id=awtrixlight|awtrixng', `${fileName} must target AWTRIX 3 and AWTRIX NG devices`);
    assert.equal(action.title.en.includes('[[device]]'), false, `${fileName} must not include filtered device arguments in the title`);
    assert.equal(action.titleFormatted.en.includes('[[device]]'), false, `${fileName} must not include filtered device arguments in the formatted title`);
  }

  for (const fileName of [
    'awtrixngDismissNotification.json',
    'awtrixngDisplaySet.json',
    'awtrixngNotification.json',
    'awtrixngNotificationJson.json',
    'awtrixngIndicator.json',
    'awtrixngIndicatorDismiss.json',
    'awtrixngPlayRtttl.json',
    'awtrixngRemoveCustomApp.json',
    'awtrixngCustomApp.json',
    'awtrixngCustomAppJson.json',
    'awtrixngStickyNotification.json',
  ]) {
    assert.equal(fs.existsSync(path.join(actionsDir, fileName)), false, `${fileName} must not duplicate a shared flow action`);
  }
});

test('raw flow action compose files expose device-specific JSON payloads', () => {
  const notificationRaw = readJson('notificationRaw.json');
  const applicationRaw = readJson('applicationRaw.json');

  assert.equal(notificationRaw.args.some((arg) => arg.name === 'msg'), false);
  assert.equal(notificationRaw.duration, undefined);
  assert.equal(notificationRaw.hint.en.includes('device-specific raw JSON payload'), true);
  assert.equal(notificationRaw.hint.en.includes('NG-shaped JSON fields'), true);
  assert.equal(applicationRaw.hint.en.includes('raw JSON payload'), true);
  assert.equal(applicationRaw.hint.en.includes('advanced users'), true);
  assert.equal(applicationRaw.hint.en.includes('without the internal homey- prefix'), true);
});

test('shared notification flow uses Homey-native duration and icon autocomplete', () => {
  const action = readJson('notification.json');
  const iconArg = action.args.find((arg) => arg.name === 'icon');

  assert.equal(action.duration, true);
  assert.equal(action.title.en.includes('durationMs'), false);
  assert.equal(action.titleFormatted.en.includes('durationMs'), false);
  assert.equal(action.args.some((arg) => arg.name === 'durationMs'), false);
  assert.ok(iconArg);
  assert.equal(iconArg.type, 'autocomplete');
  assert.equal(iconArg.required, false);
});

test('deprecated AWTRIX 3 notification and application flows remain AWTRIX 3-only', () => {
  const notificationIcon = readJson('notificationIcon.json');
  const notificationJson = readJson('notificationJson.json');
  const customApp = readJson('customApp.json');
  const removeCustomApp = readJson('removeCustomApp.json');
  const notificationIconDeviceArg = getDeviceArg(notificationIcon);
  const notificationJsonDeviceArg = getDeviceArg(notificationJson);
  const customAppDeviceArg = getDeviceArg(customApp);
  const removeCustomAppDeviceArg = getDeviceArg(removeCustomApp);
  const iconArg = notificationIcon.args.find((arg) => arg.name === 'icon');

  assert.equal(notificationIcon.deprecated, true);
  assert.equal(notificationIconDeviceArg.filter, 'driver_id=awtrixlight');
  assert.ok(iconArg);
  assert.equal(iconArg.type, 'autocomplete');
  assert.equal(iconArg.required, undefined);
  assert.equal(notificationJson.deprecated, true);
  assert.equal(notificationJsonDeviceArg.filter, 'driver_id=awtrixlight');
  assert.ok(notificationJson.args.find((arg) => arg.name === 'msg'));
  assert.equal(customApp.deprecated, true);
  assert.equal(customAppDeviceArg.filter, 'driver_id=awtrixlight');
  assert.equal(removeCustomApp.deprecated, true);
  assert.equal(removeCustomAppDeviceArg.filter, 'driver_id=awtrixlight');
});

test('shared sticky notification flow uses optional icon autocomplete', () => {
  const action = readJson('notificationSticky.json');
  const iconArg = action.args.find((arg) => arg.name === 'icon');

  assert.ok(iconArg);
  assert.equal(iconArg.type, 'autocomplete');
  assert.equal(iconArg.required, false);
});

test('AWTRIX NG weather overlay flow exposes documented overlay values', () => {
  const action = readJson('weatherOverlay.json');
  const overlayArg = action.args.find((arg) => arg.name === 'overlay');

  assert.equal(action.title.en, 'Set the weather overlay');
  assert.ok(overlayArg);
  assert.equal(overlayArg.type, 'dropdown');
  assert.deepEqual(overlayArg.values.map((value) => value.id), [
    'none',
    'drizzle',
    'frost',
    'rain',
    'snow',
    'storm',
    'thunder',
  ]);
  assert.deepEqual(overlayArg.values.map((value) => value.title.en), [
    'None',
    'Drizzle',
    'Frost',
    'Rain',
    'Snow',
    'Storm',
    'Thunder',
  ]);
});

test('AWTRIX NG custom app flow exposes user app name without internal prefix in titles', () => {
  const customApp = readJson('application.json');
  const removeCustomApp = readJson('applicationRemove.json');

  assert.equal(customApp.title.en.includes('homey-'), false);
  assert.equal(customApp.titleFormatted.en.includes('homey-'), false);
  assert.equal(removeCustomApp.title.en.includes('homey-'), false);
  assert.equal(removeCustomApp.titleFormatted.en.includes('homey-'), false);
});

test('shared application flow uses Homey-native duration, color and optional JSON options', () => {
  const action = readJson('application.json');
  const colorArg = action.args.find((arg) => arg.name === 'color');
  const optionsArg = action.args.find((arg) => arg.name === 'options');

  assert.equal(action.duration, true);
  assert.equal(action.title.en.includes('durationMs'), false);
  assert.equal(action.titleFormatted.en.includes('durationMs'), false);
  assert.equal(action.title.en.includes('textColor'), false);
  assert.equal(action.titleFormatted.en.includes('textColor'), false);
  assert.equal(action.args.some((arg) => arg.name === 'durationMs'), false);
  assert.equal(action.args.some((arg) => arg.name === 'textColor'), false);
  assert.ok(colorArg);
  assert.equal(colorArg.type, 'color');
  assert.ok(optionsArg);
  assert.equal(optionsArg.required, false);
  assert.equal(Object.hasOwn(optionsArg, 'value'), false);
});

test('existing AWTRIX 3-only flow action compose files remain scoped to the AWTRIX 3 driver', () => {
  const files = fs.readdirSync(actionsDir)
    .filter((fileName) => fileName.endsWith('.json') && !awtrixNgFlowFiles.includes(fileName) && !sharedFlowFiles.includes(fileName));

  assert.ok(files.length > 0, 'expected existing AWTRIX 3-only flow action files');

  for (const fileName of files) {
    const action = readJson(fileName);
    const deviceArg = getDeviceArg(action);

    assert.ok(deviceArg, `${fileName} must define a device argument`);
    assert.equal(deviceArg.filter, 'driver_id=awtrixlight', `${fileName} must remain scoped to AWTRIX 3 devices`);
  }
});
