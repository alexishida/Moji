## Context

Moji renders Markdown synchronously with `markdown-it`, sanitizes resulting HTML, and injects it in `Preview`. Export independently renders that same Markdown into standalone HTML, which Electron saves directly or uses as the source for PDF and PNG. Mermaid fences currently take the generic code-block path, so both preview and exports show only source text.

The change crosses Markdown parsing, React preview effects, standalone export construction, styles, tests, and package dependencies. Markdown remains untrusted input; renderer isolation, `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true` must remain unchanged.

## Goals / Non-Goals

**Goals:**

- Render valid `mermaid` fences containing Mermaid `flowchart` or `graph` syntax as responsive inline SVG in preview.
- Preserve same rendered SVG in self-contained HTML and therefore existing PDF and PNG export paths.
- Keep malformed, unsupported, or failed diagrams readable as escaped Mermaid source without breaking surrounding document rendering.
- Constrain Mermaid rendering to its strict security mode and cover success and fallback behavior with automated tests.

**Non-Goals:**

- Supporting Mermaid diagram families other than flowcharts.
- Adding a diagram editor, live graph interactions, user Mermaid configuration, or a new export format.
- Fetching Mermaid, fonts, or other diagram assets from network at preview or export time.

## Decisions

### Mark Mermaid fences as diagram candidates during Markdown rendering

The Markdown highlighter will recognize the `mermaid` language tag and emit an escaped, distinguishable candidate block rather than highlighted source. A shared renderer helper will inspect candidate source and accept only `flowchart` and legacy `graph` declarations; all other Mermaid content remains code.

This preserves normal Markdown parsing and sanitization while making diagram handling explicit. A `markdown-it` Mermaid plugin was considered but rejected because it would couple parsing to a browser renderer and make preview/export parity harder to control.

### Generate self-contained SVG with Mermaid in renderer context

Add Mermaid as a bundled renderer dependency and initialize it with `startOnLoad: false` and strict security settings. A shared asynchronous helper will render each accepted candidate to SVG with unique IDs, replace only successful candidates, and retain escaped source for failures.

Mermaid's SVG is embedded directly in document markup. No Mermaid runtime script is placed in generated HTML. This keeps saved HTML portable and gives PDF/PNG's existing hidden BrowserWindow the identical diagram markup. Loading Mermaid by CDN or putting a runtime script in exports was rejected because offline output, deterministic export timing, and untrusted-content controls would be weaker.

### Render preview and export through same diagram transformation

`Preview` will run the helper after sanitized Markdown is mounted and rerun it when Markdown content or preview theme changes. Export preparation will await the same helper before passing standalone HTML to main process. Mermaid appearance will use preview's selected light/dark scheme, while export always uses its existing light scheme.

Using the mounted preview DOM as export input was rejected because it contains presentation-only state such as copy buttons and search highlights and may not exist while editor mode is active.

### Style diagrams as readable, printable document blocks

Add scoped Mermaid CSS for centered SVG, responsive horizontal overflow, and print/PDF/PNG-safe page breaks. Diagram dimensions remain authored by Mermaid SVG and cannot exceed document width.

## Risks / Trade-offs

- [Mermaid parsing fails on malformed user input] → retain escaped code block, mark it as a rendering fallback, and continue processing remaining document content.
- [SVG output could increase exported file size] → support only flowcharts and inline SVG once per diagram; avoid embedding a runtime or duplicate assets.
- [Untrusted diagram labels or links] → use Mermaid strict security configuration, pass only escaped fence content to Mermaid, and do not add any event handlers or runtime scripts to output.
- [Asynchronous rendering can race content updates] → cancel/ignore stale preview render results and await current rendering before export.
- [Large diagrams overflow or split poorly] → constrain SVG width, provide horizontal scrolling in preview, and use print break rules for export.

## Migration Plan

1. Add bundled Mermaid dependency and shared flowchart transformation helper.
2. Wire candidate generation, preview rendering, export rendering, scoped styles, tests, and README documentation.
3. Validate with `npm run typecheck` and test suite, including HTML/PDF/PNG path coverage.
4. Rollback removes the new dependency and transformation; Mermaid fences revert to ordinary code blocks without affecting stored Markdown files or current export APIs.

## Open Questions

None. The initial scope is deliberately limited to `flowchart` and `graph` syntax.
