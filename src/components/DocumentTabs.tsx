import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconX } from './icons'

export interface DocumentTabItem {
  id: string
  title: string
  dirty: boolean
}

interface DocumentTabsProps {
  tabs: DocumentTabItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseToRight: (id: string) => void
  onCloseSaved: () => void
  onCloseAll: () => void
}

interface MenuState {
  id: string
  x: number
  y: number
}

export function DocumentTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseSaved,
  onCloseAll
}: DocumentTabsProps): JSX.Element | null {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<MenuState | null>(null)

  // Dismiss the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (tabs.length === 0) return null

  const menuIndex = menu ? tabs.findIndex((tab) => tab.id === menu.id) : -1
  const hasOthers = tabs.length > 1
  const hasRight = menuIndex >= 0 && menuIndex < tabs.length - 1
  const hasSaved = tabs.some((tab) => !tab.dirty)

  const run = (action: () => void): void => {
    setMenu(null)
    action()
  }

  return (
    <div className="document-tabs" role="tablist" aria-label={t('tabs.documents')}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`document-tab ${activeId === tab.id ? 'document-tab--active' : ''}`}
          role="tab"
          aria-selected={activeId === tab.id}
          onMouseDown={(event) => {
            if (event.button === 1) {
              event.preventDefault()
              onClose(tab.id)
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu({ id: tab.id, x: event.clientX, y: event.clientY })
          }}
        >
          <button className="document-tab__label" type="button" onClick={() => onSelect(tab.id)} title={tab.title}>
            <span className="document-tab__dirty" aria-hidden="true">
              {tab.dirty ? '•' : ''}
            </span>
            <span className="document-tab__title">{tab.title}</span>
          </button>
          <button
            className="document-tab__close"
            type="button"
            onClick={() => onClose(tab.id)}
            title={t('tabs.close')}
            aria-label={t('tabs.close')}
          >
            <IconX width={14} height={14} />
          </button>
        </div>
      ))}

      {menu && (
        <div
          className="tab-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button className="tab-menu__item" type="button" role="menuitem" onClick={() => run(() => onClose(menu.id))}>
            {t('tabs.closeThis')}
          </button>
          <button
            className="tab-menu__item"
            type="button"
            role="menuitem"
            disabled={!hasOthers}
            onClick={() => run(() => onCloseOthers(menu.id))}
          >
            {t('tabs.closeOthers')}
          </button>
          <button
            className="tab-menu__item"
            type="button"
            role="menuitem"
            disabled={!hasRight}
            onClick={() => run(() => onCloseToRight(menu.id))}
          >
            {t('tabs.closeRight')}
          </button>
          <div className="tab-menu__sep" role="separator" />
          <button
            className="tab-menu__item"
            type="button"
            role="menuitem"
            disabled={!hasSaved}
            onClick={() => run(onCloseSaved)}
          >
            {t('tabs.closeSaved')}
          </button>
          <button className="tab-menu__item" type="button" role="menuitem" onClick={() => run(onCloseAll)}>
            {t('tabs.closeAll')}
          </button>
        </div>
      )}
    </div>
  )
}
