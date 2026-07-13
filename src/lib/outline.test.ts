// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildOutline, nestOutline } from './outline'

describe('buildOutline', () => {
  it('reads only anchored, non-empty headings from preview HTML', () => {
    expect(
      buildOutline('<h1 id="intro"> Introduction </h1><h2>Missing id</h2><h3 id="empty"> </h3><p>Text</p>')
    ).toEqual([{ id: 'intro', text: 'Introduction', level: 1 }])
  })
})

describe('nestOutline', () => {
  it('nests skipped heading levels and classifies prefixed headings', () => {
    const outline = nestOutline([
      { id: 'top', text: 'Top', level: 1 },
      { id: 'requirement', text: 'Requirement: Keep data', level: 3 },
      { id: 'scenario', text: 'scenario: User opens file', level: 4 },
      { id: 'next', text: 'Next', level: 2 }
    ])

    expect(outline).toEqual([
      {
        id: 'top', text: 'Top', level: 1, kind: 'heading', children: [
          {
            id: 'requirement', text: 'Keep data', level: 3, kind: 'requirement', children: [
              { id: 'scenario', text: 'User opens file', level: 4, kind: 'scenario', children: [] }
            ]
          },
          { id: 'next', text: 'Next', level: 2, kind: 'heading', children: [] }
        ]
      }
    ])
  })

  it('keeps original text when a semantic prefix has no label', () => {
    expect(nestOutline([{ id: 'requirement', text: 'Requirement: ', level: 1 }])).toEqual([
      { id: 'requirement', text: 'Requirement: ', level: 1, kind: 'requirement', children: [] }
    ])
  })
})
