'use strict';
// Сканирование Tools: обычные файлы по каталогу + портативные программы из Tools\Apps + tools.json
const fs = require('fs');
const path = require('path');
const P = require('./paths');
const cat = require('./catalog');

const EXTS = new Set(['.exe', '.cmd', '.bat', '.lnk', '.msi']);

function segRegex(seg) {
  return new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
}

function globSegs(dir, segs) {
  if (!segs.length) return [dir];
  const [s, ...rest] = segs;
  const re = segRegex(s);
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
  let out = [];
  for (const e of ents) {
    if (!re.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (rest.length) { if (e.isDirectory()) out = out.concat(globSegs(p, rest)); } else out.push(p);
  }
  return out;
}

function glob(base, pat) {
  const segs = pat.split(/[\\/]/).filter(Boolean);
  return globSegs(base, segs).concat(globSegs(base, ['*', ...segs]));
}

function sizeOf(p) { try { return fs.statSync(p).size; } catch (_) { return 0; } }

// Tools\Apps\<папка>: по одной главной программе на папку (с учётом разрядности системы)
function scanApps() {
  const items = [];
  for (const [folder, title, group, pat64, pat86] of cat.apps) {
    const base = path.join(P.appsDir, folder);
    if (!fs.existsSync(base)) continue;
    let found = null;
    for (const pat of (P.is64() ? pat64 : pat86)) {
      const hits = glob(base, pat).filter((h) => sizeOf(h) > 0).sort();
      if (hits.length) { found = hits[hits.length - 1]; break; }
    }
    if (found) items.push(mk(title, group, found, { inplace: true, app: folder }));
  }
  return items;
}

function mk(title, group, p, extra) {
  const size = sizeOf(p);
  return Object.assign({ title, group, path: p, file: path.basename(p), size, rel: path.relative(P.toolsDir, p) }, extra || {});
}

function walk(dir, top, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  ents.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const t = top || e.name.toLowerCase();
      if (!top && t === 'apps') continue;           // Apps разбираются отдельно
      walk(p, t, out);
    } else if (EXTS.has(path.extname(e.name).toLowerCase())) {
      if (sizeOf(p) === 0) continue;
      let [title, group] = cat.lookup(e.name);
      const arch = top === 'x64' || top === 'x86' ? top : '';
      if (arch) title = `${title} [${arch}]`;
      out.push(mk(title, group, p, { arch }));
    }
  }
}

function scanTools() {
  const items = scanApps();
  if (fs.existsSync(P.toolsDir)) walk(P.toolsDir, '', items);
  if (fs.existsSync(P.customJson)) {
    try {
      for (const e of JSON.parse(fs.readFileSync(P.customJson, 'utf8'))) {
        let p = e.path || '';
        if (!path.isAbsolute(p)) p = path.join(P.srcDir, p);
        items.push(mk(e.name || path.basename(p), e.group || cat.OTHER, p, { custom: true }));
      }
    } catch (_) { /* битый tools.json не должен ронять программу */ }
  }
  items.forEach((it, i) => { it.id = i; });
  return items;
}

module.exports = { scanTools, scanApps, glob };
