const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('merge', {
  onData: (cb) => ipcRenderer.on('merge-data', (_, data) => cb(data)),
  sendResult: (result) => ipcRenderer.send('merge-result', result),
});
