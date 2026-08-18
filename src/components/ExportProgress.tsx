import { useTranslation } from 'react-i18next'
import type { ExportProgress as ExportProgressState } from '../../electron/shared'
import { IconX } from './icons'

interface ExportProgressProps {
  progress: ExportProgressState
  canceling: boolean
  onCancel: () => void
}

/**
 * Live state of the running export.
 *
 * A long PNG spends most of its time capturing slices, so that phase shows how far along
 * it is; the others are short enough that naming the phase is all there is to say.
 */
export function ExportProgress({ progress, canceling, onCancel }: ExportProgressProps): JSX.Element {
  const { t } = useTranslation()
  const { phase, slice, slices } = progress

  const counted = typeof slice === 'number' && typeof slices === 'number' && slices > 1
  const percent = counted ? Math.round((slice / (slices as number)) * 100) : 0

  return (
    <aside className="open-progress" role="status" aria-live="polite" aria-label={t('exportProgress.title')}>
      <div className="open-progress__content">
        <strong className="open-progress__title">{t('exportProgress.title')}</strong>
        <span className="open-progress__body">
          {counted
            ? t('exportProgress.slice', { phase: t(`exportProgress.phase.${phase}`), slice, slices })
            : t(`exportProgress.phase.${phase}`)}
        </span>
        {counted && (
          <div
            className="open-progress__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={slices}
            aria-valuenow={slice}
          >
            <div className="open-progress__bar-fill" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      <button className="btn open-progress__cancel" onClick={onCancel} disabled={canceling}>
        <IconX aria-hidden="true" />
        {canceling ? t('exportProgress.canceling') : t('exportProgress.cancel')}
      </button>
    </aside>
  )
}
