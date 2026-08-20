/**
 * Scroll mapping between the source editor and the live preview shown beside it.
 *
 * Headings are the only landmarks both sides share: the renderer reports the source line of
 * every heading, and the preview keeps the matching elements in the DOM. Between two headings
 * the position is interpolated linearly by source line, which tracks the section the caret is
 * in without needing per-line markers in the rendered HTML.
 */

export interface SplitAnchor {
  /** Zero-based source line of the heading. */
  line: number
  /** Offset of the heading inside the preview scroller. */
  top: number
}

export interface PreviewHeadingOffset {
  id: string
  top: number
}

/** Pair rendered headings with their source lines, keeping the list ordered by line. */
export function buildSplitAnchors(
  headings: readonly PreviewHeadingOffset[],
  headingLines: ReadonlyMap<string, number>
): SplitAnchor[] {
  const anchors: SplitAnchor[] = []
  for (const heading of headings) {
    const line = headingLines.get(heading.id)
    if (line === undefined) continue
    anchors.push({ line, top: heading.top })
  }
  return anchors.sort((a, b) => a.line - b.line)
}

/** Heading closest above `line`, used when the preview is virtualized and offsets are unknown. */
export function headingIdForLine(line: number, headingLines: ReadonlyMap<string, number>): string | null {
  let bestId: string | null = null
  let bestLine = -1
  for (const [id, headingLine] of headingLines) {
    if (headingLine <= line && headingLine > bestLine) {
      bestId = id
      bestLine = headingLine
    }
  }
  return bestId
}

export interface PreviewScrollGeometry {
  /** Total scrollable content height of the preview. */
  contentHeight: number
  /** Largest valid `scrollTop` of the preview scroller. */
  maxScrollTop: number
  /** Line count of the document being edited. */
  totalLines: number
}

/**
 * Preview `scrollTop` that lines up with `line` in the editor.
 *
 * Without headings the mapping degrades to a proportional one, which is still better than
 * leaving the preview where it was.
 */
export function previewTopForEditorLine(
  line: number,
  anchors: readonly SplitAnchor[],
  geometry: PreviewScrollGeometry
): number {
  const { contentHeight, maxScrollTop, totalLines } = geometry
  if (maxScrollTop <= 0) return 0

  const lines = Math.max(1, totalLines)
  const target = Math.min(Math.max(0, line), lines)

  // The top of the source is the top of the preview, even when a heading opens the document:
  // anchoring on that heading would scroll its own margin out of view.
  if (target <= 0) return 0

  if (anchors.length === 0) {
    return clamp((target / lines) * maxScrollTop, maxScrollTop)
  }

  let index = -1
  for (let i = 0; i < anchors.length; i += 1) {
    if (anchors[i].line <= target) index = i
    else break
  }

  const start = index < 0 ? { line: 0, top: 0 } : anchors[index]
  const end = index + 1 < anchors.length ? anchors[index + 1] : { line: lines, top: contentHeight }
  const span = end.line - start.line
  const progress = span > 0 ? (target - start.line) / span : 0

  return clamp(start.top + (end.top - start.top) * clamp(progress, 1), maxScrollTop)
}

/**
 * Editor line that lines up with `top` in the preview: the inverse of
 * `previewTopForEditorLine`, used when the preview is the pane being scrolled.
 */
export function editorLineForPreviewTop(
  top: number,
  anchors: readonly SplitAnchor[],
  geometry: PreviewScrollGeometry
): number {
  const { contentHeight, maxScrollTop, totalLines } = geometry
  if (maxScrollTop <= 0) return 0

  const lines = Math.max(1, totalLines)
  const target = clamp(top, maxScrollTop)
  if (target <= 0) return 0

  if (anchors.length === 0) {
    return clamp((target / maxScrollTop) * lines, lines)
  }

  let index = -1
  for (let i = 0; i < anchors.length; i += 1) {
    if (anchors[i].top <= target) index = i
    else break
  }

  const start = index < 0 ? { line: 0, top: 0 } : anchors[index]
  const end = index + 1 < anchors.length ? anchors[index + 1] : { line: lines, top: contentHeight }
  const span = end.top - start.top
  const progress = span > 0 ? (target - start.top) / span : 0

  return clamp(start.line + (end.line - start.line) * clamp(progress, 1), lines)
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, value))
}
