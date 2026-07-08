export interface OutlineItem {
  id: string
  text: string
  level: number
}

/** Semantic kind inferred from a heading prefix. Drives the icon + emphasis. */
export type OutlineKind = 'requirement' | 'scenario' | 'heading'

/** A heading nested under its parent, with prefix stripped from `text`. */
export interface OutlineNode {
  id: string
  text: string
  level: number
  kind: OutlineKind
  children: OutlineNode[]
}

const PREFIX = /^(requirement|scenario)\s*:\s*/i

/**
 * Classify a heading by an optional `Requirement:` / `Scenario:` prefix and
 * strip that prefix from the visible text (an icon carries the type instead).
 * Anything else stays a plain `heading` with its text untouched.
 */
function classify(item: OutlineItem): Omit<OutlineNode, 'children'> {
  const match = PREFIX.exec(item.text)
  if (match) {
    const kind: OutlineKind = match[1].toLowerCase() === 'requirement' ? 'requirement' : 'scenario'
    const text = item.text.slice(match[0].length).trim()
    return { id: item.id, level: item.level, kind, text: text || item.text }
  }
  return { id: item.id, level: item.level, kind: 'heading', text: item.text }
}

/**
 * Turn the flat heading list into a tree by heading level. Works for any
 * structure, including skipped levels (an h3 following an h1 nests under it).
 */
export function nestOutline(items: OutlineItem[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  for (const item of items) {
    const node: OutlineNode = { ...classify(item), children: [] }
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop()
    if (stack.length) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
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
