## Why

Flowcharts written in Mermaid fences currently appear as source code, making technical Markdown documents harder to read. They also cannot be carried faithfully into existing HTML, PDF, and PNG exports.

## What Changes

- Render fenced `mermaid` flowchart definitions as visual diagrams in the Markdown preview.
- Preserve rendered Mermaid flowcharts when exporting active documents as HTML, PDF, or PNG.
- Show a safe, readable fallback in the preview when a Mermaid definition cannot be rendered.
- Add automated coverage and document Mermaid flowchart support.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-viewing`: Render valid Mermaid flowchart code fences as diagrams and handle invalid definitions without breaking the preview.
- `document-export`: Include rendered Mermaid flowcharts in HTML, PDF, and PNG exports.

## Impact

- Affects Markdown rendering, preview lifecycle, standalone export HTML, and Markdown styles.
- Adds Mermaid as a renderer dependency and test coverage for rendered diagrams and exported output.
- Updates `README.md` to list supported Mermaid flowcharts.
