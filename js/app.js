/* Интерфейс приложения */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  const PAGE_PRESETS = {
    notebook: [170, 205], a5: [148, 210], a4: [210, 297], general: [165, 205],
  };
  // Способы подъёма ручки: подписи полей и значения по умолчанию
  const PEN_METHODS = {
    servo: { up: 90, down: 30, lbl: ['S — поднято', 'S — опущено'] },
    servoM5: { up: 0, down: 30, lbl: ['(поднято = M5)', 'S — опущено'], noUp: true },
    z: { up: 3, down: 0, extra: 600, lbl: ['Z — поднято, мм', 'Z — опущено, мм'], extraLbl: 'Подача Z, мм/мин' },
    m280: { up: 90, down: 30, extra: 0, lbl: ['Угол — поднято, °', 'Угол — опущено, °'], extraLbl: 'Номер серво (P)' },
    solenoid: { up: 0, down: 1000, lbl: ['(поднято = M5)', 'S — сила, вкл'], noUp: true },
  };

  /** Команды подъёма/опускания из выбранного способа */
  function penCommands(c) {
    const m = c.penPreset;
    if (!PEN_METHODS[m]) return { up: c.penUp, down: c.penDown };
    const u = +c.penUpVal, d = +c.penDownVal, x = +c.penExtra;
    const waitS = Math.max(0, +c.penDelay || 0);
    const wait = waitS > 0 ? '\nG4 P' + (c.fw === 'marlin' ? Math.round(waitS * 1000) : +waitS.toFixed(3)) : '';
    switch (m) {
      case 'servo': return { up: `M3 S${u}${wait}`, down: `M3 S${d}${wait}` };
      case 'servoM5': return { up: `M5${wait}`, down: `M3 S${d}${wait}` };
      case 'z': return { up: `G1 Z${u} F${x || 600}`, down: `G1 Z${d} F${x || 600}` };
      case 'm280': return { up: `M280 P${x || 0} S${u}${wait}`, down: `M280 P${x || 0} S${d}${wait}` };
      case 'solenoid': return { up: `M5${wait}`, down: `M3 S${d}${wait}` };
    }
  }

  function updatePenUI(resetValues) {
    const m = PEN_METHODS[$('penPreset').value];
    $('penVals').style.display = m ? '' : 'none';
    $('zHint').style.display = $('penPreset').value === 'z' ? '' : 'none';
    $('penExtraWrap').style.visibility = m && m.extraLbl ? 'visible' : 'hidden';
    if (!m) { $('penUp').readOnly = $('penDown').readOnly = false; return; }
    $('penUpLbl').textContent = m.lbl[0]; $('penDownLbl').textContent = m.lbl[1];
    $('penUpVal').disabled = !!m.noUp;
    if (m.extraLbl) $('penExtraLbl').textContent = m.extraLbl;
    if (resetValues) {
      $('penUpVal').value = m.up; $('penDownVal').value = m.down;
      if (m.extra !== undefined) $('penExtra').value = m.extra;
    }
  }

  const DEFAULTS = {
    preset: 'notebook', pageW: 170, pageH: 205, cell: 5,
    marginTop: 10, marginBottom: 10, marginLeft: 5, marginRight: 25,
    mirrorMargins: true, snapToGrid: true, firstPage: 1,
    offsetX: 20, offsetY: 20, rotation: 0, mirrorX: false, mirrorY: false, bedW: 300, bedH: 300,
    capHeight: 4, linePitch: 10, letterSpacing: 1.2, wordSpacing: 4, slant: 0, indent: 0,
    fracScale: 0.8, scriptScale: 0.65, centerDisplay: true,
    penPreset: 'servo', penUpVal: 90, penDownVal: 30, penExtra: 1000, fw: 'grbl', baud: '115200',
    penUp: 'M3 S90\nG4 P0.2', penDown: 'M3 S30\nG4 P0.2',
    feedDraw: 1500, feedTravel: 4000, penDelay: 0.2, travelG0: true,
    header: 'G21 ; миллиметры\nG90 ; абсолютные координаты',
    betweenPages: 'G0 X{startX} Y{startY}\nM0 ; Страница {page} готова. Переверните лист и продолжите',
    footer: 'G0 X{startX} Y{startY}\nM2',
    decimals: 2, joinDistance: 0.1, order: 'lines', startX: 0, startY: 0, startRow: 1,
    spread: false, spineGap: 12, spreadStart: 'left', fontSel: 'builtin', fontMathMode: 'digits',
    originCorner: 'bl', homeCorner: 'tl', graphFrame: false, graphNumber: false, graphTable: true, cfgVer: 2, graphPrefix: 'Рис.', graphStart: 1,
  };

  const SAMPLE = String.raw`Демонстрация: формулы и графики

1. Квадратное уравнение. Решите $x^2 - 5x + 6 = 0$.
$$D = b^2 - 4ac = 25 - 24 = 1$$
$$x_{1,2} = \frac{-b \pm \sqrt{D}}{2a} = \frac{5 \pm 1}{2}$$
Ответ: $x_1 = 2$, $x_2 = 3$.

2. Дроби, корни и степени
$$\frac{a^2 - b^2}{a + b} = a - b, \quad \sqrt[3]{27} = 3, \quad 2^{-3} = \frac{1}{8}$$

3. Система уравнений и определитель
$$\begin{cases} 2x + y = 7 \\ x - y = -1 \end{cases} \Rightarrow \begin{cases} x = 2 \\ y = 3 \end{cases}$$
$$\begin{vmatrix} 1 & 2 \\ 3 & 4 \end{vmatrix} = 1 \cdot 4 - 2 \cdot 3 = -2$$

4. Тригонометрия и логарифмы
$$\sin^2\alpha + \cos^2\alpha = 1, \quad \log_2 32 = 5, \quad \lg 1000 = 3$$

5. Пределы, производные, интегралы
$$\lim_{x \to 0} \frac{\sin x}{x} = 1, \quad (x^3)' = 3x^2, \quad \sum_{k=1}^{n} k = \frac{n(n+1)}{2}$$
$$\int_0^2 x^2\,dx = \frac{x^3}{3}\Big|_0^2 = \frac{8}{3}$$

6. Графики
Парабола $y = x^2 - 2x - 3$: вершина $(1; -4)$, нули $x = -1$ и $x = 3$.
[график: y = x^2 - 2x - 3; x от -2 до 4; y от -5 до 5; размер 12x10; точки (1; -4) (-1; 0) (3; 0); название Парабола]
Синус и косинус:
[график: y = sin x; y = cos x; x от -2pi до 2pi; y от -1.5 до 1.5; размер 26x6; подписать; название Синус и косинус]
Гипербола $y = \frac{1}{x - 1} + 1$ и её асимптоты $x = 1$, $y = 1$:
[график: y = 1/(x-1) + 1; x от -3 до 5; y от -3 до 5; размер 10x10; асимптоты x = 1, y = 1; название Гипербола]`;

  const NUM = ['pageW', 'pageH', 'cell', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'firstPage',
    'offsetX', 'offsetY', 'rotation', 'bedW', 'bedH', 'capHeight', 'linePitch', 'letterSpacing', 'wordSpacing',
    'slant', 'indent', 'fracScale', 'scriptScale', 'feedDraw', 'feedTravel', 'penDelay', 'decimals', 'joinDistance', 'startX', 'startY', 'startRow', 'spineGap', 'penUpVal', 'penDownVal', 'penExtra', 'graphStart'];
  const BOOL = ['mirrorMargins', 'snapToGrid', 'mirrorX', 'mirrorY', 'centerDisplay', 'travelG0', 'spread', 'graphFrame', 'graphNumber', 'graphTable'];
  const STR = ['fontMathMode', 'graphPrefix', 'originCorner', 'homeCorner', 'fontSel', 'fw', 'baud', 'spreadStart', 'order', 'preset', 'penPreset', 'penUp', 'penDown', 'header', 'betweenPages', 'footer'];

  let cfg = load();
  let result = { pages: [], warnings: [] };
  let pageIdx = 0;

  function load() {
    try {
      const c = JSON.parse(localStorage.getItem('plotterCfg') || '{}');
      if (!(c.cfgVer >= 2)) { c.graphFrame = false; c.graphNumber = false; c.graphTable = true; }
      c.cfgVer = 2;
      if (c.fontMath !== undefined && !c.fontMathMode) { c.fontMathMode = c.fontMath ? 'all' : 'digits'; delete c.fontMath; }
      return Object.assign({}, DEFAULTS, c);
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save() { localStorage.setItem('plotterCfg', JSON.stringify(cfg)); }

  function fillForm() {
    for (const k of NUM.concat(STR)) if ($(k)) $(k).value = cfg[k];
    for (const k of BOOL) if ($(k)) $(k).checked = !!cfg[k];
    $('rotation').value = String(cfg.rotation);
    if (!PEN_METHODS[cfg.penPreset] && cfg.penPreset !== 'custom') cfg.penPreset = 'custom';
    $('penPreset').value = cfg.penPreset;
    updatePenUI(false);
  }
  function readForm() {
    for (const k of NUM) { const v = parseFloat($(k).value); if (!isNaN(v)) cfg[k] = v; }
    cfg.feedDraw = Math.max(10, Math.min(10000, cfg.feedDraw));
    for (const k of BOOL) cfg[k] = $(k).checked;
    for (const k of STR) { if (k === 'fontSel' && !$(k).value) continue; cfg[k] = $(k).value; }
    if (PEN_METHODS[cfg.penPreset]) {
      const pc = penCommands(cfg);
      cfg.penUp = pc.up; cfg.penDown = pc.down;
      $('penUp').value = pc.up; $('penDown').value = pc.down;
    }
    // точка дома в углу поля — пересчитываем после чтения всех настроек (угол нуля, размер поля)
    if (cfg.homeCorner && cfg.homeCorner !== 'custom') {
      const [hx, hy] = cornerMachine(cfg.homeCorner);
      cfg.startX = hx; cfg.startY = hy;
      $('startX').value = hx; $('startY').value = hy;
    }
    $('startX').readOnly = $('startY').readOnly = cfg.homeCorner !== 'custom';
  }

  // ---------- пересчёт ----------
  let timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(recompute, 200); }

  // ---------- листы: одна страница или разворот из двух ----------
  let sheets = [];
  /** Настройки для G-code: при развороте «лист» — это обе страницы + перегородка */
  // Угол нуля плоттера: если ноль справа/сверху — ось идёт от него внутрь поля, т.е. зеркалим относительно тетради
  const originRight = () => cfg.originCorner === 'br' || cfg.originCorner === 'tr';
  const originTop = () => cfg.originCorner === 'tl' || cfg.originCorner === 'tr';
  function G() {
    const o = { mirrorX: !!cfg.mirrorX !== originRight(), mirrorY: !!cfg.mirrorY !== originTop() };
    if (cfg.spread) o.pageW = 2 * cfg.pageW + (+cfg.spineGap || 0);
    return Object.assign({}, cfg, o);
  }
  /** Точка поля (вид сверху: X вправо, Y к дальнему краю, от левого ближнего угла) → координаты плоттера */
  const fieldToMachine = ([fx, fy]) => [originRight() ? cfg.bedW - fx : fx, originTop() ? cfg.bedH - fy : fy];
  /** Угол поля → координаты плоттера */
  const cornerMachine = c => fieldToMachine([c[1] === 'r' ? cfg.bedW : 0, c[0] === 't' ? cfg.bedH : 0]);

  function buildSheets(pages) {
    const W = cfg.pageW, gap = +cfg.spineGap || 0;
    let slots;
    if (!cfg.spread) slots = pages.map(p => [p]);
    else {
      const arr = cfg.spreadStart === 'right' ? [null].concat(pages) : pages.slice();
      slots = [];
      for (let i = 0; i < arr.length; i += 2) slots.push([arr[i], arr[i + 1] || null]);
    }
    return slots.map(slot => {
      const sh = { strokes: [], lineOf: [], baselines: [], parts: [] };
      slot.forEach((p, side) => {
        const dx = side * (W + gap);
        sh.parts.push({ page: p, dx, no: p ? pages.indexOf(p) : -1 });
        if (!p) return;
        p.strokes.forEach((st, i) => {
          sh.strokes.push(dx ? st.map(q => [q[0] + dx, q[1]]) : st);
          sh.lineOf.push((p.lineOf ? p.lineOf[i] : 0) + side * 100000); // сначала вся левая страница, потом правая
        });
        for (const b of p.baselines || []) sh.baselines.push({ y: b.y, x0: dx + p.margins.left, x1: dx + W - p.margins.right });
      });
      return sh;
    });
  }

  function sheetTitle(i) {
    const sh = sheets[i];
    if (!sh) return '';
    const nums = sh.parts.filter(p => p.page).map(p => p.no + (+cfg.firstPage || 1));
    if (!cfg.spread) return `Страница ${nums[0]} (${i + 1} из ${sheets.length})`;
    return `Разворот ${i + 1} из ${sheets.length}: стр. ${nums.join('–')}`;
  }

  // ---------- отмена / возврат (Ctrl+Z / Ctrl+Y): текст и настройки ----------
  const hist = { stack: [], pos: -1, restoring: false, timer: null };
  const snapshot = () => JSON.stringify({ text: $('text').value, cfg });
  function pushHistory() {
    if (hist.restoring) return;
    const s = snapshot();
    if (hist.stack[hist.pos] === s) return;
    hist.stack = hist.stack.slice(0, hist.pos + 1);
    hist.stack.push(s);
    if (hist.stack.length > 200) hist.stack.shift();
    hist.pos = hist.stack.length - 1;
    updateUndoButtons();
  }
  function updateUndoButtons() {
    if (!$('undoBtn')) return;
    $('undoBtn').disabled = hist.pos <= 0;
    $('redoBtn').disabled = hist.pos >= hist.stack.length - 1;
  }
  function restoreHistory(step) {
    if (typeof sender !== 'undefined' && sender && sender.job && !sender.job.finished) return; // во время печати — нельзя
    clearTimeout(hist.timer);
    pushHistory(); // зафиксировать несохранённые изменения
    const to = hist.pos + step;
    if (to < 0 || to >= hist.stack.length) return;
    hist.pos = to;
    const st = JSON.parse(hist.stack[to]);
    hist.restoring = true;
    const sel = $('text').selectionStart;
    $('text').value = st.text;
    cfg = Object.assign({}, DEFAULTS, st.cfg);
    if (typeof fillNotebookOptions === 'function') fillNotebookOptions(cfg.preset);
    fillForm();
    if (typeof fontOptions === 'function') fontOptions();
    recompute();
    try { $('text').selectionStart = $('text').selectionEnd = Math.min(sel, st.text.length); } catch (e) { /* */ }
    hist.restoring = false;
    updateUndoButtons();
  }

  function recompute() {
    readForm(); save();
    localStorage.setItem('plotterText', $('text').value);
    PlotFont.setCustom(fonts.get(cfg.fontSel) || null, cfg.fontMathMode || 'digits');
    try {
      result = PlotLayout.layoutDocument($('text').value, cfg);
    } catch (e) {
      console.error(e);
      result = { pages: [{ strokes: [], margins: { left: cfg.marginLeft, right: cfg.marginRight } }], warnings: ['Ошибка вёрстки: ' + e.message] };
    }
    sheets = buildSheets(result.pages);
    if (pageIdx >= sheets.length) pageIdx = sheets.length - 1;
    if (pageIdx < 0) pageIdx = 0;
    // проверка выхода за стол
    const tf = PlotGcode.makeTransform(G());
    const warns = result.warnings.slice();
    const maxX = +cfg.offsetX + tf.bboxW, maxY = +cfg.offsetY + tf.bboxH;
    if (cfg.offsetX < 0 || cfg.offsetY < 0 || maxX > cfg.bedW || maxY > cfg.bedH)
      warns.push(`Тетрадь выходит за рабочее поле плоттера (нужно ${maxX.toFixed(0)}×${maxY.toFixed(0)} мм, а поле ${cfg.bedW}×${cfg.bedH} мм).`);
    if (cfg.startX < 0 || cfg.startY < 0 || cfg.startX > cfg.bedW || cfg.startY > cfg.bedH)
      warns.push(`Точка дома (${cfg.startX}; ${cfg.startY}) вне рабочего поля.`);
    $('warnings').innerHTML = warns.map(w => `<div>${escapeHtml(w)}</div>`).join('');
    render();
    // в историю — после паузы в наборе (так слово, а не каждая буква, отменяется за раз)
    if (!hist.restoring) { clearTimeout(hist.timer); hist.timer = setTimeout(pushHistory, hist.stack.length ? 700 : 0); }
  }

  function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function currentGcode() { return PlotGcode.program(sheets, G(), pageIdx); }

  // ---------- путь ручки (для предпросмотра и симуляции) ----------
  let path = null;          // { segs:[{draw, pts, t0, t1}], total, start }
  const sim = { running: false, t: Infinity, last: 0 };

  /** Строит путь ручки: старт → холостой ход → штрих → … в координатах листа или станка */
  function buildPath(strokes, start) {
    const segs = [];
    let t = 0, cur = start, n = 0;
    const vd = Math.max(1, cfg.feedDraw) / 60, vt = Math.max(1, cfg.feedTravel) / 60; // мм/с
    const len = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
    for (const s of strokes) {
      if (!s.length) continue;
      const tr = [cur, s[0]];
      const dt = len(tr) / vt + (cfg.penDelay || 0) * 2;
      segs.push({ draw: false, pts: tr, t0: t, t1: t + dt }); t += dt;
      const dd = len(s) / vd;
      segs.push({ draw: true, pts: s, t0: t, t1: t + dd, stroke: n++ }); t += dd;
      cur = s[s.length - 1];
    }
    return { segs, total: t, start };
  }

  /** Часть ломаной до доли f (0..1) по длине */
  function partial(pts, f) {
    if (f >= 1) return pts;
    let L = 0; const acc = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(L); }
    const target = L * f, out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (acc[i] <= target) { out.push(pts[i]); continue; }
      const seg = acc[i] - acc[i - 1], u = seg ? (target - acc[i - 1]) / seg : 0;
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]);
      break;
    }
    return out;
  }

  function fmtT(m) { return m < 1 ? `${Math.round(m * 60)} с` : `${Math.floor(m)} мин ${Math.round((m % 1) * 60)} с`; }

  function render() {
    stopSim();
    const n = sheets.length;
    const page = sheets[pageIdx];
    $('pageInfo').textContent = sheetTitle(pageIdx);
    const g = currentGcode();
    const all = PlotGcode.program(sheets, G(), null);
    const st = g.stats;
    $('stats').innerHTML =
      `${cfg.spread ? 'Этот разворот' : 'Эта страница'}: письмо ${(st.draw / 1000).toFixed(2)} м, холостые ${(st.travel / 1000).toFixed(2)} м, ` +
      `опусканий ручки ${st.lifts}, ≈ ${fmtT(st.time)}, строк G-code ${g.text.split('\n').length - 1}.<br>` +
      `Все ${n} стр.: ≈ ${fmtT(all.stats.time)}.`;
    $('gcodeOut').value = g.text.length > 400000 ? g.text.slice(0, 400000) + '\n; … (обрезано в окне, файл полный)' : g.text;
    // путь строим из тех же штрихов, что идут в G-code, — номера штрихов совпадают с печатью
    const pg = PlotGcode.pageGcode(page, G(), pageIdx + 1, n);
    if ($('view').value === 'bed') {
      path = buildPath(pg.machineStrokes, [+cfg.startX || 0, +cfg.startY || 0]);
    } else {
      const inv = PlotGcode.makeTransform(G()).inverse;
      path = buildPath(pg.machineStrokes.map(st => st.map(inv)), PlotGcode.startOnPage(G()));
    }
    sim.t = Infinity;
    $('simPos').value = 1000;
    draw();
  }

  function draw() {
    const page = sheets[pageIdx];
    if ($('view').value === 'bed') drawBed(page); else drawPage(page);
    const t = Math.min(sim.t, path.total);
    $('simInfo').textContent = sim.t === Infinity ? `весь путь: ${fmtT(path.total / 60)}` : `${fmtT(t / 60)} из ${fmtT(path.total / 60)}`;
  }

  /** Рисует путь ручки до момента sim.t, маркеры старта и положения ручки */
  function drawPath(ctx, k, opts) {
    if (live.active && live.page === pageIdx) { drawLive(ctx, k, opts); return; }
    const upto = sim.t;
    const simMode = upto !== Infinity;
    const showTravel = $('showTravel').checked || simMode;
    // холостые ходы
    if (showTravel) {
      ctx.save();
      ctx.setLineDash([1.5, 1.2].map(v => v * (opts.dashK || 1)));
      ctx.strokeStyle = 'rgba(239,68,68,.55)'; ctx.lineWidth = 0.5 / k * (opts.lw || 1);
      ctx.beginPath();
      for (const sg of path.segs) {
        if (sg.draw || sg.t0 > upto) continue;
        const pts = partial(sg.pts, (upto - sg.t0) / (sg.t1 - sg.t0));
        ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      }
      ctx.stroke(); ctx.restore();
    }
    // штрихи
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = Math.max(0.3, 1.2 / k); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = path.start, down = false;
    for (const sg of path.segs) {
      if (sg.t0 > upto) break;
      const f = (upto - sg.t0) / (sg.t1 - sg.t0);
      const pts = partial(sg.pts, f);
      if (sg.draw) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
      pen = pts[pts.length - 1]; down = sg.draw && f < 1;
    }
    ctx.stroke();

    const R = Math.max(1.2, 6 / k);
    const label = (txt, x, y, color) => opts.text(txt, x, y, color);
    // старт ручки
    const [sx, sy] = opts.clamp(path.start);
    ctx.fillStyle = 'rgba(22,163,74,.25)'; ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1.5 / k;
    ctx.beginPath(); ctx.arc(sx, sy, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    const outside = sx !== path.start[0] || sy !== path.start[1];
    label(outside ? 'старт (за листом)' : 'старт', sx, sy, '#15803d');
    // начало письма
    const firstDraw = path.segs.find(sg => sg.draw);
    if (firstDraw && !simMode) {
      const [fx, fy] = firstDraw.pts[0];
      ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1 / k; ctx.setLineDash([2 / k * 3, 1.5 / k * 3]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(fx, fy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#16a34a';
      ctx.beginPath(); ctx.arc(fx, fy, R * 0.6, 0, 2 * Math.PI); ctx.fill();
      label('1-й штрих', fx, fy, '#15803d');
    }
    // текущее положение ручки при симуляции
    if (simMode) drawPen(ctx, k, pen[0], pen[1], down, !!opts.yUp);
  }

  /**
   * Модель ручки: зелёная — пишет (касается бумаги), красная — поднята (приподнята над точкой, под ней — тень).
   * yUp — система координат с осью Y вверх (вид «Стол станка»).
   */
  function drawPen(ctx, k, x, y, down, yUp) {
    const s = 1 / k;                          // 1 экранный пиксель в мм
    const up = yUp ? 1 : -1;                  // направление «вверх» на экране
    const ang = 62 * Math.PI / 180;           // ручка наклонена вправо-вверх
    const ax = Math.cos(ang), ay = Math.sin(ang) * up;   // ось ручки
    const nx = -ay, ny = ax;                  // поперёк ручки
    const lift = down ? 0 : 9 * s;            // поднятая ручка висит над бумагой
    const tx = x + ax * lift, ty = y + ay * lift;
    const P = (a, b) => [tx + ax * a * s + nx * b * s, ty + ay * a * s + ny * b * s];
    const poly = (pts, fill, stroke) => {
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.2 * s; ctx.stroke();
    };
    const body = down ? '#22c55e' : '#ef4444', dark = down ? '#15803d' : '#b91c1c';
    // тень/точка касания
    ctx.fillStyle = down ? 'rgba(21,128,61,.35)' : 'rgba(185,28,28,.25)';
    ctx.beginPath(); ctx.ellipse(x, y, (down ? 3 : 5) * s, (down ? 3 : 3) * s, 0, 0, 2 * Math.PI); ctx.fill();
    if (!down) {
      ctx.setLineDash([2 * s, 2 * s]); ctx.strokeStyle = dark; ctx.lineWidth = 1 * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
    }
    poly([P(0, 0), P(9, -4), P(9, 4)], '#475569', '#1e293b');                   // стержень/наконечник
    poly([P(9, -5), P(46, -5), P(46, 5), P(9, 5)], body, dark);                  // корпус
    poly([P(30, -5.5), P(36, -5.5), P(36, 5.5), P(30, 5.5)], dark, dark);        // ободок
    poly([P(46, -5), P(52, -4), P(52, 4), P(46, 5)], dark, dark);               // колпачок
  }

  /** Во время печати: напечатанное — тёмным, остальное — серым, ручка — по координатам от плоттера */
  function drawLive(ctx, k, opts) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const done of [false, true]) {
      ctx.strokeStyle = done ? '#1e3a8a' : '#cbd5e1';
      ctx.lineWidth = Math.max(0.3, (done ? 1.2 : 1) / k);
      ctx.beginPath();
      for (const sg of path.segs) {
        if (!sg.draw || (sg.stroke < live.stroke) !== done) continue;
        ctx.moveTo(sg.pts[0][0], sg.pts[0][1]);
        for (let i = 1; i < sg.pts.length; i++) ctx.lineTo(sg.pts[i][0], sg.pts[i][1]);
      }
      ctx.stroke();
    }
    const R = Math.max(1.2, 6 / k);
    const [sx, sy] = opts.clamp(path.start);
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1.2 / k;
    ctx.beginPath(); ctx.arc(sx, sy, R * 0.8, 0, 2 * Math.PI); ctx.stroke();
    if (live.pos) {
      const [px, py] = opts.fromMachine(live.pos);
      drawPen(ctx, k, px, py, live.pen, !!opts.yUp);
    }
  }

  // ---------- холст ----------
  // ---------- масштаб предпросмотра: колёсико — приблизить к курсору, мышью — двигать ----------
  const zoom = { z: 1, px: 0, py: 0, base: null };   // px/py — сдвиг в экранных пикселях
  function setupCanvas(wmm, hmm) {
    const wrap = $('canvasWrap');
    const cw = Math.max(50, wrap.clientWidth - 16), ch = Math.max(50, wrap.clientHeight - 16);
    const fit = Math.max(0.5, Math.min(cw / wmm, ch / hmm));
    const c = $('canvas');
    const dpr = window.devicePixelRatio || 1;
    let W, H;
    if (zoom.z <= 1.0001) { W = wmm * fit; H = hmm * fit; zoom.px = zoom.py = 0; }   // обычный вид — лист целиком
    else { W = cw; H = ch; }                                                          // приближение — во всё окно
    c.style.width = W + 'px'; c.style.height = H + 'px';
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const k = fit * zoom.z;
    // по центру + сдвиг
    const ox = (W - wmm * k) / 2 + zoom.px, oy = (H - hmm * k) / 2 + zoom.py;
    zoom.base = { fit, wmm, hmm, W, H };
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (zoom.z > 1.0001) { ctx.fillStyle = '#e5e7eb'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.setTransform(k * dpr, 0, 0, k * dpr, ox * dpr, oy * dpr);
    $('zoomVal').textContent = Math.round(zoom.z * 100) + '%';
    return { ctx, k };
  }
  function setZoom(z, cx, cy) {
    // cx, cy — точка на холсте (экранные пиксели), которая должна остаться на месте
    const b = zoom.base; if (!b) return;
    z = Math.max(1, Math.min(12, z));
    const W = z > 1.0001 ? Math.max(50, $('canvasWrap').clientWidth - 16) : b.wmm * b.fit;
    const H = z > 1.0001 ? Math.max(50, $('canvasWrap').clientHeight - 16) : b.hmm * b.fit;
    if (cx === undefined) { cx = W / 2; cy = H / 2; }
    const kOld = b.fit * zoom.z, kNew = b.fit * z;
    const oxOld = (b.W - b.wmm * kOld) / 2 + zoom.px, oyOld = (b.H - b.hmm * kOld) / 2 + zoom.py;
    // точка листа под курсором
    const mx = (cx - oxOld) / kOld, my = (cy - oyOld) / kOld;
    zoom.z = z;
    zoom.px = cx - mx * kNew - (W - b.wmm * kNew) / 2;
    zoom.py = cy - my * kNew - (H - b.hmm * kNew) / 2;
    if (z <= 1.0001) zoom.px = zoom.py = 0;
    draw();
  }
  function initZoom() {
    const c = $('canvas');
    c.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) {
        // без Ctrl колёсико не приближает: если лист приближен — листаем его (Shift — вбок)
        if (zoom.z <= 1.0001) return;
        e.preventDefault();
        const dx = e.shiftKey ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
        zoom.px -= dx; zoom.py -= dy;
        draw();
        return;
      }
      e.preventDefault(); // Ctrl+колёсико — приближаем лист, а не всё окно
      const r = c.getBoundingClientRect();
      // если холст ещё не во всё окно — пересчитаем точку в координатах будущего холста
      const wrapR = $('canvasWrap').getBoundingClientRect();
      const big = zoom.z > 1.0001;
      const cx = e.clientX - (big ? r.left : r.left), cy = e.clientY - (big ? r.top : r.top);
      const factor = Math.exp(-e.deltaY * 0.0015);
      if (!big) {
        // переход из «листа целиком» во «всё окно»: сначала разворачиваем холст, сохраняя точку
        const b = zoom.base; if (!b) return;
        const W = Math.max(50, wrapR.width - 16), H = Math.max(50, wrapR.height - 16);
        const offX = (W - b.W) / 2, offY = (H - b.H) / 2;
        zoom.base = Object.assign({}, b, { W, H });
        zoom.px = 0; zoom.py = 0;
        setZoom(zoom.z * factor, cx + offX, cy + offY);
      } else setZoom(zoom.z * factor, cx, cy);
    }, { passive: false });
    let drag = null;
    c.addEventListener('mousedown', e => {
      if (zoom.z <= 1.0001) return;
      drag = { x: e.clientX, y: e.clientY, px: zoom.px, py: zoom.py };
      c.style.cursor = 'grabbing'; e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      zoom.px = drag.px + (e.clientX - drag.x); zoom.py = drag.py + (e.clientY - drag.y);
      draw();
    });
    window.addEventListener('mouseup', () => { if (drag) { drag = null; c.style.cursor = zoom.z > 1.0001 ? 'grab' : ''; } });
    c.addEventListener('dblclick', () => { zoom.z = 1; zoom.px = zoom.py = 0; draw(); c.style.cursor = ''; });
    $('zoomIn').onclick = () => { if (zoom.z <= 1.0001) { const b = zoom.base; if (b) zoom.base = Object.assign({}, b, { W: Math.max(50, $('canvasWrap').clientWidth - 16), H: Math.max(50, $('canvasWrap').clientHeight - 16) }); } setZoom(zoom.z * 1.5); c.style.cursor = 'grab'; };
    $('zoomOut').onclick = () => { setZoom(zoom.z / 1.5); c.style.cursor = zoom.z > 1.0001 ? 'grab' : ''; };
    $('zoomFit').onclick = () => { zoom.z = 1; zoom.px = zoom.py = 0; draw(); c.style.cursor = ''; };
  }

  function drawPage(sheet) {
    const W = cfg.pageW, H = cfg.pageH, SW = G().pageW;
    const { ctx, k } = setupCanvas(SW, H);
    // перегородка между страницами разворота
    if (cfg.spread) {
      ctx.fillStyle = '#d6d3d1'; ctx.fillRect(W, 0, SW - 2 * W, H);
      ctx.strokeStyle = 'rgba(120,113,108,.6)'; ctx.lineWidth = 0.5 / k;
      ctx.beginPath();
      for (let y = -SW; y < H; y += 4) { ctx.moveTo(W, y); ctx.lineTo(SW - W, y + (SW - 2 * W)); }
      ctx.stroke();
    }
    for (const part of sheet.parts) {
      ctx.save();
      ctx.translate(part.dx, 0);
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      ctx.fillStyle = part.page ? '#fff' : '#f1f5f9'; ctx.fillRect(0, 0, W, H);
      if (cfg.cell > 0) {
        ctx.strokeStyle = '#c7dcf0'; ctx.lineWidth = 0.6 / k;
        ctx.beginPath();
        for (let x = cfg.cell; x < W; x += cfg.cell) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (let y = cfg.marginTop % cfg.cell; y < H; y += cfg.cell) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();
      }
      if (part.page) {
        const m = part.page.margins;
        ctx.strokeStyle = '#e05252'; ctx.lineWidth = 1 / k;
        ctx.beginPath();
        if (m.right >= m.left) { ctx.moveTo(W - m.right, 0); ctx.lineTo(W - m.right, H); }
        else { ctx.moveTo(m.left, 0); ctx.lineTo(m.left, H); }
        ctx.stroke();
        ctx.setLineDash([2, 2]); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 0.6 / k;
        ctx.strokeRect(m.left, cfg.marginTop, W - m.left - m.right, H - cfg.marginTop - cfg.marginBottom);
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = '#94a3b8'; ctx.font = `${Math.max(3, 12 / k)}px sans-serif`;
        ctx.fillText('пустая страница', 6, H / 2);
      }
      ctx.restore();
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 0.8 / k; ctx.strokeRect(part.dx, 0, W, H);
    }
    // строки, по которым пишет ручка
    if ($('showLines').checked && sheet.baselines) {
      ctx.strokeStyle = 'rgba(22,163,74,.55)'; ctx.lineWidth = 1.2 / k;
      ctx.fillStyle = '#15803d'; ctx.font = `${Math.max(2.2, 10 / k)}px sans-serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      sheet.baselines.forEach((b, i) => {
        ctx.beginPath(); ctx.moveTo(b.x0, b.y); ctx.lineTo(b.x1, b.y); ctx.stroke();
        ctx.fillText(String(i + 1), b.x0 - 0.8, b.y - 1);
      });
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    const inv = PlotGcode.makeTransform(G()).inverse;
    drawPath(ctx, k, {
      fromMachine: inv,
      clamp: ([x, y]) => [Math.min(SW - 2, Math.max(2, x)), Math.min(H - 2, Math.max(2, y))],
      text: (t, x, y, color) => {
        ctx.fillStyle = color; ctx.font = `bold ${Math.max(2.5, 11 / k)}px sans-serif`;
        const w = ctx.measureText(t).width;
        ctx.fillText(t, Math.min(x + 2, SW - w - 1), Math.max(y - 2, 4));
      },
    });
  }

  function drawBed(page) {
    const BW = cfg.bedW, BH = cfg.bedH;
    const { ctx, k } = setupCanvas(BW, BH);
    // рисуем в координатах плоттера; экран показывает поле сверху (дальний край — вверху),
    // поэтому, если ноль справа/сверху, отражаем картинку
    ctx.transform(originRight() ? -1 : 1, 0, 0, originTop() ? 1 : -1, originRight() ? BW : 0, originTop() ? 0 : BH);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, BW, BH);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.5 / k;
    ctx.beginPath();
    for (let x = 0; x <= BW; x += 10) { ctx.moveTo(x, 0); ctx.lineTo(x, BH); }
    for (let y = 0; y <= BH; y += 10) { ctx.moveTo(0, y); ctx.lineTo(BW, y); }
    ctx.stroke();
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2 / k;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.moveTo(0, 0); ctx.lineTo(0, 20); ctx.stroke();
    const gc = G(), tf = PlotGcode.makeTransform(gc);
    const poly = (pts, fill, stroke) => {
      ctx.beginPath(); pts.map(tf).forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1 / k; ctx.stroke(); }
    };
    const rect = (x0, x1) => [[x0, 0], [x1, 0], [x1, cfg.pageH], [x0, cfg.pageH]];
    const corners = rect(0, gc.pageW).map(tf);
    if (cfg.spread) {
      poly(rect(0, cfg.pageW), '#fff', '#64748b');
      poly(rect(cfg.pageW, gc.pageW - cfg.pageW), '#d6d3d1', '#78716c'); // перегородка
      poly(rect(gc.pageW - cfg.pageW, gc.pageW), '#fff', '#64748b');
    } else poly(rect(0, gc.pageW), '#fff', '#64748b');
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3 / k;
    ctx.beginPath(); ctx.moveTo(corners[0][0], corners[0][1]); ctx.lineTo(corners[1][0], corners[1][1]); ctx.stroke();
    if ($('showLines').checked && page.baselines) {
      ctx.strokeStyle = 'rgba(22,163,74,.55)'; ctx.lineWidth = 1 / k;
      ctx.beginPath();
      for (const b of page.baselines) {
        const a = tf([b.x0, b.y]), c = tf([b.x1, b.y]);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]);
      }
      ctx.stroke();
    }
    const dpr = window.devicePixelRatio || 1;
    const text = (t, x, y, color, dy) => { // текст всегда читаемый: рисуем в экранных пикселях
      const pt = ctx.getTransform().transformPoint(new DOMPoint(x, y));
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = color; ctx.font = `bold ${12 * dpr}px sans-serif`;
      const w = ctx.measureText(t).width;
      const c = $('canvas');
      ctx.fillText(t, Math.max(2, Math.min(c.width - w - 2, pt.x + 4 * dpr)), Math.max(14 * dpr, Math.min(c.height - 4 * dpr, pt.y + (dy || -4) * dpr)));
      ctx.restore();
    };
    drawPath(ctx, k, { clamp: p => p, fromMachine: p => p, text, lw: 1, yUp: !originTop() });
    text('0,0 плоттера', 0, 0, '#475569', originTop() ? 16 : -6);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cw = $('canvas').width, chh = $('canvas').height;
    ctx.font = `${12 * dpr}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.fillText('↑ дальний край плоттера', cw / 2, 14 * dpr);
    ctx.fillStyle = '#b45309';
    ctx.fillText(cfg.spread ? 'оранжевая линия — верх разворота, серое — перегородка' : 'оранжевая линия — верх листа', cw / 2, chh - 22 * dpr);
    ctx.fillStyle = '#64748b';
    ctx.fillText('↓ ближний к вам край', cw / 2, chh - 6 * dpr);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ---------- симуляция ----------
  function stopSim() {
    sim.running = false;
    $('simPlay').textContent = '▶ Симуляция';
  }
  function step(ts) {
    if (!sim.running) return;
    const dt = sim.last ? (ts - sim.last) / 1000 : 0;
    sim.last = ts;
    sim.t += dt * (+$('simSpeed').value || 1);
    if (sim.t >= path.total) { sim.t = path.total; stopSim(); }
    $('simPos').value = Math.round(sim.t / Math.max(path.total, 1e-9) * 1000);
    draw();
    if (sim.running) requestAnimationFrame(step);
  }
  function toggleSim() {
    if (sim.running) { stopSim(); return; }
    if (!path || !path.total) return;
    if (sim.t === Infinity || sim.t >= path.total) sim.t = 0;
    sim.running = true; sim.last = 0;
    $('simPlay').textContent = '⏸ Пауза';
    requestAnimationFrame(step);
  }

  // ---------- скачивание ----------
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const pad = n => String(n).padStart(2, '0');
  const pageName = i => `stranica_${pad(i + cfg.firstPage)}.gcode`;

  // ---------- события ----------
  function bind() {
    document.querySelectorAll('#settings input, #settings select, #settings textarea').forEach(el => {
      el.addEventListener('input', schedule);
      el.addEventListener('change', schedule);
    });
    $('text').addEventListener('input', schedule);
    $('docFile').onchange = async e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      const info = $('docInfo');
      info.textContent = 'Читаю «' + file.name + '»…';
      try {
        const r = await PlotImport.readFile(file, (n, total) => { info.textContent = `Читаю PDF: страница ${n} из ${total}…`; });
        if (!r.text.trim()) throw new Error('в файле не нашлось текста (возможно, это скан — картинки, а не текст)');
        const cur = $('text').value.trim();
        if (!cur || cur === SAMPLE.trim() || confirm('Заменить текущий текст содержимым файла?\n\nОК — заменить,  Отмена — добавить в конец.')) $('text').value = r.text;
        else $('text').value = $('text').value.replace(/\s+$/, '') + '\n\n' + r.text;
        const nf = (r.text.match(/\$/g) || []).length;
        info.textContent = `Загружено из ${r.kind}: «${file.name}»` + (r.kind === 'Word' && nf ? ', формулы перенесены' : '') +
          (r.pictures ? `, рисунков: ${r.pictures}` : '') + (r.skipped ? ` (не удалось перенести: ${r.skipped})` : '') +
          (r.kind === 'PDF' ? ' — проверьте формулы: из PDF они переносятся только частично' : '');
        schedule();
      } catch (err) {
        info.textContent = '';
        alert('Не удалось открыть файл: ' + err.message);
      }
    };
    $('imgFile').onchange = async e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      const info = $('docInfo');
      info.textContent = 'Превращаю рисунок в линии…';
      try {
        const id = await PlotImages.add(new Uint8Array(await file.arrayBuffer()));
        const im = PlotImages.info(id);
        const line = `[рисунок: ${id}; ширина ${Math.min(90, Math.max(20, Math.round(im.w * 0.2)))}]`;
        const t = $('text'), pos = t.selectionStart ?? t.value.length;
        const before = t.value.slice(0, pos), after = t.value.slice(pos);
        t.value = before + (before && !before.endsWith('\n') ? '\n' : '') + line + (after.startsWith('\n') ? '' : '\n') + after;
        info.textContent = `Рисунок «${file.name}» вставлен (${im.paths.length} линий). Ширину можно поменять в строке [рисунок: …; ширина N].`;
        schedule();
      } catch (err) { info.textContent = ''; alert('Не удалось вставить рисунок: ' + err.message); }
    };
    $('demoBtn').onclick = () => {
      const cur = $('text').value.trim();
      if (cur && cur !== SAMPLE.trim() && !confirm('Заменить текущий текст демонстрационным примером?')) return;
      $('text').value = SAMPLE; schedule();
    };
    $('preset').addEventListener('change', () => {
      const v = $('preset').value;
      const p = PAGE_PRESETS[v];
      if (p) { $('pageW').value = p[0]; $('pageH').value = p[1]; }
      const u = userNotebooks().find(n => 'u:' + n.id === v);
      if (u) for (const k of NB_KEYS) if (u[k] !== undefined) $(k).value = u[k];
      $('nbDelBtn').disabled = !u;
      if (u) $('nbName').value = u.name;
      schedule();
    });
    $('nbSaveBtn').onclick = () => {
      const name = $('nbName').value.trim();
      if (!name) { $('nbName').focus(); $('nbName').placeholder = 'Сначала впишите название'; return; }
      readForm();
      const list = userNotebooks();
      let nb = list.find(n => n.name.toLowerCase() === name.toLowerCase());
      if (!nb) { nb = { id: Date.now().toString(36), name }; list.push(nb); }
      for (const k of NB_KEYS) nb[k] = cfg[k];
      localStorage.setItem('plotterNotebooks', JSON.stringify(list));
      fillNotebookOptions('u:' + nb.id);
      cfg.preset = 'u:' + nb.id; save();
      $('nbSaveBtn').textContent = 'Сохранено ✓';
      setTimeout(() => { $('nbSaveBtn').textContent = '💾 Сохранить тетрадь'; }, 1500);
    };
    $('nbDelBtn').onclick = () => {
      const v = $('preset').value;
      const list = userNotebooks();
      const nb = list.find(n => 'u:' + n.id === v);
      if (!nb || !confirm(`Удалить сохранённую тетрадь «${nb.name}»?`)) return;
      localStorage.setItem('plotterNotebooks', JSON.stringify(list.filter(n => n !== nb)));
      fillNotebookOptions('custom'); $('nbName').value = ''; schedule();
    };
    ['pageW', 'pageH'].forEach(id => $(id).addEventListener('input', () => {
      // изменили размер вручную — это уже не готовый формат (свою тетрадь можно пересохранить под тем же названием)
      if (!$('preset').value.startsWith('u:')) $('preset').value = 'custom';
    }));
    $('penPreset').addEventListener('change', () => { updatePenUI(true); schedule(); });
    $('fw').addEventListener('change', schedule);
    const testPen = up => {
      readForm();
      if (!sender || !sender.connected) { alert('Сначала подключите плоттер: справа кнопка «🔌 Подключить».'); return; }
      const c = up ? cfg.penUp : cfg.penDown;
      c.split('\n').map(l => l.replace(/;.*/, '').trim()).filter(Boolean).forEach(l => sender.command(l));
    };
    $('penTestUp').onclick = () => testPen(true);
    $('penTestDown').onclick = () => testPen(false);
    ['penUp', 'penDown'].forEach(id => $(id).addEventListener('input', () => { $('penPreset').value = 'custom'; updatePenUI(false); }));
    $('prev').onclick = () => { if (pageIdx > 0) { pageIdx--; render(); } };
    $('next').onclick = () => { if (pageIdx < sheets.length - 1) { pageIdx++; render(); } };
    $('showTravel').onchange = () => draw();
    $('showLines').onchange = () => draw();
    $('simPlay').onclick = toggleSim;
    $('simPos').oninput = () => { stopSim(); sim.t = $('simPos').value >= 1000 ? Infinity : $('simPos').value / 1000 * path.total; draw(); };
    $('view').onchange = () => { zoom.z = 1; zoom.px = zoom.py = 0; render(); };
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 150); });

    $('dlPage').onclick = () => download(pageName(pageIdx), currentGcode().text);
    $('dlAll').onclick = () => download('vse_stranicy.gcode', PlotGcode.program(sheets, G(), null).text);
    $('dlEach').onclick = () => {
      sheets.forEach((p, i) => setTimeout(() => download(pageName(i), PlotGcode.program(sheets, G(), i).text), i * 400));
    };
    $('copyPage').onclick = async () => {
      try { await navigator.clipboard.writeText(currentGcode().text); $('copyPage').textContent = 'Скопировано ✓'; }
      catch (e) { $('gcodeOut').select(); document.execCommand('copy'); }
      setTimeout(() => { $('copyPage').textContent = 'Копировать G-code страницы'; }, 1500);
    };
    $('saveCfg').onclick = () => download('nastroiki_plottera.json', JSON.stringify(cfg, null, 2));
    $('loadCfg').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { cfg = Object.assign({}, DEFAULTS, JSON.parse(t)); fillForm(); recompute(); })
        .catch(err => alert('Не удалось прочитать файл: ' + err.message));
    };
    $('resetCfg').onclick = () => {
      if (!confirm('Вернуть все настройки по умолчанию?')) return;
      cfg = Object.assign({}, DEFAULTS); fillForm(); recompute();
    };
    document.addEventListener('keydown', e => {
      // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z — по физической клавише, чтобы работало и в русской раскладке
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) {
        if (e.target.tagName === 'INPUT' && e.target.type === 'text' && e.target.id === 'nbName') return;
        e.preventDefault();
        restoreHistory(e.code === 'KeyY' || e.shiftKey ? 1 : -1);
        return;
      }
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') $('prev').click();
      if (e.key === 'ArrowRight') $('next').click();
    });
  }

  // ---------- печать по USB ----------
  const live = { active: false, page: -1, stroke: -1, pen: false, pos: null };
  let sender = null, drawQueued = false;
  const queueDraw = () => { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; if (path) draw(); }); };

  function logLine(text, kind) {
    const el = $('serialLog');
    const div = document.createElement('div');
    div.className = kind || '';
    div.textContent = (kind === 'tx' ? '→ ' : kind === 'rx' ? '← ' : '') + text;
    el.appendChild(div);
    while (el.childNodes.length > 300) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  function setState(name, info) {
    const st = $('connState');
    const names = {
      disconnected: ['не подключён', 'off'], idle: ['подключён', 'on'], printing: ['печать…', 'busy'],
      paused: ['пауза — ручка поднята', 'warn'], pausing: ['останавливаюсь…', 'warn'], waitPage: ['смените лист и нажмите «Продолжить»', 'warn'],
      done: ['готово ✓', 'on'], stopped: ['остановлено', 'warn'],
    };
    const [txt, cls] = names[name] || [name, 'on'];
    st.textContent = txt; st.className = 'pill ' + cls;
    const conn = name !== 'disconnected';
    const busy = name === 'printing' || name === 'paused' || name === 'pausing' || name === 'waitPage';
    $('connect').textContent = conn ? 'Отключить' : '🔌 Подключить';
    $('printPage').disabled = $('printAll').disabled = !conn || busy;
    $('pauseBtn').disabled = name !== 'printing';
    $('resumeBtn').disabled = !(name === 'paused' || name === 'waitPage');
    $('stopBtn').disabled = !busy;
    ['jogUp', 'jogDown', 'jogStart', 'setHome', 'zeroHere', 'flipX', 'flipY'].forEach(id => { $(id).disabled = !conn || busy; });
    document.querySelectorAll('.jb').forEach(b => { b.disabled = !conn || busy; });
    // во время печати нельзя менять текст и настройки — иначе картинка разойдётся с тем, что печатается
    document.querySelectorAll('#settings input, #settings select, #settings textarea, #text, #prev, #next').forEach(el => { el.disabled = busy; });
    $('fw').disabled = $('baud').disabled = conn;
    live.active = busy || (live.active && name === 'done');
    if (name === 'paused' || name === 'waitPage') live.pen = false;
    if (name === 'waitPage') logLine(`${cfg.spread ? 'Разворот ' + (live.page + 1) : 'Страница ' + (live.page + cfg.firstPage)} готов${cfg.spread ? '' : 'а'}. Переверните/смените лист, положите тетрадь на то же место и нажмите «Продолжить».`, 'info');
    queueDraw();
  }

  function initSerial() {
    if (!window.PlotterSender || !PlotterSender.supported()) {
      $('serialNote').innerHTML = '⚠ Этот браузер не умеет работать с USB-портом. Откройте приложение в <b>Chrome</b>, <b>Edge</b> или <b>Яндекс.Браузере</b> на компьютере. ' +
        'Либо скачайте G-code и печатайте своей программой (тогда положение ручки здесь не видно).';
      $('connect').disabled = true;
      return;
    }
    const grbl = {};
    const showDiag = () => {
      const el = $('grblDiag');
      if (cfg.fw !== 'grbl' || grbl[32] === undefined) { el.innerHTML = ''; return; }
      let h = `<div class="ok">GRBL: $30 (макс. S) = ${grbl[30] ?? '?'}, $32 (лазерный режим) = ${grbl[32]}</div>`;
      if (+grbl[32] === 1 && ['servo', 'servoM5', 'solenoid'].includes(cfg.penPreset)) {
        h += `<div class="warn">Включён <b>лазерный режим</b> ($32=1): в нём команда M3 S… работает только во время рисования,
          а в паузах и на холостых ходах сигнал пропадает — ручка не поднимается/не опускается.
          <br><button type="button" id="fixLaser">Выключить лазерный режим ($32=0)</button></div>`;
      }
      const top = Math.max(+cfg.penUpVal || 0, +cfg.penDownVal || 0);
      if (grbl[30] !== undefined && ['servo', 'servoM5', 'solenoid'].includes(cfg.penPreset) && top > +grbl[30]) {
        h += `<div class="warn">S = ${top} больше, чем $30 = ${grbl[30]} — GRBL обрежет значение. Уменьшите S или увеличьте $30.</div>`;
      }
      el.innerHTML = h;
      const b = $('fixLaser');
      if (b) b.onclick = () => { sender.command('$32=0'); setTimeout(() => sender.command('$$'), 400); };
    };
    sender = new PlotterSender({
      setting: (n, v) => { grbl[n] = v; if (n === 32 || n === 30) showDiag(); },
      log: logLine,
      state: setState,
      status: ({ state, x, y, override }) => {
        if (x != null) live.pos = [x, y];
        $('liveInfo').textContent = `Станок: ${state}` + (x != null ? `   X ${x.toFixed(2)}  Y ${y.toFixed(2)}` : '') +
          (override && override !== 100 ? `   ·  скорость ${override} %` : '') +
          (live.active ? `   ·  ручка ${live.pen ? 'пишет' : 'поднята'}` : '');
        if (live.active || $('view').value === 'bed') queueDraw();
      },
      progress: ({ acked, total, meta }) => {
        $('printProg').value = Math.round(acked / total * 1000);
        if (meta && meta.page >= 0) {
          live.stroke = meta.stroke; live.pen = meta.pen;
          if (meta.page !== live.page || meta.page !== pageIdx) {
            live.page = meta.page;
            if (pageIdx !== live.page) { pageIdx = live.page; render(); }
          }
        }
        queueDraw();
      },
    });
    /** Что сделать после «Стоп»: поднять ручку и (если включено) уехать в точку старта */
    const afterStop = () => {
      const l = cfg.penUp.split('\n').map(x => x.replace(/;.*/, '').trim()).filter(Boolean);
      if ($('parkOnStop').checked) l.push('G90', `G0 X${+cfg.startX || 0} Y${+cfg.startY || 0}`);
      return l;
    };

    // ----- автоподбор способа подъёма ручки -----
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const CANDIDATES = [
      { name: 'ось Z (Z 3 ↔ Z 0)', method: 'z', a: 3, b: 0, extra: 600 },
      { name: 'ось Z в минус (Z 0 ↔ Z −3)', method: 'z', a: 0, b: -3, extra: 600 },
      { name: 'серво M3 S (0 ↔ 90)', method: 'servo', a: 0, b: 90 },
      { name: 'серво M3 S (0 ↔ 255)', method: 'servo', a: 0, b: 255 },
      { name: 'серво M3 S (0 ↔ 1000)', method: 'servo', a: 0, b: 1000 },
      { name: 'M5 ↔ M3 S1000 (серво или соленоид)', method: 'servoM5', a: 0, b: 1000 },
      { name: 'серво M280 (Marlin, 30° ↔ 90°)', method: 'm280', a: 30, b: 90, extra: 0 },
    ];
    const candCmd = (c, v, isA) => {
      switch (c.method) {
        case 'z': return [`G90`, `G1 Z${v} F${c.extra}`];
        case 'servo': return [`M3 S${v}`];
        case 'servoM5': return [isA ? 'M5' : `M3 S${v}`];
        case 'm280': return [`M280 P${c.extra} S${v}`];
      }
    };
    $('penAuto').onclick = async () => {
      if (!sender || !sender.connected) { alert('Сначала подключите плоттер: справа кнопка «🔌 Подключить».'); return; }
      if (cfg.fw === 'grbl' && +grbl[32] === 1 &&
          confirm('В GRBL включён лазерный режим ($32=1) — с ним сервопривод ручки не работает. Выключить его ($32=0)?')) {
        sender.command('$32=0'); await sleep(500); sender.command('$$'); await sleep(500);
      }
      if (!confirm('Сейчас плоттер будет по очереди пробовать разные способы поднять/опустить ручку.\n' +
        'Каждый раз ручка (если способ подходит) дёрнется вверх-вниз 2 раза, и программа спросит, было ли движение.\n\n' +
        'Каретка по X/Y двигаться не будет. Начать?')) return;
      $('penAuto').disabled = true;
      try {
        for (const c of CANDIDATES) {
          if (cfg.fw === 'marlin' && c.method !== 'z' && c.method !== 'm280') continue;
          if (cfg.fw === 'grbl' && c.method === 'm280') continue;
          logLine('Пробую: ' + c.name, 'info');
          for (let i = 0; i < 2; i++) {
            candCmd(c, c.a, true).forEach(x => sender.command(x)); await sleep(1300);
            candCmd(c, c.b, false).forEach(x => sender.command(x)); await sleep(1300);
          }
          if (!confirm(`Способ: ${c.name}\n\nРучка двигалась вверх-вниз?\nОК — да, двигалась.   Отмена — нет, пробовать следующий.`)) continue;
          const bDown = confirm('Отлично! Сейчас ручка ОПУЩЕНА (касается бумаги)?\nОК — да, опущена.   Отмена — нет, поднята.');
          const up = bDown ? c.a : c.b, down = bDown ? c.b : c.a;
          if (c.method === 'servoM5' && !bDown) {
            alert('У этого способа «поднято» — это M5. Похоже, у вас наоборот — выберите «Свои команды» и поменяйте местами M5 и M3.');
          }
          $('penPreset').value = c.method; updatePenUI(true);
          $('penUpVal').value = up; $('penDownVal').value = down;
          if (c.extra !== undefined) $('penExtra').value = c.extra;
          recompute();
          cfg.penUp.split('\n').forEach(x => x.trim() && sender.command(x.trim()));
          logLine(`Найдено: ${c.name}. Поднять: ${cfg.penUp.replace(/\n/g, '; ')} · Опустить: ${cfg.penDown.replace(/\n/g, '; ')}`, 'info');
          alert('Готово! Способ сохранён, ручка поднята.\n\nЕсли ручка опускается слишком сильно или не дожимает до бумаги — подправьте число «опущено» и проверьте кнопкой «▼ Проверить: опустить».');
          return;
        }
        alert('Ни один способ не сдвинул ручку.\n\nПроверьте, что у ручки есть питание/провод, и пришлите текст из чёрного журнала внизу панели «Плоттер (USB)» — по нему можно определить прошивку.');
      } finally { $('penAuto').disabled = false; }
    };

    $('connect').onclick = async () => {
      try {
        if (sender.connected) {
          if (sender.job && !sender.job.finished && !confirm('Идёт печать. Остановить её и отключиться?')) return;
          if (sender.job && !sender.job.finished) await sender.stop(afterStop());
          $('connect').disabled = true; $('connect').textContent = 'Отключаю…';
          try { await sender.disconnect(); } finally { $('connect').disabled = false; }
        }
        else {
          await sender.connect($('baud').value, $('fw').value);
          rememberPort();
        }
      } catch (e) {
        if (e.name !== 'NotFoundError') logLine('Не удалось подключиться: ' + e.message, 'err');
        setState('disconnected');
      }
    };

    // ----- автоподключение к последнему плоттеру -----
    // Запоминаем USB-идентификаторы платы; при запуске и при подключении кабеля ищем её среди разрешённых портов.
    const portKey = port => { const i = port.getInfo ? port.getInfo() : {}; return { vid: i.usbVendorId ?? null, pid: i.usbProductId ?? null }; };
    function rememberPort() {
      if (!sender.port) return;
      localStorage.setItem('plotterLastPort', JSON.stringify(portKey(sender.port)));
      $('autoConn').checked = true; localStorage.setItem('plotterAutoConn', '1');
    }
    let autoBusy = false;
    async function autoConnect(reason) {
      if (autoBusy || sender.connected || !$('autoConn').checked || !navigator.serial.getPorts) return;
      let saved;
      try { saved = JSON.parse(localStorage.getItem('plotterLastPort') || 'null'); } catch (e) { saved = null; }
      if (!saved) return;
      autoBusy = true;
      try {
        const ports = await navigator.serial.getPorts();
        const port = ports.find(p => { const k = portKey(p); return k.vid === saved.vid && k.pid === saved.pid; });
        if (!port) { if (reason === 'start') logLine('Последний плоттер не найден — подключите его кабелем, он подключится сам.', 'info'); return; }
        logLine(reason === 'plug' ? 'Плоттер подключён к компьютеру — подключаюсь…' : 'Подключаюсь к последнему плоттеру…', 'info');
        await sender.connect(cfg.baud || $('baud').value, cfg.fw || $('fw').value, port);
      } catch (e) {
        logLine('Автоподключение не удалось: ' + e.message + ' (порт может быть занят другой программой)', 'err');
        setState('disconnected');
      } finally { autoBusy = false; }
    }
    $('autoConn').checked = localStorage.getItem('plotterAutoConn') !== '0';
    $('autoConn').onchange = () => localStorage.setItem('plotterAutoConn', $('autoConn').checked ? '1' : '0');
    // плоттер подключили кабелем (или включили) — подключаемся
    navigator.serial.addEventListener('connect', () => setTimeout(() => autoConnect('plug'), 800));
    setTimeout(() => autoConnect('start'), 600);
    // ----- рабочее поле, дом, ручное перемещение -----
    const round2 = v => Math.round(v * 100) / 100;
    const jog = (dx, dy) => {
      if (!sender.connected || (sender.job && !sender.job.finished)) return;
      const st = +$('jogStep').value || 1;
      // стрелки — как видно сверху; если ноль справа/сверху, оси плоттера направлены наоборот
      dx *= st * (originRight() ? -1 : 1); dy *= st * (originTop() ? -1 : 1);
      if (live.pos) { // не выезжаем за рабочее поле
        const tx = Math.max(0, Math.min(cfg.bedW, live.pos[0] + dx)), ty = Math.max(0, Math.min(cfg.bedH, live.pos[1] + dy));
        dx = round2(tx - live.pos[0]); dy = round2(ty - live.pos[1]);
        if (!dx && !dy) { logLine('Дальше — край рабочего поля', 'info'); return; }
      }
      const f = Math.min(+cfg.feedTravel || 3000, 6000);
      if (sender.firmware === 'grbl') sender.command(`$J=G91 G21 X${dx} Y${dy} F${f}`);
      else { sender.command('G91'); sender.command(`G0 X${dx} Y${dy} F${f}`); sender.command('G90'); }
    };
    document.querySelectorAll('.jb').forEach(b => { b.onclick = () => jog(+b.dataset.dx, +b.dataset.dy); });
    $('setHome').onclick = () => {
      if (!live.pos) { alert('Плоттер ещё не сообщил координаты — подождите секунду и нажмите снова.'); return; }
      const [x, y] = live.pos.map(round2);
      $('homeCorner').value = 'custom';
      $('startX').value = x; $('startY').value = y;
      logLine(`Точка дома запомнена: X ${x}, Y ${y}`, 'info');
      schedule();
    };
    const flipOrigin = axis => {
      const c = cfg.originCorner || 'bl';
      const v = axis === 'y' ? (c[0] === 't' ? 'b' : 't') + c[1] : c[0] + (c[1] === 'l' ? 'r' : 'l');
      $('originCorner').value = v;
      const names = { bl: '↙ левый нижний', tl: '↖ левый верхний', br: '↘ правый нижний', tr: '↗ правый верхний' };
      logLine(`Ноль плоттера теперь: ${names[v]}. Стрелки и печать перевёрнуты по ${axis === 'y' ? 'вертикали' : 'горизонтали'} — проверьте ещё раз.`, 'info');
      schedule();
    };
    $('flipY').onclick = () => flipOrigin('y');
    $('flipX').onclick = () => flipOrigin('x');
    $('zeroHere').onclick = () => {
      if (!confirm('Сделать текущее положение ручки точкой 0,0 плоттера?\n\nНужно, если после включения плоттер считает нулём не тот угол. ' +
        'Обычно ноль — левый нижний (ближний левый) угол рабочего поля.')) return;
      sender.command(sender.firmware === 'grbl' ? 'G10 L20 P1 X0 Y0' : 'G92 X0 Y0');
      logLine('Текущее положение теперь 0,0', 'info');
    };
    $('bedFromPlotter').onclick = () => {
      if (!sender.connected) { alert('Сначала подключите плоттер.'); return; }
      if (sender.firmware !== 'grbl') { alert('Читать размер поля умею только у GRBL. Для Marlin введите размеры вручную.'); return; }
      if (!(+grbl[130] > 0) || !(+grbl[131] > 0)) { sender.command('$$'); alert('Запросил настройки у плоттера — нажмите ещё раз через секунду.'); return; }
      $('bedW').value = +grbl[130]; $('bedH').value = +grbl[131];
      logLine(`Рабочее поле из плоттера: ${grbl[130]} × ${grbl[131]} мм`, 'info');
      schedule();
    };

    /** Вылезает ли программа за рабочее поле: проверяем все координаты X/Y */
    const outOfField = lines => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const l of lines) {
        if (/^\s*;/.test(l)) continue;
        const mx = /X(-?[\d.]+)/.exec(l), my = /Y(-?[\d.]+)/.exec(l);
        if (mx) { minX = Math.min(minX, +mx[1]); maxX = Math.max(maxX, +mx[1]); }
        if (my) { minY = Math.min(minY, +my[1]); maxY = Math.max(maxY, +my[1]); }
      }
      const e = 0.01;
      return (minX < -e || minY < -e || maxX > cfg.bedW + e || maxY > cfg.bedH + e)
        ? `X от ${round2(minX)} до ${round2(maxX)}, Y от ${round2(minY)} до ${round2(maxY)}` : null;
    };

    const startPrint = which => {
      const prog = PlotGcode.program(sheets, G(), which);
      const out = outOfField(prog.lines);
      if (out && !confirm(`Печать выходит за рабочее поле плоттера (${cfg.bedW} × ${cfg.bedH} мм):\n${out}.\n\n` +
        'Плоттер может упереться в край. Проверьте «X/Y угла» тетради и размер поля.\nВсё равно печатать?')) return;
      live.active = true; live.page = which == null ? 0 : which; live.stroke = -1; live.pen = false;
      if (pageIdx !== live.page) { pageIdx = live.page; render(); }
      $('printProg').value = 0;
      sender.start(prog.lines, prog.meta);
      sender.setFeed(cfg.feedDraw);
    };
    $('printPage').onclick = () => startPrint(pageIdx);
    $('printAll').onclick = () => startPrint(null);
    const lns = t => t.split('\n').map(l => l.replace(/;.*/, '').trim()).filter(Boolean);
    $('pauseBtn').onclick = () => sender.pause(lns(cfg.penUp), live.pen);
    $('resumeBtn').onclick = () => sender.resume(lns(cfg.penDown));
    $('stopBtn').onclick = () => sender.stop(afterStop());

    // ----- скорость письма (мм/мин, до 10000) — это то же значение, что «Подача письма» в настройках -----
    const showFeed = v => { $('speed').value = v; $('spdNum').value = v; };
    let spdTimer = null;
    const applyFeed = (v, fromNumber) => {
      v = Math.max(10, Math.min(10000, Math.round(+v || 0)));
      $('spdNum').value = v;
      $('speed').value = v;
      if (sender.connected) sender.setFeed(v);
      cfg.feedDraw = v; $('feedDraw').value = v;
      clearTimeout(spdTimer);
      // пока идёт печать, лист не пересчитываем (настройки заблокированы); иначе — обновим оценку времени
      spdTimer = setTimeout(() => { save(); if (!(sender.job && !sender.job.finished)) schedule(); }, 300);
    };
    $('speed').oninput = () => applyFeed($('speed').value);
    $('spdNum').onchange = () => applyFeed($('spdNum').value, true);
    $('spdMinus').onclick = () => applyFeed(+$('spdNum').value - 250);
    $('spdPlus').onclick = () => applyFeed(+$('spdNum').value + 250);
    $('feedDraw').addEventListener('input', () => showFeed(Math.min(10000, +$('feedDraw').value || 0)));
    showFeed(cfg.feedDraw);
    const cmds = t => t.split('\n').map(l => l.replace(/;.*/, '').trim()).filter(Boolean).forEach(c => sender.command(c));
    $('jogUp').onclick = () => cmds(cfg.penUp);
    $('jogDown').onclick = () => cmds(cfg.penDown);
    $('jogStart').onclick = () => cmds(`${cfg.penUp}\nG90\nG0 X${+cfg.startX || 0} Y${+cfg.startY || 0}`);
    setState('disconnected');
  }

  // ---------- свои шрифты (хранятся в IndexedDB, чтобы пережить перезапуск) ----------
  const fonts = new Map();   // id → загруженный шрифт
  let fontsReady = false;
  const fontDB = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('plotterFonts', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('fonts', { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction('fonts', mode); const st = t.objectStore('fonts');
      const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error);
    }));
    return {
      all: () => tx('readonly', st => st.getAll()),
      put: rec => tx('readwrite', st => st.put(rec)),
      del: id => tx('readwrite', st => st.delete(id)),
    };
  })();

  function fontOptions() {
    const sel = $('fontSel');
    sel.innerHTML = '<option value="builtin">Встроенный (однолинейный)</option>';
    for (const [id, f] of fonts) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = `${f.name} — ${f.kind === 'outline' ? 'по контуру' : 'однолинейный'}`;
      sel.appendChild(o);
    }
    if (cfg.fontSel !== 'builtin' && !fonts.has(cfg.fontSel) && !fontsReady) {
      // шрифт ещё читается из хранилища — не сбрасываем выбор
      const o = document.createElement('option'); o.value = cfg.fontSel; o.textContent = '(загружается…)'; sel.appendChild(o);
    }
    sel.value = fonts.has(cfg.fontSel) || !fontsReady ? cfg.fontSel : 'builtin';
    $('fontDel').disabled = sel.value === 'builtin';
  }

  async function addFont(id, name, buf) {
    const f = await PlotCustomFont.load(name, buf);
    fonts.set(id, f);
    return f;
  }

  async function initFonts() {
    try {
      for (const rec of await fontDB.all()) {
        try { await addFont(rec.id, rec.name, rec.data); } catch (e) { console.warn('шрифт не загрузился', rec.name, e); }
      }
    } catch (e) { console.warn('хранилище шрифтов недоступно', e); }
    fontsReady = true;
    fontOptions();
    if (cfg.fontSel !== 'builtin' && fonts.has(cfg.fontSel)) recompute();
  }

  $('fontFile').onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const id = 'f' + Date.now();
      const name = file.name.replace(/\.[^.]+$/, '');
      const f = await addFont(id, name, buf);
      // проверим, что буквы правда есть
      const probe = Array.from('АБВГДЕЖЗИКЛМНОПРСТУФХабвгдежзиклмнопрстуфхэюяABCDEFGHabcdefgh0123456789').filter(c => f.get(c)).length;
      if (!probe) throw new Error('в шрифте не нашлось ни русских, ни латинских букв');
      try { await fontDB.put({ id, name, data: buf }); } catch (err) { alert('Шрифт загружен, но не сохранится после перезапуска: ' + err.message); }
      cfg.fontSel = id; fontOptions(); $('fontSel').value = id;
      const nRu = Array.from('абвгдеёжзийклмнопрстуфхцчшщъыьэюя').filter(c => f.get(c)).length;
      const ru = nRu === 33 ? 'все русские буквы есть' : nRu ? `русских строчных букв ${nRu} из 33 — недостающие будут встроенным шрифтом` : 'русских букв нет — они будут встроенным шрифтом';
      $('fontInfo').textContent = `Загружен «${name}»: ${f.kind === 'outline' ? 'обычный шрифт, буквы рисуются по контуру' : 'однолинейный шрифт'}, ${ru}.`;
      schedule();
    } catch (err) {
      alert('Не удалось загрузить шрифт: ' + err.message);
    }
  };
  $('fontDel').onclick = async () => {
    const id = $('fontSel').value;
    if (id === 'builtin' || !confirm('Удалить этот шрифт из программы?')) return;
    fonts.delete(id);
    try { await fontDB.del(id); } catch (e) { /* */ }
    cfg.fontSel = 'builtin'; fontOptions(); schedule();
  };
  $('fontSel').addEventListener('change', () => { $('fontDel').disabled = $('fontSel').value === 'builtin'; });

  // ---------- свои тетради (размер, клетка, поля) под своими названиями ----------
  const NB_KEYS = ['pageW', 'pageH', 'cell', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight'];
  function userNotebooks() {
    try { const l = JSON.parse(localStorage.getItem('plotterNotebooks') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  function fillNotebookOptions(selected) {
    const sel = $('preset');
    const builtin = [['notebook', 'Школьная тетрадь 170×205'], ['a5', 'A5 148×210'], ['a4', 'A4 210×297'], ['general', 'Общая тетрадь 165×205']];
    sel.innerHTML = '';
    const add = (v, t, parent) => { const o = document.createElement('option'); o.value = v; o.textContent = t; (parent || sel).appendChild(o); };
    const mine = userNotebooks();
    if (mine.length) {
      const g = document.createElement('optgroup'); g.label = 'Мои тетради';
      for (const n of mine) add('u:' + n.id, `${n.name} — ${n.pageW}×${n.pageH}`, g);
      sel.appendChild(g);
    }
    const g2 = document.createElement('optgroup'); g2.label = 'Стандартные';
    for (const [v, t] of builtin) add(v, t, g2);
    sel.appendChild(g2);
    add('custom', 'Свой размер (не сохранён)');
    sel.value = selected && Array.from(sel.options).some(o => o.value === selected) ? selected : 'custom';
    const u = mine.find(n => 'u:' + n.id === sel.value);
    $('nbDelBtn').disabled = !u;
    if (u) $('nbName').value = u.name;
  }

  // ---------- самообновление (только в настольной программе) ----------
  function initUpdates() {
    if (!window.desktop) return;
    const fmt = d => d ? new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const showInfo = () => desktop.info().then(i => {
      $('verInfo').innerHTML = `версия от ${fmt(i.date)} <button type="button" id="updCheck">Проверить обновления</button>`;
      $('updCheck').onclick = async () => {
        $('updCheck').textContent = 'Проверяю…';
        const v = await desktop.checkNow();
        $('updCheck').textContent = v ? 'Есть обновление ↑' : 'Обновлений нет ✓';
        setTimeout(showInfo, 3000);
      };
    });
    showInfo();
    desktop.onUpdate(info => {
      $('updText').textContent = `Загружена новая версия программы (${fmt(info.date)})${info.notes ? ': ' + info.notes : ''}.` +
        ' Включится при следующем запуске или сейчас:';
      $('updBar').hidden = false;
    });
    $('updLater').onclick = () => { $('updBar').hidden = true; };
    $('updApply').onclick = async () => {
      if (sender && sender.job && !sender.job.finished) {
        alert('Сейчас идёт печать. Обновление включится после неё или при следующем запуске.');
        return;
      }
      if (sender && sender.connected) await sender.disconnect();
      desktop.applyUpdate();
    };
  }

  fillNotebookOptions(cfg.preset);
  fillForm();
  // при первом открытии (или если поле пустое) — демонстрационный текст
  const savedText = localStorage.getItem('plotterText');
  $('text').value = savedText && savedText.trim() ? savedText : SAMPLE;
  bind();
  $('undoBtn').onclick = () => restoreHistory(-1);
  $('redoBtn').onclick = () => restoreHistory(1);
  initZoom();
  initSerial();
  initUpdates();
  fontOptions();
  recompute();
  initFonts();
  // рисунки из прошлых сеансов — подгружаем и пересчитываем лист
  PlotImages.loadAll().then(n => { if (n) recompute(); });
})();
