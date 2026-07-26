const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const locale = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8'));
const localeUsagePattern = /(?:Homey|homey)\.__\(\s*['"]([^'"]+)['"]\s*\)/g;

const sourceRoots = [
  'app.ts',
  'drivers',
  'lib',
];

const readSourceFiles = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    return /\.(html|ts)$/.test(relativePath) ? [relativePath] : [];
  }

  return fs.readdirSync(absolutePath)
    .flatMap((entry) => readSourceFiles(path.join(relativePath, entry)));
};

const getLocaleValue = (key) => key.split('.')
  .reduce((value, part) => {
    if (value && typeof value === 'object' && part in value) {
      return value[part];
    }

    return undefined;
  }, locale);

test('all locale keys used by runtime source files exist in en locale', () => {
  const missingKeys = [];

  for (const sourceRoot of sourceRoots) {
    for (const sourceFile of readSourceFiles(sourceRoot)) {
      const source = fs.readFileSync(path.join(root, sourceFile), 'utf8');
      const matches = source.matchAll(localeUsagePattern);

      for (const match of matches) {
        const localeKey = match[1];

        if (typeof getLocaleValue(localeKey) !== 'string') {
          missingKeys.push(`${sourceFile}: ${localeKey}`);
        }
      }
    }
  }

  assert.deepEqual(missingKeys, []);
});

test('legacy incorrect locale keys are not used', () => {
  const source = sourceRoots
    .flatMap(readSourceFiles)
    .map((sourceFile) => fs.readFileSync(path.join(root, sourceFile), 'utf8'))
    .join('\n');

  assert.equal(source.includes("__('loading')"), false);
  assert.equal(source.includes("__('login.invalidCredentials')"), false);
});
