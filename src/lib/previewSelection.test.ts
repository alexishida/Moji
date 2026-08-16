// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { selectionTouchesCodeBlock } from './previewSelection'

afterEach(() => document.getSelection()?.removeAllRanges())

function select(from: Node, fromOffset: number, to: Node, toOffset: number): Selection {
  const range = document.createRange()
  range.setStart(from, fromOffset)
  range.setEnd(to, toOffset)
  const selection = document.getSelection()
  if (!selection) throw new Error('Selection unavailable')
  selection.removeAllRanges()
  selection.addRange(range)
  return selection
}

describe('preview text selection', () => {
  it('detects selection inside and across a content-visibility code block', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>before</p><div class="code-block" style="content-visibility:auto"><pre><code>sample code</code></pre></div><p>after</p>'
    document.body.append(root)
    const before = root.querySelector('p')?.firstChild
    const code = root.querySelector('code')?.firstChild
    const after = root.querySelectorAll('p')[1]?.firstChild
    if (!before || !code || !after) throw new Error('Fixture incomplete')

    expect(selectionTouchesCodeBlock(root, select(code, 0, code, 6))).toBe(true)
    expect(selectionTouchesCodeBlock(root, select(before, 0, after, 5))).toBe(true)
    expect(selectionTouchesCodeBlock(root, select(before, 0, before, 6))).toBe(false)
    root.remove()
  })
})
