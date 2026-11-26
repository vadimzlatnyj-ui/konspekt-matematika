/*
 * Настольная версия: то же приложение в отдельном окне + доступ к USB-порту плоттера.
 */
const { app, BrowserWindow, dialog, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1000,
    minHeight: 700,
    title: 'Плоттер-конспект',
    autoHideMenuBar: true,
    backgroundColor: '#f3f4f6',
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
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

  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
