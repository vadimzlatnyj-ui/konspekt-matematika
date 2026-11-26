// Мост между окном программы и обновлением (без доступа окна к Node.js)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('app-info'),
  checkNow: () => ipcRenderer.invoke('check-update'),
  applyUpdate: () => ipcRenderer.invoke('apply-update'),
  onUpdate: cb => ipcRenderer.on('update-ready', (e, info) => cb(info)),
});
