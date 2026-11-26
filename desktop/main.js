/*
 * Настольная версия: то же приложение в отдельном окне + доступ к USB-порту плоттера
 * + самообновление интерфейса с GitHub.
 */
const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const path = require('path');
const updater = require('./updater');

let win = null;
let currentDir = null;
let pending = null; // скачанная, но ещё не включённая версия

function load(dir) {
  currentDir = dir;
  win.loadFile(path.join(dir, 'index.html'));
}

async function checkUpdate() {
  try {
    const v = await updater.check(currentDir);
    if (v) {
      pending = v;
      if (win && !win.isDestroyed()) win.webContents.send('update-ready', { version: v.version, date: v.date, notes: v.notes || '' });
    }
    return v;
  } catch (e) {
    console.warn('обновление не удалось:', e.message);
    return null;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1000,
    minHeight: 700,
    title: 'Плоттер-конспект',
    autoHideMenuBar: true,
    backgroundColor: '#f3f4f6',
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false, preload: path.join(__dirname, 'preload.js') },
  });
  Menu.setApplicationMenu(null);

  const ses = win.webContents.session;

  // Выбор порта: браузер сам окно выбора не показывает — показываем своё
  ses.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (!portList.length) {
      dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Плоттер не найден',
        message: 'Не найдено ни одного USB-порта.',
        detail: 'Проверьте, что плоттер включён и подключён кабелем. Если подключаете впервые, может понадобиться драйвер ' +
          '(у большинства китайских плат — CH340, иногда CP2102 или FTDI).',
      });
      callback('');
      return;
    }
    const labels = portList.map(p => {
      const name = p.displayName || p.portName || 'USB-порт';
      return p.portName && !name.includes(p.portName) ? `${name} (${p.portName})` : name;
    });
    if (portList.length === 1) { callback(portList[0].portId); return; }
    const r = dialog.showMessageBoxSync(win, {
      type: 'question',
      title: 'Выбор порта',
      message: 'К какому порту подключён плоттер?',
      buttons: labels.concat('Отмена'),
      cancelId: labels.length,
      noLink: true,
    });
    callback(r < labels.length ? portList[r].portId : '');
  });

  ses.setPermissionCheckHandler(() => true);
  ses.setDevicePermissionHandler(details => details.deviceType === 'serial');

  load(updater.activeDir());
  // проверка обновлений: через 5 с после запуска и потом каждые 30 минут
  setTimeout(checkUpdate, 5000);
  setInterval(checkUpdate, 30 * 60 * 1000);
}

ipcMain.handle('app-info', () => {
  const v = updater.readVersion(currentDir) || {};
  return { version: v.version || '', date: v.date || '', fromUpdate: currentDir !== updater.bundledDir, pending: pending ? pending.version : null };
});
ipcMain.handle('check-update', () => checkUpdate().then(v => (v ? v.version : null)));
ipcMain.handle('apply-update', () => {
  const dir = updater.activeDir();
  pending = null;
  load(dir);
  return true;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
