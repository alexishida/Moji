// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn()
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: state.initialize,
    render: state.render
  }
}))

import { renderMermaidFlowcharts } from './mermaid'

const flowchart = '<pre class="hljs mermaid-diagram-candidate"><code>flowchart TD\n  Start --&gt; End</code></pre>'

describe('renderMermaidFlowcharts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.render.mockResolvedValue({ svg: '<svg class="mermaid"><style>.node{fill:red}</style><rect onclick="bad()" /></svg>' })
  })

  it('renders a flowchart as sanitized inline SVG', async () => {
    const html = await renderMermaidFlowcharts(flowchart, 'dark')

    expect(state.initialize).toHaveBeenCalledWith(expect.objectContaining({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'dark'
    }))
    expect(state.render).toHaveBeenCalledWith(expect.stringMatching(/^moji-mermaid-/), 'flowchart TD\n  Start --> End')
    expect(html).toContain('data-mermaid-rendered="true"')
    expect(html).toContain('data-mermaid-type="flowchart"')
    expect(html).toContain('<svg class="mermaid">')
    expect(html).toContain('<style>.node{fill:red}</style>')
    expect(html).not.toContain('onclick')
  })

  it('renders legacy graph declarations', async () => {
    const html = await renderMermaidFlowcharts(
      '<pre class="hljs mermaid-diagram-candidate"><code>graph LR\n  A --&gt; B</code></pre>',
      'light'
    )

    expect(state.render).toHaveBeenCalledWith(expect.stringMatching(/^moji-mermaid-/), 'graph LR\n  A --> B')
    expect(html).toContain('<svg class="mermaid"')
  })

  it('keeps a Mermaid title verbatim as the diagram name', async () => {
    const html = await renderMermaidFlowcharts(
      '<pre class="hljs mermaid-diagram-candidate"><code>pie title Vendas\n  "Produto" : 10</code></pre>',
      'light'
    )

    expect(html).toContain('data-mermaid-title="Vendas"')
    expect(html).toContain('data-mermaid-type="pie"')
  })

  it('emits a canonical type key for translation', async () => {
    const html = await renderMermaidFlowcharts(
      '<pre class="hljs mermaid-diagram-candidate"><code>classDiagram\n  Account --&gt; Ledger</code></pre>',
      'light'
    )

    expect(html).toContain('data-mermaid-type="classDiagram"')
    expect(html).not.toContain('data-mermaid-title')
  })

  it.each([
    ['sequence', 'sequenceDiagram\n  Alice->>Bob: Hi'],
    ['Gantt', 'gantt\n  title Roadmap\n  section Build\n  Feature :done, 2026-07-01, 2d'],
    ['class', 'classDiagram\n  User --> Order'],
    ['entity-relationship', 'erDiagram\n  USER ||--o{ ORDER : places'],
    ['state', 'stateDiagram-v2\n  [*] --> Active'],
    ['journey', 'journey\n  title Checkout\n  section Buy\n    Pay: 5: User']
  ])('renders %s diagrams', async (_name, definition) => {
    const source = `<pre class="hljs mermaid-diagram-candidate"><code>${definition.replaceAll('>', '&gt;')}</code></pre>`

    const html = await renderMermaidFlowcharts(source, 'light')

    expect(state.render).toHaveBeenCalledWith(expect.stringMatching(/^moji-mermaid-/), definition)
    expect(html).toContain('data-mermaid-rendered="true"')
  })

  it('keeps invalid flowchart source as code when Mermaid fails', async () => {
    state.render.mockRejectedValue(new Error('Invalid syntax'))

    await expect(renderMermaidFlowcharts(flowchart, 'light')).resolves.toBe(flowchart)
  })

  it('reuses the cached SVG for an identical source and theme', async () => {
    const source = '<pre class="hljs mermaid-diagram-candidate"><code>flowchart LR\n  Cache --&gt; Hit</code></pre>'

    const first = await renderMermaidFlowcharts(source, 'dark')
    const second = await renderMermaidFlowcharts(source, 'dark')

    expect(state.render).toHaveBeenCalledTimes(1)
    expect(state.initialize).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('does not retry a source Mermaid already rejected', async () => {
    state.render.mockRejectedValue(new Error('Invalid syntax'))
    const source = '<pre class="hljs mermaid-diagram-candidate"><code>flowchart TD\n  Broken --&gt;</code></pre>'

    await expect(renderMermaidFlowcharts(source, 'dark')).resolves.toBe(source)
    await expect(renderMermaidFlowcharts(source, 'dark')).resolves.toBe(source)

    expect(state.render).toHaveBeenCalledTimes(1)
  })
})
