## Why

Exported documents do not use the font shown in the preview. The exported HTML computes to the browser's default serif (Times) at 15px, while the preview renders Inter at the user's chosen size. The `document-export` capability already requires HTML export to preserve the preview styling, so this is a defect against an existing requirement rather than a new feature.

Two independent causes produce it:

- The base font rule `body { font-family: var(--font-sans) }` lives in `app.css`, which `buildStandaloneHtml` does not inline. Neither `theme.css` nor `markdown.css` applies a font family to the document body, so the export declares no font at all.
- `doExport` never passes the user's preview typography to `buildStandaloneHtml`, so the configured family, size, and line height are dropped even when a font is resolvable.

## What Changes

- Carry the preview typography (family, size, line height) into every export.
- Declare a font family on `.markdown-body` in the exported document, with the shared `--font-sans` stack as fallback.
- Apply to HTML, PDF, and PNG, which all share the same generated document.

## Capabilities

### Modified Capabilities

- `document-export`: Exported documents reproduce the preview typography.

## Impact

- Adds a required `typography` argument to `buildStandaloneHtml` in `src/lib/exportHtml.ts`.
- Passes `settings` typography from `doExport` in `src/App.tsx`.
- Does not change IPC contracts, export formats, or the light-theme rule for exports.
