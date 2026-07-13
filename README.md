<p align="center">
  <img src="src/assets/logo-mark-light.png" alt="Moji" width="120" />
</p>

<h1 align="center">Moji</h1>

<p align="center">A lightweight, clean desktop app for opening, reading, editing, and exporting Markdown files.</p>

<p align="center">Built with Electron, React, TypeScript, and electron-vite.</p>

<p align="center"><strong>Current version:</strong> v0.1.3</p>

<p align="center">
  <strong>Download:</strong>
  <a href="https://github.com/alexishida/Moji/releases/download/v0.1.3/Moji.Setup.0.1.3.exe">Windows</a>
  ·
  <a href="https://github.com/alexishida/Moji/releases/download/v0.1.3/Moji-0.1.3-x86_64.AppImage">Linux (AppImage)</a>
  ·
  <a href="https://github.com/alexishida/Moji/releases/download/v0.1.3/Moji-0.1.3-amd64.deb">Linux (DEB)</a>
</p>

<p align="center">
  <img src="docs/repository-open-graph.png" alt="reposytory-open-graph" width="100%" />
</p>


## Name

**Moji (文字)** literally means "letter", "character", or "writing" in Japanese. Short and easy to remember, it evokes characters and writing. The name fits its purpose: opening, editing, previewing, and exporting Markdown smoothly—without distractions.

## Features

- **Open Markdown files**: supports `.md` and `.markdown` through file dialog, drag and drop, CLI/file association entry points, and single-instance forwarding.
- **Multi-document workspace**: horizontal tabs, dirty markers, close buttons, duplicate-file detection, and unsaved-change confirmation with clear action icons.
- **Tab management**: close other tabs, tabs to the right, saved tabs, or all tabs from the document tab menu.
- **Preview mode**: sanitized Markdown rendering with heading anchors, outline navigation, tables, task lists, footnotes, definition lists, subscript/superscript, highlight/insert marks, emoji shortcodes, LaTeX math via KaTeX (`$…$` and `$$…$$`), linkify, typographer, syntax-highlighted code, and copy buttons for code blocks.
- **Outline navigation**: collapsible heading tree with scroll-spy that highlights the heading nearest the viewport top, plus smooth scroll-to-heading on click and anchor links.
- **Search and replace**: top-bar search highlights matches in preview/editor, shows occurrence count, jumps to the next match, and replaces one match or all matches in the active document.
- **Editor mode**: CodeMirror 6 Markdown editor with line numbers, history, wrapping, localized untitled document names, Markdown formatting shortcuts, and save/save as flows.
- **Export mode**: export the active document as HTML, PDF, or PNG. PDF supports A4, Letter, Legal, portrait, and landscape; long code lines wrap in PDF and PNG exports.
- **Settings view**: centered in-workspace panel for language, preview typography, and a localized shortcut reference.
- **About view**: in-workspace panel showing app name, version (from `package.json`), author, repository link, and the story behind the name.
- **Markdown guide**: bundled localized reference documents (`samples/markdown-guide.<locale>.md`) opened from the status bar.
- **Recent files**: Welcome screen shows recently opened Markdown files and lets you reopen or remove entries.
- **Remembered app state**: window size/position, recent files, last used folder, language, preview typography, and Markdown preview theme are persisted in user settings.
- **Automatic updates**: installed Windows NSIS and Linux AppImage builds check GitHub Releases, show download progress, and restart only after protecting unsaved documents.
- **Markdown themes**: dark/light toggle for rendered Markdown. App chrome remains dark; exports always use the light theme.
- **Internationalization**: English, Portuguese (Brazil), Spanish, Japanese, Chinese, and Russian. Initial language follows the OS when possible and user choice is persisted.
- **Security**: sandboxed renderer, context isolation, `nodeIntegration: false`, DOMPurify sanitization, and external links opened in the OS browser.
- **Keyboard shortcuts**: common file, search, replace, tab, preview, export, fullscreen, and font-size actions; Settings lists every available shortcut.

## Screenshots

<p align="center">
  <img src="docs/scr-welcome.jpg" alt="Welcome" width="45%" />
  <img src="docs/scr-main.jpg" alt="Preview" width="45%" />
</p>

<p align="center">
  <img src="docs/scr-edit.jpg" alt="Editor" width="45%" />
  <img src="docs/scr-export.jpg" alt="Export" width="45%" />
</p>


## Requirements

- Node.js 18+ (developed on Node 22)
- npm

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Useful scripts:

- `npm run dev`: launch Electron with hot reload.
- `npm run typecheck`: run TypeScript checks without emitting files.
- `npm run build`: build main, preload, and renderer into `out/`.
- `npm run preview`: run the built app preview.

## Packaging

```bash
npm run dist
npm run dist:win
npm run dist:linux
```

Artifacts are written to `release/`.

Current packaging targets:

- Windows: NSIS installer, x64, with automatic updates.
- Linux: AppImage with automatic updates, plus deb for manual installation.

File associations for `.md` and `.markdown` are declared in `electron-builder.yml`.

### Publishing a release

1. Update `version` in `package.json` and `package-lock.json`.
2. Commit changes, then create and push matching tag such as `v0.2.0`.
3. `.github/workflows/release.yml` validates tag, builds Windows first, then Linux, and publishes draft artifacts.
4. Workflow makes GitHub Release public only after NSIS/AppImage binaries and `latest.yml`/`latest-linux.yml` are uploaded.

`electron-updater` runs only in packaged Windows NSIS builds and Linux AppImages. Development and deb builds do not self-update. AppImage must live in a user-writable directory to be replaced successfully. Windows production releases should use an Authenticode certificate through electron-builder signing environment variables; never store certificate credentials in repository.

## Project Structure

```text
electron/
  main.ts        Window lifecycle, persisted bounds, file opening, single-instance flow, close guard, IPC registration
  preload.ts     Safe renderer API exposed through contextBridge
  shared.ts      Shared IPC names, settings, export types, languages, recent-file limits, supported extensions
  updater.ts     GitHub release checks, update download state, and NSIS/AppImage installation
  settings.ts    User settings persistence, window bounds, recent files, preview theme, and last dialog directory
  export.ts      HTML/PDF/PNG export implementation with remembered output directory

src/
  App.tsx        Renderer state, document actions, close guard wiring, mode switching
  components/    Top bar, tabs, sidebar, outline tree, preview, editor, export/settings/about dialogs, confirm dialog, welcome view
  lib/           Markdown rendering, outline extraction, preview scroll-spy, export HTML, hooks
  locales/       en, pt-BR, es, ja, zh, ru translation files
  styles/        Theme tokens, app shell CSS, Markdown preview CSS

samples/         Bundled Markdown documents (full Markdown guide)
```

## Documentation

- `.ai-framework/RULES.md`: project rules for AI-assisted changes.
- `.ai-framework/DESIGN.md`: visual system, tokens, layout, and component rules.
- `openspec/specs/`: current behavior specs.

## License

MIT © Alex Ishida
