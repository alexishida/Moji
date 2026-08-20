import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Observed width of an element, in CSS pixels.
 *
 * Layout decisions that depend on the available room — such as whether the split view fits —
 * need the width of the workspace itself, not of the window: the outline sidebar and the
 * window chrome take a variable share of it.
 */
export function useElementWidth(ref: RefObject<Element | null>): number {
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    setWidth(element.getBoundingClientRect().width)
    if (typeof ResizeObserver !== 'function') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return width
}
