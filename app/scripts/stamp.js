'use strict';
// Запускается перед упаковкой (npm run dist → predist): записывает версию и дату сборки в data\build.json.
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const out = {
  version: pkg.version,
  date: new Date().toISOString(),
  electron: (pkg.devDependencies && pkg.devDependencies.electron) || '',
};
fs.writeFileSync(path.join(__dirname, '..', 'data', 'build.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('build stamp:', out.version, out.date);
