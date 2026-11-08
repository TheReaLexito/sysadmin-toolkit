'use strict';
// Загрузка файлов и страниц (с перенаправлениями). Проверка сертификатов НЕ отключается.
const https = require('https');
const http = require('http');
const fs = require('fs');

const UA = 'Mozilla/5.0 SysAdminToolkit';

function request(url, { timeout = 60000, headers = {} } = {}, onRes, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': UA, ...headers }, timeout }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= 6) return reject(new Error('слишком много перенаправлений'));
        return resolve(request(new URL(res.headers.location, url).href, { timeout, headers }, onRes, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      onRes(res, resolve, reject);
    });
    req.on('timeout', () => req.destroy(new Error('таймаут соединения')));
    req.on('error', reject);
  });
}

function text(url, opts) {
  return request(url, opts, (res, resolve, reject) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    res.on('error', reject);
  });
}

function download(url, dst, opts) {
  const tmp = dst + '.part';
  return request(url, opts, (res, resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    res.pipe(out);
    out.on('finish', () => out.close(() => {
      try {
        if (fs.statSync(tmp).size < 1024) throw new Error('пустой ответ сервера');
        fs.renameSync(tmp, dst);
        resolve(dst);
      } catch (e) { try { fs.unlinkSync(tmp); } catch (_) { /* */ } reject(e); }
    }));
    out.on('error', reject);
    res.on('error', (e) => { out.destroy(); try { fs.unlinkSync(tmp); } catch (_) { /* */ } reject(e); });
  });
}

module.exports = { text, download };
