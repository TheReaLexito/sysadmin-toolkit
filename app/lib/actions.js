'use strict';
// Действия страниц «windows», «плюшки», «сеть» (перенесены из Python-версии).
// Каждое действие возвращает { text?, change?, error? }; change попадает в список «что изменено» при выходе.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dns = require('dns');
const dgram = require('dgram');
const P = require('./paths');
const launch = require('./launch');

// вывод консольных программ Windows бывает в OEM-кодировке (cp866)
function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { /* не UTF-8 */ }
  try { return new TextDecoder('ibm866').decode(buf); } catch (_) { return buf.toString('latin1'); }
}

// Запуск программы с ожиданием: { code, out }
function exec(cmd, args, { timeout = 60000, env } = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    const c = spawn(cmd, args, { windowsHide: true, env: env ? { ...process.env, ...env } : process.env });
    const t = setTimeout(() => { try { c.kill(); } catch (_) { /* */ } }, timeout);
    c.stdout.on('data', (d) => chunks.push(d));
    c.stderr.on('data', (d) => chunks.push(d));
    c.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: 'Ошибка: ' + e.message }); });
    c.on('exit', (code) => { clearTimeout(t); resolve({ code, out: decode(Buffer.concat(chunks)) }); });
  });
}
const runOut = async (cmd, args, timeout) => (await exec(cmd, args, { timeout })).out;

// Строка команды через cmd (нужны кавычки в параметрах реестра): { code, out }
function shell(line, timeout) {
  return new Promise((resolve) => {
    const chunks = [];
    const c = spawn('cmd.exe', ['/d', '/s', '/c', '"' + line + '"'], { windowsVerbatimArguments: true, windowsHide: true });
    const t = setTimeout(() => { try { c.kill(); } catch (_) { /* */ } }, timeout || 60000);
    c.stdout.on('data', (d) => chunks.push(d));
    c.stderr.on('data', (d) => chunks.push(d));
    c.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: e.message }); });
    c.on('exit', (code) => { clearTimeout(t); resolve({ code, out: decode(Buffer.concat(chunks)) }); });
  });
}

const slmgr = () => path.join(process.env.windir || 'C:\\Windows', 'System32', 'slmgr.vbs');
const WINLOGON = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon';

const autologonOnScript = (key) => `$ErrorActionPreference='Stop'; $k='${key}'; `
  + "Set-ItemProperty $k AutoAdminLogon '1' -Type String; Set-ItemProperty $k DefaultDomainName $env:STK_D -Type String; "
  + 'Set-ItemProperty $k DefaultUserName $env:STK_U -Type String; Set-ItemProperty $k DefaultPassword $env:STK_P -Type String';
const autologonOffScript = (key) => `$ErrorActionPreference='Stop'; $k='${key}'; Set-ItemProperty $k AutoAdminLogon '0' -Type String; `
  + 'Remove-ItemProperty $k DefaultPassword -ErrorAction SilentlyContinue';

// Точка восстановления перед изменениями системы (один раз за сеанс)
let restoreDone = false;
async function restorePoint() {
  if (restoreDone) return;
  restoreDone = true;
  await exec('powershell', ['-NoProfile', '-Command',
    "Checkpoint-Computer -Description 'SysAdmin Toolkit' -RestorePointType MODIFY_SETTINGS"], { timeout: 120000 });
}

function localIp() {
  return new Promise((resolve) => {
    const s = dgram.createSocket('udp4');
    const fail = () => { try { s.close(); } catch (_) { /* */ } resolve('127.0.0.1'); };
    s.on('error', fail);
    s.connect(80, '8.8.8.8', () => {
      try { const a = s.address().address; s.close(); resolve(a); } catch (_) { fail(); }
    });
  });
}

async function ping(host, ms) {
  const r = await exec('ping', ['-n', '1', '-w', String(ms), host], { timeout: 10000 });
  return /TTL=/i.test(r.out);
}

function arpTable() {
  return exec('arp', ['-a']).then((r) => {
    const t = {};
    const re = /(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2})/gi;
    let m;
    while ((m = re.exec(r.out))) t[m[1]] = m[2].toUpperCase().replace(/:/g, '-');
    return t;
  });
}

async function hostName(ip) {
  try {
    return await Promise.race([
      dns.promises.lookupService(ip, 0).then((r) => r.hostname),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
    ]);
  } catch (_) { return ''; }
}

async function netScan() {
  const ip = await localIp();
  const base = ip.split('.').slice(0, 3).join('.');
  const hosts = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`);
  const alive = [];
  const queue = hosts.slice();
  await Promise.all(Array.from({ length: 64 }, async () => {
    while (queue.length) { const h = queue.shift(); if (await ping(h, 500)) alive.push(h); }
  }));
  alive.sort((a, b) => Number(a.split('.')[3]) - Number(b.split('.')[3]));
  const arp = await arpTable();
  const lines = [`Сканирую ${base}.0/24 (мой IP ${ip})…`, ''];
  const names = await Promise.all(alive.map(hostName));
  alive.forEach((h, i) => lines.push(`${h.padEnd(16)} ${(arp[h] || '').padEnd(19)} ${names[i]}`));
  lines.push('', `Найдено устройств: ${alive.length}`);
  return { text: lines.join('\n') };
}

// Очистка TEMP: пользовательский и системный, кроме рабочей папки самой программы
function clearTemp() {
  let n = 0;
  const skip = path.resolve(P.workDir).toLowerCase();
  for (const base of new Set([process.env.TEMP, path.join(process.env.windir || 'C:\\Windows', 'Temp')])) {
    if (!base || !fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const p = path.join(base, name);
      const low = path.resolve(p).toLowerCase();
      if (skip === low || skip.startsWith(low + path.sep)) continue;      // не трогаем свою рабочую папку и её родителей
      try { fs.rmSync(p, { recursive: true, force: true }); if (!fs.existsSync(p)) n++; } catch (_) { /* занято — пропускаем */ }
    }
  }
  return { text: `TEMP очищен: удалено ${n} элементов`, change: `Очищена папка TEMP (${n} элементов)` };
}

async function regTweak(line, msg, hint) {
  await restorePoint();
  const r = await shell(line);
  if (r.code !== 0) return { error: 'Ошибка: ' + r.out.trim() };
  return { text: msg + (hint ? '\n' + hint : ''), change: msg };
}

async function photo(on) {
  const src = path.join(__dirname, '..', 'data', 'assets', (on ? 'ON' : 'OFF') + '_Windows_10_Photo_Viewer.reg');
  if (!fs.existsSync(src)) return { error: 'Нет файла: ' + src };
  const dst = path.join(P.workDir, path.basename(src));          // reg.exe не читает файлы из архива приложения
  fs.copyFileSync(src, dst);
  await restorePoint();
  const r = await exec('reg', ['import', dst]);
  const msg = 'Windows Photo Viewer: ' + (on ? 'включён' : 'выключен');
  if (r.code !== 0) return { error: `${msg} — ошибка: ${r.out.trim()}` };
  return { text: msg, change: msg };
}

const HANDLERS = {
  // ----- общие
  open: (a) => { launch.startLine(`start "" ${String(a.target).replace(/[&|<>^"]/g, '')}`); return { text: 'Открыто: ' + a.target }; },
  console: (a) => { launch.consoleCmd(a.cmd, true); return { text: 'Запущено в окне консоли: ' + a.cmd }; },

  // ----- windows: лицензия и версия
  win_status: async () => ({ text: await runOut('cscript', ['//nologo', slmgr(), '/dli']) }),
  win_xpr: async () => ({ text: await runOut('cscript', ['//nologo', slmgr(), '/xpr']) }),
  win_oem: async () => {
    const out = await runOut('powershell', ['-NoProfile', '-Command',
      "(Get-WmiObject -query 'select * from SoftwareLicensingService').OA3xOriginalProductKey"]);
    return { text: 'OEM-ключ из BIOS:\n' + (out.trim() || 'не найден') };
  },
  win_key: async ({ key }) => {
    const k = String(key || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{5}(-[A-Z0-9]{5}){4}$/.test(k)) return { error: 'Неверный формат ключа. Нужно XXXXX-XXXXX-XXXXX-XXXXX-XXXXX' };
    const a = await exec('cscript', ['//nologo', slmgr(), '/ipk', k]);
    const b = await exec('cscript', ['//nologo', slmgr(), '/ato'], { timeout: 300000 });
    return { text: (a.out.trim() + '\n' + b.out.trim()).trim(), change: 'Введён ключ продукта Windows и запущена активация' };
  },
  win_phone: () => { launch.startLine('start "" slui 4'); return { text: 'Открыт мастер активации по телефону' }; },

  // ----- windows: обслуживание
  reset_net: async () => {
    await restorePoint();
    launch.consoleCmd('netsh winsock reset & netsh int ip reset & ipconfig /flushdns', true);
    return { text: 'Сброс сети запущен в окне консоли. Потребуется перезагрузка.', change: 'Сброс сети (winsock, ip, dns)' };
  },
  reset_wu: () => {
    launch.consoleCmd('net stop wuauserv & net stop bits & ren %windir%\\SoftwareDistribution SoftwareDistribution.old & net start bits & net start wuauserv', true);
    return { text: 'Сброс Центра обновлений запущен в окне консоли.', change: 'Сброс Центра обновлений (SoftwareDistribution переименована)' };
  },
  clear_spool: () => {
    launch.consoleCmd('net stop spooler & del /q /f %systemroot%\\System32\\spool\\PRINTERS\\* & net start spooler', true);
    return { text: 'Очередь печати очищается (окно консоли).', change: 'Очищена очередь печати' };
  },
  clear_temp: () => clearTemp(),

  // ----- плюшки
  photo_on: () => photo(true),
  photo_off: () => photo(false),
  ext_on: () => regTweak('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" /v HideFileExt /t REG_DWORD /d 0 /f',
    'Включён показ расширений файлов', 'Откройте проводник заново, чтобы увидеть изменение.'),
  ctx_old: () => regTweak('reg add "HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32" /ve /d "" /f',
    'Включено классическое контекстное меню (Win 11)', 'Перезапустите проводник или перезайдите в систему.'),
  ctx_new: () => regTweak('reg delete "HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}" /f',
    'Возвращено новое контекстное меню (Win 11)', 'Перезапустите проводник или перезайдите в систему.'),
  power_max: () => regTweak('powercfg /setactive SCHEME_MIN', 'Схема питания: высокая производительность'),
  fastboot_off: () => regTweak('reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power" /v HiberbootEnabled /t REG_DWORD /d 0 /f',
    'Отключён быстрый запуск Windows'),

  autologon_on: async ({ domain, user, password }) => {
    if (!user) return { error: 'Укажите пользователя' };
    await restorePoint();
    // значения передаются через переменные окружения, а не через командную строку (пароль не виден в списке процессов)
    const r = await exec('powershell', ['-NoProfile', '-Command', autologonOnScript(WINLOGON)],
      { env: { STK_D: domain || '', STK_U: user, STK_P: password || '' } });
    if (r.code !== 0) return { error: 'Ошибка автовхода: ' + r.out.trim().split('\n')[0] };
    return { text: 'Автовход настроен. Применится после перезагрузки.', change: `Включён автовход для ${domain}\\${user} (пароль в реестре)` };
  },
  autologon_off: async () => {
    const r = await exec('powershell', ['-NoProfile', '-Command', autologonOffScript(WINLOGON)]);
    if (r.code !== 0) return { error: 'Ошибка: ' + r.out.trim().split('\n')[0] };
    return { text: 'Автовход отключён', change: 'Автовход отключён, пароль удалён из реестра' };
  },

  // ----- сеть
  ipconfig: async () => ({ text: await runOut('ipconfig', ['/all']) }),
  flushdns: async () => ({ text: await runOut('ipconfig', ['/flushdns']) }),
  net_check: async () => {
    const ip = await localIp();
    const gw = ip.split('.').slice(0, 3).concat('1').join('.');
    const lines = [];
    for (const [name, host] of [['Шлюз (предп.)', gw], ['DNS Яндекс', '77.88.8.8'], ['DNS Google', '8.8.8.8'], ['ya.ru', 'ya.ru']]) {
      lines.push(`${name.padEnd(16)} ${host.padEnd(16)} ${(await ping(host, 800)) ? 'OK' : 'нет ответа'}`);
    }
    return { text: lines.join('\n') };
  },
  net_scan: () => netScan(),
  battery: async () => {
    fs.mkdirSync(P.reportsDir, { recursive: true });
    const out = path.join(P.reportsDir, 'battery_' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '.html');
    const txt = await runOut('powercfg', ['/batteryreport', '/output', out], 60000);
    if (fs.existsSync(out)) { launch.startLine(`start "" "${out}"`); return { text: 'Отчёт о батарее: ' + out }; }
    return { text: 'Отчёт о батарее не создан (нет батареи или нет прав): ' + txt.trim().slice(0, 150) };
  },
};

async function run(id, args) {
  const h = HANDLERS[id];
  if (!h) return { error: 'Неизвестное действие: ' + id };
  return h(args || {});
}

module.exports = { run, runOut, exec, shell, restorePoint, clearTemp, localIp, autologonOnScript, autologonOffScript };
