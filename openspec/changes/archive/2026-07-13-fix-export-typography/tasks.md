## 1. Carry typography into the export

- [x] 1.1 Give `.markdown-body` a base `font-family` in `markdown.css`, so a rendered document never falls back to the browser default serif
- [x] 1.2 Add a required `typography` argument to `buildStandaloneHtml` and emit a `.markdown-body` font rule with the `--font-sans` fallback
- [x] 1.3 Sanitize the configured font family before interpolating it into the generated stylesheet
- [x] 1.4 Pass the preview typography from `doExport` in `src/App.tsx`

## 2. Verification

- [x] 2.1 Run TypeScript typecheck
- [x] 2.2 Confirm the generated document computes to the configured family, size, and line height, and that code blocks stay monospace
- [x] 2.3 Confirm `markdown.css` alone no longer resolves to a serif, so the defect cannot return through another consumer
- [x] 2.4 Export HTML from the running app and confirm it matches the preview
- [x] 2.5 Export PDF and PNG and confirm they match the preview: the exported PDF embeds `Inter-Regular` and no serif face
