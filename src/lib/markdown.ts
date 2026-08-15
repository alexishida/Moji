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
import type { OutlineItem } from './outline'

interface RenderMarkdownOptions {
  documentPath?: string | null
  assetMode?: 'app' | 'file'
}

interface MarkdownRenderEnvironment {
  documentPath?: string | null
  assetMode?: 'app' | 'file'
  headingIds?: ReadonlySet<string>
}

export interface MarkdownRenderResult {
  html: string
  outline: OutlineItem[]
  headingLines: ReadonlyMap<string, number>
}

const HEADING_ID_PREFIX = 'user-content-'

function safeHeadingId(id: string): string {
  return id.startsWith(HEADING_ID_PREFIX) ? id : `${HEADING_ID_PREFIX}${id}`
}

const md = new MarkdownIt({
  html: true, // raw HTML allowed here, then sanitized by DOMPurify below
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(str, lang): string {
    if (lang.toLowerCase() === 'mermaid') {
      return `<pre class="hljs mermaid-diagram-candidate"><code>${md.utils.escapeHtml(str)}</code></pre>`
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

md.use(anchor, {
  slugify: (s) => safeHeadingId(encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-')))
})
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

function fileUrlToPath(fileUrl: string): string {
  const url = new URL(fileUrl)
  const pathname = decodeURIComponent(url.pathname)
  if (url.hostname) return `//${url.hostname}${pathname}`
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname
}

function resolveLocalUrl(source: string, documentPath: string | null | undefined): string | null {
  const baseUrl = documentAssetBaseUrl(documentPath)
  if (!baseUrl) return null
  if (/^[a-z][a-z\d+.-]*:/i.test(source)) return source

  try {
    return new URL(source.replace(/\\/g, '/'), baseUrl).toString()
  } catch {
    return null
  }
}

export function documentAssetBaseUrl(documentPath: string | null | undefined): string | null {
  if (!documentPath) return null
  const normalized = documentPath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash < 0) return null
  return `${filePathToFileUrl(normalized.slice(0, lastSlash + 1))}/`.replace(/\/+$/, '/')
}

const defaultImageRenderer = md.renderer.rules.image
md.renderer.rules.image = (tokens, index, options, env, self): string => {
  const token = tokens[index]
  const source = token.attrGet('src')?.trim()
  const context = env as MarkdownRenderEnvironment
  if (source && !source.startsWith('#')) {
    const resolved = resolveLocalUrl(source, context.documentPath)
    if (resolved?.startsWith('file:')) {
      if (context.assetMode === 'app') {
        token.attrSet('data-local-src', fileUrlToPath(resolved))
        token.attrSet('src', EMPTY_IMAGE)
      } else {
        token.attrSet('src', resolved)
      }
    }
  }
  return defaultImageRenderer?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options)
}

const defaultLinkRenderer = md.renderer.rules.link_open
md.renderer.rules.link_open = (tokens, index, options, env, self): string => {
  const token = tokens[index]
  const source = token.attrGet('href')?.trim()
  const context = env as MarkdownRenderEnvironment
  if (source?.startsWith('#') && source.length > 1) {
    const headingId = safeHeadingId(source.slice(1))
    if (context.headingIds?.has(headingId)) token.attrSet('href', `#${headingId}`)
  } else {
    const resolved = source ? resolveLocalUrl(source, context.documentPath) : null
    if (resolved?.startsWith('file:')) token.attrSet('href', resolved)
  }
  return defaultLinkRenderer?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options)
}

/** Returns zero-based source line for an anchored Markdown heading. */
function outlineText(token: ReturnType<typeof md.parse>[number] | undefined): string {
  if (token?.type !== 'inline') return ''
  return (token.children ?? []).map((child) => {
    if (child.type === 'softbreak' || child.type === 'hardbreak') return ' '
    return child.content
  }).join('').trim()
}

function extractOutlineFromTokens(tokens: ReturnType<typeof md.parse>): OutlineItem[] {
  const items: OutlineItem[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.type !== 'heading_open') continue

    const id = token.attrGet('id')
    const text = outlineText(tokens[index + 1])
    if (!id || !text) continue

    items.push({ id, text, level: Number(token.tag.slice(1)), sourceLine: token.map?.[0] })
  }

  return items
}

export function findMarkdownHeadingLine(source: string, headingId: string): number | null {
  return extractOutlineFromTokens(md.parse((source ?? '').replace(/^\uFEFF/, ''), {}))
    .find((item) => item.id === headingId)?.sourceLine ?? null
}

/**
 * Extract outline data from Markdown tokens without rendering or sanitizing the
 * full document. Used while the editor is active, where preview HTML is absent.
 */
export function extractMarkdownOutline(source: string): OutlineItem[] {
  return extractOutlineFromTokens(md.parse((source ?? '').replace(/^\uFEFF/, ''), {}))
}

/** Render Markdown to sanitized HTML safe to inject into the preview. */
export function renderMarkdown(source: string, options: RenderMarkdownOptions = {}): string {
  return renderMarkdownDocument(source, options).html
}

/** Render Markdown and derive its outline from same parser token stream. */
export function renderMarkdownDocument(source: string, options: RenderMarkdownOptions = {}): MarkdownRenderResult {
  const tokens = md.parse((source ?? '').replace(/^\uFEFF/, ''), {})
  const outline = extractOutlineFromTokens(tokens)
  const rawHtml = md.renderer.render(tokens, md.options, {
    documentPath: options.documentPath,
    assetMode: options.assetMode ?? 'file',
    headingIds: new Set(outline.map((item) => item.id))
  } satisfies MarkdownRenderEnvironment)
  const html = DOMPurify.sanitize(rawHtml, {
    // html for the document, mathMl + svg for KaTeX output. `eq`/`eqn` are the
    // wrapper tags markdown-it-texmath emits around each formula.
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|file|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ADD_TAGS: ['eq', 'eqn'],
    ADD_ATTR: ['target', 'rel', 'id', 'src', 'data-local-src']
  })
  return {
    html,
    outline,
    headingLines: new Map(
      outline.flatMap((item) => item.sourceLine === undefined ? [] : [[item.id, item.sourceLine] as const])
    )
  }
}
