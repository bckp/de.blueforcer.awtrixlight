/**
 * Copies the driver asset folders into .homeybuild after a bare `tsc` build.
 *
 * `homey app build` produces the full layout including assets, but `npm run build`
 * only runs tsc - without this step, tests that read bundled icons from
 * .homeybuild/drivers/<driver>/assets fail on a fresh checkout (or after
 * `rm -rf .homeybuild`). Running this after `homey app build` is harmless:
 * it overwrites the assets with identical content.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const driversDir = path.join(root, 'drivers');
const buildDriversDir = path.join(root, '.homeybuild', 'drivers');

for (const entry of fs.readdirSync(driversDir, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    const assetsDir = path.join(driversDir, entry.name, 'assets');

    if (fs.existsSync(assetsDir)) {
      fs.cpSync(assetsDir, path.join(buildDriversDir, entry.name, 'assets'), { recursive: true });
    }
  }
}
