/*
 * Разбор формул (подмножество LaTeX) и вёрстка в "коробки" из штрихов.
 * Коробка: { w, asc, desc, strokes: [[[x,y],...],...] } — единицы шрифта, y вверх, базовая линия 0.
 */
(function (root) {
  'use strict';
  const F = root.PlotFont;
  const AXIS = F.AXIS;

  // ---------------- коробки ----------------
  function box(w = 0, asc = 0, desc = 0, strokes = []) { return { w, asc, desc, strokes }; }

  function glyphBox(ch, isText) {
    const g = F.getGlyph(ch, isText) || F.unknownGlyph();
    return box(g.w, Math.max(g.asc, 0), Math.max(g.desc, 0), g.strokes.map(s => s.map(p => [p[0], p[1]])));
  }

  /** Копирует штрихи b в target со сдвигом */
  function put(target, b, dx, dy) {
    for (const s of b.strokes) target.strokes.push(s.map(p => [p[0] + dx, p[1] + dy]));
    target.asc = Math.max(target.asc, b.asc + dy);
    target.desc = Math.max(target.desc, b.desc - dy);
  }

  function scaleBox(b, sx, sy = sx) {
    return box(b.w * sx, b.asc * sy, b.desc * sy, b.strokes.map(s => s.map(p => [p[0] * sx, p[1] * sy])));
  }

  /** Горизонтальная склейка: items — массив коробок, gaps[i] — промежуток после i-й */
  function hcat(items, gaps) {
    const out = box();
    let x = 0;
    items.forEach((b, i) => {
      put(out, b, x, 0);
      x += b.w + (i < items.length - 1 ? (gaps ? gaps[i] : 0) : 0);
    });
    out.w = x;
    return out;
  }

  // служебные линии (черта дроби, знак корня…) — тоже прячем, если они вне выделения
  const hid = st => (F.hiddenNow && F.hiddenNow()) ? st.concat([[NaN, NaN]]) : st;
  function pushS(out, ...sts) { for (const st of sts) out.strokes.push(hid(st)); }

  function lineStroke(pts) { return pts.map(p => [p[0], p[1]]); }

  // ---------------- таблицы символов ----------------
  const SYM = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
    theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
    varpi: 'π', rho: 'ρ', varrho: 'ρ', sigma: 'σ', varsigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ',
    varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
    Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', ast: '*', star: '*',
    le: '≤', leq: '≤', leqslant: '≤', ge: '≥', geq: '≥', geqslant: '≥', ne: '≠', neq: '≠',
    approx: '≈', equiv: '≡', sim: '~', simeq: '≈', cong: '≡', propto: '∝', infty: '∞',
    to: '→', rightarrow: '→', longrightarrow: '→', leftarrow: '←', longleftarrow: '←', gets: '←',
    leftrightarrow: '↔', Rightarrow: '⇒', Longrightarrow: '⇒', implies: '⇒', Leftarrow: '⇐',
    Leftrightarrow: '⇔', Longleftrightarrow: '⇔', iff: '⇔', uparrow: '↑', downarrow: '↓', mapsto: '→',
    in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇',
    cup: '∪', cap: '∩', forall: '∀', exists: '∃', emptyset: '∅', varnothing: '∅',
    angle: '∠', perp: '⊥', parallel: '∥', triangle: '△', partial: '∂', nabla: '∇',
    neg: '¬', lnot: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨',
    langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
    lbrace: '{', rbrace: '}', backslash: '\\', setminus: '\\', caret: '^', underscore: '_', amp: '&',
    tildechar: '~', vert: '|', mid: '|', Vert: '∥', '|': '∥',
    circ: '°', degree: '°', prime: "'", ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮',
    '{': '{', '}': '}', '%': '%', '$': '$', '#': '#', '&': '&', '_': '_',
    lt: '<', gt: '>', colon: ':', bullet: '•', S: '§',
  };

  const BIN = new Set(['+', '−', '×', '·', '÷', '±', '∓', '∪', '∩', '∧', '∨', '*', '\\']);
  const REL = new Set(['=', '<', '>', '≤', '≥', '≠', '≈', '≡', '~', '∝', '→', '←', '↔', '⇒', '⇐', '⇔',
    '∈', '∉', '∋', '⊂', '⊃', '⊆', '⊇', '∥', '⊥', ':', '↑', '↓']);
  const PUNCT = new Set([',', ';']);
  const OPENERS = { '(': ')', '[': ']', '{': '}', '⟨': '⟩', '⌊': '⌋', '⌈': '⌉' };
  const CLOSERS = new Set(Object.values(OPENERS));

  const FUNCS = new Set(['sin', 'cos', 'tan', 'tg', 'ctg', 'cot', 'sec', 'csc', 'cosec', 'arcsin', 'arccos',
    'arctan', 'arctg', 'arcctg', 'arccot', 'sinh', 'cosh', 'tanh', 'coth', 'sh', 'ch', 'th', 'cth', 'log', 'ln',
    'lg', 'exp', 'det', 'deg', 'gcd', 'arg', 'dim', 'ker', 'hom', 'mod', 'bmod', 'Pr', 'sgn', 'tr', 'rank', 'const']);
  const LIMOPS = { lim: 'lim', max: 'max', min: 'min', sup: 'sup', inf: 'inf', limsup: 'lim sup', liminf: 'lim inf' };
  const BIGOPS = { sum: '∑', prod: '∏', bigcup: '∪', bigcap: '∩', coprod: '∏' };
  const INTS = { int: 1, iint: 2, iiint: 3, oint: 0 };
  const IGNORE = new Set(['displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits', 'left.', 'right.',
    'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr', 'Biggl', 'Biggr', 'nonumber',
    'notag', 'label', 'tag', 'color', 'textcolor', 'boxed', 'hline', 'middle', 'qed', 'noindent']);
  const SPACES = { ',': 1.2, ':': 1.8, '>': 1.8, ';': 2.4, '!': -0.8, ' ': 3, quad: 9, qquad: 18, enspace: 4.5, thinspace: 1.2 };

  // ---------------- токенизатор ----------------
  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        let j = i + 1;
        if (j < src.length && /[a-zA-Z]/.test(src[j])) {
          while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
          toks.push({ t: 'cmd', v: src.slice(i + 1, j) });
          while (j < src.length && /[ \t]/.test(src[j])) j++; // пробел после команды не значим
          i = j;
        } else if (j < src.length) {
          toks.push({ t: 'cmd', v: src[j] });
          i = j + 1;
        } else { i = j; }
      } else if (c === '{' || c === '}' || c === '^' || c === '_' || c === '&') {
        toks.push({ t: c }); i++;
      } else if (/\s/.test(c)) {
        toks.push({ t: 'sp' }); i++;
        while (i < src.length && /\s/.test(src[i])) i++;
      } else {
        toks.push({ t: 'ch', v: c }); i++;
      }
    }
    return toks;
  }

  // ---------------- парсер + вёрстка ----------------
  class Parser {
    constructor(src, opt) {
      this.toks = tokenize(src);
      this.i = 0;
      this.opt = Object.assign({ textMode: false, letterSpacing: 1.0, fracScale: 0.8, scriptScale: 0.65, spaceWidth: 3 }, opt || {});
    }
    peek() { return this.toks[this.i]; }
    next() { return this.toks[this.i++]; }
    skipSp() { while (this.peek() && this.peek().t === 'sp') this.i++; }

    /** Аргумент: {группа} или одиночный токен */
    parseArg() {
      this.skipSp();
      const t = this.peek();
      if (!t) return box();
      if (t.t === '{') { this.next(); const b = this.parseRow(tk => tk.t === '}'); this.next(); return b; }
      const atoms = [];
      this.parseAtom(atoms, true);
      return this.joinAtoms(atoms);
    }

    /** Сырой текст в фигурных скобках (для \text, \begin) */
    rawGroup() {
      this.skipSp();
      if (!this.peek() || this.peek().t !== '{') return '';
      this.next();
      let depth = 1, s = '';
      while (this.peek()) {
        const t = this.next();
        if (t.t === '{') { depth++; s += '{'; continue; }
        if (t.t === '}') { if (--depth === 0) break; s += '}'; continue; }
        if (t.t === 'sp') s += ' ';
        else if (t.t === 'cmd') s += (SYM[t.v] && t.v.length > 1) ? SYM[t.v] : (t.v.length === 1 ? t.v : '\\' + t.v + ' ');
        else if (t.t === 'ch') s += t.v;
        else s += t.t;
      }
      return s;
    }

    optArg() {
      this.skipSp();
      const t = this.peek();
      if (!t || t.t !== 'ch' || t.v !== '[') return null;
      this.next();
      const b = this.parseRow(tk => tk.t === 'ch' && tk.v === ']');
      this.next();
      return b;
    }

    /** Строка атомов до стоп-условия */
    parseRow(stop) {
      const atoms = [];
      while (this.peek() && !(stop && stop(this.peek()))) {
        this.parseAtom(atoms, false);
      }
      return this.joinAtoms(atoms);
    }

    joinAtoms(atoms) {
      atoms = atoms.filter(a => a && a.kind !== 'mark');
      if (!atoms.length) return box();
      const ls = this.opt.letterSpacing;
      const items = [], gaps = [];
      const unary = atoms.map((a, k) => a.kind === 'bin' &&
        (k === 0 || ['open', 'rel', 'bin', 'punct', 'op'].includes(atoms[k - 1].kind)));
      const isBin = k => atoms[k].kind === 'bin' && !unary[k];
      atoms.forEach((a, k) => {
        items.push(a.box);
        if (k === atoms.length - 1) return;
        const b = atoms[k + 1];
        let g = (a.kind === 'space' || b.kind === 'space') ? 0 : ls;
        if (!this.opt.textMode && g > 0) {
          if (a.kind === 'rel' || b.kind === 'rel') g += 1.6;
          else if (isBin(k) || isBin(k + 1)) g += 1.2;
          if (a.kind === 'punct') g += 1.8;
          if (a.kind === 'fn' && b.kind !== 'open') g += 2.2;
          if (a.kind === 'op') g += 0.6;
        }
        gaps.push(g);
      });
      return hcat(items, gaps);
    }

    charAtom(ch) {
      if (ch === '\uE000' || ch === '\uE001') { F.mark && F.mark(ch); return { box: box(0), kind: 'mark' }; }
      if (!this.opt.textMode) {
        if (ch === '-') ch = '−';
        if (ch === '*') ch = '·';
        if (ch === '~') return { box: box(SPACES[' ']), kind: 'space' };
      }
      let kind = 'ord';
      if (!this.opt.textMode) {
        if (BIN.has(ch)) kind = 'bin';
        else if (REL.has(ch)) kind = 'rel';
        else if (PUNCT.has(ch)) kind = 'punct';
        else if (OPENERS[ch]) kind = 'open';
        else if (CLOSERS.has(ch)) kind = 'close';
      } else {
        if (OPENERS[ch]) kind = 'open'; else if (CLOSERS.has(ch)) kind = 'close';
      }
      return { box: glyphBox(ch, this.opt.textMode), kind, ch };
    }

    /** isText: true — обычный текст (\\text{…}), пишется загруженным шрифтом */
    textBox(str, isText) {
      this.textFont = !!isText;
      const atoms = [];
      for (const ch of str) {
        if (ch === '\uE000' || ch === '\uE001') { F.mark && F.mark(ch); continue; }
        if (ch === ' ') atoms.push({ box: box(this.opt.spaceWidth), kind: 'space' });
        else atoms.push({ box: glyphBox(ch, this.textFont), kind: 'ord' });
      }
      const save = this.opt.textMode; this.opt.textMode = true;
      const b = this.joinAtoms(atoms);
      this.opt.textMode = save;
      return b;
    }

    /** Разбирает один атом (с индексами) и добавляет в atoms */
    parseAtom(atoms, single) {
      const t = this.next();
      if (!t) return;
      let atom = null;
      switch (t.t) {
        case 'sp':
          if (this.opt.textMode) atoms.push({ box: box(this.opt.spaceWidth), kind: 'space' });
          return;
        case '{': {
          const b = this.parseRow(tk => tk.t === '}'); this.next();
          atom = { box: b, kind: 'ord' }; break;
        }
        case '}': return; // лишняя скобка
        case '&': return;
        case '^': case '_': {
          // индекс без основания
          atom = { box: box(), kind: 'ord' }; this.i--; break;
        }
        case 'ch': atom = this.charAtom(t.v); break;
        case 'cmd': atom = this.command(t.v); break;
      }
      if (!atom) return;
      if (!single) atom = this.scripts(atom);
      atoms.push(atom);
      if (!single && atom.kind === 'close') this.autoSize(atoms);
    }

    /** Автоматически растягивает скобки вокруг высоких выражений */
    autoSize(atoms) {
      const close = atoms[atoms.length - 1];
      if (!close.ch) return;
      let depth = 0;
      for (let k = atoms.length - 2; k >= 0; k--) {
        const a = atoms[k];
        if (a.kind === 'close' && a.ch) depth++;
        if (a.kind === 'open' && a.ch) {
          if (depth > 0) { depth--; continue; }
          if (OPENERS[a.ch] !== close.ch) return;
          let asc = 0, desc = 0;
          for (let m = k + 1; m < atoms.length - 1; m++) { asc = Math.max(asc, atoms[m].box.asc); desc = Math.max(desc, atoms[m].box.desc); }
          if (asc > 10.2 || desc > 3.2) {
            a.box = delimBox(a.ch, asc, desc);
            const sc = close.box.sup || close.box.sub ? null : delimBox(close.ch, asc, desc);
            if (sc) close.box = sc;
          }
          return;
        }
      }
    }

    /** ^ и _ после атома */
    scripts(atom) {
      let sup = null, sub = null, primes = 0;
      for (;;) {
        const save = this.i;
        this.skipSp();
        const t = this.peek();
        if (!t) { this.i = save; break; }
        if (t.t === '^' && !sup) { this.next(); sup = this.parseArg(); }
        else if (t.t === '_' && !sub) { this.next(); sub = this.parseArg(); }
        else if (t.t === 'ch' && t.v === "'" && !this.opt.textMode) { this.next(); primes++; }
        else { this.i = save; break; }
      }
      if (primes) {
        const pr = hcat(Array.from({ length: primes }, () => glyphBox("'")), Array(primes).fill(0.4));
        atom = { box: hcat([atom.box, pr], [0.3]), kind: atom.kind };
      }
      if (!sup && !sub) return atom;
      const ss = this.opt.scriptScale;
      const base = atom.box;
      const out = box();
      put(out, base, 0, 0);
      if (atom.limits) {
        const S = sup ? scaleBox(sup, ss) : null, D = sub ? scaleBox(sub, ss) : null;
        const W = Math.max(base.w, S ? S.w : 0, D ? D.w : 0);
        const res = box();
        put(res, base, (W - base.w) / 2, 0);
        if (S) put(res, S, (W - S.w) / 2, base.asc + 1 + S.desc);
        if (D) put(res, D, (W - D.w) / 2, -base.desc - 1 - D.asc);
        res.w = W;
        return { box: res, kind: atom.kind };
      }
      let w = base.w;
      const isInt = atom.kind === 'op';
      if (sup) {
        const S = scaleBox(sup, ss);
        const up = isInt ? base.asc - S.asc * 0.6 : Math.max(4.2, base.asc - 3.4);
        const x = base.w + 0.4;
        put(out, S, x, up);
        w = Math.max(w, x + S.w);
      }
      if (sub) {
        const D = scaleBox(sub, ss);
        const isFn = atom.kind === 'fn';
        const down = isInt ? base.desc + 0.5 : isFn ? 2.4 : Math.max(2.2, base.desc + 0.6);
        const x = isInt ? base.w - 0.8 : base.w + (isFn ? 0.9 : 0.4);
        put(out, D, x, -down);
        w = Math.max(w, x + D.w);
      }
      out.w = w;
      return { box: out, kind: atom.kind === 'op' || atom.kind === 'fn' ? atom.kind : 'ord' };
    }

    command(name) {
      if (SPACES[name] !== undefined) return { box: box(SPACES[name]), kind: 'space' };
      if (IGNORE.has(name)) {
        if (name === 'label' || name === 'tag' || name === 'color') this.rawGroup();
        if (name === 'textcolor') { this.rawGroup(); }
        return null;
      }
      if (SYM[name]) return this.charAtom(SYM[name]);
      if (FUNCS.has(name)) return { box: this.textBox(name === 'bmod' ? 'mod' : name), kind: 'fn' };
      if (name === 'operatorname') return { box: this.textBox(this.rawGroup()), kind: 'fn' };
      if (LIMOPS[name]) return { box: this.textBox(LIMOPS[name]), kind: 'fn', limits: true };
      if (BIGOPS[name]) {
        const g = glyphBox(BIGOPS[name]);
        return { box: name === 'sum' || name === 'prod' ? g : scaleBox(g, 1.3), kind: 'op', limits: true };
      }
      if (INTS[name] !== undefined) {
        const n = INTS[name];
        if (n === 0) return { box: glyphBox('∮'), kind: 'op' };
        const g = glyphBox('∫');
        return { box: hcat(Array(n).fill(g), Array(n).fill(-1)), kind: 'op' };
      }
      switch (name) {
        case 'frac': case 'dfrac': case 'tfrac': case 'cfrac': {
          const n = this.parseArg(), d = this.parseArg();
          return { box: fracBox(n, d, this.opt.fracScale, true), kind: 'ord' };
        }
        case 'binom': case 'dbinom': case 'tbinom': {
          const n = this.parseArg(), d = this.parseArg();
          const f = fracBox(n, d, this.opt.fracScale, false);
          return { box: hcat([delimBox('(', f.asc, f.desc), f, delimBox(')', f.asc, f.desc)], [0.5, 0.5]), kind: 'ord' };
        }
        case 'sqrt': {
          const idx = this.optArg();
          const c = this.parseArg();
          return { box: sqrtBox(c, idx), kind: 'ord' };
        }
        case 'text': case 'textrm': case 'mbox': case 'textit': case 'textbf': case 'textnormal': case 'hbox':
          return { box: this.textBox(this.rawGroup(), true), kind: 'ord' };
        case 'mathrm': case 'mathbf': case 'mathit': case 'boldsymbol': case 'bm': case 'mathsf': case 'mathcal':
        case 'mathscr': case 'pmb': case 'mathfrak': case 'mathtt':
          return { box: this.parseArg(), kind: 'ord' };
        case 'mathbb': {
          const s = this.rawGroup().trim();
          const m = { N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ', C: 'ℂ' };
          if (s.length === 1 && m[s]) return { box: glyphBox(m[s]), kind: 'ord' };
          return { box: this.textBox(s), kind: 'ord' };
        }
        case 'vec': case 'overrightarrow': return { box: accent(this.parseArg(), 'vec'), kind: 'ord' };
        case 'overline': case 'bar': return { box: accent(this.parseArg(), 'bar'), kind: 'ord' };
        case 'hat': case 'widehat': return { box: accent(this.parseArg(), 'hat'), kind: 'ord' };
        case 'tilde': case 'widetilde': return { box: accent(this.parseArg(), 'tilde'), kind: 'ord' };
        case 'dot': return { box: accent(this.parseArg(), 'dot'), kind: 'ord' };
        case 'ddot': return { box: accent(this.parseArg(), 'ddot'), kind: 'ord' };
        case 'underline': return { box: accent(this.parseArg(), 'under'), kind: 'ord' };
        case 'overset': case 'stackrel': {
          const top = scaleBox(this.parseArg(), this.opt.scriptScale), b = this.parseArg();
          const W = Math.max(top.w, b.w), out = box();
          put(out, b, (W - b.w) / 2, 0); put(out, top, (W - top.w) / 2, b.asc + 0.8 + top.desc); out.w = W;
          return { box: out, kind: 'rel' };
        }
        case 'underset': {
          const bot = scaleBox(this.parseArg(), this.opt.scriptScale), b = this.parseArg();
          const W = Math.max(bot.w, b.w), out = box();
          put(out, b, (W - b.w) / 2, 0); put(out, bot, (W - bot.w) / 2, -b.desc - 0.8 - bot.asc); out.w = W;
          return { box: out, kind: 'ord' };
        }
        case 'pmod': {
          const a = this.parseArg();
          return { box: hcat([glyphBox('('), this.textBox('mod'), a, glyphBox(')')], [0.8, 2, 0.8]), kind: 'ord' };
        }
        case 'left': return this.leftRight();
        case 'right': this.readDelim(); return null;
        case 'begin': return this.environment(this.rawGroup().trim());
        case 'end': this.rawGroup(); return null;
        case 'newline': case '\\': return null;
        case 'not': {
          const a = this.parseArg();
          const out = box(); put(out, a, 0, 0); out.w = a.w;
          pushS(out, [[a.w * 0.2, -0.5], [a.w * 0.8, 8]]);
          return { box: out, kind: 'rel' };
        }
        default:
          // Неизвестная команда — пишем её имя текстом
          return { box: this.textBox(name), kind: 'ord' };
      }
    }

    readDelim() {
      this.skipSp();
      const t = this.next();
      if (!t) return '.';
      if (t.t === 'ch') return t.v;
      if (t.t === 'cmd') {
        if (t.v === '{' || t.v === 'lbrace') return '{';
        if (t.v === '}' || t.v === 'rbrace') return '}';
        if (t.v === '|' || t.v === 'Vert') return '∥';
        return SYM[t.v] || '.';
      }
      return '.';
    }

    leftRight() {
      const l = this.readDelim();
      const inner = this.parseRow(tk => tk.t === 'cmd' && tk.v === 'right');
      let r = '.';
      if (this.peek()) { this.next(); r = this.readDelim(); }
      const items = [], gaps = [];
      if (l !== '.') { items.push(delimBox(l, inner.asc, inner.desc)); gaps.push(0.6); }
      items.push(inner);
      if (r !== '.') { gaps.push(0.6); items.push(delimBox(r, inner.asc, inner.desc)); }
      return { box: hcat(items, gaps), kind: 'ord' };
    }

    environment(name) {
      const base = name.replace(/\*$/, '');
      if (base === 'array' || base === 'tabular') this.rawGroup(); // спецификация столбцов
      const rows = [[]];
      const endOf = tk => tk.t === 'cmd' && (tk.v === 'end' || tk.v === '\\' || tk.v === 'cr') || tk.t === '&';
      for (;;) {
        const cell = this.parseRow(endOf);
        rows[rows.length - 1].push(cell);
        const t = this.next();
        if (!t) break;
        if (t.t === '&') continue;
        if (t.t === 'cmd' && (t.v === '\\' || t.v === 'cr')) { this.optArg(); rows.push([]); continue; }
        if (t.t === 'cmd' && t.v === 'end') { this.rawGroup(); break; }
      }
      // убрать пустую последнюю строку
      while (rows.length > 1 && rows[rows.length - 1].every(c => c.w === 0)) rows.pop();

      let align = 'c', colGap = 4;
      if (['cases', 'dcases', 'rcases', 'system'].includes(base)) align = 'l';
      if (['aligned', 'align', 'alignat', 'split', 'eqnarray', 'flalign', 'alignedat'].includes(base)) align = 'rl';
      const grid = gridBox(rows, align, colGap);
      const dl = { pmatrix: '(', bmatrix: '[', Bmatrix: '{', vmatrix: '|', Vmatrix: '∥', cases: '{', dcases: '{', system: '{' }[base];
      const dr = { pmatrix: ')', bmatrix: ']', Bmatrix: '}', vmatrix: '|', Vmatrix: '∥', rcases: '}' }[base];
      const items = [], gaps = [];
      if (dl) { items.push(delimBox(dl, grid.asc, grid.desc)); gaps.push(1); }
      items.push(grid);
      if (dr) { gaps.push(1); items.push(delimBox(dr, grid.asc, grid.desc)); }
      return { box: hcat(items, gaps), kind: 'ord' };
    }
  }

  // ---------------- построители ----------------
  function fracBox(n, d, sc, bar) {
    const N = scaleBox(n, sc), D = scaleBox(d, sc);
    const W = Math.max(N.w, D.w) + 1.6;
    const out = box();
    put(out, N, (W - N.w) / 2, AXIS + 1.3 + N.desc);
    put(out, D, (W - D.w) / 2, AXIS - 1.3 - D.asc);
    if (bar) pushS(out, [[0, AXIS], [W, AXIS]]);
    out.w = W;
    return out;
  }

  function sqrtBox(c, idx) {
    const h = Math.max(c.asc, 6) + 1.4;
    const d = Math.max(c.desc, 0) + 0.6;
    let shift = 0;
    const out = box();
    if (idx) {
      const I = scaleBox(idx, 0.55);
      shift = Math.max(0, I.w - 1.2);
      put(out, I, 0, Math.max(3.8, h * 0.45 + 0.6));
    }
    const x0 = shift;
    const tickY = Math.min(h * 0.45, 4.5);
    const cx = x0 + 4.6;
    pushS(out, [[x0, tickY], [x0 + 1.2, tickY + 0.9], [x0 + 2.6, -d], [x0 + 4.2, h], [cx + c.w + 0.6, h]]);
    put(out, c, cx, 0);
    out.w = cx + c.w + 0.8;
    out.asc = Math.max(out.asc, h);
    out.desc = Math.max(out.desc, d);
    return out;
  }

  function accent(c, kind) {
    const out = box();
    put(out, c, 0, 0);
    out.w = c.w;
    const y = Math.max(c.asc, 6) + 1.2;
    const w = Math.max(c.w, 3);
    const x0 = (c.w - w) / 2;
    const mid = c.w / 2;
    switch (kind) {
      case 'vec':
        pushS(out, [[x0, y], [x0 + w, y]]);
        pushS(out, [[x0 + w - 1.3, y + 0.8], [x0 + w, y], [x0 + w - 1.3, y - 0.8]]);
        out.asc = Math.max(out.asc, y + 0.8); break;
      case 'bar':
        pushS(out, [[x0, y], [x0 + w, y]]); out.asc = Math.max(out.asc, y); break;
      case 'hat':
        pushS(out, [[mid - 1.6, y - 0.2], [mid, y + 1.2], [mid + 1.6, y - 0.2]]); out.asc = Math.max(out.asc, y + 1.2); break;
      case 'tilde':
        pushS(out, [[mid - 2, y], [mid - 1, y + 0.7], [mid, y + 0.3], [mid + 1, y - 0.1], [mid + 2, y + 0.6]]); out.asc = Math.max(out.asc, y + 0.8); break;
      case 'dot':
        pushS(out, [[mid, y], [mid, y + 0.4]]); out.asc = Math.max(out.asc, y + 0.4); break;
      case 'ddot':
        pushS(out, [[mid - 0.9, y], [mid - 0.9, y + 0.4]], [[mid + 0.9, y], [mid + 0.9, y + 0.4]]); out.asc = Math.max(out.asc, y + 0.4); break;
      case 'under': {
        const yy = -Math.max(c.desc, 0) - 1;
        pushS(out, [[x0, yy], [x0 + w, yy]]); out.desc = Math.max(out.desc, -yy); break;
      }
    }
    return out;
  }

  /** Растянутая по высоте скобка, охватывающая asc/desc */
  function delimBox(ch, asc, desc) {
    if (ch === '.' || !ch) return box();
    if (ch === '|') {
      const top = Math.max(asc, 9) + 0.8, bot = -Math.max(desc, 1.5) - 0.8;
      return box(1, top, -bot, [[[0.5, bot], [0.5, top]]].map(hid));
    }
    if (ch === '∥') {
      const top = Math.max(asc, 9) + 0.8, bot = -Math.max(desc, 1.5) - 0.8;
      return box(2.5, top, -bot, [[[0.5, bot], [0.5, top]], [[2, bot], [2, top]]].map(hid));
    }
    const g = glyphBox(ch);
    const natTop = g.asc, natBot = -g.desc;
    const natH = natTop - natBot;
    const top = asc + 0.8, bot = -desc - 0.8;
    const need = top - bot;
    if (need <= natH) return g;
    const fy = need / natH;
    const fx = Math.min(1.8, Math.sqrt(fy));
    const out = box(g.w * fx, top, -bot, g.strokes.map(s => s.map(p => [p[0] * fx, bot + (p[1] - natBot) * fy])));
    return out;
  }

  /** Таблица ячеек (матрицы, системы) */
  function gridBox(rows, align, colGap) {
    const ncol = Math.max(...rows.map(r => r.length));
    const colW = Array(ncol).fill(0);
    rows.forEach(r => r.forEach((c, j) => { colW[j] = Math.max(colW[j], c.w); }));
    const gapAfter = j => {
      if (align === 'rl') return j % 2 === 0 ? 0.8 : 5;
      return colGap;
    };
    const colX = []; let x = 0;
    for (let j = 0; j < ncol; j++) { colX.push(x); x += colW[j] + (j < ncol - 1 ? gapAfter(j) : 0); }
    const W = x;
    // вертикально: строки сверху вниз
    const rowGap = 2.4;
    const placed = [];
    let y = 0; // базовая линия текущей строки
    rows.forEach((r, i) => {
      const asc = Math.max(6, ...r.map(c => c.asc)), desc = Math.max(1.5, ...r.map(c => c.desc));
      if (i === 0) y = -asc; else y -= asc + rowGap;
      placed.push({ r, y });
      y -= desc;
    });
    const top = 0, bottom = y;
    const shift = AXIS - (top + bottom) / 2;
    const out = box();
    for (const { r, y: by } of placed) {
      r.forEach((c, j) => {
        let cx = colX[j];
        const a = align === 'rl' ? (j % 2 === 0 ? 'r' : 'l') : align;
        if (a === 'c') cx += (colW[j] - c.w) / 2;
        else if (a === 'r') cx += colW[j] - c.w;
        put(out, c, cx, by + shift);
      });
    }
    out.w = W;
    out.asc = Math.max(out.asc, top + shift);
    out.desc = Math.max(out.desc, -(bottom + shift));
    return out;
  }

  // ---------------- обычный текст ----------------
  const SUPS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ˣ': 'x', 'ʸ': 'y', 'ᵃ': 'a', 'ᵏ': 'k', 'ⁱ': 'i', 'ᵐ': 'm' };
  const SUBS = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-', '₍': '(', '₎': ')', 'ₙ': 'n', 'ₓ': 'x', 'ᵢ': 'i', 'ₖ': 'k', 'ₐ': 'a', 'ₘ': 'm' };
  const ESC = { '\\': '\\backslash ', '{': '\\lbrace ', '}': '\\rbrace ', '^': '\\caret ', '_': '\\underscore ', '&': '\\amp ', '~': '\\tildechar ' };

  /** Переводит слово обычного текста (с юникод-индексами и √) в разметку для парсера */
  function textWordToTex(word) {
    const chars = Array.from(word);
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (SUPS[c] || SUBS[c]) {
        const map = SUPS[c] ? SUPS : SUBS;
        let s = '';
        while (i < chars.length && map[chars[i]]) { s += map[chars[i]]; i++; }
        i--;
        out += (map === SUPS ? '^{' : '_{') + s + '}';
      } else if (c === '√' || c === '∛' || c === '∜') {
        let arg = '';
        if (chars[i + 1] === '(') {
          let depth = 0, j = i + 1;
          for (; j < chars.length; j++) {
            if (chars[j] === '(') depth++;
            if (chars[j] === ')' && --depth === 0) break;
          }
          arg = chars.slice(i + 2, j).join('');
          i = j;
        } else {
          let j = i + 1;
          while (j < chars.length && /[0-9a-zA-Zа-яА-ЯёЁα-ω.,]/.test(chars[j])) j++;
          arg = chars.slice(i + 1, j).join('');
          i = j - 1;
        }
        const idx = c === '∛' ? '[3]' : c === '∜' ? '[4]' : '';
        out += '\\sqrt' + idx + '{' + Array.from(arg).map(ch => ESC[ch] || ch).join('') + '}';
      } else {
        out += ESC[c] || c;
      }
    }
    return out;
  }

  function layoutMath(src, opt) {
    const p = new Parser(src, Object.assign({}, opt, { textMode: false }));
    return p.parseRow(null);
  }

  function layoutTextWord(word, opt) {
    const p = new Parser(textWordToTex(word), Object.assign({}, opt, { textMode: true }));
    // в текстовом режиме пробелы внутри слова не встречаются
    return p.parseRow(null);
  }

  root.PlotMath = { layoutMath, layoutTextWord, box, put, hcat, scaleBox, glyphBox };
})(typeof window !== 'undefined' ? window : globalThis);
