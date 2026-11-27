/*
 * Рисунки: картинка (PNG/JPG) → линии для плоттера.
 *   1) тёмные пиксели (линии) отделяем от фона и светлой заливки;
 *   2) утончаем до средней линии в 1 пиксель (Чжан–Суэн);
 *   3) прослеживаем средние линии в ломаные и упрощаем (Рамер–Дуглас–Пекер).
 * Каждая линия рисунка проводится ручкой один раз.
 * Хранение: в памяти (Map) и в IndexedDB, чтобы рисунки пережили перезапуск.
 * В тексте рисунок — строка «[рисунок: id; ширина 60]».
 */
(function (root) {
  'use strict';
  const store = new Map();   // id → { w, h, paths: [[x,y,x,y,...], ...] }  (пиксели, y вниз)

  // ---------- растровая обработка ----------
  function toInk(data, w, h, thr) {
    const ink = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      const a = data[p + 3] / 255;
      const lum = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) * a + 255 * (1 - a);
      ink[i] = lum < thr ? 1 : 0;
    }
    return ink;
  }

  /** Утончение Чжана–Суэна: оставляет середину линии толщиной 1 пиксель */
  function thin(img, w, h) {
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : img[y * w + x];
    let changed = true;
    const del = [];
    for (let iter = 0; changed && iter < 100; iter++) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        del.length = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (!img[y * w + x]) continue;
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1),
            p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let A = 0; for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++;
          if (A !== 1) continue;
          if (step === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
          del.push(y * w + x);
        }
        if (del.length) { changed = true; for (const i of del) img[i] = 0; }
      }
    }
    // убираем «ступеньки» (угловой пиксель, без которого линия остаётся связной по диагонали)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!img[y * w + x]) continue;
      const N = at(x, y - 1), S = at(x, y + 1), E = at(x + 1, y), W = at(x - 1, y);
      if ((N && E && !S && !W && !at(x - 1, y + 1)) || (N && W && !S && !E && !at(x + 1, y + 1)) ||
          (S && E && !N && !W && !at(x - 1, y - 1)) || (S && W && !N && !E && !at(x + 1, y - 1))) img[y * w + x] = 0;
    }
    return img;
  }

  const NB = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  /** Прослеживание средних линий в ломаные */
  function trace(sk, w, h) {
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && sk[y * w + x] === 1;
    const deg = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!sk[y * w + x]) continue;
      let d = 0; for (const [dx, dy] of NB) if (on(x + dx, y + dy)) d++;
      deg[y * w + x] = d;
    }
    const usedEdge = new Set();
    const ek = (a, b) => a < b ? a * 4194304 + b : b * 4194304 + a;
    const paths = [];
    const walk = (sx, sy, nx, ny) => {
      const pts = [sx, sy];
      let px = sx, py = sy, cx = nx, cy = ny;
      usedEdge.add(ek(py * w + px, cy * w + cx));
      for (let guard = 0; guard < w * h; guard++) {
        pts.push(cx, cy);
        if (deg[cy * w + cx] !== 2) break;
        let moved = false;
        for (const [dx, dy] of NB) {
          const qx = cx + dx, qy = cy + dy;
          if (!on(qx, qy) || (qx === px && qy === py)) continue;
          const e = ek(cy * w + cx, qy * w + qx);
          if (usedEdge.has(e)) continue;
          usedEdge.add(e);
          px = cx; py = cy; cx = qx; cy = qy; moved = true; break;
        }
        if (!moved || (cx === sx && cy === sy)) { if (moved) pts.push(cx, cy); break; }
      }
      paths.push(pts);
    };
    // от концов и развилок
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!sk[i] || deg[i] === 2) continue;
      if (deg[i] === 0) { paths.push([x, y, x + 0.5, y]); continue; }   // отдельная точка
      for (const [dx, dy] of NB) {
        const qx = x + dx, qy = y + dy;
        if (on(qx, qy) && !usedEdge.has(ek(i, qy * w + qx))) walk(x, y, qx, qy);
      }
    }
    // замкнутые контуры (окружности, эллипсы) без концов
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!sk[i] || deg[i] !== 2) continue;
      for (const [dx, dy] of NB) {
        const qx = x + dx, qy = y + dy;
        if (on(qx, qy) && !usedEdge.has(ek(i, qy * w + qx))) { walk(x, y, qx, qy); break; }
      }
    }
    return paths;
  }

  /** Упрощение ломаной (Рамер–Дуглас–Пекер) */
  function simplify(flat, eps) {
    const n = flat.length / 2;
    if (n < 3) return flat;
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const ax = flat[2 * a], ay = flat[2 * a + 1], bx = flat[2 * b], by = flat[2 * b + 1];
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      let md = 0, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs(dy * (flat[2 * i] - ax) - dx * (flat[2 * i + 1] - ay)) / L;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[2 * i], flat[2 * i + 1]);
    return out;
  }

  /** Склеивает куски, у которых конец одного совпадает с началом другого (меньше подъёмов ручки) */
  function joinPaths(paths) {
    const key = (x, y) => Math.round(x) + ',' + Math.round(y);
    let merged = true;
    while (merged) {
      merged = false;
      const ends = new Map();
      paths.forEach((p, i) => {
        if (!p) return;
        for (const [x, y, side] of [[p[0], p[1], 0], [p[p.length - 2], p[p.length - 1], 1]]) {
          const k = key(x, y);
          if (!ends.has(k)) ends.set(k, []);
          ends.get(k).push([i, side]);
        }
      });
      for (const list of ends.values()) {
        if (list.length !== 2 || list[0][0] === list[1][0]) continue;
        const [[i, si], [j, sj]] = list;
        if (!paths[i] || !paths[j]) continue;
        let a = paths[i], b = paths[j];
        if (si === 0) a = rev(a);          // конец a — в точке стыка
        if (sj === 1) b = rev(b);          // начало b — в точке стыка
        paths[i] = a.concat(b.slice(2)); paths[j] = null; merged = true;
      }
      paths = paths.filter(Boolean);
    }
    return paths;
  }
  const rev = f => { const o = []; for (let i = f.length - 2; i >= 0; i -= 2) o.push(f[i], f[i + 1]); return o; };

  /** Картинка (байты PNG/JPG) → линии */
  async function vectorize(bytes, opts = {}) {
    const bmp = await createImageBitmap(new Blob([bytes]));
    let w = bmp.width, h = bmp.height;
    const maxDim = opts.maxDim || 1000;
    const sc = Math.min(1, maxDim / Math.max(w, h));
    w = Math.max(1, Math.round(w * sc)); h = Math.max(1, Math.round(h * sc));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const ink = toInk(data, w, h, opts.threshold || 170);
    const sk = thin(ink, w, h);
    let paths = trace(sk, w, h);
    paths = joinPaths(paths).map(p => simplify(p, opts.eps || 0.8)).filter(p => p.length >= 4);
    return { w, h, paths };
  }

  // ---------- хранилище ----------
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('plotterImages', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('images', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  async function save(id, img) {
    try {
      const d = await db();
      await new Promise((res, rej) => { const t = d.transaction('images', 'readwrite'); t.objectStore('images').put(Object.assign({ id }, img)); t.oncomplete = res; t.onerror = () => rej(t.error); });
    } catch (e) { console.warn('рисунок не сохранился', e); }
  }
  async function loadAll() {
    try {
      const d = await db();
      const all = await new Promise((res, rej) => { const t = d.transaction('images', 'readonly'); const r = t.objectStore('images').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      for (const im of all) store.set(im.id, { w: im.w, h: im.h, paths: im.paths });
      return all.length;
    } catch (e) { console.warn('хранилище рисунков недоступно', e); return 0; }
  }

  /** Короткий идентификатор по содержимому файла */
  function hashId(bytes) {
    let h1 = 0x811c9dc5, h2 = 0x1b873593;
    for (let i = 0; i < bytes.length; i++) { h1 = Math.imul(h1 ^ bytes[i], 16777619); h2 = Math.imul(h2 ^ bytes[i], 2246822519); }
    return 'img' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36).slice(0, 3);
  }

  /** Добавить картинку: превратить в линии, запомнить, вернуть id */
  async function add(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const id = hashId(u8);
    if (!store.has(id)) {
      const img = await vectorize(u8);
      store.set(id, img);
      await save(id, img);
    }
    return id;
  }

  /**
   * Рисунок для вёрстки: линии в миллиметрах, y вверх, низ рисунка — 0.
   * Возвращает {w, h, strokes} или null, если рисунка нет.
   */
  function strokesMM(id, widthMM) {
    const im = store.get(id);
    if (!im) return null;
    const s = widthMM / im.w, H = im.h * s;
    const strokes = im.paths.map(p => { const o = []; for (let i = 0; i < p.length; i += 2) o.push([p[i] * s, H - p[i + 1] * s]); return o; });
    return { w: widthMM, h: H, strokes };
  }

  root.PlotImages = { add, vectorize, strokesMM, loadAll, has: id => store.has(id), info: id => store.get(id) };
})(typeof window !== 'undefined' ? window : globalThis);
