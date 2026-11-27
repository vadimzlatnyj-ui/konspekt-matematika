/*
 * Вёрстка текста с формулами по страницам тетради.
 * Результат: страницы со штрихами в миллиметрах, координаты страницы:
 * (0,0) — левый верхний угол листа, X вправо, Y вниз.
 */
(function (root) {
  'use strict';
  const M = root.PlotMath;

  /** Чистка markdown-разметки, которую обычно содержит ответ чат-бота */
  function cleanMarkdown(text) {
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/```[a-z]*\n?/gi, '')
      .split('\n').map(line => {
        let l = line;
        l = l.replace(/^\s{0,3}#{1,6}\s+/, '');          // заголовки
        l = l.replace(/^\s*>\s?/, '');                   // цитаты
        l = l.replace(/^(\s*)[*+-]\s+/, '$1– ');          // маркированные списки
        l = l.replace(/^\s*([-*_])\1{2,}\s*$/, '');       // горизонтальные линии
        l = l.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1');
        l = l.replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1$2');
        l = l.replace(/`([^`]*)`/g, '$1');
        return l;
      }).join('\n');
  }

  /**
   * Разбивает текст на сегменты: {type:'text'|'math'|'display', src}
   */
  function segment(text) {
    const segs = [];
    let i = 0, buf = '';
    const flush = () => { if (buf) segs.push({ type: 'text', src: buf }); buf = ''; };
    const findClose = (close, from) => {
      let k = from;
      while (true) {
        k = text.indexOf(close, k);
        if (k < 0) return -1;
        if (text[k - 1] === '\\' && close[0] === '$') { k++; continue; }
        return k;
      }
    };
    while (i < text.length) {
      const two = text.substr(i, 2);
      if (two === '\\$') { buf += '$'; i += 2; continue; }
      let open = null, close = null, type = null;
      if (two === '$$') { open = '$$'; close = '$$'; type = 'display'; }
      else if (two === '\\[') { open = '\\['; close = '\\]'; type = 'display'; }
      else if (two === '\\(') { open = '\\('; close = '\\)'; type = 'math'; }
      else if (text[i] === '$') { open = '$'; close = '$'; type = 'math'; }
      if (open) {
        const end = findClose(close, i + open.length);
        // одиночный $ без пары, или строчная формула, разорванная переводом строки — считаем текстом
        if (end >= 0 && !(type === 'math' && text.slice(i + open.length, end).includes('\n\n'))) {
          flush();
          segs.push({ type, src: text.slice(i + open.length, end) });
          i = end + close.length;
          continue;
        }
      }
      buf += text[i]; i++;
    }
    flush();
    return segs;
  }

  /**
   * Превращает сегменты в абзацы. Абзац — {kind:'para', tokens:[...]} | {kind:'display', box} | {kind:'blank'} | {kind:'pagebreak'}
   * tokens: {t:'box', box, glue:bool} | {t:'space'}
   */
  function paragraphs(segs, opt) {
    const paras = [];
    let cur = null, nl = 1;
    const mopt = {
      letterSpacing: opt.letterSpacing, fracScale: opt.fracScale, scriptScale: opt.scriptScale, spaceWidth: opt.wordSpacing,
    };
    const content = () => { if (!cur) { cur = { kind: 'para', tokens: [] }; paras.push(cur); } nl = 0; };
    // каждый Enter — новая строка: второй и следующие Enter подряд дают пустые строки
    const newline = () => {
      cur = null; nl++;
      if (nl >= 2) paras.push({ kind: 'blank' });
    };

    for (const s of segs) {
      if (s.type === 'text') {
        s.src.split('\n').forEach((line, li) => {
          if (li > 0) newline();
          const MK = /[\uE000\uE001]/g;
          const trimmed = line.replace(MK, '').trim();
          // для блоков (график, рисунок): виден, если выделение касается этой строки
          const touch = () => {
            const F = root.PlotFont;
            if (!F || !F.hiddenNow) return false;
            const vis = !F.hiddenNow() || /[\uE000\uE001]/.test(line);
            for (const m of line.match(MK) || []) F.mark(m);
            return !vis;
          };
          if (/^(\\newpage|\\pagebreak|\\clearpage|-{3}\s*page\s*-{3}|={3,}|\[страница\]|\[page\])$/i.test(trimmed)) {
            cur = null; nl = 0; paras.push({ kind: 'pagebreak' }); return;   // nl = 0: перевод строки после \newpage — не пустая строка
          }
          if (!trimmed) { for (const m of line.match(MK) || []) root.PlotFont && root.PlotFont.mark(m); return; }
          const im = /^\[\s*(рисунок|картинка|image|picture)\s*[:：]\s*([\w-]+)\s*(.*)\]$/i.exec(trimmed);
          if (im) {
            const w = /ширина\s*[:=]?\s*([\d.]+)/i.exec(im[3]);
            paras.push({ kind: 'image', id: im[2], width: w ? +w[1] : 0, left: /слева|left/i.test(im[3]), hidden: touch() });
            cur = null; nl = 0; return;
          }
          const gm = /^\[\s*(график|graph|plot)\s*[:：]?\s*(.*)\]$/i.exec(trimmed);
          if (gm) { paras.push({ kind: 'graph', spec: gm[2], hidden: touch() }); cur = null; nl = 0; return; }
          for (const part of line.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { if (cur) cur.tokens.push({ t: 'space' }); continue; }
            content();
            cur.tokens.push({ t: 'box', box: M.layoutTextWord(part, mopt) });
          }
        });
      } else if (s.type === 'math') {
        content();
        cur.tokens.push({ t: 'box', box: M.layoutMath(s.src, mopt), math: true });
      } else {
        paras.push({ kind: 'display', box: M.layoutMath(s.src.replace(/\n/g, ' '), mopt) });
        cur = null; nl = 0; // перевод строки сразу после формулы — просто конец её строки
      }
    }
    const out = paras.filter(p => !(p.kind === 'para' && !p.tokens.length));
    // пустые строки в конце ничего не меняют; в начале — оставляем (это отступ сверху, который набрал пользователь)
    while (out.length && out[out.length - 1].kind === 'blank') out.pop();
    return out;
  }

  /** Склеивает соседние коробки без пробела (например, формулу и запятую) в неразрывные куски */
  function chunks(tokens, opt) {
    const res = [];
    let cur = [];
    const flush = () => {
      if (cur.length) {
        const gaps = cur.slice(1).map(() => opt.letterSpacing);
        res.push(cur.length === 1 ? cur[0] : M.hcat(cur, gaps));
      }
      cur = [];
    };
    for (const t of tokens) {
      if (t.t === 'space') { flush(); res.push(null); }
      else cur.push(t.box);
    }
    flush();
    return res; // null = пробел
  }

  /**
   * Главная функция вёрстки.
   * opt: { pageW, pageH, marginTop, marginBottom, marginLeft, marginRight, mirrorMargins,
   *        capHeight, linePitch, cell, snapToGrid, letterSpacing, wordSpacing, indent,
   *        slant, fracScale, scriptScale, centerDisplay, firstPage }
   */
  function layoutDocument(text, opt) {
    const s = opt.capHeight / 9;          // мм на единицу шрифта
    const slant = Math.tan((opt.slant || 0) * Math.PI / 180);
    const warnings = [];
    const paras = paragraphs(segment(cleanMarkdown(text)), opt);

    const pages = [];
    let page = null;
    let baseline = 0;     // текущая базовая линия (мм от верха листа)
    let prevDesc = 0;     // нижний вынос предыдущей строки (мм)
    let lineOnPage = 0;
    let graphNo = 0;      // сколько графиков уже пронумеровано

    const marginsFor = idx => {
      // поле с красной линией — большее из двух чисел «Поле слева» / «Поле справа», другое — у другого края
      const wide = Math.max(+opt.marginLeft || 0, +opt.marginRight || 0), narrow = Math.min(+opt.marginLeft || 0, +opt.marginRight || 0);
      if (opt.spread) {
        // разворот: широкое поле — снаружи (у левой страницы слева, у правой справа), внутри (у корешка), справа или слева
        const isLeft = (idx + (opt.spreadStart === 'right' ? 1 : 0)) % 2 === 0;
        const wideOnLeft = { outer: isLeft, inner: !isLeft, right: false, left: true }[opt.spreadMargins || 'outer'];
        return wideOnLeft ? { left: wide, right: narrow } : { left: narrow, right: wide };
      }
      if (opt.mirrorMargins) {
        // отдельные страницы тетради: нечётная (1, 3, …) — правая страница, поле справа; чётная — левая, поле слева
        const pageNo = idx + (+opt.firstPage || 1);
        return pageNo % 2 === 1 ? { left: narrow, right: wide } : { left: wide, right: narrow };
      }
      return { left: +opt.marginLeft || 0, right: +opt.marginRight || 0 };
    };
    const newPage = () => {
      page = { index: pages.length, strokes: [], lineOf: [], baselines: [], lines: 0, margins: marginsFor(pages.length) };
      pages.push(page);
      baseline = opt.marginTop; prevDesc = 0; lineOnPage = 0;
    };
    const snap = v => {
      if (!opt.snapToGrid || !opt.cell) return v;
      const rel = v - opt.marginTop;
      return opt.marginTop + Math.ceil(rel / opt.cell - 1e-6) * opt.cell;
    };
    const textW = () => opt.pageW - page.margins.left - page.margins.right;

    /** Найти базовую линию для строки высотой asc/desc (мм); при нехватке места — новая страница */
    const placeLine = (ascMM, descMM) => {
      if (!page) newPage();
      const calc = () => {
        if (lineOnPage === 0) {
          // на первой странице можно начать ниже: с заданной клетки
          const skip = pages.length === 1 ? Math.max(0, (opt.startRow || 1) - 1) * (opt.cell || 5) : 0;
          return snap(opt.marginTop + skip + Math.max(ascMM + 0.5, opt.capHeight));
        }
        const minGap = 0.8;
        return snap(Math.max(baseline + opt.linePitch, baseline + prevDesc + minGap + ascMM));
      };
      let y = calc();
      if (y + descMM > opt.pageH - opt.marginBottom && lineOnPage > 0) {
        newPage();
        y = calc();
      }
      if (y + descMM > opt.pageH - opt.marginBottom) warnings.push('Строка не помещается по высоте страницы — увеличьте лист или уменьшите шрифт.');
      baseline = y; prevDesc = descMM; lineOnPage++; page.lines++;
      page.baselines.push({ y, asc: ascMM, desc: descMM });
      return y;
    };

    const emit = (b, xMM, yMM, k = 1) => {
      for (const st of b.strokes) {
        page.strokes.push(st.map(([x, y]) => [xMM + (x + y * slant) * s * k, yMM - y * s * k]));
        page.lineOf.push(page.lines);
      }
    };

    const fitScale = (b, avail) => {
      const w = b.w * s;
      if (w <= avail) return 1;
      warnings.push('Слишком широкий фрагмент уменьшен, чтобы влезть в строку.');
      return avail / w;
    };

    for (const p of paras) {
      if (p.kind === 'pagebreak') { if (page && page.strokes.length) newPage(); else if (!page) newPage(); continue; }
      if (p.kind === 'blank') {
        // пустая строка занимает строку тетради, как обычная (в том числе в начале страницы)
        placeLine(opt.capHeight, 0);
        continue;
      }
      if (p.kind === 'image') {
        if (!page) newPage();
        const avail = textW();
        const width = Math.min(avail, p.width || 60);
        const maxH = opt.pageH - opt.marginTop - opt.marginBottom - opt.capHeight;
        let im = root.PlotImages ? root.PlotImages.strokesMM(p.id, width) : null;
        if (!im) { warnings.push(`Рисунок ${p.id} не найден — откройте документ ещё раз или вставьте рисунок кнопкой «🖼 Рисунок».`); continue; }
        if (im.h > maxH) im = root.PlotImages.strokesMM(p.id, width * maxH / im.h);   // слишком высокий — уменьшаем
        const y = placeLine(im.h + 1, 0);
        const x = page.margins.left + (p.left ? 0 : (avail - im.w) / 2);
        for (const st of im.strokes) { const t = st.map(([px, py]) => [x + px, y - py]); if (p.hidden) t.push([NaN, NaN]); page.strokes.push(t); page.lineOf.push(page.lines); }
        continue;
      }
      if (p.kind === 'graph') {
        if (!page) newPage();
        const avail = textW();
        const mopt = { letterSpacing: opt.letterSpacing, fracScale: opt.fracScale, scriptScale: opt.scriptScale, spaceWidth: opt.wordSpacing };
        const env = {
          availW: avail, cell: opt.cell || 5, capHeight: opt.capHeight,
          maxH: opt.pageH - opt.marginTop - opt.marginBottom - opt.capHeight * 2,
          textBox: (str, k) => M.scaleBox(M.layoutTextWord(str, mopt), s * k),
          mathBox: (src, k) => M.scaleBox(M.layoutMath(src, mopt), s * k),
          frame: !!opt.graphFrame, numbered: !!opt.graphNumber, table: opt.graphTable !== false,
          prefix: opt.graphPrefix || 'Рис.', number: graphNo + (+opt.graphStart || 1),
        };
        let r;
        // подписи осей строятся сейчас — выделен ли график, решено при разборе строки
        const F = root.PlotFont, vis0 = F && F.getVisible ? F.getVisible() : true;
        if (F && F.setVisible) F.setVisible(!p.hidden);
        try { r = root.PlotGraph.build(p.spec, env); }
        catch (e) { warnings.push('график: ' + e.message); continue; }
        finally { if (F && F.setVisible) F.setVisible(vis0); }
        if (r.usedNumber) graphNo++;
        warnings.push(...r.warnings);
        const g = r.box;
        const y = placeLine(g.asc + 1, g.desc);
        let x = page.margins.left + (g.align === 'left' ? 0 : Math.max(0, (avail - g.w) / 2));
        if (opt.cell) {
          // ставим поле графика на линию клеток
          const c = opt.cell;
          let nx = Math.round((x + g.plotLeft) / c) * c - g.plotLeft;
          if (nx < page.margins.left) nx += c;
          if (nx + g.w <= opt.pageW - page.margins.right + 0.01 || nx <= x) x = nx;
        }
        for (const st of g.strokes) { const t = st.map(([px, py]) => [x + px, y - py]); if (p.hidden) t.push([NaN, NaN]); page.strokes.push(t); page.lineOf.push(page.lines); }
        continue;
      }
      if (p.kind === 'display') {
        if (!page) newPage();
        const avail = textW();
        const k = fitScale(p.box, avail);
        const y = placeLine(p.box.asc * s * k, p.box.desc * s * k);
        const w = p.box.w * s * k;
        const x = page.margins.left + (opt.centerDisplay ? (avail - w) / 2 : opt.indent);
        emit(p.box, x, y, k);
        continue;
      }
      // обычный абзац: перенос по словам
      const parts = chunks(p.tokens, opt);
      let line = [];
      let lineW = 0, first = true;
      const spaceMM = opt.wordSpacing * s;
      const flushLine = () => {
        if (!line.length) return;
        if (!page) newPage();
        let asc = 0, desc = 0;
        for (const it of line) { asc = Math.max(asc, it.b.asc * s * it.k); desc = Math.max(desc, it.b.desc * s * it.k); }
        const y = placeLine(asc, desc);
        for (const it of line) emit(it.b, page.margins.left + it.x, y, it.k);
        line = []; lineW = 0;
      };
      let pendingSpace = false;
      for (const c of parts) {
        if (c === null) { pendingSpace = line.length > 0; continue; }
        if (!page) newPage();
        const avail = textW();
        const startX = (first && line.length === 0) ? (opt.indent || 0) : 0;
        let k = fitScale(c, avail - startX);
        const w = c.w * s * k;
        let x = line.length ? lineW + (pendingSpace ? spaceMM : opt.letterSpacing * s) : startX;
        if (line.length && x + w > avail) {
          flushLine();
          first = false;
          x = 0;
          k = fitScale(c, avail);
        }
        line.push({ b: c, x, k });
        lineW = x + c.w * s * k;
        pendingSpace = false;
      }
      flushLine();
    }
    if (!pages.length) newPage();
    for (const pg of pages) {
      pg.hidden = pg.strokes.map(st => st.some(q => q[0] !== q[0]));
      pg.strokes = pg.strokes.map(st => st.filter(q => q[0] === q[0]));
    }
    return { pages, warnings: Array.from(new Set(warnings)) };
  }

  root.PlotLayout = { layoutDocument, cleanMarkdown, segment };
})(typeof window !== 'undefined' ? window : globalThis);
