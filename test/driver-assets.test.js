const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const awtrix3IconsDir = path.join(root, 'drivers', 'awtrixlight', 'assets', 'images', 'icons');
const awtrixNgIconsDir = path.join(root, 'drivers', 'awtrixng', 'assets', 'images', 'icons');

/**
 * The bundled device icons (uploaded to the device in onAdded) are maintained as one set
 * duplicated into both drivers because Homey requires per-driver asset folders. This test
 * guards against the copies drifting apart silently: edit one copy, mirror it with
 * `cp drivers/awtrixlight/assets/images/icons/* drivers/awtrixng/assets/images/icons/`,
 * or update this test if a deliberate per-driver divergence is ever decided.
 *
 * Deliberately NOT guarded: icon.svg and small/large/xlarge.png - the driver images
 * differ between the drivers on purpose (distinct branding since 2.2.x).
 */
test('bundled device icons stay identical across both drivers', () => {
  const awtrix3Icons = fs.readdirSync(awtrix3IconsDir).sort();
  const awtrixNgIcons = fs.readdirSync(awtrixNgIconsDir).sort();

  assert.deepEqual(awtrixNgIcons, awtrix3Icons, 'both drivers bundle the same icon file names');
  assert.ok(awtrix3Icons.length > 0, 'the bundled icon set is not empty');

  for (const fileName of awtrix3Icons) {
    const awtrix3Content = fs.readFileSync(path.join(awtrix3IconsDir, fileName));
    const awtrixNgContent = fs.readFileSync(path.join(awtrixNgIconsDir, fileName));

    assert.equal(
      awtrix3Content.equals(awtrixNgContent),
      true,
      `${fileName} differs between the drivers; mirror the edited copy or update this test deliberately`,
    );
  }
});
