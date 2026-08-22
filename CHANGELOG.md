# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.6] - 2026-08-19

### Added

- Font size can now be adjusted in Editor mode, from the same top-bar control and the Ctrl+Plus / Ctrl+Minus / Ctrl+0 shortcuts already available in view mode. Editor and preview keep separate sizes (12px-24px), the editor resetting to 14px and the preview to 16px.
- Settings now has a dedicated Editor tab to set the editor's default font size, alongside the existing Preview tab for the preview's font size.
- Split view that renders the live preview beside the CodeMirror editor, toggled from the top bar or with Ctrl+\. A draggable divider sets the pane ratio (20%–80%), and both the toggle and the ratio persist in settings. The toggle is disabled below a 700px-wide workspace and explains why in its tooltip. In view mode the toggle switches straight to edit mode in the same action, and a view-only split mode keeps the editor mounted while showing only the preview pane.
- Ctrl+G and Ctrl+Shift+G jump to the next and previous search match; Ctrl+M leaves editor focus.
- Ctrl+Q now goes through a real `requestQuit` IPC path, so the shortcut behaves like the native Quit menu and still runs the unsaved-changes guard (previously it only closed the window and did not quit on macOS).

### Changed

- Preview and editor font sizes now persist across launches instead of resetting every session. The full-width reading toggle stays session-only.
- Scrolling the source editor now moves the preview to the matching part of the document, and scrolling the preview moves the editor in turn; only one pane owns the sync while it is being scrolled, so the two cannot bounce off each other.
- Shortcut handling is more robust: AltGr keyboard layouts (such as pt-BR ABNT2) no longer drop Ctrl+\ and similar primary chords, Escape now prevents default when closing a panel, and the macOS Window menu drops Miniaturize (Cmd+M) so the editor's exit-focus binding (Mod+M) works as advertised.
- A `.tmp` file left over by a failed `settings.json` atomic write is now cleaned up instead of lingering.

### Fixed

- PDF export no longer passes `marginType`, dropped from Electron's `printToPDF` API; margins keep the same 1cm default.
- `npm install` downloads the Electron binary again. Electron removed its own `postinstall` hook in 42.0.0, so a fresh install left `node_modules/electron` without a `dist/` and `npm run dev` died with `Error: Electron uninstall`.
- Switching the reading theme no longer drops the preview's imperative patches. The preview body is keyed by the theme, so changing it used to remount from pristine HTML and discard local image sources, copy buttons, search marks, and scroll-sync state; effects now track the mounted body instead of a patch counter.
- The reading position stays anchored on the visible heading across the theme remount, so toggling light/dark no longer drifts the preview scroll.
- Unsaved work can no longer be lost. Close/quit is only forced through Chromium's own `unresponsive` hang detector instead of a fixed 5-second timer that could close while the confirm dialog was still open, and it only forces through a close/quit already in flight.
- A crashed renderer reloads the window with a warning dialog instead of silently discarding unsaved edits; launch-failed and integrity-failure events quit with an error instead of reload-looping.
- A draft journal now records the base snapshot's SHA-256, so a crash between the snapshot rename and its journal cleanup is detected as stale on load (the old length-only check could collide on an equal-length edit) and is no longer replayed and duplicated.
- An untouched new or restored document is no longer born "dirty", eliminating a spurious close-confirmation and an empty draft written to disk before any typing. Restored untitled documents resume their sequential numbering, tombstoned draft ids can't be resurrected by a late autosave, and empty draft-queue entries are dropped.
- The close guard, `render-process-gone`, and runtime errors no longer restart or force-quit when nothing is being closed, and a hung or gone renderer that never answers `requestClose` is still forced through.
- Opening on startup is hardened: OS-opened documents are held until the renderer confirms its listener is mounted (instead of being dropped during window boot), every markdown path from `argv`/second-instance is collected (not just the first), and opening many files streams only metadata while the renderer pulls content through the same chunked read used by a single open.
- `cancelOpenMany` now actually stops the renderer's queue drain instead of only aborting main's scan, overlapping batches no longer lose documents, and open-many failures are collected once rather than duplicated through progress events.
- A failed document lookup now keeps the reason it failed, so the app can tell a missing file from a transient error; recently opened files that failed transiently are kept, and only genuinely missing ones are forgotten.
- Export and save dialogs attach as sheets to the owning window instead of floating free, window bounds that fall outside every connected display are discarded on restore, and granted file paths compare case-insensitively on Windows.
- PNG/PDF/HTML export is hardened: a PNG capture rejects a slice whose width changes mid-capture instead of producing a broken image, PNG height is measured only after the content area settles, a leftover PNG `.tmp` is cleaned up when the final rename fails, export ships without a misleading numeric suffix when the preview is virtualized, and drawing a local `moji-asset://` image into the export canvas no longer taints it (CORS).
- Writing to disk and storage is more robust: `settings.json` is written atomically (temp file + rename), and common filesystem errors map to friendly, localized messages instead of raw Node errors with full paths in toasts.
- Draught data is safer: a stale journal can't resurrect a removed draft, pending deflate writes fail instead of hanging when the write pump dies, and storage of draft/order maps no longer leaks removed or empty entries.
- The Mermaid diagram viewer is fixed: zoom uses a non-passive wheel listener so `preventDefault` actually blocks page scroll, SVG ids are namespaced so canvas and minimap copies don't collide on markers/gradients, custom modal bounds are reclamped on window resize, and the copy action no longer leaves an unhandled clipboard rejection.
- The preview virtualization now binary-searches the active block instead of scanning from the start on every scroll, and the split-scroll mapping reaches the last source line when the preview is scrolled to the bottom with a trailing heading or an end-of-document hit.
- Parsing and editor state are pruned: CodeMirror state for documents that are no longer open is discarded and heading-reveal requests are clamped to the document's line count, keeping large sessions responsive.
- Updater reliability: an update check races its network call against a timeout instead of hanging forever, retries can't start a second concurrent check, and `autoDownload` is disabled.
- The bundled guide and locales are tidied: guides only ever grant read access to their own asset directory, the window title matches the app version, and the missing Settings > Shortcuts tab text is restored in Spanish, Japanese, Chinese, and Russian.

## [1.0.5] - 2026-08-05

## [1.0.5] - 2026-08-05

### Added

- Configurable reading width: Settings > Preview offers a reading-width percentage (20%–100%, in 5% steps) applied to every document and persisted across launches, with a readable minimum on narrow windows.
- Outline navigation now works in Editor mode, moving the cursor to the selected Markdown heading.
- GitHub Actions runs the test suite on Windows, Linux, and macOS.
- `npm run dev:update` simulates an available update in development without network access.
- Preview search now opens a contextual popover with the current/total match count and previous/next navigation.
- Editor search now includes previous/next navigation alongside replacement controls, arranged in separate navigation and replacement rows.

### Changed

- The top-bar width toggle now switches between the configured reading width and the full available width for the current session, instead of the previous fixed 760px column versus full width. The default reading width is 60%.
- Update checks on packaged Windows NSIS and Linux AppImage builds now direct users to GitHub Releases instead of downloading and installing an artifact automatically.
- Search input is debounced and preview/editor highlighting is capped to keep large documents responsive.
- The active search match is now visually distinct in both Preview and Editor; previous/next navigation moves the highlight, counter, and viewport together.

### Fixed

- Local file links and relative Markdown images now route through validated main-process APIs, including Windows file URLs.
- Preview search now finds exact phrases spanning inline Markdown formatting, such as a name split by bold text, and ignores copied leading/trailing whitespace.

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
