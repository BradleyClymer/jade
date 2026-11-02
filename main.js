const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

let windows = [];
let recentFiles = [];

function createWindow(filePath) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#1a2e1a',
    icon: path.join(__dirname, 'assets', 'icon.png'),
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
                { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
                { name: 'LaTeX', extensions: ['tex', 'ltx', 'sty', 'cls', 'bib'] },
                { name: 'Web', extensions: ['html', 'htm', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'tsx', 'vue', 'json', 'xml', 'svg', 'yaml', 'yml', 'toml'] },
                { name: 'Programming', extensions: ['py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'dart', 'lua', 'php', 'r', 'jl', 'scala', 'hs', 'elm', 'erl', 'ex', 'exs', 'clj', 'cljs'] },
                { name: 'Shell/Config', extensions: ['sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'ini', 'cfg', 'conf', 'env', 'properties', 'dockerfile'] },
                { name: 'Data', extensions: ['sql', 'csv', 'tsv', 'graphql', 'proto'] },
                { name: 'Plain Text', extensions: ['txt', 'text', 'log'] },
                { name: 'All Files', extensions: ['*'] },
              ],
            });
            if (!canceled && filePaths.length > 0) {
              win.webContents.send('open-file', filePaths[0]);
            }
          },
        },
        {
          label: 'Open Recent',
          submenu: recentFiles.length > 0
            ? [
                ...recentFiles.map(f => ({
                  label: f.length > 60 ? '...' + f.slice(-57) : f,
                  click: () => {
                    const win = getActiveWindow();
                    if (win) win.webContents.send('open-recent', f);
                  },
                })),
                { type: 'separator' },
                {
                  label: 'Clear Recent',
                  click: () => {
                    recentFiles = [];
                    buildMenu();
                  },
                },
              ]
            : [{ label: 'No Recent Files', enabled: false }],
        },
        { type: 'separator' },
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
        {
          label: 'Export as LaTeX Project...',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('export-latex-project');
          },
        },
        { type: 'separator' },
        {
          label: 'PDF Page Size',
          submenu: [
            {
              label: 'Letter',
              click: () => {
                const win = getActiveWindow();
                if (win) win.webContents.send('set-pdf-page-size', 'Letter');
              },
            },
            {
              label: 'A4',
              click: () => {
                const win = getActiveWindow();
                if (win) win.webContents.send('set-pdf-page-size', 'A4');
              },
            },
            {
              label: 'Legal',
              click: () => {
                const win = getActiveWindow();
                if (win) win.webContents.send('set-pdf-page-size', 'Legal');
              },
            },
          ],
        },
        { type: 'separator' },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow(null),
        },
        {
          label: 'Move Tab to New Window',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('move-tab-to-window');
          },
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
        { type: 'separator' },
        {
          label: 'Go to Line...',
          accelerator: 'CmdOrCtrl+G',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('go-to-line');
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle Bookmark',
          accelerator: 'CmdOrCtrl+F2',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('toggle-bookmark');
          },
        },
        {
          label: 'Next Bookmark',
          accelerator: 'F2',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('next-bookmark');
          },
        },
        {
          label: 'Previous Bookmark',
          accelerator: 'Shift+F2',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('prev-bookmark');
          },
        },
        { type: 'separator' },
        {
          label: 'Snippets...',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('open-snippets');
          },
        },
        { type: 'separator' },
        {
          label: 'Start/Stop Macro Recording',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('toggle-macro');
          },
        },
        {
          label: 'Play Macro',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('play-macro');
          },
        },
        { type: 'separator' },
        {
          label: 'Compare Two Tabs...',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('diff-tabs');
          },
        },
        { type: 'separator' },
        {
          label: 'Table Editor...',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('open-table-editor');
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
        {
          label: 'Theme: Jade',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('set-theme', 'jade');
          },
        },
        {
          label: 'Theme: Dark',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('set-theme', 'dark');
          },
        },
        {
          label: 'Theme: Light',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('set-theme', 'light');
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle Minimap',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('toggle-minimap');
          },
        },
        {
          label: 'Toggle Outline',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('toggle-outline');
          },
        },
        { type: 'separator' },
        {
          label: 'Custom Preview CSS...',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('select-custom-css');
          },
        },
        {
          label: 'Clear Custom CSS',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('clear-custom-css');
          },
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Plugins',
      submenu: [
        {
          label: 'Reload Plugins',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('reload-plugins');
          },
        },
        {
          label: 'Open Plugins Folder',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('open-plugin-dir');
          },
        },
      ],
    },
    {
      label: 'Collaborate',
      submenu: [
        {
          label: 'Collab Panel',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('toggle-collab-panel');
          },
        },
      ],
    },
    {
      label: 'Git',
      submenu: [
        {
          label: 'Git Panel',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('toggle-git-panel');
          },
        },
        {
          label: 'Diff Current File',
          click: () => {
            const win = getActiveWindow();
            if (win) win.webContents.send('show-git-diff');
          },
        },
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

ipcMain.handle('export-pdf', async (event, htmlContent, pageSize) => {
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
          pageSize: pageSize || 'Letter',
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

ipcMain.handle('save-image', async (event, dir, filename, base64) => {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, Buffer.from(base64, 'base64'));
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('select-directory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select output folder for LaTeX project',
  });
  if (canceled) return { canceled: true };
  return { canceled: false, path: filePaths[0] };
});

ipcMain.handle('open-css-file', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'CSS Stylesheets', extensions: ['css'] }],
  });
  if (canceled) return { canceled: true };
  return { canceled: false, path: filePaths[0] };
});

ipcMain.handle('load-plugins', async () => {
  const pluginDir = path.join(app.getPath('home'), '.jade', 'plugins');
  try {
    if (!fs.existsSync(pluginDir)) {
      fs.mkdirSync(pluginDir, { recursive: true });
      return { success: true, plugins: [] };
    }
    const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js'));
    const plugins = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pluginDir, file), 'utf-8');
        plugins.push({ name: file.replace('.js', ''), code: content });
      } catch (_) {}
    }
    return { success: true, plugins, dir: pluginDir };
  } catch (err) {
    return { success: false, error: err.message, dir: pluginDir };
  }
});

ipcMain.handle('open-plugin-dir', async () => {
  const pluginDir = path.join(app.getPath('home'), '.jade', 'plugins');
  if (!fs.existsSync(pluginDir)) fs.mkdirSync(pluginDir, { recursive: true });
  shell.openPath(pluginDir);
  return { success: true, dir: pluginDir };
});

ipcMain.handle('open-in-new-window', async (event, filePath) => {
  createWindow(filePath || null);
  return { success: true };
});

// Git integration
function gitExec(cwd, cmd) {
  try {
    return { success: true, output: execSync(cmd, { cwd, encoding: 'utf8', timeout: 10000 }).trim() };
  } catch (err) {
    return { success: false, error: err.stderr || err.message };
  }
}

ipcMain.handle('git-status', async (event, cwd) => {
  const isRepo = gitExec(cwd, 'git rev-parse --is-inside-work-tree');
  if (!isRepo.success) return { success: false, error: 'Not a git repository' };
  const branch = gitExec(cwd, 'git branch --show-current');
  const status = gitExec(cwd, 'git status --porcelain');
  return {
    success: true,
    branch: branch.success ? branch.output : '',
    files: status.success ? status.output.split('\n').filter(Boolean).map(line => ({
      status: line.slice(0, 2),
      path: line.slice(3),
    })) : [],
  };
});

ipcMain.handle('git-diff', async (event, cwd, filePath) => {
  const diff = gitExec(cwd, `git diff -- "${filePath}"`);
  if (!diff.success || !diff.output) {
    const staged = gitExec(cwd, `git diff --cached -- "${filePath}"`);
    return staged;
  }
  return diff;
});

ipcMain.handle('git-stage', async (event, cwd, filePath) => {
  return gitExec(cwd, `git add -- "${filePath}"`);
});

ipcMain.handle('git-unstage', async (event, cwd, filePath) => {
  return gitExec(cwd, `git restore --staged -- "${filePath}"`);
});

ipcMain.handle('git-commit', async (event, cwd, message) => {
  return gitExec(cwd, `git commit -m "${message.replace(/"/g, '\\"')}"`);
});

ipcMain.handle('git-log', async (event, cwd, count) => {
  const log = gitExec(cwd, `git log --oneline -${count || 10}`);
  return log;
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

ipcMain.on('update-recent-files', (event, files) => {
  recentFiles = files;
  buildMenu();
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
    if (!arg.startsWith('-') && /\.\w+$/.test(arg)) {
      const resolved = path.resolve(arg);
      if (fs.existsSync(resolved)) return resolved;
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
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: file:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' wss: ws:;"
          ],
        },
      });
    });

    buildMenu();
    const filePath = getFileFromArgs(process.argv);
    createWindow(filePath);
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
