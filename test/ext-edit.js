// Test: external edit detection and merge dialog.
// Simulates an outside agent writing to an open file and verifies the
// indicator appears and accept-disk / keep-session work correctly.
// Usage:  electron test/ext-edit.js
const path = require('path'), fs = require('fs'), os = require('os');
const { app, BrowserWindow } = require('electron');
require(process.env.JADE_MAIN || path.join(__dirname, '..', 'main.js'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  let win; for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await sleep(100);
  const wc = win.webContents;
  for (let i = 0; i < 100; i++) { if (await wc.executeJavaScript('!!(window.app && window.app.editor)').catch(() => false)) break; await sleep(100); }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jade-extedit-'));
  const fileA = path.join(dir, 'test.md');
  const original = '# Original\n\nSome content here.\n';
  fs.writeFileSync(fileA, original);

  const results = await wc.executeJavaScript(`(async () => {
    const app = window.app;
    const out = [];
    const pass = (name) => out.push({ name, ok: true });
    const fail = (name, detail) => out.push({ name, ok: false, detail });

    // Open the test file
    await app.openFile(${JSON.stringify(fileA)});
    await new Promise(r => setTimeout(r, 500));

    const tab = app.tabs.find(t => t.filePath === ${JSON.stringify(fileA)});
    if (!tab) { fail('tab found', 'could not find tab'); return out; }
    pass('tab found');

    // Check indicator is hidden initially
    const btn = document.getElementById('ext-edit-btn');
    if (btn.classList.contains('ext-edit-hidden')) pass('indicator hidden initially');
    else fail('indicator hidden initially', btn.className);

    // Simulate external write by writing through IPC then waiting for watcher
    await window.jade.writeFile(${JSON.stringify(fileA)}, '# Changed externally\\n\\nNew content from Claude.\\n');
    // The watcher debounce + re-read takes a moment
    await new Promise(r => setTimeout(r, 2000));

    // Check that the tab detected the change
    if (tab.externalDiskContent !== null) pass('external change detected');
    else fail('external change detected', 'externalDiskContent is null');

    // Check indicator is visible
    if (btn.classList.contains('ext-edit-active')) pass('indicator pulsing');
    else fail('indicator pulsing', btn.className);

    // Check tab has ext-changed class
    const tabEl = document.querySelector('.tab.ext-changed');
    if (tabEl) pass('tab marked ext-changed');
    else fail('tab marked ext-changed', 'no .tab.ext-changed found');

    // Test accept-disk
    const diskContent = tab.externalDiskContent;
    app.acceptDiskContent(tab);
    const editorNow = app.editor.state.doc.toString();
    if (editorNow === diskContent) pass('accept-disk: editor updated');
    else fail('accept-disk: editor updated', 'editor content mismatch');

    if (tab.externalDiskContent === null) pass('accept-disk: flag cleared');
    else fail('accept-disk: flag cleared', 'externalDiskContent still set');

    if (btn.classList.contains('ext-edit-hidden')) pass('accept-disk: indicator hidden');
    else fail('accept-disk: indicator hidden', btn.className);

    // Now test keep-session: write externally again
    await window.jade.writeFile(${JSON.stringify(fileA)}, '# Second external change\\n');
    await new Promise(r => setTimeout(r, 2000));

    if (tab.externalDiskContent !== null) pass('second external change detected');
    else fail('second external change detected', 'externalDiskContent is null');

    app.keepSessionContent(tab);
    if (tab.externalDiskContent === null) pass('keep-session: flag cleared');
    else fail('keep-session: flag cleared', 'still set');

    // Editor should still have the first accepted content
    const editorAfterKeep = app.editor.state.doc.toString();
    if (editorAfterKeep === diskContent) pass('keep-session: editor unchanged');
    else fail('keep-session: editor unchanged', 'editor content changed');

    // Cleanup
    await app.closeTab(app.activeTabIndex);
    return out;
  })()`);

  let fail = 0;
  for (const r of results) {
    console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  -> ' + (r.detail || '')));
    if (!r.ok) fail++;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fail ? `\n${fail} failure(s)` : '\nall passed');
  app.exit(fail ? 1 : 0);
});
