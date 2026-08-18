// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentTabs, type DocumentTabItem } from './DocumentTabs'
import { click, fire, get, queryAll, renderComponent, text } from '../test/harness'

const tab = (id: string, title: string, dirty = false): DocumentTabItem => ({ id, title, dirty })

function setup(tabs: DocumentTabItem[], activeId: string | null = tabs[0]?.id ?? null) {
  const handlers = {
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseToRight: vi.fn(),
    onCloseSaved: vi.fn(),
    onCloseAll: vi.fn()
  }
  const rendered = renderComponent(<DocumentTabs tabs={tabs} activeId={activeId} {...handlers} />)
  return { ...rendered, handlers, tabs }
}

const openMenuOn = (container: HTMLElement, index: number): void => {
  fire(queryAll(container, '.document-tab')[index], 'contextmenu', { clientX: 40, clientY: 60 })
}

const isDisabled = (element: HTMLElement): boolean => (element as HTMLButtonElement).disabled

const menuItem = (container: HTMLElement, label: string): HTMLElement => {
  const found = queryAll(container, '.tab-menu__item').find((item) => text(item) === label)
  if (!found) throw new Error(`No menu item labelled ${label}`)
  return found
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('DocumentTabs', () => {
  it('renders nothing when there are no documents', () => {
    const { container } = setup([])

    expect(container.innerHTML).toBe('')
  })

  it('renders one tab per document and marks the active one', () => {
    const { container } = setup([tab('a', 'One'), tab('b', 'Two')], 'b')

    expect(queryAll(container, '.document-tab__title').map(text)).toEqual(['One', 'Two'])
    expect(queryAll(container, '[role="tab"]').map((el) => el.getAttribute('aria-selected')))
      .toEqual(['false', 'true'])
  })

  it('shows the unsaved marker only on dirty documents', () => {
    const { container } = setup([tab('a', 'Saved'), tab('b', 'Unsaved', true)])

    expect(queryAll(container, '.document-tab__dirty').map(text)).toEqual(['', '•'])
  })

  it('selects a document when its label is clicked', () => {
    const { container, handlers } = setup([tab('a', 'One'), tab('b', 'Two')])

    click(queryAll(container, '.document-tab__label')[1])

    expect(handlers.onSelect).toHaveBeenCalledWith('b')
  })

  it('closes a document from its close button', () => {
    const { container, handlers } = setup([tab('a', 'One'), tab('b', 'Two')])

    click(queryAll(container, '.document-tab__close')[0])

    expect(handlers.onClose).toHaveBeenCalledWith('a')
  })

  it('closes a document on middle click', () => {
    const { container, handlers } = setup([tab('a', 'One'), tab('b', 'Two')])

    fire(queryAll(container, '.document-tab')[1], 'mousedown', { button: 1 })

    expect(handlers.onClose).toHaveBeenCalledWith('b')
  })

  it('ignores a left mousedown on the tab body', () => {
    const { container, handlers } = setup([tab('a', 'One')])

    fire(queryAll(container, '.document-tab')[0], 'mousedown', { button: 0 })

    expect(handlers.onClose).not.toHaveBeenCalled()
  })

  describe('context menu', () => {
    it('opens at the pointer position', () => {
      const { container } = setup([tab('a', 'One')])

      openMenuOn(container, 0)

      const menu = get(container, '.tab-menu')
      expect(menu.style.left).toBe('40px')
      expect(menu.style.top).toBe('60px')
    })

    it('disables actions that have no target for a single saved document', () => {
      const { container } = setup([tab('a', 'Only')])

      openMenuOn(container, 0)

      expect(isDisabled(menuItem(container, 'Close Others'))).toBe(true)
      expect(isDisabled(menuItem(container, 'Close to the Right'))).toBe(true)
      expect(isDisabled(menuItem(container, 'Close Saved'))).toBe(false)
      expect(isDisabled(menuItem(container, 'Close All'))).toBe(false)
    })

    it('enables "close to the right" only when a document follows the clicked one', () => {
      const { container } = setup([tab('a', 'One'), tab('b', 'Two'), tab('c', 'Three')])

      openMenuOn(container, 0)
      expect(isDisabled(menuItem(container, 'Close to the Right'))).toBe(false)

      fire(window, 'mousedown')
      openMenuOn(container, 2)
      expect(isDisabled(menuItem(container, 'Close to the Right'))).toBe(true)
    })

    it('disables "close saved" when every document has unsaved changes', () => {
      const { container } = setup([tab('a', 'One', true), tab('b', 'Two', true)])

      openMenuOn(container, 0)

      expect(isDisabled(menuItem(container, 'Close Saved'))).toBe(true)
    })

    it.each([
      ['Close', 'onClose', 'b'],
      ['Close Others', 'onCloseOthers', 'b'],
      ['Close to the Right', 'onCloseToRight', 'b']
    ])('runs %s for the document the menu was opened on', (label, handler, expected) => {
      const { container, handlers } = setup([tab('a', 'One'), tab('b', 'Two'), tab('c', 'Three')])

      openMenuOn(container, 1)
      click(menuItem(container, label))

      expect(handlers[handler as keyof typeof handlers]).toHaveBeenCalledWith(expected)
      expect(container.querySelector('.tab-menu')).toBeNull()
    })

    it.each([
      ['Close Saved', 'onCloseSaved'],
      ['Close All', 'onCloseAll']
    ])('runs %s for the whole workspace', (label, handler) => {
      const { container, handlers } = setup([tab('a', 'One'), tab('b', 'Two', true)])

      openMenuOn(container, 0)
      click(menuItem(container, label))

      expect(handlers[handler as keyof typeof handlers]).toHaveBeenCalledWith()
    })

    it.each([
      ['an outside mousedown', () => fire(window, 'mousedown')],
      ['Escape', () => fire(window, 'keydown', { key: 'Escape' })],
      ['a window resize', () => fire(window, 'resize')],
      ['the window losing focus', () => fire(window, 'blur')]
    ])('dismisses on %s', (_case, dismiss) => {
      const { container } = setup([tab('a', 'One')])
      openMenuOn(container, 0)
      expect(container.querySelector('.tab-menu')).not.toBeNull()

      dismiss()

      expect(container.querySelector('.tab-menu')).toBeNull()
    })

    it('stays open when the mousedown lands inside the menu', () => {
      const { container } = setup([tab('a', 'One')])
      openMenuOn(container, 0)

      fire(get(container, '.tab-menu'), 'mousedown', { button: 0 })

      expect(container.querySelector('.tab-menu')).not.toBeNull()
    })

    it('stops listening for dismissals once unmounted', () => {
      const remove = vi.spyOn(window, 'removeEventListener')
      const { container, unmount } = setup([tab('a', 'One')])
      openMenuOn(container, 0)

      unmount()

      expect(remove.mock.calls.map(([type]) => type))
        .toEqual(expect.arrayContaining(['mousedown', 'resize', 'blur', 'keydown']))
      remove.mockRestore()
    })
  })

  describe('memoization', () => {
    // The custom comparator can only be wrong in one direction that users notice: skipping a
    // render that should have happened.
    it('still updates when a title changes', () => {
      const { container, rerender, handlers } = setup([tab('a', 'One')])

      rerender(<DocumentTabs tabs={[tab('a', 'Renamed')]} activeId="a" {...handlers} />)

      expect(queryAll(container, '.document-tab__title').map(text)).toEqual(['Renamed'])
    })

    it('still updates when a document becomes dirty', () => {
      const { container, rerender, handlers } = setup([tab('a', 'One')])

      rerender(<DocumentTabs tabs={[tab('a', 'One', true)]} activeId="a" {...handlers} />)

      expect(queryAll(container, '.document-tab__dirty').map(text)).toEqual(['•'])
    })

    it('still updates when the active document changes', () => {
      const { container, rerender, handlers } = setup([tab('a', 'One'), tab('b', 'Two')], 'a')

      rerender(<DocumentTabs tabs={[tab('a', 'One'), tab('b', 'Two')]} activeId="b" {...handlers} />)

      expect(queryAll(container, '[role="tab"]').map((el) => el.getAttribute('aria-selected')))
        .toEqual(['false', 'true'])
    })

    it('still updates when a document is added', () => {
      const { container, rerender, handlers } = setup([tab('a', 'One')])

      rerender(<DocumentTabs tabs={[tab('a', 'One'), tab('b', 'Two')]} activeId="a" {...handlers} />)

      expect(queryAll(container, '.document-tab__title').map(text)).toEqual(['One', 'Two'])
    })
  })
})
