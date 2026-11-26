/*
 * Генерация G-code из штрихов страницы.
 */
(function (root) {
  'use strict';

  /** Удаляет почти совпадающие соседние точки */
  function simplify(stroke, minSeg) {
    if (stroke.length < 2) return stroke.slice();
    const out = [stroke[0]];
    for (let i = 1; i < stroke.length; i++) {
      const p = stroke[i], q = out[out.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= minSeg || i === stroke.length - 1) out.push(p);
    }
    if (out.length === 2 && Math.hypot(out[0][0] - out[1][0], out[0][1] - out[1][1]) < 1e-9) out[1] = [out[1][0] + minSeg * 0.5, out[1][1]];
    return out;
  }

  /** Жадная оптимизация порядка штрихов (ближайший сосед, с разворотом штриха) */
  function optimizeOrder(strokes, start) {
    const left = strokes.slice();
    const res = [];
    let cur = start || [0, 0];
    while (left.length) {
      let best = 0, bestD = Infinity, rev = false;
      for (let i = 0; i < left.length; i++) {
        const s = left[i];
        const a = s[0], b = s[s.length - 1];
        const da = (a[0] - cur[0]) ** 2 + (a[1] - cur[1]) ** 2;
        if (da < bestD) { bestD = da; best = i; rev = false; }
        const db = (b[0] - cur[0]) ** 2 + (b[1] - cur[1]) ** 2;
        if (db < bestD) { bestD = db; best = i; rev = true; }
        if (bestD === 0) break;
      }
      let s = left.splice(best, 1)[0];
      if (rev) s = s.slice().reverse();
      res.push(s);
      cur = s[s.length - 1];
    }
    return res;
  }

  /**
   * Перевод координат страницы (мм, Y вниз от верхнего края) в координаты станка.
   * cfg: pageW, pageH, offsetX, offsetY, rotation (0/90/180/270), mirrorX, mirrorY
   * offsetX/offsetY — где на столе находится левый нижний угол (по габариту) тетради.
   */
  function makeTransform(cfg) {
    const W = cfg.pageW, H = cfg.pageH;
    const r = ((cfg.rotation || 0) % 360 + 360) % 360;
    const rot = (u, v) => {
      switch (r) {
        case 90: return [-v, u];
        case 180: return [-u, -v];
        case 270: return [v, -u];
        default: return [u, v];
      }
    };
    const corners = [[0, 0], [W, 0], [W, H], [0, H]].map(([u, v]) => rot(u, v));
    const minX = Math.min(...corners.map(c => c[0])), minY = Math.min(...corners.map(c => c[1]));
    const bw = Math.max(...corners.map(c => c[0])) - minX;
    const bh = Math.max(...corners.map(c => c[1])) - minY;
    const fn = ([x, y]) => {
      const [rx, ry] = rot(x, H - y);
      let X = rx - minX, Y = ry - minY;
      if (cfg.mirrorX) X = bw - X;
      if (cfg.mirrorY) Y = bh - Y;
      return [X + (+cfg.offsetX || 0), Y + (+cfg.offsetY || 0)];
    };
    fn.bboxW = bw; fn.bboxH = bh;
    return fn;
  }

  function lines(txt) {
    return (txt || '').split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.length);
  }

  /**
   * Строит G-code для одной страницы.
   * Возвращает {code:[строки], stats:{draw, travel, lifts, time}, machineStrokes}
   */
  function pageGcode(page, cfg, pageNo, totalPages) {
    const tf = makeTransform(cfg);
    const d = Math.max(0, Math.min(5, cfg.decimals ?? 2));
    const f = v => (+v.toFixed(d)).toString();
    const minSeg = cfg.minSegment || 0.05;

    let strokes = page.strokes.map(s => simplify(s.map(tf), minSeg)).filter(s => s.length >= 2);
    if (cfg.optimize) strokes = optimizeOrder(strokes, [+cfg.offsetX || 0, +cfg.offsetY || 0]);

    const out = [];
    const sub = t => t.replace(/\{page\}/g, pageNo).replace(/\{pages\}/g, totalPages);
    out.push(`; --- Страница ${pageNo} из ${totalPages} ---`);
    let pos = null, down = false;
    let draw = 0, travel = 0, lifts = 0;
    const travelCmd = cfg.travelG0 ? 'G0' : 'G1';
    const penUp = lines(sub(cfg.penUp)), penDown = lines(sub(cfg.penDown));

    // Поднимаем ручку в начале страницы
    out.push(...penUp);
    for (const s of strokes) {
      const a = s[0];
      const gap = pos ? Math.hypot(a[0] - pos[0], a[1] - pos[1]) : Infinity;
      let needF = false;
      if (down && gap <= (cfg.joinDistance || 0)) {
        // следующий штрих начинается рядом — рисуем, не поднимая ручку
        if (gap > 0) { draw += gap; out.push(`G1 X${f(a[0])} Y${f(a[1])}`); }
      } else {
        if (down) { out.push(...penUp); down = false; }
        if (pos) travel += gap;
        out.push(`${travelCmd} X${f(a[0])} Y${f(a[1])}${cfg.travelG0 ? '' : ' F' + cfg.feedTravel}`);
        out.push(...penDown); down = true; lifts++;
        needF = true;
      }
      for (let i = 1; i < s.length; i++) {
        const p = s[i];
        draw += Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]);
        out.push(`G1 X${f(p[0])} Y${f(p[1])}${needF ? ' F' + cfg.feedDraw : ''}`);
        needF = false;
      }
      pos = s[s.length - 1];
    }
    if (down) out.push(...penUp);

    const time = draw / Math.max(1, cfg.feedDraw) + travel / Math.max(1, cfg.feedTravel) + lifts * 2 * (cfg.penDelay || 0) / 60;
    return { code: out, stats: { draw, travel, lifts, time, strokes: strokes.length }, machineStrokes: strokes };
  }

  /** Полная программа: несколько страниц с паузами между ними */
  function program(pages, cfg, which) {
    const total = pages.length;
    const list = which == null ? pages.map((p, i) => i) : [which];
    const out = [];
    const hdr = t => lines(t.replace(/\{pages\}/g, total).replace(/\{page\}/g, list.length === 1 ? list[0] + 1 : 1));
    out.push('; Сгенерировано: Плоттер-конспект (формулы в G-code)');
    out.push(`; Лист ${cfg.pageW}x${cfg.pageH} мм, смещение X${cfg.offsetX} Y${cfg.offsetY}, поворот ${cfg.rotation}°`);
    out.push(...hdr(cfg.header));
    const stats = { draw: 0, travel: 0, lifts: 0, time: 0, strokes: 0 };
    list.forEach((idx, k) => {
      const r = pageGcode(pages[idx], cfg, idx + 1, total);
      out.push(...r.code);
      for (const key in stats) stats[key] += r.stats[key];
      if (k < list.length - 1) {
        out.push(...lines((cfg.betweenPages || '').replace(/\{page\}/g, idx + 1).replace(/\{next\}/g, idx + 2).replace(/\{pages\}/g, total)));
      }
    });
    out.push(...hdr(cfg.footer));
    return { text: out.join('\n') + '\n', stats };
  }

  root.PlotGcode = { pageGcode, program, makeTransform, simplify, optimizeOrder };
})(typeof window !== 'undefined' ? window : globalThis);
