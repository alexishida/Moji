# Markdown Viewer

A clean, cross-platform (Windows + Linux) desktop app to **view**, **edit**, and **export** Markdown files. Built with React + Electron.

## Features

- **View first** — open a `.md` by clicking it and read a clean, distraction-free render (GFM: tables, task lists, syntax-highlighted code).
- **Edit** — toggle a CodeMirror source editor with live preview; save / save as.
- **Export** — convert to HTML or PDF (registry is extensible for more formats).
- **Themes** — light / dark, follows the OS on first run, preference persisted.
- **Multilingual** — Portuguese (pt-BR), English (en), Spanish (es); switch at runtime; adding a language is just a locale file.
- **Secure** — renderer runs with context isolation + sandbox; rendered HTML is sanitized with DOMPurify.

## Requirements

- Node.js 18+ (developed on Node 22)

## Development

```bash
npm install
npm run dev        # launch the app with hot reload
npm run typecheck  # type-check without emitting
npm run build      # build main + preload + renderer into out/
```

## Packaging

```bash
npm run dist:win    # Windows NSIS installer
npm run dist:linux  # Linux AppImage + deb
```

Artifacts are written to `release/`. File associations for `.md` / `.markdown` are declared in `electron-builder.yml`.

## Project structure

```
electron/            Main process, preload bridge, menu, export, settings
  main.ts            Window, IPC, open entry points, single-instance, close guard
  preload.ts         contextBridge API (window.api)
src/                 React renderer
  App.tsx            Orchestrator (state, actions, menu wiring)
  components/        Toolbar, Preview, Editor, Welcome, ConfirmDialog
  lib/               markdown render, standalone-HTML export, hooks
  locales/           en.json, pt-BR.json, es.json
  styles/            theme tokens + app + markdown CSS
```
