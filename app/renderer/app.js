'use strict';
(() => {
  const api = window.api;
  const $ = (s, r = document) => r.querySelector(s);
  window.addEventListener('error', (e) => console.log('JS error:', e.message, 'line', e.lineno));
  window.addEventListener('unhandledrejection', (e) => console.log('Promise error:', e.reason && e.reason.message ? e.reason.message : e.reason));

  // ---------- мини-конструктор DOM (без innerHTML для данных)
  function add(n, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      n.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
  }
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style') for (const [a, b] of Object.entries(v)) (a.startsWith('--') ? n.style.setProperty(a, b) : (n.style[a] = b));
      else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    add(n, kids);
    return n;
  }
  function icon(name, size = 18, sw = 2) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', sw); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = window.ICONS[name] || '';           // только наши собственные константы из icons.js
    return s;
  }
  const fmtSize = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' ГБ' : n >= 1048576 ? Math.round(n / 1048576) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ');
  const two = (n) => String(n).padStart(2, '0');
  const fmtBuild = (iso) => { const d = new Date(iso); return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`; };

  // ---------- данные страниц
  const PAGES = [
    { key: 'about', name: 'о-программе', icon: 'book', topic: 'версия, папки, как добавить утилиту' },
    { key: 'diag', name: 'диагностика', icon: 'activity', topic: 'быстрая проверка ПК и отчёт для клиента' },
    { key: 'tools', name: 'утилиты', icon: 'hash', topic: 'портативные программы с флешки' },
    { key: 'install', name: 'установка', icon: 'download', topic: 'базовый набор на чистый ПК одной кнопкой' },
    { key: 'win', name: 'windows', icon: 'hash', topic: 'активация, обслуживание, оснастки' },
    { key: 'tweaks', name: 'плюшки', icon: 'megaphone', topic: 'полезные настройки системы' },
    { key: 'net', name: 'сеть', icon: 'hash', topic: 'IP, пинг, сканер подсети' },
  ];
  const CATS = [[null, ['about']], ['ИНСТРУМЕНТЫ', ['diag', 'tools', 'install']], ['СИСТЕМА', ['win', 'tweaks', 'net']]];
  const RAIL = [['diag', '#e8613a', 'activity'], ['tools', '#2fa86b', 'tool'], ['install', '#d6409f', 'download'], ['win', '#3a78e0', 'windows'], ['net', '#1aa3a3', 'globe']];
  const GROUP_COLORS = ['#5865f2', '#e8613a', '#2fa86b', '#d6409f', '#3a78e0', '#1aa3a3', '#b8862b', '#8b5cf6', '#c0495f', '#4b8f6b', '#7a6df0'];

  const QUICK = [['Диспетчер устройств', 'devmgmt.msc'], ['Управление дисками', 'diskmgmt.msc'], ['Службы', 'services.msc'],
    ['Планировщик', 'taskschd.msc'], ['Журнал событий', 'eventvwr.msc'], ['Программы и компоненты', 'appwiz.cpl'],
    ['Сетевые подключения', 'ncpa.cpl'], ['Электропитание', 'powercfg.cpl'], ['Свойства системы', 'sysdm.cpl'],
    ['msconfig', 'msconfig'], ['Реестр', 'regedit']];

  const ACT = {
    win: [
      ['Лицензия и версия', [
        { t: 'Статус активации', d: 'Состояние лицензии Windows: активирована или нет', i: 'shield', k: 'primary', id: 'win_status' },
        { t: 'Срок лицензии', d: 'До какой даты действует лицензия', i: 'calendar', id: 'win_xpr' },
        { t: 'OEM-ключ из BIOS', d: 'Ключ, прошитый производителем в материнскую плату', i: 'key', id: 'win_oem' },
        { t: 'Ввести ключ и активировать', d: 'Установка ключа продукта и онлайн-активация', i: 'key', id: 'win_key', form: 'key' },
        { t: 'Активация по телефону', d: 'Мастер активации по телефону (slui 4)', i: 'info', id: 'win_phone' },
        { t: 'О системе (winver)', d: 'Версия и сборка Windows', i: 'windows', id: 'open', args: { target: 'winver' } },
      ]],
      ['Обслуживание', [
        { t: 'sfc /scannow', d: 'Проверка и восстановление системных файлов', i: 'shield', k: 'primary', id: 'console', args: { cmd: 'sfc /scannow' } },
        { t: 'DISM RestoreHealth', d: 'Восстановление образа Windows через Центр обновлений', i: 'tool', k: 'primary', id: 'console', args: { cmd: 'DISM /Online /Cleanup-Image /RestoreHealth' } },
        { t: 'Сброс сети', d: 'winsock, IP-стек и DNS — когда пропал интернет', i: 'globe', id: 'reset_net', confirm: 'Сбросить Winsock, IP-стек и DNS-кэш? Потребуется перезагрузка. Перед этим будет создана точка восстановления.' },
        { t: 'Сброс Центра обновлений', d: 'Очистка кэша и перезапуск служб обновления', i: 'refresh', id: 'reset_wu', confirm: 'Сбросить компоненты Центра обновлений Windows? Папка SoftwareDistribution будет переименована.' },
        { t: 'Очистить очередь печати', d: 'Останавливает spooler и удаляет зависшие задания', i: 'trash', id: 'clear_spool', confirm: 'Остановить службу печати и удалить все задания из очереди?' },
        { t: 'Очистить TEMP', d: 'Удаляет временные файлы пользователя и системы', i: 'trash', id: 'clear_temp', confirm: 'Удалить временные файлы из папок TEMP (пользовательской и системной)? Занятые файлы будут пропущены.' },
      ]],
      ['Быстрый доступ', QUICK.map(([t, target]) => ({ t, d: target, i: 'external', id: 'open', args: { target } }))],
      ['Удалённый доступ (RDP)', [
        { t: 'Включить Remote Desktop', d: 'Разрешить подключения по RDP и открыть порт в брандмауэре', i: 'monitor', k: 'primary', id: 'rdp_on', confirm: 'Включить Remote Desktop (RDP) и разрешить его в брандмауэре Windows? Будет создана точка восстановления.' },
      ]],
      ['Hyper-V', [
        { t: 'Включить Hyper-V', d: 'DISM: установить компоненты Hyper-V (потребуется перезагрузка)', i: 'chip', k: 'primary', id: 'hyperv_on' },
        { t: 'Отключить Hyper-V', d: 'DISM: удалить компоненты Hyper-V (потребуется перезагрузка)', i: 'chip', id: 'hyperv_off' },
      ]],
      ['Экспорт списка программ', [
        { t: 'Экспортировать программы (winget)', d: 'Сохранить список установленных программ в JSON — для переустановки на новом ПК', i: 'save', id: 'export_apps' },
      ]],
    ],
    tweaks: [
      ['WinUtil — настройка Windows', [
        { t: 'Открыть WinUtil', d: 'Chris Titus Tech WinUtil: оптимизация, установка программ, дебloating', i: 'tool', k: 'primary', id: 'winutil' },
      ]],
      ['Обновление программ', [
        { t: 'Обновить все программы (winget)', d: 'winget upgrade --all: обновляет все установленные программы', i: 'refresh', k: 'green', id: 'winget_upgrade' },
      ]],
      ['Телеметрия Windows', [
        { t: 'Отключить телеметрию', d: 'AllowTelemetry=0, остановить DiagTrack и dmwappushservice', i: 'shield', id: 'telemetry_off', confirm: 'Отключить телеметрию Windows? Будут остановлены DiagTrack и dmwappushservice, создана точка восстановления.' },
      ]],
      ['Просмотр фотографий (классический)', [
        { t: 'Включить Photo Viewer', d: 'Вернуть старый просмотрщик фотографий Windows', i: 'image', k: 'green', id: 'photo_on' },
        { t: 'Выключить Photo Viewer', d: 'Убрать классический просмотрщик', i: 'image', id: 'photo_off' },
      ]],
      ['Вход в систему', [
        { t: 'Автовход: настроить', d: 'Windows сама входит в учётную запись при запуске', i: 'user', k: 'primary', id: 'autologon_on', form: 'autologon' },
        { t: 'Автовход: отключить', d: 'Вернуть ввод пароля при входе', i: 'lock', id: 'autologon_off' },
      ]],
      ['Оформление и скорость', [
        { t: 'Показывать расширения файлов', d: '.exe, .docx и т.д. в проводнике', i: 'sliders', k: 'primary', id: 'ext_on' },
        { t: 'Старое меню ПКМ (Win 11)', d: 'Классическое контекстное меню без «Показать ещё»', i: 'sliders', id: 'ctx_old' },
        { t: 'Вернуть новое меню ПКМ', d: 'Отменить классическое меню', i: 'sliders', id: 'ctx_new' },
        { t: 'Схема питания: макс. производительность', d: 'powercfg: SCHEME_MIN', i: 'zap', id: 'power_max' },
        { t: 'Отключить быстрый запуск', d: 'Полное выключение вместо гибернации ядра', i: 'zap', id: 'fastboot_off' },
      ]],
    ],
    net: [
      ['Проверки', [
        { t: 'Мой IP (ipconfig /all)', d: 'Адреса, шлюз, DNS всех адаптеров', i: 'globe', k: 'primary', id: 'ipconfig' },
        { t: 'Пинг: шлюз, DNS, интернет', d: 'Быстро понять, где обрыв связи', i: 'wifi', k: 'primary', id: 'net_check', busy: 'Проверяю связь…' },
        { t: 'Сканировать подсеть', d: 'Найти живые устройства в локальной сети', i: 'search', id: 'net_scan', busy: 'Сканирую локальную сеть… это займёт около 10 секунд.' },
        { t: 'Сброс DNS-кэша', d: 'ipconfig /flushdns', i: 'refresh', id: 'flushdns' },
      ]],
      ['WiFi', [
        { t: 'Пароли WiFi', d: 'Показать пароли всех сохранённых WiFi-сетей', i: 'wifi', id: 'wifi_pass', busy: 'Читаю профили WiFi…' },
      ]],
    ],
  };

  // ---------- состояние
  const S = {
    page: 'diag', init: null, tools: null, toolsQ: '', group: null, collapsed: new Set(), selTool: null,
    diag: null, diagBusy: false, detailsOpen: true, cache: true, changes: 0, t0: Date.now(),
    inst: null, instSel: new Set(), instStatus: {}, instBusy: false, out: '', icons: {},
    view: 'tiles',                                   // вид списка утилит: tiles | list
    tab: null, tabs: {}, tabBusy: null, tabErr: '',  // подробности диагностики (null — показаны плитки)
    live: null, liveOn: false,
  };

  // вкладки подробностей: ключ, название, иконка
  const TABS = [['sys', 'Система', 'windows'], ['cpu', 'Процессор', 'cpu'], ['board', 'Плата', 'chip'], ['mem', 'Память', 'memory'],
    ['gpu', 'Видео', 'monitor'], ['disk', 'Диски', 'disk'], ['net', 'Сеть', 'globe'], ['drv', 'Драйверы', 'tool'],
    ['evt', 'События', 'alert'], ['batt', 'Батарея', 'battery']];
  // какая плитка открывает какую вкладку
  const TILE_TAB = { sys: 'sys', cpu: 'cpu', ram: 'mem', disk: 'disk', gpu: 'gpu', drv: 'drv', bsod: 'evt', err: 'evt', batt: 'batt' };

  // ---------- уведомления, окна, журнал
  function toast(msg, kind) {
    const t = el('div', { class: 'toast ' + (kind || '') }, msg);
    $('#toasts').append(t);
    setTimeout(() => t.remove(), kind === 'err' ? 7000 : 3800);
  }

  function addLog(msg, err) {
    const box = $('#log');
    const d = new Date();
    box.append(el('div', { class: err ? 'e' : '' }, el('span', { class: 't' }, `[${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}] `), msg));
    while (box.childNodes.length > 300) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
  }

  function confirmBox(title, body, okText = 'Да', cancelText = 'Отмена') {
    return new Promise((resolve) => {
      const root = $('#modal-root');
      const close = (v) => { root.replaceChildren(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };
      document.addEventListener('keydown', onKey);
      root.replaceChildren(el('div', { class: 'overlay', onclick: (e) => { if (e.target.classList.contains('overlay')) close(false); } },
        el('div', { class: 'modal' }, el('h3', {}, title), el('div', { class: 'mb' }, body),
          el('div', { class: 'mf' }, btn(cancelText, 'grey', null, () => close(false)), btn(okText, 'primary', null, () => close(true))))));
    });
  }

  function infoBox(title, body, mono) {
    return new Promise((resolve) => {
      const root = $('#modal-root');
      const close = () => { root.replaceChildren(); document.removeEventListener('keydown', onKey); resolve(); };
      const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
      document.addEventListener('keydown', onKey);
      root.replaceChildren(el('div', { class: 'overlay', onclick: (e) => { if (e.target.classList.contains('overlay')) close(); } },
        el('div', { class: 'modal wide' }, el('h3', {}, title), el('div', { class: 'mb sel' + (mono ? ' mono' : '') }, body),
          el('div', { class: 'mf' }, btn('Закрыть', 'primary', null, close)))));
    });
  }

  // Окно с полями ввода. Возвращает { имя: значение } или null, если отменили.
  function formBox(title, fields, okText, note) {
    return new Promise((resolve) => {
      const root = $('#modal-root');
      const inputs = {};
      const close = (v) => { root.replaceChildren(); document.removeEventListener('keydown', onKey); resolve(v); };
      const done = () => close(Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.value])));
      const onKey = (e) => { if (e.key === 'Escape') close(null); else if (e.key === 'Enter') done(); };
      document.addEventListener('keydown', onKey);
      const rows = fields.map((f) => {
        inputs[f.name] = el('input', { class: 'fld', type: f.type || 'text', value: f.value || '', placeholder: f.placeholder || '', spellcheck: 'false' });
        return el('label', { class: 'frow' }, el('span', {}, f.label), inputs[f.name]);
      });
      root.replaceChildren(el('div', { class: 'overlay', onclick: (e) => { if (e.target.classList.contains('overlay')) close(null); } },
        el('div', { class: 'modal' }, el('h3', {}, title), ...rows, note ? el('div', { class: 'note' }, note) : null,
          el('div', { class: 'mf' }, btn('Отмена', 'grey', null, () => close(null)), btn(okText || 'Применить', 'primary', null, done)))));
      setTimeout(() => { const f = Object.values(inputs)[0]; if (f) f.focus(); }, 30);
    });
  }

  async function syncChanges() {
    try { S.changes = (await call('changes')).length; renderRail(); } catch (_) { /* */ }
  }

  // ---------- иконки программ (достаются из самих файлов)
  function applyIcons() {
    document.querySelectorAll('[data-ico]').forEach((n) => {
      const u = S.icons[n.dataset.ico];
      if (u && !n.querySelector('img')) { n.replaceChildren(el('img', { src: u, alt: '' })); n.classList.add('ico'); }
    });
  }
  async function loadIcons(items) {
    const need = [...new Set(items.map((t) => t.path))].filter((p) => !(p in S.icons));
    need.forEach((p) => { S.icons[p] = null; });                       // помечаем «запрошено», чтобы не дублировать
    for (let i = 0; i < need.length; i += 12) {
      try { Object.assign(S.icons, await call('icons:get', need.slice(i, i + 12))); applyIcons(); } catch (_) { /* буква останется */ }
    }
  }

  function btn(label, kind, ic, onclick, opts) {
    const o = opts || {};
    return el('button', { class: `btn ${kind || ''} ${o.small ? 'small' : ''} ${o.busy ? 'busy' : ''}`, onclick, title: o.title },
      o.busy ? el('div', { class: 'spin' }) : (ic ? icon(ic, 16) : null), label);
  }

  async function call(ch, ...args) {
    if (S.init && S.init.dev) console.log('call', ch, typeof args[0] === 'string' ? args[0] : '');
    const r = await api.invoke(ch, ...args);
    if (r && r.error) throw new Error(r.error);
    return r;
  }

  // ---------- левая колонка и панель каналов
  function renderRail() {
    const r = $('#rail');
    r.replaceChildren(
      el('div', { class: 'rail-btn rail-logo', 'data-tip': `${S.init.app} — by ${S.init.author.nick}`, onclick: () => show('about') },
        'ST', S.changes ? el('span', { class: 'badge-n' }, S.changes) : null),
      el('div', { class: 'rail-sep' }),
      ...RAIL.map(([key, color, ic]) => el('div', {
        class: 'rail-btn' + (S.page === key ? ' active' : ''), style: { background: color },
        'data-tip': '# ' + PAGES.find((p) => p.key === key).name, onclick: () => show(key),
      }, icon(ic, 22))),
      el('div', { class: 'rail-spacer' }),
      el('div', { class: 'rail-btn rail-ghost', 'data-tip': 'Открыть папку Tools', onclick: () => openDir('tools') }, icon('plus', 24)),
      el('div', { class: 'rail-btn rail-ghost c2', 'data-tip': 'Открыть папку отчётов', onclick: () => openDir('reports') }, icon('compass', 22)));
  }

  function member(text, color, pill) {
    return el('div', { class: 'member' },
      el('div', { class: 'av', style: { background: color } }, (text[0] || '?').toUpperCase()),
      el('span', { class: 'nm', title: text }, text),
      pill ? el('span', { class: 'pill ' + pill[1] }, pill[0]) : null);
  }

  function renderSide() {
    const ss = S.init.session;
    const cnt = S.tools ? S.tools.length : '…';
    const chans = [];
    for (const [cat, keys] of CATS) {
      if (cat) chans.push(el('div', { class: 'cat' }, icon('chevron', 12, 3), cat));
      for (const key of keys) {
        const p = PAGES.find((x) => x.key === key);
        chans.push(el('div', { class: 'chan' + (S.page === key ? ' active' : ''), onclick: () => show(key) }, icon(p.icon, 18), p.name));
      }
    }
    const scroll = el('div', { class: 'side-scroll' },
      el('div', { class: 'event' }, icon('calendar', 18), `${cnt} утилит в наборе`),
      ...chans,
      el('div', { class: 'cat' }, icon('chevron', 12, 3), 'СЕССИЯ'),
      el('div', { class: 'voice-ch' }, icon('speaker', 18), 'ЭТОТ ПК', el('span', { class: 'vt', id: 'vtimer' }, '0:00:00')),
      member(ss.pc, '#e8613a', ss.admin ? ['АДМИН', 'live'] : ['БЕЗ ПРАВ', 'off']),
      member(ss.os, '#3a78e0'), member(ss.user, '#2fa86b'), member(ss.ip, '#1aa3a3'));

    const toolsOk = S.tools == null || S.tools.length > 0;
    const dock = el('div', { class: 'dock' },
      el('div', { class: 'vc' },
        el('div', { class: 'st' + (toolsOk ? '' : ' warn') }, el('i'), toolsOk ? 'Набор подключён' : 'Папка Tools пуста'),
        el('div', { class: 'sub', title: S.init.paths.src }, `${S.init.paths.src.split('\\').filter(Boolean).pop() || S.init.paths.src} / ${S.init.local ? 'копия на ПК' : 'флешка'}`),
        el('div', { class: 'btns' },
          el('button', { class: S.cache ? 'on' : '', 'data-tip': 'Кэшировать утилиты на ПК: ' + (S.cache ? 'вкл' : 'выкл'), onclick: () => { S.cache = !S.cache; addLog('Кэширование утилит на ПК: ' + (S.cache ? 'включено' : 'выключено')); renderSide(); } }, icon('zap', 17)),
          el('button', { 'data-tip': S.init.local ? 'Это копия на ПК (удалится при выходе)' : 'Копировать программу на ПК', onclick: copySelf }, icon('download', 17)),
          el('button', { 'data-tip': 'Сохранить отчёт диагностики', onclick: saveReport }, icon('save', 17)),
          el('button', { class: 'red', 'data-tip': 'Выйти', onclick: exitFlow }, icon('x', 17)))),
      el('div', { class: 'me' },
        el('div', { class: 'avatar' }, el('i', {}, '>_')),
        el('div', { class: 'who' },
          el('div', { class: 'nick' }, S.init.author.nick),
          ss.admin ? el('div', { class: 'st2' }, 'Администрирует')
            : el('div', { class: 'st2 link', title: 'Перезапустить с правами администратора', onclick: adminPrompt }, 'Без прав · запустить как админ')),
        el('div', { class: 'gear', 'data-tip': 'О программе', onclick: () => show('about') }, icon('sliders', 18))));

    $('#side').replaceChildren(
      el('div', { class: 'side-head' }, el('div', { class: 'sh-l' }, 'SysAdmin Toolkit', icon('chevron', 14, 3)),
        el('div', { class: 'ic-btn', title: 'Открыть папку Tools', onclick: () => openDir('tools') }, icon('folder', 18))),
      scroll, dock);
  }

  function renderHead() {
    const p = PAGES.find((x) => x.key === S.page);
    $('#head').replaceChildren(icon(p.icon, 22), el('span', { class: 'h-title' }, p.name), el('span', { class: 'h-div' }),
      el('span', { class: 'h-topic' }, p.topic),
      el('div', { class: 'h-right' }, el('span', { class: 'h-ver' }, 'v' + S.init.version)));
    $('#head').firstChild.classList.add('h-ic');
  }

  async function copySelf() {
    if (S.init.local) return toast('Вы уже работаете с копии на ПК', 'warn');
    if (!(await confirmBox('Копия на ПК', 'Скопировать программу в папку на диске этого ПК и перезапуститься оттуда?\nПри выходе копия удалится, а Tools останется на флешке.', 'Копировать'))) return;
    try { await call('app:copy-self'); } catch (e) { toast(e.message, 'warn'); }
  }

  // Выход: показываем, что останется на ПК после закрытия программы
  async function exitFlow() {
    let changes = [];
    try { changes = await call('changes'); } catch (_) { /* */ }
    if (changes.length || S.init.local) {
      const body = (changes.length ? 'Изменения, внесённые в систему (они останутся):\n\n' + changes.map((c) => '• ' + c).join('\n') : 'Изменений в системе не вносилось.')
        + (S.init.local ? '\n\nКопия программы на этом ПК будет удалена.' : '');
      if (!(await confirmBox('Выйти из программы?', body, 'Выйти'))) return;
    }
    await call('app:exit');
  }

  async function openDir(which) {
    try { await call('dir:open', which); } catch (e) { toast(e.message, 'err'); }
  }

  // ---------- навигация
  function show(key) {
    if (S.page === 'diag' && key !== 'diag') stopLive();      // живые данные нужны только пока открыты подробности
    S.page = key;
    renderRail(); renderSide(); renderHead(); renderPage();
    if (key === 'diag' && !S.diag && !S.diagBusy && !S.tab) runDiag();
    if (key === 'diag' && S.tab) loadTab(S.tab);
  }

  // Запрос прав администратора: Windows сама покажет окно UAC
  async function adminPrompt() {
    if (S.init.dev) console.log('adminPrompt() called from:', (new Error().stack || '').split('\n').slice(1, 4).join(' | '));
    const ok = await confirmBox('Нужны права администратора',
      'Программа запущена без прав администратора. Без них не работают SMART и температура дисков, сбросы, твики, установка программ и часть утилит.\n\nПерезапустить от имени администратора? Windows покажет запрос подтверждения.',
      'Перезапустить как администратор', 'Продолжить без прав');
    if (!ok) { toast('Без прав администратора часть функций недоступна', 'warn'); return; }
    try { await call('app:relaunch-admin'); } catch (e) { toast(e.message, 'warn'); }
  }

  function renderPage() {
    const page = $('#page');
    page.replaceChildren();
    page.scrollTop = 0;
    ({ about: pageAbout, diag: pageDiag, tools: pageTools, install: pageInstall, win: pageActions, tweaks: pageActions, net: pageActions })[S.page](page);
  }

  // ---------- диагностика
  const LVL_TEXT = { OK: 'норма', WARN: 'внимание', BAD: 'проблема' };

  function meterEl(m) {
    const cls = m.pct >= 90 ? 'r' : m.pct >= 70 ? 'y' : '';
    return el('div', { class: 'meter' }, el('i', { class: cls, style: { width: Math.max(2, Math.min(100, m.pct)) + '%' } }), el('span', {}, m.label));
  }

  function volsEl(vols) {
    return el('div', { class: 'vols' }, vols.map((v) => {
      const used = 100 - v.freePct;
      return el('div', { class: 'vol' }, el('span', {}, v.name),
        el('div', { class: 'vb' }, el('i', { class: v.freePct < 5 ? 'r' : v.freePct < 10 ? 'y' : '', style: { width: used + '%' } })),
        el('small', {}, `${v.freeGb.toFixed(0)} из ${v.sizeGb.toFixed(0)} ГБ`));
    }));
  }

  function tileEl(t) {
    return el('div', { class: `tile ${t.lvl} ${t.dark ? 'dark' : ''}`, style: { '--c': t.color }, title: 'Открыть подробности', onclick: () => openTab(TILE_TAB[t.key] || 'sys') },
      el('div', { class: 'more' }, icon('chevron', 16, 2.4)),
      el('div', { class: 'tile-top' },
        el('div', { class: 'av-lg' }, icon(t.icon, 30, 1.8)),
        el('div', { class: 'tile-main' }, el('div', { class: 'big', title: t.big }, t.big), ...(t.sub || []).slice(0, t.vols ? 1 : 3).map((s) => el('div', { class: 'sub', title: s }, s)))),
      t.meter ? meterEl(t.meter) : null, t.vols ? volsEl(t.vols) : null,
      el('div', { class: 'name' }, el('i'), t.title),
      LVL_TEXT[t.lvl] ? el('div', { class: 'state' }, LVL_TEXT[t.lvl]) : null);
  }

  // ===== подробности («провалиться» в параметр, как в CPU-Z) =====
  function openTab(key) {
    S.tab = key;
    renderPage();
    loadTab(key);
  }

  function closeTab() {
    stopLive();
    S.tab = null;
    renderPage();
    if (!S.diag && !S.diagBusy) runDiag();
  }

  function switchTab(key) {
    if (S.tab === key) return;
    stopLive();
    S.tab = key;
    renderPage();
    loadTab(key);
  }

  async function loadTab(key, fresh) {
    if (S.tabs[key] && !fresh) { renderTabBody(); manageLive(); return; }
    S.tabBusy = key; S.tabErr = '';
    renderTabBody();
    try { S.tabs[key] = await call('diag:tab', key, !!fresh); } catch (e) { S.tabErr = 'Не удалось получить данные: ' + e.message; }
    if (S.tabBusy === key) S.tabBusy = null;
    if (S.tab === key && S.page === 'diag') { renderTabBody(); manageLive(); }
  }

  function manageLive() {
    const t = S.tab && S.tabs[S.tab];
    if (S.page === 'diag' && t && t.live) {
      if (!S.liveOn) { S.liveOn = true; call('live:start').catch(() => { S.liveOn = false; }); }
    } else stopLive();
  }

  function stopLive() {
    if (S.liveOn) { S.liveOn = false; S.live = null; call('live:stop').catch(() => { /* */ }); }
  }

  function renderDetail(page) {
    page.append(el('div', { class: 'bar' },
      btn('К плиткам', 'grey', 'back', closeTab),
      el('div', { class: 'tabs' }, TABS.map(([k, n, ic]) => el('div', { class: 'tab' + (S.tab === k ? ' active' : ''), onclick: () => switchTab(k) }, icon(ic, 15), n))),
      btn('Обновить', 'grey', 'refresh', () => { S.tabs = {}; loadTab(S.tab, true); }, { small: true })));
    page.append(el('div', { id: 'tab-body' }));
    renderTabBody();
  }

  function renderTabBody() {
    const body = $('#tab-body');
    if (!body) return;
    if (S.tabBusy === S.tab) {
      body.replaceChildren(el('div', { class: 'loading' }, el('div', { class: 'spin big' }), 'Читаю данные… в первый раз это занимает до 10 секунд'));
      return;
    }
    const tab = S.tabs[S.tab];
    if (!tab) { body.replaceChildren(el('div', { class: 'empty-note' }, S.tabErr || 'Нет данных')); return; }
    const parts = [];
    if (tab.live) parts.push(liveEl(tab.live));
    for (const s of tab.sections) parts.push(sectionEl(s));
    if (!S.init.session.admin && /^(disk|board)$/.test(tab.key)) {
      parts.push(el('div', { class: 'hint' }, 'Часть данных (SMART, температура и износ дисков, Secure Boot, TPM) читается только с правами администратора.'));
    }
    if (tab.key === 'cpu' || tab.key === 'gpu') {
      const hw = S.tools && S.tools.find((t) => /^hwinfo/i.test(t.file));
      if (hw) parts.push(el('div', { class: 'bar' }, btn('Датчики: открыть HWiNFO', 'grey', 'activity', () => launchTool(hw))));
    }
    body.replaceChildren(...parts);
    applyLive();
  }

  function sectionEl(s) {
    const card = el('div', { class: 'card dcard sel' }, el('div', { class: 'dtitle' }, s.title));
    if (s.kv) card.append(el('div', { class: 'kv2' }, s.kv.map(([k, v, l]) => [el('div', { class: 'k2' }, k), el('div', { class: 'v2 ' + (l || '') }, String(v))])));
    if (s.table) card.append(tableEl(s.table));
    if (s.bars) card.append(el('div', { class: 'vbars' }, s.bars.map((b) => el('div', { class: 'vbar' },
      el('div', { class: 'vl' }, b.label),
      el('div', { class: 'vbb' }, el('i', { class: b.lvl === 'BAD' ? 'r' : b.lvl === 'WARN' ? 'y' : '', style: { width: Math.min(100, b.pct) + '%' } })),
      el('div', { class: 'vt2' }, b.text)))));
    if (s.note) card.append(el('div', { class: 'dnote' }, s.note));
    return card;
  }

  function tableEl(t) {
    const rows = t.rows.map((r) => (Array.isArray(r) ? { cells: r } : r));
    const tbody = el('tbody');
    const info = el('span', { class: 'dcount' });
    const draw = (q) => {
      const f = q ? rows.filter((r) => r.cells.join(' ').toLowerCase().includes(q)) : rows;
      tbody.replaceChildren(...f.slice(0, 800).map((r) => el('tr', { class: r.lvl || '' }, r.cells.map((c) => el('td', {}, String(c))))));
      info.textContent = f.length > 800 ? `Показано 800 из ${f.length}` : `Строк: ${f.length}`;
    };
    draw('');
    return el('div', { class: 'twrap' },
      t.filter ? el('div', { class: 'tfilter' }, icon('search', 14), el('input', { type: 'text', placeholder: 'Фильтр…', oninput: (e) => draw(e.target.value.trim().toLowerCase()) }), info) : null,
      el('div', { class: 'tscroll' }, el('table', { class: 'dt' }, el('thead', {}, el('tr', {}, t.cols.map((c) => el('th', {}, c)))), tbody)));
  }

  function liveEl(kind) {
    if (kind === 'cpu') {
      return el('div', { class: 'card dcard' }, el('div', { class: 'dtitle' }, 'Загрузка сейчас', el('span', { class: 'live-dot' }, '● live')),
        el('div', { id: 'live-cpu', class: 'livecpu' }, el('div', { class: 'dnote' }, 'Измеряю…')), el('div', { id: 'live-cpu-sum', class: 'dnote' }));
    }
    return el('div', { class: 'card dcard' }, el('div', { class: 'dtitle' }, 'Память сейчас', el('span', { class: 'live-dot' }, '● live')),
      el('div', { id: 'live-mem' }, el('div', { class: 'dnote' }, 'Измеряю…')));
  }

  function applyLive() {
    const d = S.live;
    if (!d) return;
    const clamp = (v) => Math.max(0, Math.min(100, v));
    const c = $('#live-cpu');
    if (c) {
      const cores = d.cores.slice().sort((a, b) => Number(a.n.split(',')[1]) - Number(b.n.split(',')[1]));
      c.replaceChildren(...cores.map((x, i) => {
        const u = clamp(x.u);
        return el('div', { class: 'corebar' }, el('span', { class: 'cn' }, 'Поток ' + (i + 1)),
          el('div', { class: 'cb2' }, el('i', { class: u >= 90 ? 'r' : u >= 70 ? 'y' : '', style: { width: u + '%' } })),
          el('span', { class: 'cu' }, u + '%'));
      }));
      const sum = $('#live-cpu-sum');
      if (sum) sum.textContent = `Общая загрузка ${clamp(d.total)}% · частота ${d.mhz >= 1000 ? (d.mhz / 1000).toFixed(2) + ' ГГц' : d.mhz + ' МГц'} · потоков: ${cores.length}`;
    }
    const m = $('#live-mem');
    if (m) {
      const total = d.ramTotalKb * 1024, free = d.ramFreeKb * 1024, used = total - free;
      const pct = total ? Math.round((used / total) * 100) : 0;
      const gb = (n) => (n / 2 ** 30).toFixed(1) + ' ГБ';
      m.replaceChildren(el('div', { class: 'vbar' }, el('div', { class: 'vl' }, 'ОЗУ'),
        el('div', { class: 'vbb' }, el('i', { class: pct >= 90 ? 'r' : pct >= 75 ? 'y' : '', style: { width: pct + '%' } })),
        el('div', { class: 'vt2' }, `занято ${gb(used)} (${pct}%) · свободно ${gb(free)} из ${gb(total)}`)));
    }
  }

  function pageDiag(page) {
    if (S.tab) return renderDetail(page);
    const d = S.diag;
    page.append(el('div', { class: 'bar' },
      btn(S.diagBusy ? 'Идёт проверка…' : 'Запустить диагностику', 'primary', 'activity', runDiag, { busy: S.diagBusy }),
      btn('Сохранить отчёт', 'grey', 'save', saveReport), btn('Копировать', 'grey', 'copy', copyReport),
      btn('Отчёт о батарее', 'grey', 'battery', batteryReport),
      el('div', { class: 'verdict ' + (d ? d.verdict.lvl : 'wait') }, d ? d.verdict.text : S.diagBusy ? 'идёт проверка…' : 'ещё не запускалась')));
    page.append(el('div', { class: 'tiles' }, d ? d.tiles.map(tileEl) : Array.from({ length: 9 }, () => el('div', { class: 'tile ghost' }))));
    if (d) {
      page.append(el('div', { class: 'sec-title click' + (S.detailsOpen ? '' : ' closed'), onclick: () => { S.detailsOpen = !S.detailsOpen; renderPage(); } },
        icon('chevron', 14, 3), 'Подробности', el('span', { class: 'cnt' }, d.rows.length)));
      if (S.detailsOpen) {
        page.append(el('div', { class: 'card sel' }, el('table', { class: 'rows' }, d.rows.map((r) =>
          el('tr', { class: r.lvl }, el('td', { class: 'n' }, r.name), el('td', { class: 'v' }, r.val), el('td', { class: 'd' }, el('span', { class: 'dot ' + r.lvl })))))));
      }
      if (d.apps.length) page.append(el('div', { class: 'hint' }, `Установлено программ: ${d.apps.length} — полный список попадёт в сохранённый отчёт.`));
    }
  }

  async function runDiag() {
    if (S.diagBusy) return;
    S.diagBusy = true;
    if (S.page === 'diag') renderPage();
    try {
      S.diag = await call('diag:run');
    } catch (e) {
      addLog('Ошибка диагностики: ' + e.message, true);
      toast('Ошибка диагностики: ' + e.message, 'err');
    }
    S.diagBusy = false;
    if (S.page === 'diag') renderPage();
  }

  async function saveReport() {
    if (!S.diag) return toast('Сначала запустите диагностику', 'warn');
    try { await call('report:save', S.diag); toast('Отчёт сохранён', 'ok'); } catch (e) { toast(e.message, 'err'); }
  }
  async function copyReport() {
    if (!S.diag) return toast('Сначала запустите диагностику', 'warn');
    try { await call('report:copy', S.diag); toast('Отчёт скопирован в буфер обмена', 'ok'); } catch (e) { toast(e.message, 'err'); }
  }
  async function batteryReport() {
    const r = await call('action:run', 'battery');
    toast(r.text || 'Готово', r.todo ? 'warn' : 'ok');
  }

  // ---------- утилиты
  function toolFlags(t) { return { pe: t.group.includes('WinPE'), inst: !!t.installer }; }

  async function loadTools(force) {
    if (S.tools && !force) return;
    try {
      S.tools = await call('tools:list');
      addLog(`Найдено утилит: ${S.tools.length} (папка ${S.init.paths.tools})`);
    } catch (e) { addLog('Не удалось прочитать Tools: ' + e.message, true); S.tools = []; }
    renderSide();
    if (S.page === 'tools') renderToolsBody();
    if (S.page === 'install') loadInstall();
  }

  function pageTools(page) {
    const inp = el('input', { type: 'text', placeholder: 'Поиск утилиты…', value: S.toolsQ, oninput: (e) => { S.toolsQ = e.target.value; renderToolsBody(); } });
    page.append(el('div', { class: 'bar' }, el('div', { class: 'search' }, icon('search', 16), inp),
      btn('Запустить', 'primary', 'play', () => S.selTool && launchTool(S.selTool)),
      btn('Обновить список', 'grey', 'refresh', () => loadTools(true)),
      btn('Скопировать всё на ПК', 'grey', 'copy', copyAllTools),
      el('div', { class: 'seg grow-r' },
        el('button', { class: S.view === 'tiles' ? 'on' : '', title: 'Плитки', onclick: () => setView('tiles') }, icon('grid', 17)),
        el('button', { class: S.view === 'list' ? 'on' : '', title: 'Список', onclick: () => setView('list') }, icon('list', 17)))),
    el('div', { class: 'chips', id: 'chips' }), el('div', { id: 'tools-body' }));
    if (!S.tools) loadTools(); else renderToolsBody();
  }

  function renderToolsBody() {
    const body = $('#tools-body'); const chipsBox = $('#chips');
    if (!body) return;
    if (!S.tools) { body.replaceChildren(el('div', { class: 'empty-note' }, 'Читаю папку Tools…')); return; }
    const q = S.toolsQ.trim().toLowerCase();
    const match = (t) => !q || t.title.toLowerCase().includes(q) || t.file.toLowerCase().includes(q);
    const groups = [];
    for (const t of S.tools) if (!groups.includes(t.group)) groups.push(t.group);
    const order = (g) => (g.includes('WinPE') ? 999 : g.startsWith('Установка') ? -1 : 0);
    groups.sort((a, b) => order(a) - order(b));
    const counts = Object.fromEntries(groups.map((g) => [g, S.tools.filter((t) => t.group === g && match(t)).length]));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    chipsBox.replaceChildren(el('div', { class: 'chip' + (!S.group ? ' active' : ''), onclick: () => { S.group = null; renderToolsBody(); } }, 'Все', el('b', {}, total)),
      ...groups.filter((g) => counts[g]).map((g) => el('div', { class: 'chip' + (S.group === g ? ' active' : '') + (g.includes('WinPE') ? ' pe' : ''), onclick: () => { S.group = S.group === g ? null : g; renderToolsBody(); } }, g, el('b', {}, counts[g]))));
    const frag = [];
    for (const g of groups) {
      if (S.group && S.group !== g) continue;
      const items = S.tools.filter((t) => t.group === g && match(t)).sort((a, b) => a.title.localeCompare(b.title, 'ru'));
      if (!items.length) continue;
      const closed = S.collapsed.has(g) && !q;
      frag.push(el('div', { class: 'sec-title click' + (closed ? ' closed' : ''), onclick: () => { closed ? S.collapsed.delete(g) : S.collapsed.add(g); renderToolsBody(); } },
        icon('chevron', 14, 3), g, el('span', { class: 'cnt' }, items.length)));
      const color = GROUP_COLORS[S.tools.length ? groups.indexOf(g) % GROUP_COLORS.length : 0];
      if (!closed) {
        frag.push(S.view === 'list'
          ? el('div', { class: 'tlist' }, items.map((t) => toolRow(t, color)))
          : el('div', { class: 'cards' }, items.map((t) => toolCard(t, color))));
      }
    }
    if (!frag.length) frag.push(el('div', { class: 'empty-note' }, S.tools.length ? 'Ничего не найдено' : 'В папке Tools пусто — положите туда утилиты и нажмите «Обновить список».'));
    body.replaceChildren(...frag);
    applyIcons();
    // иконки подгружаем в порядке отображения: сначала то, что видно сверху
    const shown = [];
    for (const g of groups) if (!S.group || S.group === g) shown.push(...S.tools.filter((t) => t.group === g && match(t)));
    loadIcons(shown);
  }

  async function setView(v) {
    if (S.view === v) return;
    S.view = v;
    renderPage();
    try { await call('settings:set', { toolsView: v }); } catch (_) { /* не критично */ }
  }

  // компактная строка для вида «Список»
  function toolRow(t, color) {
    const f = toolFlags(t);
    const shown = f.inst ? t.title.replace(/\s*\(установить\)\s*$/, '') : t.title;
    const letter = ((shown.match(/[\p{L}\p{N}]/u) || ['?'])[0]).toUpperCase();
    return el('div', {
      class: 'trow' + (S.selTool && S.selTool.id === t.id ? ' sel' : '') + (f.pe ? ' locked' : ''), title: t.path,
      onclick: (e) => { S.selTool = t; document.querySelectorAll('.trow.sel, .tcard.sel').forEach((n) => n.classList.remove('sel')); e.currentTarget.classList.add('sel'); },
      ondblclick: () => launchTool(t),
    },
    S.icons[t.path]
      ? el('div', { class: 'rav ico', 'data-ico': t.path }, el('img', { src: S.icons[t.path], alt: '' }))
      : el('div', { class: 'rav', 'data-ico': t.path, style: { background: color } }, letter),
    el('div', { class: 'rt' }, el('span', { class: 'rtt' }, shown), f.pe ? el('span', { class: 'tag pe' }, 'WinPE') : null, f.inst ? el('span', { class: 'tag inst' }, 'установка') : null,
      t.arch ? el('span', { class: 'tag' }, t.arch) : null),
    el('div', { class: 'rf' }, t.file),
    el('div', { class: 'rs' }, fmtSize(t.size)),
    el('div', { class: 'rgo', onclick: (e) => { e.stopPropagation(); launchTool(t); } }, icon(f.pe ? 'info' : 'play', 15)));
  }

  function toolCard(t, color) {
    const f = toolFlags(t);
    const sub = `${t.file} · ${fmtSize(t.size)}`;
    const shown = f.inst ? t.title.replace(/\s*\(установить\)\s*$/, '') : t.title;
    const letter = ((shown.match(/[\p{L}\p{N}]/u) || ['?'])[0]).toUpperCase();
    return el('div', {
      class: 'tcard' + (S.selTool && S.selTool.id === t.id ? ' sel' : '') + (f.pe ? ' locked' : ''), title: t.path,
      onclick: (e) => { S.selTool = t; document.querySelectorAll('.tcard.sel').forEach((n) => n.classList.remove('sel')); e.currentTarget.classList.add('sel'); },
      ondblclick: () => launchTool(t),
    },
    S.icons[t.path]
      ? el('div', { class: 'tav ico', 'data-ico': t.path }, el('img', { src: S.icons[t.path], alt: '' }))
      : el('div', { class: 'tav', 'data-ico': t.path, style: { background: color } }, letter),
    f.pe ? el('div', { class: 'lockb' }, icon('lock', 11, 2.6)) : null,
    el('div', { class: 'tx' }, el('div', { class: 'tt', title: shown }, shown, f.pe ? el('span', { class: 'tag pe' }, 'WinPE') : null, f.inst ? el('span', { class: 'tag inst' }, 'установка') : null),
      el('div', { class: 'ts' }, sub)),
    el('div', { class: 'go', onclick: (e) => { e.stopPropagation(); launchTool(t); } }, icon(f.pe ? 'info' : 'play', 16)));
  }

  async function launchTool(t) {
    const f = toolFlags(t);
    if (f.pe) {
      return confirmBox(t.title, 'Этот пакет рассчитан только на загрузку с флешки Стрельца (WinPE). В обычной Windows он не запускается: его скрипты рассчитаны на диск X: и меняют реестр.\n\nЗагрузитесь с флешки, чтобы пользоваться им.', 'Понятно', 'Закрыть');
    }
    try {
      if (f.inst) {
        if (!(await confirmBox('Установка', `Установить ${t.title.replace(/\s*\(установить\)/, '')} на этот ПК?\n\nУстановка пройдёт автоматически, без лишних вопросов.`, 'Установить'))) return;
        const r = await call('install:run', t.path);
        if (r.change) syncChanges();
        toast(r.msg, r.ok ? 'ok' : 'err');
        return;
      }
      toast('Запускаю: ' + t.title);
      await call('tools:launch', t, { cache: S.cache });
    } catch (e) {
      addLog(`Ошибка запуска ${t.title}: ${e.message}`, true);
      toast(e.message, 'err');
    }
  }

  async function copyAllTools() {
    if (!(await confirmBox('Копирование на ПК', 'Скопировать всю папку Tools на диск этого ПК?\nЭто может занять много места и времени.', 'Копировать'))) return;
    toast('Копирую Tools… ход виден в журнале');
    try {
      await call('tools:copy-all');
      toast('Tools скопирована на ПК', 'ok');
      await loadTools(true);
    } catch (e) { toast(e.message, 'err'); addLog(e.message, true); }
  }

  // ---------- установка на чистый ПК
  async function loadInstall() {
    try {
      S.inst = await call('install:list');
      S.instSel = new Set(S.inst.filter((i) => i.def && i.ok64).map((i) => i.path));
    } catch (e) { S.inst = []; addLog(e.message, true); }
    if (S.page === 'install') renderPage();
  }

  function pageInstall(page) {
    if (!S.inst) { loadInstall(); page.append(el('div', { class: 'empty-note' }, 'Читаю Tools\\Install…')); return; }
    const sdio = S.tools && S.tools.find((t) => /^sdio/i.test(t.file));
    page.append(
      el('div', { class: 'bar' },
        btn(S.instBusy ? 'Устанавливаю…' : 'Установить отмеченное', 'primary', 'download', installSelected, { busy: S.instBusy }),
        btn('Отметить всё / снять', 'grey', 'check', () => {
          const all = S.inst.filter((i) => i.ok64);
          if (all.every((i) => S.instSel.has(i.path))) S.instSel.clear(); else all.forEach((i) => S.instSel.add(i.path));
          renderPage();
        }),
        btn('Драйверы (Snappy)', 'green', 'chip', () => (sdio ? launchTool(sdio) : toast('Snappy Driver Installer не найден в Tools\\Apps\\SDIO', 'warn')))),
      el('div', { class: 'bar' },
        btn('.NET 3.5 (через Windows Update)', 'grey', 'download', async () => {
          if (await confirmBox('.NET Framework 3.5', 'Включить компонент .NET Framework 3.5?\n\nФайлы скачаются через Windows Update (нужен интернет).', 'Включить')) {
            await call('action:run', 'console', { cmd: 'DISM /Online /Enable-Feature /FeatureName:NetFx3 /All' });
            addLog('Включается компонент .NET Framework 3.5 (окно консоли)');
          }
        }),
        btn('Проверить обновления', 'grey', 'refresh', checkUpdates),
        btn('Докачать недостающее', 'grey', 'download', fetchMissing)),
      el('div', { class: 'card' }, S.inst.length ? S.inst.map((i) => {
        const st = S.instStatus[i.path];
        return el('div', { class: 'irow' },
          el('div', { class: 'cb' + (S.instSel.has(i.path) ? ' on' : '') + (i.ok64 ? '' : ' off'), onclick: () => { S.instSel.has(i.path) ? S.instSel.delete(i.path) : S.instSel.add(i.path); renderPage(); } }, S.instSel.has(i.path) ? icon('check', 14, 3.5) : null),
          S.icons[i.path]
            ? el('div', { class: 'iav ico', 'data-ico': i.path }, el('img', { src: S.icons[i.path], alt: '' }))
            : el('div', { class: 'iav', 'data-ico': i.path }, (i.name.match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase()),
          el('div', {}, el('div', { class: 'nm' }, i.name), el('div', { class: 'fn' }, i.file + (i.ok64 ? '' : ' · только 64-бит'))),
          st ? el('div', { class: 'stt ' + st.cls }, st.cls === 'run' ? el('div', { class: 'spin' }) : null, st.text) : null);
      }) : el('div', { class: 'empty-note' }, 'В Tools\\Install нет установщиков.')),
      el('div', { class: 'hint' }, 'Ставится тихо, по очереди. Серые — только для 64-битной Windows. Всё установленное попадёт в список изменений при выходе.'));
    applyIcons();
    loadIcons(S.inst);
  }

  async function checkUpdates() {
    toast('Проверяю свежие версии…');
    try {
      const rows = await call('updates:check');
      const body = rows.map((r) => `${r.name.padEnd(24)} ${r.status}${r.remote ? `   (на сайте ${r.remote}; у вас ${r.local})` : ''}`).join('\n')
        + '\n\nChrome, Firefox, VC++ и .NET обновляются сами после установки.';
      await infoBox('Свежие версии', body, true);
    } catch (e) { toast('Не удалось проверить: ' + e.message, 'err'); }
  }

  async function fetchMissing() {
    try {
      const miss = (await call('updates:check')).filter((r) => r.status === 'нет в наборе');
      if (!miss.length) return toast('Всё на месте, докачивать нечего', 'ok');
      if (!(await confirmBox('Скачать с официальных сайтов', miss.map((r) => '• ' + r.name).join('\n') + '\n\nНужен интернет.', 'Скачать'))) return;
      toast('Скачиваю… ход виден в журнале');
      const res = await call('updates:fetch');
      await infoBox('Результат', res.join('\n'));
      await loadTools(true);
      S.inst = null;
      if (S.page === 'install') renderPage();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function installSelected() {
    const sel = S.inst.filter((i) => S.instSel.has(i.path) && i.ok64);
    if (!sel.length) return toast('Ничего не отмечено', 'warn');
    if (!(await confirmBox('Установка на этот ПК', sel.map((i) => '• ' + i.name).join('\n') + '\n\nУстановка пройдёт автоматически.', 'Установить'))) return;
    S.instBusy = true;
    sel.forEach((i) => { S.instStatus[i.path] = { cls: '', text: 'в очереди' }; });
    renderPage();
    for (const i of sel) {
      S.instStatus[i.path] = { cls: 'run', text: 'устанавливается…' }; renderPage();
      let r;
      try { r = await call('install:run', i.path); } catch (e) { r = { ok: false, msg: e.message }; }
      if (r.change) syncChanges();
      S.instStatus[i.path] = r.ok ? { cls: 'ok', text: '✔ готово' } : { cls: 'err', text: '✖ ошибка' };
      renderPage();
    }
    S.instBusy = false;
    renderPage();
    addLog('Базовый набор: готово');
    toast('Базовый набор: готово', 'ok');
  }

  // ---------- страницы с действиями (windows / плюшки / сеть)
  function pageActions(page) {
    for (const [title, items] of ACT[S.page]) {
      page.append(el('div', { class: 'sec-title' }, title), el('div', { class: 'acts' }, items.map((a) =>
        el('div', { class: 'act ' + (a.k || ''), onclick: () => runAct(a) },
          el('div', { class: 'aic' }, icon(a.i, 20)),
          el('div', {}, el('div', { class: 'at' }, a.t), el('div', { class: 'ad' }, a.d)),
          a.todo ? el('span', { class: 'soon' }, 'скоро') : null))));
    }
    if (S.page !== 'tweaks') page.append(el('div', { class: 'card console' + (S.out ? '' : ' empty'), id: 'console' }, S.out || 'Здесь появится результат команды.'));
    else page.append(el('div', { class: 'hint' }, 'Все изменения записываются в журнал и показываются при выходе.'));
  }

  async function runAct(a) {
    try {
      let args = a.args;
      if (a.form === 'key') {
        const v = await formBox('Ключ продукта Windows', [{ name: 'key', label: 'Ключ (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX' }],
          'Активировать', 'Ключ будет установлен и запущена онлайн-активация.');
        if (!v) return;
        args = { key: v.key };
      } else if (a.form === 'autologon') {
        const v = await formBox('Автовход в Windows', [
          { name: 'domain', label: 'Домен или имя ПК', value: S.init.session.pc },
          { name: 'user', label: 'Пользователь', value: S.init.session.user },
          { name: 'password', label: 'Пароль', type: 'password' }], 'Применить',
        'Пароль хранится в реестре открытым текстом. Для рабочих ПК лучше Sysinternals Autologon (шифрует пароль).');
        if (!v) return;
        args = v;
      }
      if (a.confirm && !(await confirmBox(a.t, a.confirm, 'Выполнить'))) return;
      const c0 = $('#console');
      if (c0 && a.busy) { c0.textContent = a.busy; c0.classList.remove('empty'); }
      const r = await call('action:run', a.id, args);
      if (r.change) syncChanges();
      S.out = r.text || '';
      const c = $('#console');
      if (c) { c.textContent = S.out || 'Готово.'; c.classList.toggle('empty', !S.out); } else toast(r.text || 'Готово', 'ok');
      if (!c && r.text && r.text.length > 90) infoBox(a.t, r.text);
      addLog(`${a.t}: выполнено`);
    } catch (e) { toast(e.message, 'err'); addLog(`${a.t}: ${e.message}`, true); }
  }

  // ---------- о программе
  function pageAbout(page) {
    const p = S.init.paths;
    const dir = (label, path, key) => [el('div', { class: 'k' }, label), el('div', { class: 'v' }, el('a', { onclick: () => openDir(key) }, path))];
    page.append(
      el('div', { class: 'profile' }, el('div', { class: 'banner' }),
        el('div', { class: 'body' }, el('div', { class: 'avatar' }, el('i', {}, '>_')),
          el('div', {}, el('h2', {}, S.init.author.nick),
            el('div', { class: 'sub' }, `${S.init.author.name} · ${S.init.app}`)))),
      el('div', { class: 'card sel' }, el('div', { class: 'kv' },
        el('div', { class: 'k' }, 'Версия'), el('div', { class: 'v' }, S.init.version),
        el('div', { class: 'k' }, 'Дата сборки'), el('div', { class: 'v' }, S.init.buildDate ? fmtBuild(S.init.buildDate) : 'запуск из исходников (программа не упакована)'),
        el('div', { class: 'k' }, 'Движок'), el('div', { class: 'v' }, `Electron ${S.init.versions.electron} · Chromium ${S.init.versions.chrome} · Node.js ${S.init.versions.node}`),
        el('div', { class: 'k' }, 'Права'), el('div', { class: 'v' }, S.init.session.admin ? 'администратор' : 'обычный пользователь (часть функций недоступна)'),
        ...dir('Папка программы', p.exe, 'exe'), ...dir('Папка Tools', p.tools, 'tools'), ...dir('Отчёты', p.reports, 'reports'),
        el('div', { class: 'k' }, 'Как добавить утилиту'),
        el('div', { class: 'v' }, 'Положите файл в Tools (можно в подпапку) и нажмите «Обновить список» на вкладке «утилиты». Название и группу можно задать в tools.json.'),
        el('div', { class: 'k' }, 'Этот ПК'), el('div', { class: 'v' }, `${S.init.session.cpu} · ${S.init.session.ramGb} ГБ ОЗУ`))));
  }

  // ---------- запуск
  async function boot() {
    api.onLog((m) => addLog(m));
    api.onAskExit(exitFlow);
    api.onLive((d) => { S.live = d; applyLive(); });
    S.init = await api.invoke('init');
    if (S.init.error) { document.body.textContent = 'Ошибка запуска: ' + S.init.error; return; }
    try { const st = await call('settings:get'); S.view = st.toolsView === 'list' ? 'list' : 'tiles'; } catch (_) { /* настройки не обязательны */ }
    $('#tb-pc').textContent = S.init.session.pc;
    renderRail(); renderSide(); renderHead();
    addLog(`Готово. Права администратора: ${S.init.session.admin ? 'да' : 'НЕТ (часть функций недоступна)'}`);
    setInterval(() => {
      const t = $('#vtimer'); if (!t) return;
      const s = Math.floor((Date.now() - S.t0) / 1000);
      t.textContent = `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
    }, 1000);
    const qs = new URLSearchParams(location.search);
    if (qs.get('group')) S.group = qs.get('group');          // для проверки внешнего вида: открыть сразу нужную группу
    const wanted = qs.get('page');
    if (qs.get('tab') && S.init.dev) S.tab = qs.get('tab');   // только для разработки: сразу открыть вкладку подробностей
    if (qs.get('view') && S.init.dev) S.view = qs.get('view');
    show(wanted && PAGES.some((p) => p.key === wanted) ? wanted : 'diag');
    loadTools();
    if (S.init.adminPrompt) setTimeout(adminPrompt, 600);
    // только для разработки (--act id): сразу открыть окно действия, чтобы проверить его внешний вид
    const actId = qs.get('act');
    if (actId && S.init.dev) {
      const a = Object.values(ACT).flat().flatMap(([, items]) => items).find((x) => x.id === actId);
      if (a) setTimeout(() => runAct(a), 500);
    }
  }
  boot();
})();
