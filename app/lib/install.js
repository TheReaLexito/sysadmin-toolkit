'use strict';
// Тихая установка программ из Tools\Install («установка на чистый ПК»).
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');

// key — начало имени файла; only64 — установщик только для 64-бит; def — отмечен в «базовом наборе»
const INSTALLERS = [
  { key: 'vc_redist.x64', name: 'Visual C++ 2015-2022 x64', args: () => ['/install', '/quiet', '/norestart'], only64: true, def: true },
  { key: 'vc_redist.x86', name: 'Visual C++ 2015-2022 x86', args: () => ['/install', '/quiet', '/norestart'], only64: false, def: true },
  { key: 'ndp481', name: '.NET Framework 4.8.1', args: () => ['/passive', '/norestart'], only64: false, def: true },
  { key: 'dxwebsetup', name: 'DirectX (через интернет)', args: () => ['/Q'], only64: false, def: false },
  { key: '7z', name: '7-Zip', args: () => ['/S'], only64: true, def: true },
  { key: 'winrar-', name: 'WinRAR', args: () => ['/S'], only64: true, def: false },
  { key: 'googlechromestandaloneenterprise', name: 'Google Chrome', msi: true, only64: true, def: true },
  { key: 'firefox', name: 'Firefox', args: () => ['/S'], only64: true, def: false },
  { key: 'sumatrapdf', name: 'Sumatra PDF', args: () => ['-s', '-all-users'], only64: true, def: true },
  { key: 'vlc-', name: 'VLC — видеоплеер', args: () => ['/L=1049', '/S'], only64: true, def: true },
];

function meta(file) {
  const low = path.basename(file).toLowerCase();
  return INSTALLERS.find((i) => low.startsWith(i.key)) || null;
}

function runWait(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    let out = '';
    const c = spawn(cmd, args, { windowsHide: true });
    const t = setTimeout(() => { try { c.kill(); } catch (_) { /* */ } resolve({ code: -2, out: 'превышено время ожидания' }); }, timeoutMs);
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { out += d; });
    c.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: String(e.message) }); });
    c.on('exit', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}

// Возвращает { ok, msg, change }
async function install(file) {
  const m = meta(file);
  if (!m) return { ok: false, msg: 'неизвестный установщик: ' + path.basename(file) };
  if (m.only64 && !P.is64()) return { ok: false, msg: m.name + ': установщик только для 64-битной Windows' };
  const r = m.msi
    ? await runWait('msiexec', ['/i', file, '/qb', '/norestart'], 30 * 60 * 1000)
    : await runWait(file, m.args(), 30 * 60 * 1000);
  if (r.code === 0 || r.code === 3010) {
    return { ok: true, msg: m.name + ' установлен' + (r.code === 3010 ? ' (нужна перезагрузка)' : ''), change: 'Установлен ' + m.name };
  }
  if (r.code === 1638 || r.code === 5100 || (r.code === 1603 && /chrome/i.test(m.name))) {
    return { ok: true, msg: `${m.name}: уже стоит такая же или более новая версия (код ${r.code})` };
  }
  return { ok: false, msg: `Не удалось установить ${m.name} (код ${r.code}) ${String(r.out).trim().slice(0, 200)}` };
}

module.exports = { INSTALLERS, meta, install };
