# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
