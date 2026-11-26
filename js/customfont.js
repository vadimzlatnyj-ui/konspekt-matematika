/*
 * Загрузка своих шрифтов.
 *   Однолинейные (для плоттера идеальны): Hershey .jhf, SVG-шрифты (.svg — Hershey Text, EMS), наш JSON.
 *   Обычные TTF / OTF / WOFF — рисуются по контуру букв (нужен js/vendor/opentype.min.js).
 * Формат определяется по содержимому, поэтому расширение может быть любым (.font и т.п.).
 * Все шрифты приводятся к единицам встроенного шрифта: базовая линия 0, высота заглавных 9, ось Y вверх.
 */
(function (root) {
  'use strict';
  const CAP = 9;

  // ---------- SVG path → ломаные ----------
  function flattenPath(d, tol = 0.5) {
    const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
    const polys = [];
    let cur = null, x = 0, y = 0, sx = 0, sy = 0, cmd = '', i = 0, lcx = 0, lcy = 0, lqx = 0, lqy = 0, prev = '';
    const num = () => parseFloat(toks[i++]);
    const start = (px, py) => { cur = [[px, py]]; polys.push(cur); };
    const line = (px, py) => { if (!cur) start(x, y); cur.push([px, py]); };
    const steps = (x0, y0, pts) => {
      let L = 0; let p = [x0, y0];
      for (const q of pts) { L += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; }
      return Math.max(2, Math.min(64, Math.ceil(L / tol / 4)));
    };
    const cubic = (x1, y1, x2, y2, x3, y3) => {
      const n = steps(x, y, [[x1, y1], [x2, y2], [x3, y3]]);
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        line(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
    };
    const quad = (x1, y1, x2, y2) => {
      const n = steps(x, y, [[x1, y1], [x2, y2]]);
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        line(u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2);
      }
    };
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      else if (!cmd) { i++; continue; }
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      switch (C) {
        case 'M': { const px = num() + ox, py = num() + oy; x = sx = px; y = sy = py; start(x, y); cmd = rel ? 'l' : 'L'; break; }
        case 'L': { const px = num() + ox, py = num() + oy; line(px, py); x = px; y = py; break; }
        case 'H': { const px = num() + ox; line(px, y); x = px; break; }
        case 'V': { const py = num() + oy; line(x, py); y = py; break; }
        case 'C': {
          const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
          cubic(x1, y1, x2, y2, x3, y3); lcx = x2; lcy = y2; x = x3; y = y3; break;
        }
        case 'S': {
          const x1 = /[CS]/.test(prev) ? 2 * x - lcx : x, y1 = /[CS]/.test(prev) ? 2 * y - lcy : y;
          const x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
          cubic(x1, y1, x2, y2, x3, y3); lcx = x2; lcy = y2; x = x3; y = y3; break;
        }
        case 'Q': {
          const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy;
          quad(x1, y1, x2, y2); lqx = x1; lqy = y1; x = x2; y = y2; break;
        }
        case 'T': {
          const x1 = /[QT]/.test(prev) ? 2 * x - lqx : x, y1 = /[QT]/.test(prev) ? 2 * y - lqy : y;
          const x2 = num() + ox, y2 = num() + oy;
          quad(x1, y1, x2, y2); lqx = x1; lqy = y1; x = x2; y = y2; break;
        }
        case 'A': { // дуги в шрифтах редки — заменяем отрезком
          num(); num(); num(); num(); num();
          const px = num() + ox, py = num() + oy; line(px, py); x = px; y = py; break;
        }
        case 'Z': { if (cur && cur.length) line(sx, sy); x = sx; y = sy; cur = null; break; }
        default: i++;
      }
      prev = C;
    }
    return polys.filter(p => p.length > 1);
  }

  /** Перевод ломаных шрифта в глиф встроенного формата */
  function makeGlyph(polys, adv, scale, flipY, baseY, x0) {
    const strokes = polys.map(p => p.map(([px, py]) => [(px - x0) * scale, (flipY ? baseY - py : py - baseY) * scale]));
    let asc = 0, desc = 0;
    for (const s of strokes) for (const [, yy] of s) { asc = Math.max(asc, yy); desc = Math.max(desc, -yy); }
    return { w: Math.max(0.5, adv * scale - 1), strokes, asc, desc };
  }

  // ---------- Hershey .jhf ----------
  function parseJHF(text) {
    const glyphs = new Map();
    let i = 0, code = 32;
    const s = text.replace(/\r/g, '');
    while (i < s.length) {
      while (i < s.length && s[i] === '\n') i++;
      if (i >= s.length) break;
      const n = parseInt(s.substr(i + 5, 3), 10);
      if (!(n > 0)) { const nl = s.indexOf('\n', i); i = nl < 0 ? s.length : nl + 1; continue; }
      i += 8;
      let data = '';
      while (data.length < n * 2 && i < s.length) { if (s[i] !== '\n') data += s[i]; i++; }
      const v = k => data.charCodeAt(k) - 82;
      const left = v(0), right = v(1);
      const polys = []; let cur = null;
      for (let k = 2; k + 1 < data.length; k += 2) {
        if (data[k] === ' ' && data[k + 1] === 'R') { cur = null; continue; }
        if (!cur) { cur = []; polys.push(cur); }
        cur.push([v(k), v(k + 1)]);
      }
      const scale = CAP / 21; // у Hershey заглавные от −12 до 9
      glyphs.set(String.fromCharCode(code), makeGlyph(polys.filter(p => p.length > 1), right - left, scale, true, 9, left));
      code++;
    }
    if (glyphs.size < 10) throw new Error('не похоже на шрифт Hershey (.jhf)');
    return { kind: 'single', get: ch => glyphs.get(ch) || null, count: glyphs.size };
  }

  // ---------- SVG-шрифт ----------
  function parseSVGFont(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const font = doc.querySelector('font');
    if (!font) throw new Error('в SVG нет шрифта (<font>)');
    const face = doc.querySelector('font-face');
    const upm = +(face && face.getAttribute('units-per-em')) || 1000;
    const defAdv = +font.getAttribute('horiz-adv-x') || upm / 2;
    const raw = new Map();
    for (const g of doc.querySelectorAll('glyph')) {
      const u = g.getAttribute('unicode');
      if (!u || Array.from(u).length !== 1) continue;
      raw.set(u, { d: g.getAttribute('d') || '', adv: +g.getAttribute('horiz-adv-x') || defAdv });
    }
    if (!raw.size) throw new Error('в SVG-шрифте нет букв');
    let cap = +(face && face.getAttribute('cap-height'));
    if (!cap) {
      const h = raw.get('H') || raw.get('Н') || raw.get('I');
      if (h) { const ys = flattenPath(h.d, upm / 200).flat().map(p => p[1]); cap = Math.max(...ys); }
    }
    if (!(cap > 0)) cap = upm * 0.7;
    const scale = CAP / cap;
    const cache = new Map();
    // кривые однолинейных шрифтов часто — открытые линии; контуры TTF-подобных SVG — замкнутые
    return {
      kind: 'single',
      count: raw.size,
      get(ch) {
        if (cache.has(ch)) return cache.get(ch);
        const r = raw.get(ch);
        const g = r ? makeGlyph(flattenPath(r.d, upm / 400), r.adv, scale, false, 0, 0) : null;
        cache.set(ch, g);
        return g;
      },
    };
  }

  // ---------- TTF / OTF / WOFF ----------
  function parseOpenType(buf) {
    if (!root.opentype) throw new Error('модуль чтения TTF/OTF не загружен');
    const f = root.opentype.parse(buf);
    const upm = f.unitsPerEm || 1000;
    let cap = f.tables.os2 && f.tables.os2.sCapHeight;
    if (!cap) { const h = f.charToGlyph('H'); const bb = h && h.getBoundingBox(); cap = bb ? bb.y2 : upm * 0.7; }
    if (!(cap > 0)) cap = upm * 0.7;
    const scale = CAP / cap;
    const cache = new Map();
    const toD = cmds => cmds.map(c => c.type === 'Z' ? 'Z' : c.type + ' ' +
      (c.type === 'C' ? `${c.x1} ${c.y1} ${c.x2} ${c.y2} ` : c.type === 'Q' ? `${c.x1} ${c.y1} ` : '') + `${c.x} ${c.y}`).join(' ');
    return {
      kind: 'outline',
      count: f.numGlyphs,
      family: (f.names && f.names.fontFamily && (f.names.fontFamily.ru || f.names.fontFamily.en)) || '',
      get(ch) {
        if (cache.has(ch)) return cache.get(ch);
        const gl = f.charToGlyph(ch);
        let g = null;
        if (gl && gl.index !== 0) g = makeGlyph(flattenPath(toD(gl.path.commands), upm / 300), gl.advanceWidth, scale, false, 0, 0);
        cache.set(ch, g);
        return g;
      },
    };
  }

  // ---------- наш JSON: {"glyphs": {"А": [ширина, "x,y x,y|x,y ..."]}} ----------
  function parseJSON(text) {
    const o = JSON.parse(text);
    const table = o.glyphs || o;
    const glyphs = new Map();
    for (const [ch, v] of Object.entries(table)) {
      if (!Array.isArray(v)) continue;
      const strokes = String(v[1] || '').split('|').map(s => s.trim().split(/\s+/).filter(Boolean).map(p => p.split(',').map(Number))).filter(s => s.length > 1);
      let asc = 0, desc = 0;
      for (const s of strokes) for (const [, yy] of s) { asc = Math.max(asc, yy); desc = Math.max(desc, -yy); }
      glyphs.set(ch, { w: +v[0] || 5, strokes, asc, desc });
    }
    if (!glyphs.size) throw new Error('в JSON нет букв');
    return { kind: 'single', get: ch => glyphs.get(ch) || null, count: glyphs.size };
  }

  /** Загружает шрифт из содержимого файла (ArrayBuffer) */
  function load(name, buf) {
    const b = new Uint8Array(buf.slice(0, 4));
    const tag = String.fromCharCode(...b);
    let font;
    if (tag === '\x00\x01\x00\x00' || tag === 'OTTO' || tag === 'true' || tag === 'wOFF') font = parseOpenType(buf);
    else if (tag === 'wOF2') throw new Error('WOFF2 не поддерживается — сохраните шрифт как TTF или OTF');
    else {
      const text = new TextDecoder().decode(buf).replace(/^﻿/, '');
      const t = text.trimStart();
      if (t[0] === '{') font = parseJSON(text);
      else if (t[0] === '<') font = parseSVGFont(text);
      else if (/^\s*\d{1,5}\s*\d{1,3}[A-Za-z\[\]\\^_`]/.test(text)) font = parseJHF(text);
      else throw new Error('неизвестный формат шрифта (поддерживаются .ttf .otf .woff .svg .jhf .json)');
    }
    font.name = name;
    return font;
  }

  root.PlotCustomFont = { load, flattenPath };
})(typeof window !== 'undefined' ? window : globalThis);
