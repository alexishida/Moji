// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { findPreviewHeadingTarget, getActivePreviewHeadingId, scrollPreviewHeadingIntoView } from './previewScroll'

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

  it('resolves encoded anchors only inside current preview', () => {
    const root = document.createElement('div')
    const heading = document.createElement('h2')
    const outside = document.createElement('h2')
    heading.id = 'user-content-requirement%3A-layout'
    outside.id = 'outside'
    root.append(heading)
    document.body.append(root, outside)

    expect(findPreviewHeadingTarget(root, '#user-content-requirement%253A-layout')).toBe(heading)
    expect(findPreviewHeadingTarget(root, '#user-content-requirement%3A-layout')).toBe(heading)
    expect(findPreviewHeadingTarget(root, '#outside')).toBeNull()
    expect(findPreviewHeadingTarget(root, '#%E0%A4%A')).toBeNull()
    root.remove()
    outside.remove()
  })

  it('keeps scroll-spy order with skipped layout blocks between headings', () => {
    const scroller = document.createElement('div')
    const first = document.createElement('h1')
    const skippedTable = document.createElement('table')
    const second = document.createElement('h2')
    skippedTable.style.contentVisibility = 'auto'
    first.id = 'first'
    second.id = 'second'
    scroller.append(first, skippedTable, second)
    setMetric(scroller, 'scrollHeight', 2000)
    setMetric(scroller, 'clientHeight', 500)
    setMetric(scroller, 'scrollTop', 700)
    setTop(scroller, 0)
    setTop(first, -680)
    setTop(second, 40)

    expect(getActivePreviewHeadingId(scroller, [first, second])).toBe('second')
  })
})
