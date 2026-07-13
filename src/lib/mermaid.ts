import DOMPurify from 'dompurify'
import type { Mermaid } from 'mermaid'
import type { Theme } from '../../electron/shared'

const SVG_CACHE_LIMIT = 40

let nextDiagramId = 0
let renderQueue: Promise<void> = Promise.resolve()
let mermaidModule: Promise<Mermaid> | null = null
let initializedTheme: Theme | null = null

/**
 * Sanitized SVG per `theme + source`, `null` for sources Mermaid rejected.
 * Live preview re-renders the whole document on every debounced edit; without
 * this cache every keystroke re-runs Mermaid layout for every diagram, which
 * churns large amounts of transient DOM and heap.
 */
const svgCache = new Map<string, string | null>()

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

function cacheSvg(key: string, svg: string | null): void {
  if (svgCache.size >= SVG_CACHE_LIMIT && !svgCache.has(key)) {
    const oldest = svgCache.keys().next().value
    if (oldest !== undefined) svgCache.delete(oldest)
  }
  svgCache.set(key, svg)
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

/**
 * Replaces valid Mermaid candidates with self-contained, sanitized SVG.
 * Invalid definitions intentionally remain ordinary escaped code blocks.
 */
export function renderMermaidFlowcharts(html: string, theme: Theme): Promise<string> {
  if (!html.includes('mermaid-diagram-candidate')) return Promise.resolve(html)

  return queueRender(async () => {
    const template = document.createElement('template')
    template.innerHTML = html
    const candidates = Array.from(template.content.querySelectorAll<HTMLElement>('pre.mermaid-diagram-candidate'))
    if (candidates.length === 0) return html

    let changed = false
    for (const candidate of candidates) {
      const source = candidate.querySelector('code')?.textContent ?? candidate.textContent ?? ''

      const cacheKey = `${theme}\0${source}`
      let safeSvg = svgCache.get(cacheKey)
      if (safeSvg === undefined) {
        const mermaid = await loadMermaid(theme)
        safeSvg = await renderDiagram(mermaid, source)
        cacheSvg(cacheKey, safeSvg)
      }
      // Failed renders keep the original escaped code block so one invalid
      // diagram never breaks a document.
      if (safeSvg === null) continue

      const diagram = document.createElement('div')
      diagram.className = 'mermaid-diagram'
      diagram.dataset.mermaidRendered = 'true'
      diagram.dataset.mermaidType = diagramType(source)
      const title = diagramTitle(source)
      if (title) diagram.dataset.mermaidTitle = title
      diagram.innerHTML = safeSvg
      candidate.replaceWith(diagram)
      changed = true
    }

    return changed ? template.innerHTML : html
  })
}
