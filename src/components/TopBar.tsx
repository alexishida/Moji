import { useState, useCallback, useEffect, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsButton } from './SettingsButton'
import { IconMoon, IconSun, IconEye, IconPencil, IconDownload, IconOpen, IconFilePlus, IconSave, IconInfo, IconReplace } from './icons'
import type { ExportFormat, Theme } from '../../electron/shared'

interface TopBarProps {
  title: string
  hasDoc: boolean
  mode: 'view' | 'edit'
  exportOpen: boolean
  settingsOpen: boolean
  aboutOpen: boolean
  theme: Theme
  onSetMode: (mode: 'view' | 'edit') => void
  onOpen: () => void
  onSave: () => void
  onNew: () => void
  onToggleTheme: () => void
  onExport: (format: ExportFormat) => void
  onOpenSettings: () => void
  onOpenAbout: () => void
  onSearch: (term: string) => void
  onFindNext: () => void
  onReplace: (search: string, replacement: string, all: boolean) => void
  searchMatchCount: number
  activeSearchIndex: number | null
  canToggleTheme: boolean
}

export function TopBar(props: TopBarProps): JSX.Element {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [replaceOpen, setReplaceOpen] = useState(false)
  const canFind = props.hasDoc && props.searchMatchCount > 0
  const canReplace = canFind
  const occurrenceLabel =
    props.searchMatchCount > 0 && props.activeSearchIndex !== null
      ? `${props.activeSearchIndex + 1}/${props.searchMatchCount}`
      : `${props.searchMatchCount}`

  const handleSearchChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setSearchTerm(value)
      props.onSearch(value)
    },
    [props.onSearch]
  )

  const handleReplaceChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setReplaceTerm(e.target.value)
  }, [])

  const replaceOne = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault()
      if (!canReplace) return
      props.onReplace(searchTerm, replaceTerm, false)
    },
    [canReplace, props.onReplace, replaceTerm, searchTerm]
  )

  const replaceAll = useCallback(() => {
    if (!canReplace) return
    props.onReplace(searchTerm, replaceTerm, true)
  }, [canReplace, props.onReplace, replaceTerm, searchTerm])

  useEffect(() => {
    if (!props.hasDoc) setReplaceOpen(false)
  }, [props.hasDoc])

  return (
    <header className="topbar">
      <div className="topbar__row topbar__row--tools">
        <div className="topbar__left">
          <button className="topbar__open-btn" onClick={props.onNew} title={t('toolbar.newDocument')}>
            <IconFilePlus width={15} height={15} />
            {t('toolbar.newDocument')}
          </button>

          <button className="topbar__open-btn" onClick={props.onOpen} title={t('toolbar.open')}>
            <IconOpen width={15} height={15} />
            {t('toolbar.open')}
          </button>

          <button className="topbar__open-btn" onClick={props.onSave} disabled={!props.hasDoc} title={t('toolbar.save')}>
            <IconSave width={15} height={15} />
            {t('toolbar.save')}
          </button>
        </div>

        <div className="topbar__right">
          <div className="topbar__search-group">
            <button
              className={`iconbtn topbar__replace-toggle ${replaceOpen ? 'iconbtn--active' : ''}`}
              type="button"
              onClick={() => setReplaceOpen((open) => !open)}
              disabled={!props.hasDoc}
              title={t('toolbar.replace')}
              aria-label={t('toolbar.replace')}
              aria-expanded={replaceOpen}
            >
              <IconReplace width={16} height={16} />
            </button>
            <input
              className="topbar__search"
              type="search"
              placeholder={t('toolbar.search')}
              value={searchTerm}
              onChange={handleSearchChange}
              disabled={!props.hasDoc}
            />

            {replaceOpen && (
              <form className="topbar__replace-popover" onSubmit={replaceOne}>
                <div className="topbar__replace-row">
                  <input
                    className="topbar__replace-input"
                    type="text"
                    placeholder={t('toolbar.replaceWith')}
                    value={replaceTerm}
                    onChange={handleReplaceChange}
                  />
                  <span className="topbar__replace-count" title={t('toolbar.occurrences')}>
                    {occurrenceLabel}
                  </span>
                </div>
                <div className="topbar__replace-actions">
                  <button className="btn" type="button" onClick={props.onFindNext} disabled={!canFind}>
                    {t('toolbar.findNext')}
                  </button>
                  <button className="btn" type="submit" disabled={!canReplace}>
                    {t('toolbar.replaceOne')}
                  </button>
                  <button className="btn" type="button" onClick={replaceAll} disabled={!canReplace}>
                    {t('toolbar.replaceAll')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="topbar__row">
        <div className="topbar__left" />

        <div className="topbar__center">
          <div className="segment" role="tablist" aria-label={t('toolbar.viewMode')}>
            <button
              className={`segment__btn ${
                !props.exportOpen && !props.settingsOpen && !props.aboutOpen && props.mode === 'view'
                  ? 'segment__btn--active'
                  : ''
              }`}
              onClick={() => props.onSetMode('view')}
              disabled={!props.hasDoc}
              role="tab"
              aria-selected={!props.exportOpen && !props.settingsOpen && !props.aboutOpen && props.mode === 'view'}
            >
              <IconEye width={15} height={15} />
              {t('toolbar.preview')}
            </button>
            <button
              className={`segment__btn ${
                !props.exportOpen && !props.settingsOpen && !props.aboutOpen && props.mode === 'edit'
                  ? 'segment__btn--active'
                  : ''
              }`}
              onClick={() => props.onSetMode('edit')}
              disabled={!props.hasDoc}
              role="tab"
              aria-selected={!props.exportOpen && !props.settingsOpen && !props.aboutOpen && props.mode === 'edit'}
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
            disabled={!props.canToggleTheme}
            title={props.theme === 'dark' ? t('toolbar.themeLight') : t('toolbar.themeDark')}
            aria-label={t('toolbar.theme')}
          >
            {props.theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>

          <SettingsButton
            active={props.settingsOpen}
            onClick={props.onOpenSettings}
          />

          <button
            className={`iconbtn ${props.aboutOpen ? 'iconbtn--active' : ''}`}
            onClick={props.onOpenAbout}
            title={t('toolbar.about')}
            aria-label={t('toolbar.about')}
          >
            <IconInfo />
          </button>
        </div>
      </div>
    </header>
  )
}
