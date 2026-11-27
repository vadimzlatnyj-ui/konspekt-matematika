/*
 * Импорт конспектов из файлов: Word (.docx) с формулами, PDF, .txt/.md.
 *   .docx — распаковываем zip (DecompressionStream), читаем word/document.xml;
 *           формулы Word (OMML) переводим в разметку формул программы ($…$, $$…$$).
 *   .pdf  — текст через pdf.js (js/vendor/pdf.min.js, Apache-2.0), загружается только при первом PDF.
 */
(function (root) {
  'use strict';

  // ================= ZIP =================
  async function inflateRaw(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const out = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(out);
  }

  /** Достаёт файл из zip-архива по имени */
  async function unzipFile(buf, wanted) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('файл повреждён или это не .docx');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      if (name === wanted) {
        const lnlen = dv.getUint16(lho + 26, true), lxlen = dv.getUint16(lho + 28, true);
        const data = u8.subarray(lho + 30 + lnlen + lxlen, lho + 30 + lnlen + lxlen + csize);
        if (method === 0) return data;
        if (method === 8) return inflateRaw(data);
        throw new Error('неизвестное сжатие в архиве');
      }
      p += 46 + nlen + xlen + clen;
    }
    return null;
  }

  // ================= формулы Word (OMML) → разметка =================
  const FN = /^(sin|cos|tan|tg|ctg|cot|sec|csc|log|ln|lg|lim|max|min|exp|arcsin|arccos|arctan|arctg|arcctg|sh|ch|th|sinh|cosh|tanh|det|deg|gcd|sgn)$/;
  const NARY = { '∑': '\\sum', '∏': '\\prod', '∐': '\\prod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap' };
  const ACC = { '̂': '\\hat', '̃': '\\tilde', '⃗': '\\vec', '⃖': '\\vec', '̅': '\\overline', '¯': '\\overline', '̇': '\\dot', '̈': '\\ddot', 'ˆ': '\\hat', '~': '\\tilde' };

  const kids = el => Array.from(el.childNodes).filter(n => n.nodeType === 1);
  const child = (el, name) => kids(el).find(c => c.localName === name);
  const prop = (el, pr, name) => {
    const p = child(el, pr); if (!p) return null;
    const c = child(p, name); if (!c) return null;
    for (const a of c.attributes) if (a.localName === 'val') return a.value;
    return '';
  };

  function texEscape(t) {
    return t.replace(/\\/g, '\\backslash ').replace(/([{}#&%$_^])/g, '\\$1').replace(/⁡/g, '');
  }

  function omml(el) {
    if (!el) return '';
    const all = () => kids(el).map(omml).join('');
    const part = name => { const c = child(el, name); return c ? omml(c) : ''; };
    switch (el.localName) {
      case 'r': {
        const t = kids(el).filter(c => c.localName === 't').map(c => c.textContent).join('');
        if (!t) return '';
        const plain = el.getElementsByTagNameNS('*', 'nor').length > 0 || prop(el, 'rPr', 'sty') === 'p' && /\s|[а-яё]/i.test(t);
        if (FN.test(t.trim())) return '\\' + t.trim() + ' ';
        if (plain || /[а-яё]{2,}/i.test(t)) return '\\text{' + t.replace(/[{}\\]/g, '') + '}';
        return texEscape(t);
      }
      case 'f': {
        const type = prop(el, 'fPr', 'type');
        const n = part('num'), d = part('den');
        if (type === 'lin' || type === 'skw') return `${n}/${d}`;
        if (type === 'noBar') return `\\binom{${n}}{${d}}`;
        return `\\frac{${n}}{${d}}`;
      }
      case 'sSup': return `{${part('e')}}^{${part('sup')}}`;
      case 'sSub': return `{${part('e')}}_{${part('sub')}}`;
      case 'sSubSup': return `{${part('e')}}_{${part('sub')}}^{${part('sup')}}`;
      case 'sPre': return `{}_{${part('sub')}}^{${part('sup')}}{${part('e')}}`;
      case 'rad': {
        const deg = part('deg').trim();
        const hide = prop(el, 'radPr', 'degHide');
        return deg && hide !== '1' && hide !== 'on' && hide !== 'true' ? `\\sqrt[${deg}]{${part('e')}}` : `\\sqrt{${part('e')}}`;
      }
      case 'd': {
        let beg = prop(el, 'dPr', 'begChr'), end = prop(el, 'dPr', 'endChr');
        const sep = prop(el, 'dPr', 'sepChr') ?? '|';
        if (beg === null) beg = '('; if (end === null) end = ')';
        const es = kids(el).filter(c => c.localName === 'e');
        // система уравнений: «{» слева и пусто справа, внутри — массив уравнений
        if (beg === '{' && end === '' && es.length === 1) {
          const arr = child(es[0], 'eqArr');
          if (arr) return `\\begin{cases} ${kids(arr).filter(c => c.localName === 'e').map(omml).join(' \\\\ ')} \\end{cases}`;
        }
        const del = c => c === '' ? '.' : c === '{' ? '\\{' : c === '}' ? '\\}' : c === '⟨' ? '\\langle' : c === '⟩' ? '\\rangle' : c === '‖' ? '\\|' : c;
        return `\\left${del(beg)} ${es.map(omml).join(` ${sep} `)} \\right${del(end)}`;
      }
      case 'nary': {
        const chr = prop(el, 'naryPr', 'chr') || '∫';
        const op = NARY[chr] || chr;
        const subH = prop(el, 'naryPr', 'subHide'), supH = prop(el, 'naryPr', 'supHide');
        const sub = subH === '1' || subH === 'on' ? '' : part('sub'), sup = supH === '1' || supH === 'on' ? '' : part('sup');
        return `${op}${sub.trim() ? `_{${sub}}` : ''}${sup.trim() ? `^{${sup}}` : ''} ${part('e')}`;
      }
      case 'func': return `${part('fName')} ${part('e')}`;
      case 'limLow': {
        const base = part('e').trim();
        // lim, max, min — подпись под словом (как в Word)
        return /^\\(lim|max|min|sup|inf)$/.test(base) ? `${base}_{${part('lim')}}` : `{${base}}_{${part('lim')}}`;
      }
      case 'limUpp': return `{${part('e')}}^{${part('lim')}}`;
      case 'acc': {
        const chr = prop(el, 'accPr', 'chr') || '̂';
        return `${ACC[chr] || '\\hat'}{${part('e')}}`;
      }
      case 'bar': return (prop(el, 'barPr', 'pos') === 'top' ? '\\overline' : '\\underline') + `{${part('e')}}`;
      case 'm': {
        const rows = kids(el).filter(c => c.localName === 'mr').map(r => kids(r).filter(c => c.localName === 'e').map(omml).join(' & '));
        return `\\begin{matrix} ${rows.join(' \\\\ ')} \\end{matrix}`;
      }
      case 'eqArr': return `\\begin{aligned} ${kids(el).filter(c => c.localName === 'e').map(omml).join(' \\\\ ')} \\end{aligned}`;
      default:
        if (/Pr$/.test(el.localName)) return '';     // свойства (fPr, rPr, ctrlPr…) — пропускаем
        return all();
    }
  }

  // ================= DOCX =================
  async function docxToText(buf) {
    const xml = await unzipFile(buf, 'word/document.xml');
    if (!xml) throw new Error('в файле нет текста Word (word/document.xml)');
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), 'application/xml');
    const body = doc.getElementsByTagNameNS('*', 'body')[0];
    if (!body) throw new Error('не удалось прочитать документ Word');
    const lines = [];

    function paragraph(p) {
      let out = '';
      const displays = [];
      const walk = el => {
        for (const c of kids(el)) {
          const n = c.localName;
          if (n === 'pPr' || n === 'rPr' || n === 'del' || n === 'instrText' || n === 'fldChar' || n === 'proofErr' || n === 'bookmarkStart' || n === 'bookmarkEnd') continue;
          if (n === 'oMathPara') { for (const m of c.getElementsByTagNameNS('*', 'oMath')) displays.push(omml(m).trim()); continue; }
          if (n === 'oMath') { out += ` $${omml(c).trim()}$ `; continue; }
          if (n === 't') { out += c.textContent.replace(/\$/g, '\\$'); continue; }
          if (n === 'tab') { out += ' '; continue; }
          if (n === 'br' || n === 'cr') { out += '\n'; continue; }
          if (n === 'sym') { out += String.fromCharCode(parseInt(c.getAttribute('w:char') || '20', 16) & 0xff || 32); continue; }
          walk(c);
        }
      };
      walk(p);
      const isList = p.getElementsByTagNameNS('*', 'numPr').length > 0;
      out = out.replace(/[ \u00A0]{2,}/g, ' ').replace(/\$ ([,.;:!?)])/g, (m, c) => '$' + c).replace(/([(«]) \$/g, (m, c) => c + '$').trim();
      if (out) lines.push((isList ? '– ' : '') + out);
      for (const d of displays) lines.push(`$$${d}$$`);
      if (!out && !displays.length) lines.push('');
    }

    for (const el of kids(body)) {
      if (el.localName === 'p') paragraph(el);
      else if (el.localName === 'tbl') {
        for (const tr of el.getElementsByTagNameNS('*', 'tr')) {
          const cells = Array.from(tr.getElementsByTagNameNS('*', 'tc')).map(tc => {
            const save = lines.length;
            for (const p of tc.getElementsByTagNameNS('*', 'p')) paragraph(p);
            const txt = lines.splice(save).filter(Boolean).join(' ');
            return txt;
          });
          lines.push(cells.join('   '));
        }
      } else if (el.localName === 'oMathPara' || el.localName === 'oMath') {
        lines.push(`$$${omml(el).trim()}$$`);
      }
    }
    // не больше одной пустой строки подряд, без пустых по краям
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ================= PDF =================
  let pdfLoading = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('не удалось загрузить ' + src));
      document.head.appendChild(s);
    });
  }
  function loadPdfJs() {
    if (!pdfLoading) {
      // обработчик pdf.js в основном потоке — работает и из file://, где фоновые потоки запрещены
      pdfLoading = loadScript('js/vendor/pdf.worker.min.js').then(() => loadScript('js/vendor/pdf.min.js')).then(() => {
        const lib = root.pdfjsLib;
        if (!lib) throw new Error('pdf.js не загрузился');
        lib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
        return lib;
      });
    }
    return pdfLoading;
  }

  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ' };
  const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋' };

  async function pdfToText(buf, onProgress) {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const paras = [];
    for (let pn = 1; pn <= pdf.numPages; pn++) {
      if (onProgress) onProgress(pn, pdf.numPages);
      const page = await pdf.getPage(pn);
      const tc = await page.getTextContent();
      const items = tc.items.filter(it => it.str !== undefined && it.str.length).map(it => ({
        s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 10,
      }));
      if (!items.length) continue;
      // группируем в строки по высоте
      const hs = items.map(i => i.h).sort((a, b) => a - b), hMed = hs[Math.floor(hs.length / 2)] || 10;
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      for (const it of items) {
        const ln = lines.find(l => Math.abs(l.y - it.y) < hMed * 0.55 || (it.h < l.h * 0.85 && Math.abs(l.y - it.y) < l.h * 0.7));
        if (ln) { ln.items.push(it); if (it.h > ln.h) { ln.h = it.h; ln.y = it.y; } } else lines.push({ y: it.y, h: it.h, items: [it] });
      }
      lines.sort((a, b) => b.y - a.y);
      const maxRight = Math.max(...items.map(i => i.x + i.w));
      const texts = lines.map(l => {
        l.items.sort((a, b) => a.x - b.x);
        let t = '', prevEnd = null;
        for (const it of l.items) {
          let s = it.s;
          // мелкий приподнятый/опущенный текст из цифр — индексы
          if (it.h < l.h * 0.85 && /^[0-9+\-−n]+$/.test(s.trim())) {
            const map = it.y > l.y + l.h * 0.15 ? SUP : it.y < l.y - l.h * 0.1 ? SUB : null;
            if (map) s = Array.from(s.trim()).map(c => map[c] || c).join('');
          }
          if (prevEnd !== null && it.x - prevEnd > hMed * 0.2 && !/\s$/.test(t) && !/^\s/.test(s) && !/^[²³¹⁰-⁹₀-₉⁺⁻]/.test(s)) t += ' ';
          t += s; prevEnd = it.x + it.w;
        }
        return { t: t.replace(/\s+/g, ' ').trim(), y: l.y, h: l.h, right: prevEnd, left: l.items[0].x };
      }).filter(l => l.t);
      // склеиваем строки в абзацы: разрыв — большой отступ по высоте или короткая строка
      let cur = '';
      for (let i = 0; i < texts.length; i++) {
        const l = texts[i], next = texts[i + 1];
        cur = cur ? (/[a-zа-яё]-$/i.test(cur) ? cur.slice(0, -1) + l.t : cur + ' ' + l.t) : l.t;
        const gap = next ? l.y - next.y : Infinity;
        const shortLine = l.right < maxRight * 0.8;
        const listNext = next && /^(\d+[.)]|[•–—-]\s)/.test(next.t);
        if (!next || gap > l.h * 1.9 || shortLine || listNext) { paras.push(cur); cur = ''; if (next && gap > l.h * 2.4) paras.push(''); }
      }
      paras.push('');
    }
    return paras.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\$/g, '\\$').trim();
  }

  /** Читает файл и возвращает текст для поля «Текст ответа» */
  async function readFile(file, onProgress) {
    const name = file.name.toLowerCase();
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 5));
    const sig = String.fromCharCode(...head);
    if (name.endsWith('.doc') && sig.charCodeAt(0) === 0xD0) throw new Error('старый формат .doc не поддерживается — откройте его в Word и сохраните как .docx');
    if (sig.startsWith('PK')) return { text: await docxToText(buf), kind: 'Word' };
    if (sig.startsWith('%PDF')) return { text: await pdfToText(buf, onProgress), kind: 'PDF' };
    if (name.endsWith('.rtf')) throw new Error('RTF не поддерживается — сохраните как .docx');
    return { text: new TextDecoder().decode(buf).replace(/^﻿/, ''), kind: 'текст' };
  }

  root.PlotImport = { readFile, docxToText, pdfToText, omml };
})(typeof window !== 'undefined' ? window : globalThis);
