import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars, dropCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, HighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches, openSearchPanel, replaceAll } from '@codemirror/search';
import { linter, lintGutter } from '@codemirror/lint';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';
import { vim } from '@replit/codemirror-vim';
import MarkdownIt from 'markdown-it';
import mermaid from 'mermaid';
import katex from 'katex';
import hljs from 'highlight.js/lib/core';

// Register common languages for code highlighting
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown_hljs from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', cpp);
hljs.registerLanguage('java', java);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('markdown', markdown_hljs);
hljs.registerLanguage('md', markdown_hljs);
hljs.registerLanguage('diff', diff);

// Mermaid config
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#2a5a3a',
    primaryTextColor: '#c8e6d0',
    primaryBorderColor: '#4a8a5a',
    lineColor: '#6aaa7a',
    secondaryColor: '#1a3a2a',
    tertiaryColor: '#0e2a1a',
    background: '#1a2e1a',
    mainBkg: '#2a5a3a',
    nodeBorder: '#4a8a5a',
    clusterBkg: '#1a3a2a',
    titleColor: '#c8e6d0',
    edgeLabelBackground: '#1a2e1a',
  },
});
let mermaidCounter = 0;

// Markdown renderer
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (str, lang) => {
    if (lang === 'mermaid') {
      const id = `mermaid-${mermaidCounter++}`;
      return `</code></pre><pre class="mermaid" id="${id}">${str}</pre><pre class="hidden"><code>`;
    }
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (_) {}
    }
    return '';
  },
});

// Task list support
md.use(function taskListPlugin(md) {
  md.core.ruler.after('inline', 'task-lists', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'inline') {
        const content = tokens[i].content;
        if (/^\[[ xX]\]\s/.test(content)) {
          const checked = /^\[[xX]\]/.test(content);
          tokens[i].content = content.replace(/^\[[ xX]\]\s*/, '');
          tokens[i].children = md.parseInline(tokens[i].content, tokens[i].env || {})[0].children;
          // Find the parent list item and modify it
          for (let j = i - 1; j >= 0; j--) {
            if (tokens[j].type === 'list_item_open') {
              tokens[j].attrSet('class', 'task-list-item');
              // Insert checkbox token
              const checkboxToken = new state.Token('html_inline', '', 0);
              checkboxToken.content = `<input type="checkbox" ${checked ? 'checked' : ''} disabled> `;
              tokens[i].children.unshift(checkboxToken);
              break;
            }
          }
        }
      }
    }
  });
});

// KaTeX math: $inline$ and $$block$$
md.use(function mathPlugin(md) {
  md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    if (state.src[state.pos] !== '$' || state.src[state.pos + 1] === '$') return false;
    const start = state.pos + 1;
    let end = state.src.indexOf('$', start);
    if (end === -1 || end === start) return false;
    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.markup = '$';
      token.content = state.src.slice(start, end);
    }
    state.pos = end + 1;
    return true;
  });

  md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    if (state.src.slice(startPos, startPos + 2) !== '$$') return false;
    if (silent) return true;
    let nextLine = startLine + 1;
    while (nextLine < endLine) {
      const pos = state.bMarks[nextLine] + state.tShift[nextLine];
      if (state.src.slice(pos, pos + 2) === '$$') break;
      nextLine++;
    }
    const content = state.getLines(startLine + 1, nextLine, state.tShift[startLine], false).trim();
    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = content;
    token.markup = '$$';
    state.line = nextLine + 1;
    return true;
  });

  md.renderer.rules.math_inline = (tokens, idx) => {
    try {
      return katex.renderToString(tokens[idx].content, { throwOnError: false });
    } catch (_) {
      return `<code>${md.utils.escapeHtml(tokens[idx].content)}</code>`;
    }
  };

  md.renderer.rules.math_block = (tokens, idx) => {
    try {
      return '<div class="katex-block">' + katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode: true }) + '</div>';
    } catch (_) {
      return `<pre><code>${md.utils.escapeHtml(tokens[idx].content)}</code></pre>`;
    }
  };
});

// Jade highlight style for the editor
const jadeHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--syntax-heading)', fontWeight: 'bold' },
  { tag: tags.heading1, fontSize: '1.4em' },
  { tag: tags.heading2, fontSize: '1.2em' },
  { tag: tags.emphasis, color: 'var(--syntax-emphasis)', fontStyle: 'italic' },
  { tag: tags.strong, color: 'var(--text-primary)', fontWeight: 'bold' },
  { tag: tags.keyword, color: 'var(--syntax-keyword)' },
  { tag: tags.url, color: 'var(--syntax-url)', textDecoration: 'underline' },
  { tag: tags.link, color: 'var(--syntax-url)' },
  { tag: tags.meta, color: 'var(--syntax-meta)' },
  { tag: tags.comment, color: 'var(--syntax-comment)' },
  { tag: tags.string, color: 'var(--syntax-string)' },
  { tag: tags.monospace, color: 'var(--syntax-string)' },
  { tag: tags.processingInstruction, color: 'var(--syntax-meta)' },
  { tag: tags.contentSeparator, color: 'var(--text-muted)' },
  { tag: tags.labelName, color: 'var(--syntax-url)' },
]);

// Markdown linter
function lintMarkdown(view) {
  const diagnostics = [];
  const doc = view.state.doc;
  let inCode = false;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    if (text.startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (/^#{1,6}[^#\s]/.test(text)) {
      const len = text.match(/^#+/)[0].length;
      diagnostics.push({ from: line.from, to: line.from + len + 1, severity: 'warning', message: 'Missing space after heading marker' });
    }
    if (text.trim() === '' && i >= 3) {
      const prev1 = doc.line(i - 1).text.trim();
      const prev2 = doc.line(i - 2).text.trim();
      if (prev1 === '' && prev2 === '') {
        diagnostics.push({ from: line.from, to: line.to, severity: 'info', message: 'Multiple consecutive blank lines' });
      }
    }
    if (/[^\s]\s+$/.test(text)) {
      const trailing = text.match(/(\s+)$/)[1];
      if (trailing !== '  ') {
        diagnostics.push({ from: line.to - trailing.length, to: line.to, severity: 'info', message: 'Trailing whitespace' });
      }
    }
  }
  return diagnostics;
}

// Tab state
class Tab {
  constructor(filePath = null, content = '') {
    this.filePath = filePath;
    this.savedContent = content;
    this.editorState = null;
    this.scrollTop = 0;
    this.previewScrollTop = 0;
  }

  get name() {
    if (this.filePath) {
      const parts = this.filePath.replace(/\\/g, '/').split('/');
      return parts[parts.length - 1];
    }
    return 'Untitled';
  }

  get modified() {
    if (!this.editorState) return false;
    return this.editorState.doc.toString() !== this.savedContent;
  }
}

class JadeApp {
  constructor() {
    this.tabs = [];
    this.activeTabIndex = -1;
    this.editor = null;
    this.extensions = null;
    this.zoomLevel = 0;
    this.viewMode = 'split';
    this.updateTimer = null;
    this.scrollLocked = true;
    this.vimEnabled = false;
    this.wordWrapEnabled = true;
    this.currentTheme = this.loadTheme();
    this.lintEnabled = false;
    this.vimCompartment = new Compartment();
    this.wrapCompartment = new Compartment();
    this.lintCompartment = new Compartment();

    this.tabsEl = document.getElementById('tabs');
    this.editorPane = document.getElementById('editor-pane');
    this.previewContent = document.getElementById('preview-content');
    this.statusFile = document.getElementById('status-file');
    this.statusCursor = document.getElementById('status-cursor');
    this.statusWords = document.getElementById('status-words');

    this.recentFiles = this.loadRecentFiles();

    this.initEditor();
    this.initLayout();
    this.initDivider();
    this.initDragDrop();
    this.initSyncScroll();
    this.initToolbar();
    this.initWysiwyg();
    this.bindIPC();
    this.bindUI();
    this.initAutoSave();
    this.loadCustomCSS();

    // Apply saved theme
    this.setTheme(this.currentTheme);

    // Open a blank tab to start
    this.newTab();
  }

  makeExtensions() {
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        this.schedulePreviewUpdate();
        this.updateTabModified();
        this.updateWindowTitle();
      }
      if (update.selectionSet || update.docChanged) {
        this.updateCursorStatus();
      }
    });

    return [
      this.vimCompartment.of([]),
      this.wrapCompartment.of(this.wordWrapEnabled ? EditorView.lineWrapping : []),
      this.lintCompartment.of([]),
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      syntaxHighlighting(jadeHighlightStyle),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      updateListener,
      keymap.of([
        { key: 'Mod-b', run: () => { this.toolbarAction('bold'); return true; } },
        { key: 'Mod-i', run: () => { this.toolbarAction('italic'); return true; } },
        { key: 'Mod-k', run: () => { this.toolbarAction('link'); return true; } },
        { key: 'Mod-Shift-k', run: () => { this.toolbarAction('code'); return true; } },
        { key: 'Mod-Shift-x', run: () => { this.toolbarAction('strikethrough'); return true; } },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
    ];
  }

  createState(doc = '') {
    return EditorState.create({ doc, extensions: this.makeExtensions() });
  }

  initEditor() {
    this.editor = new EditorView({
      state: this.createState(''),
      parent: this.editorPane,
    });
  }

  initSyncScroll() {
    let syncing = false;
    const editorScroller = () => this.editor.scrollDOM;
    const preview = this.previewContent;

    const syncEditorToPreview = () => {
      if (syncing || !this.scrollLocked) return;
      syncing = true;
      const scroller = editorScroller();
      const editorMax = scroller.scrollHeight - scroller.clientHeight;
      const previewMax = preview.scrollHeight - preview.clientHeight;
      if (editorMax > 0 && previewMax > 0) {
        const ratio = scroller.scrollTop / editorMax;
        preview.scrollTop = ratio * previewMax;
      }
      syncing = false;
    };

    const attachEditorScroll = () => {
      const scroller = editorScroller();
      if (scroller) {
        scroller.addEventListener('scroll', syncEditorToPreview, { passive: true });
      }
    };
    requestAnimationFrame(attachEditorScroll);
    this._attachEditorScroll = attachEditorScroll;
  }

  toggleScrollLock() {
    this.scrollLocked = !this.scrollLocked;
    const btn = document.getElementById('scroll-lock-btn');
    btn.classList.toggle('active', this.scrollLocked);
    btn.innerHTML = this.scrollLocked ? '&#128274;' : '&#128275;';
    btn.title = `Scroll sync (${this.scrollLocked ? 'on' : 'off'})`;
  }

  toggleVimMode() {
    this.vimEnabled = !this.vimEnabled;
    const btn = document.getElementById('vim-mode-btn');
    btn.classList.toggle('active', this.vimEnabled);
    btn.title = `Vim mode (${this.vimEnabled ? 'on' : 'off'})`;
    this.editor.dispatch({
      effects: this.vimCompartment.reconfigure(this.vimEnabled ? vim() : [])
    });
  }

  toggleWordWrap() {
    this.wordWrapEnabled = !this.wordWrapEnabled;
    const btn = document.getElementById('wrap-btn');
    btn.classList.toggle('active', this.wordWrapEnabled);
    btn.title = `Word wrap (${this.wordWrapEnabled ? 'on' : 'off'})`;
    this.editor.dispatch({
      effects: this.wrapCompartment.reconfigure(this.wordWrapEnabled ? EditorView.lineWrapping : [])
    });
  }

  toggleLint() {
    this.lintEnabled = !this.lintEnabled;
    const btn = document.getElementById('lint-btn');
    btn.classList.toggle('active', this.lintEnabled);
    btn.title = `Markdown lint (${this.lintEnabled ? 'on' : 'off'})`;
    this.editor.dispatch({
      effects: this.lintCompartment.reconfigure(
        this.lintEnabled ? [lintGutter(), linter(lintMarkdown)] : []
      )
    });
  }

  // Theme
  loadTheme() {
    try { return localStorage.getItem('jade-theme') || 'jade'; } catch (_) { return 'jade'; }
  }

  setTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('jade-theme', theme); } catch (_) {}
    const btn = document.getElementById('theme-btn');
    const labels = { jade: 'Jade', dark: 'Dark', light: 'Light' };
    btn.textContent = labels[theme] || theme;
  }

  cycleTheme() {
    const themes = ['jade', 'dark', 'light'];
    const idx = themes.indexOf(this.currentTheme);
    this.setTheme(themes[(idx + 1) % themes.length]);
  }

  // WYSIWYG preview editing
  initWysiwyg() {
    this.previewContent.setAttribute('contenteditable', 'true');
    this.previewContent.setAttribute('spellcheck', 'true');
    this._wysiwygActive = false;

    this.previewContent.addEventListener('focus', () => {
      this._wysiwygActive = true;
    });

    this.previewContent.addEventListener('blur', () => {
      if (!this._wysiwygActive) return;
      this._wysiwygActive = false;
      this.syncPreviewToEditor();
    });

    this.previewContent.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._wysiwygActive = false;
        this.syncPreviewToEditor();
        this.editor.focus();
      }
    });
  }

  syncPreviewToEditor() {
    const html = this.previewContent.innerHTML;
    const mdText = this.htmlToMarkdown(html);
    const current = this.editor.state.doc.toString();
    if (mdText !== current) {
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: mdText }
      });
    }
  }

  htmlToMarkdown(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return this.nodeToMd(div).trim();
  }

  nodeToMd(node) {
    let result = '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        result += child.textContent;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toLowerCase();
      const inner = this.nodeToMd(child);
      switch (tag) {
        case 'h1': result += `# ${inner}\n\n`; break;
        case 'h2': result += `## ${inner}\n\n`; break;
        case 'h3': result += `### ${inner}\n\n`; break;
        case 'h4': result += `#### ${inner}\n\n`; break;
        case 'h5': result += `##### ${inner}\n\n`; break;
        case 'h6': result += `###### ${inner}\n\n`; break;
        case 'p': result += `${inner}\n\n`; break;
        case 'br': result += '\n'; break;
        case 'strong': case 'b': result += `**${inner}**`; break;
        case 'em': case 'i': result += `*${inner}*`; break;
        case 'del': case 's': result += `~~${inner}~~`; break;
        case 'code':
          if (child.parentElement && child.parentElement.tagName === 'PRE') {
            result += inner;
          } else {
            result += `\`${inner}\``;
          }
          break;
        case 'pre':
          if (child.classList.contains('mermaid')) {
            result += `\`\`\`mermaid\n${child.textContent}\n\`\`\`\n\n`;
          } else {
            const codeEl = child.querySelector('code');
            const lang = codeEl ? (codeEl.className.match(/language-(\w+)/) || [])[1] || '' : '';
            result += `\`\`\`${lang}\n${child.textContent}\n\`\`\`\n\n`;
          }
          break;
        case 'a': {
          const href = child.getAttribute('href') || '';
          result += `[${inner}](${href})`;
          break;
        }
        case 'img': {
          const src = child.getAttribute('src') || '';
          const alt = child.getAttribute('alt') || '';
          result += `![${alt}](${src})`;
          break;
        }
        case 'blockquote':
          result += inner.split('\n').filter(l => l.trim()).map(l => `> ${l}`).join('\n') + '\n\n';
          break;
        case 'ul': case 'ol': {
          let idx = 1;
          for (const li of child.children) {
            if (li.tagName === 'LI') {
              const prefix = tag === 'ol' ? `${idx++}. ` : '- ';
              const checkbox = li.querySelector('input[type="checkbox"]');
              if (checkbox) {
                result += `- [${checkbox.checked ? 'x' : ' '}] ${this.nodeToMd(li).replace(/^\s*/, '')}\n`;
              } else {
                result += `${prefix}${this.nodeToMd(li).trim()}\n`;
              }
            }
          }
          result += '\n';
          break;
        }
        case 'hr': result += '---\n\n'; break;
        case 'table': {
          const rows = child.querySelectorAll('tr');
          const tableRows = [];
          rows.forEach((row, ri) => {
            const cells = Array.from(row.querySelectorAll('th, td')).map(c => c.textContent.trim());
            tableRows.push('| ' + cells.join(' | ') + ' |');
            if (ri === 0) {
              tableRows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
            }
          });
          result += tableRows.join('\n') + '\n\n';
          break;
        }
        case 'div':
          if (child.classList.contains('katex-block')) {
            const tex = child.querySelector('annotation[encoding="application/x-tex"]');
            if (tex) result += `$$\n${tex.textContent}\n$$\n\n`;
            else result += inner;
          } else {
            result += inner;
          }
          break;
        case 'span':
          if (child.classList.contains('katex')) {
            const tex = child.querySelector('annotation[encoding="application/x-tex"]');
            if (tex) result += `$${tex.textContent}$`;
            else result += inner;
          } else {
            result += inner;
          }
          break;
        case 'input': break;
        case 'li': result += inner; break;
        default: result += inner;
      }
    }
    return result;
  }

  initLayout() {
    this.splitRatio = 0.5;
    const applyLayout = () => {
      const workspace = document.getElementById('workspace');
      const editor = document.getElementById('editor-pane');
      const preview = document.getElementById('preview-pane');
      const divider = document.getElementById('divider');
      const totalW = workspace.offsetWidth;
      const divW = 4;
      const editorW = Math.floor((totalW - divW) * this.splitRatio);
      const previewW = totalW - divW - editorW;

      editor.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:${editorW}px;overflow:hidden;`;
      divider.style.cssText = `position:absolute;left:${editorW}px;top:0;bottom:0;width:${divW}px;cursor:col-resize;background:var(--border);z-index:1;`;
      preview.style.cssText = `position:absolute;left:${editorW + divW}px;top:0;bottom:0;width:${previewW}px;overflow:hidden;background:var(--bg-surface);border-left:1px solid var(--border);`;

      const cmEditor = editor.querySelector('.cm-editor');
      if (cmEditor) {
        cmEditor.style.cssText = 'width:100%!important;height:100%!important;';
      }
    };

    const workspace = document.getElementById('workspace');
    workspace.style.cssText = `position:relative;height:calc(100vh - 36px - 24px);overflow:hidden;`;

    applyLayout();
    window.addEventListener('resize', applyLayout);
    this._applyLayout = applyLayout;
  }

  initDivider() {
    const divider = document.getElementById('divider');
    const workspace = document.getElementById('workspace');
    let startX, startRatio;

    const onMouseMove = (e) => {
      const totalW = workspace.offsetWidth;
      const dx = e.clientX - startX;
      const newRatio = startRatio + dx / totalW;
      this.splitRatio = Math.max(0.15, Math.min(0.85, newRatio));
      if (this._applyLayout) this._applyLayout();
    };

    const onMouseUp = () => {
      divider.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    divider.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startRatio = this.splitRatio;
      divider.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  initDragDrop() {
    let dragCounter = 0;
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'];

    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) document.body.classList.add('dragging-file');
    });

    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) document.body.classList.remove('dragging-file');
    });

    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      document.body.classList.remove('dragging-file');
      const files = e.dataTransfer.files;
      for (const file of files) {
        if (!file.path) continue;
        const ext = file.path.toLowerCase().replace(/.*\./, '.');
        if (imageExts.includes(ext)) {
          this.insertAtCursor(`![${file.name}](${file.path.replace(/\\/g, '/')})`);
        } else {
          this.openFile(file.path);
        }
      }
    });
  }

  initToolbar() {
    const toolbar = document.getElementById('toolbar');
    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.tb-btn');
      if (!btn) return;
      const action = btn.dataset.action;
      this.toolbarAction(action);
      this.editor.focus();
    });

    document.getElementById('scroll-lock-btn').addEventListener('click', () => this.toggleScrollLock());
    document.getElementById('vim-mode-btn').addEventListener('click', () => this.toggleVimMode());
    document.getElementById('wrap-btn').addEventListener('click', () => this.toggleWordWrap());
    document.getElementById('theme-btn').addEventListener('click', () => this.cycleTheme());
    document.getElementById('lint-btn').addEventListener('click', () => this.toggleLint());
  }

  toolbarAction(action) {
    const state = this.editor.state;
    const sel = state.selection.main;
    const selected = state.sliceDoc(sel.from, sel.to);
    const line = state.doc.lineAt(sel.from);

    const wrapWith = (before, after) => {
      if (selected) {
        this.editor.dispatch({ changes: { from: sel.from, to: sel.to, insert: before + selected + after } });
      } else {
        this.editor.dispatch({ changes: { from: sel.from, insert: before + after }, selection: { anchor: sel.from + before.length } });
      }
    };

    const prefixLine = (prefix) => {
      this.editor.dispatch({ changes: { from: line.from, to: line.from, insert: prefix } });
    };

    switch (action) {
      case 'bold': wrapWith('**', '**'); break;
      case 'italic': wrapWith('*', '*'); break;
      case 'strikethrough': wrapWith('~~', '~~'); break;
      case 'code': wrapWith('`', '`'); break;
      case 'h1': prefixLine('# '); break;
      case 'h2': prefixLine('## '); break;
      case 'h3': prefixLine('### '); break;
      case 'ul': prefixLine('- '); break;
      case 'ol': prefixLine('1. '); break;
      case 'task': prefixLine('- [ ] '); break;
      case 'blockquote': prefixLine('> '); break;
      case 'link': wrapWith('[', '](url)'); break;
      case 'image': wrapWith('![', '](image-url)'); break;
      case 'hr':
        this.editor.dispatch({ changes: { from: line.to, insert: '\n\n---\n' } });
        break;
      case 'codeblock':
        if (selected) {
          this.editor.dispatch({ changes: { from: sel.from, to: sel.to, insert: '```\n' + selected + '\n```' } });
        } else {
          this.editor.dispatch({ changes: { from: sel.from, insert: '```\n\n```' }, selection: { anchor: sel.from + 4 } });
        }
        break;
      case 'table':
        this.editor.dispatch({ changes: { from: line.to, insert: '\n\n| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n' } });
        break;
    }
  }

  insertAtCursor(text) {
    const sel = this.editor.state.selection.main;
    this.editor.dispatch({ changes: { from: sel.from, to: sel.to, insert: text } });
  }

  bindIPC() {
    window.jade.onOpenFile((path) => this.openFile(path));
    window.jade.onNewFile(() => this.newTab());
    window.jade.onSaveFile(() => this.saveCurrentTab());
    window.jade.onSaveFileAs(() => this.saveCurrentTabAs());
    window.jade.onCloseTab(() => this.closeTab(this.activeTabIndex));
    window.jade.onTogglePreview(() => this.togglePreview());
    window.jade.onSetView((mode) => this.setViewMode(mode));
    window.jade.onZoom((dir) => this.handleZoom(dir));
    window.jade.onFind(() => openSearchPanel(this.editor));
    window.jade.onReplace(() => openSearchPanel(this.editor));
    window.jade.onExportPdf(() => this.exportToPdf());
    window.jade.onExportLatex(() => this.exportToLatex());
    window.jade.onOpenRecent((path) => this.openFile(path));
    window.jade.onSetTheme((theme) => this.setTheme(theme));
    window.jade.onExportLatexProject(() => this.exportToLatexProject());
    window.jade.onSelectCustomCSS(() => this.selectCustomCSS());
    window.jade.onClearCustomCSS(() => this.clearCustomCSS());
  }

  bindUI() {
    document.getElementById('new-tab-btn').addEventListener('click', () => this.newTab());
  }

  // Recent files
  loadRecentFiles() {
    try {
      return JSON.parse(localStorage.getItem('jade-recent-files') || '[]');
    } catch (_) {
      return [];
    }
  }

  addRecentFile(filePath) {
    if (!filePath) return;
    this.recentFiles = this.recentFiles.filter(f => f !== filePath);
    this.recentFiles.unshift(filePath);
    if (this.recentFiles.length > 10) this.recentFiles.length = 10;
    try {
      localStorage.setItem('jade-recent-files', JSON.stringify(this.recentFiles));
    } catch (_) {}
    window.jade.updateRecentFiles(this.recentFiles);
  }

  // Auto-save
  initAutoSave() {
    setInterval(() => this.autoSave(), 30000);
  }

  async autoSave() {
    for (let i = 0; i < this.tabs.length; i++) {
      const tab = this.tabs[i];
      if (!tab.filePath) continue;
      if (i === this.activeTabIndex) tab.editorState = this.editor.state;
      const content = tab.editorState ? tab.editorState.doc.toString() : '';
      if (content !== tab.savedContent) {
        const result = await window.jade.writeFile(tab.filePath, content);
        if (result.success) {
          tab.savedContent = content;
          this.renderTabs();
          this.updateWindowTitle();
        }
      }
    }
  }

  // Tab management
  newTab(filePath = null, content = '') {
    const tab = new Tab(filePath, content);
    tab.editorState = this.createState(content);
    this.tabs.push(tab);
    this.switchToTab(this.tabs.length - 1);
    this.renderTabs();
    this.updatePreview();
  }

  switchToTab(index) {
    if (index < 0 || index >= this.tabs.length) return;

    // Save current tab state
    if (this.activeTabIndex >= 0 && this.activeTabIndex < this.tabs.length) {
      const current = this.tabs[this.activeTabIndex];
      current.editorState = this.editor.state;
      current.scrollTop = this.editor.scrollDOM.scrollTop;
      current.previewScrollTop = this.previewContent.scrollTop;
    }

    this.activeTabIndex = index;
    const tab = this.tabs[index];

    // Restore tab state
    this.editor.setState(tab.editorState || this.createState(tab.savedContent));

    requestAnimationFrame(() => {
      this.editor.scrollDOM.scrollTop = tab.scrollTop;
      this.previewContent.scrollTop = tab.previewScrollTop;
    });

    this.renderTabs();
    this.updatePreview();
    this.updateStatusBar();
    this.updateWindowTitle();
    this.editor.focus();
    if (this._attachEditorScroll) requestAnimationFrame(this._attachEditorScroll);
  }

  async closeTab(index) {
    if (index < 0 || index >= this.tabs.length) return;
    const tab = this.tabs[index];

    // Sync state if it's the active tab
    if (index === this.activeTabIndex) {
      tab.editorState = this.editor.state;
    }

    // Check for unsaved changes
    const content = tab.editorState ? tab.editorState.doc.toString() : '';
    if (content !== tab.savedContent) {
      const result = await window.jade.confirmDiscard(tab.name);
      if (result === 2) return; // Cancel
      if (result === 0) { // Save
        const saved = await this.saveTab(index);
        if (!saved) return;
      }
    }

    this.tabs.splice(index, 1);

    if (this.tabs.length === 0) {
      this.newTab();
      return;
    }

    if (this.activeTabIndex >= this.tabs.length) {
      this.activeTabIndex = this.tabs.length - 1;
    } else if (index < this.activeTabIndex) {
      this.activeTabIndex--;
    } else if (index === this.activeTabIndex) {
      this.activeTabIndex = Math.min(index, this.tabs.length - 1);
    }

    this.switchToTab(this.activeTabIndex);
  }

  renderTabs() {
    this.tabsEl.innerHTML = '';
    this.tabs.forEach((tab, i) => {
      const el = document.createElement('div');
      el.className = 'tab' + (i === this.activeTabIndex ? ' active' : '') + (tab.modified ? ' modified' : '');
      el.innerHTML = `
        <span class="tab-modified">●</span>
        <span class="tab-title">${this.escapeHtml(tab.name)}</span>
        <button class="tab-close" title="Close">×</button>
      `;
      el.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
          this.switchToTab(i);
        }
      });
      el.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(i);
      });
      this.tabsEl.appendChild(el);
    });
  }

  updateTabModified() {
    if (this.activeTabIndex < 0) return;
    const tab = this.tabs[this.activeTabIndex];
    tab.editorState = this.editor.state;
    this.renderTabs();
  }

  // File operations
  async openFile(filePath) {
    // Check if already open
    const existing = this.tabs.findIndex(t => t.filePath === filePath);
    if (existing >= 0) {
      this.switchToTab(existing);
      return;
    }

    const result = await window.jade.readFile(filePath);
    if (!result.success) return;

    // If current tab is empty and unmodified, replace it in-place
    const currentTab = this.tabs[this.activeTabIndex];
    if (currentTab && !currentTab.filePath && !currentTab.modified) {
      currentTab.filePath = filePath;
      currentTab.savedContent = result.content;
      const newState = this.createState(result.content);
      this.editor.setState(newState);
      currentTab.editorState = this.editor.state;
      this.renderTabs();
      this.updatePreview();
      this.updateStatusBar();
      this.updateWindowTitle();
    } else {
      const tab = new Tab(filePath, result.content);
      this.tabs.push(tab);
      this.switchToTab(this.tabs.length - 1);
    }
    this.addRecentFile(filePath);
    this.renderTabs();
    this.updatePreview();
  }

  async saveCurrentTab() {
    return this.saveTab(this.activeTabIndex);
  }

  async saveTab(index) {
    if (index < 0 || index >= this.tabs.length) return false;
    const tab = this.tabs[index];

    // Sync state if active
    if (index === this.activeTabIndex) {
      tab.editorState = this.editor.state;
    }

    if (!tab.filePath) {
      return this.saveTabAs(index);
    }

    const content = tab.editorState ? tab.editorState.doc.toString() : '';
    const result = await window.jade.writeFile(tab.filePath, content);
    if (result.success) {
      tab.savedContent = content;
      this.renderTabs();
      this.updateWindowTitle();
      return true;
    }
    return false;
  }

  async saveCurrentTabAs() {
    return this.saveTabAs(this.activeTabIndex);
  }

  async saveTabAs(index) {
    if (index < 0 || index >= this.tabs.length) return false;
    const tab = this.tabs[index];

    if (index === this.activeTabIndex) {
      tab.editorState = this.editor.state;
    }

    const result = await window.jade.saveDialog();
    if (result.canceled) return false;

    tab.filePath = result.filePath;
    const content = tab.editorState ? tab.editorState.doc.toString() : '';
    const writeResult = await window.jade.writeFile(tab.filePath, content);
    if (writeResult.success) {
      tab.savedContent = content;
      this.renderTabs();
      this.updateWindowTitle();
      return true;
    }
    return false;
  }

  // Preview
  schedulePreviewUpdate() {
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => this.updatePreview(), 80);
  }

  async updatePreview() {
    if (this._wysiwygActive) return;
    const content = this.editor.state.doc.toString();
    mermaidCounter = 0;
    const html = md.render(content);
    this.previewContent.innerHTML = html;
    const mermaidEls = this.previewContent.querySelectorAll('pre.mermaid');
    if (mermaidEls.length > 0) {
      try {
        await mermaid.run({ nodes: mermaidEls });
      } catch (_) {}
    }
  }

  // View modes
  togglePreview() {
    const modes = ['split', 'editor', 'preview'];
    const current = modes.indexOf(this.viewMode);
    this.setViewMode(modes[(current + 1) % modes.length]);
  }

  setViewMode(mode) {
    document.body.classList.remove('view-editor', 'view-preview', 'view-split');
    if (mode !== 'split') {
      document.body.classList.add('view-' + mode);
    }
    this.viewMode = mode;

    const editor = document.getElementById('editor-pane');
    const preview = document.getElementById('preview-pane');
    const workspace = document.getElementById('workspace');
    const totalW = workspace.offsetWidth;

    if (mode === 'editor') {
      editor.style.width = totalW + 'px';
    } else if (mode === 'preview') {
      preview.style.left = '0px';
      preview.style.width = totalW + 'px';
    } else {
      if (this._applyLayout) this._applyLayout();
    }

    if (mode !== 'editor') {
      this.updatePreview();
    }
  }

  // Zoom
  handleZoom(direction) {
    if (direction === 0) {
      this.zoomLevel = 0;
    } else {
      this.zoomLevel += direction;
    }
    this.zoomLevel = Math.max(-5, Math.min(5, this.zoomLevel));
    const scale = 1 + this.zoomLevel * 0.1;
    document.documentElement.style.fontSize = (14 * scale) + 'px';
  }

  // Status bar
  updateStatusBar() {
    const tab = this.tabs[this.activeTabIndex];
    if (!tab) return;
    this.statusFile.textContent = tab.filePath || 'Untitled';
    this.updateCursorStatus();
  }

  updateCursorStatus() {
    const sel = this.editor.state.selection.main;
    const line = this.editor.state.doc.lineAt(sel.head);
    const col = sel.head - line.from + 1;
    this.statusCursor.textContent = `Ln ${line.number}, Col ${col}`;

    const text = this.editor.state.doc.toString();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    this.statusWords.textContent = `${words} words`;
  }

  async updateWindowTitle() {
    const tab = this.tabs[this.activeTabIndex];
    if (!tab) return;
    const title = await window.jade.getTitle(tab.filePath, tab.modified);
    window.jade.setTitle(title);
  }

  async exportToPdf() {
    const content = this.editor.state.doc.toString();
    const rendered = md.render(content);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.7; color: #1a1a1a; max-width: 700px; margin: 0 auto; padding: 40px; }
        h1 { font-size: 2em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
        h2 { font-size: 1.6em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
        h3 { font-size: 1.3em; }
        pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
        code { background: #f6f8fa; padding: 2px 6px; border-radius: 3px; font-family: Consolas, monospace; font-size: 0.9em; }
        pre code { background: none; padding: 0; font-size: 13px; line-height: 1.5; }
        blockquote { border-left: 3px solid #ddd; padding-left: 16px; margin: 0 0 1em; color: #666; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background: #f6f8fa; }
        hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
        img { max-width: 100%; }
        .katex-block { padding: 12px 0; overflow-x: auto; }
        .hljs { color: #24292f; }
        .hljs-keyword { color: #cf222e; }
        .hljs-string { color: #0a3069; }
        .hljs-comment { color: #6e7781; font-style: italic; }
        .hljs-title, .hljs-function { color: #8250df; }
        .hljs-number, .hljs-literal { color: #0550ae; }
        .hljs-built_in, .hljs-type { color: #953800; }
        .hljs-attr { color: #0550ae; }
        .hljs-meta { color: #8250df; }
        .hljs-params { color: #24292f; }
        .hljs-tag, .hljs-name { color: #116329; }
        .hljs-attribute { color: #0550ae; }
        .hljs-punctuation { color: #24292f; }
      </style></head><body>${rendered}</body></html>`;
    await window.jade.exportPdf(html);
  }

  async exportToLatex() {
    const result = await window.jade.exportLatex();
    if (result.canceled) return;

    const content = this.editor.state.doc.toString();
    const latex = this.markdownToLatex(content);
    await window.jade.writeFile(result.filePath, latex);
  }

  markdownToLatex(mdText, options = {}) {
    const lines = mdText.split('\n');
    const result = [];
    let i = 0;
    let title = '';
    let inList = null;
    const preamble = options.preamble !== false;
    const sectionCmd = options.sectionCmd || 'section';

    const flushList = () => {
      if (inList) { result.push(`\\end{${inList}}`); inList = null; }
    };

    if (preamble) {
      for (const l of lines) { if (l.startsWith('# ')) { title = l.slice(2); break; } }
      result.push('\\documentclass{article}', '\\usepackage[utf8]{inputenc}', '\\usepackage{graphicx}',
        '\\usepackage{hyperref}', '\\usepackage{listings}', '\\usepackage{amsmath}',
        '\\usepackage{amssymb}', '\\usepackage{booktabs}', '\\usepackage{soul}',
        '\\usepackage[margin=1in]{geometry}', '');
      if (title) { result.push(`\\title{${this.texEscape(title)}}`, '\\author{}', '\\date{}'); }
      result.push('', '\\begin{document}');
      if (title) result.push('\\maketitle');
      result.push('');
    }

    let firstH1 = true;

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('```')) {
        flushList();
        const lang = line.slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
        if (i < lines.length) i++;
        if (lang === 'mermaid') {
          result.push('% Mermaid diagram (not rendered in LaTeX)', '\\begin{verbatim}', codeLines.join('\n'), '\\end{verbatim}');
        } else {
          result.push('\\begin{lstlisting}' + (lang ? `[language=${lang}]` : ''), codeLines.join('\n'), '\\end{lstlisting}');
        }
        continue;
      }

      if (line.trim() === '$$') {
        flushList();
        result.push('\\[');
        i++;
        while (i < lines.length && lines[i].trim() !== '$$') { result.push(lines[i]); i++; }
        if (i < lines.length) i++;
        result.push('\\]');
        continue;
      }

      if (/^\|.+\|/.test(line.trim())) {
        flushList();
        const tableRows = [];
        while (i < lines.length && /^\|.+\|/.test(lines[i].trim())) {
          const row = lines[i].trim();
          if (/^\|[\s\-:|]+\|$/.test(row)) { i++; continue; }
          tableRows.push(row.split('|').slice(1, -1).map(c => c.trim()));
          i++;
        }
        if (tableRows.length > 0) {
          const cols = tableRows[0].length;
          result.push(`\\begin{tabular}{${'l '.repeat(cols).trim()}}`, '\\toprule');
          result.push(tableRows[0].map(c => this.processInline(c)).join(' & ') + ' \\\\', '\\midrule');
          for (let r = 1; r < tableRows.length; r++) {
            result.push(tableRows[r].map(c => this.processInline(c)).join(' & ') + ' \\\\');
          }
          result.push('\\bottomrule', '\\end{tabular}', '');
        }
        continue;
      }

      if (line.startsWith('# ')) {
        flushList();
        if (preamble && firstH1) { firstH1 = false; }
        else { result.push(`\\${sectionCmd}{${this.texEscape(line.slice(2))}}`); }
        i++; continue;
      }
      if (line.startsWith('## ')) {
        flushList();
        const sub = sectionCmd === 'chapter' ? 'section' : 'subsection';
        result.push(`\\${sub}{${this.texEscape(line.slice(3))}}`);
        i++; continue;
      }
      if (line.startsWith('### ')) {
        flushList();
        const sub = sectionCmd === 'chapter' ? 'subsection' : 'subsubsection';
        result.push(`\\${sub}{${this.texEscape(line.slice(4))}}`);
        i++; continue;
      }
      if (line.startsWith('#### ')) {
        flushList();
        result.push(`\\paragraph{${this.texEscape(line.slice(5))}}`);
        i++; continue;
      }

      if (line.startsWith('> ')) {
        flushList();
        const quoteLines = [];
        while (i < lines.length && lines[i].startsWith('> ')) { quoteLines.push(lines[i].slice(2)); i++; }
        result.push('\\begin{quote}', quoteLines.map(l => this.processInline(l)).join('\n'), '\\end{quote}');
        continue;
      }

      if (/^[-*]\s/.test(line)) {
        if (inList !== 'itemize') { flushList(); result.push('\\begin{itemize}'); inList = 'itemize'; }
        const taskMatch = line.match(/^[-*]\s+\[([xX ])\]\s+(.*)/);
        if (taskMatch) {
          const checked = taskMatch[1] !== ' ';
          result.push(`\\item[${checked ? '$\\boxtimes$' : '$\\square$'}] ${this.processInline(taskMatch[2])}`);
        } else {
          result.push(`\\item ${this.processInline(line.replace(/^[-*]\s+/, ''))}`);
        }
        i++; continue;
      }

      if (/^\d+\.\s/.test(line)) {
        if (inList !== 'enumerate') { flushList(); result.push('\\begin{enumerate}'); inList = 'enumerate'; }
        result.push(`\\item ${this.processInline(line.replace(/^\d+\.\s+/, ''))}`);
        i++; continue;
      }

      if (/^(---|\*\*\*|___)/.test(line.trim()) && line.trim().length >= 3) {
        flushList(); result.push('\\hrule\\vspace{1em}'); i++; continue;
      }

      const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (imgMatch) {
        flushList();
        result.push('\\begin{figure}[h]', '\\centering', `\\includegraphics[width=0.8\\textwidth]{${imgMatch[2]}}`);
        if (imgMatch[1]) result.push(`\\caption{${this.texEscape(imgMatch[1])}}`);
        result.push('\\end{figure}');
        i++; continue;
      }

      if (line.trim() === '') { flushList(); result.push(''); i++; continue; }

      flushList();
      result.push(this.processInline(line));
      i++;
    }

    flushList();
    if (preamble) { result.push('', '\\end{document}'); }
    return result.join('\n');
  }

  processInline(text) {
    const ph = [];
    let s = text;
    s = s.replace(/\$\$(.+?)\$\$/g, (_, m) => { ph.push(`\\[${m}\\]`); return `\x01${ph.length - 1}\x01`; });
    s = s.replace(/\$(.+?)\$/g, (_, m) => { ph.push(`$${m}$`); return `\x01${ph.length - 1}\x01`; });
    s = s.replace(/`(.+?)`/g, (_, c) => { ph.push(`\\texttt{${this.texEscape(c)}}`); return `\x01${ph.length - 1}\x01`; });
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, a, u) => { ph.push(`\\includegraphics{${u}}`); return `\x01${ph.length - 1}\x01`; });
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => { ph.push(`\\href{${u}}{${this.texEscape(t)}}`); return `\x01${ph.length - 1}\x01`; });
    s = s.replace(/~~(.+?)~~/g, (_, t) => { ph.push(`\\sout{${this.texEscape(t)}}`); return `\x01${ph.length - 1}\x01`; });
    s = this.texEscape(s);
    s = s.replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}');
    s = s.replace(/\*(.+?)\*/g, '\\textit{$1}');
    s = s.replace(/\x01(\d+)\x01/g, (_, idx) => ph[parseInt(idx)]);
    return s;
  }

  texEscape(s) {
    return s.replace(/([&%$#_{}~^\\])/g, '\\$1');
  }

  texSlug(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  }

  splitByH1(mdText) {
    const lines = mdText.split('\n');
    const sections = [];
    let currentTitle = '';
    let currentLines = [];
    for (const line of lines) {
      if (line.startsWith('# ')) {
        if (currentLines.length > 0) sections.push({ title: currentTitle, content: currentLines.join('\n') });
        currentTitle = line.slice(2);
        currentLines = [line];
      } else {
        currentLines.push(line);
      }
    }
    if (currentLines.length > 0) sections.push({ title: currentTitle, content: currentLines.join('\n') });
    return sections;
  }

  async exportToLatexProject() {
    const content = this.editor.state.doc.toString();
    const sections = this.splitByH1(content);
    if (sections.length < 2) return this.exportToLatex();

    const dirResult = await window.jade.selectDirectory();
    if (dirResult.canceled) return;
    const dir = dirResult.path;
    const docTitle = sections[0].title || 'Document';
    const useReport = sections.length > 3;
    const docClass = useReport ? 'report' : 'article';
    const secCmd = useReport ? 'chapter' : 'section';

    const chapterFiles = [];
    for (let idx = 0; idx < sections.length; idx++) {
      const sec = sections[idx];
      const slug = this.texSlug(sec.title) || `section_${String(idx + 1).padStart(2, '0')}`;
      chapterFiles.push(slug);
      const latex = this.markdownToLatex(sec.content, { preamble: false, sectionCmd: secCmd });
      await window.jade.writeFile(`${dir}/${slug}.tex`, latex);
    }

    const main = [
      `\\documentclass{${docClass}}`, '\\usepackage[utf8]{inputenc}', '\\usepackage{graphicx}',
      '\\usepackage{hyperref}', '\\usepackage{listings}', '\\usepackage{amsmath}',
      '\\usepackage{amssymb}', '\\usepackage{booktabs}', '\\usepackage{soul}',
      '\\usepackage[margin=1in]{geometry}', '',
      `\\title{${this.texEscape(docTitle)}}`, '\\author{}', '\\date{\\today}', '',
      '\\begin{document}', '\\maketitle', '\\tableofcontents', '\\newpage', '',
      ...chapterFiles.map(f => `\\input{${f}}`),
      '', '\\end{document}',
    ];
    await window.jade.writeFile(`${dir}/main.tex`, main.join('\n'));
  }

  // Custom CSS for preview
  async loadCustomCSS() {
    try {
      const cssPath = localStorage.getItem('jade-custom-css');
      if (!cssPath) return;
      const result = await window.jade.readFile(cssPath);
      if (result.success) this.applyCustomCSS(result.content);
    } catch (_) {}
  }

  applyCustomCSS(css) {
    let el = document.getElementById('custom-preview-css');
    if (!el) { el = document.createElement('style'); el.id = 'custom-preview-css'; document.head.appendChild(el); }
    el.textContent = css;
  }

  async selectCustomCSS() {
    const result = await window.jade.openCSSFile();
    if (result.canceled) return;
    try { localStorage.setItem('jade-custom-css', result.path); } catch (_) {}
    const file = await window.jade.readFile(result.path);
    if (file.success) this.applyCustomCSS(file.content);
  }

  clearCustomCSS() {
    try { localStorage.removeItem('jade-custom-css'); } catch (_) {}
    const el = document.getElementById('custom-preview-css');
    if (el) el.remove();
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  window.app = new JadeApp();
});
