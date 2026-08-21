import type { MarkdownRenderBlock } from './markdown'
import { countLiteralMatches } from './search'

export interface VirtualRange {
  start: number
  end: number
  top: number
  bottom: number
  totalHeight: number
}

export interface VirtualSearchIndex {
  total: number
  counts: number[]
  offsets: number[]
}

export function buildVirtualOffsets(blocks: MarkdownRenderBlock[], measuredHeights: ReadonlyMap<number, number>): number[] {
  const offsets = [0]
  for (let index = 0; index < blocks.length; index += 1) {
    offsets.push(offsets[index] + (measuredHeights.get(index) ?? blocks[index].estimatedHeight))
  }
  return offsets
}

function blockAtOffset(offsets: number[], offset: number): number {
  let low = 0
  let high = Math.max(0, offsets.length - 2)
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (offsets[middle + 1] <= offset) low = middle + 1
    else high = middle
  }
  return low
}

export function calculateVirtualRange(
  offsets: number[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
  forcedBlockIndex: number | null = null
): VirtualRange {
  const blockCount = Math.max(0, offsets.length - 1)
  if (blockCount === 0) return { start: 0, end: 0, top: 0, bottom: 0, totalHeight: 0 }
  let start = blockAtOffset(offsets, Math.max(0, scrollTop - overscan))
  let end = Math.min(blockCount, blockAtOffset(offsets, scrollTop + viewportHeight + overscan) + 1)
  if (forcedBlockIndex !== null && forcedBlockIndex >= 0 && forcedBlockIndex < blockCount) {
    if (forcedBlockIndex < start || forcedBlockIndex >= end) {
      start = forcedBlockIndex
      end = forcedBlockIndex + 1
    }
  }
  const totalHeight = offsets[blockCount]
  return { start, end, top: offsets[start], bottom: totalHeight - offsets[end], totalHeight }
}

export function findVirtualBlockForHeading(blocks: MarkdownRenderBlock[], headingId: string): number | null {
  const index = blocks.findIndex((block) => block.headingIds.includes(headingId))
  return index >= 0 ? index : null
}

export function buildVirtualSearchIndex(
  blocks: MarkdownRenderBlock[],
  term: string,
  maxMatches: number
): VirtualSearchIndex {
  const counts: number[] = []
  const offsets: number[] = []
  let total = 0
  for (const block of blocks) {
    offsets.push(total)
    const count = Math.min(countLiteralMatches(block.text, term.trim()), Math.max(0, maxMatches - total))
    counts.push(count)
    total += count
  }
  return { total, counts, offsets }
}

export function findVirtualBlockForSearch(index: VirtualSearchIndex, activeSearchIndex: number | null): number | null {
  if (index.total === 0) return null
  const target = Math.min(activeSearchIndex ?? 0, index.total - 1)
  for (let blockIndex = 0; blockIndex < index.counts.length; blockIndex += 1) {
    if (target < index.offsets[blockIndex] + index.counts[blockIndex]) return blockIndex
  }
  return null
}

export function getVirtualActiveHeadingId(
  blocks: MarkdownRenderBlock[],
  offsets: number[],
  scrollTop: number,
  offset = 88
): string | null {
  const probe = scrollTop + offset
  // `blockAtOffset` jumps straight to the block at `probe` in O(log n) instead of walking every
  // block from the start on every scroll event; only the backward scan for the nearest heading
  // (typically short — headings are not one per block) still runs linearly.
  const startIndex = Math.min(blockAtOffset(offsets, probe), blocks.length - 1)
  for (let index = startIndex; index >= 0; index -= 1) {
    const headings = blocks[index].headingIds
    if (headings.length > 0) return headings[headings.length - 1]
  }
  return blocks.find((block) => block.headingIds.length > 0)?.headingIds[0] ?? null
}
