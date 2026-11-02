# Jade Development Diary

## 2026-10-29 09:17 EDT -- v0.1.0 initial build

### Done

- Electron 36.3.2 desktop shell with contextIsolation
- CodeMirror 6 editor: line numbers, syntax highlighting, fold gutters, bracket matching, auto-close, search/replace, line wrapping
- markdown-it preview with highlight.js (15+ languages)
- Split-pane layout (absolute-positioned, JS-managed) with draggable divider
- Dark green "jade" theme throughout (CSS custom properties)
- Tab management: new/close/switch, modified indicator, single-instance lock
- Scroll sync (proportional editor-to-preview) with lock/unlock toggle in status bar
- Formatting toolbar: bold, italic, strikethrough, H1-H3, bullet/numbered/task lists, link, image, inline code, code block, blockquote, HR, table
- Image drag-and-drop: image files insert `![name](path)` markdown; other files open as tabs
- Vim mode toggle in status bar (`@replit/codemirror-vim`)
- Export to PDF (File menu, renders preview HTML to PDF via Electron printToPDF)
- Export to LaTeX (File menu, markdown-to-tex converter: sections, lstlisting, textbf/textit, figures, itemize/enumerate)
- View modes: split / editor-only / preview-only (Ctrl+1/2/3, Ctrl+P cycles)
- Zoom in/out/reset
- Status bar: file path, cursor position, word count, encoding, scroll lock, vim toggle
- File associations for .md/.markdown in electron-builder config
- CLI file open: `jade myfile.md`
- Keyboard shortcuts: Ctrl+B bold, Ctrl+I italic, Ctrl+K link, Ctrl+Shift+K code, Ctrl+Shift+X strikethrough
- Recent files list (File > Open Recent, persisted in localStorage, up to 10 entries)
- Auto-save every 30s for files with a saved path
- KaTeX math rendering: `$inline$` and `$$block$$` LaTeX math in preview
- Mermaid diagram rendering in preview (dark jade theme)
- Cross-platform build targets: Win (NSIS + portable), Mac (DMG, x64+arm64), Linux (AppImage + deb)
- esbuild bundler for renderer (ES modules to IIFE)
- WYSIWYG preview editing: contentEditable on preview pane, HTML-to-markdown sync on blur/Escape
- Find/replace: Ctrl+F find, Ctrl+H replace (CM6 search panel with replace row)
- Word wrap toggle in status bar (Compartment-based runtime reconfigure)
- Theme selector: Jade (green), Dark, Light -- cycle in status bar or View menu, persisted in localStorage
- LaTeX export: proper list merging (consecutive items in one itemize/enumerate), table support (booktabs), math passthrough, blockquote merging, task list checkboxes, inline code/link/strikethrough handling
- LaTeX multi-file project export: splits document by H1 sections into separate .tex files + main.tex with preamble, TOC, and \input{} includes; auto-selects article vs report class
- PDF export: syntax-highlighted code blocks (highlight.js GitHub-light CSS in the PDF template)
- Markdown linting: toggleable lint gutter (missing heading space, consecutive blank lines, trailing whitespace); CM6 lint extension with Compartment toggle
- Custom CSS for preview: load user .css file via View menu, persisted in localStorage, applied as a `<style>` overlay
- Outline / document map panel: toggle via Ctrl+Shift+O or status bar, shows headings H1-H6 with indentation, highlights active section based on cursor, click to jump
- Image paste from clipboard: Ctrl+V pastes clipboard images, saves to `images/` subfolder with timestamp filename, inserts relative markdown link
- PDF page size selection: Letter/A4/Legal via File menu sub-menu, persisted in localStorage
- Minimap: canvas-based document overview in editor right margin, shows heading/code/text density, draggable viewport, click to navigate, toggle via View menu or status bar
- Snippets: Tab-triggered text expansions (built-in: date, time, todo, tbl, code, link, img, meta, etc.), user-editable via Edit > Snippets dialog, custom snippets persisted in localStorage
- Markdown table editor: visual grid dialog for creating/editing tables, Tab between cells, add/remove rows and columns, auto-formats aligned markdown table output; Edit > Table Editor or toolbar table button
- LaTeX editing with preview: open .tex files with full TeX syntax highlighting (codemirror-lang-latex), live preview renders sections/math/lists/code/formatting via KaTeX, inline math/textbf/textit/emph/href/cite/ref rendering, .tex file association
- Spell check: toggleable spell checker in status bar, 29K-word English dictionary, highlights unknown words as lint diagnostics, "Add to dictionary" action, custom dictionary persisted in localStorage, skips code blocks and headings
- Git integration: Git panel (Ctrl+G) shows branch, modified/staged/untracked files with status indicators, stage/unstage buttons per file, diff viewer with syntax-colored add/delete/hunk lines, commit with message input; Git menu with panel toggle and diff current file
- Plugin system: JS plugins in `~/.jade/plugins/` auto-loaded at startup. Plugin API: registerCommand, registerPreviewTransform, insertText, getContent, setContent, getSelection, getFilePath, showNotification. Plugins menu to reload and open folder.
- Multi-window: File > Move Tab to New Window opens the current tab's file in a separate Jade window
- Collaborative editing (CRDT): real-time peer-to-peer collaboration via Yjs + y-webrtc. Collab panel (Ctrl+Shift+C or status bar): start a session to get a room code, share it so others can join. Remote cursors with colored selections and name labels. Yjs UndoManager for collaborative undo/redo. WebRTC P2P sync through public signaling servers (no server setup needed). Username persisted in localStorage.
- Multi-language file support: open and edit 50+ programming languages with syntax highlighting. Auto-detects language from file extension via CodeMirror language-data (JS, TS, Python, Rust, Go, C/C++, Java, C#, Ruby, PHP, Swift, Kotlin, Scala, Haskell, Dart, Lua, Perl, R, PowerShell, Shell, SQL, HTML, CSS, SCSS, LESS, YAML, TOML, JSON, XML, Dockerfile, Makefile, GraphQL, Protobuf, and more). Preview pane shows syntax-highlighted source for code files. Status bar shows detected language. Open dialog organized by file category.

### Architecture

- `main.js` -- Electron main process, window management, IPC handlers, menus
- `preload.js` -- contextBridge API (`window.jade`)
- `renderer/app.js` -- JadeApp class, CodeMirror setup, markdown-it, toolbar, exports
- `renderer/index.html` -- shell: tab bar, toolbar, workspace (editor + divider + preview), status bar
- `renderer/styles.css` -- full theme, CodeMirror overrides, preview markdown styling
- `build.js` -- esbuild config
- `assets/icon.svg` -- jade gemstone icon
- `assets/icon.png` -- 512px PNG for electron-builder

### TODO

#### P0 -- usability blockers
- [x] Build Windows NSIS installer (91 MB) and portable exe (83 MB) -- 2026-10-29
- [x] Run the NSIS installer, confirm Start menu shortcut and .md file association -- 2026-10-30
- [x] Test the portable .exe with a real .md file -- 2026-10-30
- [x] Confirm .md double-click opens Jade (not Notepad/Obsidian) -- 2026-10-30

#### P1 -- near-term features
- [x] WYSIWYG editing in the preview pane (contentEditable + DOM-to-markdown sync) -- 2026-10-30
- [ ] LLM interaction panel (select text, send to LLM for rewrite/summarize/expand/ask)
- [x] Find/replace (Ctrl+F find, Ctrl+H replace via CM6 search panel) -- 2026-10-30
- [x] Recent files list (File menu) -- 2026-10-30
- [x] Auto-save / recovery -- 2026-10-30
- [x] Keyboard shortcuts for toolbar actions (Ctrl+B bold, Ctrl+I italic, etc.) -- 2026-10-30

#### P2 -- polish
- [x] LaTeX export: consecutive list items merged, table support (booktabs), math passthrough -- 2026-10-30
- [x] LaTeX export: multi-file project (File > Export as LaTeX Project) -- 2026-10-30
- [x] PDF export: syntax-highlighted code blocks -- 2026-10-30
- [x] PDF export: user-selectable page size / margins (Letter/A4/Legal via File menu + localStorage) -- 2026-10-30
- [x] Preview: mermaid diagram rendering -- 2026-10-30
- [x] Preview: math/KaTeX rendering -- 2026-10-30
- [x] Minimap (canvas-based document overview with viewport drag) -- 2026-10-30
- [x] Word wrap toggle -- 2026-10-30
- [x] Theme selector (jade green, dark, light) -- 2026-10-30
- [x] Custom CSS for preview (View > Custom Preview CSS) -- 2026-10-30
- [x] Markdown linting toggle in status bar -- 2026-10-30

#### P2.5 -- next up
- [x] LaTeX editing: .tex files with TeX syntax highlighting + KaTeX-rendered preview -- 2026-10-30
- [x] Minimap (canvas-based document overview) -- 2026-10-30
- [x] Spell check (29K-word dictionary, custom dict, skips code blocks) -- 2026-10-30
- [x] Snippets (Tab-triggered text expansions, user-editable) -- 2026-10-30

#### P3 -- stretch
- [x] Plugin system (JS plugins in ~/.jade/plugins/, API for commands/transforms) -- 2026-10-30
- [x] Git integration (diff view, stage/unstage, commit from editor) -- 2026-10-30
- [x] Multi-window support (move tab to new window) -- 2026-10-30
- [x] Collaborative editing (CRDT via Yjs + y-webrtc + y-codemirror.next) -- 2026-11-02

#### P4 -- Notepad++ parity
- [x] Multi-language file support (50+ languages, auto-detect, syntax-highlighted preview) -- 2026-11-02
- [ ] Line bookmarks (Ctrl+F2 toggle, F2 next, Shift+F2 prev)
- [ ] Macro recording and playback
- [ ] Column/block selection mode
- [ ] Character encoding selector (UTF-8, ASCII, Latin-1, etc.)
- [ ] Line ending selector (CRLF/LF/CR)
- [ ] Go to line (Ctrl+G)
- [ ] Document comparison / diff two tabs
- [ ] Brace/bracket highlighting and matching navigation
- [ ] Code folding for all languages
- [ ] Auto-indent for code files
- [ ] Session save/restore (reopen last set of tabs)
- [x] Markdown table editor (visual grid, tab between cells) -- 2026-10-30

### Cross-platform notes

See README.md for build-from-source instructions. Key platform-specific behaviors:
- **Windows**: `process.argv` carries the file path on double-click; `requestSingleInstanceLock` prevents duplicates
- **macOS**: uses `app.on('open-file')` event instead of argv; needs code-signing for Gatekeeper
- **Linux**: .desktop file generated by electron-builder; MIME type registration for text/markdown
- File path separators: `path.join` handles this; image drag-drop normalizes to forward slashes
