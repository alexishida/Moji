import DOMPurify from 'dompurify'
import type { Mermaid } from 'mermaid'
import type { Theme } from '../../electron/shared'

let nextDiagramId = 0
let renderQueue: Promise<void> = Promise.resolve()

function isFlowchart(source: string): boolean {
  return /^\s*(?:flowchart|graph)\b/i.test(source)
}

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

async function loadMermaid(): Promise<Mermaid> {
  return (await import('mermaid')).default
}

/**
 * Replaces supported Mermaid flowchart candidates with self-contained, sanitized SVG.
 * Invalid and unsupported definitions intentionally remain ordinary escaped code blocks.
 */
export function renderMermaidFlowcharts(html: string, theme: Theme): Promise<string> {
  if (!html.includes('mermaid-flowchart')) return Promise.resolve(html)

  return queueRender(async () => {
    const template = document.createElement('template')
    template.innerHTML = html
    const candidates = Array.from(template.content.querySelectorAll<HTMLElement>('pre.mermaid-flowchart'))
    if (candidates.length === 0) return html

    const mermaid = await loadMermaid()
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
      flowchart: { htmlLabels: false }
    })

    for (const candidate of candidates) {
      const source = candidate.querySelector('code')?.textContent ?? candidate.textContent ?? ''
      if (!isFlowchart(source)) continue

      try {
        const id = `moji-mermaid-${nextDiagramId++}`
        const { svg } = await mermaid.render(id, source)
        const safeSvg = sanitizeSvg(svg)
        if (!safeSvg) continue

        const diagram = document.createElement('div')
        diagram.className = 'mermaid-diagram'
        diagram.dataset.mermaidRendered = 'true'
        diagram.innerHTML = safeSvg
        candidate.replaceWith(diagram)
      } catch {
        // Keep original escaped code block so one invalid diagram never breaks a document.
      }
    }

    return template.innerHTML
  })
}
