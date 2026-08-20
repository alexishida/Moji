import { describe, expect, it } from 'vitest'
import { buildSplitAnchors, editorLineForPreviewTop, headingIdForLine, previewTopForEditorLine } from './splitScroll'

const geometry = { contentHeight: 1000, maxScrollTop: 800, totalLines: 100 }

describe('buildSplitAnchors', () => {
  it('pairs rendered headings with their source lines, ordered by line', () => {
    const headingLines = new Map([['b', 40], ['a', 10]])
    const anchors = buildSplitAnchors([{ id: 'b', top: 400 }, { id: 'a', top: 100 }], headingLines)
    expect(anchors).toEqual([{ line: 10, top: 100 }, { line: 40, top: 400 }])
  })

  it('drops headings the renderer has no source line for', () => {
    const anchors = buildSplitAnchors([{ id: 'ghost', top: 50 }], new Map())
    expect(anchors).toEqual([])
  })
})

describe('headingIdForLine', () => {
  it('picks the closest heading at or above the line', () => {
    const headingLines = new Map([['a', 0], ['b', 20], ['c', 60]])
    expect(headingIdForLine(35, headingLines)).toBe('b')
    expect(headingIdForLine(60, headingLines)).toBe('c')
  })

  it('returns null when every heading is below the line', () => {
    expect(headingIdForLine(5, new Map([['a', 20]]))).toBeNull()
  })
})

describe('previewTopForEditorLine', () => {
  it('falls back to a proportional mapping without headings', () => {
    expect(previewTopForEditorLine(50, [], geometry)).toBe(400)
  })

  it('interpolates between two headings', () => {
    const anchors = [{ line: 10, top: 100 }, { line: 30, top: 500 }]
    expect(previewTopForEditorLine(20, anchors, geometry)).toBe(300)
  })

  it('interpolates from the top of the document to the first heading', () => {
    const anchors = [{ line: 20, top: 400 }]
    expect(previewTopForEditorLine(10, anchors, geometry)).toBe(200)
  })

  it('interpolates from the last heading to the end of the content', () => {
    const anchors = [{ line: 50, top: 500 }]
    expect(previewTopForEditorLine(75, anchors, geometry)).toBe(750)
  })

  it('never scrolls past the end of the preview', () => {
    const anchors = [{ line: 50, top: 500 }]
    expect(previewTopForEditorLine(100, anchors, geometry)).toBe(800)
  })

  it('keeps the top of the document at the top of the preview', () => {
    expect(previewTopForEditorLine(0, [{ line: 0, top: 32 }, { line: 40, top: 400 }], geometry)).toBe(0)
  })

  it('stays at the top when the preview does not scroll', () => {
    expect(previewTopForEditorLine(40, [], { ...geometry, maxScrollTop: 0 })).toBe(0)
  })
})

describe('editorLineForPreviewTop', () => {
  it('falls back to a proportional mapping without headings', () => {
    expect(editorLineForPreviewTop(400, [], geometry)).toBe(50)
  })

  it('interpolates between two headings', () => {
    const anchors = [{ line: 10, top: 100 }, { line: 30, top: 500 }]
    expect(editorLineForPreviewTop(300, anchors, geometry)).toBe(20)
  })

  it('interpolates from the top of the preview to the first heading', () => {
    const anchors = [{ line: 20, top: 400 }]
    expect(editorLineForPreviewTop(200, anchors, geometry)).toBe(10)
  })

  it('interpolates from the last heading to the end of the content', () => {
    const anchors = [{ line: 50, top: 500 }]
    expect(editorLineForPreviewTop(750, anchors, geometry)).toBe(75)
  })

  it('clamps a scroll beyond the end to the line shown at the bottom of the preview', () => {
    const anchors = [{ line: 50, top: 500 }]
    expect(editorLineForPreviewTop(5000, anchors, geometry)).toBe(80)
  })

  it('keeps the top of the preview at the top of the document', () => {
    expect(editorLineForPreviewTop(0, [{ line: 0, top: 32 }, { line: 40, top: 400 }], geometry)).toBe(0)
  })

  it('stays at the first line when the preview does not scroll', () => {
    expect(editorLineForPreviewTop(120, [], { ...geometry, maxScrollTop: 0 })).toBe(0)
  })

  it('round-trips the mapping used to follow the editor', () => {
    const anchors = [{ line: 10, top: 100 }, { line: 30, top: 500 }]
    const top = previewTopForEditorLine(24, anchors, geometry)
    expect(editorLineForPreviewTop(top, anchors, geometry)).toBeCloseTo(24, 6)
  })
})
