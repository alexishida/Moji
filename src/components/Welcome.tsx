import { useTranslation } from 'react-i18next'
import { IconFilePlus, IconFileText, IconOpen, IconX } from './icons'
import logoMark from '../assets/logo-mark-light.png'

interface WelcomeProps {
  onOpen: () => void
  onNew: () => void
  recentFiles: string[]
  onOpenRecent: (path: string) => void
  onForgetRecent: (path: string) => void
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function dirName(path: string): string {
  return path.slice(0, Math.max(0, path.length - fileName(path).length - 1))
}

export function Welcome({ onOpen, onNew, recentFiles, onOpenRecent, onForgetRecent }: WelcomeProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="pane">
      <div className="welcome">
        <img className="welcome__logo" src={logoMark} alt="Moji" />
        <h1 className="welcome__title">{t('welcome.title')}</h1>
        <p className="welcome__tagline">{t('welcome.tagline')}</p>
        <div className="welcome__actions">
          <button className="btn btn--primary" onClick={onOpen}>
            <IconOpen width={16} height={16} />
            {t('welcome.openButton')}
          </button>
          <button className="btn" onClick={onNew}>
            <IconFilePlus width={16} height={16} />
            {t('welcome.newButton')}
          </button>
        </div>
        <p className="welcome__subtitle">{t('welcome.subtitle')}</p>
        <p className="welcome__hint">{t('welcome.dropHint')}</p>

        {recentFiles.length > 0 && (
          <div className="welcome__recent">
            <div className="welcome__recent-title">{t('welcome.recent.title')}</div>
            <ul className="welcome__recent-list">
              {recentFiles.map((path) => (
                <li key={path} className="welcome__recent-item">
                  <button
                    type="button"
                    className="welcome__recent-open"
                    onClick={() => onOpenRecent(path)}
                    title={path}
                  >
                    <IconFileText width={16} height={16} />
                    <span className="welcome__recent-name">{fileName(path)}</span>
                    <span className="welcome__recent-path">{dirName(path)}</span>
                  </button>
                  <button
                    type="button"
                    className="welcome__recent-remove"
                    onClick={() => onForgetRecent(path)}
                    aria-label={t('welcome.recent.remove')}
                    title={t('welcome.recent.remove')}
                  >
                    <IconX width={14} height={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
