import { useTranslation } from 'react-i18next'
import type { UpdateState } from '../../electron/shared'
import { IconDownload, IconRefresh, IconRestart, IconX } from './icons'

interface UpdateNoticeProps {
  state: UpdateState
  onDismiss: () => void
  onDownload: () => void
  onInstall: () => void
  onRetry: () => void
}

export function UpdateNotice({ state, onDismiss, onDownload, onInstall, onRetry }: UpdateNoticeProps): JSX.Element {
  const { t } = useTranslation()

  if (!['available', 'downloading', 'downloaded', 'error'].includes(state.status)) return <></>

  const title =
    state.status === 'available'
      ? t('update.availableTitle', { version: state.version })
      : state.status === 'downloading'
        ? t('update.downloadingTitle')
        : state.status === 'downloaded'
          ? t('update.readyTitle', { version: state.version })
          : t('update.errorTitle')

  const body =
    state.status === 'available'
      ? t('update.availableBody')
      : state.status === 'downloading'
        ? t('update.downloadingBody', { percent: Math.round(state.percent ?? 0) })
        : state.status === 'downloaded'
          ? t('update.readyBody')
          : t('update.errorBody', { error: state.error ?? t('update.unknownError') })

  return (
    <aside className={`update-notice update-notice--${state.status}`} aria-live="polite" aria-label={title}>
      <div className="update-notice__icon" aria-hidden="true">
        <IconDownload />
      </div>
      <div className="update-notice__content">
        <strong className="update-notice__title">{title}</strong>
        <span className="update-notice__body">{body}</span>
        {state.status === 'downloading' && (
          <div className="update-notice__progress" role="progressbar" aria-valuenow={state.percent ?? 0}>
            <span style={{ width: `${Math.max(0, Math.min(100, state.percent ?? 0))}%` }} />
          </div>
        )}
        <div className="update-notice__actions">
          {state.status === 'available' && (
            <button className="btn btn--primary" onClick={onDownload}>
              <IconDownload aria-hidden="true" />
              {t('update.download')}
            </button>
          )}
          {state.status === 'downloaded' && (
            <button className="btn btn--primary" onClick={onInstall}>
              <IconRestart aria-hidden="true" />
              {t('update.restart')}
            </button>
          )}
          {state.status === 'error' && (
            <button className="btn btn--primary" onClick={onRetry}>
              <IconRefresh aria-hidden="true" />
              {t('update.retry')}
            </button>
          )}
          {state.status !== 'downloading' && (
            <button className="btn" onClick={onDismiss}>
              <IconX aria-hidden="true" />
              {t('update.later')}
            </button>
          )}
        </div>
      </div>
      {state.status !== 'downloading' && (
        <button className="update-notice__close" onClick={onDismiss} aria-label={t('update.dismiss')}>
          <IconX aria-hidden="true" />
        </button>
      )}
    </aside>
  )
}
