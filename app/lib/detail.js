'use strict';
// Подробные данные «как в CPU-Z»: сбор (PowerShell) и превращение в вкладки для интерфейса.
// Секции вкладок: { title, kv: [[ключ, значение, уровень?]] } | { title, table: { cols, rows, filter? } } | { title, bars: [...] } | { title, note }
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const P = require('./paths');

const cache = { core: null, drivers: null, events: null };

function runPs(part) {
  return new Promise((resolve, reject) => {
    const script = path.join(P.workDir, 'detail.ps1');
    fs.copyFileSync(path.join(__dirname, '..', 'data', 'detail.ps1'), script);
    const c = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Part', part], { windowsHide: true });
    const chunks = [];
    const timer = setTimeout(() => { try { c.kill(); } catch (_) { /* */ } reject(new Error('сбор данных не уложился в 2 минуты')); }, 120000);
    c.stdout.on('data', (d) => chunks.push(d));
    c.on('error', (e) => { clearTimeout(timer); reject(e); });
    c.on('exit', () => {
      clearTimeout(timer);
      const txt = Buffer.concat(chunks).toString('utf8').replace(/^﻿/, '').trim();
      try { resolve(JSON.parse(txt.split(/\r?\n/).pop())); } catch (e) { reject(new Error('не удалось разобрать данные: ' + txt.slice(0, 120))); }
    });
  });
}

async function part(name, fresh) {
  if (!fresh && cache[name]) return cache[name];
  cache[name] = await runPs(name);
  return cache[name];
}

// ---------- форматирование
const nz = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
function bytes(n) {
  n = Number(n);
  if (!n) return '—';
  if (n >= 2 ** 40) return (n / 2 ** 40).toFixed(2) + ' ТБ';
  if (n >= 2 ** 30) return (n / 2 ** 30).toFixed(n >= 10 * 2 ** 30 ? 0 : 1) + ' ГБ';
  if (n >= 2 ** 20) return Math.round(n / 2 ** 20) + ' МБ';
  return Math.round(n / 1024) + ' КБ';
}
const kb = (n) => bytes(Number(n) * 1024);
function date(iso, time) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(iso);
  if (!m) return String(iso);
  return `${m[3]}.${m[2]}.${m[1]}` + (time && m[4] ? ` ${m[4]}:${m[5]}` : '');
}
function ghz(mhz) { return mhz ? (mhz >= 1000 ? (mhz / 1000).toFixed(2) + ' ГГц' : mhz + ' МГц') : '—'; }
function span(ms) {
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return (d ? d + ' сут. ' : '') + h + ' ч ' + (m % 60) + ' мин';
}
const yn = (v) => (v === true ? 'да' : v === false ? 'нет' : '—');

const ARCH = { 0: 'x86', 5: 'ARM', 9: 'x64', 12: 'ARM64' };
const MEM_TYPE = { 20: 'DDR', 21: 'DDR2', 24: 'DDR3', 26: 'DDR4', 27: 'LPDDR', 28: 'LPDDR2', 29: 'LPDDR3', 30: 'LPDDR4', 34: 'DDR5', 35: 'LPDDR5' };
const FORM = { 8: 'DIMM', 12: 'SO-DIMM', 13: 'Mini-DIMM' };
const CHASSIS = { 3: 'Настольный ПК', 4: 'Low Profile', 6: 'Mini Tower', 7: 'Tower', 8: 'Переносной', 9: 'Ноутбук', 10: 'Ноутбук', 11: 'КПК', 13: 'Моноблок',
  14: 'Ноутбук (sub)', 15: 'Компактный', 17: 'Сервер', 23: 'Серверная стойка', 30: 'Планшет', 31: 'Трансформер', 32: 'Съёмный' };
const BATT_STATUS = { 1: 'Разряжается', 2: 'Работает от сети', 3: 'Заряжена', 4: 'Низкий заряд', 5: 'Критический заряд', 6: 'Заряжается', 7: 'Заряжается', 8: 'Заряжается', 9: 'Заряжается', 11: 'Частично заряжена' };
const CHEM = { 3: 'свинцово-кислотная', 4: 'NiCd', 5: 'NiMH', 6: 'Li-ion', 7: 'цинк-воздух', 8: 'Li-polymer' };
const SMART_NAMES = { 1: 'Read Error Rate', 3: 'Spin-Up Time', 4: 'Start/Stop Count', 5: 'Reallocated Sectors Count', 7: 'Seek Error Rate', 9: 'Power-On Hours',
  10: 'Spin Retry Count', 12: 'Power Cycle Count', 168: 'SATA Phy Error Count', 170: 'Available Reserved Space', 173: 'Wear Leveling Count', 174: 'Unexpected Power Loss',
  175: 'Power Loss Protection Failure', 177: 'Wear Leveling Count', 179: 'Used Reserved Block Count', 181: 'Program Fail Count', 182: 'Erase Fail Count',
  183: 'Runtime Bad Block', 184: 'End-to-End Error', 187: 'Reported Uncorrectable Errors', 188: 'Command Timeout', 189: 'High Fly Writes', 190: 'Airflow Temperature',
  191: 'G-Sense Error Rate', 192: 'Power-Off Retract Count', 193: 'Load/Unload Cycle Count', 194: 'Temperature', 195: 'Hardware ECC Recovered',
  196: 'Reallocation Event Count', 197: 'Current Pending Sector Count', 198: 'Offline Uncorrectable Sector Count', 199: 'UDMA CRC Error Count', 200: 'Write Error Rate',
  201: 'Soft Read Error Rate', 202: 'Data Address Mark Errors', 231: 'SSD Life Left', 232: 'Endurance Remaining', 233: 'Media Wearout Indicator',
  234: 'Average Erase Count', 235: 'Good Block Count', 241: 'Total LBAs Written', 242: 'Total LBAs Read', 245: 'Flash Writes', 246: 'Total Host Sector Write' };
const SMART_RAW_BAD = new Set([5, 10, 184, 187, 196, 197, 198, 199]);

// ---------- вкладки из основных данных
function tabSys(c) {
  const o = c.os || {}; const b = c.board || {};
  const boot = o.boot ? new Date(o.boot) : null;
  const up = boot ? Date.now() - boot.getTime() : 0;
  return { key: 'sys', sections: [
    { title: 'Windows', kv: [
      ['Название', nz(o.caption)], ['Версия', `${nz(o.display)} (сборка ${nz(o.build)}.${nz(o.ubr)})`], ['Редакция', nz(o.edition)], ['Разрядность', nz(o.arch)],
      ['Установлена', date(o.installed, true)], ['Последняя загрузка', date(o.boot, true)],
      ['Без перезагрузки', up ? span(up) : '—', up > 720 * 3600000 ? 'WARN' : null], ['Идентификатор продукта', nz(o.productId)],
      ['Зарегистрирован на', nz(o.user)], ['Часовой пояс', nz(o.tz)] ] },
    { title: 'Компьютер', kv: [
      ['Имя', nz(o.pc)], ['Домен / группа', `${nz(o.domain)}${o.partOfDomain ? ' (домен)' : ''}`], ['Производитель', nz(b.sysVendor)], ['Модель', nz(b.sysModel)],
      ['Тип системы', nz(b.sysType)], ['Тип корпуса', arr(b.chassis).map((x) => CHASSIS[x] || x).join(', ') || '—'], ['UUID', nz(b.uuid)],
      ['Процессоров', nz(o.procCount)], ['Гипервизор', yn(b.hypervisor)] ] },
  ] };
}

function tabCpu(c) {
  const list = arr(c.cpu);
  const sections = list.map((p, i) => {
    const m = /Family (\d+) Model (\d+) Stepping (\d+)/i.exec(p.desc || '');
    const kv = [
      ['Имя', nz(p.name)], ['Производитель', nz(p.vendor)], ['Сокет', nz(p.socket)], ['Архитектура', ARCH[p.arch] || nz(p.arch)],
      ['Семейство / модель / степпинг', m ? `${m[1]} / ${m[2]} / ${m[3]}` : nz(p.desc)], ['Ядер / потоков', `${nz(p.cores)} / ${nz(p.threads)}`],
      ['Номинальная частота', ghz(p.maxMhz)], ['Текущая частота (по данным Windows)', ghz(p.curMhz)], ['Частота шины', ghz(p.busMhz)],
      ['Разрядность адресов', p.addr ? p.addr + ' бит' : '—'], ['Виртуализация (BIOS)', yn(p.virt), p.virt === false ? 'WARN' : null],
      ['SLAT (EPT/NPT)', yn(p.slat)], ['ID процессора', nz(p.id)],
    ];
    return { title: list.length > 1 ? 'Процессор ' + (i + 1) : 'Процессор', kv };
  });
  sections.push({ title: 'Кэш', kv: list.flatMap((p) => [['Кэш L2 (всего)', p.l2kb ? kb(p.l2kb) : '—'], ['Кэш L3', p.l3kb ? kb(p.l3kb) : '—']]).slice(0, 2) });
  return { key: 'cpu', live: 'cpu', sections };
}

function tabBoard(c) {
  const b = c.board || {};
  return { key: 'board', sections: [
    { title: 'Материнская плата', kv: [['Производитель', nz(b.boardVendor)], ['Модель', nz(b.boardModel)], ['Версия', nz(b.boardVersion)], ['Серийный номер', nz(b.boardSerial)]] },
    { title: 'BIOS / прошивка', kv: [
      ['Производитель', nz(b.biosVendor)], ['Версия', nz(b.biosVersion)], ['Дата', date(b.biosDate)], ['SMBIOS', nz(b.smbios)],
      ['Режим загрузки', b.firmware === 2 ? 'UEFI' : b.firmware === 1 ? 'Legacy BIOS' : '—'],
      ['Secure Boot', b.secureBoot === true ? 'включён' : b.secureBoot === false ? 'выключен' : 'нет данных (нужны права администратора или Legacy-режим)'],
      ['TPM', b.tpm ? 'версия ' + String(b.tpm).split(',')[0] : 'нет данных (нужны права администратора или TPM отсутствует)'] ] },
  ] };
}

function tabMem(c) {
  const o = c.os || {}; const mods = arr(c.mem); const a = c.memArray || {};
  const total = Number(o.ramTotalKb) * 1024, free = Number(o.ramFreeKb) * 1024;
  const type = mods.length ? (MEM_TYPE[mods[0].type] || 'тип ' + mods[0].type) : '—';
  const maxB = Number(a.maxKbEx) ? Number(a.maxKbEx) * 1024 : Number(a.maxKb) * 1024;
  const pf = arr(c.pagefile);
  const sections = [
    { title: 'Сводка', kv: [
      ['Объём', bytes(total)], ['Свободно сейчас', `${bytes(free)} (${total ? Math.round((free / total) * 100) : 0}%)`], ['Тип', type],
      ['Слотов занято', `${mods.length} из ${nz(a.slots)}`], ['Максимум платы', maxB ? bytes(maxB) : '—'],
      ['Виртуальная память', `${bytes(Number(o.virtFreeKb) * 1024)} свободно из ${bytes(Number(o.virtTotalKb) * 1024)}`] ] },
    { title: 'Модули (SPD)', table: { cols: ['Слот', 'Объём', 'Тип', 'Частота', 'Произв.', 'Парт-номер', 'Серийный', 'Напр.'],
      rows: mods.map((m) => [nz(m.slot), bytes(m.cap), MEM_TYPE[m.type] || m.type, m.cfgSpeed ? `${m.cfgSpeed} МГц` + (m.speed && m.speed !== m.cfgSpeed ? ` (макс. ${m.speed})` : '') : nz(m.speed),
        nz(m.vendor), nz(m.part), nz(m.serial), m.volt ? (m.volt / 1000).toFixed(2) + ' В' : '—']) } },
  ];
  if (pf.length) sections.push({ title: 'Файл подкачки', table: { cols: ['Файл', 'Размер', 'Используется', 'Пик'], rows: pf.map((x) => [x.name, x.allocMb + ' МБ', x.usedMb + ' МБ', x.peakMb + ' МБ']) } });
  return { key: 'mem', live: 'mem', sections };
}

function tabGpu(c) {
  const g = arr(c.gpu); const mons = arr(c.monitors);
  const sections = g.map((x, i) => ({ title: g.length > 1 ? 'Видеоадаптер ' + (i + 1) : 'Видеоадаптер', kv: [
    ['Имя', nz(x.name)], ['Производитель', nz(x.vendor)], ['Видеопамять', x.vram ? bytes(x.vram) + (x.vramExact ? '' : ' (Windows занижает до 4 ГБ)') : '—'],
    ['Видеопроцессор', nz(x.proc)], ['Драйвер', nz(x.driver)], ['Дата драйвера', date(x.driverDate)],
    ['Режим', x.w ? `${x.w}×${x.h}, ${nz(x.hz)} Гц, ${nz(x.bpp)} бит` : '—'], ['Состояние', nz(x.status)], ['PNP ID', nz(x.pnp)] ] }));
  if (mons.length) {
    sections.push({ title: 'Мониторы', table: { cols: ['Модель', 'Производитель', 'Выпущен', 'Диагональ', 'Серийный'],
      rows: mons.map((m) => [nz(m.name), nz(m.vendor), m.year ? `${m.year} г., нед. ${m.week}` : '—',
        m.wcm && m.hcm ? (Math.sqrt(m.wcm * m.wcm + m.hcm * m.hcm) / 2.54).toFixed(1) + '″' : '—', nz(m.serial)]) } });
  }
  return { key: 'gpu', sections };
}

function tabDisk(c, admin) {
  const disks = arr(c.disks); const vols = arr(c.vols);
  const sections = [];
  for (const d of disks) {
    const hasRel = d.temp != null || d.wear != null || d.hours != null;
    const kv = [
      ['Модель', nz(d.model)], ['Серийный номер', nz(d.serial)], ['Прошивка', nz(d.fw)], ['Шина', nz(d.bus)], ['Тип носителя', nz(d.media)], ['Объём', bytes(d.size)],
      ['Стиль разделов', nz(d.style)], ['Состояние', nz(d.health), d.health && d.health !== 'Healthy' ? 'BAD' : null],
    ];
    if (d.predictFail === true) kv.push(['Прогноз отказа (SMART)', 'ДИСК СООБЩАЕТ О СКОРОМ ОТКАЗЕ', 'BAD']);
    if (hasRel) {
      kv.push(['Температура', d.temp != null ? d.temp + ' °C' : '—', d.temp >= 60 ? 'WARN' : null]);
      kv.push(['Износ', d.wear != null ? d.wear + ' %' : '—', d.wear >= 80 ? 'WARN' : null]);
      kv.push(['Наработка', d.hours != null ? `${d.hours} ч (${(d.hours / 24).toFixed(0)} сут.)` : '—']);
      if (d.readErr != null) kv.push(['Ошибок чтения / записи', `${d.readErr} / ${d.writeErr}`, d.readErr || d.writeErr ? 'WARN' : null]);
      if (d.cycles != null) kv.push(['Циклов включения', d.cycles]);
    }
    const sec = { title: `Диск ${d.num}: ${nz(d.model)}`, kv };
    sections.push(sec);
    const sm = arr(d.smart);
    if (sm.length) {
      sections.push({ title: `SMART — диск ${d.num}`, table: { cols: ['ID', 'Параметр', 'Текущее', 'Худшее', 'Порог', 'Сырое значение'],
        rows: sm.map((a) => {
          const raw = BigInt(a.raw || 0);
          const temp = a.id === 194 || a.id === 190;
          const rawTxt = temp ? `${Number(raw & 255n)} °C` : String(raw);
          const bad = (a.thr > 0 && a.cur <= a.thr) || (SMART_RAW_BAD.has(a.id) && raw > 0n);
          return { cells: [a.id, SMART_NAMES[a.id] || 'Атрибут ' + a.id, a.cur, a.worst, a.thr == null ? '—' : a.thr, rawTxt], lvl: bad ? 'WARN' : null };
        }) } });
    } else if (!hasRel) {
      sec.kv.push(['SMART', admin ? 'Для этого диска Windows не отдаёт SMART (часто так у NVMe; откройте CrystalDiskInfo или HDD Sentinel)' : 'Нужны права администратора, чтобы прочитать температуру, износ и SMART']);
    }
    const mine = vols.filter((v) => v.disk === d.num);
    if (mine.length) {
      sections.push({ title: `Разделы — диск ${d.num}`, bars: mine.map((v) => {
        const used = v.size ? Math.round(((v.size - v.free) / v.size) * 100) : 0;
        return { label: `${v.letter} ${v.label || ''}`.trim(), pct: used, text: `${bytes(v.free)} свободно из ${bytes(v.size)} · ${nz(v.fs)}`, lvl: 100 - used < 5 ? 'BAD' : 100 - used < 10 ? 'WARN' : 'OK' };
      }) });
    }
  }
  const rest = vols.filter((v) => !disks.some((d) => d.num === v.disk));
  if (rest.length) sections.push({ title: 'Другие разделы', bars: rest.map((v) => ({ label: v.letter, pct: v.size ? Math.round(((v.size - v.free) / v.size) * 100) : 0, text: `${bytes(v.free)} свободно из ${bytes(v.size)}`, lvl: 'OK' })) });
  return { key: 'disk', sections };
}

function tabNet(c) {
  const n = arr(c.nics);
  return { key: 'net', sections: [{ title: 'Сетевые адаптеры', table: { cols: ['Адаптер', 'Состояние', 'Скорость', 'MAC', 'IPv4', 'Шлюз', 'DNS', 'DHCP'],
    rows: n.map((x) => [`${nz(x.name)} — ${nz(x.desc)}`, nz(x.status) === 'Up' ? 'подключён' : nz(x.status), nz(x.speed), nz(x.mac), arr(x.ip).join(', ') || '—',
      arr(x.gw).join(', ') || '—', arr(x.dns).join(', ') || '—', yn(x.dhcp)]) } }] };
}

function tabBatt(c) {
  const b = c.battery;
  if (!b) return { key: 'batt', sections: [{ title: 'Батарея', note: 'Батареи нет — это стационарный ПК. Для ноутбуков здесь будут износ, ёмкость и число циклов.' }] };
  const wear = b.designCap && b.fullCap ? Math.max(0, 100 - (b.fullCap / b.designCap) * 100) : null;
  return { key: 'batt', sections: [{ title: 'Батарея', kv: [
    ['Название', nz(b.name)], ['Производитель', nz(b.vendor)], ['Серийный номер', nz(b.serial)], ['Химия', CHEM[b.chem] || nz(b.chem)],
    ['Заряд', nz(b.charge) + ' %'], ['Состояние', BATT_STATUS[b.status] || nz(b.status)], ['Оставшееся время', b.runtime && b.runtime < 71582788 ? b.runtime + ' мин' : '—'],
    ['Проектная ёмкость', b.designCap ? b.designCap + ' мВт·ч' : '—'], ['Полная ёмкость сейчас', b.fullCap ? b.fullCap + ' мВт·ч' : '—'],
    ['Износ', wear == null ? '—' : wear.toFixed(0) + ' %', wear >= 40 ? 'BAD' : wear >= 25 ? 'WARN' : null], ['Циклов зарядки', nz(b.cycles)] ] }] };
}

function tabDrv(d) {
  const prob = arr(d.problems); const drv = arr(d.drivers);
  return { key: 'drv', sections: [
    prob.length ? { title: `Устройства с ошибками (${prob.length})`, table: { cols: ['Устройство', 'Код', 'Производитель', 'ID'],
      rows: prob.map((p) => ({ cells: [nz(p.name), p.code + (p.code === 28 ? ' — драйвер не установлен' : ''), nz(p.vendor), nz(p.id)], lvl: 'WARN' })) } }
      : { title: 'Устройства с ошибками', note: 'Все устройства работают, ошибок драйверов нет.' },
    { title: `Установленные драйверы (${drv.length})`, table: { cols: ['Устройство', 'Класс', 'Производитель', 'Версия', 'Дата', 'Подпись'],
      rows: drv.map((x) => [nz(x.name), nz(x.cls), nz(x.vendor), nz(x.ver), date(x.date), yn(x.signed)]), filter: true } },
  ] };
}

function tabEvt(e) {
  const dumps = arr(e.dumps); const crashes = arr(e.crashes); const ev = arr(e.events); const kp = arr(e.unexpected);
  return { key: 'evt', sections: [
    { title: `Синие экраны (дампы Minidump: ${dumps.length})`, ...(dumps.length
      ? { table: { cols: ['Файл', 'Дата', 'Размер'], rows: dumps.map((d) => [d.name, date(d.time, true), bytes(d.size)]) } }
      : { note: 'Файлов Minidump нет — синих экранов не было (или дампы отключены).' }) },
    { title: `Коды остановки (журнал, ${crashes.length})`, ...(crashes.length
      ? { table: { cols: ['Время', 'Код проверки ошибок'], rows: crashes.map((c) => ({ cells: [date(c.time, true), nz(c.code)], lvl: 'WARN' })) } }
      : { note: 'Записей о перезагрузке после сбоя нет.' }) },
    { title: `Неожиданные выключения (Kernel-Power 41: ${kp.length})`, ...(kp.length
      ? { table: { cols: ['Время', 'Источник'], rows: kp.map((k) => [date(k.time, true), nz(k.src)]) } } : { note: 'Не было.' }) },
    { title: `Ошибки системы за 7 дней (${ev.length})`, table: { cols: ['Время', 'Источник', 'ID', 'Сообщение'],
      rows: ev.map((x) => [date(x.time, true), nz(x.src), x.id, nz(x.msg)]), filter: true } },
  ] };
}

const FROM_CORE = { sys: tabSys, cpu: tabCpu, board: tabBoard, mem: tabMem, gpu: tabGpu, disk: tabDisk, net: tabNet, batt: tabBatt };

async function getTab(key, { admin, fresh } = {}) {
  if (key === 'drv') return tabDrv(await part('drivers', fresh));
  if (key === 'evt') return tabEvt(await part('events', fresh));
  if (!FROM_CORE[key]) throw new Error('неизвестная вкладка: ' + key);
  return FROM_CORE[key](await part('core', fresh), admin);
}

// ---------- живые данные (загрузка ядер, частота, память)
let liveProc = null;
function liveStart(onData) {
  liveStop();
  const script = path.join(P.workDir, 'live.ps1');
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'live.ps1'), script);
  liveProc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
  const rl = readline.createInterface({ input: liveProc.stdout });
  rl.on('line', (line) => {
    try { onData(JSON.parse(line.replace(/^﻿/, ''))); } catch (_) { /* неполная строка */ }
  });
  liveProc.on('exit', () => { liveProc = null; });
}
function liveStop() {
  if (liveProc) { try { liveProc.kill(); } catch (_) { /* */ } liveProc = null; }
}

module.exports = { getTab, liveStart, liveStop, tabCpu, tabMem };
