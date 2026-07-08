import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '../i18n'
import { IconSettings } from './icons'
import type { Language, Theme } from '../../electron/shared'

interface SettingsButtonProps {
  /** `icon` = round button (top bar); `nav` = full-width row (sidebar footer). */
  variant: 'icon' | 'nav'
  language: Language
  theme: Theme
  onChangeLanguage: (lang: Language) => void
  onToggleTheme: () => void
}

/** Self-contained settings popover: language picker + theme toggle. */
export function SettingsButton(props: SettingsButtonProps): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: globalThis.MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const placement = props.variant === 'nav' ? 'popover--up' : ''

  return (
    <div className="menu" ref={rootRef}>
      {props.variant === 'icon' ? (
        <button
          className={`iconbtn ${open ? 'iconbtn--active' : ''}`}
          onClick={() => setOpen((v) => !v)}
          title={t('toolbar.settings')}
          aria-label={t('toolbar.settings')}
        >
          <IconSettings />
        </button>
      ) : (
        <button className={`navitem ${open ? 'navitem--active' : ''}`} onClick={() => setOpen((v) => !v)}>
          <IconSettings width={16} height={16} />
          <span className="navitem__label">{t('toolbar.settings')}</span>
        </button>
      )}

      {open && (
        <div className={`popover ${placement}`} role="menu">
          <div className="popover__row">
            <span className="popover__label">{t('toolbar.language')}</span>
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
          </div>
          <div className="popover__row">
            <span className="popover__label">{t('toolbar.theme')}</span>
            <button className="btn btn--block" onClick={props.onToggleTheme}>
              {props.theme === 'dark' ? t('toolbar.themeLight') : t('toolbar.themeDark')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
