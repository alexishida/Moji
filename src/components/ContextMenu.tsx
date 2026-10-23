import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

export interface ContextMenuAction {
  label: string
  /** Shortcut hint shown on the right, e.g. "F2" or "Ctrl+C". Display only. */
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}

export type ContextMenuItem = ContextMenuAction | 'separator'

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  label?: string
  onClose: () => void
}

const EDGE_GAP = 6

/**
 * Right-click menu shared by the explorer and the document tabs.
 *
 * Reuses `.tab-menu` styling, stays inside the window (flips left/up near an edge), closes on
 * any outside interaction, and supports arrow keys / Home / End / Enter / Escape like a native menu.
 */
export function ContextMenu({ x, y, items, label, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    const { width, height } = menu.getBoundingClientRect()
    setPosition({
      left: Math.max(EDGE_GAP, Math.min(x, window.innerWidth - width - EDGE_GAP)),
      top: Math.max(EDGE_GAP, y + height > window.innerHeight - EDGE_GAP ? y - height : y)
    })
    menu.querySelector<HTMLButtonElement>('.tab-menu__item:not(:disabled)')?.focus()
  }, [x, y])

  useEffect(() => {
    const close = (): void => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('wheel', close, { passive: true })
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('wheel', close)
    }
  }, [onClose])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    // The menu owns the keyboard while open: app shortcuts must not fire underneath it.
    event.stopPropagation()
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('.tab-menu__item:not(:disabled)') ?? [])
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      buttons[(index + 1) % buttons.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      buttons[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      buttons[buttons.length - 1]?.focus()
    }
  }

  // Drop separators that would sit at an edge or next to another separator.
  const visible: ContextMenuItem[] = []
  for (const item of items) {
    if (item === 'separator' && (visible.length === 0 || visible[visible.length - 1] === 'separator')) continue
    visible.push(item)
  }
  if (visible[visible.length - 1] === 'separator') visible.pop()

  return (
    <div
      ref={ref}
      className="tab-menu context-menu"
      role="menu"
      aria-label={label}
      style={position}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={onKeyDown}
    >
      {visible.map((item, index) =>
        item === 'separator' ? (
          <div key={`sep-${index}`} className="tab-menu__sep" role="separator" />
        ) : (
          <button
            key={`${item.label}-${index}`}
            className={`tab-menu__item ${item.danger ? 'tab-menu__item--danger' : ''}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            <span className="tab-menu__label">{item.label}</span>
            {item.shortcut && <span className="tab-menu__shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  )
}

/** VS Code's wording for the OS file manager on each platform. */
export function revealInOsLabelKey(): 'explorer.revealInFinder' | 'explorer.revealInFileExplorer' | 'explorer.openContainingFolder' {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/Mac/i.test(agent)) return 'explorer.revealInFinder'
  if (/Windows/i.test(agent)) return 'explorer.revealInFileExplorer'
  return 'explorer.openContainingFolder'
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)

/** Renders a shortcut hint for the current platform ("Ctrl+C" vs "⌘C"). */
export function shortcutLabel(...keys: string[]): string {
  if (!IS_MAC) return keys.join('+')
  return keys
    .map((key) => ({ Ctrl: '⌘', Shift: '⇧', Alt: '⌥', Delete: '⌘⌫' }[key] ?? key))
    .join('')
}
