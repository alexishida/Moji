## ADDED Requirements

### Requirement: Export rendered Mermaid flowcharts
The system SHALL include each successfully rendered Mermaid flowchart as self-contained SVG markup in every supported export format: HTML, PDF, and PNG. Exports SHALL use the same current Markdown content as preview, including unsaved edits.

#### Scenario: Export flowchart to HTML
- **WHEN** a document with a valid Mermaid flowchart is exported as HTML
- **THEN** the saved HTML contains a visible self-contained rendering of the flowchart without requiring Mermaid to be loaded at open time

#### Scenario: Export flowchart to PDF
- **WHEN** a document with a valid Mermaid flowchart is exported as PDF
- **THEN** the PDF contains the rendered flowchart within the printed document layout

#### Scenario: Export flowchart to PNG
- **WHEN** a document with a valid Mermaid flowchart is exported as PNG
- **THEN** the PNG contains the rendered flowchart within the captured document layout

### Requirement: Export Mermaid fallback safely
The system SHALL export the same readable code-block fallback for a Mermaid definition that is malformed, fails to render, or is outside the supported flowchart scope.

#### Scenario: Export invalid flowchart source
- **WHEN** a document with invalid Mermaid flowchart source is exported in any supported format
- **THEN** the export contains its readable code-block fallback and the export completes without a Mermaid rendering error
