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

