// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  activatePreviewSearchMatch,
  highlightPreviewSearchMatches,
  highlightPreviewSearchMatchesIncremental
} from './previewSearch'

describe('preview search highlighting', () => {
  it('finds an exact phrase split by inline Markdown elements', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>João <strong>Silva</strong> Souza</p>'

    expect(highlightPreviewSearchMatches(root, 'João Silva Souza', 2_000)).toBe(1)
    expect(root.textContent).toBe('João Silva Souza')
    expect(Array.from(root.querySelectorAll('.search-highlight')).map((mark) => mark.textContent)).toEqual([
      'João ',
      'Silva',
      ' Souza'
    ])
  })

  it('scans blocks incrementally without splitting inline phrases', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>João <strong>Silva</strong></p><p>João <em>Souza</em></p>'
    const progress: number[] = []
    let yields = 0

    const count = await highlightPreviewSearchMatchesIncremental(root, 'João Silva', 2_000, {
      timeSliceMs: 0,
      yieldControl: async () => { yields += 1 },
      onProgress: (value) => progress.push(value)
    })

    expect(count).toBe(1)
    expect(progress).toEqual([1, 1])
    expect(yields).toBeGreaterThan(0)
    expect(Array.from(root.querySelectorAll('.search-highlight')).map((mark) => mark.textContent))
      .toEqual(['João ', 'Silva'])
  })

  it('ignores copied whitespace around the search term', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>Ana Maria</p>'

    expect(highlightPreviewSearchMatches(root, '  Ana Maria  ', 2_000)).toBe(1)
  })

  it('does not join text from separate visual blocks', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>Ana</p><p>Maria</p>'

    expect(highlightPreviewSearchMatches(root, 'AnaMaria', 2_000)).toBe(0)
  })

  it('distinguishes only the active occurrence', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>Moji Moji Moji</p>'
    highlightPreviewSearchMatches(root, 'Moji', 2_000)

    const active = activatePreviewSearchMatch(root, 1)

    expect(active?.dataset.searchIndex).toBe('1')
    expect(root.querySelectorAll('.search-highlight--active')).toHaveLength(1)
  })

  it('preserves global match indexes for a mounted virtual window', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>Moji Moji</p>'

    expect(highlightPreviewSearchMatches(root, 'Moji', 2_000, 7)).toBe(2)
    expect(Array.from(root.querySelectorAll<HTMLElement>('.search-highlight')).map((mark) => mark.dataset.searchIndex))
      .toEqual(['7', '8'])
  })

  it('searches table, code and formula text with content-visibility enabled', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <table style="content-visibility:auto"><tbody><tr><td>Needle table</td></tr></tbody></table>
      <div class="code-block" style="content-visibility:auto"><pre>Needle code</pre></div>
      <div class="katex-display" style="content-visibility:auto"><span>Needle formula</span></div>
    `

    expect(highlightPreviewSearchMatches(root, 'Needle', 2_000)).toBe(3)
    expect(root.querySelectorAll('.search-highlight')).toHaveLength(3)
  })
})
