'use strict';
// Проверка свежих версий и докачка недостающих программ (только официальные источники).
const fs = require('fs');
const path = require('path');
const P = require('./paths');
const net = require('./netutil');
const launch = require('./launch');

async function ghAsset(repo, re) {
  const data = JSON.parse(await net.text(`https://api.github.com/repos/${repo}/releases/latest`));
  const a = (data.assets || []).find((x) => re.test(x.name));
  return { ver: data.tag_name || '', url: a ? a.browser_download_url : null, file: a ? a.name : null };
}

async function sumatra() {
  const tag = JSON.parse(await net.text('https://api.github.com/repos/sumatrapdfreader/sumatrapdf/releases/latest')).tag_name || '';
  const v = tag.replace(/rel$/, '');
  const file = `SumatraPDF-${v}-64-install.exe`;
  return { ver: v, url: `https://www.sumatrapdfreader.org/dl/rel/${v}/${file}`, file };
}

async function vlc() {
  const m = /vlc-([\d.]+)-win64\.exe/.exec(await net.text('https://get.videolan.org/vlc/last/win64/'));
  if (!m) return { ver: '', url: null, file: null };
  const file = `vlc-${m[1]}-win64.exe`;
  return { ver: m[1], url: `https://get.videolan.org/vlc/${m[1]}/win64/${file}`, file };
}

async function winrar() {
  const m = /rar\/(winrar-x64-(\d+)ru\.exe)/.exec(await net.text('https://www.rarlab.com/download.htm'));
  if (!m) return { ver: '', url: null, file: null };
  return { ver: m[2], url: 'https://www.rarlab.com/rar/' + m[1], file: m[1] };
}

// folder — папка внутри Tools; pat — как выглядит локальный файл/папка; unpack — как распаковать скачанное
const GETTERS = [
  { name: '7-Zip', folder: 'Install', pat: /^7z\d+-x64\.exe$/i, resolve: () => ghAsset('ip7z/7zip', /^7z\d+-x64\.exe$/i) },
  { name: 'Rufus', folder: 'Apps\\Rufus', pat: /^rufus-[\d.]+p\.exe$/i, resolve: () => ghAsset('pbatard/rufus', /^rufus-[\d.]+p\.exe$/i) },
  { name: 'Ventoy', folder: 'Apps\\Ventoy', pat: /^ventoy-[\d.]+$/i, unpack: 'zip', resolve: () => ghAsset('ventoy/Ventoy', /windows\.zip$/i) },
  { name: 'Bulk Crap Uninstaller', folder: 'Apps\\BCU', pat: /^BCUninstaller\.exe$/i, unpack: '7z', skipVersion: true,
    resolve: () => ghAsset('Klocman/Bulk-Crap-Uninstaller', /portable\.7z$/i) },
  { name: 'Sumatra PDF', folder: 'Install', pat: /^SumatraPDF-[\d.]+-64-install\.exe$/i, resolve: sumatra },
  { name: 'VLC', folder: 'Install', pat: /^vlc-[\d.]+-win64\.exe$/i, resolve: vlc },
  { name: 'WinRAR', folder: 'Install', pat: /^winrar-x64-\d+ru\.exe$/i, resolve: winrar },
];

function localMatch(folder, pat) {
  const d = path.join(P.toolsDir, folder);
  if (!fs.existsSync(d)) return null;
  const hits = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (pat.test(e.name)) hits.push(e.name);
    if (e.isDirectory()) {
      if (pat.test(e.name)) continue;
      try { for (const f of fs.readdirSync(path.join(d, e.name))) if (pat.test(f)) hits.push(path.join(e.name, f)); } catch (_) { /* */ }
    }
  }
  return hits.sort().pop() || null;
}

const digits = (s) => (String(s || '').match(/\d/g) || []).join('');

async function check() {
  const rows = [];
  for (const g of GETTERS) {
    try {
      const r = await g.resolve();
      const have = localMatch(g.folder, g.pat);
      let status;
      if (!have) status = 'нет в наборе';
      else if (g.skipVersion || digits(have).includes(digits(r.ver))) status = 'актуально';
      else status = 'есть новее';
      rows.push({ name: g.name, remote: r.ver, local: have || '—', status });
    } catch (e) {
      rows.push({ name: g.name, remote: '', local: '', status: 'не удалось проверить: ' + e.message });
    }
  }
  return rows;
}

async function expandZip(zip, dir) {
  const { exec } = require('./actions');
  const r = await exec('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}' -Force`], { timeout: 300000 });
  if (r.code !== 0) throw new Error('не удалось распаковать zip: ' + r.out.trim().split('\n')[0]);
}

async function fetchOne(g, log) {
  const r = await g.resolve();
  if (!r.url) throw new Error('не нашёл ссылку на сайте');
  const dir = path.join(P.toolsDir, g.folder);
  fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, r.file);
  log(`Скачиваю ${g.name} ${r.ver}…`);
  await net.download(r.url, dst, { timeout: 120000 });
  if (g.unpack === 'zip') { await expandZip(dst, dir); fs.unlinkSync(dst); }
  else if (g.unpack === '7z') {
    const z = await launch.find7z(log);
    if (!z) throw new Error('нет 7-Zip для распаковки');
    const code = await launch.runProc(z, ['x', '-y', '-o' + dir, dst]);
    if (code !== 0 && code !== 1) throw new Error('распаковка не удалась (код ' + code + ')');
    fs.unlinkSync(dst);
  }
  return `${g.name} ${r.ver} скачан`;
}

// Скачивает всё, чего нет в наборе. Возвращает список строк-результатов.
async function fetchMissing(log) {
  const out = [];
  for (const g of GETTERS) {
    if (localMatch(g.folder, g.pat)) continue;
    try { out.push(await fetchOne(g, log)); } catch (e) { out.push(`${g.name}: ошибка скачивания — ${e.message}`); }
  }
  return out;
}

module.exports = { check, fetchMissing, GETTERS, localMatch };
