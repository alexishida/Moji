import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import taskLists from 'markdown-it-task-lists'
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
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel', 'id']
  })
}
