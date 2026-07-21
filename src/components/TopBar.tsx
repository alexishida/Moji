import { useState, useCallback, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsButton } from './SettingsButton'
import { FontSizeButton } from './FontSizeButton'
import { IconMoon, IconSun, IconEye, IconPencil, IconDownload, IconOpen, IconFilePlus, IconSave, IconInfo, IconReplace, IconReplaceAll, IconSearch, IconX, IconLayoutWidth, IconSidebar, IconCommand } from './icons'
import type { ExportFormat, Theme } from '../../electron/shared'

interface TopBarProps {
  title: string
  hasDoc: boolean
  readOnly: boolean
  mode: 'view' | 'edit'
  exportOpen: boolean
  settingsOpen: boolean
  aboutOpen: boolean
  theme: Theme
  onSetMode: (mode: 'view' | 'edit') => void
  onOpen: () => void
  onOpenFolder: () => void
  onSave: () => void
  onNew: () => void
  onToggleTheme: () => void
  onExport: (format: ExportFormat) => void
  onOpenSettings: () => void
  onOpenAbout: () => void
  onOpenCommandPalette: () => void
  onSearch: (term: string) => void
  onFindNext: () => void
  onReplace: (search: string, replacement: string, all: boolean) => void
  onReplaceActiveChange: (active: boolean) => void
  searchMatchCount: number
  activeSearchIndex: number | null
  canToggleTheme: boolean
  previewFontSize: number
  canAdjustFontSize: boolean
  onFontSizeChange: (value: number) => void
  previewFluidWidth: boolean
  canTogglePreviewWidth: boolean
  onTogglePreviewWidth: () => void
  outlineVisible: boolean
  canToggleOutline: boolean
  onToggleOutline: () => void
  searchFocusRequest: number
  replaceFocusRequest: number
  dismissRequest: number
}

export function TopBar(props: TopBarProps): JSX.Element {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [replaceOpen, setReplaceOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const canSearch = props.hasDoc && !props.exportOpen
  const canFind = canSearch && props.searchMatchCount > 0
  const canOpenReplace = props.hasDoc && props.mode === 'edit' && !props.exportOpen
  const canReplace = canFind && props.mode === 'edit' && !props.exportOpen
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
    if (!canOpenReplace) setReplaceOpen(false)
  }, [canOpenReplace])

  useEffect(() => {
    if (!canSearch || props.searchFocusRequest === 0) return
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [canSearch, props.searchFocusRequest])

  useEffect(() => {
    if (!canOpenReplace || props.replaceFocusRequest === 0) return
    setReplaceOpen(true)
  }, [canOpenReplace, props.replaceFocusRequest])

  useEffect(() => {
    if (!replaceOpen || props.replaceFocusRequest === 0) return
    replaceInputRef.current?.focus()
    replaceInputRef.current?.select()
  }, [replaceOpen, props.replaceFocusRequest])

  useEffect(() => {
    if (props.dismissRequest === 0) return
    setReplaceOpen(false)
    searchInputRef.current?.blur()
    replaceInputRef.current?.blur()
  }, [props.dismissRequest])

  useEffect(() => {
    if (props.hasDoc) return
    setSearchTerm('')
    setReplaceTerm('')
    setReplaceOpen(false)
    props.onSearch('')
  }, [props.hasDoc, props.onSearch])

  // Highlight the active match only while the replace field is in use.
  useEffect(() => {
    props.onReplaceActiveChange(canOpenReplace && replaceOpen && replaceTerm.trim() !== '')
  }, [canOpenReplace, replaceOpen, replaceTerm, props.onReplaceActiveChange])

  return (
    <header className="topbar">
      <div className="topbar__row topbar__row--tools">
        <div className="topbar__left">
          <div className="filegroup" role="group" aria-label={t('toolbar.viewMode')}>
            <button className="filegroup__btn" onClick={props.onNew} title={t('toolbar.newDocument')}>
              <IconFilePlus width={15} height={15} />
              {t('toolbar.newDocument')}
            </button>

            <button className="filegroup__btn" onClick={props.onOpen} title={t('toolbar.open')}>
              <IconOpen width={15} height={15} />
              {t('toolbar.open')}
            </button>

            <button className="filegroup__btn" onClick={props.onOpenFolder} title={t('toolbar.openFolder')}>
              <IconOpen width={15} height={15} />
              {t('toolbar.openFolder')}
            </button>

            <button
              className="filegroup__btn"
              onClick={props.onSave}
              disabled={!props.hasDoc}
              title={props.readOnly ? t('notice.readOnlyGuide') : t('toolbar.save')}
            >
              <IconSave width={15} height={15} />
              {t('toolbar.save')}
            </button>
          </div>
        </div>

        <div className="topbar__right">
          <button
            className="iconbtn"
            type="button"
            onClick={props.onOpenCommandPalette}
            title={t('toolbar.commandPalette')}
            aria-label={t('toolbar.commandPalette')}
          >
            <IconCommand width={16} height={16} />
          </button>
          <div className="topbar__search-group">
            <button
              className={`iconbtn topbar__replace-toggle ${replaceOpen ? 'iconbtn--active' : ''}`}
              type="button"
              onClick={() => setReplaceOpen((open) => !open)}
              disabled={!canOpenReplace}
              title={t('toolbar.replace')}
              aria-label={t('toolbar.replace')}
              aria-expanded={replaceOpen}
            >
              <IconReplace width={16} height={16} />
            </button>
            <input
              ref={searchInputRef}
              className="topbar__search"
              type="search"
              placeholder={t('toolbar.search')}
              value={searchTerm}
              onChange={handleSearchChange}
              disabled={!canSearch}
            />

            {replaceOpen && (
              <form className="topbar__replace-popover" onSubmit={replaceOne}>
                <div className="topbar__replace-row">
                  <input
                    ref={replaceInputRef}
                    className="topbar__replace-input"
                    type="search"
                    placeholder={t('toolbar.replaceWith')}
                    value={replaceTerm}
                    onChange={handleReplaceChange}
                  />
                  <span className="topbar__replace-count" title={t('toolbar.occurrences')}>
                    {occurrenceLabel}
                  </span>
                  <button
                    className="iconbtn topbar__replace-close"
                    type="button"
                    onClick={() => setReplaceOpen(false)}
                    title={t('toolbar.close')}
                    aria-label={t('toolbar.close')}
                  >
                    <IconX width={16} height={16} />
                  </button>
                </div>
                <div className="topbar__replace-actions">
                  <button className="btn" type="button" onClick={props.onFindNext} disabled={!canFind}>
                    <IconSearch width={15} height={15} />
                    {t('toolbar.findNext')}
                  </button>
                  <button className="btn" type="submit" disabled={!canReplace}>
                    <IconReplace width={15} height={15} />
                    {t('toolbar.replaceOne')}
                  </button>
                  <button className="btn" type="button" onClick={replaceAll} disabled={!canReplace}>
                    <IconReplaceAll width={15} height={15} />
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
              disabled={!props.hasDoc || props.readOnly}
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
            className={`iconbtn ${props.outlineVisible && props.canToggleOutline ? 'iconbtn--active' : ''}`}
            type="button"
            onClick={props.onToggleOutline}
            disabled={!props.canToggleOutline}
            title={props.outlineVisible ? t('toolbar.hideOutline') : t('toolbar.showOutline')}
            aria-label={props.outlineVisible ? t('toolbar.hideOutline') : t('toolbar.showOutline')}
            aria-pressed={props.outlineVisible}
          >
            <IconSidebar />
          </button>

          <button
            className={`iconbtn ${props.previewFluidWidth ? 'iconbtn--active' : ''}`}
            type="button"
            onClick={props.onTogglePreviewWidth}
            disabled={!props.canTogglePreviewWidth}
            title={props.previewFluidWidth ? t('toolbar.useFixedWidth') : t('toolbar.useFluidWidth')}
            aria-label={props.previewFluidWidth ? t('toolbar.useFixedWidth') : t('toolbar.useFluidWidth')}
            aria-pressed={props.previewFluidWidth}
          >
            <IconLayoutWidth />
          </button>

          <FontSizeButton
            value={props.previewFontSize}
            disabled={!props.canAdjustFontSize}
            onChange={props.onFontSizeChange}
          />

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
