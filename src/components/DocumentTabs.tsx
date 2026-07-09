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
}

export function DocumentTabs({
  tabs,
  activeId,
  onSelect,
  onClose
}: DocumentTabsProps): JSX.Element | null {
  const { t } = useTranslation()

  if (tabs.length === 0) return null

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
        >
          <button className="document-tab__label" type="button" onClick={() => onSelect(tab.id)} title={tab.title}>
            <span className="document-tab__dirty" aria-hidden="true">
              {tab.dirty ? '\u2022' : ''}
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
    </div>
  )
}
