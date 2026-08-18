import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import type { ReactElement } from 'react'
import '../i18n'

/**
 * Minimal React harness for component and hook tests.
 *
 * Small on purpose: it exists so tests can drive real components without pulling in a testing
 * library, and it loads the real i18n bundle so assertions read the labels users see — a missing
 * translation key fails the test instead of silently rendering the key.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

export interface Rendered {
  container: HTMLElement
  rerender: (element: ReactElement) => void
  unmount: () => void
}

export function renderComponent(element: ReactElement): Rendered {
  const container = document.createElement('div')
  document.body.append(container)
  let root: Root | null = createRoot(container)
  act(() => root?.render(element))

  return {
    container,
    rerender: (next) => act(() => root?.render(next)),
    unmount: () => {
      act(() => root?.unmount())
      root = null
      container.remove()
    }
  }
}

export interface RenderedHook<T> {
  /** Latest value the hook returned. */
  current: () => T
  act: (run: () => void) => void
  rerender: () => void
  unmount: () => void
}

export function renderHook<T>(useHook: () => T): RenderedHook<T> {
  let value: T
  function Probe(): null {
    value = useHook()
    return null
  }

  const rendered = renderComponent(<Probe />)
  return {
    current: () => value,
    act: (run) => act(run),
    rerender: () => rendered.rerender(<Probe />),
    unmount: rendered.unmount
  }
}

/** Dispatches a real bubbling event, so React's delegated listeners run as they do in the app. */
export function fire(target: Element | Window, type: string, init: EventInit & Record<string, unknown> = {}): void {
  const EventConstructor = type.startsWith('key')
    ? KeyboardEvent
    : type.startsWith('mouse') || type === 'click' || type === 'contextmenu'
      ? MouseEvent
      : Event
  act(() => {
    target.dispatchEvent(new EventConstructor(type, { bubbles: true, cancelable: true, ...init }))
  })
}

export function click(target: Element): void {
  fire(target, 'click', { button: 0 })
}

export const text = (element: Element | null): string => element?.textContent?.trim() ?? ''

export function queryAll(container: HTMLElement, selector: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(selector))
}

export function get(container: HTMLElement, selector: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(selector)
  if (!found) throw new Error(`No element matched ${selector}`)
  return found
}
