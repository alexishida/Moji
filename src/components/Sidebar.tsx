import { useTranslation } from 'react-i18next'
import { SettingsButton } from './SettingsButton'
import { IconList, IconHelp } from './icons'
import type { OutlineItem } from '../lib/outline'
import type { Language, Theme } from '../../electron/shared'

interface SidebarProps {
  hasDoc: boolean
  outline: OutlineItem[]
  activeId: string | null
  language: Language
  theme: Theme
  onSelectHeading: (id: string) => void
  onHelp: () => void
  onChangeLanguage: (lang: Language) => void
  onToggleTheme: () => void
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <aside className="sidebar">
      <div className="sidebar__body">
        <div className="navitem navitem--active navitem--static">
          <IconList />
          <span className="navitem__label">{t('sidebar.outline')}</span>
        </div>

        {props.outline.length > 0 ? (
          <nav className="outline" aria-label={t('sidebar.outline')}>
            {props.outline.map((item, i) => (
              <button
                key={`${item.id}-${i}`}
                className={`outline__item ${props.activeId === item.id ? 'outline__item--active' : ''}`}
                style={{ paddingLeft: `${8 + (item.level - 1) * 14}px` }}
                onClick={() => props.onSelectHeading(item.id)}
                title={item.text}
              >
                {item.text}
              </button>
            ))}
          </nav>
        ) : (
          <p className="outline__empty">{props.hasDoc ? t('sidebar.noHeadings') : t('sidebar.noDocument')}</p>
        )}
      </div>

      <div className="sidebar__footer">
        <SettingsButton
          variant="nav"
          language={props.language}
          theme={props.theme}
          onChangeLanguage={props.onChangeLanguage}
          onToggleTheme={props.onToggleTheme}
        />
        <button className="navitem" onClick={props.onHelp}>
          <IconHelp width={16} height={16} />
          <span className="navitem__label">{t('sidebar.help')}</span>
        </button>
      </div>
    </aside>
  )
}
