# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
