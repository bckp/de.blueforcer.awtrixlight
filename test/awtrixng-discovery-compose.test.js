const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));

test('AWTRIX NG discovery compose uses separate _awtrixng._tcp service and txt type', () => {
  const discovery = readJson('.homeycompose/discovery/awtrixng-mdns.json');

  assert.equal(discovery.type, 'mdns-sd');
  assert.deepEqual(discovery['mdns-sd'], {
    name: 'awtrixng',
    protocol: 'tcp',
  });
  assert.equal(discovery.id, '{{txt.id}}');
  assert.deepEqual(discovery.conditions, [[{
    field: 'txt.type',
    match: {
      type: 'string',
      value: 'awtrixng',
    },
  }]]);
});

test('AWTRIX NG driver compose is wired to NG discovery strategy without changing AWTRIX 3 strategy', () => {
  const awtrixNgDriver = readJson('drivers/awtrixng/driver.compose.json');
  const awtrix3Driver = readJson('drivers/awtrixlight/driver.compose.json');
  const awtrix3Discovery = readJson('.homeycompose/discovery/awtrix-mdns.json');

  assert.equal(awtrixNgDriver.discovery, 'awtrixng-mdns');
  assert.equal(awtrix3Driver.discovery, 'awtrix-mdns');
  assert.deepEqual(awtrix3Discovery['mdns-sd'], {
    name: 'awtrix',
    protocol: 'tcp',
  });
  assert.equal(JSON.stringify(awtrix3Discovery).includes('awtrixng'), false);
});

test('AWTRIX NG driver compose declares base control capabilities', () => {
  const awtrixNgDriver = readJson('drivers/awtrixng/driver.compose.json');

  assert.deepEqual(awtrixNgDriver.capabilities, [
    'button_prev',
    'button_next',
    'alarm_generic.indicator1',
    'alarm_generic.indicator2',
    'alarm_generic.indicator3',
    'awtrix_matrix',
    'awtrixng_weather_overlay',
    'rssi',
    'ip',
  ]);
});

test('AWTRIX NG pairing uses discovery list with a custom selection router', () => {
  const awtrixNgDriver = readJson('drivers/awtrixng/driver.compose.json');
  const awtrix3Driver = readJson('drivers/awtrixlight/driver.compose.json');

  assert.deepEqual(awtrixNgDriver.pair.map((view) => view.id), [
    'list_my_devices',
    'pair_selection_router',
    'manual_pairing_placeholder',
    'credentials_placeholder',
    'add_my_devices',
  ]);
  assert.equal(awtrixNgDriver.pair[0].template, 'list_devices');
  assert.deepEqual(awtrixNgDriver.pair[0].navigation, {
    next: 'pair_selection_router',
  });
  assert.equal(awtrixNgDriver.pair[1].template, undefined);
  assert.equal(awtrixNgDriver.pair[2].template, undefined);
  assert.equal(awtrixNgDriver.pair[3].template, undefined);
  assert.equal(awtrixNgDriver.pair[4].template, 'add_devices');

  assert.deepEqual(awtrix3Driver.pair.map((view) => view.id), [
    'list_my_devices',
    'add_my_devices',
  ]);
});

test('AWTRIX NG custom pairing views initialize without DOMContentLoaded or dead back navigation', () => {
  const router = readText('drivers/awtrixng/pair/pair_selection_router.html');
  const manualPairing = readText('drivers/awtrixng/pair/manual_pairing_placeholder.html');

  assert.equal(router.includes('DOMContentLoaded'), false);
  assert.ok(router.includes("Homey.emit('resolve_pair_selection', {})"));
  assert.ok(router.includes("Homey.showView('list_my_devices')"));
  assert.ok(router.includes("Homey.setTitle(Homey.__('pair.router.title'))"));
  assert.ok(router.includes("Homey.__('pair.router.preparing')"));
  assert.equal(router.includes('<p>Preparing pairing...</p>'), false);

  assert.equal(manualPairing.includes('DOMContentLoaded'), false);
  assert.equal(manualPairing.includes('back-to-list'), false);
  assert.equal(manualPairing.includes("Homey.showView('list_my_devices')"), false);
});

test('AWTRIX NG manual pairing view uses Homey form styles and creates device after successful probe', () => {
  const manualPairing = readText('drivers/awtrixng/pair/manual_pairing_placeholder.html');

  assert.ok(manualPairing.includes('class="homey-header"'));
  assert.ok(manualPairing.includes('class="homey-form"'));
  assert.ok(manualPairing.includes('class="homey-form-fieldset"'));
  assert.ok(manualPairing.includes('class="homey-form-group"'));
  assert.ok(manualPairing.includes('class="homey-form-label"'));
  assert.ok(manualPairing.includes('class="homey-form-input"'));
  assert.ok(manualPairing.includes('class="homey-button-primary-full"'));
  assert.ok(manualPairing.includes("emitHomey('manual_pairing_probe', payload)"));
  assert.ok(manualPairing.includes('Homey.createDevice'));
  assert.ok(manualPairing.includes('Homey.done'));
  assert.ok(manualPairing.includes("Homey.showView('credentials_placeholder')"));
  assert.ok(manualPairing.includes("Homey.setTitle(Homey.__('pair.manual.title'))"));
  assert.ok(manualPairing.includes("Homey.__('pair.manual.subtitle')"));
  assert.ok(manualPairing.includes("Homey.__('pair.manual.errors.addressRequired')"));
  assert.ok(manualPairing.includes("Homey.__('pair.manual.errors.invalidAddress')"));
  assert.ok(manualPairing.includes("Homey.__('pair.manual.errors.invalidPort')"));
  assert.ok(manualPairing.includes("testButton.textContent = Homey.__('pair.manual.addingButton')"));
  assert.ok(manualPairing.includes('testButton.textContent = testButtonDefaultText'));
  assert.equal(manualPairing.includes("showMessage('Adding device...')"), false);
  assert.equal(manualPairing.includes('manual-probe-name'), false);
  assert.equal(manualPairing.includes('manual-probe-uid'), false);
  assert.equal(manualPairing.includes('manual-probe-version'), false);
  assert.equal(manualPairing.includes("Homey.showView('add_my_devices')"), false);
});

test('AWTRIX NG credentials view collects credentials and creates device after successful probe', () => {
  const credentialsView = readText('drivers/awtrixng/pair/credentials_placeholder.html');

  assert.ok(credentialsView.includes("Homey.setTitle(Homey.__('pair.credentials.title'))"));
  assert.ok(credentialsView.includes("Homey.__('pair.credentials.subtitle')"));
  assert.ok(credentialsView.includes('id="credentials-username"'));
  assert.ok(credentialsView.includes('id="credentials-password"'));
  assert.ok(credentialsView.includes("throw new Error(Homey.__('pair.credentials.errors.required'))"));
  assert.ok(credentialsView.includes("emitHomey('credentials_pairing_add', payload)"));
  assert.ok(credentialsView.includes('Homey.createDevice'));
  assert.ok(credentialsView.includes('Homey.done'));
  assert.ok(credentialsView.includes("Homey.alert(Homey.__('pair.credentials.errors.invalid'))"));
  assert.ok(credentialsView.includes("addButton.textContent = Homey.__('pair.credentials.addingButton')"));
  assert.equal(credentialsView.includes('DOMContentLoaded'), false);
});

test('application flows register app-level listeners', () => {
  const appSource = readText('app.ts');
  const driverSource = readText('drivers/awtrixng/driver.ts');

  assert.ok(appSource.includes("getActionCard('application')"));
  assert.ok(appSource.includes("getActionCard('applicationRaw')"));
  assert.ok(appSource.includes("getActionCard('weatherOverlay')"));
  assert.ok(appSource.includes('autocompleteSharedIconAction'));
  assert.equal(driverSource.includes("getActionCard('application')"), false);
  assert.equal(driverSource.includes("getActionCard('applicationRaw')"), false);
});

test('shared flow cards are registered once at app level instead of per driver', () => {
  const appSource = readText('app.ts');
  const awtrix3DriverSource = readText('drivers/awtrixlight/driver.ts');
  const awtrixNgDriverSource = readText('drivers/awtrixng/driver.ts');

  const appLevelCardIds = [
    'notification',
    'notificationSticky',
    'notificationRaw',
    'notificationDismiss',
    'displaySet',
    'playRTTTL',
    'indicator',
    'indicatorDismiss',
    'application',
    'applicationRaw',
    'applicationRemove',
    'weatherOverlay',
  ];

  for (const cardId of appLevelCardIds) {
    assert.ok(appSource.includes(`getActionCard('${cardId}')`), `${cardId} must be registered by the app`);
    assert.equal(awtrix3DriverSource.includes(`getActionCard('${cardId}')`), false, `${cardId} must not be registered by the AWTRIX 3 driver`);
  }

  assert.ok(awtrix3DriverSource.includes("getActionCard('notificationIcon')"), 'deprecated notificationIcon must remain registered by the AWTRIX 3 driver');
  assert.ok(awtrix3DriverSource.includes("getActionCard('notificationJson')"), 'deprecated notificationJson must remain registered by the AWTRIX 3 driver');
  assert.ok(awtrix3DriverSource.includes("getActionCard('customApp')"), 'deprecated customApp must remain registered by the AWTRIX 3 driver');
  assert.ok(awtrix3DriverSource.includes("getActionCard('removeCustomApp')"), 'deprecated removeCustomApp must remain registered by the AWTRIX 3 driver');
  assert.equal(appSource.includes("getActionCard('notificationIcon')"), false, 'deprecated notificationIcon must not be registered by the app');
  assert.equal(appSource.includes("getActionCard('notificationJson')"), false, 'deprecated notificationJson must not be registered by the app');
  assert.equal(appSource.includes("getActionCard('customApp')"), false, 'deprecated customApp must not be registered by the app');
  assert.equal(appSource.includes("getActionCard('removeCustomApp')"), false, 'deprecated removeCustomApp must not be registered by the app');

  assert.equal(awtrixNgDriverSource.includes("getActionCard('weatherOverlay')"), false, 'weatherOverlay must be registered by the app even though it remains AWTRIX NG-only');
  assert.equal(awtrixNgDriverSource.includes("getActionCard('applicationRaw')"), false, 'applicationRaw must be registered by the app even though it remains AWTRIX NG-only');

  for (const cardId of [
    'awtrixngNotification',
    'awtrixngStickyNotification',
    'awtrixngDismissNotification',
    'awtrixngDisplaySet',
    'awtrixngNotificationJson',
    'awtrixngWeatherOverlay',
    'awtrixngPlayRtttl',
    'awtrixngIndicator',
    'awtrixngIndicatorDismiss',
    'awtrixngRemoveCustomApp',
    'awtrixngCustomApp',
    'awtrixngCustomAppJson',
  ]) {
    assert.equal(awtrixNgDriverSource.includes(`getActionCard('${cardId}')`), false, `${cardId} must not be registered by the AWTRIX NG driver`);
  }
});

test('AWTRIX NG driver registers pairing selection and manual probe handlers', () => {
  const driverSource = readText('drivers/awtrixng/driver.ts');

  assert.ok(driverSource.includes("session.setHandler('list_devices_selection', handlePairSelection)"));
  assert.ok(driverSource.includes("session.setHandler('list_my_devices_selection', handlePairSelection)"));
  assert.ok(driverSource.includes("'manual_pairing_probe'"));
  assert.ok(driverSource.includes('probeManualPairingInput(input)'));
  assert.ok(driverSource.includes("'credentials_pairing_add'"));
  assert.ok(driverSource.includes('parseCredentialsPairingInput(payload)'));
  assert.ok(driverSource.includes('probePendingAuthPairTarget(pendingAuthTarget, credentials)'));
  assert.ok(driverSource.includes('pendingAuthTarget = this.getPendingAuthTargetFromSelection(selection)'));
  assert.ok(driverSource.includes("store.kind !== 'auth-required-discovery'"));
  assert.ok(driverSource.includes("if (result.status === 'auth-required')"));
  assert.ok(driverSource.includes('toAuthRequiredPairDevice({'));
  assert.ok(driverSource.includes("kind: 'auth-required-discovery'"));
  assert.ok(driverSource.includes("await session.showView('credentials_placeholder')"));
  assert.ok(driverSource.includes('device: this.toPairDevice({'));
  assert.equal(driverSource.match(/this\.toPairDevice\(\{/g)?.length, 3, 'manual, credentials and discovery paths use the same pair-device mapper');
});
