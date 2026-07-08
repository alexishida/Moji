export interface OutlineItem {
  id: string
  text: string
  level: number
}

/**
 * Extract a heading outline from already-rendered, sanitized Markdown HTML.
 * Reads ids straight off the anchored headings so outline links resolve to the
 * exact same targets the preview scrolls to (including uniqueness suffixes).
 */
export function buildOutline(html: string): OutlineItem[] {
  if (!html) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const items: OutlineItem[] = []
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
    const id = el.getAttribute('id')
    const text = (el.textContent ?? '').trim()
    if (!id || !text) return
    items.push({ id, text, level: Number(el.tagName[1]) })
  })
  return items
}
