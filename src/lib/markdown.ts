import DOMPurify from 'dompurify'
import type { OutlineItem } from './outline'
import {
  documentAssetBaseUrl,
  extractMarkdownOutlineCore,
  hasPotentialMath,
  renderMarkdownDocumentRaw,
  renderMarkdownDocumentRawAsync,
  type RawMarkdownRenderResult,
  type RenderMarkdownOptions
} from './markdownCore'
import {
  requestMarkdownRender,
  requestMarkdownRenderOnce,
  MarkdownWorkerRequestCanceledError
} from './markdownWorkerClient'
import { beginRendererMeasure, recordRendererMeasure } from './performanceMetrics'

export { documentAssetBaseUrl, hasPotentialMath, MarkdownWorkerRequestCanceledError }
export type { RenderMarkdownOptions }

export interface MarkdownRenderResult {
  html: string
  blocks?: MarkdownRenderBlock[]
  outline: OutlineItem[]
  headingLines: ReadonlyMap<string, number>
}

export interface MarkdownRenderBlock {
  id: string
  html: string
  text: string
  headingIds: string[]
  estimatedHeight: number
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')?.startsWith('http')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Renderer-only trust boundary. Worker output stays raw until this returns. */
export function sanitizeMarkdownHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|file|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ADD_TAGS: ['eq', 'eqn'],
    ADD_ATTR: ['target', 'rel', 'id', 'src', 'data-local-asset', 'loading', 'decoding']
  })
}

function recordCoreTimings(result: RawMarkdownRenderResult, markdownChars: number): void {
  const rawHtmlChars = result.rawHtml.length + (result.blocks?.reduce((sum, block) => sum + block.rawHtml.length, 0) ?? 0)
  recordRendererMeasure('markdown:parse', result.timings.parseMs, { markdownChars })
  recordRendererMeasure('markdown:outline', result.timings.outlineMs, { headingCount: result.outline.length })
  recordRendererMeasure('markdown:render-html', result.timings.renderHtmlMs, { rawHtmlChars })
}

function finalizeMarkdownResult(raw: RawMarkdownRenderResult, markdownChars: number): MarkdownRenderResult {
  recordCoreTimings(raw, markdownChars)
  const rawHtmlChars = raw.rawHtml.length + (raw.blocks?.reduce((sum, block) => sum + block.rawHtml.length, 0) ?? 0)
  const finishSanitize = beginRendererMeasure('markdown:sanitize', { rawHtmlChars })
  let html = ''
  let blocks: MarkdownRenderBlock[] | undefined
  try {
    if (raw.blocks) {
      blocks = raw.blocks.map((block) => ({
        id: block.id,
        html: sanitizeMarkdownHtml(block.rawHtml),
        text: block.text,
        headingIds: block.headingIds,
        estimatedHeight: block.estimatedHeight
      }))
    } else {
      html = sanitizeMarkdownHtml(raw.rawHtml)
    }
  } finally {
    finishSanitize({
      htmlChars: html.length + (blocks?.reduce((sum, block) => sum + block.html.length, 0) ?? 0),
      blockCount: blocks?.length ?? 0
    })
  }
  return { html, blocks, outline: raw.outline, headingLines: new Map(raw.headingLines) }
}

export function extractMarkdownOutline(source: string): OutlineItem[] {
  const normalizedSource = (source ?? '').replace(/^\uFEFF/, '')
  const finishMeasure = beginRendererMeasure('markdown:outline', { markdownChars: normalizedSource.length })
  let outline: OutlineItem[] = []
  try {
    outline = extractMarkdownOutlineCore(normalizedSource)
    return outline
  } finally {
    finishMeasure({ headingCount: outline.length })
  }
}

export function renderMarkdown(source: string, options: RenderMarkdownOptions = {}): string {
  return renderMarkdownDocument(source, options).html
}

export function renderMarkdownDocument(
  source: string,
  options: RenderMarkdownOptions = {}
): MarkdownRenderResult {
  const finishRender = beginRendererMeasure('markdown:render', { markdownChars: source.length })
  let result: MarkdownRenderResult | null = null
  try {
    result = finalizeMarkdownResult(renderMarkdownDocumentRaw(source, options), source.length)
    return result
  } finally {
    finishRender({ htmlChars: result?.html.length ?? 0, headingCount: result?.outline.length ?? 0 })
  }
}

export async function renderMarkdownAsync(source: string, options: RenderMarkdownOptions = {}): Promise<string> {
  return (await renderMarkdownDocumentAsync(source, options)).html
}

export async function renderMarkdownDocumentAsync(
  source: string,
  options: RenderMarkdownOptions = {}
): Promise<MarkdownRenderResult> {
  if (hasPotentialMath(source)) await import('katex/dist/katex.min.css')
  return finalizeMarkdownResult(await renderMarkdownDocumentRawAsync(source, options), source.length)
}

/** Parse, highlight and render outside UI thread; sanitize response in renderer. */
export async function renderMarkdownDocumentInWorker(
  source: string,
  options: RenderMarkdownOptions = {}
): Promise<MarkdownRenderResult> {
  const finishRoundTrip = beginRendererMeasure('markdown:worker-roundtrip', { markdownChars: source.length })
  try {
    const [raw] = await Promise.all([
      requestMarkdownRender(source, options),
      hasPotentialMath(source) ? import('katex/dist/katex.min.css') : Promise.resolve()
    ])
    return finalizeMarkdownResult(raw, source.length)
  } finally {
    finishRoundTrip()
  }
}

export async function renderMarkdownInWorker(
  source: string,
  options: RenderMarkdownOptions = {}
): Promise<string> {
  const [raw] = await Promise.all([
    requestMarkdownRenderOnce(source, options),
    hasPotentialMath(source) ? import('katex/dist/katex.min.css') : Promise.resolve()
  ])
  return finalizeMarkdownResult(raw, source.length).html
}
