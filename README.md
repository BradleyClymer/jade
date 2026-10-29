# Jade

A lightweight Markdown editor with live preview. No vaults. No bloat. Just Markdown.

## Features

- Split-pane editing: raw Markdown on the left, rendered preview on the right
- Near real-time preview with syntax-highlighted code blocks
- Formatting toolbar (bold, italic, headings, lists, code, tables, links, images)
- Dark green theme
- Vim mode (toggle in status bar)
- Scroll sync with lock/unlock
- Tab management
- Export to PDF and LaTeX
- Drag images into the editor to insert Markdown image links
- Double-click any .md file to open it (after install)

## Install from release

Download the latest release for your platform from the Releases page.

- **Windows**: `Jade-Setup-x.x.x.exe` (installer) or `Jade-x.x.x.exe` (portable)
- **macOS**: `Jade-x.x.x.dmg`
- **Linux**: `Jade-x.x.x.AppImage` or `jade_x.x.x_amd64.deb`

## Build from source

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [Git](https://git-scm.com/)

### Clone and install

```bash
git clone https://github.com/bradclymer/jade-editor.git
cd jade-editor
npm install
```

### Run in development

```bash
npm start
```

### Build a distributable

```bash
# For your current platform:
npm run dist

# Or target a specific platform:
npm run dist:win      # Windows (NSIS installer + portable exe)
npm run dist:mac      # macOS (DMG, x64 + Apple Silicon)
npm run dist:linux    # Linux (AppImage + .deb)
```

Output goes to the `release/` directory.

**Cross-compiling note**: building Mac targets requires macOS, and Linux targets require Linux (or WSL). Windows targets can be built from any platform. For CI builds, use a matrix strategy with runners for each OS.

### Project structure

```
jade-editor/
  main.js             Electron main process
  preload.js          contextBridge IPC layer
  build.js            esbuild config (bundles renderer)
  renderer/
    index.html        App shell
    app.js            JadeApp class (CodeMirror, markdown-it, toolbar, exports)
    styles.css        Full theme and layout
  assets/
    icon.svg          Source icon
    icon.png          512px PNG (generated, used by electron-builder)
  dist/
    bundle.js         Built renderer bundle (gitignored)
  DEV_DIARY.md        Development log and TODO list
```

### How the bundling works

The renderer uses ES module imports (CodeMirror 6, markdown-it, highlight.js). These get bundled by esbuild into a single `dist/bundle.js` IIFE that the HTML loads as a regular script. The main process and preload are plain CommonJS and don't need bundling.

## Platform-specific behavior

| | Windows | macOS | Linux |
|---|---|---|---|
| File open | CLI arg (`process.argv`) | `open-file` event | CLI arg |
| Instance lock | `requestSingleInstanceLock` | Same | Same |
| Icon format | Auto-converted from PNG | Auto-converted from PNG | PNG directly |
| Code signing | Optional (SmartScreen warning without it) | Required for Gatekeeper | Not needed |

## License

MIT
