'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = ['init', 'tools:list', 'tools:launch', 'tools:copy-all', 'install:list', 'install:run', 'diag:run', 'diag:tab',
  'report:save', 'report:copy', 'dir:open', 'action:run', 'changes', 'icons:get', 'updates:check', 'updates:fetch',
  'app:copy-self', 'app:exit', 'app:relaunch-admin', 'settings:get', 'settings:set', 'live:start', 'live:stop'];

contextBridge.exposeInMainWorld('api', {
  invoke: (ch, ...args) => (INVOKE.includes(ch) ? ipcRenderer.invoke(ch, ...args) : Promise.reject(new Error('канал запрещён: ' + ch))),
  onLog: (cb) => ipcRenderer.on('log', (_e, msg) => cb(msg)),
  onAskExit: (cb) => ipcRenderer.on('ask-exit', () => cb()),
  onLive: (cb) => ipcRenderer.on('live', (_e, d) => cb(d)),
});
