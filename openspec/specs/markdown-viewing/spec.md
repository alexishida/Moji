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

### Requirement: Open local preview links safely
The system SHALL intercept local filesystem links in the Markdown preview and route them through the safe main-process file flow instead of allowing browser navigation.

#### Scenario: Follow a local Markdown link
- **WHEN** the user clicks a relative, absolute, or `file://` link that resolves to a Markdown file
- **THEN** the linked file opens in a document tab and the current app state remains intact

#### Scenario: Follow a local folder link
- **WHEN** the user clicks a local link that resolves to a folder
- **THEN** the folder opens as the active workspace

#### Scenario: Follow another local file link
- **WHEN** the user clicks a local link that resolves to an existing non-Markdown file
- **THEN** the system opens that file with the operating system default application

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

### Requirement: Render Mermaid diagrams
The system SHALL render each valid fenced code block tagged `mermaid` as a visual inline SVG using the bundled Mermaid runtime. Rendered diagrams SHALL fit within the preview width without obscuring surrounding Markdown content.

#### Scenario: Render a valid flowchart
- **WHEN** a loaded document contains a fenced `mermaid` block beginning with a valid `flowchart` declaration
- **THEN** the preview displays its Mermaid flowchart as a visual diagram instead of source code

#### Scenario: Render a legacy graph declaration
- **WHEN** a loaded document contains a fenced `mermaid` block beginning with a valid `graph` declaration
- **THEN** the preview displays its Mermaid flowchart as a visual diagram

#### Scenario: Render a non-flowchart Mermaid diagram
- **WHEN** a loaded document contains a valid Mermaid sequence, Gantt, class, entity-relationship, state, or journey diagram
- **THEN** the preview displays that diagram as a visual diagram instead of source code

### Requirement: Inspect rendered Mermaid diagrams
The system SHALL open a rendered Mermaid diagram in a resizable modal when the user clicks it. Modal chrome and diagram canvas background SHALL follow current Markdown preview theme, including Mermaid's light or dark diagram palette. The modal SHALL support zoom controls and mouse-wheel zoom from 25% through 800%, drag navigation, a minimap showing visible area only above 100% zoom, and saving that individual diagram as a PNG through native save dialog.

#### Scenario: Navigate an enlarged diagram
- **WHEN** the user clicks a rendered Mermaid flowchart
- **THEN** the system opens a modal with the diagram, and the user can zoom, drag it, and use the minimap to reposition the visible area

#### Scenario: Export an enlarged diagram
- **WHEN** the user selects the PNG export action in the Mermaid diagram modal and chooses a destination
- **THEN** the system writes a PNG image of only that diagram to the selected path

### Requirement: Preserve readable Mermaid fallback
The system SHALL preserve a readable escaped code-block fallback when a Mermaid fence is malformed or fails to render. A failed diagram SHALL NOT prevent the rest of the document preview from rendering.

#### Scenario: Handle invalid flowchart source
- **WHEN** a fenced `mermaid` block contains invalid flowchart syntax
- **THEN** the preview shows the Mermaid source as a code-block fallback and renders the rest of the document
