'use strict';
// Сведения о текущем ПК для боковой панели («голосовой канал» ЭТОТ ПК).
const os = require('os');
const { spawnSync } = require('child_process');

function isAdmin() {
  try { return spawnSync('fltmc', [], { windowsHide: true, timeout: 5000 }).status === 0; } catch (_) { return false; }
}

function osName() {
  let name = os.version ? os.version() : 'Windows';
  try {
    const r = spawnSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', '/v', 'DisplayVersion'],
      { windowsHide: true, timeout: 5000, encoding: 'utf8' });
    const m = /DisplayVersion\s+REG_SZ\s+(\S+)/.exec(r.stdout || '');
    if (m) name += ' ' + m[1];
  } catch (_) { /* */ }
  return name.replace(/^Windows /, 'Win ');
}

function ip() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) return n.address;
  }
  return 'нет сети';
}

function info() {
  return {
    pc: os.hostname(),
    user: os.userInfo().username,
    os: osName(),
    ip: ip(),
    admin: isAdmin(),
    cpu: (os.cpus()[0] || {}).model || '',
    ramGb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
  };
}

module.exports = { info, isAdmin };
