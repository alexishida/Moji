import { useTranslation } from 'react-i18next'
import { IconX } from './icons'

interface OpenProgressProps {
  completed: number
  total: number
  canceling: boolean
  onCancel: () => void
}

export function OpenProgress({ completed, total, canceling, onCancel }: OpenProgressProps): JSX.Element {
  const { t } = useTranslation()
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <aside className="open-progress" role="status" aria-live="polite" aria-label={t('openProgress.title')}>
      <div className="open-progress__content">
        <strong className="open-progress__title">{t('openProgress.title')}</strong>
        <span className="open-progress__body">{t('openProgress.count', { completed, total })}</span>
        <div
          className="open-progress__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={completed}
        >
          <div className="open-progress__bar-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <button className="btn open-progress__cancel" onClick={onCancel} disabled={canceling}>
        <IconX aria-hidden="true" />
        {canceling ? t('openProgress.canceling') : t('openProgress.cancel')}
      </button>
    </aside>
  )
}
