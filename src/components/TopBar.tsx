import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsButton } from './SettingsButton'
import { IconMoon, IconSun, IconKebab, IconEye, IconPencil, IconFolder, IconFilePlus, IconDownload } from './icons'
import type { ExportFormat, Language, Theme } from '../../electron/shared'

interface TopBarProps {
  title: string
  hasDoc: boolean
  mode: 'view' | 'edit'
  exportOpen: boolean
  theme: Theme
  language: Language
  onSetMode: (mode: 'view' | 'edit') => void
  onToggleTheme: () => void
  onNew: () => void
  onOpen: () => void
  onExport: (format: ExportFormat) => void
  onChangeLanguage: (lang: Language) => void
}

export function TopBar(props: TopBarProps): JSX.Element {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e: globalThis.MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  const runMenu = (fn: () => void) => (): void => {
    setMenuOpen(false)
    fn()
  }

  return (
    <header className="topbar">
      <div className="topbar__left">
        {props.title && (
          <span className="topbar__file" title={props.title}>
            {props.title}
          </span>
        )}
      </div>

      <div className="topbar__center">
        <div className="segment" role="tablist" aria-label={t('toolbar.viewMode')}>
          <button
            className={`segment__btn ${!props.exportOpen && props.mode === 'view' ? 'segment__btn--active' : ''}`}
            onClick={() => props.onSetMode('view')}
            disabled={!props.hasDoc}
            role="tab"
            aria-selected={!props.exportOpen && props.mode === 'view'}
          >
            <IconEye width={15} height={15} />
            {t('toolbar.preview')}
          </button>
          <button
            className={`segment__btn ${!props.exportOpen && props.mode === 'edit' ? 'segment__btn--active' : ''}`}
            onClick={() => props.onSetMode('edit')}
            disabled={!props.hasDoc}
            role="tab"
            aria-selected={!props.exportOpen && props.mode === 'edit'}
          >
            <IconPencil width={15} height={15} />
            {t('toolbar.editor')}
          </button>
          <button
            className={`segment__btn ${props.exportOpen ? 'segment__btn--active' : ''}`}
            onClick={() => props.onExport('pdf')}
            disabled={!props.hasDoc}
            role="tab"
            aria-selected={props.exportOpen}
          >
            <IconDownload width={15} height={15} />
            {t('toolbar.export')}
          </button>
        </div>
      </div>

      <div className="topbar__right">
        <button
          className="iconbtn"
          onClick={props.onToggleTheme}
          title={props.theme === 'dark' ? t('toolbar.themeLight') : t('toolbar.themeDark')}
          aria-label={t('toolbar.theme')}
        >
          {props.theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>

        <SettingsButton
          variant="icon"
          language={props.language}
          theme={props.theme}
          onChangeLanguage={props.onChangeLanguage}
          onToggleTheme={props.onToggleTheme}
        />

        <div className="menu" ref={menuRef}>
          <button
            className={`iconbtn ${menuOpen ? 'iconbtn--active' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            title={t('toolbar.more')}
            aria-label={t('toolbar.more')}
          >
            <IconKebab />
          </button>
          {menuOpen && (
            <div className="popover" role="menu">
              <button className="menu__item" onClick={runMenu(props.onNew)}>
                <IconFilePlus width={16} height={16} />
                {t('toolbar.newDocument')}
              </button>
              <button className="menu__item" onClick={runMenu(props.onOpen)}>
                <IconFolder width={16} height={16} />
                {t('toolbar.open')}
              </button>
              <div className="menu__divider" />
              <button className="menu__item" onClick={runMenu(() => props.onExport('html'))} disabled={!props.hasDoc}>
                <IconDownload width={16} height={16} />
                {t('toolbar.exportHtml')}
              </button>
              <button className="menu__item" onClick={runMenu(() => props.onExport('pdf'))} disabled={!props.hasDoc}>
                <IconDownload width={16} height={16} />
                {t('toolbar.exportPdf')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
