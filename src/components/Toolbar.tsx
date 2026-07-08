import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '../i18n'
import type { ExportFormat, Language, Theme } from '../../electron/shared'

interface ToolbarProps {
  title: string
  hasDoc: boolean
  mode: 'view' | 'edit'
  theme: Theme
  language: Language
  onOpen: () => void
  onToggleEdit: () => void
  onToggleTheme: () => void
  onExport: (format: ExportFormat) => void
  onChangeLanguage: (lang: Language) => void
}

export function Toolbar(props: ToolbarProps): JSX.Element {
  const { t } = useTranslation()
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    const onDocClick = (e: globalThis.MouseEvent): void => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [exportOpen])

  const doExport = (format: ExportFormat): void => {
    setExportOpen(false)
    props.onExport(format)
  }

  return (
    <header className="toolbar">
      <div className="toolbar__group">
        <button className="btn" onClick={props.onOpen}>
          {t('toolbar.open')}
        </button>
        <button
          className={`btn ${props.mode === 'edit' ? 'btn--active' : ''}`}
          onClick={props.onToggleEdit}
          disabled={!props.hasDoc}
          title={t('toolbar.edit')}
        >
          {props.mode === 'edit' ? t('toolbar.view') : t('toolbar.edit')}
        </button>
        <div className="menu" ref={exportRef}>
          <button className="btn" onClick={() => setExportOpen((v) => !v)} disabled={!props.hasDoc}>
            {t('toolbar.export')} ▾
          </button>
          {exportOpen && (
            <div className="menu__list">
              <button className="menu__item" onClick={() => doExport('html')}>
                {t('toolbar.exportHtml')}
              </button>
              <button className="menu__item" onClick={() => doExport('pdf')}>
                {t('toolbar.exportPdf')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="toolbar__title">{props.title}</div>

      <div className="toolbar__group">
        <select
          className="select"
          value={props.language}
          onChange={(e) => props.onChangeLanguage(e.target.value as Language)}
          aria-label={t('toolbar.language')}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <button className="btn" onClick={props.onToggleTheme} title={t('toolbar.theme')}>
          {props.theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  )
}
