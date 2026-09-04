function getPreviewScroller(target: Element | null): HTMLElement | null {
  return target?.closest('.pane') as HTMLElement | null
}

export function getHeadingTopInScroller(scroller: HTMLElement, heading: HTMLElement): number {
  const scrollerRect = scroller.getBoundingClientRect()
  const headingRect = heading.getBoundingClientRect()
  return headingRect.top - scrollerRect.top + scroller.scrollTop
}

export function findPreviewHeadingTarget(root: HTMLElement, href: string): HTMLElement | null {
  if (!href.startsWith('#') || href.length < 2) return null
  try {
    const fragment = href.slice(1)
    const identifiers = [fragment, decodeURIComponent(fragment)]
    for (const identifier of identifiers) {
      // Do not use document.getElementById here. A preview can coexist with another
      // preview (during a view transition) or a diagram SVG with an unrelated matching
      // id. getElementById returns only that first global match, so the old containment
      // check discarded the actual target in this preview.
      const target = Array.from(root.querySelectorAll<HTMLElement>('[id], a[name]')).find((element) => (
        element.id === identifier || (element.tagName === 'A' && element.getAttribute('name') === identifier)
      ))
      if (target) return target
    }
    return null
  } catch {
    return null
  }
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

  const probeTop = scroller.scrollTop + offset
  let current = headings[0].id

  for (const heading of headings) {
    if (getHeadingTopInScroller(scroller, heading) <= probeTop) current = heading.id
    else break
  }

  return current
}
