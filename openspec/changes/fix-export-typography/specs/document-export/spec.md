## ADDED Requirements

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
