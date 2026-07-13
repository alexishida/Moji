## Context

`htmlToPng` loaded the document into an offscreen window, grew the window to the full document height, and captured it in one `capturePage` call. That works only while the resulting image fits in one GPU texture.

Measured on a 2x display, with A4 width:

| document height | result |
|---|---|
| 8190 CSS px (16380 device px) | captured |
| 8200 CSS px (16400 device px) | `UnknownVizError` |

The cliff sits exactly on the 16384-pixel texture limit, in device pixels. PDF export survives because `printToPDF` never goes through the compositor.

Two further facts constrain the fix:

- A capture rectangle taller than the window is not rejected. It is silently cropped to the window height. Any approach that keeps a small window and asks for a tall rectangle produces a truncated image with no error.
- A window taller than the texture cap is fine on its own. Only the capture rectangle must stay under the cap.

## Goals / Non-Goals

**Goals:**

- Export a PNG of any document height, with the full content and nothing repeated.
- Keep short documents on exactly the behavior they have today.

**Non-Goals:**

- Changing PDF or HTML export.
- Adding an image-processing dependency.
- Paginating the PNG into multiple files.

## Decisions

### Slice the capture, stitch the raw bitmaps

The document is captured in vertical slices, each at most `16384 / scaleFactor` CSS pixels tall. Slices come back as `nativeImage`s; `toBitmap()` exposes their raw pixel buffers, which concatenate directly because every slice shares one width. `nativeImage.createFromBitmap` turns the joined buffer back into an image to encode as PNG. No new dependency, and no re-encoding of intermediate images.

A document shorter than one slice takes the single-slice path, which is byte-for-byte the old behavior.

### Derive the slice height from the display scale factor

The texture cap is in device pixels, so the usable CSS height halves on a 2x display: 8192 CSS pixels there, 16384 on a 1x display. Hardcoding a CSS-pixel slice height would either waste headroom on 1x displays or overflow on 3x ones.

### Capture from where the page actually scrolled, not where it was asked to

The page cannot scroll past `documentHeight - viewportHeight`, so the last `scrollTo` of a tall document is clamped. Capturing at rectangle origin 0 after a clamped scroll re-captures a band that the previous slice already covered: the stitched image then contains a duplicated stripe and is longer than the document.

The scroll position actually reached is therefore read back, and the capture rectangle is offset by the difference. This was caught by exporting a black-to-white gradient and asserting that brightness rises monotonically down the stitched image; the first implementation produced a visible dip.

### Hide scrollbars during capture

The capture viewport is now shorter than the document, so the page scrolls and a scrollbar appears. macOS overlay scrollbars neither take layout width nor render into the capture, but the classic scrollbars on Windows and Linux do both: they would narrow the content and appear as a strip down the right edge of the image. `scrollbar-width: none` on the `export-png` root removes them, restoring the full-width layout the old full-height window produced.

## Risks / Trade-offs

- [Very tall documents allocate a large bitmap] → A 60000px document produces a 1588x120000 buffer of roughly 760 MB before encoding. It completes, but memory grows linearly with document height. Previously such a document simply failed, so this is strictly better; a height cap can be added if it proves to be a problem in practice.
- [Each slice costs a scroll, a repaint wait, and a capture] → Export of a long document is slower than before. Documents under one slice are unaffected.

## Migration Plan

No persisted state, no contract change. The next PNG export of a tall document simply succeeds.

## Open Questions

None.
