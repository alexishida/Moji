import { describe, expect, it } from 'vitest'
import { countLiteralMatches, findLiteralMatches } from './search'

describe('literal search', () => {
  it('counts case-insensitive non-overlapping matches', () => {
    expect(countLiteralMatches('Moji moji MOJI', 'moji')).toBe(3)
    expect(countLiteralMatches('aaaa', 'aa')).toBe(2)
  })

  it('returns replacement positions only when requested', () => {
    expect(findLiteralMatches('one ONE two', 'one')).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 }
    ])
  })

  it('matches case-insensitively without normalizing the full document', () => {
    expect(findLiteralMatches('Árvore ÁRVORE árvore', 'árvore')).toEqual([
      { from: 0, to: 6 },
      { from: 7, to: 13 },
      { from: 14, to: 20 }
    ])
  })

  it('handles an empty search term', () => {
    expect(countLiteralMatches('content', '')).toBe(0)
    expect(findLiteralMatches('content', '')).toEqual([])
  })
})
