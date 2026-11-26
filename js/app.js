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
    betweenPages: 'G0 X0 Y0\nM0 ; Страница {page} готова. Переверните лист и продолжите',
    footer: 'G0 X0 Y0\nM2',
    decimals: 2, joinDistance: 0.1, optimize: true,
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
$$\left(\frac{a+b}{2}\right)^2 \ge ab, \quad \sum_{k=1}^{n} k = \frac{n(n+1)}{2}$$`;

  const NUM = ['pageW', 'pageH', 'cell', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'firstPage',
    'offsetX', 'offsetY', 'rotation', 'bedW', 'bedH', 'capHeight', 'linePitch', 'letterSpacing', 'wordSpacing',
    'slant', 'indent', 'fracScale', 'scriptScale', 'feedDraw', 'feedTravel', 'penDelay', 'decimals', 'joinDistance'];
  const BOOL = ['mirrorMargins', 'snapToGrid', 'mirrorX', 'mirrorY', 'centerDisplay', 'travelG0', 'optimize'];
  const STR = ['preset', 'penPreset', 'penUp', 'penDown', 'header', 'betweenPages', 'footer'];

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

  function render() {
    const n = result.pages.length;
    const page = result.pages[pageIdx];
    $('pageInfo').textContent = `Страница ${pageIdx + 1 + (cfg.firstPage - 1)} (${pageIdx + 1} из ${n})`;
    const g = currentGcode();
    const all = PlotGcode.program(result.pages, cfg, null);
    const st = g.stats;
    const fmtT = m => m < 1 ? `${Math.round(m * 60)} с` : `${Math.floor(m)} мин ${Math.round((m % 1) * 60)} с`;
    $('stats').innerHTML =
      `Эта страница: письмо ${(st.draw / 1000).toFixed(2)} м, холостые ${(st.travel / 1000).toFixed(2)} м, ` +
      `опусканий ручки ${st.lifts}, ≈ ${fmtT(st.time)}, строк G-code ${g.text.split('\n').length - 1}.<br>` +
      `Все ${n} стр.: ≈ ${fmtT(all.stats.time)}.`;
    $('gcodeOut').value = g.text.length > 400000 ? g.text.slice(0, 400000) + '\n; … (обрезано в окне, файл полный)' : g.text;
    if ($('view').value === 'bed') drawBed(page); else drawPage(page);
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
      ctx.strokeStyle = '#c7dcf0'; ctx.lineWidth = 0.6 / k * 1;
      ctx.beginPath();
      for (let x = cfg.cell; x < W; x += cfg.cell) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      const y0 = cfg.marginTop % cfg.cell;
      for (let y = y0; y < H; y += cfg.cell) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }
    const m = page.margins;
    // поле (красная линия) — со стороны большего поля
    ctx.strokeStyle = '#e05252'; ctx.lineWidth = 1 / k;
    ctx.beginPath();
    if (m.right >= m.left) { ctx.moveTo(W - m.right, 0); ctx.lineTo(W - m.right, H); }
    else { ctx.moveTo(m.left, 0); ctx.lineTo(m.left, H); }
    ctx.stroke();
    // область текста
    ctx.setLineDash([2, 2]); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 0.6 / k;
    ctx.strokeRect(m.left, cfg.marginTop, W - m.left - m.right, H - cfg.marginTop - cfg.marginBottom);
    ctx.setLineDash([]);
    // штрихи
    let strokes = page.strokes;
    if ($('showTravel').checked) {
      if (cfg.optimize) strokes = PlotGcode.optimizeOrder(strokes, [0, H]);
      ctx.strokeStyle = 'rgba(239,68,68,.45)'; ctx.lineWidth = 0.6 / k;
      ctx.beginPath();
      let prev = null;
      for (const s of strokes) { if (prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(s[0][0], s[0][1]); } prev = s[s.length - 1]; }
      ctx.stroke();
    }
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = Math.max(0.35, 1.2 / k); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const s of strokes) {
      ctx.moveTo(s[0][0], s[0][1]);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
    }
    ctx.stroke();
  }

  function drawBed(page) {
    const BW = cfg.bedW, BH = cfg.bedH;
    const { ctx, k } = setupCanvas(BW, BH);
    // станок: Y вверх
    ctx.transform(1, 0, 0, -1, 0, BH);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, BW, BH);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.5 / k;
    ctx.beginPath();
    for (let x = 0; x <= BW; x += 10) { ctx.moveTo(x, 0); ctx.lineTo(x, BH); }
    for (let y = 0; y <= BH; y += 10) { ctx.moveTo(0, y); ctx.lineTo(BW, y); }
    ctx.stroke();
    // начало координат
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2 / k;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.moveTo(0, 0); ctx.lineTo(0, 20); ctx.stroke();
    // лист
    const tf = PlotGcode.makeTransform(cfg);
    const corners = [[0, 0], [cfg.pageW, 0], [cfg.pageW, cfg.pageH], [0, cfg.pageH]].map(tf);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1 / k;
    ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // верхний край листа — выделим
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3 / k;
    ctx.beginPath(); ctx.moveTo(corners[0][0], corners[0][1]); ctx.lineTo(corners[1][0], corners[1][1]); ctx.stroke();
    const g = PlotGcode.pageGcode(page, cfg, pageIdx + 1, result.pages.length);
    const strokes = g.machineStrokes;
    if ($('showTravel').checked) {
      ctx.strokeStyle = 'rgba(239,68,68,.45)'; ctx.lineWidth = 0.6 / k;
      ctx.beginPath();
      let prev = [+cfg.offsetX, +cfg.offsetY];
      for (const s of strokes) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(s[0][0], s[0][1]); prev = s[s.length - 1]; }
      ctx.stroke();
    }
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = Math.max(0.3, 1 / k); ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of strokes) { ctx.moveTo(s[0][0], s[0][1]); for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]); }
    ctx.stroke();
    // подписи
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    ctx.fillStyle = '#16a34a'; ctx.font = `${12 * dpr}px sans-serif`;
    ctx.fillText('0,0', 4 * dpr, $('canvas').height - 6 * dpr);
    ctx.fillStyle = '#b45309';
    ctx.fillText('оранжевая линия — верх листа', 6 * dpr, 16 * dpr);
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
    $('showTravel').onchange = render;
    $('view').onchange = render;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(render, 150); });

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

  fillForm();
  $('text').value = localStorage.getItem('plotterText') ?? SAMPLE;
  bind();
  recompute();
})();
