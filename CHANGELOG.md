# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.4] - 2026-07-13

### Added

- Mermaid diagram rendering: every valid fenced `mermaid` block renders in the preview (flowcharts, sequence, Gantt, class, ER, state, journey, and more), following the current light/dark reading theme. Render results are cached so repeated previews reuse the last diagram, and malformed blocks stay readable as code.
- Mermaid diagram viewer: clicking a diagram opens a modal with fixed zoom levels (10%–1000%), fit-to-view, free-drag panning, a minimap above 100%, `< current/total >` navigation across all diagrams in the document, and per-diagram PNG export named `file-diagram-name-n.png`.
- Mermaid diagrams embedded as self-contained SVG in HTML, PDF, and PNG exports.
- Mermaid section added to the bundled Markdown guide for every supported language.
- Vitest test suite covering Markdown rendering, Mermaid parsing, export, PNG streaming, settings, outline, and preview scroll-spy (`npm test`).
- macOS support: universal (Apple Silicon + Intel) DMG and ZIP, a `dist:mac` script, and a macOS job in the tagged release workflow.
- Native application menu on macOS, carrying the standard Edit roles, without which the system never delivers Cmd+C, Cmd+V, Cmd+X or Cmd+A to the app.

### Fixed

- Exported HTML, PDF, and PNG now use the preview's font family, size, and line height. Exports previously declared no font family at all and fell back to the browser's default serif at a different size.
- PNG export no longer fails on documents taller than roughly 8000 pixels. The capture exceeded Chromium's 16384-pixel texture limit and aborted with `UnknownVizError`; tall documents are now captured in slices and stitched into one image.
- Drag-and-drop overlay no longer stays stuck when the pointer leaves the window over a nested element during a drag.
- Mermaid diagram viewer title now shows the diagram type name in the active language instead of a fixed English string; an author-provided diagram `title` is still kept verbatim.
- Quitting on macOS now exits the application instead of only closing the window, while still running the unsaved-changes guard. Dock Quit and Cmd+Q both route through it.
- The unsaved-changes guard is re-armed on every new window, so a window reopened after the app outlived its last one no longer closes without asking.
- The macOS application menu now shows the product name (`Moji`, `Quit Moji`) rather than the lowercase package name, without moving the settings directory.

### Changed

- PNG export now compresses each captured slice as it arrives instead of assembling the whole bitmap in memory first. Peak memory follows the slice height rather than the height of the document: exporting the bundled guide dropped from roughly 500 MB to 165 MB, and a 30000 pixel document no longer approaches a gigabyte. Exports are around 15% slower and the files around 30% larger.
- Windows installer artifact now uses a dotted version in its filename (`Moji.Setup.0.1.4.exe`).
- Documented the real Node.js requirement (`^20.19.0 || >=22.12.0`) and declared it in `package.json`; the previous "Node.js 18+" claim did not match Vite 7 and electron-vite 5.

## [0.1.3] - 2026-07-12

### Added

- Keyboard shortcuts for document, search, view, font-size, tab navigation, and fullscreen actions.
- Markdown editor shortcuts for bold, italic, links, lists, checklists, and fenced code blocks.
- Shortcuts tab in Settings, localized for every supported language.
- Copy button for fenced code blocks in the Markdown preview, with copied-state feedback.

### Changed

- PDF and PNG exports now wrap long code lines instead of clipping them.
- Settings now separate General, Preview, and Shortcuts in tabs.
- New untitled documents now receive localized, sequential names in their tabs.
- Simplified Welcome content and refined the recent-files card layout.
- Updated the About panel's explanation of the Moji name.

## [0.1.2] - 2026-07-10

### Added

- Automatic GitHub Release checks and user-controlled updates for Windows NSIS and Linux AppImage builds.
- Localized update availability, download progress, ready-to-restart, and error notifications.
- Tagged GitHub Actions release workflow publishing updater metadata with Windows and Linux artifacts.
- Persisted window size and position across app launches.
- Persisted Markdown preview light/dark theme choice across app launches.
- Icons in the unsaved-changes confirmation dialog actions.

### Security

- Update restart reuses unsaved-document protection, while updater access stays behind narrow typed IPC.

### Changed

- Normalized bundled Markdown guide filenames to `markdown-guide.<locale>.md` for every supported language.
- Bundled Markdown guides now open as read-only documents with editing and saving disabled.
- Unsaved-changes confirmation dialog actions are now centered.


## [0.1.1] - 2026-07-09

### Added

- Recent files list on the Welcome screen, persisted in user settings and capped to the most recent entries.
- Tab management actions for closing other documents, documents to the right, saved documents, or all documents.
- Persisted file dialog directory reuse for open, save as, and export flows.

### Changed

- Search and replace fields now use native search inputs with clear controls.
- Editor search highlighting now only promotes the active match when replace mode is open.
- Markdown preview scrollbars now use theme tokens for light and dark reading themes.

## [0.1.0] - 2026-07-09

### Added

- Initial desktop release of Moji, built with Electron, React, TypeScript, and `electron-vite`.
- Markdown file opening for `.md` and `.markdown` through file dialog, drag and drop, and OS/CLI entry points.
- Multi-document workspace with horizontal tabs, dirty state indicators, duplicate-file detection, and unsaved-changes confirmation.
- Split reading and editing workflow with Preview mode and CodeMirror 6 Editor mode.
- Sanitized Markdown rendering with support for tables, task lists, footnotes, definition lists, subscript, superscript, mark, insert, abbreviations, emoji shortcodes, syntax-highlighted code blocks, and LaTeX math via KaTeX.
- Heading anchors and outline navigation with scroll tracking and click-to-jump behavior.
- Search and replace for active document, including match counts, next-match navigation, replace one, and replace all.
- Export flows for HTML, PDF, and PNG.
- Settings panel for language and Markdown preview typography.
- About panel with app metadata, version, author, and repository link.
- Bundled Markdown guide available from status bar.
- Dark app chrome with toggleable light/dark Markdown preview themes.
- Internationalization for English, Portuguese (Brazil), Spanish, Japanese, Chinese, and Russian.
- Security baseline with sandboxed renderer, context isolation, disabled Node integration in renderer, HTML sanitization, and external-link handoff to system browser.
