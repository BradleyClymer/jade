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
import { latex as latexLang } from 'codemirror-lang-latex';
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

  get isLatex() {
    return this.filePath && /\.tex$/i.test(this.filePath);
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
    this.outlineVisible = false;
    this.lintEnabled = false;
    this.pdfPageSize = this.loadPdfPageSize();
    this.minimapVisible = false;
    this.snippets = this.loadSnippets();
    this.tableEditorActive = false;
    this.gitPanelVisible = false;
    this.spellCheckEnabled = false;
    this.spellDict = null;
    this.customDict = this.loadCustomDict();
    this.vimCompartment = new Compartment();
    this.wrapCompartment = new Compartment();
    this.lintCompartment = new Compartment();
    this.langCompartment = new Compartment();

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
    this.initMinimap();
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
        this.updateOutline();
        this.updateMinimap();
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
      this.langCompartment.of(markdown({ base: markdownLanguage, codeLanguages: languages })),
      updateListener,
      EditorView.domEventHandlers({
        paste: (event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              this.handleImagePaste(item);
              return true;
            }
          }
          return false;
        }
      }),
      keymap.of([
        { key: 'Mod-b', run: () => { this.toolbarAction('bold'); return true; } },
        { key: 'Mod-i', run: () => { this.toolbarAction('italic'); return true; } },
        { key: 'Mod-k', run: () => { this.toolbarAction('link'); return true; } },
        { key: 'Mod-Shift-k', run: () => { this.toolbarAction('code'); return true; } },
        { key: 'Mod-Shift-x', run: () => { this.toolbarAction('strikethrough'); return true; } },
        { key: 'Mod-Shift-o', run: () => { this.toggleOutline(); return true; } },
        { key: 'Tab', run: () => this.tryExpandSnippet() },
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
    this.refreshSpellCheck();
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
    document.getElementById('spell-btn').addEventListener('click', () => this.toggleSpellCheck());
    document.getElementById('minimap-btn').addEventListener('click', () => this.toggleMinimap());
    document.getElementById('git-close').addEventListener('click', () => this.toggleGitPanel());
    document.getElementById('outline-btn').addEventListener('click', () => this.toggleOutline());
    document.getElementById('outline-close').addEventListener('click', () => this.toggleOutline());
    document.getElementById('outline-content').addEventListener('click', (e) => {
      const item = e.target.closest('.outline-item');
      if (!item) return;
      const from = parseInt(item.dataset.from);
      this.editor.dispatch({ selection: { anchor: from }, effects: EditorView.scrollIntoView(from, { y: 'start' }) });
      this.editor.focus();
    });
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
    window.jade.onToggleOutline(() => this.toggleOutline());
    window.jade.onSetPdfPageSize((size) => this.setPdfPageSize(size));
    window.jade.onToggleMinimap(() => this.toggleMinimap());
    window.jade.onOpenSnippets(() => this.openSnippetEditor());
    window.jade.onOpenTableEditor(() => this.openTableEditor());
    window.jade.onToggleGitPanel(() => this.toggleGitPanel());
    window.jade.onShowGitDiff(() => this.showCurrentFileDiff());
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
    this.syncLanguageMode(tab);

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
      this.syncLanguageMode(currentTab);
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
    const tab = this.tabs[this.activeTabIndex];
    const content = this.editor.state.doc.toString();
    if (tab && tab.isLatex) {
      this.previewContent.innerHTML = this.renderLatexPreview(content);
      return;
    }
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

  // Outline panel
  toggleOutline() {
    this.outlineVisible = !this.outlineVisible;
    document.getElementById('outline-panel').classList.toggle('outline-hidden', !this.outlineVisible);
    document.getElementById('outline-btn').classList.toggle('active', this.outlineVisible);
    if (this.outlineVisible) this.updateOutline();
  }

  updateOutline() {
    if (!this.outlineVisible) return;
    const content = document.getElementById('outline-content');
    const doc = this.editor.state.doc;
    const items = [];
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const match = line.text.match(/^(#{1,6})\s+(.+)/);
      if (match) items.push({ level: match[1].length, text: match[2], from: line.from });
    }
    const cursorLine = doc.lineAt(this.editor.state.selection.main.head).number;
    let activeIdx = -1;
    for (let j = items.length - 1; j >= 0; j--) {
      const itemLine = doc.lineAt(items[j].from).number;
      if (itemLine <= cursorLine) { activeIdx = j; break; }
    }
    content.innerHTML = items.map((item, idx) =>
      `<div class="outline-item outline-h${item.level}${idx === activeIdx ? ' active' : ''}" data-from="${item.from}">${this.escapeHtml(item.text)}</div>`
    ).join('');
  }

  // Image paste from clipboard
  async handleImagePaste(item) {
    const blob = item.getAsFile();
    if (!blob) return;
    const tab = this.tabs[this.activeTabIndex];
    if (!tab.filePath) return;
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const ext = (item.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const dir = tab.filePath.replace(/[\\/][^\\/]+$/, '') + '/images';
    const filename = `paste_${Date.now()}.${ext}`;
    const result = await window.jade.saveImage(dir, filename, base64);
    if (result.success) {
      const relPath = 'images/' + filename;
      this.insertAtCursor(`![](${relPath})`);
    }
  }

  // PDF settings
  loadPdfPageSize() {
    try { return localStorage.getItem('jade-pdf-pagesize') || 'Letter'; } catch (_) { return 'Letter'; }
  }

  setPdfPageSize(size) {
    this.pdfPageSize = size;
    try { localStorage.setItem('jade-pdf-pagesize', size); } catch (_) {}
  }

  // Language mode switching (markdown vs LaTeX)
  syncLanguageMode(tab) {
    if (!tab) return;
    const isLatex = tab.isLatex;
    try {
      this.editor.dispatch({
        effects: this.langCompartment.reconfigure(
          isLatex ? latexLang() : markdown({ base: markdownLanguage, codeLanguages: languages })
        )
      });
    } catch (_) {}
  }

  // LaTeX preview renderer
  renderLatexPreview(texContent) {
    const lines = texContent.split('\n');
    const out = [];
    let inMath = false;
    let mathBuf = [];
    let inVerbatim = false;
    let verbBuf = [];
    let inAbstract = false;
    let title = '';
    let author = '';
    let date = '';
    for (const line of lines) {
      if (inVerbatim) {
        if (/\\end\{(verbatim|lstlisting)\}/.test(line)) {
          out.push('<pre><code>' + this.escapeHtml(verbBuf.join('\n')) + '</code></pre>');
          verbBuf = [];
          inVerbatim = false;
        } else {
          verbBuf.push(line);
        }
        continue;
      }
      if (inMath) {
        if (/\\end\{(equation|align|gather|multline|displaymath|eqnarray|math)\*?\}/.test(line)) {
          const mathStr = mathBuf.join('\n');
          try {
            out.push('<div class="katex-block">' + katex.renderToString(mathStr, { throwOnError: false, displayMode: true }) + '</div>');
          } catch (_) {
            out.push('<pre>' + this.escapeHtml(mathStr) + '</pre>');
          }
          mathBuf = [];
          inMath = false;
        } else {
          mathBuf.push(line);
        }
        continue;
      }
      if (/\\begin\{(verbatim|lstlisting)\}/.test(line)) { inVerbatim = true; verbBuf = []; continue; }
      if (/\\begin\{(equation|align|gather|multline|displaymath|eqnarray|math)\*?\}/.test(line)) { inMath = true; mathBuf = []; continue; }
      if (/\\begin\{abstract\}/.test(line)) { inAbstract = true; out.push('<blockquote><strong>Abstract</strong><br>'); continue; }
      if (/\\end\{abstract\}/.test(line)) { inAbstract = false; out.push('</blockquote>'); continue; }
      const titleM = line.match(/\\title\{(.+?)\}/);
      if (titleM) { title = titleM[1]; continue; }
      const authorM = line.match(/\\author\{(.+?)\}/);
      if (authorM) { author = authorM[1]; continue; }
      const dateM = line.match(/\\date\{(.+?)\}/);
      if (dateM) { date = dateM[1]; continue; }
      if (/\\maketitle/.test(line)) {
        if (title) out.push('<h1>' + this.renderLatexInline(title) + '</h1>');
        if (author) out.push('<p class="latex-author">' + this.renderLatexInline(author) + '</p>');
        if (date) out.push('<p class="latex-date">' + this.renderLatexInline(date) + '</p>');
        continue;
      }
      if (/^\\(documentclass|usepackage|begin\{document\}|end\{document\}|begin\{(itemize|enumerate|description|figure|table|tabular|center|minipage|thebibliography)\}|end\{(itemize|enumerate|description|figure|table|tabular|center|minipage|thebibliography)\}|bibliographystyle|bibliography|newcommand|renewcommand|setlength|pagestyle|tableofcontents|listoffigures|listoftables|appendix)/.test(line.trim())) {
        if (/\\begin\{(itemize|enumerate)\}/.test(line)) { out.push(/enumerate/.test(line) ? '<ol>' : '<ul>'); continue; }
        if (/\\end\{(itemize|enumerate)\}/.test(line)) { out.push(/enumerate/.test(line) ? '</ol>' : '</ul>'); continue; }
        if (/\\begin\{center\}/.test(line)) { out.push('<div style="text-align:center">'); continue; }
        if (/\\end\{center\}/.test(line)) { out.push('</div>'); continue; }
        if (/\\tableofcontents/.test(line)) { out.push('<p><em>[Table of Contents]</em></p>'); continue; }
        continue;
      }
      const secM = line.match(/\\(chapter|section|subsection|subsubsection|paragraph)\*?\{(.+?)\}/);
      if (secM) {
        const levels = { chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5 };
        const level = levels[secM[1]] || 2;
        out.push(`<h${level}>${this.renderLatexInline(secM[2])}</h${level}>`);
        continue;
      }
      if (/^\\item/.test(line.trim())) {
        const itemText = line.trim().replace(/^\\item\s*(\[.*?\])?\s*/, '');
        out.push('<li>' + this.renderLatexInline(itemText) + '</li>');
        continue;
      }
      const captionM = line.match(/\\caption\{(.+?)\}/);
      if (captionM) { out.push('<p class="latex-caption"><strong>Figure/Table:</strong> ' + this.renderLatexInline(captionM[1]) + '</p>'); continue; }
      const labelM = line.match(/\\label\{(.+?)\}/);
      if (labelM) continue;
      if (/^\s*%/.test(line)) continue;
      if (line.trim() === '') { out.push('<br>'); continue; }
      if (/\$\$.+\$\$/.test(line)) {
        const mathStr = line.match(/\$\$(.+?)\$\$/)[1];
        try {
          out.push('<div class="katex-block">' + katex.renderToString(mathStr, { throwOnError: false, displayMode: true }) + '</div>');
        } catch (_) { out.push('<p>' + this.escapeHtml(line) + '</p>'); }
        continue;
      }
      if (/\\\[/.test(line) && /\\\]/.test(line)) {
        const mathStr = line.match(/\\\[(.+?)\\\]/)[1];
        try {
          out.push('<div class="katex-block">' + katex.renderToString(mathStr, { throwOnError: false, displayMode: true }) + '</div>');
        } catch (_) { out.push('<p>' + this.escapeHtml(line) + '</p>'); }
        continue;
      }
      out.push('<p>' + this.renderLatexInline(line) + '</p>');
    }
    return out.join('\n');
  }

  renderLatexInline(text) {
    let result = text;
    result = result.replace(/\$(.+?)\$/g, (_, math) => {
      try { return katex.renderToString(math, { throwOnError: false }); } catch (_) { return '$' + math + '$'; }
    });
    result = result.replace(/\\textbf\{(.+?)\}/g, '<strong>$1</strong>');
    result = result.replace(/\\textit\{(.+?)\}/g, '<em>$1</em>');
    result = result.replace(/\\emph\{(.+?)\}/g, '<em>$1</em>');
    result = result.replace(/\\texttt\{(.+?)\}/g, '<code>$1</code>');
    result = result.replace(/\\underline\{(.+?)\}/g, '<u>$1</u>');
    result = result.replace(/\\href\{(.+?)\}\{(.+?)\}/g, '<a href="$1">$2</a>');
    result = result.replace(/\\url\{(.+?)\}/g, '<a href="$1">$1</a>');
    result = result.replace(/\\footnote\{(.+?)\}/g, '<sup>[fn]</sup>');
    result = result.replace(/\\ref\{(.+?)\}/g, '<span class="latex-ref">[ref:$1]</span>');
    result = result.replace(/\\cite\{(.+?)\}/g, '<span class="latex-cite">[$1]</span>');
    result = result.replace(/~/, '&nbsp;');
    result = result.replace(/---/g, '&mdash;');
    result = result.replace(/--/g, '&ndash;');
    result = result.replace(/``/g, '“');
    result = result.replace(/''/g, '”');
    result = result.replace(/\\\\/, '<br>');
    return result;
  }

  // Spell check
  loadCustomDict() {
    try { return new Set(JSON.parse(localStorage.getItem('jade-custom-dict') || '[]')); } catch (_) { return new Set(); }
  }

  saveCustomDict() {
    try { localStorage.setItem('jade-custom-dict', JSON.stringify([...this.customDict])); } catch (_) {}
  }

  addToDict(word) {
    this.customDict.add(word.toLowerCase());
    this.saveCustomDict();
    if (this.spellCheckEnabled) this.refreshSpellCheck();
  }

  async ensureSpellDict() {
    if (this.spellDict) return;
    this.spellDict = new Set();
    try {
      const resp = await fetch('../dist/words.txt');
      if (resp.ok) {
        const text = await resp.text();
        for (const w of text.split('\n')) {
          const trimmed = w.trim().toLowerCase();
          if (trimmed) this.spellDict.add(trimmed);
        }
      }
    } catch (_) {}
    if (this.spellDict.size === 0) {
      const common = 'the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us';
      for (const w of common.split(' ')) this.spellDict.add(w);
    }
  }

  toggleSpellCheck() {
    this.spellCheckEnabled = !this.spellCheckEnabled;
    const btn = document.getElementById('spell-btn');
    if (btn) {
      btn.classList.toggle('active', this.spellCheckEnabled);
      btn.title = `Spell check (${this.spellCheckEnabled ? 'on' : 'off'})`;
    }
    if (this.spellCheckEnabled) {
      this.ensureSpellDict().then(() => this.refreshSpellCheck());
    } else {
      this.refreshSpellCheck();
    }
  }

  refreshSpellCheck() {
    this.editor.dispatch({
      effects: this.lintCompartment.reconfigure(
        this.lintEnabled || this.spellCheckEnabled
          ? [lintGutter(), linter((view) => {
              const diagnostics = [];
              if (this.lintEnabled) diagnostics.push(...lintMarkdown(view));
              if (this.spellCheckEnabled && this.spellDict) diagnostics.push(...this.spellCheckDoc(view));
              return diagnostics;
            })]
          : []
      )
    });
  }

  spellCheckDoc(view) {
    const diagnostics = [];
    const doc = view.state.doc;
    let inCode = false;
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const text = line.text;
      if (text.startsWith('```')) { inCode = !inCode; continue; }
      if (inCode) continue;
      if (/^#{1,6}\s/.test(text)) continue;
      if (/^\s*[-*+]\s\[[ xX]\]/.test(text)) continue;
      const words = text.matchAll(/\b([a-zA-Z]{2,})\b/g);
      for (const match of words) {
        const word = match[1].toLowerCase();
        if (this.spellDict.has(word)) continue;
        if (this.customDict.has(word)) continue;
        if (/^[A-Z]{2,}$/.test(match[1])) continue;
        if (text.indexOf('`') >= 0) {
          const idx = match.index;
          const before = text.slice(0, idx);
          const backtickCount = (before.match(/`/g) || []).length;
          if (backtickCount % 2 === 1) continue;
        }
        diagnostics.push({
          from: line.from + match.index,
          to: line.from + match.index + match[1].length,
          severity: 'info',
          message: `Unknown word: "${match[1]}"`,
          actions: [{
            name: 'Add to dictionary',
            apply: () => this.addToDict(match[1]),
          }],
        });
      }
    }
    return diagnostics;
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
    await window.jade.exportPdf(html, this.pdfPageSize);
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

  // Minimap
  initMinimap() {
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapViewport = document.getElementById('minimap-viewport');
    const minimapEl = document.getElementById('minimap');
    if (!minimapEl) return;
    minimapEl.addEventListener('click', (e) => {
      if (!this.minimapVisible) return;
      const rect = this.minimapCanvas.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      const scroller = this.editor.scrollDOM;
      scroller.scrollTop = ratio * (scroller.scrollHeight - scroller.clientHeight);
    });
    let dragging = false;
    this.minimapViewport.addEventListener('mousedown', (e) => {
      dragging = true;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = this.minimapCanvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const scroller = this.editor.scrollDOM;
      scroller.scrollTop = ratio * (scroller.scrollHeight - scroller.clientHeight);
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    requestAnimationFrame(() => {
      const scroller = this.editor.scrollDOM;
      if (scroller) scroller.addEventListener('scroll', () => this.updateMinimapViewport(), { passive: true });
    });
  }

  toggleMinimap() {
    this.minimapVisible = !this.minimapVisible;
    const el = document.getElementById('minimap');
    if (el) el.classList.toggle('minimap-hidden', !this.minimapVisible);
    const btn = document.getElementById('minimap-btn');
    if (btn) btn.classList.toggle('active', this.minimapVisible);
    if (this.minimapVisible) this.updateMinimap();
  }

  updateMinimap() {
    if (!this.minimapVisible || !this.minimapCanvas) return;
    const canvas = this.minimapCanvas;
    const ctx = canvas.getContext('2d');
    const doc = this.editor.state.doc;
    const lineCount = doc.lines;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const lineHeight = Math.max(1, cssHeight / Math.max(lineCount, 1));
    const style = getComputedStyle(document.documentElement);
    const textColor = style.getPropertyValue('--text-muted').trim() || '#556655';
    const headingColor = style.getPropertyValue('--syntax-heading').trim() || '#7cba8a';
    const codeColor = style.getPropertyValue('--syntax-string').trim() || '#5aa87a';
    let inCode = false;
    for (let i = 1; i <= lineCount; i++) {
      const text = doc.line(i).text;
      const y = (i - 1) * lineHeight;
      if (text.startsWith('```')) { inCode = !inCode; continue; }
      const len = Math.min(text.length, cssWidth / 1.2);
      if (len === 0) continue;
      if (/^#{1,6}\s/.test(text)) {
        ctx.fillStyle = headingColor;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(2, y, Math.min(len * 1.2, cssWidth - 4), Math.max(lineHeight, 2));
      } else if (inCode) {
        ctx.fillStyle = codeColor;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(6, y, Math.min(len * 0.8, cssWidth - 10), Math.max(lineHeight, 1));
      } else {
        ctx.fillStyle = textColor;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(2, y, Math.min(len * 0.8, cssWidth - 4), Math.max(lineHeight, 1));
      }
    }
    ctx.globalAlpha = 1;
    this.updateMinimapViewport();
  }

  updateMinimapViewport() {
    if (!this.minimapVisible || !this.minimapViewport) return;
    const scroller = this.editor.scrollDOM;
    const totalH = scroller.scrollHeight;
    const visibleH = scroller.clientHeight;
    const scrollTop = scroller.scrollTop;
    const canvasH = this.minimapCanvas.clientHeight;
    if (totalH <= 0) return;
    const vpTop = (scrollTop / totalH) * canvasH;
    const vpHeight = Math.max(10, (visibleH / totalH) * canvasH);
    this.minimapViewport.style.top = vpTop + 'px';
    this.minimapViewport.style.height = vpHeight + 'px';
  }

  // Snippets
  loadSnippets() {
    try {
      const stored = localStorage.getItem('jade-snippets');
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return {
      'date': () => new Date().toISOString().slice(0, 10),
      'time': () => new Date().toTimeString().slice(0, 5),
      'todo': '- [ ] ',
      'tbl': '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |',
      'code': '```\n\n```',
      'link': '[text](url)',
      'img': '![alt](path)',
      'hr': '\n---\n',
      'h1': '# ',
      'h2': '## ',
      'h3': '### ',
      'meta': '---\ntitle: \nauthor: \ndate: ' + new Date().toISOString().slice(0, 10) + '\n---\n',
    };
  }

  saveSnippets() {
    const plain = {};
    for (const [k, v] of Object.entries(this.snippets)) {
      if (typeof v === 'string') plain[k] = v;
    }
    try { localStorage.setItem('jade-snippets', JSON.stringify(plain)); } catch (_) {}
  }

  tryExpandSnippet() {
    const state = this.editor.state;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const textBefore = line.text.slice(0, pos - line.from);
    const match = textBefore.match(/(\S+)$/);
    if (!match) return false;
    const trigger = match[1];
    const snippet = this.snippets[trigger];
    if (!snippet) return false;
    const expanded = typeof snippet === 'function' ? snippet() : snippet;
    const from = pos - trigger.length;
    this.editor.dispatch({ changes: { from, to: pos, insert: expanded } });
    return true;
  }

  openSnippetEditor() {
    const overlay = document.createElement('div');
    overlay.className = 'snippet-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'snippet-dialog';
    dialog.innerHTML = '<h3>Snippets</h3><p class="snippet-hint">Type a trigger word and press Tab to expand. Add, edit, or remove snippets below.</p>';
    const list = document.createElement('div');
    list.className = 'snippet-list';
    const renderList = () => {
      list.innerHTML = '';
      for (const [trigger, value] of Object.entries(this.snippets)) {
        if (typeof value === 'function') continue;
        const row = document.createElement('div');
        row.className = 'snippet-row';
        const triggerSpan = document.createElement('span');
        triggerSpan.className = 'snippet-trigger';
        triggerSpan.textContent = trigger;
        const valueSpan = document.createElement('span');
        valueSpan.className = 'snippet-value';
        valueSpan.textContent = value.length > 60 ? value.slice(0, 57) + '...' : value;
        const delBtn = document.createElement('button');
        delBtn.className = 'snippet-del';
        delBtn.textContent = 'x';
        delBtn.addEventListener('click', () => {
          delete this.snippets[trigger];
          this.saveSnippets();
          renderList();
        });
        row.append(triggerSpan, valueSpan, delBtn);
        list.appendChild(row);
      }
    };
    renderList();
    dialog.appendChild(list);
    const addArea = document.createElement('div');
    addArea.className = 'snippet-add';
    addArea.innerHTML = '<input id="snip-trigger" placeholder="trigger" maxlength="30"><textarea id="snip-value" placeholder="expansion text" rows="3"></textarea><button id="snip-add-btn">Add</button>';
    dialog.appendChild(addArea);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'snippet-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => overlay.remove());
    dialog.appendChild(closeBtn);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    dialog.querySelector('#snip-add-btn').addEventListener('click', () => {
      const t = dialog.querySelector('#snip-trigger').value.trim();
      const v = dialog.querySelector('#snip-value').value;
      if (t && v) {
        this.snippets[t] = v;
        this.saveSnippets();
        dialog.querySelector('#snip-trigger').value = '';
        dialog.querySelector('#snip-value').value = '';
        renderList();
      }
    });
  }

  // Markdown table editor
  openTableEditor() {
    const state = this.editor.state;
    const pos = state.selection.main.head;
    const doc = state.doc;
    const lineNum = doc.lineAt(pos).number;
    const tableLines = this.findTableAt(doc, lineNum);
    if (!tableLines) {
      this.insertNewTable();
      return;
    }
    const parsed = this.parseTable(tableLines.lines);
    this.showTableDialog(parsed, tableLines.from, tableLines.to);
  }

  findTableAt(doc, lineNum) {
    let start = lineNum;
    let end = lineNum;
    const isTableLine = (n) => {
      if (n < 1 || n > doc.lines) return false;
      return /^\|/.test(doc.line(n).text.trim());
    };
    if (!isTableLine(lineNum)) {
      if (isTableLine(lineNum + 1)) start = end = lineNum + 1;
      else if (isTableLine(lineNum - 1)) start = end = lineNum - 1;
      else return null;
    }
    while (isTableLine(start - 1)) start--;
    while (isTableLine(end + 1)) end++;
    const lines = [];
    for (let i = start; i <= end; i++) lines.push(doc.line(i).text);
    return { lines, from: doc.line(start).from, to: doc.line(end).to };
  }

  parseTable(lines) {
    const rows = [];
    let separatorIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i].split('|').slice(1);
      if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
      const trimmed = cells.map(c => c.trim());
      if (trimmed.every(c => /^[-:]+$/.test(c)) && separatorIdx === -1) {
        separatorIdx = i;
      } else {
        rows.push(trimmed);
      }
    }
    return { rows, hasHeader: separatorIdx === 1 };
  }

  showTableDialog(parsed, from, to) {
    const overlay = document.createElement('div');
    overlay.className = 'table-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'table-dialog';
    dialog.innerHTML = '<h3>Table Editor</h3>';
    const grid = document.createElement('div');
    grid.className = 'table-grid';
    const rows = parsed.rows;
    const cols = rows.length > 0 ? Math.max(...rows.map(r => r.length)) : 3;
    const inputs = [];
    for (let r = 0; r < rows.length; r++) {
      const rowInputs = [];
      const rowEl = document.createElement('div');
      rowEl.className = 'table-row' + (r === 0 && parsed.hasHeader ? ' table-header-row' : '');
      for (let c = 0; c < cols; c++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'table-cell-input';
        input.value = (rows[r] && rows[r][c]) || '';
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const nextC = e.shiftKey ? c - 1 : c + 1;
            const nextR = nextC >= cols ? r + 1 : (nextC < 0 ? r - 1 : r);
            const wrapC = nextC >= cols ? 0 : (nextC < 0 ? cols - 1 : nextC);
            if (nextR >= 0 && nextR < inputs.length && inputs[nextR][wrapC]) inputs[nextR][wrapC].focus();
          }
        });
        rowEl.appendChild(input);
        rowInputs.push(input);
      }
      grid.appendChild(rowEl);
      inputs.push(rowInputs);
    }
    dialog.appendChild(grid);
    const btnRow = document.createElement('div');
    btnRow.className = 'table-buttons';
    btnRow.innerHTML = '<button id="tbl-add-row">+ Row</button><button id="tbl-add-col">+ Column</button><button id="tbl-del-row">- Row</button><button id="tbl-del-col">- Column</button>';
    dialog.appendChild(btnRow);
    const actionRow = document.createElement('div');
    actionRow.className = 'table-actions';
    actionRow.innerHTML = '<button id="tbl-apply">Apply</button><button id="tbl-cancel">Cancel</button>';
    dialog.appendChild(actionRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    dialog.querySelector('#tbl-cancel').addEventListener('click', () => overlay.remove());
    dialog.querySelector('#tbl-add-row').addEventListener('click', () => {
      const newRow = [];
      const rowEl = document.createElement('div');
      rowEl.className = 'table-row';
      const currentCols = inputs[0] ? inputs[0].length : cols;
      for (let c = 0; c < currentCols; c++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'table-cell-input';
        rowEl.appendChild(input);
        newRow.push(input);
      }
      grid.appendChild(rowEl);
      inputs.push(newRow);
    });
    dialog.querySelector('#tbl-add-col').addEventListener('click', () => {
      for (let r = 0; r < inputs.length; r++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'table-cell-input';
        grid.children[r].appendChild(input);
        inputs[r].push(input);
      }
    });
    dialog.querySelector('#tbl-del-row').addEventListener('click', () => {
      if (inputs.length <= 1) return;
      grid.removeChild(grid.lastChild);
      inputs.pop();
    });
    dialog.querySelector('#tbl-del-col').addEventListener('click', () => {
      if (!inputs[0] || inputs[0].length <= 1) return;
      for (let r = 0; r < inputs.length; r++) {
        grid.children[r].removeChild(grid.children[r].lastChild);
        inputs[r].pop();
      }
    });
    dialog.querySelector('#tbl-apply').addEventListener('click', () => {
      const tableRows = inputs.map(row => row.map(input => input.value));
      const md = this.generateTableMarkdown(tableRows, parsed.hasHeader);
      this.editor.dispatch({ changes: { from, to, insert: md } });
      overlay.remove();
      this.editor.focus();
    });
    if (inputs[0] && inputs[0][0]) inputs[0][0].focus();
  }

  insertNewTable() {
    const rows = [['Column 1', 'Column 2', 'Column 3'], ['', '', ''], ['', '', '']];
    this.showTableDialog({ rows, hasHeader: true }, this.editor.state.selection.main.head, this.editor.state.selection.main.head);
  }

  generateTableMarkdown(rows, hasHeader) {
    if (rows.length === 0) return '';
    const colCount = Math.max(...rows.map(r => r.length));
    const colWidths = Array(colCount).fill(3);
    for (const row of rows) {
      for (let c = 0; c < colCount; c++) {
        colWidths[c] = Math.max(colWidths[c], (row[c] || '').length);
      }
    }
    const pad = (s, w) => (s || '') + ' '.repeat(Math.max(0, w - (s || '').length));
    const lines = [];
    for (let r = 0; r < rows.length; r++) {
      const cells = [];
      for (let c = 0; c < colCount; c++) cells.push(pad(rows[r][c] || '', colWidths[c]));
      lines.push('| ' + cells.join(' | ') + ' |');
      if (r === 0 && hasHeader) {
        lines.push('| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |');
      }
    }
    return lines.join('\n');
  }

  // Git integration
  getWorkingDir() {
    const tab = this.tabs[this.activeTabIndex];
    if (tab && tab.filePath) return tab.filePath.replace(/[\\/][^\\/]+$/, '');
    return null;
  }

  toggleGitPanel() {
    this.gitPanelVisible = !this.gitPanelVisible;
    const panel = document.getElementById('git-panel');
    if (panel) panel.classList.toggle('git-hidden', !this.gitPanelVisible);
    if (this.gitPanelVisible) this.refreshGitStatus();
  }

  async refreshGitStatus() {
    const cwd = this.getWorkingDir();
    const content = document.getElementById('git-content');
    if (!cwd || !content) return;
    const result = await window.jade.gitStatus(cwd);
    if (!result.success) {
      content.innerHTML = '<p class="git-info">Not a git repository</p>';
      return;
    }
    let html = '<div class="git-branch">Branch: <strong>' + this.escapeHtml(result.branch || 'detached') + '</strong></div>';
    if (result.files.length === 0) {
      html += '<p class="git-info">Working tree clean</p>';
    } else {
      html += '<div class="git-files">';
      for (const f of result.files) {
        const staged = f.status[0] !== ' ' && f.status[0] !== '?';
        const statusClass = staged ? 'git-staged' : (f.status[1] === '?' ? 'git-untracked' : 'git-modified');
        html += `<div class="git-file ${statusClass}" data-path="${this.escapeHtml(f.path)}" data-staged="${staged}">`;
        html += `<span class="git-file-status">${this.escapeHtml(f.status)}</span>`;
        html += `<span class="git-file-path">${this.escapeHtml(f.path)}</span>`;
        html += `<button class="git-file-action" title="${staged ? 'Unstage' : 'Stage'}">${staged ? '-' : '+'}</button>`;
        html += `<button class="git-file-diff" title="Show diff">D</button>`;
        html += '</div>';
      }
      html += '</div>';
    }
    html += '<div class="git-commit-area"><input id="git-commit-msg" placeholder="Commit message..." maxlength="200"><button id="git-commit-btn">Commit</button></div>';
    content.innerHTML = html;
    content.querySelectorAll('.git-file-action').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('.git-file');
        const filePath = row.dataset.path;
        const staged = row.dataset.staged === 'true';
        if (staged) {
          await window.jade.gitUnstage(cwd, filePath);
        } else {
          await window.jade.gitStage(cwd, filePath);
        }
        this.refreshGitStatus();
      });
    });
    content.querySelectorAll('.git-file-diff').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('.git-file');
        const filePath = row.dataset.path;
        this.showDiff(cwd, filePath);
      });
    });
    const commitBtn = document.getElementById('git-commit-btn');
    if (commitBtn) {
      commitBtn.addEventListener('click', async () => {
        const msg = document.getElementById('git-commit-msg').value.trim();
        if (!msg) return;
        const result = await window.jade.gitCommit(cwd, msg);
        if (result.success) {
          document.getElementById('git-commit-msg').value = '';
          this.refreshGitStatus();
        }
      });
    }
  }

  async showCurrentFileDiff() {
    const tab = this.tabs[this.activeTabIndex];
    if (!tab || !tab.filePath) return;
    const cwd = this.getWorkingDir();
    const fileName = tab.filePath.replace(/\\/g, '/').split('/').pop();
    this.showDiff(cwd, fileName);
  }

  async showDiff(cwd, filePath) {
    const result = await window.jade.gitDiff(cwd, filePath);
    if (!result.success || !result.output) return;
    const overlay = document.createElement('div');
    overlay.className = 'diff-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'diff-dialog';
    dialog.innerHTML = '<h3>Diff: ' + this.escapeHtml(filePath) + '</h3>';
    const pre = document.createElement('pre');
    pre.className = 'diff-content';
    const lines = result.output.split('\n');
    for (const line of lines) {
      const span = document.createElement('span');
      if (line.startsWith('+') && !line.startsWith('+++')) {
        span.className = 'diff-add';
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        span.className = 'diff-del';
      } else if (line.startsWith('@@')) {
        span.className = 'diff-hunk';
      }
      span.textContent = line + '\n';
      pre.appendChild(span);
    }
    dialog.appendChild(pre);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'diff-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => overlay.remove());
    dialog.appendChild(closeBtn);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
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
