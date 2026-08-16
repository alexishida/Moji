import { describe, expect, it } from 'vitest'
import type { MarkdownRenderBlock } from './markdown'
import {
  buildVirtualOffsets,
  buildVirtualSearchIndex,
  calculateVirtualRange,
  findVirtualBlockForHeading,
  findVirtualBlockForSearch,
  getVirtualActiveHeadingId
} from './previewVirtualization'

function block(id: string, text: string, height: number, headingIds: string[] = []): MarkdownRenderBlock {
  return { id, html: `<p>${text}</p>`, text, headingIds, estimatedHeight: height }
}

const blocks = [
  block('a', 'alpha', 100, ['first']),
  block('b', 'needle beta needle', 200),
  block('c', 'gamma needle', 300, ['third']),
  block('d', 'delta', 400)
]

describe('preview virtualization', () => {
  it('builds offsets from estimates and measured heights', () => {
    expect(buildVirtualOffsets(blocks, new Map([[1, 250]]))).toEqual([0, 100, 350, 650, 1050])
  })

  it('renders viewport with overscan and can force an offscreen search block', () => {
    const offsets = buildVirtualOffsets(blocks, new Map())
    expect(calculateVirtualRange(offsets, 120, 150, 50)).toMatchObject({ start: 0, end: 3 })
    expect(calculateVirtualRange(offsets, 0, 100, 0, 3)).toMatchObject({ start: 3, end: 4 })
  })

  it('indexes search and headings in blocks that are not mounted', () => {
    const search = buildVirtualSearchIndex(blocks, 'needle', 2_000)
    expect(search.total).toBe(3)
    expect(findVirtualBlockForSearch(search, 2)).toBe(2)
    expect(findVirtualBlockForHeading(blocks, 'third')).toBe(2)
  })

  it('derives active heading from virtual offsets', () => {
    const offsets = buildVirtualOffsets(blocks, new Map())
    expect(getVirtualActiveHeadingId(blocks, offsets, 250, 0)).toBe('first')
    expect(getVirtualActiveHeadingId(blocks, offsets, 350, 0)).toBe('third')
  })
})
