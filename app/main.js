'use strict';
const { app, BrowserWindow, ipcMain, shell, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const argv = process.argv.slice(1);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const DEV = !app.isPackaged;

const APP_NAME = 'SysAdmin Toolkit';
const VERSION = require('./package.json').version;
const AUTHOR = { nick: 'TheRealexito', name: 'Aleksey Zhurlov' };
// дата сборки записывается в data\build.json скриптом scripts\stamp.js перед упаковкой (при запуске из исходников файла нет)
let BUILD = {};
try { BUILD = require('./data/build.json'); } catch (_) { /* запуск из исходников */ }
const rand = () => Math.random().toString(36).slice(2, 10);

// Папка с exe (для portable-сборки — исходная папка, а не временная распаковка)
const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
const srcDir = argOf('--src') || (DEV ? path.resolve(__dirname, '..') : exeDir);
// Рабочая папка: в разработке — на E: внутри проекта, на клиентском ПК — временная (удаляется при выходе)
const SHOT = argv.includes('--shot');           // запуск для снимка экрана: своя одноразовая рабочая папка, чтобы не мешать другим окнам
const workDir = DEV ? path.resolve(__dirname, '..', '_dev', SHOT ? 'wd-shot-' + rand() : 'wd-electron') : path.join(os.tmpdir(), 'stk_' + rand());
const binDir = DEV ? path.join(__dirname, 'bin') : path.join(process.resourcesPath, 'bin');

// Весь мусор Chromium (кэш, куки, логи) — в рабочую папку, не в профиль пользователя
fs.mkdirSync(workDir, { recursive: true });
if (SHOT) { app.commandLine.appendSwitch('disable-backgrounding-occluded-windows'); app.commandLine.appendSwitch('disable-renderer-backgrounding'); }
app.setPath('userData', path.join(workDir, 'userdata'));
app.setPath('sessionData', path.join(workDir, 'session'));

const P = require('./lib/paths');
P.init({ exeDir, srcDir, workDir, binDir });
const tools = require('./lib/tools');
const launcher = require('./lib/launch');
const installer = require('./lib/install');
const diag = require('./lib/diag');
const session = require('./lib/session');
const actions = require('./lib/actions');
const updates = require('./lib/updates');
const detail = require('./lib/detail');

// отладка: --trace-quit печатает, откуда вызвано завершение программы
if (argv.includes('--trace-quit')) {
  const q = app.quit.bind(app);
  app.quit = () => { console.log('app.quit() from:\n' + new Error().stack); q(); };
  process.on('uncaughtException', (e) => console.log('uncaughtException:', e && e.stack));
  process.on('exit', (c) => console.log('process exit', c));
}

let win = null;
let allowQuit = false;
const CHANGES = [];
const ACTION_LOG = [];

function log(msg) {
  ACTION_LOG.push(`[${new Date().toTimeString().slice(0, 8)}] ${msg}`);
  if (win && !win.isDestroyed()) win.webContents.send('log', msg);
}

function underTools(p) {
  const rel = path.relative(P.toolsDir, path.resolve(String(p)));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const safe = (fn) => async (_e, ...a) => {
  try { return await fn(...a); } catch (err) { return { error: String((err && err.message) || err) }; }
};

function createWindow() {
  win = new BrowserWindow({
    width: 1340, height: 860, minWidth: 1080, minHeight: 700,
    backgroundColor: '#0b0a16', show: false, title: APP_NAME,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#07060f', symbolColor: '#ece9ff', height: 36 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: !SHOT },
  });
  // режим снимков экрана: окно рисуется за пределами экрана, чтобы его нельзя было случайно нажать
  win.once('ready-to-show', () => { if (SHOT) { win.setPosition(-5000, 100); win.showInactive(); } else win.show(); });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { page: argOf('--page') || '', group: argOf('--group') || '', act: DEV ? (argOf('--act') || '') : '',
    tab: DEV ? (argOf('--tab') || '') : '', view: DEV ? (argOf('--view') || '') : '' } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (argv.includes('--devtools')) win.webContents.openDevTools({ mode: 'detach' });
  if (DEV) win.webContents.on('console-message', (e) => console.log('[renderer]', (e && e.message) || e));   // ошибки интерфейса — в консоль запуска

  // закрытие окна: если что-то менялось в системе или это копия на ПК — спрашиваем в интерфейсе
  win.on('close', (e) => {
    if (allowQuit) return;
    if (CHANGES.length || fs.existsSync(P.localMark)) { e.preventDefault(); win.webContents.send('ask-exit'); }
  });

  // режим проверки внешнего вида: снять скриншот страницы и выйти (--shot файл.png [--shot-delay мс])
  const shot = argOf('--shot');
  if (shot) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try { fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG()); } catch (e) { console.error('shot failed', e); }
      allowQuit = true;
      app.quit();
    }, Number(argOf('--shot-delay') || 2500)));
  }
}

function scheduleDelete(dir) {
  const bat = path.join(os.tmpdir(), 'stk_rm_' + rand() + '.bat');
  fs.writeFileSync(bat, `@echo off\r\nping 127.0.0.1 -n 4 >nul\r\nrmdir /s /q "${dir}"\r\ndel "%~f0"\r\n`);
  spawn('cmd.exe', ['/c', bat], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function dirSize(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    try { n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size; } catch (_) { /* */ }
  }
  return n;
}

// ---------- иконки программ (берутся из самих файлов средствами Windows)
// У пакетов Стрельца значок упаковщика одинаковый, поэтому настоящие значки программ заранее собраны
// в data\icons.json (скрипт _dev\make_icons.js). Для новых файлов берём собственный значок, если он не общий.
let ICON_PACK = { generic: [], icons: {} };
try { ICON_PACK = require('./data/icons.json'); } catch (_) { /* набора нет — будут буквы и собственные значки */ }
const GENERIC = new Set(ICON_PACK.generic);
const iconCache = new Map();
async function iconFor(p) {
  const key = path.relative(P.toolsDir, p).toLowerCase();
  if (ICON_PACK.icons[key]) return ICON_PACK.icons[key];
  if (iconCache.has(p)) return iconCache.get(p);
  let url = null;
  try {
    const img = await app.getFileIcon(p, { size: 'large' });
    if (!img.isEmpty()) {
      const hash = require('crypto').createHash('md5').update(img.toPNG()).digest('hex').slice(0, 10);
      if (!GENERIC.has(hash)) url = img.toDataURL();
    }
  } catch (_) { /* для некоторых файлов иконки нет — останется буква */ }
  iconCache.set(p, url);
  return url;
}

ipcMain.handle('icons:get', safe(async (paths) => {
  const out = {};
  const q = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === 'string' && underTools(p));
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (q.length) { const p = q.shift(); out[p] = await iconFor(p); }
  }));
  return out;
}));

// ---------- основное
ipcMain.handle('init', safe(() => {
  const ses = session.info();
  return {
    app: APP_NAME, version: VERSION, author: AUTHOR, dev: DEV,
    buildDate: BUILD.date || null,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    paths: { exe: exeDir, src: srcDir, tools: P.toolsDir, reports: P.reportsDir },
    session: ses,
    local: fs.existsSync(P.localMark),
    portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
    // просим перезапуститься с правами администратора, если запущены без них (кроме режима снимков экрана)
    adminPrompt: !ses.admin && !argv.includes('--no-admin-prompt') && (!argv.includes('--shot') || argv.includes('--force-admin-prompt')),
  };
}));

// ---------- настройки (вид списка утилит и т.п.) лежат рядом с программой; если носитель только для чтения — не страшно
function settingsPath() { return path.join(srcDir, 'settings.json'); }
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (_) { return {}; }
}
ipcMain.handle('settings:get', safe(() => readSettings()));
ipcMain.handle('settings:set', safe((patch) => {
  const next = { ...readSettings(), ...(patch || {}) };
  try { fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8'); } catch (_) { /* носитель только для чтения */ }
  return next;
}));

// ---------- перезапуск с правами администратора (окно UAC покажет сама Windows)
ipcMain.handle('app:relaunch-admin', safe(async () => {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const args = DEV ? [q('"' + app.getAppPath() + '"'), q('--src'), q('"' + srcDir + '"')] : [q('--src'), q('"' + srcDir + '"')];
  const r = await actions.exec('powershell', ['-NoProfile', '-Command',
    `Start-Process -FilePath ${q(exe)} -ArgumentList ${args.join(',')} -Verb RunAs`], { timeout: 120000 });
  if (r.code !== 0) throw new Error('Запуск с правами администратора отменён или не удался');
  log('Перезапуск с правами администратора…');
  allowQuit = true;
  setTimeout(() => app.quit(), 400);
  return { ok: true };
}));

// ---------- подробности диагностики («провалиться» в параметр) и живые данные
ipcMain.handle('diag:tab', safe(async (key, fresh) => detail.getTab(key, { admin: session.isAdmin(), fresh: !!fresh })));
ipcMain.handle('live:start', safe(() => {
  detail.liveStart((d) => { if (win && !win.isDestroyed()) win.webContents.send('live', d); });
  return { ok: true };
}));
ipcMain.handle('live:stop', safe(() => { detail.liveStop(); return { ok: true }; }));

ipcMain.handle('tools:list', safe(() => tools.scanTools().map((t) => {
  // установщики из Tools\Install ставятся тихо с подтверждением, а не запускаются как обычные программы
  t.installer = path.dirname(t.path).toLowerCase() === P.installDir.toLowerCase() && !!installer.meta(t.file);
  return t;
})));

ipcMain.handle('tools:launch', safe(async (item, opts) => {
  if (!item || !underTools(item.path)) throw new Error('файл вне папки Tools');
  await launcher.launch(item, opts || {}, log);
  log('Запущено: ' + item.title);
  return { ok: true };
}));

ipcMain.handle('tools:copy-all', safe(async () => {
  if (!fs.existsSync(P.toolsDir)) throw new Error('папка Tools не найдена');
  const size = dirSize(P.toolsDir);
  const st = fs.statfsSync(P.workDir);
  const free = st.bavail * st.bsize;
  const gb = (n) => (n / 2 ** 30).toFixed(1);
  if (size * 1.1 > free) throw new Error(`Не хватает места: нужно ${gb(size)} ГБ, свободно ${gb(free)} ГБ`);
  const dst = path.join(workDir, 'Tools');
  log(`Копирую Tools на ПК (${gb(size)} ГБ)…`);
  await fs.promises.cp(P.toolsDir, dst, { recursive: true, force: false, errorOnExist: false });
  P.toolsDir = dst; P.appsDir = path.join(dst, 'Apps'); P.installDir = path.join(dst, 'Install');
  log('Tools скопирована на ПК: ' + dst);
  return { ok: true };
}));

ipcMain.handle('install:list', safe(() => {
  const dir = P.installDir;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((fn) => ({ fn, m: installer.meta(fn) })).filter((x) => x.m)
    .map((x) => ({ file: x.fn, path: path.join(dir, x.fn), name: x.m.name, only64: x.m.only64, def: x.m.def,
      order: installer.INSTALLERS.indexOf(x.m), ok64: P.is64() || !x.m.only64 }))
    .sort((a, b) => a.order - b.order);
}));

ipcMain.handle('install:run', safe(async (file) => {
  if (!underTools(file)) throw new Error('файл вне папки Tools');
  log('Устанавливаю ' + path.basename(file) + '…');
  const r = await installer.install(file);
  if (r.change) CHANGES.push(r.change);
  log(r.msg);
  return r;
}));

ipcMain.handle('updates:check', safe(async () => { log('Проверяю свежие версии…'); return updates.check(); }));
ipcMain.handle('updates:fetch', safe(async () => {
  const res = await updates.fetchMissing(log);
  res.forEach((r) => log(r));
  return res;
}));

ipcMain.handle('diag:run', safe(async () => {
  log('Диагностика запущена…');
  const r = await diag.run();
  log('Диагностика завершена: ' + r.verdict.text);
  return r;
}));

ipcMain.handle('report:save', safe(async (res) => {
  const name = 'report_' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '.html';
  for (const dir of [P.reportsDir, workDir]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const p = path.join(dir, name);
      fs.writeFileSync(p, diag.reportHtml(res, { app: APP_NAME, version: VERSION, author: `${AUTHOR.nick} (${AUTHOR.name})` }), 'utf8');
      log('Отчёт сохранён: ' + p);
      shell.openPath(p);
      return { ok: true, path: p };
    } catch (e) { log(`Не удалось записать в ${dir}: ${e.message}`); }
  }
  throw new Error('не удалось сохранить отчёт');
}));

ipcMain.handle('report:copy', safe((res) => {
  clipboard.writeText(res.rows.map((r) => `${r.name}: ${r.val}`).join('\n') + '\nИтог: ' + res.verdict.text);
  log('Отчёт скопирован в буфер обмена');
  return { ok: true };
}));

ipcMain.handle('dir:open', safe(async (which) => {
  const dir = { tools: P.toolsDir, reports: P.reportsDir, exe: exeDir }[which];
  if (!dir) throw new Error('неизвестная папка');
  fs.mkdirSync(dir, { recursive: true });
  const err = await shell.openPath(dir);
  if (err) throw new Error(err);
  return { ok: true };
}));

ipcMain.handle('action:run', safe(async (id, args) => {
  const r = await actions.run(id, args);
  if (r.change) { CHANGES.push(r.change); log(r.change); } else if (!r.error) log('Выполнено: ' + id);
  r.changes = CHANGES.length;
  return r;
}));

ipcMain.handle('changes', safe(() => CHANGES.slice()));

// ---------- копия программы на ПК и выход
ipcMain.handle('app:copy-self', safe(async () => {
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;
  if (DEV || !portable) throw new Error('Копирование на ПК работает в собранной версии (exe).');
  const dst = path.join(os.tmpdir(), 'stk_app_' + rand());
  fs.mkdirSync(dst, { recursive: true });
  const exe = path.join(dst, path.basename(portable));
  fs.copyFileSync(portable, exe);
  fs.writeFileSync(path.join(dst, '.localcopy'), 'temporary copy');
  spawn(exe, ['--src', srcDir], { cwd: dst, detached: true, stdio: 'ignore' }).unref();
  log('Запущена копия на ПК: ' + dst);
  allowQuit = true;
  setTimeout(() => app.quit(), 500);
  return { ok: true };
}));

ipcMain.handle('app:exit', safe(() => {
  try {
    if (CHANGES.length) {
      fs.mkdirSync(P.reportsDir, { recursive: true });
      const name = 'log_' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '.txt';
      fs.writeFileSync(path.join(P.reportsDir, name), ACTION_LOG.join('\n') + '\n\nИзменения:\n' + CHANGES.map((c) => '• ' + c).join('\n'), 'utf8');
    }
  } catch (_) { /* журнал не критичен */ }
  if (!DEV && fs.existsSync(P.localMark)) scheduleDelete(exeDir);         // копия на ПК удаляется после выхода
  allowQuit = true;
  app.quit();
  return { ok: true };
}));

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
// Рабочая папка на клиентском ПК удаляется при выходе. Chromium ещё держит часть файлов, поэтому остаток
// стирает отдельный bat уже после завершения процесса (иначе в %TEMP% копился бы мусор после каждого запуска).
app.on('quit', () => {
  detail.liveStop();
  if (DEV) {
    if (SHOT) { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) { /* */ } }
    return;
  }
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) { /* */ }
  if (fs.existsSync(workDir)) scheduleDelete(workDir);
});
