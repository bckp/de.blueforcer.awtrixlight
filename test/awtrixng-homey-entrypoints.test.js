const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('AWTRIX NG Homey driver entrypoint uses CommonJS class export', () => {
  const source = readProjectFile('drivers/awtrixng/driver.ts');

  assert.equal(source.includes('class AwtrixNgDriver extends Driver'), true);
  assert.equal(source.includes('export default AwtrixNgDriver;'), true);
  assert.equal(source.includes('module.exports = AwtrixNgDriver;'), true);
});

test('AWTRIX NG Homey device entrypoint uses CommonJS class export', () => {
  const source = readProjectFile('drivers/awtrixng/device.ts');

  assert.equal(source.includes('class AwtrixNgDevice extends Device'), true);
  assert.equal(source.includes('export default AwtrixNgDevice;'), true);
  assert.equal(source.includes('module.exports = AwtrixNgDevice;'), true);
});
