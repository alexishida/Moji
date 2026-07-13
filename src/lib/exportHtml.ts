import themeCss from '../styles/theme.css?inline'
import markdownCss from '../styles/markdown.css?inline'
import katexCss from 'virtual:katex-fonts-css'
import type { Theme } from '../../electron/shared'

const PRINT_CSS = `
  html, body { background: var(--bg); }
  .markdown-body { max-width: 820px; margin: 0 auto; padding: 24px; }
  html.export-png pre {
    overflow: visible;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  html.export-png pre code { white-space: inherit; }
  @page { margin: 16mm; }
  @media print {
    a { color: inherit; text-decoration: underline; }
    blockquote, table, img { break-inside: avoid; }
    pre {
      overflow: visible;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      break-inside: auto;
    }
    pre code { white-space: inherit; }
    h1, h2, h3 { break-after: avoid; }
  }
`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Preview typography, carried into the export so both render identically. */
export interface ExportTypography {
  fontFamily: string
  fontSize: number
  lineHeight: number
}

/** Keep a hand-edited settings.json from breaking out of the generated rule below. */
function cssFontFamily(fontFamily: string): string {
  const safe = fontFamily.replace(/[^A-Za-z0-9 ,'"-]/g, '').trim()
  return safe || 'Inter'
}

/**
 * The preview applies typography as an inline style on `.markdown-body`, and the base
 * font lives in `app.css`, which is not inlined here. Without this rule the export has
 * no font-family at all and falls back to the browser default serif.
 */
function typographyCss({ fontFamily, fontSize, lineHeight }: ExportTypography): string {
  return `
  .markdown-body {
    font-family: ${cssFontFamily(fontFamily)}, var(--font-sans);
    font-size: ${fontSize}px;
    line-height: ${lineHeight};
  }
`
}

/**
 * Build a fully self-contained HTML document from rendered Markdown, with the
 * active theme's CSS inlined. Used for both HTML export and as the source for
 * PDF printing in the main process.
 */
export function buildStandaloneHtml(
  renderedBody: string,
  theme: Theme,
  title: string,
  typography: ExportTypography
): string {
  return `<!doctype html>
<html data-md-theme="${theme}" lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap" rel="stylesheet" />
<title>${escapeHtml(title)}</title>
<style>${katexCss}\n${themeCss}\n${markdownCss}\n${PRINT_CSS}\n${typographyCss(typography)}</style>
</head>
<body>
<article class="markdown-body">
${renderedBody}
</article>
</body>
</html>`
}
