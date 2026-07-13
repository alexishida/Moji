## Context

The preview and the export render the same Markdown HTML through different style pipelines. The preview lives inside the app shell, where `app.css` sets the base font on `body` and `Preview.tsx` layers the user's typography on `.markdown-body` as an inline style. The export builds a standalone document that inlines only `theme.css`, `markdown.css`, the KaTeX stylesheet, and a print block. `app.css` is deliberately excluded, since it styles the app chrome, not the document.

The consequence went unnoticed because `theme.css` defines `--font-sans` but never applies it: the token is present in the exported document and referenced by nothing. The export therefore had no font declaration in any of its stylesheets, and Chromium fell back to its default serif.

## Goals / Non-Goals

**Goals:**

- An exported document reads like the preview it came from: same family, size, and line height.
- The export keeps working when the chosen family is unavailable.

**Non-Goals:**

- Inlining `app.css` into exports. It styles the app chrome and would leak unrelated rules into the document.
- Embedding font binaries for the Inter web font. The existing Google Fonts link covers HTML export, and the generic families need no download.
- Changing the rule that exports always render in the light theme.

## Decisions

### Give `.markdown-body` a base font in `markdown.css`

The defect was possible because no stylesheet that travels with the document ever declared a font family: `app.css` owned it, and `app.css` is an app-chrome concern. `markdown.css` now declares `font-family: var(--font-sans)` alongside the `font-size` and `line-height` it already owned for `.markdown-body`, so the stylesheet is self-sufficient. Any consumer of it renders in a sans stack instead of the browser default serif.

This is defense in depth, not the fix on its own: it guarantees a sane font, while the export rule below carries the user's actual choice. Without it, a future caller that skipped the typography argument would silently resurrect the original bug. The preview is unaffected, because `Preview.tsx` applies typography as an inline style, which outranks a class rule.

### Pass typography explicitly rather than inlining `app.css`

`buildStandaloneHtml` takes a required `typography` argument. Making it required means a future caller cannot silently reintroduce the fontless document; the type checker rejects it. Inlining `app.css` would have fixed the missing font by accident while importing chrome styling into the document.

### Emit the rule on `.markdown-body`, not on `body`

The preview applies typography to `.markdown-body`, so the export mirrors the same selector and inherits the same cascade relationship with `markdown.css`, whose `.markdown-body` rule sets the competing `font-size: 15px`. The generated rule is appended last, so equal specificity resolves in its favor.

### Always append the `--font-sans` fallback stack

The chosen family is emitted as `<family>, var(--font-sans)`. A missing Inter web font then degrades to the system stack instead of to a serif. When the user picks a generic family (`serif`, `monospace`, `system-ui`), that family wins and the fallback is inert.

### Sanitize the family before interpolating it into CSS

`previewFontFamily` is persisted as a free-form string and only checked with `typeof value === 'string'` in the settings IPC guard, so a hand-edited `settings.json` could inject arbitrary declarations into the generated `<style>`. The value is stripped to letters, digits, spaces, commas, quotes, and hyphens before interpolation, falling back to `Inter` when nothing survives. The preview path is not exposed to this, because React assigns through the CSSOM, which discards invalid values.

## Risks / Trade-offs

- [Inter is fetched from Google Fonts and may not resolve offline] → Pre-existing behavior, now with a real fallback: the export degrades to the system sans stack rather than to Times.
- [`font-family: Inter, Inter, system-ui, ...` when the user picks Inter] → The token stack already starts with Inter, so the name repeats. Valid CSS and harmless; deduplicating would add a special case for no behavioral gain.

## Migration Plan

No persisted state changes. Existing exported files are unaffected; re-exporting produces the corrected document.

## Open Questions

None.
