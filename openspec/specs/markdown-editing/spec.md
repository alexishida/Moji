# markdown-editing Specification

## Purpose
TBD - created by archiving change add-markdown-viewer-editor. Update Purpose after archive.
## Requirements
### Requirement: Toggle between view and edit modes
The system SHALL default to a view-only preview and allow the user to toggle an edit mode that reveals a Markdown source editor.

#### Scenario: Enter edit mode
- **WHEN** the user activates "Toggle Edit" from the menu or its shortcut while viewing a document
- **THEN** a source editor becomes visible containing the document's Markdown text

#### Scenario: Return to view-only
- **WHEN** the user toggles edit mode off
- **THEN** the editor is hidden and only the rendered preview remains visible

### Requirement: Live preview while editing
The system SHALL update the rendered preview to reflect edits to the source with a short debounce, without requiring a manual refresh.

#### Scenario: Preview follows edits
- **WHEN** the user types or deletes text in the source editor
- **THEN** the preview updates to reflect the new content within a brief delay

### Requirement: Dirty-state tracking
The system SHALL track unsaved changes and indicate the dirty state, warning before actions that would discard unsaved edits.

#### Scenario: Indicate unsaved changes
- **WHEN** the user modifies the document after the last save
- **THEN** the UI shows an unsaved-changes indicator (e.g. a modified marker in the title)

#### Scenario: Warn before discarding
- **WHEN** the user opens another file or closes the window while there are unsaved changes
- **THEN** the application prompts to save, discard, or cancel before proceeding

### Requirement: Save and Save As
The system SHALL save the current document back to its file, and SHALL support saving to a new path via Save As.

#### Scenario: Save existing file
- **WHEN** the user invokes Save on a document that already has a file path
- **THEN** the file on disk is overwritten with the current content and the dirty indicator clears

#### Scenario: Save As new file
- **WHEN** the user invokes Save As and chooses a destination path
- **THEN** the content is written to that path, which becomes the document's current file

#### Scenario: Save a new untitled document
- **WHEN** the user invokes Save on a document with no file path yet
- **THEN** the application prompts for a destination path before writing

### Requirement: Markdown editing commands
The system SHALL provide Markdown formatting commands through editor shortcuts and the command palette.

#### Scenario: Apply inline formatting
- **WHEN** the user runs Bold, Italic, Inline Code, or Insert Link with editable text selected
- **THEN** the editor wraps or replaces the selection with the corresponding Markdown syntax and preserves focus

#### Scenario: Apply line formatting
- **WHEN** the user runs List, Checklist, Blockquote, Heading 1, Heading 2, Heading 3, or Code Block in an editable document
- **THEN** the editor inserts or toggles the corresponding Markdown syntax at the current selection

#### Scenario: Block read-only formatting
- **WHEN** the active document is read-only
- **THEN** Markdown formatting commands from the command palette are disabled
