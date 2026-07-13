# document-export Specification

## Purpose
TBD - created by archiving change add-markdown-viewer-editor. Update Purpose after archive.
## Requirements
### Requirement: Export to HTML
The system SHALL export the current document as a self-contained HTML file that preserves the clean preview styling.

#### Scenario: Export current document to HTML
- **WHEN** the user chooses Export → HTML and selects a destination
- **THEN** an HTML file is written that renders the document with the app's styles applied

### Requirement: Export to PDF
The system SHALL export the current document as a PDF file using the rendered preview as the source layout.

#### Scenario: Export current document to PDF
- **WHEN** the user chooses Export → PDF and selects a destination
- **THEN** a PDF file is written that visually matches the rendered preview, paginated for print

### Requirement: Extensible export format list
The system SHALL present available export formats through the menu and SHALL be structured so additional formats can be added without changing the viewing or editing capabilities.

#### Scenario: Export format menu
- **WHEN** the user opens the Export menu
- **THEN** the supported formats (at minimum HTML and PDF) are listed as selectable options

### Requirement: Export requires a document
The system SHALL only allow export when a document is loaded, and SHALL export the current (including unsaved) content.

#### Scenario: Export unsaved edits
- **WHEN** the user has unsaved edits and triggers an export
- **THEN** the exported output reflects the current editor content, not the last-saved version

#### Scenario: Export disabled with no document
- **WHEN** no document is loaded
- **THEN** the Export actions are disabled or produce a notice rather than an empty file

### Requirement: Report export outcome
The system SHALL inform the user whether an export succeeded or failed.

#### Scenario: Report failure
- **WHEN** an export fails (e.g. the destination is not writable)
- **THEN** the application shows an error message describing the failure and does not leave a partial file presented as successful

### Requirement: Exports reproduce the preview typography
The system SHALL render exported documents with the same font family, font size, and line height configured for the Markdown preview, and SHALL declare a font family in the exported document so it never falls back to the browser default serif. The requirement applies to HTML, PDF, and PNG, which share one generated document.

#### Scenario: Export with the default typography
- **WHEN** the user exports a document without having changed the preview typography
- **THEN** the exported file renders in the default sans-serif family at the default size and line height, matching the preview

#### Scenario: Export after changing the preview typography
- **WHEN** the user selects a different preview font family, size, or line height in Settings and then exports
- **THEN** the exported file renders with the selected family, size, and line height

#### Scenario: Chosen font is unavailable
- **WHEN** the exported document is opened where the configured font family cannot be resolved
- **THEN** it falls back to the shared sans-serif stack rather than to the browser default serif

#### Scenario: Code blocks keep their monospace font
- **WHEN** an exported document contains fenced code
- **THEN** the code keeps the monospace family, independent of the configured preview font

### Requirement: PNG export handles documents of any height
The system SHALL export a PNG containing the whole document regardless of its rendered height, and SHALL NOT fail or silently crop when the document exceeds the platform's single-capture limit.

#### Scenario: Export a document taller than the capture limit
- **WHEN** the user exports a document whose rendered height exceeds what one screen capture can hold
- **THEN** a PNG is written containing the entire document, top to bottom

#### Scenario: Stitched image contains no repeated content
- **WHEN** a tall document is captured in more than one pass
- **THEN** the resulting image contains each band of the document exactly once, in order, and its height matches the rendered document

#### Scenario: Export a short document
- **WHEN** the user exports a document that fits within a single capture
- **THEN** the PNG is produced as before, in one pass

#### Scenario: Scrollbars stay out of the image
- **WHEN** a tall document is captured on a platform with classic scrollbars
- **THEN** no scrollbar appears in the exported image and the content keeps its full width
