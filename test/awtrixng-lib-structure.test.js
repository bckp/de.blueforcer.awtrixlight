const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const awtrixNgLibDir = path.join(__dirname, '..', 'lib', 'awtrixng');

const expectedModuleDirectories = [
  'Api',
  'Device',
  'Discovery',
  'Http',
  'Payload',
  'Services',
  'Support',
];

test('AWTRIX NG lib root contains only module directories', () => {
  const entries = fs.readdirSync(awtrixNgLibDir, { withFileTypes: true });

  assert.deepEqual(entries.map((entry) => entry.name).sort(), expectedModuleDirectories);
  assert.deepEqual(entries.filter((entry) => entry.isFile()).map((entry) => entry.name), []);
});

test('AWTRIX NG lib module files use PascalCase names', () => {
  for (const directoryName of expectedModuleDirectories) {
    const entries = fs.readdirSync(path.join(awtrixNgLibDir, directoryName), { withFileTypes: true });
    const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

    for (const fileName of fileNames) {
      assert.match(fileName, /^[A-Z][A-Za-z0-9]*\.ts$/, `${directoryName}/${fileName} must use PascalCase`);
    }
  }
});

const listImportedModules = (source) => [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);

test('AWTRIX NG lib never imports homey or driver code', () => {
  for (const directoryName of expectedModuleDirectories) {
    const moduleDir = path.join(awtrixNgLibDir, directoryName);
    const fileNames = fs.readdirSync(moduleDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    for (const fileName of fileNames) {
      const imports = listImportedModules(fs.readFileSync(path.join(moduleDir, fileName), 'utf8'));

      for (const importedModule of imports) {
        assert.notEqual(importedModule, 'homey', `${directoryName}/${fileName} must not import homey`);
        assert.equal(importedModule.includes('drivers/'), false, `${directoryName}/${fileName} must not import from drivers/`);
      }
    }
  }
});

// update-plan-3 acceptance criteria: the driver layer talks to lib/awtrixng through the
// AwtrixNgApi facade; only the modules below may be imported directly.
const allowedDriverImports = {
  'device.ts': [
    'lib/awtrixng/Api/Api',
    'lib/awtrixng/Discovery/Detection',
    'lib/awtrixng/Services/Settings',
    'lib/awtrixng/Support/Guards',
  ],
  'driver.ts': [
    'lib/awtrixng/Api/Api',
    'lib/awtrixng/Api/ErrorParser',
    'lib/awtrixng/Api/Types',
    'lib/awtrixng/Device/State',
    'lib/awtrixng/Discovery/Detection',
    'lib/awtrixng/Support/Guards',
  ],
  'flow-actions.ts': [
    'lib/awtrixng/Api/Api',
    'lib/awtrixng/Api/Client',
    'lib/awtrixng/Api/Types',
    'lib/awtrixng/Payload/JsonPayload',
    'lib/awtrixng/Payload/Transformers',
    'lib/awtrixng/Services/Display',
  ],
};

test('AWTRIX NG driver files import lib/awtrixng only through the facade surface', () => {
  const driverDir = path.join(__dirname, '..', 'drivers', 'awtrixng');

  for (const [fileName, allowedImports] of Object.entries(allowedDriverImports)) {
    const imports = listImportedModules(fs.readFileSync(path.join(driverDir, fileName), 'utf8'))
      .filter((importedModule) => importedModule.includes('lib/awtrixng'))
      .map((importedModule) => importedModule.replace('../../', ''));

    for (const importedModule of imports) {
      assert.equal(
        allowedImports.includes(importedModule),
        true,
        `${fileName} imports ${importedModule}; extend the facade instead or update the allowlist deliberately`,
      );
    }
  }
});
