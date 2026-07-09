import { useTranslation } from 'react-i18next'
import { IconX } from './icons'
import logoMark from '../assets/logo-mark-light.png'

interface AboutDialogProps {
  version: string
  onClose: () => void
}

export function AboutDialog({ version, onClose }: AboutDialogProps): JSX.Element {
  const { t } = useTranslation()

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
      </div>
    </section>
  )
}
