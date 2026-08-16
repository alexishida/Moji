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

import { getMermaidRenderMetrics, patchMermaidFlowcharts, renderMermaidFlowcharts } from './mermaid'

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

  it('patches only live placeholders and preserves surrounding DOM identity', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<p id="before">Before</p><pre class="hljs mermaid-diagram-candidate"><code>flowchart TD\n  Patch --&gt; DOM</code></pre><p id="after">After</p>'
    const before = root.querySelector('#before')
    const after = root.querySelector('#after')

    await expect(patchMermaidFlowcharts(root, 'light')).resolves.toBe(1)

    expect(root.querySelector('#before')).toBe(before)
    expect(root.querySelector('#after')).toBe(after)
    expect(root.querySelector('.mermaid-diagram svg')).not.toBeNull()
    expect(root.querySelector('.mermaid-diagram-candidate')).toBeNull()
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

  it('maps each declaration to its canonical type key', async () => {
    // Mermaid itself is mocked, so what is worth asserting here is the declaration
    // parsing: every supported keyword must reach the same canonical key the UI translates.
    const cases: Array<[string, string]> = [
      ['sequenceDiagram\n  Alice->>Bob: Hi', 'sequenceDiagram'],
      ['gantt\n  section Build\n  Feature :done, 2026-07-01, 2d', 'gantt'],
      ['erDiagram\n  USER ||--o{ ORDER : places', 'erDiagram'],
      ['stateDiagram-v2\n  [*] --> Active', 'stateDiagram'],
      ['journey\n  section Buy\n    Pay: 5: User', 'journey'],
      ['unknownDiagram\n  a --> b', 'diagram']
    ]

    for (const [definition, expectedType] of cases) {
      const source = `<pre class="hljs mermaid-diagram-candidate"><code>${definition.replaceAll('>', '&gt;')}</code></pre>`

      const html = await renderMermaidFlowcharts(source, 'light')

      expect(state.render).toHaveBeenCalledWith(expect.stringMatching(/^moji-mermaid-/), definition)
      expect(html).toContain(`data-mermaid-type="${expectedType}"`)
    }
  })

  it('keeps invalid flowchart source as code when Mermaid fails', async () => {
    state.render.mockRejectedValue(new Error('Invalid syntax'))

    await expect(renderMermaidFlowcharts(flowchart, 'light')).resolves.toBe(flowchart)
  })

  it('turns an invalid live placeholder back into an ordinary code block', async () => {
    state.render.mockRejectedValue(new Error('Invalid syntax'))
    const root = document.createElement('div')
    root.innerHTML = '<pre class="hljs mermaid-diagram-candidate"><code>flowchart TD\n  PatchInvalid --&gt;</code></pre>'

    await expect(patchMermaidFlowcharts(root, 'light')).resolves.toBe(1)

    expect(root.querySelector('pre.hljs')).not.toBeNull()
    expect(root.querySelector('.mermaid-diagram-candidate')).toBeNull()
    expect(root.querySelector('.mermaid-diagram')).toBeNull()
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

  it('skips an obsolete request that waits behind the current render', async () => {
    const initialDiscardCount = getMermaidRenderMetrics().discardedRequests
    let releaseCurrent: (() => void) | undefined
    state.render.mockImplementation(() => new Promise((resolve) => {
      releaseCurrent = () => resolve({ svg: '<svg><rect /></svg>' })
    }))
    const currentSource = '<pre class="hljs mermaid-diagram-candidate"><code>flowchart LR\n  Current --&gt; Work</code></pre>'
    const current = renderMermaidFlowcharts(currentSource, 'dark')
    await vi.waitFor(() => expect(state.render).toHaveBeenCalledTimes(1))

    const obsoleteSource = '<pre class="hljs mermaid-diagram-candidate"><code>flowchart LR\n  Old --&gt; Work</code></pre>'
    const obsolete = renderMermaidFlowcharts(obsoleteSource, 'dark', () => false)
    releaseCurrent?.()

    await expect(current).resolves.toContain('data-mermaid-rendered="true"')
    await expect(obsolete).resolves.toBe(obsoleteSource)
    expect(state.render).toHaveBeenCalledTimes(1)
    expect(getMermaidRenderMetrics().discardedRequests).toBe(initialDiscardCount + 1)
  })
})
