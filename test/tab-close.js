// Regression test: closing tabs must never leave another tab, or its file on
// disk, holding the wrong document (auto-save once overwrote a neighbouring
// file with the closed tab's content). Drives the real renderer through
// Electron:  npm test   (or: electron test/tab-close.js)
const path = require('path'), fs = require('fs'), os = require('os');
const { app, BrowserWindow } = require('electron');
require(process.env.JADE_MAIN || path.join(__dirname, '..', 'main.js')); // real main.js: IPC handlers + window

const sleep = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  let win; for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await sleep(100);
  const wc = win.webContents;
  for (let i = 0; i < 100; i++) { if (await wc.executeJavaScript('!!(window.app && window.app.editor)').catch(() => false)) break; await sleep(100); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jade-tabtest-'));
  const F = {}, ORIG = {};
  for (const n of ['A', 'B', 'C']) { F[n] = path.join(dir, n + '.md'); ORIG[n] = `# ${n}\n\n${n}${n}${n} content\n`; fs.writeFileSync(F[n], ORIG[n]); }
  const results = await wc.executeJavaScript(`(async () => {
    const F = ${JSON.stringify(F)}, ORIG = ${JSON.stringify(ORIG)}; const app = window.app; const out = [];
    const idx = p => app.tabs.findIndex(t => t.filePath === p);
    const doc = t => t.editorState ? t.editorState.doc.toString() : null;
    const check = (name) => {
      const active = app.tabs[app.activeTabIndex]; const probs = [];
      for (const t of app.tabs) if (t.filePath && doc(t) !== null && doc(t) !== t.savedContent) probs.push(t.name + ' buffer != saved');
      if (active && active.filePath && app.editor.state.doc.toString() !== active.savedContent) probs.push('editor shows wrong doc for active tab ' + active.name);
      out.push({ name, ok: probs.length === 0, probs, tabs: app.tabs.map(t => t.name), active: app.activeTabIndex });
    };
    const reset = async () => {
      for (const p of Object.values(F)) { const i = idx(p); if (i >= 0) await app.closeTab(i); }
      for (const n of Object.keys(F)) await window.jade.writeFile(F[n], ORIG[n]);
    };
    const scenario = async (name, open, active, close) => {
      await reset();
      for (const n of open) await app.openFile(F[n]);
      app.switchToTab(idx(F[active]));
      await app.closeTab(idx(F[close]));
      check(name);
      await app.autoSave();
      for (const n of Object.keys(F)) {
        const r = await window.jade.readFile(F[n]);
        if (r.success && r.content !== ORIG[n]) out.push({ name: name + ': ' + n + '.md on disk', ok: false, probs: ['overwritten with ' + JSON.stringify(r.content.split('\\n')[0])], tabs: [], active: -1 });
      }
    };
    await scenario('close active first tab',   ['A','B'],     'A', 'A');
    await scenario('close active middle tab',  ['A','B','C'], 'B', 'B');
    await scenario('close active last tab',    ['A','B'],     'B', 'B');
    await scenario('close inactive tab before active', ['A','B','C'], 'C', 'A');
    await scenario('close inactive tab after active',  ['A','B','C'], 'A', 'C');
    await reset();
    return out;
  })()`);
  let fail = 0;
  for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  -> ' + r.probs.join('; ')) + (r.tabs.length ? '   tabs=' + JSON.stringify(r.tabs) + ' active=' + r.active : '')); if (!r.ok) fail++; }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fail ? `\n${fail} failure(s)` : '\nall passed');
  app.exit(fail ? 1 : 0);
});
