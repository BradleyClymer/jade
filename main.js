const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let windows = [];

function createWindow(filePath) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#1a2e1a',
    icon: path.join(__dirname, 'assets', 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
    if (filePath) {
      win.webContents.send('open-file', filePath);
    }
  });

  win.on('close', (e) => {
    // Check for unsaved changes via renderer
    // Handled by the renderer's beforeunload
  });

  win.on('closed', () => {
    windows = windows.filter(w => w !== win);
  });

  windows.push(win);
  return win;
}

function getActiveWindow() {
  return BrowserWindow.getFocusedWindow() || (windows.length > 0 ? windows[0] : null);
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('new-file');
          },
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const win = getActiveWindow();
            if (!win) return;
            const { canceled, filePaths } = await dialog.showOpenDialog(win, {
              properties: ['openFile'],
              filters: [
                { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
                { name: 'All Files', extensions: ['*'] },
              ],
            });
            if (!canceled && filePaths.length > 0) {
              win.webContents.send('open-file', filePaths[0]);
            }
          },
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('save-file');
          },
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('save-file-as');
          },
        },
        { type: 'separator' },
        {
          label: 'Export to PDF...',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('export-pdf');
          },
        },
        {
          label: 'Export to LaTeX...',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('export-latex');
          },
        },
        { type: 'separator' },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow(null),
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('close-tab');
          },
        },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('find');
          },
        },
        {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+H',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('replace');
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Preview',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('toggle-preview');
          },
        },
        {
          label: 'Editor Only',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('set-view', 'editor');
          },
        },
        {
          label: 'Split View',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('set-view', 'split');
          },
        },
        {
          label: 'Preview Only',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('set-view', 'preview');
          },
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('zoom', 1);
          },
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('zoom', -1);
          },
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('zoom', 0);
          },
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Jade',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About Jade',
              message: 'Jade Markdown Editor',
              detail: 'Version 0.1.0\nA lightweight Markdown editor with live preview.\nNo vaults. No bloat. Just Markdown.',
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// IPC handlers for file operations
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, content, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-dialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (canceled) return { canceled: true };
  return { canceled: false, filePath };
});

ipcMain.handle('confirm-discard', async (event, fileName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    message: `"${fileName}" has unsaved changes.`,
    detail: 'Do you want to save before closing?',
  });
  return response; // 0=Save, 1=Don't Save, 2=Cancel
});

ipcMain.handle('export-pdf', async (event, htmlContent) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled) return { success: false };

  const pdfWin = new BrowserWindow({ show: false, width: 800, height: 600 });
  pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

  return new Promise((resolve) => {
    pdfWin.webContents.on('did-finish-load', async () => {
      try {
        const pdfData = await pdfWin.webContents.printToPDF({
          marginsType: 0,
          printBackground: true,
          pageSize: 'Letter',
        });
        await fs.promises.writeFile(filePath, pdfData);
        resolve({ success: true, path: filePath });
      } catch (err) {
        resolve({ success: false, error: err.message });
      } finally {
        pdfWin.close();
      }
    });
  });
});

ipcMain.handle('export-latex', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    filters: [{ name: 'LaTeX', extensions: ['tex'] }],
  });
  if (canceled) return { canceled: true };
  return { canceled: false, filePath };
});

ipcMain.handle('capture-page', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { success: false, error: 'no window' };
  const image = await win.webContents.capturePage();
  const pngBuf = image.toPNG();
  const outPath = require('path').join(require('os').tmpdir(), 'jade_capture.png');
  require('fs').writeFileSync(outPath, pngBuf);
  return { success: true, path: outPath };
});

ipcMain.handle('get-title', (event, filePath, modified) => {
  const name = filePath ? path.basename(filePath) : 'Untitled';
  const dir = filePath ? path.dirname(filePath) : '';
  const mod = modified ? ' *' : '';
  return `${name}${mod} - Jade${dir ? ' - ' + dir : ''}`;
});

ipcMain.on('set-title', (event, title) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setTitle(title);
});

// Handle file open from OS (double-click .md file)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) {
    const win = windows.length > 0 ? windows[0] : createWindow(null);
    win.webContents.send('open-file', filePath);
  } else {
    app.once('ready', () => {
      createWindow(filePath);
    });
  }
});

// Windows: handle file passed as CLI argument
function getFileFromArgs(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2);
  for (const arg of args) {
    if (!arg.startsWith('-') && (arg.endsWith('.md') || arg.endsWith('.markdown') || arg.endsWith('.txt'))) {
      if (fs.existsSync(arg)) return path.resolve(arg);
    }
  }
  return null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const filePath = getFileFromArgs(argv);
    if (filePath) {
      const win = windows.length > 0 ? windows[0] : createWindow(null);
      if (win.isMinimized()) win.restore();
      win.focus();
      win.webContents.send('open-file', filePath);
    }
  });

  app.whenReady().then(() => {
    buildMenu();
    const filePath = getFileFromArgs(process.argv);
    createWindow(filePath);
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
