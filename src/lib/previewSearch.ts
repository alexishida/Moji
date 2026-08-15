interface TextSegment {
  node: Text
  start: number
  end: number
}

interface TextGroup {
  container: Element
  text: string
  segments: TextSegment[]
}

interface NodeHighlight {
  from: number
  to: number
  matchIndex: number
}

const SEARCH_BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,td,th,pre,blockquote,dt,dd,figcaption'
const SEARCH_EXCLUDED_SELECTOR = 'style,script,svg,button'

/** Restores preview text previously wrapped by search highlights. */
export function clearPreviewSearchHighlights(root: HTMLElement): void {
  const parents = new Set<Node>()
  root.querySelectorAll('.search-highlight').forEach((highlight) => {
    const parent = highlight.parentNode
    if (!parent) return
    parents.add(parent)
    parent.replaceChild(document.createTextNode(highlight.textContent ?? ''), highlight)
  })
  parents.forEach((parent) => parent.normalize())
}

/** Highlights visible matches, including phrases split by inline Markdown elements. */
export function highlightPreviewSearchMatches(
  root: HTMLElement,
  rawTerm: string,
  maxMatches: number
): number {
  clearPreviewSearchHighlights(root)
  const term = rawTerm.trim().toLowerCase()
  if (!term || maxMatches <= 0) return 0

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const groups: TextGroup[] = []
  let currentGroup: TextGroup | null = null

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const parent = node.parentElement
    if (!node.textContent || !parent || parent.closest(SEARCH_EXCLUDED_SELECTOR)) {
      currentGroup = null
      continue
    }

    const container = parent.closest(SEARCH_BLOCK_SELECTOR) ?? root
    if (!currentGroup || currentGroup.container !== container) {
      currentGroup = { container, text: '', segments: [] }
      groups.push(currentGroup)
    }

    const start = currentGroup.text.length
    currentGroup.text += node.textContent
    currentGroup.segments.push({ node, start, end: currentGroup.text.length })
  }

  const highlightsByNode = new Map<Text, NodeHighlight[]>()
  let matchCount = 0

  for (const group of groups) {
    const lower = group.text.toLowerCase()
    for (
      let index = lower.indexOf(term);
      index >= 0 && matchCount < maxMatches;
      index = lower.indexOf(term, index + term.length)
    ) {
      const matchEnd = index + term.length
      for (const segment of group.segments) {
        if (segment.end <= index) continue
        if (segment.start >= matchEnd) break

        const highlights = highlightsByNode.get(segment.node) ?? []
        highlights.push({
          from: Math.max(index, segment.start) - segment.start,
          to: Math.min(matchEnd, segment.end) - segment.start,
          matchIndex: matchCount
        })
        highlightsByNode.set(segment.node, highlights)
      }
      matchCount += 1
    }
    if (matchCount >= maxMatches) break
  }

  highlightsByNode.forEach((highlights, node) => {
    const text = node.textContent ?? ''
    const fragment = document.createDocumentFragment()
    let offset = 0

    for (const highlight of highlights) {
      if (highlight.from > offset) fragment.append(text.slice(offset, highlight.from))
      const mark = document.createElement('mark')
      mark.className = 'search-highlight'
      mark.dataset.searchIndex = String(highlight.matchIndex)
      mark.textContent = text.slice(highlight.from, highlight.to)
      fragment.append(mark)
      offset = highlight.to
    }

    if (offset < text.length) fragment.append(text.slice(offset))
    node.parentNode?.replaceChild(fragment, node)
  })

  return matchCount
}

/** Marks and returns first segment of active visible match. */
export function activatePreviewSearchMatch(root: HTMLElement, activeIndex: number | null): HTMLElement | null {
  const highlights = Array.from(root.querySelectorAll<HTMLElement>('.search-highlight'))
  if (highlights.length === 0) return null

  const lastMatchIndex = Number(highlights[highlights.length - 1].dataset.searchIndex ?? 0)
  const searchIndex = Math.min(activeIndex ?? 0, lastMatchIndex)
  let activeMatch: HTMLElement | null = null

  for (const highlight of highlights) {
    const active = Number(highlight.dataset.searchIndex) === searchIndex
    highlight.classList.toggle('search-highlight--active', active)
    if (active && !activeMatch) activeMatch = highlight
  }

  return activeMatch
}
