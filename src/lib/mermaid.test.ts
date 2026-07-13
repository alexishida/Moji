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

const flowchart = '<pre class="hljs mermaid-flowchart"><code>flowchart TD\n  Start --&gt; End</code></pre>'

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
    expect(html).toContain('<svg class="mermaid">')
    expect(html).toContain('<style>.node{fill:red}</style>')
    expect(html).not.toContain('onclick')
  })

  it('renders legacy graph declarations', async () => {
    const html = await renderMermaidFlowcharts(
      '<pre class="hljs mermaid-flowchart"><code>graph LR\n  A --&gt; B</code></pre>',
      'light'
    )

    expect(state.render).toHaveBeenCalledWith(expect.stringMatching(/^moji-mermaid-/), 'graph LR\n  A --> B')
    expect(html).toContain('<svg class="mermaid">')
  })

  it('keeps unsupported Mermaid types as code', async () => {
    const source = '<pre class="hljs mermaid-flowchart"><code>sequenceDiagram\n  Alice-&gt;&gt;Bob: Hi</code></pre>'

    await expect(renderMermaidFlowcharts(source, 'light')).resolves.toBe(source)
    expect(state.render).not.toHaveBeenCalled()
  })

  it('keeps invalid flowchart source as code when Mermaid fails', async () => {
    state.render.mockRejectedValue(new Error('Invalid syntax'))

    await expect(renderMermaidFlowcharts(flowchart, 'light')).resolves.toBe(flowchart)
  })
})
