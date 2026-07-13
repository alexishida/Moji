## ADDED Requirements

### Requirement: Render Mermaid flowcharts
The system SHALL render a fenced code block tagged `mermaid` as a visual inline SVG when its definition uses Mermaid `flowchart` or legacy `graph` syntax. The rendered diagram SHALL fit within the preview width without obscuring surrounding Markdown content.

#### Scenario: Render a valid flowchart
- **WHEN** a loaded document contains a fenced `mermaid` block beginning with a valid `flowchart` declaration
- **THEN** the preview displays its Mermaid flowchart as a visual diagram instead of source code

#### Scenario: Render a legacy graph declaration
- **WHEN** a loaded document contains a fenced `mermaid` block beginning with a valid `graph` declaration
- **THEN** the preview displays its Mermaid flowchart as a visual diagram

### Requirement: Preserve readable Mermaid fallback
The system SHALL preserve a readable escaped code-block fallback when a Mermaid fence is malformed, fails to render, or declares a diagram type outside the supported flowchart scope. A failed diagram SHALL NOT prevent the rest of the document preview from rendering.

#### Scenario: Handle invalid flowchart source
- **WHEN** a fenced `mermaid` block contains invalid flowchart syntax
- **THEN** the preview shows the Mermaid source as a code-block fallback and renders the rest of the document

#### Scenario: Handle unsupported Mermaid diagram type
- **WHEN** a fenced `mermaid` block declares a supported-by-Mermaid but non-flowchart diagram type
- **THEN** the preview shows that source as a code block rather than attempting to render it as a flowchart
