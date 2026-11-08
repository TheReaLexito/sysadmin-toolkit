'use strict';
// Запуск программ: скрипты, SFX-пакеты Стрельца (распаковка → запуск нужной программы), портативные exe.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');
const sfx = require('./sfx');
const net = require('./netutil');

// ---------- запуск процессов через оболочку Windows (UAC и ассоциации работают как в проводнике)
function startLine(line) {
  const c = spawn('cmd.exe', ['/d', '/s', '/c', '"' + line + '"'],
    { windowsVerbatimArguments: true, detached: true, stdio: 'ignore', windowsHide: true });
  c.on('error', () => { /* нечего делать: сообщение уйдёт в журнал через проверку существования */ });
  c.unref();
}

function shellStart(target, args, cwd) {
  startLine(`start "" /D "${cwd || path.dirname(target)}" "${target}"${args ? ' ' + args : ''}`);
}

function newConsole(script, args, cwd) {
  startLine(`start "SysAdmin Toolkit" /D "${cwd || path.dirname(script)}" cmd.exe /c call "${script}"${args ? ' ' + args : ''}`);
}

// Команда целиком — в кавычках, иначе «a & b & c» разваливается: часть выполнится в скрытом внешнем cmd
function consoleCmd(command, keepOpen) {
  startLine(`start "SysAdmin Toolkit" cmd.exe ${keepOpen ? '/k' : '/c'} "${command}"`);
}

// ---------- 7-Zip для распаковки SFX
async function find7z(log) {
  const cand = [];
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
    if (base) cand.push(path.join(base, '7-Zip', '7z.exe'));
  }
  cand.push(path.join(P.binDir || '', '7zr.exe'), path.join(P.workDir, '7zr.exe'));
  for (const c of cand) if (c && fs.existsSync(c)) return c;
  const dst = path.join(P.workDir, '7zr.exe');
  try {
    log('Скачиваю 7zr.exe (нужен для распаковки пакетов)…');
    await net.download('https://www.7-zip.org/a/7zr.exe', dst);
    return dst;
  } catch (e) {
    log('Не удалось скачать 7zr.exe: ' + e.message);
    return null;
  }
}

function runProc(cmd, args) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { windowsHide: true, stdio: 'ignore' });
    c.on('exit', (code) => resolve(code));
    c.on('error', () => resolve(-1));
  });
}

async function unpack(file, info, out, log) {
  const done = path.join(out, '_unpacked.ok');
  if (fs.existsSync(done)) return;
  fs.mkdirSync(out, { recursive: true });
  log('Распаковываю: ' + path.basename(file));
  const arc = path.join(out, '_pkg.7z');
  await new Promise((res, rej) => {
    const rs = fs.createReadStream(file, { start: info.offset });
    const ws = fs.createWriteStream(arc);
    rs.pipe(ws);
    ws.on('finish', res);
    rs.on('error', rej);
    ws.on('error', rej);
  });
  const z = await find7z(log);
  if (!z) throw new Error('нет 7-Zip для распаковки пакета');
  const code = await runProc(z, ['x', '-y', '-o' + out, arc]);
  try { fs.unlinkSync(arc); } catch (_) { /* */ }
  if (code !== 0 && code !== 1) throw new Error('распаковка не удалась (код ' + code + ')');
  fs.writeFileSync(done, '');
}

function findFile(dir, nameLower) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return null; }
  for (const e of ents) if (!e.isDirectory() && e.name.toLowerCase() === nameLower) return path.join(dir, e.name);
  for (const e of ents) {
    if (e.isDirectory()) { const r = findFile(path.join(dir, e.name), nameLower); if (r) return r; }
  }
  return null;
}

async function runExtracted(file, info, log, dryRun) {
  let prog = sfx.pickProgram(info.runs) || sfx.overrideFor(path.basename(file));
  if (!prog) {
    if (info.runs.some((r) => /hidcon/i.test(r) && /\.(bat|cmd)\b/i.test(r))) {
      throw new Error('пакет работает только при загрузке с флешки Стрельца (WinPE), в обычной Windows не запускается');
    }
    throw new Error('в пакете нет программы для запуска');
  }
  const out = path.join(P.workDir, 'x', path.basename(file).replace(/\.[^.]+$/, ''));
  await unpack(file, info, out, log);
  let exe; let args = '';
  if (prog.startsWith('"')) {
    const q = prog.indexOf('"', 1);
    exe = prog.slice(1, q);
    args = prog.slice(q + 1);
  } else {
    const sp = prog.indexOf(' ');
    exe = sp < 0 ? prog : prog.slice(0, sp);
    args = sp < 0 ? '' : prog.slice(sp + 1);
  }
  const parts = exe.replace(/\//g, '\\').replace(/^[a-zA-Z]:/, '').split('\\').filter(Boolean);
  const base = (parts[parts.length - 1] || '').toLowerCase();
  let target = null;
  for (let i = 0; i < parts.length - 1 && !target; i++) {            // точный путь (x64\gdbpro.exe ≠ x32\gdbpro.exe)
    const cand = path.join(out, ...parts.slice(i));
    if (fs.existsSync(cand)) target = cand;
  }
  if (!target) target = findFile(out, base);
  if (!target) throw new Error('после распаковки не найден ' + base);
  if (dryRun) return target;                       // проверка без запуска (массовый тест пакетов)
  const low = target.toLowerCase();
  if (low.endsWith('.msi')) startLine(`start "" msiexec /i "${target}"`);
  else if (low.endsWith('.cmd') || low.endsWith('.bat')) newConsole(target, args.trim(), path.dirname(target));
  else shellStart(target, args.trim(), path.dirname(target));
}

// ---------- антивирусы: скачиваются свежие версии с сайтов производителей
const AV = [
  ['drweb', 'Dr.Web CureIt!', 'https://download.geo.drweb.com/pub/drweb/cureit/cureit.exe', 'cureit.exe', ''],
  ['dr.web', 'Dr.Web CureIt!', 'https://download.geo.drweb.com/pub/drweb/cureit/cureit.exe', 'cureit.exe', ''],
  ['kaspersky', 'Kaspersky Virus Removal Tool', 'https://devbuilds.kaspersky-labs.com/devbuilds/KVRT/latest/full/KVRT.exe', 'KVRT.exe', '-accepteula -noads'],
  ['smartfix', 'SmartFix', 'https://smartfix.pro/SmartFix.exe', 'SmartFix.exe', ''],
];

async function runAv(file, log) {
  const low = path.basename(file).toLowerCase();
  for (const [key, name, url, exe, args] of AV) {
    if (!low.includes(key)) continue;
    const dst = path.join(P.workDir, 'av', exe);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!fs.existsSync(dst)) {
      log('Скачиваю ' + name + '…');
      try { await net.download(url, dst); } catch (e) { throw new Error('не удалось скачать (' + e.message + '). Нужен интернет.'); }
    }
    shellStart(dst, args, path.dirname(dst));
    return true;
  }
  return false;
}

function cacheLocal(file, log) {
  const dir = path.join(P.workDir, 't');
  fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, path.basename(file));
  if (!fs.existsSync(dst)) {
    log('Копирую на ПК: ' + path.basename(file));
    fs.copyFileSync(file, dst);
  }
  return dst;
}

// ---------- главный вход
async function launch(item, opts, log) {
  log = log || (() => {});
  opts = opts || {};
  let p = item.path;
  if (!fs.existsSync(p)) throw new Error('файл не найден: ' + p);
  const ext = path.extname(p).toLowerCase();
  const dir = path.dirname(p);
  if (dir.toLowerCase().split(path.sep).includes('antivirus') && (ext === '.bat' || ext === '.cmd')) {
    if (await runAv(p, log)) return;
  }
  if (ext === '.bat' || ext === '.cmd') { newConsole(p, '', dir); return; }
  if (ext === '.exe') {
    const info = sfx.sfxInfo(p);
    if (sfx.peBound(info) || sfx.regImport(info)) return runExtracted(p, info, log, opts.dryRun);
    if (opts.cache && !item.inplace && !p.toLowerCase().endsWith('_all.exe')) p = cacheLocal(p, log);
  }
  shellStart(p, '', path.dirname(p));
}

module.exports = { launch, shellStart, newConsole, consoleCmd, startLine, runProc, find7z, runExtracted, unpack };
