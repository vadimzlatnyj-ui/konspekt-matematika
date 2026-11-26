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

    async connect(baudRate, firmware) {
      this.firmware = firmware;
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: +baudRate || 115200 });
      this.writer = this.port.writable.getWriter();
      this.closing = false;
      this.loopDone = this.readLoop();
      this.on.log(`Порт открыт (${baudRate} бод, ${firmware === 'grbl' ? 'GRBL' : 'Marlin'})`, 'info');
      this.on.state('idle');
      if (firmware === 'grbl') {
        this.pollTimer = setInterval(() => this.raw('?'), 200);
        setTimeout(() => this.command('$$'), 2200); // прочитать настройки (проверка лазерного режима для серво)
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
      }
      if (!wpos && mpos) wpos = mpos.map((v, i) => v - (this.wco[i] || 0));
      if (wpos) this.pos = [wpos[0], wpos[1]];
      this.on.status({ state, x: this.pos ? this.pos[0] : null, y: this.pos ? this.pos[1] : null });
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
      this.job = { send, meta, idx: 0, acked: 0, total: send.length, inflight: null, finished: false };
      this.paused = false;
      this.manual = 0;
      this.on.state('printing');
      this.on.log(`Печать: ${send.length} строк`, 'info');
      this.pump();
    }

    pump() {
      const j = this.job;
      if (!j || this.paused || j.inflight || j.finished) return;
      if (j.idx >= j.send.length) {
        j.finished = true;
        this.on.state('done');
        this.on.log('Печать завершена', 'info');
        return;
      }
      const item = j.send[j.idx];
      // пауза между страницами (M0/M1): ждём окончания движений и спрашиваем пользователя
      if (/^M0?[01]\b/i.test(item.text)) {
        j.inflight = { item, sync: true };
        this.raw((this.firmware === 'grbl' ? 'G4 P0.01' : 'M400') + '\n');
        return;
      }
      j.inflight = { item };
      this.raw(item.text + '\n');
    }

    ack(isError) {
      if (this.manual > 0) { this.manual--; return; }
      const j = this.job;
      if (!j || !j.inflight) return;
      const { item, sync } = j.inflight;
      j.inflight = null;
      j.idx++;
      j.acked = j.idx;
      this.on.progress({ acked: j.idx, total: j.total, src: item.src, meta: j.meta[item.src] });
      if (sync) {
        this.paused = true;
        this.on.state('waitPage', item.text);
        return;
      }
      if (isError) this.on.log(`↑ в строке: ${item.text}`, 'err');
      this.pump();
    }

    pause() {
      if (!this.job || this.job.finished) return;
      this.paused = true;
      if (this.firmware === 'grbl') this.raw('!');
      this.on.state('paused');
    }

    resume() {
      if (!this.job || this.job.finished) return;
      this.paused = false;
      if (this.firmware === 'grbl') this.raw('~');
      this.on.state('printing');
      this.pump();
    }

    /** Аварийная остановка: сброс очереди станка и подъём ручки */
    async stop(penUpLines) {
      this.abortJob('stopped');
      if (this.firmware === 'grbl') {
        await this.raw('!');
        await new Promise(r => setTimeout(r, 300));
        await this.raw('\x18');                       // soft reset — очищает буфер
        await new Promise(r => setTimeout(r, 1500));
        await this.raw('$X\n'); this.manual = 1;
      } else {
        await this.raw('M410\n'); this.manual = 1;     // quickstop
      }
      for (const l of penUpLines || []) { this.manual++; await this.raw(l + '\n'); }
      this.on.log('Остановлено. Ручка поднята. Положение могло сбиться — сделайте «Домой» перед следующей печатью.', 'info');
    }

    abortJob(state) {
      if (this.job) this.job.finished = true;
      this.job = null; this.paused = false;
      this.on.state(state);
    }
  }

  root.PlotterSender = PlotterSender;
})(typeof window !== 'undefined' ? window : globalThis);
