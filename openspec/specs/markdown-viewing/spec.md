# markdown-viewing Specification

## Purpose
TBD - created by archiving change add-markdown-viewer-editor. Update Purpose after archive.
## Requirements
### Requirement: Render Markdown to clean preview
The system SHALL parse Markdown content and render it as clean, styled HTML in a preview area. Rendering SHALL support GitHub Flavored Markdown: headings, lists, tables, task lists, blockquotes, links, images, and inline/fenced code.

#### Scenario: Render a standard document
- **WHEN** a document containing headings, paragraphs, lists, and a table is loaded
- **THEN** the preview displays the corresponding formatted HTML with the app's clean typography

#### Scenario: Render GFM tables and task lists
- **WHEN** the document contains a GFM table and a task list
- **THEN** the table renders with aligned columns and the task list renders with checkbox markers reflecting checked/unchecked state

### Requirement: Syntax highlighting for code blocks
The system SHALL apply syntax highlighting to fenced code blocks based on the declared language.

#### Scenario: Highlight a fenced code block
- **WHEN** the document contains a fenced code block with a language tag (e.g. ```js)
- **THEN** the preview renders that block with language-appropriate syntax highlighting

#### Scenario: Unknown language falls back
- **WHEN** a fenced code block declares an unrecognized language
- **THEN** the block renders as plain monospaced text without breaking the preview

### Requirement: Safe rendering of untrusted content
The system SHALL sanitize rendered HTML so that Markdown files cannot execute scripts or embed active content in the preview.

#### Scenario: Strip embedded script
- **WHEN** a Markdown file contains raw HTML with a `<script>` tag or an `onerror` handler
- **THEN** the preview renders the safe content and the script/handler is not executed

### Requirement: Navigate long documents
The system SHALL keep the preview scrollable and resolve in-document heading anchors so links to headings jump to the correct section.

#### Scenario: Follow an internal anchor link
- **WHEN** the user clicks a link that targets a heading anchor within the same document
- **THEN** the preview scrolls to that heading

### Requirement: Bundled Markdown guide is read-only
The system SHALL open bundled localized Markdown guides as read-only reference documents and SHALL preserve ordinary viewing capabilities.

#### Scenario: User opens Markdown Guide
- **WHEN** user opens a bundled guide from status bar
- **THEN** guide opens in Preview mode with Save and Editor actions disabled

#### Scenario: Save is triggered outside disabled control
- **WHEN** a save or save-as action targets a bundled guide through a shortcut or programmatic caller
- **THEN** system refuses filesystem write and shows localized read-only notice

#### Scenario: User reads or exports guide
- **WHEN** bundled guide is active
- **THEN** preview, search, outline navigation, export, and tab closing remain available
