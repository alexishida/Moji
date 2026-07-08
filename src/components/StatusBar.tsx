import { useTranslation } from 'react-i18next'
import { IconBook } from './icons'

interface StatusBarProps {
  hasDoc: boolean
  words: number
  onGuide: () => void
}

export function StatusBar(props: StatusBarProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <footer className="statusbar">
      <div className="statusbar__left">
        <span>{t('statusbar.brand')}</span>
      </div>

      <div className="statusbar__right">
        <button className="statusbar__link" onClick={props.onGuide}>
          <IconBook width={14} height={14} />
          {t('statusbar.guide')}
        </button>
        <span className="statusbar__count">{t('statusbar.wordCount', { count: props.words })}</span>
      </div>
    </footer>
  )
}
