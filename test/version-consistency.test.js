const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(root, relativePath), 'utf8'),
);

test('package and Homey manifest versions stay aligned', () => {
  const packageJson = readJson('package.json');
  const homeyCompose = readJson('.homeycompose/app.json');
  const packageLock = readJson('package-lock.json');
  const expectedVersion = homeyCompose.version;

  assert.deepEqual({
    packageJson: packageJson.version,
    homeyCompose: homeyCompose.version,
    packageLock: packageLock.version,
    packageLockRoot: packageLock.packages?.['']?.version,
  }, {
    packageJson: expectedVersion,
    homeyCompose: expectedVersion,
    packageLock: expectedVersion,
    packageLockRoot: expectedVersion,
  });
});
