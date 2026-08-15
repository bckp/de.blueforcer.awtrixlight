/* eslint-disable no-console */
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const appJson = require('../app.json');
const packageJson = require('../package.json');

const packageJsonPath = path.join(__dirname, '../package.json');

if (appJson.version !== packageJson.version) {
  console.log(`Verze nesouhlasí. Synchronizuji package.json z ${packageJson.version} na ${appJson.version}...`);
  packageJson.version = appJson.version;

  // Zachováme stejné formátování (2 mezery) a prázdný řádek na konci
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  console.log('Aktualizuji package-lock.json pomocí npm install...');
  execSync('npm install --package-lock-only', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });

  console.log('Verze byla úspěšně synchronizována! 🎉');
} else {
  console.log(`Verze jsou aktuálně synchronizované (${appJson.version}). Žádná akce není potřeba.`);
}
