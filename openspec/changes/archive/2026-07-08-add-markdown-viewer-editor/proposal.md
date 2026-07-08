## Why

There is no lightweight desktop app that opens a Markdown file with a single click and shows a clean, distraction-free rendering. Users currently rely on browser plugins, IDEs, or web tools that are heavy, cluttered, or require an internet connection. A dedicated cross-platform (Windows + Linux) desktop app focused on **view first, edit when needed, export when done** fills that gap.

## What Changes

- Introduce a cross-platform desktop application built with **React + Electron**, packaged for **Windows and Linux**.
- Users can open a `.md` file by clicking it (OS file association / "Open with"), drag-and-drop, or a file dialog, and immediately see a clean rendered preview.
- Users can toggle into an **edit mode** with a source editor and live preview, then save changes back to disk.
- Users can **export/convert** the current document to other formats (HTML, PDF; extensible to more).
- The app ships a **clean, minimal template** with a **light and dark theme** toggle.
- The interface is **multilingual** — shipping Portuguese (pt-BR), English (en), and Spanish (es) — with a language switcher and a structure where adding a new language is just adding a locale file.
- Establish project scaffolding: build tooling, packaging config, and the `.ai-framework/DESIGN.md` visual baseline for the app.

## Capabilities

### New Capabilities
- `app-shell`: Electron main/renderer process, window lifecycle, native menu, OS file association so clicking a `.md` opens the app, and open-file plumbing (dialog, drag-and-drop, CLI arg).
- `markdown-viewing`: Parse and render Markdown to a clean, styled HTML preview (GFM: tables, task lists, code highlighting, links).
- `markdown-editing`: Source editor with live preview, dirty-state tracking, and save/save-as to disk.
- `document-export`: Convert the current document to other formats (HTML, PDF) via the app menu.
- `appearance`: Clean minimal UI template with light/dark theme toggle and persisted preference.
- `internationalization`: Localized UI (menu, dialogs, controls, messages) with pt-BR, en, and es shipped, a language switcher, persisted preference, OS-locale default, and a drop-in structure for adding further languages.

### Modified Capabilities
<!-- None. This is the initial application; no existing specs to modify. -->

## Impact

- **New project scaffolding**: `package.json`, Electron main process, React renderer, bundler (Vite), and packaging (electron-builder) for Windows (NSIS) and Linux (AppImage/deb).
- **New dependencies**: `electron`, `react`, `react-dom`, a Markdown parser (`markdown-it`) with syntax highlighting, an editor component (`codemirror`), an i18n library (`i18next` + `react-i18next`), a PDF/HTML export path, `electron-builder`, `vite`.
- **OS integration**: file-type association for `.md`/`.markdown` at install time.
- **Design baseline**: populate `.ai-framework/DESIGN.md` with the app's visual tokens (currently a header-only placeholder).
- No existing runtime code is affected — this is the first feature of the project.
