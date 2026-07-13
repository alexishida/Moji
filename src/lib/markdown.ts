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

interface RenderMarkdownOptions {
  documentPath?: string | null
  assetMode?: 'app' | 'file'
}

const md = new MarkdownIt({
  html: true, // raw HTML allowed here, then sanitized by DOMPurify below
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(str, lang): string {
    if (lang.toLowerCase() === 'mermaid') {
      return `<pre class="hljs mermaid-flowchart"><code>${md.utils.escapeHtml(str)}</code></pre>`
    }
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

const EMPTY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

function filePathToFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  if (/^[A-Za-z]:\//.test(normalized)) {
    const [drive, ...rest] = normalized.split('/')
    return `file:///${drive}/${rest.map(encodeURIComponent).join('/')}`
  }
  if (normalized.startsWith('//')) {
    const [host, ...rest] = normalized.slice(2).split('/')
    return `file://${host}/${rest.map(encodeURIComponent).join('/')}`
  }
  return `file://${normalized.split('/').map(encodeURIComponent).join('/')}`
}

function prepareAppImage(image: Element, filePath: string): void {
  image.setAttribute('data-local-src', filePath)
  image.setAttribute('src', EMPTY_IMAGE)
}

function fileUrlToPath(fileUrl: string): string {
  const url = new URL(fileUrl)
  const pathname = decodeURIComponent(url.pathname)
  if (url.hostname) return `//${url.hostname}${pathname}`
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname
}

export function documentAssetBaseUrl(documentPath: string | null | undefined): string | null {
  if (!documentPath) return null
  const normalized = documentPath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash < 0) return null
  return `${filePathToFileUrl(normalized.slice(0, lastSlash + 1))}/`.replace(/\/+$/, '/')
}

function resolveImageSources(
  html: string,
  documentPath: string | null | undefined,
  assetMode: RenderMarkdownOptions['assetMode']
): string {
  const baseUrl = documentAssetBaseUrl(documentPath)
  if (!baseUrl) return html

  const template = document.createElement('template')
  template.innerHTML = html

  template.content.querySelectorAll('img[src]').forEach((image) => {
    const src = image.getAttribute('src')?.trim()
    if (!src || src.startsWith('#')) return

    if (/^file:/i.test(src)) {
      if (assetMode === 'app') prepareAppImage(image, fileUrlToPath(src))
      return
    }

    if (/^[a-z][a-z\d+.-]*:/i.test(src)) return

    try {
      const fileUrl = new URL(src.replace(/\\/g, '/'), baseUrl).toString()
      if (assetMode === 'app') prepareAppImage(image, fileUrlToPath(fileUrl))
      else image.setAttribute('src', fileUrl)
    } catch {
      /* Keep original src when URL parsing fails. */
    }
  })

  return template.innerHTML
}

/** Render Markdown to sanitized HTML safe to inject into the preview. */
export function renderMarkdown(source: string, options: RenderMarkdownOptions = {}): string {
  const rawHtml = md.render((source ?? '').replace(/^\uFEFF/, ''))
  const htmlWithResolvedImages = resolveImageSources(rawHtml, options.documentPath, options.assetMode ?? 'file')
  return DOMPurify.sanitize(htmlWithResolvedImages, {
    // html for the document, mathMl + svg for KaTeX output. `eq`/`eqn` are the
    // wrapper tags markdown-it-texmath emits around each formula.
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|file|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ADD_TAGS: ['eq', 'eqn'],
    ADD_ATTR: ['target', 'rel', 'id', 'src', 'data-local-src']
  })
}
