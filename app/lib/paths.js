'use strict';
// Общие пути. Инициализируются один раз из main.js (init), остальные модули читают их отсюда.
const fs = require('fs');
const path = require('path');

const P = { isWin: process.platform === 'win32' };

P.init = function init({ exeDir, srcDir, workDir, binDir }) {
  P.exeDir = exeDir;
  P.srcDir = srcDir;
  P.workDir = workDir;
  P.binDir = binDir;
  P.toolsDir = path.join(srcDir, 'Tools');
  P.appsDir = path.join(P.toolsDir, 'Apps');
  P.installDir = path.join(P.toolsDir, 'Install');
  P.reportsDir = path.join(srcDir, 'Reports');
  P.customJson = path.join(srcDir, 'tools.json');
  P.localMark = path.join(exeDir, '.localcopy');
  fs.mkdirSync(workDir, { recursive: true });
};

P.is64 = () => ['x64', 'arm64'].includes(process.arch) || /64/.test(process.env.PROCESSOR_ARCHITEW6432 || '');

module.exports = P;
