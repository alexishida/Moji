function getPreviewScroller(target: Element | null): HTMLElement | null {
  return target?.closest('.pane') as HTMLElement | null
}

export function getHeadingTopInScroller(scroller: HTMLElement, heading: HTMLElement): number {
  const scrollerRect = scroller.getBoundingClientRect()
  const headingRect = heading.getBoundingClientRect()
  return headingRect.top - scrollerRect.top + scroller.scrollTop
}

export function previewFragmentIdentifiers(href: string): string[] {
  if (!href.startsWith('#') || href.length < 2) return []
  const fragment = href.slice(1)
  try {
    return [...new Set([fragment, decodeURIComponent(fragment)])]
  } catch {
    return [fragment]
  }
}

export function findPreviewHeadingTarget(root: ParentNode, href: string): HTMLElement | null {
  const identifiers = previewFragmentIdentifiers(href)
  if (identifiers.length === 0) return null
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[id], a[name]'))
  for (const identifier of identifiers) {
    // Resolve within this preview, even when another preview has the same ID.
    const target = targets.find((element) => (
      element.id === identifier || (element.tagName === 'A' && element.getAttribute('name') === identifier)
    ))
    if (target) return target
  }
  return null
}

export function scrollPreviewHeadingIntoView(target: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
  const scroller = getPreviewScroller(target)
  if (!scroller) {
    target.scrollIntoView({ behavior, block: 'start' })
    return
  }

  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  const nextScrollTop = Math.min(getHeadingTopInScroller(scroller, target), maxScrollTop)
  scroller.scrollTo({ top: nextScrollTop, behavior })
}

export function getActivePreviewHeadingId(
  scroller: HTMLElement,
  headings: HTMLElement[],
  offset = 88
): string | null {
  if (headings.length === 0) return null

  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  if (maxScrollTop - scroller.scrollTop <= 2) return headings[headings.length - 1].id

  const probeTop = scroller.getBoundingClientRect().top + offset
  // Headings follow document order. Read only O(log n) positions, rather than
  // measuring every preceding heading on each frame near the end of a document.
  let low = 0
  let high = headings.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (headings[middle].getBoundingClientRect().top <= probeTop) low = middle + 1
    else high = middle
  }

  return headings[Math.max(0, low - 1)].id
}
