function selectionElement(node: Node | null): Element | null {
  return node instanceof Element ? node : node?.parentElement ?? null
}

/** True when current selection starts, ends or crosses a preview code block. */
export function selectionTouchesCodeBlock(root: HTMLElement, selection: Selection | null): boolean {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false
  if (
    selectionElement(selection.anchorNode)?.closest('.code-block') ||
    selectionElement(selection.focusNode)?.closest('.code-block')
  ) return true

  const range = selection.getRangeAt(0)
  return Array.from(root.querySelectorAll('.code-block')).some((block) => range.intersectsNode(block))
}
