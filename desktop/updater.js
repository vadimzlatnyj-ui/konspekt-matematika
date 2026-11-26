/*
 * Самообновление интерфейса: файлы (index.html, css, js) скачиваются с GitHub
 * в папку пользователя и проверяются по контрольным суммам из version.json.
 * Сама оболочка (exe) не меняется — только интерфейс.
 */
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = process.env.PLOTTER_UPDATE_URL ||
  'https://raw.githubusercontent.com/vadimzlatnyj-ui/konspekt-matematika/HEAD/';
const bundledDir = path.join(__dirname, '..');
const webDir = () => path.join(app.getPath('userData'), 'web');
const tmpDir = () => path.join(app.getPath('userData'), 'web-new');

function readVersion(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')); } catch (e) { return null; }
}
const safePath = p => typeof p === 'string' && /^[\w\-./]+$/.test(p) && !p.split('/').includes('..') && !path.isAbsolute(p);

function complete(dir) {
  const v = readVersion(dir);
  return !!v && Array.isArray(v.files) && v.files.every(f => safePath(f.path) && fs.existsSync(path.join(dir, f.path)));
}

/** Папка, из которой запускать интерфейс: скачанная (если она новее встроенной) или встроенная */
function activeDir() {
  const b = readVersion(bundledDir) || { built: 0 };
  if (complete(webDir())) {
    const u = readVersion(webDir());
    if (u.built > b.built) return webDir();
  }
  return bundledDir;
}

async function get(url, asJson) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await net.fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return asJson ? await r.json() : Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

let busy = false;
/** Проверяет GitHub; если есть новая версия — скачивает её. Возвращает описание новой версии или null. */
async function check(currentDir) {
  if (busy) return null;
  busy = true;
  try {
    const cur = readVersion(currentDir) || { built: 0, version: '' };
    const remote = await get(BASE + 'version.json', true);
    if (!remote || !Array.isArray(remote.files) || !(remote.built > cur.built) || remote.version === cur.version) return null;
    // уже скачана и лежит готовой?
    const have = readVersion(webDir());
    if (have && have.version === remote.version && complete(webDir())) return remote;

    fs.rmSync(tmpDir(), { recursive: true, force: true });
    for (const f of remote.files) {
      if (!safePath(f.path)) throw new Error('недопустимый путь в version.json: ' + f.path);
      // файл не изменился — берём из текущей папки, иначе качаем
      const local = path.join(currentDir, f.path);
      let buf = null;
      if (fs.existsSync(local)) {
        const b = fs.readFileSync(local);
        if (crypto.createHash('sha256').update(b).digest('hex') === f.sha256) buf = b;
      }
      if (!buf) buf = await get(BASE + f.path.split('/').map(encodeURIComponent).join('/'), false);
      if (crypto.createHash('sha256').update(buf).digest('hex') !== f.sha256) throw new Error('контрольная сумма не совпала: ' + f.path);
      const dst = path.join(tmpDir(), f.path);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, buf);
    }
    fs.writeFileSync(path.join(tmpDir(), 'version.json'), JSON.stringify(remote, null, 2));
    // подменяем целиком (старая папка может быть открыта прямо сейчас — тогда переименуем в сторону)
    const old = webDir() + '-old';
    fs.rmSync(old, { recursive: true, force: true });
    if (fs.existsSync(webDir())) fs.renameSync(webDir(), old);
    fs.renameSync(tmpDir(), webDir());
    fs.rmSync(old, { recursive: true, force: true });
    return remote;
  } finally { busy = false; }
}

module.exports = { activeDir, check, readVersion, webDir, bundledDir };
