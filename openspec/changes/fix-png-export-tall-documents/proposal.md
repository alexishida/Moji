## Why

PNG export fails for any document taller than roughly 8000 pixels, which is a very ordinary Markdown file. PDF and HTML export the same document without complaint.

Chromium composes a page capture into a single GPU texture, capped at 16384 pixels. `capturePage` asked for the whole document in one rectangle, so the request aborted with `UnknownVizError` as soon as the document exceeded that cap. The cap is measured in device pixels, so on a 2x display the effective ceiling is only 8192 CSS pixels.

Growing the window and capturing it in one shot cannot work: a capture rectangle taller than the window is silently truncated rather than rejected, so the naive workaround trades a visible error for a cropped image.

## What Changes

- Capture tall documents in vertical slices that stay under the texture cap, then stitch the slices into a single image.
- Derive the slice height from the display scale factor, since the cap is in device pixels.
- Hide scrollbars during PNG capture, which the now-shorter capture viewport would otherwise introduce.

## Capabilities

### Modified Capabilities

- `document-export`: PNG export supports documents of any height.

## Impact

- Rewrites `htmlToPng` in `electron/export.ts`; PDF and HTML paths are untouched.
- Adds a scrollbar-hiding rule to the `export-png` styles in `src/lib/exportHtml.ts`.
- Does not change IPC contracts, export formats, or the export dialog.
