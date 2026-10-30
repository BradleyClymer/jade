const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true,
    width: 512,
    height: 512,
    transparent: true,
    webPreferences: { offscreen: true }
  });
  win.webContents.on('paint', () => {});

  const svgContent = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf-8');
  const html = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;}html,body{width:512px;height:512px;overflow:hidden;background:transparent;}</style></head><body>${svgContent}</body></html>`;
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  win.loadURL(dataUrl);

  await new Promise(r => win.webContents.on('did-finish-load', r));
  await new Promise(r => setTimeout(r, 2000));

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const png = image.toPNG();
  fs.writeFileSync(path.join(__dirname, 'icon.png'), png);

  const image256 = image.resize({ width: 256, height: 256 });
  fs.writeFileSync(path.join(__dirname, 'icon_256.png'), image256.toPNG());

  fs.appendFileSync(path.join(__dirname, '..', 'capture_log.txt'), 'Icon: ' + png.length + ' bytes\n');
  app.quit();
});
