/* eslint-disable no-console */
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const appJson = require('../app.json');
const packageJson = require('../package.json');

const packageJsonPath = path.join(__dirname, '../package.json');

if (appJson.version !== packageJson.version) {
  console.log(`Versions do not match. Synchronizing package.json from ${packageJson.version} to ${appJson.version}...`);
  packageJson.version = appJson.version;

  // Keep the same formatting (2 spaces) and add a trailing newline
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  console.log('Updating package-lock.json using npm install...');
  execSync('npm install --package-lock-only', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });

  console.log('Version synchronized successfully! 🎉');
} else {
  console.log(`Versions are already synchronized (${appJson.version}). No action required.`);
}
