'use strict';
// Каталог известных утилит (выгружен из catalog.py): имя файла (начало) → название и группа.
const data = require('../data/catalog.json');

const OTHER = 'Прочее';

function lookup(filename) {
  const dot = filename.lastIndexOf('.');
  const stemRaw = dot > 0 ? filename.slice(0, dot) : filename;
  const stem = stemRaw.toLowerCase();
  let best = null;
  for (const [key, title, group] of data.catalog) {
    if (stem.startsWith(key) && (!best || key.length > best.key.length)) best = { key, title, group };
  }
  return best ? [best.title, best.group] : [stemRaw, OTHER];
}

module.exports = { lookup, groups: data.groups, apps: data.apps, OTHER };
