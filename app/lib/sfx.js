'use strict';
// Разбор SFX-пакетов Стрельца (7z SFX): откуда запускать, что запускать, рассчитан ли пакет на WinPE.
const fs = require('fs');
const P = require('./paths');

const PE_MARKS = ['x:\\', 'pecmd', 'hidcon', 'nircmd', 'b:\\'];
// импорт .reg (у Стрельца так прописываются ключи лицензий и пути X:\) — такой пакет не запускаем как есть
const REG_IMPORT = /^(?:\w+:)*\s*"?(?:regedit(?:\.exe)?|reg(?:\.exe)?\s+(?:import|add))\b/i;
// пакеты без нормальной команды запуска, но с программой внутри
const RUN_OVERRIDE = { stduviewer: 'STDUViewerApp.exe', occt_x86: 'OCCT.exe', 'occt4.5.1': 'OCCT.exe' };

const HEAD = Buffer.alloc(8 * 1024 * 1024);
const SIG_7Z = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
const END_MARK = ';!@InstallEnd@!';

function sfxInfo(file) {
  let n;
  try {
    const fd = fs.openSync(file, 'r');
    n = fs.readSync(fd, HEAD, 0, HEAD.length, 0);
    fs.closeSync(fd);
  } catch (_) { return null; }
  const buf = HEAD.subarray(0, n);
  const i = buf.indexOf(';!@Install@!UTF-8!');
  if (i < 0) return null;
  const j = buf.indexOf(END_MARK, i);
  if (j < 0) return null;
  let inst = '';
  const runs = [];
  for (const line of buf.subarray(i, j).toString('utf8').split(/\r?\n/)) {
    const m = /^\s*(\w+)\s*=\s*"(.*)"\s*$/.exec(line);
    if (!m) continue;
    const val = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    if (m[1] === 'InstallPath') inst = val;
    else if (m[1] === 'RunProgram') runs.push(val);
  }
  const k = buf.indexOf(SIG_7Z, j);
  return { inst, runs, offset: k >= 0 ? k : j + END_MARK.length };
}

function peBound(info) {
  if (!info) return false;
  const blob = (info.inst + ' ' + info.runs.join(' ')).toLowerCase();
  return PE_MARKS.some((m) => blob.includes(m));
}

function regImport(info) {
  return !!info && info.runs.some((r) => REG_IMPORT.test(r.trim()));
}

function pickProgram(runs) {
  const want = P.is64() ? 'x64' : 'x86';
  for (const r of runs) {
    const low = r.toLowerCase();
    if (['pecmd', 'hidcon', 'nircmd', 'killprocess'].some((m) => low.includes(m))) continue;
    if (REG_IMPORT.test(r.trim())) continue;
    // «nowait:explorer.exe ярлык.lnk» — пакет только кладёт ярлык на рабочий стол, самой программы тут нет
    if (/^(?:\w+:)*\s*"?explorer(?:\.exe)?\b/i.test(r.trim())) continue;
    let r2 = r;
    let arch = null;
    for (;;) {
      const m = /^(x86|x64|nowait|hidcon|fm\d*|forcenowait):(.*)$/i.exec(r2);
      if (!m) break;
      if (['x86', 'x64'].includes(m[1].toLowerCase())) arch = m[1].toLowerCase();
      r2 = m[2];
    }
    if (arch && arch !== want) continue;
    return r2.trim();
  }
  return null;
}

function overrideFor(fileName) {
  const low = fileName.toLowerCase();
  for (const [key, exe] of Object.entries(RUN_OVERRIDE)) if (low.startsWith(key)) return exe;
  return null;
}

// Как программа поступит с файлом (для проверок и значков в интерфейсе)
function classify(file) {
  const ext = require('path').extname(file).toLowerCase();
  if (ext === '.bat' || ext === '.cmd') return 'script';
  if (ext !== '.exe') return ext || 'file';
  const info = sfxInfo(file);
  if (!info) return 'plain-exe';
  if (!peBound(info) && !regImport(info)) return 'sfx-self';
  const prog = pickProgram(info.runs) || overrideFor(require('path').basename(file));
  return prog ? 'sfx-extract-run' : 'WINPE-ONLY';
}

module.exports = { sfxInfo, peBound, regImport, pickProgram, overrideFor, classify, RUN_OVERRIDE };
