import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import taskLists from 'markdown-it-task-lists'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import ins from 'markdown-it-ins'
import mark from 'markdown-it-mark'
import footnote from 'markdown-it-footnote'
import deflist from 'markdown-it-deflist'
import abbr from 'markdown-it-abbr'
import { full as emoji } from 'markdown-it-emoji'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: true, // raw HTML allowed here, then sanitized by DOMPurify below
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(str, lang): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`
      } catch {
        /* fall through to escaped plain text */
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  }
})

md.use(anchor, { slugify: (s) => encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-')) })
md.use(taskLists, { enabled: true, label: true })
// Extended Markdown: subscript ~x~, superscript ^x^, insert ++x++, highlight ==x==.
md.use(sub)
md.use(sup)
md.use(ins)
md.use(mark)
// Block-level extras: footnotes, definition lists, abbreviations, emoji shortcodes.
md.use(footnote)
md.use(deflist)
md.use(abbr)
md.use(emoji)
// Math: $inline$ and $$block$$ rendered with KaTeX. Invalid TeX renders as inline
// error text instead of throwing so a single bad formula never breaks the preview.
md.use(texmath, {
  engine: katex,
  delimiters: 'dollars',
  katexOptions: { throwOnError: false, strict: false }
})

// Keep target/rel safe on links that DOMPurify would otherwise allow through.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')?.startsWith('http')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Render Markdown to sanitized HTML safe to inject into the preview. */
export function renderMarkdown(source: string): string {
  const rawHtml = md.render(source ?? '')
  return DOMPurify.sanitize(rawHtml, {
    // html for the document, mathMl + svg for KaTeX output. `eq`/`eqn` are the
    // wrapper tags markdown-it-texmath emits around each formula.
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ADD_TAGS: ['eq', 'eqn'],
    ADD_ATTR: ['target', 'rel', 'id']
  })
}
