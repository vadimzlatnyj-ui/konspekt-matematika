/* Интерфейс приложения */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  const PAGE_PRESETS = {
    notebook: [170, 205], a5: [148, 210], a4: [210, 297], general: [165, 205],
  };
  const PEN_PRESETS = {
    servo: { penUp: 'M3 S90\nG4 P0.2', penDown: 'M3 S30\nG4 P0.2' },
    z: { penUp: 'G0 Z5', penDown: 'G1 Z0 F1000' },
    m280: { penUp: 'M280 P0 S90\nG4 P150', penDown: 'M280 P0 S30\nG4 P150' },
  };

  const DEFAULTS = {
    preset: 'notebook', pageW: 170, pageH: 205, cell: 5,
    marginTop: 10, marginBottom: 10, marginLeft: 5, marginRight: 25,
    mirrorMargins: true, snapToGrid: true, firstPage: 1,
    offsetX: 20, offsetY: 20, rotation: 0, mirrorX: false, mirrorY: false, bedW: 300, bedH: 300,
    capHeight: 4, linePitch: 10, letterSpacing: 1.2, wordSpacing: 4, slant: 0, indent: 0,
    fracScale: 0.8, scriptScale: 0.65, centerDisplay: true,
    penPreset: 'servo', penUp: PEN_PRESETS.servo.penUp, penDown: PEN_PRESETS.servo.penDown,
    feedDraw: 1500, feedTravel: 4000, penDelay: 0.2, travelG0: true,
    header: 'G21 ; миллиметры\nG90 ; абсолютные координаты',
    betweenPages: 'G0 X{startX} Y{startY}\nM0 ; Страница {page} готова. Переверните лист и продолжите',
    footer: 'G0 X{startX} Y{startY}\nM2',
    decimals: 2, joinDistance: 0.1, order: 'lines', startX: 0, startY: 0, startRow: 1,
  };

  const SAMPLE = String.raw`Задача 1. Решите уравнение $x^2 - 5x + 6 = 0$.
Решение: найдём дискриминант
$$D = b^2 - 4ac = 25 - 24 = 1$$
$$x_{1,2} = \frac{5 \pm \sqrt{1}}{2}$$
Ответ: $x_1 = 2$, $x_2 = 3$.

Задача 2. Вычислите $\lim_{x \to 0} \frac{\sin x}{x}$ и интеграл:
$$\int_0^1 x^2\,dx = \frac{x^3}{3}\Big|_0^1 = \frac{1}{3}$$

Задача 3. Решите систему:
$$\begin{cases} x + y = 5 \\ x - y = 1 \end{cases} \Rightarrow x = 3,\ y = 2$$
Теорема Пифагора: a² + b² = c², площадь круга S = πr².
$$\left(\frac{a+b}{2}\right)^2 \ge ab, \quad \sum_{k=1}^{n} k = \frac{n(n+1)}{2}$$
Задача 4. Постройте график функции $y = x^2 - 2x - 3$.
Вершина параболы: $x_0 = 1$, $y_0 = -4$, нули: $x = -1$ и $x = 3$.
[график: y = x^2 - 2x - 3; x от -3 до 5; точки (1; -4) (-1; 0) (3; 0)]
Ответ: $\log_2 8 = 3$.`;

  const NUM = ['pageW', 'pageH', 'cell', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'firstPage',
    'offsetX', 'offsetY', 'rotation', 'bedW', 'bedH', 'capHeight', 'linePitch', 'letterSpacing', 'wordSpacing',
    'slant', 'indent', 'fracScale', 'scriptScale', 'feedDraw', 'feedTravel', 'penDelay', 'decimals', 'joinDistance', 'startX', 'startY', 'startRow'];
  const BOOL = ['mirrorMargins', 'snapToGrid', 'mirrorX', 'mirrorY', 'centerDisplay', 'travelG0'];
  const STR = ['order', 'preset', 'penPreset', 'penUp', 'penDown', 'header', 'betweenPages', 'footer'];

  let cfg = load();
  let result = { pages: [], warnings: [] };
  let pageIdx = 0;

  function load() {
    try {
      const c = JSON.parse(localStorage.getItem('plotterCfg') || '{}');
      return Object.assign({}, DEFAULTS, c);
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save() { localStorage.setItem('plotterCfg', JSON.stringify(cfg)); }

  function fillForm() {
    for (const k of NUM.concat(STR)) if ($(k)) $(k).value = cfg[k];
    for (const k of BOOL) if ($(k)) $(k).checked = !!cfg[k];
    $('rotation').value = String(cfg.rotation);
  }
  function readForm() {
    for (const k of NUM) { const v = parseFloat($(k).value); if (!isNaN(v)) cfg[k] = v; }
    for (const k of BOOL) cfg[k] = $(k).checked;
    for (const k of STR) cfg[k] = $(k).value;
  }

  // ---------- пересчёт ----------
  let timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(recompute, 200); }

  function recompute() {
    readForm(); save();
    localStorage.setItem('plotterText', $('text').value);
    try {
      result = PlotLayout.layoutDocument($('text').value, cfg);
    } catch (e) {
      console.error(e);
      result = { pages: [{ strokes: [], margins: { left: cfg.marginLeft, right: cfg.marginRight } }], warnings: ['Ошибка вёрстки: ' + e.message] };
    }
    if (pageIdx >= result.pages.length) pageIdx = result.pages.length - 1;
    if (pageIdx < 0) pageIdx = 0;
    // проверка выхода за стол
    const tf = PlotGcode.makeTransform(cfg);
    const warns = result.warnings.slice();
    const maxX = +cfg.offsetX + tf.bboxW, maxY = +cfg.offsetY + tf.bboxH;
    if (cfg.offsetX < 0 || cfg.offsetY < 0 || maxX > cfg.bedW || maxY > cfg.bedH)
      warns.push(`Тетрадь выходит за пределы стола (${maxX.toFixed(0)}×${maxY.toFixed(0)} мм при столе ${cfg.bedW}×${cfg.bedH}).`);
    $('warnings').innerHTML = warns.map(w => `<div>${escapeHtml(w)}</div>`).join('');
    render();
  }

  function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function currentGcode() { return PlotGcode.program(result.pages, cfg, pageIdx); }

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
    const n = result.pages.length;
    const page = result.pages[pageIdx];
    $('pageInfo').textContent = `Страница ${pageIdx + 1 + (cfg.firstPage - 1)} (${pageIdx + 1} из ${n})`;
    const g = currentGcode();
    const all = PlotGcode.program(result.pages, cfg, null);
    const st = g.stats;
    $('stats').innerHTML =
      `Эта страница: письмо ${(st.draw / 1000).toFixed(2)} м, холостые ${(st.travel / 1000).toFixed(2)} м, ` +
      `опусканий ручки ${st.lifts}, ≈ ${fmtT(st.time)}, строк G-code ${g.text.split('\n').length - 1}.<br>` +
      `Все ${n} стр.: ≈ ${fmtT(all.stats.time)}.`;
    $('gcodeOut').value = g.text.length > 400000 ? g.text.slice(0, 400000) + '\n; … (обрезано в окне, файл полный)' : g.text;
    // путь строим из тех же штрихов, что идут в G-code, — номера штрихов совпадают с печатью
    const pg = PlotGcode.pageGcode(page, cfg, pageIdx + 1, n);
    if ($('view').value === 'bed') {
      path = buildPath(pg.machineStrokes, [+cfg.startX || 0, +cfg.startY || 0]);
    } else {
      const inv = PlotGcode.makeTransform(cfg).inverse;
      path = buildPath(pg.machineStrokes.map(st => st.map(inv)), PlotGcode.startOnPage(cfg));
    }
    sim.t = Infinity;
    $('simPos').value = 1000;
    draw();
  }

  function draw() {
    const page = result.pages[pageIdx];
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
    if (simMode) {
      ctx.lineWidth = 2 / k;
      ctx.strokeStyle = down ? '#2563eb' : '#dc2626';
      ctx.fillStyle = down ? 'rgba(37,99,235,.35)' : 'rgba(220,38,38,.15)';
      ctx.beginPath(); ctx.arc(pen[0], pen[1], R * (down ? 0.8 : 1.3), 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      label(down ? 'пишет' : 'поднята', pen[0], pen[1], down ? '#1d4ed8' : '#b91c1c');
    }
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
      const down = live.pen;
      // перекрестие, чтобы ручку было видно издалека
      ctx.strokeStyle = down ? 'rgba(37,99,235,.5)' : 'rgba(220,38,38,.5)'; ctx.lineWidth = 0.8 / k;
      ctx.beginPath(); ctx.moveTo(px - R * 3, py); ctx.lineTo(px + R * 3, py); ctx.moveTo(px, py - R * 3); ctx.lineTo(px, py + R * 3); ctx.stroke();
      ctx.lineWidth = 2.2 / k;
      ctx.strokeStyle = down ? '#2563eb' : '#dc2626';
      ctx.fillStyle = down ? 'rgba(37,99,235,.35)' : 'rgba(220,38,38,.15)';
      ctx.beginPath(); ctx.arc(px, py, R * (down ? 0.9 : 1.4), 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      opts.text(`ручка ${down ? 'пишет' : 'поднята'}`, px, py, down ? '#1d4ed8' : '#b91c1c');
    }
  }

  // ---------- холст ----------
  function setupCanvas(wmm, hmm) {
    const wrap = $('canvasWrap');
    const cw = wrap.clientWidth - 16, ch = wrap.clientHeight - 16;
    const k = Math.max(0.5, Math.min(cw / wmm, ch / hmm));
    const c = $('canvas');
    const dpr = window.devicePixelRatio || 1;
    c.style.width = (wmm * k) + 'px';
    c.style.height = (hmm * k) + 'px';
    c.width = Math.round(wmm * k * dpr);
    c.height = Math.round(hmm * k * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    return { ctx, k };
  }

  function drawPage(page) {
    const W = cfg.pageW, H = cfg.pageH;
    const { ctx, k } = setupCanvas(W, H);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    // клетки
    if (cfg.cell > 0) {
      ctx.strokeStyle = '#c7dcf0'; ctx.lineWidth = 0.6 / k;
      ctx.beginPath();
      for (let x = cfg.cell; x < W; x += cfg.cell) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      const y0 = cfg.marginTop % cfg.cell;
      for (let y = y0; y < H; y += cfg.cell) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }
    const m = page.margins;
    ctx.strokeStyle = '#e05252'; ctx.lineWidth = 1 / k;
    ctx.beginPath();
    if (m.right >= m.left) { ctx.moveTo(W - m.right, 0); ctx.lineTo(W - m.right, H); }
    else { ctx.moveTo(m.left, 0); ctx.lineTo(m.left, H); }
    ctx.stroke();
    ctx.setLineDash([2, 2]); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 0.6 / k;
    ctx.strokeRect(m.left, cfg.marginTop, W - m.left - m.right, H - cfg.marginTop - cfg.marginBottom);
    ctx.setLineDash([]);
    // строки, по которым пишет ручка
    if ($('showLines').checked && page.baselines) {
      ctx.strokeStyle = 'rgba(22,163,74,.55)'; ctx.lineWidth = 1.2 / k;
      ctx.fillStyle = '#15803d'; ctx.font = `${Math.max(2.2, 10 / k)}px sans-serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      page.baselines.forEach((b, i) => {
        ctx.beginPath(); ctx.moveTo(m.left, b.y); ctx.lineTo(W - m.right, b.y); ctx.stroke();
        ctx.fillText(String(i + 1), m.left - 0.8, b.y - 1);
      });
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    const inv = PlotGcode.makeTransform(cfg).inverse;
    drawPath(ctx, k, {
      fromMachine: inv,
      clamp: ([x, y]) => [Math.min(W - 2, Math.max(2, x)), Math.min(H - 2, Math.max(2, y))],
      text: (t, x, y, color) => {
        ctx.fillStyle = color; ctx.font = `bold ${Math.max(2.5, 11 / k)}px sans-serif`;
        const w = ctx.measureText(t).width;
        ctx.fillText(t, Math.min(x + 2, W - w - 1), Math.max(y - 2, 4));
      },
    });
  }

  function drawBed(page) {
    const BW = cfg.bedW, BH = cfg.bedH;
    const { ctx, k } = setupCanvas(BW, BH);
    ctx.transform(1, 0, 0, -1, 0, BH); // станок: Y вверх
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, BW, BH);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.5 / k;
    ctx.beginPath();
    for (let x = 0; x <= BW; x += 10) { ctx.moveTo(x, 0); ctx.lineTo(x, BH); }
    for (let y = 0; y <= BH; y += 10) { ctx.moveTo(0, y); ctx.lineTo(BW, y); }
    ctx.stroke();
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2 / k;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.moveTo(0, 0); ctx.lineTo(0, 20); ctx.stroke();
    const tf = PlotGcode.makeTransform(cfg);
    const corners = [[0, 0], [cfg.pageW, 0], [cfg.pageW, cfg.pageH], [0, cfg.pageH]].map(tf);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1 / k;
    ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3 / k;
    ctx.beginPath(); ctx.moveTo(corners[0][0], corners[0][1]); ctx.lineTo(corners[1][0], corners[1][1]); ctx.stroke();
    if ($('showLines').checked && page.baselines) {
      ctx.strokeStyle = 'rgba(22,163,74,.55)'; ctx.lineWidth = 1 / k;
      ctx.beginPath();
      for (const b of page.baselines) {
        const a = tf([page.margins.left, b.y]), c = tf([cfg.pageW - page.margins.right, b.y]);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]);
      }
      ctx.stroke();
    }
    const text = (t, x, y, color) => { // текст без отражения
      ctx.save(); ctx.translate(x, y); ctx.scale(1, -1);
      ctx.fillStyle = color; ctx.font = `bold ${Math.max(3, 11 / k)}px sans-serif`;
      ctx.fillText(t, 2, -2); ctx.restore();
    };
    drawPath(ctx, k, { clamp: p => p, fromMachine: p => p, text, lw: 1 });
    text('0,0', 24, -1, '#475569');
    text('оранжевая линия — верх листа', 4, BH - 8, '#b45309');
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
    $('preset').addEventListener('change', () => {
      const p = PAGE_PRESETS[$('preset').value];
      if (p) { $('pageW').value = p[0]; $('pageH').value = p[1]; }
      schedule();
    });
    ['pageW', 'pageH'].forEach(id => $(id).addEventListener('input', () => { $('preset').value = 'custom'; }));
    $('penPreset').addEventListener('change', () => {
      const p = PEN_PRESETS[$('penPreset').value];
      if (p) { $('penUp').value = p.penUp; $('penDown').value = p.penDown; }
      schedule();
    });
    ['penUp', 'penDown'].forEach(id => $(id).addEventListener('input', () => { $('penPreset').value = 'custom'; }));
    $('prev').onclick = () => { if (pageIdx > 0) { pageIdx--; render(); } };
    $('next').onclick = () => { if (pageIdx < result.pages.length - 1) { pageIdx++; render(); } };
    $('showTravel').onchange = () => draw();
    $('showLines').onchange = () => draw();
    $('simPlay').onclick = toggleSim;
    $('simPos').oninput = () => { stopSim(); sim.t = $('simPos').value >= 1000 ? Infinity : $('simPos').value / 1000 * path.total; draw(); };
    $('view').onchange = render;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 150); });

    $('dlPage').onclick = () => download(pageName(pageIdx), currentGcode().text);
    $('dlAll').onclick = () => download('vse_stranicy.gcode', PlotGcode.program(result.pages, cfg, null).text);
    $('dlEach').onclick = () => {
      result.pages.forEach((p, i) => setTimeout(() => download(pageName(i), PlotGcode.program(result.pages, cfg, i).text), i * 400));
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
      paused: ['пауза', 'warn'], waitPage: ['смените лист и нажмите «Продолжить»', 'warn'],
      done: ['готово ✓', 'on'], stopped: ['остановлено', 'warn'],
    };
    const [txt, cls] = names[name] || [name, 'on'];
    st.textContent = txt; st.className = 'pill ' + cls;
    const conn = name !== 'disconnected';
    const busy = name === 'printing' || name === 'paused' || name === 'waitPage';
    $('connect').textContent = conn ? 'Отключить' : '🔌 Подключить';
    $('printPage').disabled = $('printAll').disabled = !conn || busy;
    $('pauseBtn').disabled = name !== 'printing';
    $('resumeBtn').disabled = !(name === 'paused' || name === 'waitPage');
    $('stopBtn').disabled = !busy;
    ['jogUp', 'jogDown', 'jogStart'].forEach(id => { $(id).disabled = !conn || busy; });
    // во время печати нельзя менять текст и настройки — иначе картинка разойдётся с тем, что печатается
    document.querySelectorAll('#settings input, #settings select, #settings textarea, #text, #prev, #next').forEach(el => { el.disabled = busy; });
    $('fw').disabled = $('baud').disabled = conn;
    live.active = busy || (live.active && name === 'done');
    if (name === 'waitPage') logLine(`Страница ${live.page + cfg.firstPage} готова. Переверните/смените лист, положите тетрадь на то же место и нажмите «Продолжить».`, 'info');
    queueDraw();
  }

  function initSerial() {
    if (!window.PlotterSender || !PlotterSender.supported()) {
      $('serialNote').innerHTML = '⚠ Этот браузер не умеет работать с USB-портом. Откройте приложение в <b>Chrome</b>, <b>Edge</b> или <b>Яндекс.Браузере</b> на компьютере. ' +
        'Либо скачайте G-code и печатайте своей программой (тогда положение ручки здесь не видно).';
      $('connect').disabled = true;
      return;
    }
    sender = new PlotterSender({
      log: logLine,
      state: setState,
      status: ({ state, x, y }) => {
        if (x != null) live.pos = [x, y];
        $('liveInfo').textContent = `Станок: ${state}` + (x != null ? `   X ${x.toFixed(2)}  Y ${y.toFixed(2)}` : '') +
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
    $('connect').onclick = async () => {
      try {
        if (sender.connected) await sender.disconnect();
        else { await sender.connect($('baud').value, $('fw').value); }
      } catch (e) {
        if (e.name !== 'NotFoundError') logLine('Не удалось подключиться: ' + e.message, 'err');
        setState('disconnected');
      }
    };
    const startPrint = which => {
      const prog = PlotGcode.program(result.pages, cfg, which);
      live.active = true; live.page = which == null ? 0 : which; live.stroke = -1; live.pen = false;
      if (pageIdx !== live.page) { pageIdx = live.page; render(); }
      $('printProg').value = 0;
      sender.start(prog.lines, prog.meta);
    };
    $('printPage').onclick = () => startPrint(pageIdx);
    $('printAll').onclick = () => startPrint(null);
    $('pauseBtn').onclick = () => sender.pause();
    $('resumeBtn').onclick = () => sender.resume();
    $('stopBtn').onclick = () => sender.stop(cfg.penUp.split('\n').map(l => l.replace(/;.*/, '').trim()).filter(Boolean));
    const cmds = t => t.split('\n').map(l => l.replace(/;.*/, '').trim()).filter(Boolean).forEach(c => sender.command(c));
    $('jogUp').onclick = () => cmds(cfg.penUp);
    $('jogDown').onclick = () => cmds(cfg.penDown);
    $('jogStart').onclick = () => cmds(`${cfg.penUp}\nG90\nG0 X${+cfg.startX || 0} Y${+cfg.startY || 0}`);
    setState('disconnected');
  }

  fillForm();
  $('text').value = localStorage.getItem('plotterText') ?? SAMPLE;
  bind();
  initSerial();
  recompute();
})();
