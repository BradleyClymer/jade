// Regression test: markdown round-trip through preview rendering must not
// corrupt mermaid blocks, HTML comments, or quote characters.
// Drives the real renderer through Electron:  electron test/round-trip.js
const path = require('path'), fs = require('fs'), os = require('os');
const { app, BrowserWindow } = require('electron');
require(process.env.JADE_MAIN || path.join(__dirname, '..', 'main.js'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  let win; for (let i = 0; i < 100 && !(win = BrowserWindow.getAllWindows()[0]); i++) await sleep(100);
  const wc = win.webContents;
  for (let i = 0; i < 100; i++) { if (await wc.executeJavaScript('!!(window.app && window.app.editor)').catch(() => false)) break; await sleep(100); }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jade-roundtrip-'));
  const testFile = path.join(dir, 'roundtrip.md');

  const fixture = [
    '# Round-trip test',
    '',
    '<!-- GAP(intro): Brad owns this -->',
    '',
    'He said "hello" and she said \'goodbye\'. Don\'t break quotes.',
    '',
    '```mermaid',
    'flowchart TD',
    '    A["Start"] --> B{"Decision?"}',
    '    B -->|Yes| C["Do it"]',
    '    B -->|No| D["Skip"]',
    '```',
    '',
    '<!-- TODO: second diagram below -->',
    '',
    '```mermaid',
    'sequenceDiagram',
    '    Alice->>Bob: Hello Bob',
    '    Bob-->>Alice: Hi Alice',
    '```',
    '',
    'Some `inline code with "quotes"` here.',
    '',
    '```python',
    'x = "hello"',
    "y = 'world'",
    '```',
    '',
    '<!-- end of file -->',
    '',
  ].join('\n');

  fs.writeFileSync(testFile, fixture);

  const results = await wc.executeJavaScript(`(async () => {
    const app = window.app;
    const out = [];
    const fail = (name, detail) => out.push({ name, ok: false, detail });
    const pass = (name) => out.push({ name, ok: true, detail: '' });

    // Open the test file
    await app.openFile(${JSON.stringify(testFile)});
    // Wait for mermaid to render
    await new Promise(r => setTimeout(r, 2000));

    const original = ${JSON.stringify(fixture)};
    const editorContent = app.editor.state.doc.toString();

    // TEST 1: editor content unchanged after preview render (no mermaid leak)
    if (editorContent === original) pass('editor unchanged after preview render');
    else fail('editor unchanged after preview render', 'editor content differs from original');

    // TEST 2: simulate WYSIWYG round-trip (htmlToMarkdown of rendered preview)
    const previewHtml = document.getElementById('preview-content').innerHTML;
    const roundTripped = app.htmlToMarkdown(previewHtml);

    // TEST 2a: mermaid blocks preserved
    const mermaidBlocks = roundTripped.match(/\`\`\`mermaid[\\s\\S]*?\`\`\`/g) || [];
    if (mermaidBlocks.length === 2) pass('mermaid block count preserved (2)');
    else fail('mermaid block count preserved (2)', 'found ' + mermaidBlocks.length);

    if (roundTripped.includes('flowchart TD')) pass('flowchart source preserved');
    else fail('flowchart source preserved', 'flowchart TD not found in round-tripped text');

    if (roundTripped.includes('sequenceDiagram')) pass('sequence diagram source preserved');
    else fail('sequence diagram source preserved', 'sequenceDiagram not found');

    if (!roundTripped.includes('font-family')) pass('no SVG style leak');
    else fail('no SVG style leak', 'found font-family in round-tripped text');

    if (!roundTripped.includes('Syntax error')) pass('no mermaid error leak');
    else fail('no mermaid error leak', 'found Syntax error in round-tripped text');

    // TEST 3: HTML comments preserved
    const comments = roundTripped.match(/<!--[\\s\\S]*?-->/g) || [];
    if (comments.length >= 3) pass('HTML comments preserved (' + comments.length + ')');
    else fail('HTML comments preserved', 'found ' + comments.length + ', expected 3');

    if (roundTripped.includes('GAP(intro)')) pass('GAP comment content intact');
    else fail('GAP comment content intact', 'GAP(intro) not found');

    // TEST 4: straight quotes not converted to curly
    if (!roundTripped.includes('\\u201c') && !roundTripped.includes('\\u201d') &&
        !roundTripped.includes('\\u2018') && !roundTripped.includes('\\u2019'))
      pass('no curly quotes introduced');
    else fail('no curly quotes introduced', 'found curly quote characters');

    if (roundTripped.includes('"hello"')) pass('straight double quotes in text');
    else fail('straight double quotes in text', 'double quotes altered');

    // TEST 5: code fence content preserved
    if (roundTripped.includes('x = "hello"')) pass('code block quotes preserved');
    else fail('code block quotes preserved', 'quotes in code block altered');

    // TEST 6: auto-save writes original content (not preview DOM)
    await app.autoSave();
    const saved = await window.jade.readFile(${JSON.stringify(testFile)});
    if (saved.success && saved.content === original) pass('auto-save preserves original bytes');
    else fail('auto-save preserves original bytes', 'saved content differs');

    return out;
  })()`);

  let fail = 0;
  for (const r of results) {
    console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  -> ' + r.detail));
    if (!r.ok) fail++;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fail ? `\n${fail} failure(s)` : '\nall passed');
  app.exit(fail ? 1 : 0);
});
