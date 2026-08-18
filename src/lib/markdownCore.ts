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
import hljs from 'highlight.js/lib/core'
import type { LanguageFn } from 'highlight.js'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import html from 'highlight.js/lib/languages/xml'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import yaml from 'highlight.js/lib/languages/yaml'
import type { OutlineItem } from './outline'

export interface RenderMarkdownOptions {
  documentPath?: string | null
  assetMode?: 'app' | 'file'
  blockMode?: boolean
}

interface MarkdownRenderEnvironment extends RenderMarkdownOptions {
  headingIds?: ReadonlySet<string>
}

export interface MarkdownRenderTimings {
  parseMs: number
  outlineMs: number
  renderHtmlMs: number
  totalMs: number
}

/** Unsanitized worker-safe result. Never pass `rawHtml` to DOM directly. */
export interface RawMarkdownRenderResult {
  rawHtml: string
  blocks?: RawMarkdownBlock[]
  outline: OutlineItem[]
  headingLines: Array<readonly [string, number]>
  timings: MarkdownRenderTimings
}

export interface RawMarkdownBlock {
  id: string
  rawHtml: string
  text: string
  headingIds: string[]
  estimatedHeight: number
}

const HEADING_ID_PREFIX = 'user-content-'
const EMPTY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('go', go)
hljs.registerLanguage('html', html)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('php', php)
hljs.registerLanguage('powershell', powershell)
hljs.registerLanguage('python', python)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('yaml', yaml)

/**
 * Languages fetched only when a document actually uses one.
 *
 * The common set above is registered up front because it covers most documents and the
 * cost is already paid at startup. These are the long tail: each is a separate chunk, so
 * a document that never mentions Elixir never downloads it.
 */
const LAZY_LANGUAGES: Record<string, () => Promise<{ default: LanguageFn }>> = {
  clojure: () => import('highlight.js/lib/languages/clojure'),
  dart: () => import('highlight.js/lib/languages/dart'),
  elixir: () => import('highlight.js/lib/languages/elixir'),
  erlang: () => import('highlight.js/lib/languages/erlang'),
  fsharp: () => import('highlight.js/lib/languages/fsharp'),
  graphql: () => import('highlight.js/lib/languages/graphql'),
  groovy: () => import('highlight.js/lib/languages/groovy'),
  haskell: () => import('highlight.js/lib/languages/haskell'),
  julia: () => import('highlight.js/lib/languages/julia'),
  latex: () => import('highlight.js/lib/languages/latex'),
  lua: () => import('highlight.js/lib/languages/lua'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  matlab: () => import('highlight.js/lib/languages/matlab'),
  nginx: () => import('highlight.js/lib/languages/nginx'),
  objectivec: () => import('highlight.js/lib/languages/objectivec'),
  perl: () => import('highlight.js/lib/languages/perl'),
  protobuf: () => import('highlight.js/lib/languages/protobuf'),
  r: () => import('highlight.js/lib/languages/r'),
  scala: () => import('highlight.js/lib/languages/scala'),
  scss: () => import('highlight.js/lib/languages/scss'),
  toml: () => import('highlight.js/lib/languages/ini'),
  vim: () => import('highlight.js/lib/languages/vim')
}

/** Opening fences carry the language: ```lang or ~~~lang, at the start of a line. */
const FENCE_LANGUAGE = /^[ \t]*(?:`{3,}|~{3,})[ \t]*([A-Za-z][\w+#-]*)/gm

const loadedLanguages = new Map<string, Promise<void>>()

/** Language names a document asks for that are neither registered nor already loading. */
export function lazyLanguagesIn(source: string): string[] {
  const wanted = new Set<string>()
  for (const match of source.matchAll(FENCE_LANGUAGE)) {
    const name = match[1].toLowerCase()
    if (LAZY_LANGUAGES[name] && !hljs.getLanguage(name)) wanted.add(name)
  }
  return [...wanted]
}

/**
 * Register every lazily-available language the document uses.
 *
 * A failed fetch is swallowed: the block then renders as escaped text, which is what an
 * unknown language already does, and is better than failing the whole render.
 */
export async function registerLanguagesIn(source: string): Promise<void> {
  const names = lazyLanguagesIn(source)
  if (names.length === 0) return

  await Promise.all(
    names.map((name) => {
      const already = loadedLanguages.get(name)
      if (already) return already

      const loading = LAZY_LANGUAGES[name]()
        .then((module) => {
          if (!hljs.getLanguage(name)) hljs.registerLanguage(name, module.default)
        })
        .catch(() => undefined)
      loadedLanguages.set(name, loading)
      return loading
    })
  )
}

function safeHeadingId(id: string): string {
  return id.startsWith(HEADING_ID_PREFIX) ? id : `${HEADING_ID_PREFIX}${id}`
}

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

function localAssetUrl(fileUrl: string): string {
  return `moji-asset://local/${encodeURIComponent(fileUrlToPath(fileUrl))}`
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

function createMarkdownRenderer(): MarkdownIt {
  const renderer = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(str, lang): string {
      if (lang.toLowerCase() === 'mermaid') {
        return `<pre class="hljs mermaid-diagram-candidate"><code>${renderer.utils.escapeHtml(str)}</code></pre>`
      }
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`
        } catch {
          // Fall through to escaped plain text.
        }
      }
      return `<pre class="hljs"><code>${renderer.utils.escapeHtml(str)}</code></pre>`
    }
  })

  renderer.use(anchor, {
    slugify: (value) => safeHeadingId(encodeURIComponent(String(value).trim().toLowerCase().replace(/\s+/g, '-')))
  })
  renderer.use(taskLists, { enabled: true, label: true })
  renderer.use(sub)
  renderer.use(sup)
  renderer.use(ins)
  renderer.use(mark)
  renderer.use(footnote)
  renderer.use(deflist)
  renderer.use(abbr)
  renderer.use(emoji)

  const defaultImageRenderer = renderer.renderer.rules.image
  renderer.renderer.rules.image = (tokens, index, options, env, self): string => {
    const token = tokens[index]
    const source = token.attrGet('src')?.trim()
    const context = env as MarkdownRenderEnvironment
    if (source && !source.startsWith('#')) {
      const resolved = resolveLocalUrl(source, context.documentPath)
      if (resolved?.startsWith('file:')) {
        if (context.assetMode === 'app') {
          token.attrSet('data-local-asset', localAssetUrl(resolved))
          token.attrSet('src', EMPTY_IMAGE)
          token.attrSet('loading', 'lazy')
          token.attrSet('decoding', 'async')
        } else {
          token.attrSet('src', resolved)
        }
      }
    }
    return defaultImageRenderer?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options)
  }

  const defaultLinkRenderer = renderer.renderer.rules.link_open
  renderer.renderer.rules.link_open = (tokens, index, options, env, self): string => {
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

  return renderer
}

const md = createMarkdownRenderer()
let mathRenderer: MarkdownIt | null = null
let mathRendererPromise: Promise<MarkdownIt> | null = null

export function hasPotentialMath(source: string): boolean {
  return source.includes('$')
}

async function getMathRenderer(): Promise<MarkdownIt> {
  if (mathRenderer) return mathRenderer
  mathRendererPromise ??= Promise.all([
    import('markdown-it-texmath'),
    import('katex')
  ]).then(([{ default: texmath }, { default: katex }]) => {
    const renderer = createMarkdownRenderer()
    renderer.use(texmath, {
      engine: katex,
      delimiters: 'dollars',
      katexOptions: { throwOnError: false, strict: false }
    })
    mathRenderer = renderer
    return renderer
  })
  return mathRendererPromise
}

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

type MarkdownToken = ReturnType<typeof md.parse>[number]

function splitTopLevelBlocks(tokens: MarkdownToken[]): MarkdownToken[][] {
  const atomicBlocks: MarkdownToken[][] = []
  let current: MarkdownToken[] = []

  for (const token of tokens) {
    const startsBlock = token.level === 0 && token.nesting !== -1
    if (startsBlock && current.length > 0) {
      atomicBlocks.push(current)
      current = []
    }
    current.push(token)
  }
  if (current.length > 0) atomicBlocks.push(current)

  // Keep headings at the start of a virtual section, while coalescing short
  // neighboring nodes. Sanitizing and observing every paragraph separately is
  // disproportionately expensive in multi-megabyte documents.
  const blocks: MarkdownToken[][] = []
  current = []
  let currentChars = 0
  let currentLines = 0
  for (const atomic of atomicBlocks) {
    const startsSection = atomic[0]?.type === 'heading_open'
    const chars = atomic.reduce((sum, token) => sum + token.content.length, 0)
    const lines = atomic.reduce((sum, token) => {
      if (!token.map) return sum
      return Math.max(sum, token.map[1] - token.map[0])
    }, 0)
    if (current.length > 0 && (startsSection || currentChars + chars > 32_000 || currentLines + lines > 120)) {
      blocks.push(current)
      current = []
      currentChars = 0
      currentLines = 0
    }
    current.push(...atomic)
    currentChars += chars
    currentLines += lines
  }
  if (current.length > 0) blocks.push(current)
  return blocks
}

function plainTextFromTokens(tokens: MarkdownToken[]): string {
  const chunks: string[] = []
  for (const token of tokens) {
    if (token.type === 'inline') {
      chunks.push((token.children ?? []).map((child) => {
        if (child.type === 'softbreak' || child.type === 'hardbreak') return ' '
        return child.content
      }).join(''))
    } else if (token.type === 'fence' || token.type === 'code_block') {
      chunks.push(token.content)
    } else if (token.type === 'html_block') {
      chunks.push(token.content.replace(/<[^>]*>/g, ' '))
    }
  }
  return chunks.join('\n')
}

function estimatedBlockHeight(tokens: MarkdownToken[], text: string): number {
  const mapped = tokens.flatMap((token) => token.map ? [token.map] : [])
  const sourceLines = mapped.length > 0
    ? Math.max(...mapped.map((map) => map[1])) - Math.min(...mapped.map((map) => map[0]))
    : Math.max(1, Math.ceil(text.length / 80))
  const wrappedLines = Math.max(1, Math.ceil(text.length / 88))
  const imageCount = tokens.filter((token) => token.type === 'image').length +
    tokens.flatMap((token) => token.children ?? []).filter((token) => token.type === 'image').length
  const tableRows = tokens.filter((token) => token.type === 'tr_open').length
  const displayMath = tokens.filter((token) => token.type === 'math_block').length
  return Math.max(48, Math.max(sourceLines, wrappedLines) * 24, imageCount * 360, tableRows * 34, displayMath * 96)
}

export function extractMarkdownOutlineCore(source: string): OutlineItem[] {
  return extractOutlineFromTokens(md.parse((source ?? '').replace(/^\uFEFF/, ''), {}))
}

export function renderMarkdownDocumentRaw(
  source: string,
  options: RenderMarkdownOptions = {},
  renderer: MarkdownIt = md
): RawMarkdownRenderResult {
  const totalStartedAt = performance.now()
  const normalizedSource = (source ?? '').replace(/^\uFEFF/, '')
  const parseStartedAt = performance.now()
  const tokens = renderer.parse(normalizedSource, {})
  const parseMs = performance.now() - parseStartedAt
  const outlineStartedAt = performance.now()
  const outline = extractOutlineFromTokens(tokens)
  const outlineMs = performance.now() - outlineStartedAt
  const renderStartedAt = performance.now()
  const environment = {
    documentPath: options.documentPath,
    assetMode: options.assetMode ?? 'file',
    headingIds: new Set(outline.map((item) => item.id))
  } satisfies MarkdownRenderEnvironment
  const blocks = options.blockMode
    ? splitTopLevelBlocks(tokens).map((blockTokens, index): RawMarkdownBlock => {
      const text = plainTextFromTokens(blockTokens)
      return {
        id: `markdown-block-${index}`,
        rawHtml: renderer.renderer.render(blockTokens, renderer.options, environment),
        text,
        headingIds: blockTokens.flatMap((token) => (
          token.type === 'heading_open' && token.attrGet('id') ? [token.attrGet('id') as string] : []
        )),
        estimatedHeight: estimatedBlockHeight(blockTokens, text)
      }
    })
    : undefined
  const rawHtml = blocks
    ? ''
    : renderer.renderer.render(tokens, renderer.options, environment)
  const renderHtmlMs = performance.now() - renderStartedAt

  return {
    rawHtml,
    blocks,
    outline,
    headingLines: outline.flatMap((item) => (
      item.sourceLine === undefined ? [] : [[item.id, item.sourceLine] as const]
    )),
    timings: {
      parseMs,
      outlineMs,
      renderHtmlMs,
      totalMs: performance.now() - totalStartedAt
    }
  }
}

export async function renderMarkdownDocumentRawAsync(
  source: string,
  options: RenderMarkdownOptions = {}
): Promise<RawMarkdownRenderResult> {
  // Both of these have to settle before parsing: markdown-it's `highlight` hook is
  // synchronous, so a language that is not registered by the time it runs falls back to
  // escaped text for this render.
  await registerLanguagesIn(source)
  const renderer = hasPotentialMath(source) ? await getMathRenderer() : md
  return renderMarkdownDocumentRaw(source, options, renderer)
}
