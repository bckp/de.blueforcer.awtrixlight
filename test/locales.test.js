const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const locale = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8'));
const localeUsagePattern = /(?:Homey|homey)\.__\(\s*['"]([^'"]+)['"]\s*\)/g;
const locales = fs.readdirSync(path.join(root, 'locales'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.slice(0, -5))
  .sort();

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

const readComposeFiles = (relativePath) => fs.readdirSync(path.join(root, relativePath), { withFileTypes: true })
  .flatMap((entry) => {
    const entryPath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) return readComposeFiles(entryPath);
    return entry.name.endsWith('.json') ? [entryPath] : [];
  });

const translatedObjects = (value, location) => {
  if (!value || typeof value !== 'object') return [];
  const current = typeof value.en === 'string' ? [{ value, location }] : [];
  return current.concat(Object.entries(value)
    .flatMap(([key, child]) => translatedObjects(child, `${location}.${key}`)));
};

const composeTranslations = () => {
  const driverFiles = fs.readdirSync(path.join(root, 'drivers'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => fs.readdirSync(path.join(root, 'drivers', entry.name))
      .filter((file) => file.endsWith('.compose.json'))
      .map((file) => path.join('drivers', entry.name, file)));
  return [...readComposeFiles('.homeycompose'), ...driverFiles, 'app.json']
    .flatMap((file) => translatedObjects(readJson(file), file));
};

const stringEntries = (value, location = '') => {
  if (typeof value === 'string') return [[location, value]];
  return Object.entries(value).flatMap(([key, child]) => stringEntries(child, `${location}.${key}`));
};

const flowPlaceholders = (text) => [...text.matchAll(/\[\[([^\]]+)\]\]/g)]
  .map((match) => match[1]).sort();

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

test('all supported runtime locales have the same non-empty string keys', () => {
  const expectedKeys = stringEntries(locale).map(([key]) => key).sort();
  for (const language of locales) {
    const entries = stringEntries(readJson(`locales/${language}.json`));
    assert.deepEqual(entries.map(([key]) => key).sort(), expectedKeys, language);
    for (const [key, value] of entries) {
      assert.ok(value.trim(), `${language}${key} must not be empty`);
    }
  }
});

test('compose and generated manifest UI texts cover every supported locale', () => {
  const missing = [];
  for (const { value, location } of composeTranslations()) {
    for (const language of locales) {
      if (typeof value[language] !== 'string' || !value[language].trim()) {
        missing.push(`${location}.${language}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('translated Flow texts preserve the English argument placeholders', () => {
  for (const { value, location } of composeTranslations()) {
    const expected = flowPlaceholders(value.en);
    for (const language of locales) {
      if (typeof value[language] === 'string') {
        assert.deepEqual(flowPlaceholders(value[language]), expected, `${location}.${language}`);
      }
    }
  }
});
