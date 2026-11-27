/*
 * Графики функций для тетради.
 * Синтаксис (одной строкой):
 *   [график: y = x^2 - 2x; x от -3 до 4; y от -2 до 8; точки (1;-1); асимптота x = 2; шаг 1; размер 14x10; слева]
 */
(function (root) {
  'use strict';

  // ================= вычислитель выражений =================
  const FUNCS = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan,
    cot: v => 1 / Math.tan(v), ctg: v => 1 / Math.tan(v),
    arcsin: Math.asin, asin: Math.asin, arccos: Math.acos, acos: Math.acos,
    arctan: Math.atan, arctg: Math.atan, atan: Math.atan,
    arcctg: v => Math.PI / 2 - Math.atan(v), arccot: v => Math.PI / 2 - Math.atan(v),
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sh: Math.sinh, ch: Math.cosh, th: Math.tanh,
    ln: Math.log, lg: Math.log10, log: Math.log10,
    sign: Math.sign, sgn: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  };
  const CONSTS = { pi: Math.PI, e: Math.E };
  const NAMES = Object.keys(FUNCS).concat(Object.keys(CONSTS), ['x']).sort((a, b) => b.length - a.length);

  /** Переводит LaTeX-подобную запись в простую */
  function fromTex(s) {
    s = s.replace(/\\left|\\right|\\[,;!:]|\\quad/g, ' ')
      .replace(/\\cdot|\\times|·|×|⋅/g, '*').replace(/\\div|÷|:/g, '/')
      .replace(/−|–/g, '-').replace(/π/g, 'pi')
      .replace(/²/g, '^2').replace(/³/g, '^3')
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/[хХ]/g, 'x');
    // \frac{a}{b}, \sqrt[n]{a}, \sqrt{a}
    const group = (str, i) => { // str[i] === '{'
      let d = 0;
      for (let j = i; j < str.length; j++) {
        if (str[j] === '{') d++;
        else if (str[j] === '}' && --d === 0) return [str.slice(i + 1, j), j + 1];
      }
      return [str.slice(i + 1), str.length];
    };
    let guard = 0;
    while (/\\[dt]?frac|\\sqrt/.test(s) && guard++ < 100) {
      let m = /\\[dt]?frac\s*\{/.exec(s);
      if (m) {
        const [a, i1] = group(s, m.index + m[0].length - 1);
        const j = s.indexOf('{', i1);
        const [b, i2] = j >= 0 ? group(s, j) : ['1', i1];
        s = s.slice(0, m.index) + '((' + a + ')/(' + b + '))' + s.slice(i2);
        continue;
      }
      m = /\\sqrt\s*(\[([^\]]*)\])?\s*\{/.exec(s);
      if (m) {
        const [a, i1] = group(s, m.index + m[0].length - 1);
        s = s.slice(0, m.index) + (m[2] ? '((' + a + ')^(1/(' + m[2] + ')))' : 'sqrt(' + a + ')') + s.slice(i1);
        continue;
      }
      s = s.replace(/\\[dt]?frac|\\sqrt/, ' ');
    }
    return s.replace(/\\([a-zA-Z]+)/g, ' $1 ').replace(/\{/g, '(').replace(/\}/g, ')').replace(/√/g, 'sqrt');
  }

  function tokenize(src) {
    const s = fromTex(src);
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (num && /[\d.]/.test(c)) { toks.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
      if (/[a-zA-Z]/.test(c)) {
        const rest = s.slice(i);
        const name = NAMES.find(n => rest.startsWith(n));
        if (!name) throw new Error(`непонятное имя «${/^[a-zA-Z]+/.exec(rest)[0]}»`);
        toks.push({ t: 'id', v: name }); i += name.length; continue;
      }
      if ('+-*/^()|,_'.includes(c)) { toks.push({ t: c }); i++; continue; }
      throw new Error(`непонятный символ «${c}»`);
    }
    return toks;
  }

  /** Компилирует выражение от x в функцию */
  function compile(src) {
    const toks = tokenize(src);
    let i = 0;
    const peek = () => toks[i], next = () => toks[i++];
    const expect = t => { if (!peek() || peek().t !== t) throw new Error(`ожидалось «${t}»`); i++; };

    function expr() {
      let a = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = next().t, b = term(), l = a;
        a = op === '+' ? x => l(x) + b(x) : x => l(x) - b(x);
      }
      return a;
    }
    const startsPrimary = t => t && (t.t === 'num' || t.t === 'id' || t.t === '(');
    function term() {
      let a = unary();
      for (;;) {
        const t = peek();
        if (t && (t.t === '*' || t.t === '/')) {
          next(); const b = unary(), l = a;
          a = t.t === '*' ? x => l(x) * b(x) : x => l(x) / b(x);
        } else if (startsPrimary(t)) {
          const b = power(), l = a; a = x => l(x) * b(x);
        } else break;
      }
      return a;
    }
    function unary() {
      const t = peek();
      if (t && t.t === '-') { next(); const a = unary(); return x => -a(x); }
      if (t && t.t === '+') { next(); return unary(); }
      return power();
    }
    function power() {
      const a = primary();
      if (peek() && peek().t === '^') { next(); const b = unary(); return x => Math.pow(a(x), b(x)); }
      return a;
    }
    /** аргумент функции без скобок: sin 2x → sin(2x), до следующей функции */
    function bareArg() {
      let a = power();
      while (startsPrimary(peek()) && !(peek().t === 'id' && FUNCS[peek().v])) { const b = power(), l = a; a = x => l(x) * b(x); }
      return a;
    }
    function primary() {
      const t = next();
      if (!t) throw new Error('выражение оборвалось');
      if (t.t === 'num') { const v = t.v; return () => v; }
      if (t.t === '(') { const a = expr(); expect(')'); return a; }
      if (t.t === '|') { const a = expr(); expect('|'); return x => Math.abs(a(x)); }
      if (t.t === 'id') {
        if (t.v === 'x') return x => x;
        if (CONSTS[t.v] !== undefined) { const v = CONSTS[t.v]; return () => v; }
        const f = FUNCS[t.v];
        let base = null, pw = null;
        if (t.v === 'log' && peek() && peek().t === '_') { next(); base = primary(); }
        if (peek() && peek().t === '^') { next(); pw = primary(); } // sin^2 x
        let arg;
        if (peek() && peek().t === '(') {
          next();
          arg = expr();
          if (t.v === 'log' && peek() && peek().t === ',') { next(); base = arg; arg = expr(); }
          expect(')');
        } else arg = bareArg();
        let g = base ? x => Math.log(arg(x)) / Math.log(base(x)) : x => f(arg(x));
        if (pw) { const h = g; g = x => Math.pow(h(x), pw(x)); }
        return g;
      }
      throw new Error(`неожиданное «${t.t}»`);
    }
    const fn = expr();
    if (i < toks.length) throw new Error(`лишнее «${toks[i].v ?? toks[i].t}»`);
    return fn;
  }

  const num = s => { const v = compile(s)(0); if (!isFinite(v)) throw new Error(`не число: ${s}`); return v; };

  /** Запись функции для подписи (в разметке формул) */
  function texOf(src) {
    if (/\\/.test(src)) return src;
    return src.replace(/(?<![a-zA-Z\\])(arcsin|arccos|arctg|arctan|arcctg|sinh|cosh|tanh|sin|cos|tg|ctg|tan|cot|ln|lg|log|exp|sh|ch|th)(?![a-zA-Z])/g, '\\$1 ')
      .replace(/sqrt\(([^()]*)\)/g, '\\sqrt{$1}').replace(/abs\(([^()]*)\)/g, '|$1|')
      .replace(/(?<![a-zA-Z\\])pi(?![a-zA-Z])/g, '\\pi ').replace(/\*/g, '\\cdot ').replace(/[хХ]/g, 'x');
  }

  // ================= разбор описания графика =================
  function splitTop(s, sep) {
    const parts = []; let d = 0, cur = '';
    for (const c of s) {
      if (c === '(' || c === '[' || c === '{') d++;
      if (c === ')' || c === ']' || c === '}') d--;
      if (c === sep && d <= 0) { parts.push(cur); cur = ''; } else cur += c;
    }
    parts.push(cur);
    return parts.map(p => p.trim()).filter(Boolean);
  }

  function parseSpec(spec) {
    const o = { funcs: [], points: [], asym: [], align: 'center', labels: true, warnings: [] };
    const norm = s => s.replace(/[уУ]/g, 'y').replace(/[хХ]/g, 'x');
    for (let part of splitTop(spec, ';')) {
      const p = norm(part);
      let m;
      try {
        if ((m = /^([xy])\s*(?:от|from|in|∈|:)\s*[\[(]?\s*(.+?)\s*(?:до|to|\.\.|…|,)\s*(.+?)\s*[\])]?$/i.exec(p))) {
          o[m[1].toLowerCase() + 'range'] = [num(m[2]), num(m[3])];
        } else if ((m = /^(.+?)\s*(?:<=|≤|<)\s*([xy])\s*(?:<=|≤|<)\s*(.+)$/.exec(p))) {
          o[m[2] + 'range'] = [num(m[1]), num(m[3])];
        } else if (/^(точк|points?)/i.test(p)) {
          for (const q of p.matchAll(/\(\s*([^()]+?)\s*[;,]\s*([^()]+?)\s*\)/g)) o.points.push([num(q[1]), num(q[2])]);
        } else if (/^(асимпт|asympt)/i.test(p)) {
          for (const q of p.matchAll(/([xy])\s*=\s*([^,;]+)/g)) o.asym.push([q[1], num(q[2])]);
        } else if ((m = /^(?:размер|size)\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i.exec(p))) {
          o.sizeW = +m[1]; o.sizeH = +m[2];
        } else if ((m = /^(?:шаг|step)\s*(?:([xy])\s*)?(.+)$/i.exec(p))) {
          const v = num(m[2]);
          if (!m[1] || m[1] === 'x') o.stepX = v;
          if (!m[1] || m[1] === 'y') o.stepY = v;
        } else if (/^(слева|left)$/i.test(p)) o.align = 'left';
        else if (/^(по центру|центр|center)$/i.test(p)) o.align = 'center';
        else if (/^(без цифр|без подписей|no labels)$/i.test(p)) o.labels = false;
        else if (/^(подписать|подписи функций|legend)$/i.test(p)) o.legend = true;
        else if (/^(без таблицы|no table)$/i.test(p)) o.table = false;
        else if ((m = /^(?:таблица|table)(?:\s+(справа|сниз[уy]|под графиком|right|below))?\s*[:=]?\s*(.*)$/i.exec(p))) {
          o.table = true;
          if (m[1]) o.tablePos = /справа|right/i.test(m[1]) ? 'right' : 'below';
          const xs = (m[2] || '').replace(/^x\s*[:=]?\s*/i, '').split(/[;\s]+|,\s+/).filter(Boolean);
          if (xs.length) o.tableXs = xs.map(v => num(v));
        }
        else if (/^(без рамки|no frame)$/i.test(p)) o.frame = false;
        else if (/^(рамка|в рамке|frame)$/i.test(p)) o.frame = true;
        else if (/^(без номера|no number)$/i.test(p)) o.nonum = true;
        else if ((m = /^(?:название|заголовок|title)\s*[:=]?\s*(.+)$/i.exec(part.trim()))) o.title = m[1].trim();
        else if ((m = /^(?:номер|number)\s*[:=]?\s*(\S+)$/i.exec(p))) o.number = m[1];
        else if ((m = /^\s*([a-zA-Z]\s*\(\s*x\s*\)|y)\s*=\s*(.+)$/.exec(p))) {
          o.funcs.push({ name: m[1].replace(/\s/g, ''), src: m[2].trim(), f: compile(m[2]) });
        } else if (/x/.test(p)) {
          o.funcs.push({ name: 'y', src: p, f: compile(p) });
        } else {
          o.warnings.push(`график: не понял «${part}»`);
        }
      } catch (e) {
        o.warnings.push(`график: ошибка в «${part}» — ${e.message}`);
      }
    }
    if (o.funcs.length > 1) o.legend = o.legend !== false;
    return o;
  }

  // ================= построение =================
  function niceStep(range, maxTicks) {
    const raw = range / Math.max(1, maxTicks);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const k of [1, 2, 5, 10]) if (k * p >= raw - 1e-12) return k * p;
    return 10 * p;
  }
  const fmt = v => {
    const r = Math.round(v * 1000) / 1000;
    return (r < 0 ? '−' : '') + String(Math.abs(r)).replace('.', ',');
  };

  /**
   * Строит график. Возвращает коробку в мм (y вверх, базовая линия = низ поля графика).
   * env: { availW, maxH, cell, capHeight, textBox(str) -> box в мм, mathBox(src) -> box в мм }
   */
  function build(spec, env) {
    const o = parseSpec(spec);
    const warnings = o.warnings.slice();
    const cell = env.cell || 5;
    if (!o.funcs.length && !o.points.length) warnings.push('график: не задано ни одной функции (пример: y = x^2)');

    let [x0, x1] = o.xrange || [-5, 5];
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (x1 - x0 < 1e-9) x1 = x0 + 1;

    // автодиапазон по y
    let y0, y1;
    if (o.yrange) { [y0, y1] = o.yrange; if (y1 < y0) [y0, y1] = [y1, y0]; }
    else {
      const vals = [];
      for (const fn of o.funcs) for (let k = 0; k <= 400; k++) {
        const v = fn.f(x0 + (x1 - x0) * k / 400);
        if (isFinite(v)) vals.push(v);
      }
      for (const p of o.points) vals.push(p[1]);
      if (!vals.length) { y0 = -5; y1 = 5; }
      else {
        vals.sort((a, b) => a - b);
        const q = t => vals[Math.min(vals.length - 1, Math.max(0, Math.round(t * (vals.length - 1))))];
        let lo = vals[0], hi = vals[vals.length - 1];
        const qlo = q(0.03), qhi = q(0.97);
        if (hi - lo > 6 * Math.max(qhi - qlo, 1e-9)) { lo = qlo; hi = qhi; }
        if (lo > 0 && lo < 0.35 * (hi - lo)) lo = 0;
        if (hi < 0 && -hi < 0.35 * (hi - lo)) hi = 0;
        if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
        const pad = (hi - lo) * 0.08;
        y0 = lo - pad; y1 = hi + pad;
        if (y1 - y0 > 3) { y0 = Math.floor(y0); y1 = Math.ceil(y1); }
      }
    }

    // масштаб: по умолчанию 1 единица = 1 клетка
    const rx = x1 - x0, ry = y1 - y0;
    let ux, uy;
    if (o.sizeW) ux = o.sizeW * cell / rx;
    else {
      ux = cell;
      if (rx * ux < 50) ux = cell * Math.max(1, Math.round(50 / (rx * cell)));
      if (rx * ux < 50) ux = 50 / rx;
    }
    const frameOn = o.frame !== undefined ? o.frame : env.frame !== false;
    const labelRoom = 8 + (frameOn ? 6 : 0); // место под подписи осей и рамку
    if (rx * ux > env.availW - labelRoom) ux = (env.availW - labelRoom) / rx;
    if (o.sizeH) uy = o.sizeH * cell / ry;
    else {
      uy = ux;
      const maxH = Math.min(env.maxH - labelRoom, 140);
      if (ry * uy > maxH) uy = maxH / ry;
      if (ry * uy < 25) uy = 25 / ry;
    }
    const W = rx * ux, H = ry * uy;
    const X = x => (x - x0) * ux, Y = y => (y - y0) * uy;

    const out = { w: 0, asc: 0, desc: 0, strokes: [] };
    const line = pts => out.strokes.push(pts);
    const dashed = (a, b) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / 2.5);
      for (let k = 0; k <= n; k++) {
        const t0 = k * 2.5 / L, t1 = Math.min(1, (k * 2.5 + 1.5) / L);
        if (t0 >= 1) break;
        line([[a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]]);
      }
    };
    const putBox = (b, x, y) => { for (const s of b.strokes) out.strokes.push(s.map(p => [p[0] + x, p[1] + y])); };

    // оси
    const ax = (x0 <= 0 && x1 >= 0) ? X(0) : 0;          // положение оси Y
    const ay = (y0 <= 0 && y1 >= 0) ? Y(0) : 0;          // положение оси X
    const arrow = 2.5, ah = 1.2;
    line([[0, ay], [W + arrow, ay]]);
    line([[W + arrow - 1.8, ay + ah * 0.8], [W + arrow, ay], [W + arrow - 1.8, ay - ah * 0.8]]);
    line([[ax, 0], [ax, H + arrow]]);
    line([[ax - ah * 0.8, H + arrow - 1.8], [ax, H + arrow], [ax + ah * 0.8, H + arrow - 1.8]]);
    const lx = env.textBox('x', 0.8), ly = env.textBox('y', 0.8);
    putBox(lx, W + arrow - lx.w, ay - lx.asc - 1.2 - (ay > 0.5 ? 0 : 0));
    putBox(ly, ax + 1.4, H + arrow - ly.asc);

    // деления и подписи
    const labelK = 0.62;
    const sx = o.stepX || niceStep(rx, Math.max(2, Math.floor(W / 7)));
    const sy = o.stepY || niceStep(ry, Math.max(2, Math.floor(H / 6)));
    let lastRight = -Infinity;
    for (let v = Math.ceil(x0 / sx - 1e-9) * sx; v <= x1 + 1e-9; v += sx) {
      const px = X(v);
      if (Math.abs(v) < 1e-9 && ax === X(0)) continue;
      line([[px, ay - 0.8], [px, ay + 0.8]]);
      if (!o.labels) continue;
      const b = env.textBox(fmt(v), labelK);
      const lxp = px - b.w / 2 - (v < 0 ? 0.6 : 0);
      if (lxp < lastRight + 1) continue;
      putBox(b, lxp, ay - 1.4 - b.asc);
      lastRight = lxp + b.w;
    }
    let lastTop = -Infinity;
    for (let v = Math.ceil(y0 / sy - 1e-9) * sy; v <= y1 + 1e-9; v += sy) {
      const py = Y(v);
      if (Math.abs(v) < 1e-9 && ay === Y(0)) continue;
      line([[ax - 0.8, py], [ax + 0.8, py]]);
      if (!o.labels) continue;
      const b = env.textBox(fmt(v), labelK);
      const bottom = py - b.asc / 2;
      if (bottom < lastTop + 0.8) continue;
      putBox(b, ax - 1.4 - b.w, bottom);
      lastTop = bottom + b.asc;
    }
    if (o.labels && x0 <= 0 && x1 >= 0 && y0 <= 0 && y1 >= 0) {
      const b = env.textBox('0', labelK);
      putBox(b, ax - 1.2 - b.w, ay - 1.4 - b.asc);
    }

    // асимптоты
    for (const [axis, v] of o.asym) {
      if (axis === 'x' && v >= x0 && v <= x1) dashed([X(v), 0], [X(v), H]);
      if (axis === 'y' && v >= y0 && v <= y1) dashed([0, Y(v)], [W, Y(v)]);
    }

    // кривые
    const N = Math.max(200, Math.ceil(W / 0.25));
    for (const fn of o.funcs) {
      let cur = [];
      let lastIn = null;
      const flush = () => { if (cur.length > 1) line(cur); cur = []; };
      const clipY = (a, b) => { // точка на границе между a (внутри) и b (снаружи)
        const lim = b[1] > y1 ? y1 : y0;
        const t = (lim - a[1]) / (b[1] - a[1]);
        return [a[0] + (b[0] - a[0]) * t, lim];
      };
      let prev = null;
      for (let k = 0; k <= N; k++) {
        const x = x0 + rx * k / N;
        const y = fn.f(x);
        const pt = [x, y];
        if (!isFinite(y)) { flush(); prev = null; continue; }
        const inside = y >= y0 && y <= y1;
        if (prev) {
          // разрыв (как у tg x): середина не между соседними значениями
          const ym = fn.f((prev[0] + x) / 2);
          const jump = Math.abs(y - prev[1]) > ry * 0.5 &&
            !(isFinite(ym) && ym >= Math.min(prev[1], y) - 1e-9 && ym <= Math.max(prev[1], y) + 1e-9);
          if (jump || !isFinite(ym)) { flush(); prev = pt; if (inside) cur.push([X(x), Y(y)]); continue; }
          const pin = prev[1] >= y0 && prev[1] <= y1;
          if (pin && !inside) { const c = clipY(prev, pt); cur.push([X(c[0]), Y(c[1])]); flush(); }
          else if (!pin && inside) { const c = clipY(pt, prev); cur.push([X(c[0]), Y(c[1])]); }
          else if (!pin && !inside && (prev[1] - y1) * (y - y1) < 0 && (prev[1] - y0) * (y - y0) < 0) {
            // прошла насквозь между отсчётами
            const a = clipY(pt, prev), b = clipY(prev, pt);
            line([[X(a[0]), Y(a[1])], [X(b[0]), Y(b[1])]]);
          }
        }
        if (inside) cur.push([X(x), Y(y)]);
        prev = pt;
      }
      flush();
    }

    // подписи функций: ищем место, где кривая дальше всего от других кривых и осей
    if (o.legend) {
      const placed = [];
      for (const fn of o.funcs) {
        const b = env.mathBox(`${fn.name}=${texOf(fn.src)}`, labelK);
        let best = null, bestScore = -Infinity;
        const hits = (g, px, py) => { // пересекает ли кривая g прямоугольник подписи
          for (let t = 0; t <= 1.0001; t += 0.125) {
            const gy = g.f(x0 + (px + b.w * t) / ux);
            if (isFinite(gy) && Y(gy) > py - 0.7 && Y(gy) < py + b.asc + 0.7) return true;
          }
          return false;
        };
        for (let k = 1; k < 60; k++) {
          const x = x0 + rx * k / 60, y = fn.f(x);
          if (!isFinite(y) || y < y0 || y > y1) continue;
          for (const above of [true, false]) {
            const px = X(x) + 0.8, py = above ? Y(y) + 1 : Y(y) - 1 - b.asc;
            if (px + b.w > W || py < 0 || py + b.asc > H) continue;
            let score = 0;
            if (ay > py - 0.8 && ay < py + b.asc + 0.8) score -= 60;          // ось X
            if (ax > px - 0.8 && ax < px + b.w + 0.8) score -= 60;            // ось Y
            if (hits(fn, px, py)) score -= 50;
            for (const g of o.funcs) {
              if (g === fn) continue;
              if (hits(g, px, py)) score -= 40;
              const gy = g.f(x);
              if (isFinite(gy)) score += Math.min(8, Math.abs(Y(gy) - Y(y))) * 0.5;
            }
            for (const q of placed) if (Math.abs(q[0] - px) < b.w + 1 && Math.abs(q[1] - py) < b.asc + 1) score -= 100;
            score -= Math.abs(k - 45) * 0.02; // при прочих равных — ближе к правому краю
            if (score > bestScore) { bestScore = score; best = [px, py]; }
          }
        }
        if (best) { putBox(b, best[0], best[1]); placed.push(best); }
      }
    }

    // точки
    for (const [px, py] of o.points) {
      if (px < x0 || px > x1 || py < y0 || py > y1) continue;
      const c = [X(px), Y(py)];
      const circ = r => { const pts = []; for (let k = 0; k <= 16; k++) { const a = k / 16 * 2 * Math.PI; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } return pts; };
      line(circ(0.8)); line(circ(0.4));
    }

    // габариты
    let minX = 0, maxX = W, minY = 0, maxY = H;
    const bbox = () => {
      for (const s of out.strokes) for (const [x, y] of s) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    };
    bbox();

    // ---- таблица значений x и y рядом с графиком (вне его) ----
    const tableOn = o.table !== undefined ? o.table : env.table !== false;
    if (tableOn && o.funcs.length) {
      let xs = o.tableXs;
      if (!xs) {
        // целые точки диапазона (не больше 9 столбцов), с нулём, если он в диапазоне
        let st = niceStep(rx, 8);
        if (rx >= 4 && st < 1) st = 1;
        xs = [];
        for (let v = Math.ceil(x0 / st - 1e-9) * st; v <= x1 + 1e-9 && xs.length < 11; v += st) xs.push(Math.round(v * 1000) / 1000);
      }
      const k = 0.62;
      const rows = [['x'].concat(xs.map(fmt))];
      for (const fn of o.funcs) {
        const nm = fn.name === 'y' && o.funcs.length > 1 ? 'y' + (o.funcs.indexOf(fn) + 1) : fn.name;
        rows.push([nm].concat(xs.map(x => { const v = fn.f(x); return isFinite(v) ? fmt(Math.round(v * 100) / 100) : '—'; }))); // до сотых
      }
      const boxes = rows.map(r => r.map(t => env.textBox(t, k)));
      const rowH = cell;                                            // строка таблицы = клетка
      const nc = rows[0].length;
      const colW = [];
      for (let c = 0; c < nc; c++) {
        const w = Math.max(...boxes.map(r => r[c].w));
        colW.push(Math.max(cell, Math.ceil((w + 1.6) / cell) * cell));
      }
      const TW = colW.reduce((a, b) => a + b, 0), TH = rowH * rows.length;
      // справа от графика, если влезает по ширине; иначе — снизу
      const gap = cell * 2;
      let pos = o.tablePos || ((maxX - minX) + gap + TW <= env.availW ? 'right' : 'below');
      if (pos === 'right' && (maxX - minX) + gap + TW > env.availW) pos = 'below';
      let tx, ty; // левый верхний угол таблицы
      if (pos === 'right') { tx = maxX + gap; ty = (minY + maxY) / 2 + TH / 2; }
      else { tx = Math.max(minX, (minX + maxX) / 2 - TW / 2); ty = minY - cell; }
      // сетка
      line([[tx, ty], [tx + TW, ty], [tx + TW, ty - TH], [tx, ty - TH], [tx, ty]]);
      for (let r = 1; r < rows.length; r++) line([[tx, ty - r * rowH], [tx + TW, ty - r * rowH]]);
      let cx = tx;
      for (let c = 0; c < nc - 1; c++) { cx += colW[c]; line([[cx, ty], [cx, ty - TH]]); }
      // значения по центру клеток
      cx = tx;
      for (let c = 0; c < nc; c++) {
        for (let r = 0; r < rows.length; r++) {
          const b = boxes[r][c];
          const by = ty - (r + 1) * rowH + (rowH - b.asc) / 2;
          putBox(b, cx + (colW[c] - b.w) / 2, by);
        }
        cx += colW[c];
      }
      bbox();
    }

    // рамка вокруг графика и номер «Рис. N» под ней
    const frame = frameOn;
    let usedNumber = false;
    if (frame) {
      const pad = 2.5;
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      line([[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]);
    }
    let caption = '';
    if (o.number) caption = `${env.prefix || 'Рис.'} ${o.number}`;
    else if (env.numbered !== false && !o.nonum && env.number) { caption = `${env.prefix || 'Рис.'} ${env.number}`; usedNumber = true; }
    if (o.title) caption = caption ? `${caption}. ${o.title}` : o.title;
    if (caption) {
      const cb = env.textBox(caption, 0.8);
      const cx = (minX + maxX) / 2 - cb.w / 2;
      putBox(cb, cx, minY - 2 - cb.asc);
    }
    bbox();
    for (const s of out.strokes) for (const p of s) p[0] -= minX;
    out.w = maxX - minX;
    out.asc = maxY;
    out.desc = -minY;
    out.plotLeft = -minX;      // где начинается поле графика (для привязки к клеткам)
    out.align = o.align;
    return { box: out, warnings, usedNumber };
  }

  root.PlotGraph = { build, compile, parseSpec };
})(typeof window !== 'undefined' ? window : globalThis);
