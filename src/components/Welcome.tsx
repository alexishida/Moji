import { useTranslation } from 'react-i18next'

interface WelcomeProps {
  onOpen: () => void
}

export function Welcome({ onOpen }: WelcomeProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="pane">
      <div className="welcome">
        <h1 className="welcome__title">{t('welcome.title')}</h1>
        <p className="welcome__subtitle">{t('welcome.subtitle')}</p>
        <button className="btn btn--primary" onClick={onOpen}>
          {t('welcome.openButton')}
        </button>
        <p className="welcome__hint">{t('welcome.dropHint')}</p>
      </div>
    </div>
  )
}
