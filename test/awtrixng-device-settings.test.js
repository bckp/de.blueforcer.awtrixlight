const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const readSource = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const getMethodBody = (source, methodName) => {
  const methodStart = source.indexOf(methodName);

  assert.notEqual(methodStart, -1, `${methodName} must exist`);

  const bodyStart = source.indexOf('{', methodStart);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    }

    if (source[index] === '}') {
      depth -= 1;
    }

    if (depth === 0) {
      return source.slice(bodyStart, index + 1);
    }
  }

  throw new Error(`Could not parse ${methodName} body`);
};

const getSourceBetween = (source, startText, endText) => {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);

  assert.notEqual(start, -1, `${startText} must exist`);
  assert.notEqual(end, -1, `${endText} must exist after ${startText}`);

  return source.slice(start, end);
};

test('AWTRIX NG device refreshes Homey settings from the device during init', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const onInitBody = getMethodBody(source, 'async onInit()');

  assert.equal(onInitBody.includes('await this.refreshSettingsFromDevice();'), true);
  assert.equal(onInitBody.includes('await this.refreshDisplayFromDevice();'), true);
  assert.equal(onInitBody.includes('await this.refreshAppsFromDevice();'), true);
  assert.equal(onInitBody.includes("deviceStateResult?.status === 'detected'"), true);
});

test('AWTRIX NG onSettings does not call setSettings while Homey settings are pending', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const onSettingsBody = getSourceBetween(source, 'async onSettings({', 'async refreshAvailability');

  assert.equal(onSettingsBody.includes('applyAwtrixNgBuiltinAppSettingsChange'), true);
  assert.equal(onSettingsBody.includes('applyAwtrixNgHomeySettingsChange'), true);
  assert.equal(onSettingsBody.includes('changedKeys.filter((key) => !isAwtrixNgBuiltinAppSetting(key))'), true);
  assert.equal(onSettingsBody.includes('setSettings('), false);
});

test('AWTRIX NG device settings refresh uses GET settings and setSettings outside onSettings', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const refreshBody = getMethodBody(source, 'private async refreshSettingsFromDevice()');

  assert.equal(refreshBody.includes('await this.getClient().getSettings();'), true);
  assert.equal(refreshBody.includes('toAwtrixNgHomeySettingsUpdate'), true);
  assert.equal(refreshBody.includes('await this.setSettings(homeySettingsUpdate);'), true);
});

test('AWTRIX NG device display refresh syncs weather overlay capability from GET display', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const refreshBody = getMethodBody(source, 'private async refreshDisplayFromDevice()');

  assert.equal(refreshBody.includes('await this.getClient().getDisplay();'), true);
  assert.equal(refreshBody.includes('toAwtrixNgHomeyWeatherOverlayValue(display.overlay)'), true);
  assert.equal(refreshBody.includes('await this.setCapabilityValue(AwtrixNgWeatherOverlayCapabilityId, weatherOverlay);'), true);
  assert.equal(refreshBody.includes('setSettings('), false);
});

test('AWTRIX NG device apps refresh syncs built-in app settings from GET apps outside onSettings', () => {
  const source = readSource('drivers/awtrixng/device.ts');
  const refreshBody = getMethodBody(source, 'private async refreshAppsFromDevice()');

  assert.equal(refreshBody.includes('await this.getClient().getApps();'), true);
  assert.equal(refreshBody.includes('toAwtrixNgBuiltinAppSettingsUpdate'), true);
  assert.equal(refreshBody.includes('await this.setSettings(homeySettingsUpdate);'), true);
});
