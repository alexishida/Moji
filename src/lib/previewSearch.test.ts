// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { activatePreviewSearchMatch, highlightPreviewSearchMatches } from './previewSearch'

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
})
