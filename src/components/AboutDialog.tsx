import { useTranslation } from 'react-i18next'
import type { UpdateState } from '../../electron/shared'
import { IconRefresh, IconX } from './icons'
import logoMark from '../assets/logo-mark-light.png'

interface AboutDialogProps {
  version: string
  updateState: UpdateState
  onClose: () => void
  onCheckForUpdates: () => void
}

export function AboutDialog({ version, updateState, onClose, onCheckForUpdates }: AboutDialogProps): JSX.Element {
  const { t } = useTranslation()
  const checking = updateState.status === 'checking'
  const checkDisabled = ['unsupported', 'checking', 'available', 'downloading', 'downloaded'].includes(updateState.status)

  const updateStatus =
    updateState.status === 'checking'
      ? t('aboutDialog.updateChecking')
      : updateState.status === 'up-to-date'
        ? t('aboutDialog.updateCurrent', { version: updateState.currentVersion })
        : updateState.status === 'available'
          ? t('aboutDialog.updateAvailable', { version: updateState.version })
          : updateState.status === 'downloading'
            ? t('aboutDialog.updateDownloading', { percent: Math.round(updateState.percent ?? 0) })
            : updateState.status === 'downloaded'
              ? t('aboutDialog.updateReady', { version: updateState.version })
              : updateState.status === 'error'
                ? t('aboutDialog.updateFailed')
                : updateState.status === 'unsupported'
                  ? t('aboutDialog.updateUnsupported')
                  : t('aboutDialog.updateIdle', { version: updateState.currentVersion })

  return (
    <section className="export-dialog about-dialog" aria-label={t('aboutDialog.title')}>
      <header className="export-dialog__header">
        <h2 className="export-dialog__title">{t('aboutDialog.title')}</h2>
        <button className="iconbtn" onClick={onClose} title={t('dialog.cancel')} aria-label={t('dialog.cancel')}>
          <IconX />
        </button>
      </header>

      <div className="about-dialog__body">
        <section className="about-dialog__hero">
          <div className="about-dialog__mark" aria-hidden="true">
            <img className="about-dialog__mark-img" src={logoMark} alt="" />
          </div>
          <div className="about-dialog__hero-content">
            <p className="about-dialog__eyebrow">{t('aboutDialog.application')}</p>
            <h3 className="about-dialog__name">Moji</h3>
            <span className="about-dialog__badge">{t('aboutDialog.version', { version })}</span>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="about-author-heading">
          <h3 className="settings-section__heading" id="about-author-heading">
            {t('aboutDialog.authorTitle')}
          </h3>

          <div className="about-dialog__meta">
            <div className="about-dialog__row">
              <span className="about-dialog__label">{t('aboutDialog.authorLabel')}</span>
              <span>Alex Ishida</span>
            </div>
            <div className="about-dialog__row">
              <span className="about-dialog__label">{t('aboutDialog.emailLabel')}</span>
              <a className="about-dialog__link" href="mailto:alexishida@gmail.com">
                alexishida@gmail.com
              </a>
            </div>
            <div className="about-dialog__row">
              <span className="about-dialog__label">{t('aboutDialog.repositoryLabel')}</span>
              <a
                className="about-dialog__link"
                href="https://github.com/alexishida/moji"
                target="_blank"
                rel="noreferrer"
              >
                https://github.com/alexishida/moji
              </a>
            </div>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="about-name-heading">
          <h3 className="settings-section__heading" id="about-name-heading">
            {t('aboutDialog.whyNameTitle')}
          </h3>
          <p className="about-dialog__text">{t('aboutDialog.whyNameBody')}</p>
        </section>

        <div className="about-dialog__update">
          <span className="about-dialog__update-status" aria-live="polite">{updateStatus}</span>
          <button className="btn" onClick={onCheckForUpdates} disabled={checkDisabled}>
            <IconRefresh aria-hidden="true" />
            {checking ? t('aboutDialog.checkingForUpdates') : t('aboutDialog.checkForUpdates')}
          </button>
        </div>
      </div>
    </section>
  )
}
