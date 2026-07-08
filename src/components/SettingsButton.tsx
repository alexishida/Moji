import { useTranslation } from 'react-i18next'
import { IconSettings } from './icons'

interface SettingsButtonProps {
  active: boolean
  onClick: () => void
}

export function SettingsButton({ active, onClick }: SettingsButtonProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <button
      className={`iconbtn ${active ? 'iconbtn--active' : ''}`}
      onClick={onClick}
      title={t('toolbar.settings')}
      aria-label={t('toolbar.settings')}
    >
      <IconSettings />
    </button>
  )
}
