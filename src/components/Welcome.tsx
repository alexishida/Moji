import { useTranslation } from 'react-i18next'

interface WelcomeProps {
  onOpen: () => void
  onNew: () => void
}

export function Welcome({ onOpen, onNew }: WelcomeProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="pane">
      <div className="welcome">
        <h1 className="welcome__title">{t('welcome.title')}</h1>
        <p className="welcome__subtitle">{t('welcome.subtitle')}</p>
        <div className="welcome__actions">
          <button className="btn btn--primary" onClick={onOpen}>
            {t('welcome.openButton')}
          </button>
          <button className="btn" onClick={onNew}>
            {t('toolbar.newDocument')}
          </button>
        </div>
        <p className="welcome__hint">{t('welcome.dropHint')}</p>
      </div>
    </div>
  )
}
