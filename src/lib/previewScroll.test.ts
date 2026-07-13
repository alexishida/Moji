// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { getActivePreviewHeadingId, scrollPreviewHeadingIntoView } from './previewScroll'

function setMetric(target: HTMLElement, name: string, value: number): void {
  Object.defineProperty(target, name, { configurable: true, value })
}

function setTop(target: HTMLElement, top: number): void {
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect)
}

describe('preview scrolling', () => {
  it('selects last heading at bottom and heading at scroll probe otherwise', () => {
    const scroller = document.createElement('div')
    const first = document.createElement('h1')
    const second = document.createElement('h2')
    first.id = 'first'
    second.id = 'second'
    scroller.append(first, second)
    setMetric(scroller, 'scrollHeight', 1000)
    setMetric(scroller, 'clientHeight', 400)
    setMetric(scroller, 'scrollTop', 200)
    setTop(scroller, 0)
    setTop(first, 20)
    setTop(second, 80)

    expect(getActivePreviewHeadingId(scroller, [first, second], 88)).toBe('second')

    setMetric(scroller, 'scrollTop', 599)
    expect(getActivePreviewHeadingId(scroller, [first, second])).toBe('second')
  })

  it('scrolls within pane without exceeding its maximum position', () => {
    const pane = document.createElement('div')
    pane.className = 'pane'
    const heading = document.createElement('h2')
    pane.appendChild(heading)
    setMetric(pane, 'scrollHeight', 600)
    setMetric(pane, 'clientHeight', 200)
    setMetric(pane, 'scrollTop', 100)
    setTop(pane, 20)
    setTop(heading, 500)
    const scrollTo = vi.fn()
    pane.scrollTo = scrollTo

    scrollPreviewHeadingIntoView(heading, 'auto')

    expect(scrollTo).toHaveBeenCalledWith({ top: 400, behavior: 'auto' })
  })

  it('uses browser scrolling when heading is outside a preview pane', () => {
    const heading = document.createElement('h2')
    const scrollIntoView = vi.fn()
    heading.scrollIntoView = scrollIntoView

    scrollPreviewHeadingIntoView(heading, 'auto')

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })

  it('returns no active heading for an empty outline', () => {
    const scroller = document.createElement('div')

    expect(getActivePreviewHeadingId(scroller, [])).toBeNull()
  })

  it('keeps first heading active before scroll reaches following headings', () => {
    const scroller = document.createElement('div')
    const first = document.createElement('h1')
    const second = document.createElement('h2')
    first.id = 'first'
    second.id = 'second'
    setMetric(scroller, 'scrollHeight', 1000)
    setMetric(scroller, 'clientHeight', 400)
    setMetric(scroller, 'scrollTop', 0)
    setTop(scroller, 0)
    setTop(first, 20)
    setTop(second, 300)

    expect(getActivePreviewHeadingId(scroller, [first, second])).toBe('first')
  })
})
