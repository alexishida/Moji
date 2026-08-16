import DOMPurify from 'dompurify'
import type { Mermaid } from 'mermaid'
import type { Theme } from '../../electron/shared'
import { beginRendererMeasure, recordRendererObservation } from './performanceMetrics'

const SVG_CACHE_ENTRY_LIMIT = 40
const SVG_CACHE_BYTE_LIMIT = 4 * 1024 * 1024

let nextDiagramId = 0
let renderQueue: Promise<void> = Promise.resolve()
let mermaidModule: Promise<Mermaid> | null = null
let initializedTheme: Theme | null = null
let discardedRenderCount = 0

export interface MermaidRenderMetrics {
  discardedRequests: number
}

/** Local-only counter for preview work made obsolete before it could finish. */
export function getMermaidRenderMetrics(): MermaidRenderMetrics {
  return { discardedRequests: discardedRenderCount }
}

function discardObsoleteRender(html: string): string {
  recordObsoleteRender()
  return html
}

function recordObsoleteRender(): void {
  discardedRenderCount += 1
  recordRendererObservation('mermaid:discarded', { count: discardedRenderCount })
}

/**
 * Sanitized SVG per `theme + source`, `null` for sources Mermaid rejected.
 * Live preview re-renders the whole document on every debounced edit; without
 * this cache every keystroke re-runs Mermaid layout for every diagram, which
 * churns large amounts of transient DOM and heap.
 */
const svgCache = new Map<string, string | null>()
let svgCacheBytes = 0

function queueRender<T>(operation: () => Promise<T>): Promise<T> {
  const result = renderQueue.then(operation, operation)
  renderQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true }
  })
}

async function loadMermaid(theme: Theme): Promise<Mermaid> {
  mermaidModule ??= import('mermaid').then((module) => module.default)
  const mermaid = await mermaidModule
  if (initializedTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
      flowchart: { htmlLabels: false }
    })
    initializedTheme = theme
  }
  return mermaid
}

async function renderDiagram(mermaid: Mermaid, source: string): Promise<string | null> {
  const id = `moji-mermaid-${nextDiagramId++}`
  try {
    const { svg } = await mermaid.render(id, source)
    return sanitizeSvg(svg) || null
  } catch {
    // Mermaid v10 appends a temporary element to document.body and leaves it
    // behind when rendering fails; remove it so repeated failures during live
    // editing do not accumulate orphan nodes.
    document.getElementById(id)?.remove()
    document.getElementById(`d${id}`)?.remove()
    return null
  }
}

function cacheEntryBytes(key: string, svg: string | null): number {
  // JavaScript strings use UTF-16 code units. Include key because it embeds
  // Mermaid source and can otherwise retain a large document fragment.
  return (key.length + (svg?.length ?? 0)) * 2
}

function removeOldestCachedSvg(): void {
  const oldest = svgCache.entries().next().value as [string, string | null] | undefined
  if (!oldest) return
  svgCache.delete(oldest[0])
  svgCacheBytes -= cacheEntryBytes(oldest[0], oldest[1])
}

function cacheSvg(key: string, svg: string | null): void {
  const entryBytes = cacheEntryBytes(key, svg)
  if (entryBytes > SVG_CACHE_BYTE_LIMIT) return

  const previous = svgCache.get(key) ?? null
  if (svgCache.has(key)) {
    svgCache.delete(key)
    svgCacheBytes -= cacheEntryBytes(key, previous)
  }

  while (
    svgCache.size > 0 &&
    (svgCache.size >= SVG_CACHE_ENTRY_LIMIT || svgCacheBytes + entryBytes > SVG_CACHE_BYTE_LIMIT)
  ) {
    removeOldestCachedSvg()
  }

  svgCache.set(key, svg)
  svgCacheBytes += entryBytes
}

/** Canonical type keys, translated at display time under `preview.diagramTypes`. */
const DIAGRAM_TYPE_KEYS: Record<string, string> = {
  flowchart: 'flowchart',
  graph: 'flowchart',
  sequencediagram: 'sequenceDiagram',
  classdiagram: 'classDiagram',
  statediagram: 'stateDiagram',
  'statediagram-v2': 'stateDiagram',
  erdiagram: 'erDiagram',
  journey: 'journey',
  gantt: 'gantt',
  pie: 'pie',
  gitgraph: 'gitGraph',
  mindmap: 'mindmap',
  timeline: 'timeline',
  quadrantchart: 'quadrantChart',
  requirementdiagram: 'requirementDiagram',
  'xychart-beta': 'xyChart',
  'sankey-beta': 'sankey',
  'block-beta': 'block',
  'architecture-beta': 'architecture',
  'packet-beta': 'packet',
  kanban: 'kanban'
}

/** Explicit author-provided title, kept verbatim and never translated. */
function diagramTitle(source: string): string | null {
  return source.match(/^\s*title\s*:?\s*(.+?)\s*$/im)?.[1]
    ?? source.match(/^\s*pie(?:\s+showData)?\s+title\s+(.+?)\s*$/im)?.[1]
    ?? null
}

/** Canonical type key (`classDiagram`, `flowchart`, …); `diagram` when unknown. */
function diagramType(source: string): string {
  const declaration = source.trimStart().match(/^([\w-]+)/)?.[1]?.toLowerCase()
  return (declaration && DIAGRAM_TYPE_KEYS[declaration]) ?? 'diagram'
}

async function cachedDiagramSvg(theme: Theme, source: string): Promise<string | null> {
  const cacheKey = `${theme}\0${source}`
  let safeSvg = svgCache.get(cacheKey)
  if (safeSvg === undefined) {
    const mermaid = await loadMermaid(theme)
    safeSvg = await renderDiagram(mermaid, source)
    cacheSvg(cacheKey, safeSvg)
  }
  return safeSvg
}

function createDiagramElement(source: string, safeSvg: string): HTMLDivElement {
  const diagram = document.createElement('div')
  diagram.className = 'mermaid-diagram'
  diagram.dataset.mermaidRendered = 'true'
  diagram.dataset.mermaidType = diagramType(source)
  const title = diagramTitle(source)
  if (title) diagram.dataset.mermaidTitle = title
  diagram.innerHTML = safeSvg
  return diagram
}

/** Replaces only live Mermaid placeholders; surrounding preview DOM stays intact. */
export function patchMermaidFlowcharts(
  root: HTMLElement,
  theme: Theme,
  isCurrent: () => boolean = () => true
): Promise<number> {
  const finishMeasure = beginRendererMeasure('mermaid:patch')
  return queueRender(async () => {
    let candidates: HTMLElement[] = []
    let patched = 0
    try {
      if (!isCurrent()) {
        recordObsoleteRender()
        return 0
      }
      candidates = Array.from(root.querySelectorAll<HTMLElement>('pre.mermaid-diagram-candidate'))
      for (const candidate of candidates) {
        if (!isCurrent()) {
          recordObsoleteRender()
          return patched
        }
        const source = candidate.querySelector('code')?.textContent ?? candidate.textContent ?? ''
        const safeSvg = await cachedDiagramSvg(theme, source)
        if (!isCurrent()) {
          recordObsoleteRender()
          return patched
        }
        if (!root.contains(candidate)) continue
        if (safeSvg === null) {
          candidate.classList.remove('mermaid-diagram-candidate')
          patched += 1
          continue
        }
        candidate.replaceWith(createDiagramElement(source, safeSvg))
        patched += 1
      }
      return patched
    } finally {
      finishMeasure({ candidateCount: candidates.length, patchedCount: patched })
    }
  })
}

/**
 * Replaces valid Mermaid candidates with self-contained, sanitized SVG.
 * Invalid definitions intentionally remain ordinary escaped code blocks.
 */
export function renderMermaidFlowcharts(
  html: string,
  theme: Theme,
  isCurrent: () => boolean = () => true
): Promise<string> {
  if (!html.includes('mermaid-diagram-candidate')) return Promise.resolve(html)
  if (!isCurrent()) return Promise.resolve(discardObsoleteRender(html))
  const finishMeasure = beginRendererMeasure('mermaid:render', { htmlChars: html.length })

  return queueRender(async () => {
    // Calls wait in a shared queue. Check again here so requests superseded
    // while waiting do not load Mermaid or allocate a temporary DOM tree.
    let candidates: HTMLElement[] = []
    try {
      if (!isCurrent()) return discardObsoleteRender(html)

      const template = document.createElement('template')
      template.innerHTML = html
      candidates = Array.from(template.content.querySelectorAll<HTMLElement>('pre.mermaid-diagram-candidate'))
      if (candidates.length === 0) return html

      let changed = false
      for (const candidate of candidates) {
        if (!isCurrent()) return discardObsoleteRender(html)

        const source = candidate.querySelector('code')?.textContent ?? candidate.textContent ?? ''

        const safeSvg = await cachedDiagramSvg(theme, source)
        if (!isCurrent()) return discardObsoleteRender(html)
        // Failed renders keep the original escaped code block so one invalid
        // diagram never breaks a document.
        if (safeSvg === null) continue

        candidate.replaceWith(createDiagramElement(source, safeSvg))
        changed = true
      }

      return changed ? template.innerHTML : html
    } finally {
      finishMeasure({ candidateCount: candidates.length })
    }
  })
}
