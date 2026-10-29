const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 512, height: 512, webPreferences: { offscreen: true } });
  win.webContents.on('paint', () => {});

  const svgPath = path.join(__dirname, 'icon.svg').replace(/\\/g, '/');
  const html = `<!DOCTYPE html><html><head><style>body{margin:0;background:transparent;}</style></head><body><img src="file:///${svgPath}" width="512" height="512"></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  await new Promise(r => win.webContents.on('did-finish-load', r));
  await new Promise(r => setTimeout(r, 1000));

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const png = image.toPNG();

  fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
  console.log('Generated icon.png (' + png.length + ' bytes)');

  // Also generate 256x256
  const image256 = image.resize({ width: 256, height: 256 });
  fs.writeFileSync(path.join(__dirname, 'icon_256.png'), image256.toPNG());
  console.log('Generated icon_256.png');

  app.quit();
});
