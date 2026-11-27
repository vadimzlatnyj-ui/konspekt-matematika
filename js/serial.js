/*
 * Отправка G-code на плоттер по USB (Web Serial API: Chrome / Edge / Яндекс.Браузер на компьютере)
 * и получение текущих координат ручки во время печати.
 *
 * GRBL:   поток «строка → ok», координаты — по запросу «?» (<Run|MPos:x,y,z|...>).
 * Marlin: поток «строка → ok», координаты — автоотчёт M154 S1 и ответы M114 (X:.. Y:..).
 */
(function (root) {
  'use strict';

  class PlotterSender {
    /**
     * on: {
     *   log(text, kind),            — строка для журнала ('rx' | 'tx' | 'info' | 'err')
     *   status({state, x, y}),      — новое положение/состояние станка
     *   progress({acked, total}),   — подтверждено строк программы
     *   state(name, info)           — 'disconnected' | 'idle' | 'printing' | 'paused' | 'waitPage' | 'done' | 'stopped'
     * }
     */
    constructor(on) {
      this.on = on;
      this.port = null; this.writer = null; this.reader = null;
      this.firmware = 'grbl';
      this.enc = new TextEncoder();
      this.rx = '';
      this.job = null;          // {lines, idx, sent, acked, map}
      this.waitingOk = false;
      this.paused = false;
      this.pollTimer = null;
      this.wco = [0, 0, 0];
      this.pos = null;
    }

    static supported() { return typeof navigator !== 'undefined' && 'serial' in navigator; }
    get connected() { return !!this.port; }

    /** port — уже разрешённый порт (автоподключение); без него — окно выбора порта */
    async connect(baudRate, firmware, port) {
      this.firmware = firmware;
      const p = port || await navigator.serial.requestPort();
      await p.open({ baudRate: +baudRate || 115200 });
      this.port = p;
      this.writer = this.port.writable.getWriter();
      this.closing = false;
      this.loopDone = this.readLoop();
      this.on.log(`Порт открыт (${baudRate} бод, ${firmware === 'grbl' ? 'GRBL' : 'Marlin'})`, 'info');
      this.on.state('idle');
      if (firmware === 'grbl') {
        this.pollTimer = setInterval(() => this.raw('?'), 200);
        setTimeout(() => { this.resetOverride(); this.command('$$'); }, 2200); // настройки (проверка лазерного режима для серво)
      } else {
        setTimeout(() => this.command('M154 S1'), 1500); // автоотчёт координат (Marlin 2.1+)
        this.pollTimer = setInterval(() => { if (!this.job || this.job.finished) this.command('M114'); }, 1000);
      }
    }

    async disconnect() {
      if (this.closing) return;
      this.closing = true;              // цикл чтения больше не захватывает порт заново
      clearInterval(this.pollTimer); this.pollTimer = null;
      if (this.job) { this.job.finished = true; this.job = null; }
      this.paused = false;
      const port = this.port, writer = this.writer, reader = this.reader;
      // каждый шаг — не дольше 1,5 с: зависшее устройство не должно вешать программу
      const limit = (p, ms = 1500) => Promise.race([Promise.resolve(p).catch(() => {}), new Promise(r => setTimeout(r, ms))]);
      try { if (reader) await limit(reader.cancel()); } catch (e) { /* */ }
      if (this.loopDone) await limit(this.loopDone);
      try { if (writer) { await limit(writer.close()); writer.releaseLock(); } } catch (e) { /* */ }
      try { if (port) await limit(port.close(), 2500); } catch (e) { /* */ }
      this.port = null; this.writer = null; this.reader = null;
      this.rx = ''; this.manual = 0;
      this.closing = false;
      this.on.state('disconnected');
      this.on.log('Порт закрыт', 'info');
    }

    async readLoop() {
      const dec = new TextDecoder();
      while (this.port && this.port.readable && !this.closing) {
        this.reader = this.port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            this.rx += dec.decode(value, { stream: true });
            let k;
            while ((k = this.rx.search(/\r?\n/)) >= 0) {
              const line = this.rx.slice(0, k).trim();
              this.rx = this.rx.slice(k + 1).replace(/^\n/, '');
              if (line) this.handle(line);
            }
          }
        } catch (e) {
          if (!this.closing) this.on.log('Ошибка чтения: ' + e.message, 'err');
          break;
        } finally {
          try { this.reader.releaseLock(); } catch (e) { /* */ }
        }
      }
      if (this.port && !this.closing) { // кабель выдернули или плоттер выключили
        clearInterval(this.pollTimer); this.pollTimer = null;
        if (this.job) { this.job.finished = true; this.job = null; }
        try { this.writer && this.writer.releaseLock(); } catch (e) { /* */ }
        try { await this.port.close(); } catch (e) { /* */ }
        this.port = null; this.writer = null; this.reader = null;
        this.on.state('disconnected');
        this.on.log('Связь с плоттером потеряна', 'err');
      }
    }

    handle(line) {
      // ----- координаты -----
      if (line[0] === '<') { this.parseGrblStatus(line); return; }
      const m = /X:\s*(-?[\d.]+)\s+Y:\s*(-?[\d.]+)/.exec(line);
      if (m && this.firmware === 'marlin') {
        this.pos = [+m[1], +m[2]];
        this.on.status({ state: this.job ? 'Run' : 'Idle', x: this.pos[0], y: this.pos[1] });
        if (!/^ok/.test(line)) return;
      }
      const st = /^\$(\d+)=(-?[\d.]+)/.exec(line);
      if (st) { if (this.on.setting) this.on.setting(+st[1], st[2]); if (+st[1] >= 30 && +st[1] <= 32) this.on.log(line, 'rx'); return; }
      if (/^ok/i.test(line)) { this.ack(false); return; }
      if (/^error/i.test(line)) { this.on.log(line, 'err'); this.ack(true); return; }
      if (/^ALARM/i.test(line)) { this.on.log(line + ' — печать остановлена', 'err'); this.abortJob('stopped'); return; }
      if (/^(echo:busy|busy)/i.test(line)) return;
      this.on.log(line, 'rx');
    }

    parseGrblStatus(line) {
      const body = line.slice(1, -1).split('|');
      const state = body[0];
      let mpos = null, wpos = null;
      for (const f of body.slice(1)) {
        const [k, v] = f.split(':');
        if (!v) continue;
        const n = v.split(',').map(Number);
        if (k === 'MPos') mpos = n;
        else if (k === 'WPos') wpos = n;
        else if (k === 'WCO') this.wco = n;
        else if (k === 'Ov') this.override = n[0];
      }
      this.state = state;
      if (!wpos && mpos) wpos = mpos.map((v, i) => v - (this.wco[i] || 0));
      if (wpos) this.pos = [wpos[0], wpos[1]];
      this.on.status({ state, x: this.pos ? this.pos[0] : null, y: this.pos ? this.pos[1] : null, override: this.override });
    }

    raw(str) {
      if (!this.writer || this.closing) return Promise.resolve();
      return this.writer.write(this.enc.encode(str)).catch(e => this.on.log('Ошибка записи: ' + e.message, 'err'));
    }

    /** Одиночная команда вне программы (если идёт печать — не мешаем) */
    command(cmd) {
      if (!this.writer) return;
      if (this.job && !this.job.finished) { this.on.log('Идёт печать — команда не отправлена', 'err'); return; }
      this.manual = (this.manual || 0) + 1;
      this.raw(cmd + '\n');
      if (!/^M11[4]|^M154|^\$\$$/.test(cmd)) this.on.log(cmd, 'tx');
    }

    // ---------------- печать ----------------
    /**
     * lines — строки программы, meta — данные о строках (страница/штрих/ручка), см. PlotGcode.program
     */
    start(lines, meta) {
      if (!this.writer) throw new Error('Плоттер не подключён');
      const send = [];
      lines.forEach((l, i) => {
        const clean = l.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim();
        if (clean) send.push({ text: clean, src: i });
      });
      this.job = { send, meta, idx: 0, acked: 0, total: send.length, q: [], qBytes: 0, finished: false };
      this.finishAfter = null;
      this.paused = false;
      this.manual = 0;
      this.on.state('printing');
      this.on.log(`Печать: ${send.length} строк`, 'info');
      this.pump();
    }

    /**
     * Отправка «с подсчётом символов»: в плату уходит столько строк, сколько помещается в её приёмный буфер
     * (GRBL — 128 байт). Плата видит движения наперёд и едет плавно, без рывков на каждом коротком отрезке —
     * иначе ручка подпрыгивает и пишет с пропусками.
     */
    pump() {
      const j = this.job;
      if (!j || this.paused || j.finished) return;
      const limit = this.firmware === 'grbl' ? 120 : 60;
      for (;;) {
        if (j.idx >= j.send.length) {
          if (!j.q.length) {
            j.finished = true;
            this.on.state('done');
            this.on.log('Печать завершена', 'info');
          }
          return;
        }
        const item = j.send[j.idx];
        // «Дописать строку и закончить»: дошли до следующей строки (или следующего штриха, если строк нет) — заканчиваем
        if (this.finishAfter) {
          const m = j.meta[item.src], fa = this.finishAfter;
          const other = /^M0?[01]\b/i.test(item.text) || (m && m.stroke >= 0 && (
            (fa.page >= 0 && m.page >= 0 && m.page !== fa.page) ||
            (fa.line != null && m.line != null ? m.line !== fa.line : m.stroke !== fa.stroke)));
          if (other || !m) { this.endEarly(); return; }
        }
        // пауза между страницами (M0/M1): ждём, пока плата всё дорисует, и спрашиваем пользователя
        if (/^M0?[01]\b/i.test(item.text)) {
          if (j.q.length) return;                       // сначала пусть подтвердит всё отправленное
          const t = (this.firmware === 'grbl' ? 'G4 P0.01' : 'M400') + '\n';
          j.q.push({ item, bytes: t.length, sync: true }); j.qBytes += t.length; j.idx++;
          this.raw(t);
          return;
        }
        let text = item.text;
        // линия рисования: G1 с X/Y и без Z — ставим текущую скорость письма
        if (this.drawFeed && /^G0?1(?!\d)/i.test(text) && /[XY]/i.test(text) && !/Z/i.test(text)) {
          text = text.replace(/\s*F-?[\d.]+/i, '') + ' F' + this.drawFeed;
        }
        const line = text + '\n';
        const bytes = this.enc.encode(line).length;
        if (j.q.length && j.qBytes + bytes > limit) return;   // буфер платы полон — ждём «ok»
        j.q.push({ item, bytes }); j.qBytes += bytes; j.idx++;
        this.raw(line);
      }
    }

    ack(isError) {
      if (this.manual > 0) { this.manual--; return; }
      const j = this.job;
      if (!j || !j.q || !j.q.length) return;
      const { item, bytes, sync } = j.q.shift();
      j.qBytes -= bytes;
      j.acked++;
      const mt = j.meta[item.src];
      if (mt) j.lastPen = !!mt.pen;          // опущена ли ручка после этой строки программы
      if (mt && mt.stroke >= 0) j.lastMeta = mt;
      this.on.progress({ acked: j.acked, total: j.total, src: item.src, meta: mt });
      if (sync) {
        this.paused = true;
        this.on.state('waitPage', item.text);
        return;
      }
      if (isError) this.on.log(`↑ в строке: ${item.text}`, 'err');
      this.pump();
    }

    /** Отправить служебные строки вне программы и дождаться их «ok» */
    async sendManual(lines, timeout = 15000) {
      for (const l of lines) { this.manual = (this.manual || 0) + 1; this.raw(l + '\n'); this.on.log(l, 'tx'); }
      const t0 = Date.now();
      while ((this.manual || 0) > 0 && Date.now() - t0 < timeout && this.port) await new Promise(r => setTimeout(r, 30));
    }

    /**
     * Мягкая пауза: плоттер дорисовывает уже отправленные отрезки, останавливается и поднимает ручку
     * (а не замирает посреди линии с прижатой ручкой — так серво не гудит и не остаётся клякса).
     */
    async pause(penUpLines, penIsDown) {
      const j = this.job;
      if (!j || j.finished || this.paused) return;
      this.paused = true;
      this.on.state('pausing');
      const t0 = Date.now();
      while (j.q.length && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 30));
      if (this.job !== j) return; // за это время нажали «Стоп»
      penIsDown = !!j.lastPen;    // положение ручки там, где реально остановилась программа
      await this.sendManual([this.firmware === 'grbl' ? 'G4 P0.01' : 'M400'].concat(penIsDown ? penUpLines || [] : []));
      if (this.job !== j) return;
      this.restorePen = !!penIsDown;
      this.on.state('paused');
    }

    /**
     * Дописать начатую строку и закончить: дальше этой строки не отправляем, затем ручку вверх и домой.
     * after — строки «ручку вверх и домой».
     */
    finishLine(after) {
      const j = this.job;
      if (!j || j.finished) return;
      this.finishLines = after || [];
      if (this.paused) { this.endEarly(); return; }        // на паузе ручка уже поднята — сразу домой
      const m = j.lastMeta || {};
      this.finishAfter = { page: m.page ?? -1, line: m.line ?? null, stroke: m.stroke ?? -1 };
      if (!j.lastMeta) { this.endEarly(); return; }       // ещё ничего не нарисовано
      this.on.state('finishing');
      this.on.log('Допишу начатую строку и закончу…', 'info');
    }

    async endEarly() {
      const j = this.job;
      if (!j) return;
      j.finished = true;
      this.finishAfter = null; this.paused = false; this.restorePen = false;
      const t0 = Date.now();
      while (j.q.length && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 30));
      j.q = []; j.qBytes = 0;
      await this.sendManual(this.finishLines || []);
      this.on.state('done');
      this.on.log('Печать закончена: ручка поднята и вернулась домой.', 'info');
    }

    async resume(penDownLines) {
      const j = this.job;
      if (!j || j.finished) return;
      if (this.restorePen) { this.restorePen = false; await this.sendManual(penDownLines || []); }
      if (this.job !== j) return;
      this.paused = false;
      this.on.state('printing');
      this.pump();
    }

    /** Аварийная остановка: сброс очереди станка и подъём ручки */
    /** Сырые байты (команды переопределения скорости GRBL — это байты 0x90…0x97) */
    rawBytes(arr) {
      if (!this.writer || this.closing) return Promise.resolve();
      return this.writer.write(new Uint8Array(arr)).catch(e => this.on.log('Ошибка записи: ' + e.message, 'err'));
    }

    /**
     * Скорость письма в мм/мин (10…10000). Подставляется в каждую строку рисования (G1 X/Y),
     * которая ещё не отправлена, — меняется на ходу. Холостые ходы (G0) и движения оси Z не трогаются.
     */
    setFeed(v) {
      this.drawFeed = Math.max(10, Math.min(10000, Math.round(+v || 0))) || null;
      return this.drawFeed;
    }

    /** Сбросить старое процентное переопределение скорости (могло остаться от прежней версии) */
    resetOverride() {
      if (this.firmware === 'grbl') return this.rawBytes([0x90]);
      this.command('M220 S100');
    }

    /**
     * Остановка: стоп движения без потери координат, подъём ручки и (по желанию) возврат в точку старта.
     * after — строки, которые выполнить после остановки (поднять ручку, уехать в старт).
     */
    async stop(after) {
      this.abortJob('stopped');
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      if (this.firmware === 'grbl') {
        // сначала плавное торможение (feed hold) — тогда сброс не сбивает координаты
        await this.raw('!');
        for (let i = 0; i < 40 && !/^(Hold:0|Idle|Alarm)/.test(this.state || ''); i++) await sleep(100);
        await this.raw('\x18');                         // сброс очищает очередь движений
        await sleep(1500);
        this.manual = 0;
        this.command('$X');                              // снять блокировку, если GRBL её поставил
        await sleep(200);
      } else {
        this.manual = 0;
        this.command('M410');                            // быстрая остановка Marlin
        await sleep(300);
      }
      for (const l of after || []) this.command(l);
      this.on.log('Остановлено: ручка поднята' + ((after || []).some(l => /^G0 X/.test(l)) ? ' и возвращается в точку старта.' : '.'), 'info');
    }

    abortJob(state) {
      if (this.job) this.job.finished = true;
      this.job = null; this.paused = false; this.restorePen = false;
      this.on.state(state);
    }
  }

  root.PlotterSender = PlotterSender;
})(typeof window !== 'undefined' ? window : globalThis);
