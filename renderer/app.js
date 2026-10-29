import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars, dropCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, HighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches, openSearchPanel, replaceAll } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';
import { vim } from '@replit/codemirror-vim';
import MarkdownIt from 'markdown-it';
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

// Markdown renderer
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (str, lang) => {
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
    this.vimCompartment = new Compartment();

    this.tabsEl = document.getElementById('tabs');
    this.editorPane = document.getElementById('editor-pane');
    this.previewContent = document.getElementById('preview-content');
    this.statusFile = document.getElementById('status-file');
    this.statusCursor = document.getElementById('status-cursor');
    this.statusWords = document.getElementById('status-words');

    this.initEditor();
    this.initLayout();
    this.initDivider();
    this.initDragDrop();
    this.initSyncScroll();
    this.initToolbar();
    this.bindIPC();
    this.bindUI();

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
      EditorView.lineWrapping,
      updateListener,
      keymap.of([
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
  }

  bindUI() {
    document.getElementById('new-tab-btn').addEventListener('click', () => this.newTab());
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

  updatePreview() {
    const content = this.editor.state.doc.toString();
    const html = md.render(content);
    this.previewContent.innerHTML = html;
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
        pre code { background: none; padding: 0; }
        blockquote { border-left: 3px solid #ddd; padding-left: 16px; margin: 0 0 1em; color: #666; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background: #f6f8fa; }
        hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
        img { max-width: 100%; }
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

  markdownToLatex(md) {
    let tex = '\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{graphicx}\n\\usepackage{hyperref}\n\\usepackage{listings}\n\\usepackage{amsmath}\n\\usepackage[margin=1in]{geometry}\n\n';

    const lines = md.split('\n');
    let inCode = false;
    let codeLang = '';
    let codeLines = [];
    let title = '';

    for (const line of lines) {
      if (inCode) {
        if (line.startsWith('```')) {
          tex += '\\begin{lstlisting}' + (codeLang ? `[language=${codeLang}]` : '') + '\n';
          tex += codeLines.join('\n') + '\n';
          tex += '\\end{lstlisting}\n';
          inCode = false;
          codeLines = [];
          codeLang = '';
        } else {
          codeLines.push(line);
        }
        continue;
      }

      if (line.startsWith('```')) {
        inCode = true;
        codeLang = line.slice(3).trim();
        continue;
      }

      if (line.startsWith('# ')) {
        if (!title) {
          title = line.slice(2);
          tex += `\\title{${this.texEscape(title)}}\n\\date{}\n\\begin{document}\n\\maketitle\n\n`;
        } else {
          tex += `\\section{${this.texEscape(line.slice(2))}}\n`;
        }
      } else if (line.startsWith('## ')) {
        tex += `\\subsection{${this.texEscape(line.slice(3))}}\n`;
      } else if (line.startsWith('### ')) {
        tex += `\\subsubsection{${this.texEscape(line.slice(4))}}\n`;
      } else if (line.startsWith('> ')) {
        tex += `\\begin{quote}\n${this.texEscape(line.slice(2))}\n\\end{quote}\n`;
      } else if (line.startsWith('---') || line.startsWith('***')) {
        tex += '\\hrule\\vspace{1em}\n';
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        tex += `\\begin{itemize}\n\\item ${this.texEscape(line.slice(2))}\n\\end{itemize}\n`;
      } else if (/^\d+\.\s/.test(line)) {
        tex += `\\begin{enumerate}\n\\item ${this.texEscape(line.replace(/^\d+\.\s/, ''))}\n\\end{enumerate}\n`;
      } else if (line.startsWith('![')) {
        const match = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (match) {
          tex += `\\begin{figure}[h]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{${match[2]}}\n\\caption{${this.texEscape(match[1])}}\n\\end{figure}\n`;
        }
      } else {
        let processed = this.texEscape(line);
        processed = processed.replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}');
        processed = processed.replace(/\*(.+?)\*/g, '\\textit{$1}');
        processed = processed.replace(/`(.+?)`/g, '\\texttt{$1}');
        processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '\\href{$2}{$1}');
        tex += processed + '\n';
      }
    }

    if (!title) {
      tex += '\\begin{document}\n\n' + tex.split('\\begin{document}\n\n').pop();
    }

    tex += '\n\\end{document}\n';
    return tex;
  }

  texEscape(s) {
    return s.replace(/([&%$#_{}~^\\])/g, '\\$1');
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
