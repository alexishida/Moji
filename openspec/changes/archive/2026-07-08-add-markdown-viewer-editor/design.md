## Context

This is the first feature of the project: a cross-platform (Windows + Linux) desktop Markdown viewer/editor. The stack is fixed by the request — **React + Electron**. The primary flow is *view*: click a `.md`, see a clean render. Editing and export are secondary. There is no existing runtime code; `.ai-framework/DESIGN.md` is a header-only placeholder that this change will populate. The app must work offline and start fast.

## Goals / Non-Goals

**Goals:**
- Single-click open of a `.md` file into a clean, readable rendered preview.
- Optional edit mode with live preview and save/save-as.
- Export to at least HTML and PDF, structured for adding more formats later.
- Light/dark theme, minimal distraction-free template, persisted preference.
- Reproducible packaging for Windows and Linux.
- A secure renderer (context isolation, sanitized HTML).

**Non-Goals:**
- macOS packaging (not requested; the code stays portable but no build target now).
- Multi-tab / multi-document workspaces, file tree/sidebar browser.
- Cloud sync, collaboration, extensions/plugins marketplace.
- WYSIWYG rich editing (editor is Markdown-source based, not contenteditable).
- Auto-update infrastructure.

## Decisions

### D1: Electron + Vite + React, TypeScript
Use **Electron** for the desktop shell, **Vite** to bundle the React renderer (fast dev server + HMR), and **TypeScript** across main/preload/renderer. Structure: `electron/main.ts` (main process), `electron/preload.ts` (context bridge), `src/` (React renderer).
- *Alternatives*: Tauri (smaller binaries, Rust) — rejected because the request explicitly asks for Electron. Webpack — rejected in favor of Vite's faster DX. Use `electron-vite` or `vite-plugin-electron` to wire the two together.

### D2: Markdown pipeline — `markdown-it` + `highlight.js` + `DOMPurify`
Render with **markdown-it** (GFM plugins for tables/task-lists/strikethrough), highlight fenced code with **highlight.js**, and sanitize the resulting HTML with **DOMPurify** before injecting into the preview.
- *Rationale*: markdown-it is fast, synchronous, and plugin-extensible; pairing it with DOMPurify satisfies the `markdown-viewing` safe-rendering requirement without disabling raw HTML entirely.
- *Alternatives*: `react-markdown`/remark (heavier, async plugin chains), `marked` (less plugin ecosystem). markdown-it chosen for balance of speed and extensibility.

### D3: Editor — CodeMirror 6
Use **CodeMirror 6** for the source editor (Markdown language mode, line wrapping, theming that follows the app theme). Live preview updates on a ~150ms debounce of the editor content.
- *Alternatives*: Monaco (heavier, IDE-oriented), plain `<textarea>` (no highlighting/affordances). CodeMirror 6 is lightweight, themeable, and modular.

### D4: File I/O only in the main process; preload bridge
All disk access (read, save, save-as, export) lives in the **main process** and is exposed to the renderer through a minimal, explicit API on `contextBridge` (e.g. `window.api.openFile`, `saveFile`, `exportAs`). Renderer runs with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- *Rationale*: satisfies the `app-shell` secure-boundary requirement; keeps the renderer incapable of arbitrary FS/Node access.

### D5: File-open entry points
Support four open paths, all funneling to a single `openDocument(path)` in main: (a) OS association via `open-file` event (packaged) and `process.argv` (CLI/Windows), (b) file dialog, (c) drag-and-drop in the renderer (path forwarded to main), (d) menu Open. Enforce single-instance with `app.requestSingleInstanceLock()` so a second click focuses the existing window and loads the file.
- File association declared in `electron-builder` config (`fileAssociations` for `.md`/`.markdown`).

### D6: Export strategy
- **HTML**: render Markdown → sanitized HTML, inline the active theme CSS into a self-contained `.html` file.
- **PDF**: use Electron's `webContents.printToPDF()` on an offscreen/hidden `BrowserWindow` loaded with the same rendered HTML + print CSS. This avoids bundling a headless browser and matches the preview.
- Export format list is a small registry (`{ id, label, run(doc) }`) so new formats are additive — satisfies the extensibility requirement.
- *Alternatives for PDF*: `puppeteer` (bundles Chromium again — redundant in Electron), `md-to-pdf`. `printToPDF` reuses the runtime already present.

### D7: State & theming
Keep renderer state minimal with React state/context (document text, path, dirty flag, mode, theme) — no Redux. Theme is a CSS-variable–based token set (light/dark) defined from `.ai-framework/DESIGN.md`. Persist theme and recent settings via a small JSON file in `app.getPath('userData')` (or `electron-store`). Default theme follows `nativeTheme.shouldUseDarkColors` on first run.

### D8: Packaging
Use **electron-builder**: Windows target **NSIS** installer, Linux targets **AppImage** + **deb**. Configure `fileAssociations` and app metadata. CI-friendly `npm run build` → `npm run dist`.

### D9: Internationalization — `i18next` + `react-i18next`
Externalize all UI strings into per-language JSON resource files under `src/locales/<lang>.json`, keyed by stable identifiers (e.g. `menu.open`, `dialog.unsavedTitle`). Ship **pt-BR**, **en**, **es**; register them in a single `i18n` init with **en** as `fallbackLng`. The renderer uses **react-i18next** (`useTranslation`) so a language change re-renders reactively — no restart.
- **Native menu** is built in the main process, so main also needs the strings. Keep the JSON resources loadable from both processes (shared module), or have the renderer request a menu rebuild with translated labels via IPC when the language changes. Chosen approach: main reads the same locale JSON files and rebuilds the `Menu` on a `language-changed` IPC event.
- **Default language**: on first run derive from `app.getLocale()` (main) → normalize to the closest shipped language, else `en`; persist the choice to userData alongside the theme (D7). A registry list drives the language switcher, so adding a language = add `src/locales/<lang>.json` + one registry entry.
- *Alternatives*: `react-intl`/FormatJS (ICU message syntax, heavier tooling) — rejected for simplicity; hand-rolled context map — rejected (no pluralization/fallback/interpolation). i18next gives fallback, interpolation, and pluralization out of the box.

## Risks / Trade-offs

- **Electron binary size (~80–150MB)** → Accept as inherent to the chosen stack; keep dependencies lean; no auto-update payloads.
- **Raw HTML in Markdown could be an injection vector** → DOMPurify sanitization on every render (D2) + context isolation (D4); never render into a Node-enabled context.
- **`printToPDF` fidelity vs. CSS** → Maintain a dedicated print stylesheet; validate common docs (tables, code, page breaks) during implementation.
- **OS file association differs Windows vs Linux** → Windows relies on installer + argv; Linux relies on `.desktop` MIME + `open-file`/argv. Test both explicitly; provide in-app Open as the reliable fallback.
- **Live-preview performance on large files** → Debounce updates (D3) and render synchronously off the debounced value; revisit virtualization only if needed (out of scope now).
- **Single-instance focus behavior** → Use `requestSingleInstanceLock`; second-instance argv must be parsed to extract the file path.

## Migration Plan

Greenfield — no data or users to migrate. Deployment = produce installers via `electron-builder`. Rollback = ship prior installer version. No runtime backend or schema.

## Open Questions

- Export beyond HTML/PDF (DOCX, plain-text) — desired priority order? (Registry supports it; not built in this change.)
- Should edit mode offer split-pane (source + preview side by side) or toggle only? Assumption: start with toggle, add split-pane later if wanted.
- Recent-files list and multi-window — deferred; confirm not needed for v1.
