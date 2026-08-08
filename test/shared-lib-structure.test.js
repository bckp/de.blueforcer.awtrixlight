const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sharedLibDir = path.join(__dirname, '..', 'lib', 'shared');

// AGENTS.md: lib/shared may contain exclusively protocol-agnostic infrastructure.
// Currently only Poll (+ TimerHost); anything else needs explicit owner approval.
const allowedFiles = ['Poll.ts'];

test('shared lib contains only the approved protocol-agnostic modules', () => {
  const entries = fs.readdirSync(sharedLibDir, { withFileTypes: true });

  assert.deepEqual(entries.map((entry) => entry.name).sort(), allowedFiles);
  assert.deepEqual(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name), []);
});

test('shared lib never imports homey, drivers or a protocol lib layer', () => {
  for (const fileName of allowedFiles) {
    const source = fs.readFileSync(path.join(sharedLibDir, fileName), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);

    for (const importedModule of imports) {
      assert.notEqual(importedModule, 'homey', `${fileName} must not import homey`);
      assert.equal(importedModule.includes('drivers/'), false, `${fileName} must not import from drivers/`);
      assert.equal(importedModule.includes('awtrix3'), false, `${fileName} must not import from lib/awtrix3`);
      assert.equal(importedModule.includes('awtrixng'), false, `${fileName} must not import from lib/awtrixng`);
    }

    assert.equal(/AwtrixNg|Awtrix3|AWTRIX/i.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')), false, `${fileName} must not contain protocol-specific identifiers`);
  }
});
