#!/usr/bin/env node
/*
 * Пишет version.json — список файлов интерфейса с контрольными суммами.
 * Настольная программа сравнивает его с GitHub и сама скачивает новую версию.
 * Запуск: node tools/manifest.js "что изменилось"
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const files = ['index.html', 'css/style.css']
  .concat(fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f))
  .concat(fs.readdirSync(path.join(root, 'js/vendor')).map(f => 'js/vendor/' + f));

const list = files.map(f => {
  const buf = fs.readFileSync(path.join(root, f));
  return { path: f, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
});
const all = crypto.createHash('sha256').update(list.map(f => f.path + f.sha256).join('|')).digest('hex').slice(0, 12);

const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')); } catch (e) { return null; } })();
if (prev && prev.version === all && !process.argv[2]) { console.log('version.json не изменился:', all); process.exit(0); }

const out = {
  version: all,
  built: Date.now(),
  date: new Date().toISOString(),
  notes: process.argv[2] || (prev && prev.version === all ? prev.notes : ''),
  files: list,
};
fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify(out, null, 2) + '\n');
console.log('version.json:', all, list.length, 'файлов');
