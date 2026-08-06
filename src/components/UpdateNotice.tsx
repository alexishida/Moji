import { useTranslation } from 'react-i18next'
import type { UpdateState } from '../../electron/shared'
import { IconDownload, IconRefresh, IconX } from './icons'

const RELEASES_URL = 'https://github.com/alexishida/Moji/releases'

interface UpdateNoticeProps {
  state: UpdateState
  onDismiss: () => void
  onRetry: () => void
}

export function UpdateNotice({ state, onDismiss, onRetry }: UpdateNoticeProps): JSX.Element {
  const { t } = useTranslation()

  if (!['available', 'error'].includes(state.status)) return <></>

  const title =
    state.status === 'available'
      ? t('update.availableTitle', { version: state.version })
      : t('update.errorTitle')

  const body =
    state.status === 'available'
      ? t('update.availableBody')
      : t('update.errorBody', { error: state.error ?? t('update.unknownError') })

  return (
    <aside className={`update-notice update-notice--${state.status}`} aria-live="polite" aria-label={title}>
      <div className="update-notice__icon" aria-hidden="true">
        <IconDownload />
      </div>
      <div className="update-notice__content">
        <strong className="update-notice__title">{title}</strong>
        <span className="update-notice__body">{body}</span>
        <div className="update-notice__actions">
          {state.status === 'available' && (
            <a className="btn btn--primary" href={RELEASES_URL} target="_blank" rel="noreferrer">
              <IconDownload aria-hidden="true" />
              {t('update.openReleases')}
            </a>
          )}
          {state.status === 'error' && (
            <button className="btn btn--primary" onClick={onRetry}>
              <IconRefresh aria-hidden="true" />
              {t('update.retry')}
            </button>
          )}
          <button className="btn" onClick={onDismiss}>
            <IconX aria-hidden="true" />
            {t('update.later')}
          </button>
        </div>
      </div>
      <button className="update-notice__close" onClick={onDismiss} aria-label={t('update.dismiss')}>
        <IconX aria-hidden="true" />
      </button>
    </aside>
  )
}
