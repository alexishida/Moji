## 1. Project scaffolding & tooling

- [x] 1.1 Initialize `package.json` with Node/Electron scripts (`dev`, `build`, `dist`) and TypeScript
- [x] 1.2 Add dependencies: `electron`, `react`, `react-dom`, `vite`, electron-vite integration, `typescript`
- [x] 1.3 Add feature dependencies: `markdown-it` (+ GFM plugins), `highlight.js`, `dompurify`, `codemirror` (v6 packages)
- [x] 1.4 Configure Vite + TypeScript for split `electron/` (main, preload) and `src/` (renderer) builds
- [x] 1.5 Create base folder structure and a runnable empty window (`npm run dev` opens a blank app)

## 2. Electron app shell (spec: app-shell)

- [x] 2.1 Implement `electron/main.ts`: create `BrowserWindow` with `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`
- [x] 2.2 Implement `electron/preload.ts` context bridge exposing minimal `window.api` (openFile, saveFile, saveFileAs, exportAs, onOpenDocument)
- [x] 2.3 Add single-instance lock; on second instance focus window and load the passed file path
- [x] 2.4 Handle open entry points: `open-file` event, `process.argv` file arg, all routed to a single `openDocument(path)`
- [x] 2.5 Add IPC handler for file dialog Open; validate extension is `.md`/`.markdown`, else return a rejection notice
- [x] 2.6 Wire renderer drag-and-drop to forward dropped file path to main for loading
- [x] 2.7 Build native application menu (Open, Save, Save As, Export, Toggle Edit, Toggle Theme) with keyboard shortcuts

## 3. Markdown rendering (spec: markdown-viewing)

- [x] 3.1 Create render module: `markdown-it` configured for GFM (tables, task lists, strikethrough, autolinks)
- [x] 3.2 Integrate `highlight.js` for fenced code blocks; graceful fallback for unknown languages
- [x] 3.3 Sanitize rendered HTML with `DOMPurify` before injecting into the preview
- [x] 3.4 Build the `Preview` React component: scrollable, resolves internal heading anchors on click
- [x] 3.5 Verify safe rendering: `<script>`/`onerror` in input is neutralized

## 4. Editing & saving (spec: markdown-editing)

- [x] 4.1 Integrate CodeMirror 6 editor with Markdown mode, line wrapping, theme-aware styling
- [x] 4.2 Implement view/edit mode toggle (menu + shortcut); default to view-only
- [x] 4.3 Wire live preview: debounce (~150ms) editor content → re-render preview
- [x] 4.4 Track dirty state; show unsaved indicator in the window title
- [x] 4.5 Implement Save (existing path) and Save As (new path) through the preload API
- [x] 4.6 Prompt for destination when saving an untitled document
- [x] 4.7 Warn (save/discard/cancel) before opening another file or closing with unsaved changes

## 5. Export (spec: document-export)

- [x] 5.1 Create an export registry (`{ id, label, run(doc) }`) surfaced in the Export menu
- [x] 5.2 Implement HTML export: self-contained file with inlined active-theme CSS
- [x] 5.3 Implement PDF export via hidden `BrowserWindow` + `webContents.printToPDF()` with print stylesheet
- [x] 5.4 Export uses current (including unsaved) content; disable/notice when no document is loaded
- [x] 5.5 Report success/failure to the user; never present a failed export as successful

## 6. Appearance & theming (spec: appearance)

- [x] 6.1 Populate `.ai-framework/DESIGN.md` with visual tokens (colors, typography, spacing) for light + dark
- [x] 6.2 Implement CSS-variable theme system consumed by chrome, preview, code blocks, and editor
- [x] 6.3 Build the clean minimal template: centered readable column, minimal chrome
- [x] 6.4 Implement theme toggle (menu + shortcut) applying to entire UI
- [x] 6.5 Persist theme preference to userData; default to OS color scheme on first run

## 7. Internationalization (spec: internationalization)

- [x] 7.1 Add `i18next` + `react-i18next`; init with `fallbackLng: en` and a language registry
- [x] 7.2 Create locale resource files `src/locales/{pt-BR,en,es}.json` with stable message keys
- [x] 7.3 Replace all hardcoded renderer strings with `useTranslation` keys (controls, dialogs, notices)
- [x] 7.4 Localize the native menu in main; rebuild `Menu` on a `language-changed` IPC event using the same locale files
- [x] 7.5 Add a language switcher; changing language updates UI at runtime without restart
- [x] 7.6 Default language from `app.getLocale()` → nearest shipped language, else `en`; persist choice to userData
- [x] 7.7 Verify missing-key fallback shows English text, not raw keys

## 8. Packaging & verification (spec: app-shell)

- [x] 8.1 Configure `electron-builder`: Windows NSIS, Linux AppImage + deb, app metadata
- [x] 8.2 Declare `fileAssociations` for `.md`/`.markdown` (Windows + Linux MIME/.desktop)
- [x] 8.3 Produce and smoke-test installers: launch, open a `.md` by clicking, render preview
- [ ] 8.4 Manually verify each spec's key scenarios (open, edit+save, export HTML/PDF, theme toggle+persist, language switch+persist) on Windows and Linux
