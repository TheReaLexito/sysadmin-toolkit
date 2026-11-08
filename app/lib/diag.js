'use strict';
// Диагностика ПК: сбор данных PowerShell-скриптом, разбор, плитки для интерфейса, HTML-отчёт.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');

const OK = 'OK', WARN = 'WARN', BAD = 'BAD', INFO = 'INFO';
const MULTI = new Set(['CPU', 'RAM_MOD', 'DISK', 'VOL', 'SMART_FAIL', 'TEMP', 'GPU', 'BATT', 'ERR', 'DEVERR', 'BSOD', 'APP']);
const RANK = { INFO: 0, OK: 1, WARN: 2, BAD: 3 };

const f = (s, d = 0) => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : d; };
const worst = (...l) => l.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), OK);
const n0 = (v) => v.toFixed(0);
const n1 = (v) => v.toFixed(1);

function collect() {
  return new Promise((resolve, reject) => {
    const ps = path.join(P.workDir, 'diag.ps1');
    fs.copyFileSync(path.join(__dirname, '..', 'data', 'diag.ps1'), ps);        // с BOM — для PowerShell 5.1
    const c = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps], { windowsHide: true });
    const chunks = [];
    const timer = setTimeout(() => { try { c.kill(); } catch (_) { /* */ } reject(new Error('диагностика не уложилась в 4 минуты')); }, 240000);
    c.stdout.on('data', (d) => chunks.push(d));
    c.on('error', (e) => { clearTimeout(timer); reject(e); });
    c.on('exit', () => { clearTimeout(timer); resolve(Buffer.concat(chunks).toString('utf8').split(/\r?\n/)); });
  });
}

function analyze(lines) {
  const d = {};
  const multi = {};
  for (const ln of lines) {
    const i = ln.indexOf('|');
    if (i < 0) continue;
    const k = ln.slice(0, i).trim();
    const rest = ln.slice(i + 1).trim();
    if (MULTI.has(k)) (multi[k] = multi[k] || []).push(rest); else d[k] = rest;
  }
  const rows = [];
  const add = (lvl, name, val) => rows.push({ lvl, name, val });
  const T = {};                                  // данные для плиток

  add(INFO, 'Компьютер', d.PC || '—');
  add(INFO, 'Серийный номер', d.SERIAL || '—');
  add(INFO, 'Система', d.OS || '—');
  const up = f(d.UPTIME_H);
  const upLvl = up > 720 ? WARN : OK;
  add(upLvl, 'Без перезагрузки', `${n0(up)} ч (${n1(up / 24)} сут.)`);

  let cpuLvl = OK;
  for (const c of multi.CPU || []) {
    const parts = c.split('|');
    const load = parts.length > 1 ? f(parts[1]) : 0;
    const lvl = load >= 90 ? WARN : OK;
    cpuLvl = worst(cpuLvl, lvl);
    add(lvl, 'Процессор', `${parts[0]}, загрузка ${n0(load)}%`);
    T.cpu = { name: parts[0], load, cores: (/\((\d+)\s*ядер\)/.exec(parts[0]) || [])[1] };
  }

  const total = f(d.RAM_TOTAL_MB), free = f(d.RAM_FREE_MB);
  let ramLvl = OK;
  if (total) {
    const pct = (free / total) * 100;
    ramLvl = pct < 5 ? BAD : (pct < 10 || total < 4000) ? WARN : OK;
    add(ramLvl, 'Оперативная память', `${n1(total / 1024)} ГБ, свободно ${n1(free / 1024)} ГБ (${n0(pct)}%)`);
    T.ram = { totalGb: total / 1024, freeGb: free / 1024, freePct: pct };
  }
  const mods = [];
  for (const m of multi.RAM_MOD || []) {
    add(INFO, 'Модуль ОЗУ', m);
    const mm = /(\d+)\s*ГБ,\s*(\d+)\s*МГц/.exec(m);
    if (mm) mods.push({ gb: +mm[1], mhz: +mm[2] });
  }
  if (T.ram) T.ram.mods = mods;

  const smartBad = (multi.SMART_FAIL || []).some((s) => s.trim().toLowerCase() === 'true');
  const disks = [];
  let diskLvl = OK;
  for (const dk of multi.DISK || []) {
    const p = dk.split('|');
    if (p.length >= 3) {
      const st = p[2].trim();
      const lvl = st.toLowerCase() === 'ok' ? OK : BAD;
      diskLvl = worst(diskLvl, lvl);
      add(lvl, 'Диск', `${p[0]}, ${p[1]} ГБ, статус: ${st}`);
      disks.push({ model: p[0], gb: f(p[1]), status: st, lvl });
    }
  }
  add(smartBad ? BAD : OK, 'SMART (прогноз отказа)', smartBad ? 'диск сообщает о скором отказе' : 'тревог нет / нет данных');
  if (smartBad) diskLvl = BAD;
  const vols = [];
  for (const v of multi.VOL || []) {
    const p = v.split('|');
    if (p.length >= 3) {
      const size = f(p[1]), fr = f(p[2]);
      const pct = size ? (fr / size) * 100 : 0;
      const lvl = pct < 5 ? BAD : pct < 10 ? WARN : OK;
      diskLvl = worst(diskLvl, lvl);
      add(lvl, 'Раздел ' + p[0], `${n1(fr)} из ${n1(size)} ГБ свободно (${n0(pct)}%)`);
      vols.push({ name: p[0], sizeGb: size, freeGb: fr, freePct: pct, lvl });
    }
  }
  T.disk = { disks, vols, smartBad };

  const temps = (multi.TEMP || []).map((t) => f(t));
  let tempLvl = INFO;
  if (temps.length) {
    const mx = Math.max(...temps);
    tempLvl = mx >= 85 ? BAD : mx >= 75 ? WARN : OK;
    add(tempLvl, 'Температура', `${n0(mx)} °C`);
    if (T.cpu) T.cpu.temp = mx;
  } else {
    add(INFO, 'Температура', 'WMI не отдаёт датчики — откройте HWiNFO (вкладка «Утилиты»)');
  }
  T.gpu = { names: multi.GPU || [] };
  for (const g of T.gpu.names) add(INFO, 'Видеокарта', g);
  for (const b of multi.BATT || []) add(INFO, 'Батарея', `${b}%`);
  T.batt = { charge: (multi.BATT || [])[0] };

  let battLvl = INFO;
  if (d.BATTWEAR) {
    const [full, design] = d.BATTWEAR.split('|').slice(0, 2).map((x) => f(x));
    if (design) {
      const pct = Math.max(0, 100 - (full / design) * 100);
      battLvl = pct >= 40 ? BAD : pct >= 25 ? WARN : OK;
      add(battLvl, 'Износ батареи', `${n0(pct)}% (ёмкость ${n0(full)} из ${n0(design)} мВт·ч)`);
      T.batt.wear = pct;
    }
  }

  const devs = multi.DEVERR || [];
  const drvLvl = devs.length ? WARN : OK;
  add(drvLvl, 'Устройства без драйверов / с ошибками', devs.length ? `${devs.length} шт.` : 'все устройства работают');
  T.drv = { list: [] };
  for (const dv of devs.slice(0, 8)) {
    const i = dv.indexOf('|');
    const nm = i < 0 ? dv : dv.slice(0, i);
    const code = i < 0 ? '' : dv.slice(i + 1).trim();
    add(INFO, '  ' + (nm || 'неизвестное устройство'), `код ${code}${code === '28' ? ' — драйвер не установлен' : ''}`);
    T.drv.list.push({ name: nm || 'неизвестное устройство', code });
  }
  T.drv.count = devs.length;

  const bs = Math.trunc(f(d.BSOD30));
  const bsl = multi.BSOD || [];
  const bsLvl = bs >= 3 ? BAD : (bs || bsl.length) ? WARN : OK;
  add(bsLvl, 'Синие экраны за 30 дней',
    bs ? `${bs} (дампы в Windows\\Minidump — откройте BlueScreenView)` : (bsl.length ? 'были ранее' : 'не было'));
  for (const b of bsl) add(INFO, '  синий экран', b);
  T.bsod = { count: bs, list: bsl };

  let licLvl = INFO, licText = '';
  if (d.LIC) {
    const i = d.LIC.indexOf('|');
    const st = (i < 0 ? d.LIC : d.LIC.slice(0, i)).trim();
    const nm = i < 0 ? '' : d.LIC.slice(i + 1);
    const states = { 0: 'не лицензирована', 1: 'активирована', 2: 'пробный период (OOB)', 3: 'пробный период (OOT)',
      4: 'не подлинная', 5: 'уведомления', 6: 'продлённый пробный' };
    licLvl = st === '1' ? OK : WARN;
    licText = states[st] || st;
    add(licLvl, 'Лицензия Windows', `${licText} (${nm})`);
  }
  if (d.APPS) add(INFO, 'Установлено программ', `${d.APPS} (список — в сохранённом отчёте)`);

  const errs = Math.trunc(f(d.ERR7D));
  const errLvl = errs >= 20 ? WARN : OK;
  add(errLvl, 'Ошибки системы за 7 дней', String(errs));
  for (const e of multi.ERR || []) add(INFO, '  последняя ошибка', e);
  T.err = { count: errs, list: multi.ERR || [] };

  // ---- плитки
  const osShort = (d.OS || '—').replace(/^Майкрософт\s+/, '').replace(/\s*64-разрядная.*/, '');
  const build = (/сборка\s+(\d+)/.exec(d.OS || '') || [])[1];
  const tiles = [];
  tiles.push({ key: 'sys', title: 'Система', icon: 'windows', color: '#5250b8', lvl: worst(upLvl, licLvl === INFO ? OK : licLvl),
    big: osShort, sub: [d.PC || '', `Без перезагрузки: ${n0(up)} ч`, licText ? 'Лицензия: ' + licText : 'Лицензия: нет данных', build ? 'Сборка ' + build : ''].filter(Boolean) });
  if (T.cpu) {
    const short = T.cpu.name.replace(/\(R\)|\(TM\)/g, '').replace(/\s*\(\d+\s*ядер\)/, '').replace(/\s+\d+-Core Processor/, '').replace(/\s+CPU\s*@.*/, '').trim();
    tiles.push({ key: 'cpu', title: 'Процессор', icon: 'cpu', color: '#7a5c45', lvl: worst(cpuLvl, tempLvl === INFO ? OK : tempLvl), big: short,
      meter: { pct: T.cpu.load, label: `загрузка ${n0(T.cpu.load)}%` },
      sub: [T.cpu.cores ? `${T.cpu.cores} ядер` : '', T.cpu.temp ? `Температура ${n0(T.cpu.temp)} °C` : 'Температура: нет данных'].filter(Boolean) });
  }
  if (T.ram) {
    const used = 100 - T.ram.freePct;
    const modLine = mods.length ? `${mods.length} × ${mods[0].gb} ГБ · ${mods[0].mhz} МГц` : '';
    tiles.push({ key: 'ram', title: 'Память', icon: 'memory', color: '#8b4a47', lvl: ramLvl, big: `${n1(T.ram.totalGb)} ГБ`,
      meter: { pct: used, label: `занято ${n0(used)}%` }, sub: [`Свободно ${n1(T.ram.freeGb)} ГБ`, modLine].filter(Boolean) });
  }
  tiles.push({ key: 'disk', title: 'Диски', icon: 'disk', color: '#d9cbbd', dark: true, lvl: diskLvl,
    big: `${disks.length || 0} ${plural(disks.length, 'диск', 'диска', 'дисков')}`, vols,
    sub: [smartBad ? 'SMART: диск скоро откажет!' : 'SMART: тревог нет'] });
  if (T.gpu.names.length) {
    tiles.push({ key: 'gpu', title: 'Видео', icon: 'monitor', color: '#2f6f6a', lvl: OK, big: T.gpu.names[0].replace(/^NVIDIA\s+/, ''), sub: T.gpu.names.slice(1) });
  }
  tiles.push({ key: 'drv', title: 'Драйверы', icon: 'chip', color: '#4b5fa3', lvl: drvLvl,
    big: devs.length ? `${devs.length} без драйвера` : 'Всё на месте', sub: T.drv.list.slice(0, 3).map((x) => x.name) });
  tiles.push({ key: 'bsod', title: 'Синие экраны', icon: 'alert', color: '#6b4a8a', lvl: bsLvl,
    big: bs ? `${bs} за 30 дней` : 'Не было', sub: bsl.slice(0, 3) });
  tiles.push({ key: 'err', title: 'Ошибки системы', icon: 'activity', color: '#8a5a2d', lvl: errLvl, big: `${errs} за 7 дней`,
    sub: (multi.ERR || []).slice(0, 3) });
  tiles.push({ key: 'batt', title: 'Батарея', icon: 'battery', color: '#2f7a4f', lvl: battLvl === INFO ? OK : battLvl,
    big: T.batt.charge ? `${T.batt.charge}%` : 'Нет батареи', sub: T.batt.wear != null ? [`Износ ${n0(T.batt.wear)}%`] : [T.batt.charge ? 'Износ: нет данных' : 'Стационарный ПК'] });

  const verdict = rows.some((r) => r.lvl === BAD) ? { text: 'ПРОБЛЕМА', lvl: BAD }
    : rows.some((r) => r.lvl === WARN) ? { text: 'ВНИМАНИЕ', lvl: WARN } : { text: 'НОРМА', lvl: OK };

  const apps = (multi.APP || []).map((a) => { const i = a.indexOf('|'); return { name: i < 0 ? a : a.slice(0, i), ver: i < 0 ? '' : a.slice(i + 1) }; });
  return { rows, verdict, tiles, apps, at: new Date().toISOString() };
}

function plural(n, a, b, c) {
  const m = n % 100, k = n % 10;
  if (m >= 11 && m <= 14) return c;
  return k === 1 ? a : k >= 2 && k <= 4 ? b : c;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function reportHtml(res, meta) {
  const col = { OK: '#23a55a', WARN: '#f0b232', BAD: '#f23f43', INFO: '#9d98c9' };
  const tr = res.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.val)}</td><td style="color:${col[r.lvl]}">&#9679;</td></tr>`).join('');
  const apps = res.apps.length
    ? `<h3>Установленные программы (${res.apps.length})</h3><table cellpadding="4">${res.apps.map((a) => `<tr><td>${esc(a.name)}</td><td style="color:#9d98c9">${esc(a.ver)}</td></tr>`).join('')}</table>` : '';
  return '<!doctype html><meta charset="utf-8"><title>Отчёт</title>'
    + '<body style="background:#0e0d1b;color:#ece9ff;font-family:Segoe UI,Arial;padding:24px">'
    + '<div style="height:6px;background:linear-gradient(90deg,#8b5cf6,#ff73fa);border-radius:3px"></div>'
    + `<h2>Отчёт по ПК — <span style="color:${col[res.verdict.lvl]}">${res.verdict.text}</span></h2>`
    + `<p>${new Date(res.at).toLocaleString('ru-RU')}</p>`
    + `<table cellpadding="6" style="border-collapse:collapse">${tr}</table>${apps}`
    + `<p style="color:#9d98c9">${esc(meta.app)} ${esc(meta.version)} — by ${esc(meta.author)}</p></body>`;
}

async function run() { return analyze(await collect()); }

module.exports = { run, collect, analyze, reportHtml };
