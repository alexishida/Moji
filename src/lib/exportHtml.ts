import themeCss from '../styles/theme.css?inline'
import markdownCss from '../styles/markdown.css?inline'
import type { Theme } from '../../electron/shared'

const PRINT_CSS = `
  html, body { background: var(--bg); }
  .markdown-body { max-width: 820px; margin: 0 auto; padding: 24px; }
  @page { margin: 16mm; }
  @media print {
    a { color: inherit; text-decoration: underline; }
    pre, blockquote, table, img { break-inside: avoid; }
    h1, h2, h3 { break-after: avoid; }
  }
`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Build a fully self-contained HTML document from rendered Markdown, with the
 * active theme's CSS inlined. Used for both HTML export and as the source for
 * PDF printing in the main process.
 */
export function buildStandaloneHtml(renderedBody: string, theme: Theme, title: string): string {
  return `<!doctype html>
<html data-theme="${theme}" lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<style>${themeCss}\n${markdownCss}\n${PRINT_CSS}</style>
</head>
<body>
<article class="markdown-body">
${renderedBody}
</article>
</body>
</html>`
}
