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
