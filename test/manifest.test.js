const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));

const stringsWithin = (value) => {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(stringsWithin);
  }

  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(stringsWithin);
  }

  return [];
};

const isLocalAssetPath = (value) => !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);

const collectManifestAssetPaths = (manifest) => {
  const assetPaths = new Set();

  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (value === null || typeof value !== 'object') {
      return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (key === 'images' || key === 'icon') {
        stringsWithin(nestedValue)
          .filter(isLocalAssetPath)
          .forEach((assetPath) => assetPaths.add(assetPath));
        continue;
      }

      visit(nestedValue);
    }
  };

  visit(manifest);
  return [...assetPaths].sort();
};

test('every local manifest image and icon path exists', () => {
  const manifest = readJson('app.json');
  const assetPaths = collectManifestAssetPaths(manifest);

  assert.ok(assetPaths.length > 0, 'Expected app.json to contain local image or icon paths.');

  for (const assetPath of assetPaths) {
    const relativeAssetPath = assetPath.replace(/^\/+/, '');
    assert.equal(
      fs.existsSync(path.join(root, relativeAssetPath)),
      true,
      `Manifest asset does not exist: ${assetPath}`,
    );
  }
});

test('every manifest flow action has a runtime registration', () => {
  const manifest = readJson('app.json');
  const driverSources = fs.readdirSync(path.join(root, 'drivers'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join('drivers', entry.name, 'driver.ts'))
    .filter((relativePath) => fs.existsSync(path.join(root, relativePath)));
  const registeredActionIds = new Set();

  for (const sourcePath of ['app.ts', ...driverSources]) {
    const source = readText(sourcePath);
    for (const match of source.matchAll(/getActionCard\('([^']+)'\)/g)) {
      registeredActionIds.add(match[1]);
    }
  }

  const unregisteredActionIds = manifest.flow.actions
    .map((action) => action.id)
    .filter((actionId) => !registeredActionIds.has(actionId))
    .sort();

  assert.deepEqual(unregisteredActionIds, []);
});
