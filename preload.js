const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jade', {
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  saveDialog: () => ipcRenderer.invoke('save-dialog'),
  confirmDiscard: (fileName) => ipcRenderer.invoke('confirm-discard', fileName),
  getTitle: (filePath, modified) => ipcRenderer.invoke('get-title', filePath, modified),
  setTitle: (title) => ipcRenderer.send('set-title', title),
  exportPdf: (html) => ipcRenderer.invoke('export-pdf', html),
  exportLatex: () => ipcRenderer.invoke('export-latex'),
  updateRecentFiles: (files) => ipcRenderer.send('update-recent-files', files),

  onOpenFile: (cb) => ipcRenderer.on('open-file', (_, path) => cb(path)),
  onNewFile: (cb) => ipcRenderer.on('new-file', () => cb()),
  onSaveFile: (cb) => ipcRenderer.on('save-file', () => cb()),
  onSaveFileAs: (cb) => ipcRenderer.on('save-file-as', () => cb()),
  onCloseTab: (cb) => ipcRenderer.on('close-tab', () => cb()),
  onTogglePreview: (cb) => ipcRenderer.on('toggle-preview', () => cb()),
  onSetView: (cb) => ipcRenderer.on('set-view', (_, mode) => cb(mode)),
  onZoom: (cb) => ipcRenderer.on('zoom', (_, dir) => cb(dir)),
  onFind: (cb) => ipcRenderer.on('find', () => cb()),
  onReplace: (cb) => ipcRenderer.on('replace', () => cb()),
  onExportPdf: (cb) => ipcRenderer.on('export-pdf', () => cb()),
  onExportLatex: (cb) => ipcRenderer.on('export-latex', () => cb()),
  onOpenRecent: (cb) => ipcRenderer.on('open-recent', (_, path) => cb(path)),
  onSetTheme: (cb) => ipcRenderer.on('set-theme', (_, theme) => cb(theme)),
});
