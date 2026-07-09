import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '../i18n'
import { IconSettings, IconX } from './icons'
import type { Language, Settings } from '../../electron/shared'

interface SettingsDialogProps {
  settings: Settings
  onClose: () => void
  onChange: (patch: Partial<Settings>) => void
}

const FONT_FAMILIES = [
  { value: 'Inter', label: 'Inter' },
  { value: 'system-ui', label: 'system-ui' },
  { value: 'serif', label: 'serif' },
  { value: 'monospace', label: 'monospace' }
]

export function SettingsDialog({ settings, onClose, onChange }: SettingsDialogProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <section className="export-dialog settings-dialog" aria-label={t('settingsDialog.title')}>
      <header className="export-dialog__header">
        <h2 className="export-dialog__title">
          <IconSettings width={18} height={18} aria-hidden="true" />
          <span>{t('settingsDialog.title')}</span>
        </h2>
        <button className="iconbtn" onClick={onClose} title={t('dialog.cancel')} aria-label={t('dialog.cancel')}>
          <IconX />
        </button>
      </header>

      <div className="settings-dialog__body">
        <section className="settings-section" aria-labelledby="settings-general-heading">
          <h3 className="settings-section__heading" id="settings-general-heading">
            {t('settingsDialog.general')}
          </h3>

          <div className="settings-field-list">
            <label className="settings-field">
              <span className="settings-field__label">{t('toolbar.language')}</span>
              <select
                className="select settings-field__control"
                value={settings.language}
                onChange={(e) => onChange({ language: e.target.value as Language })}
              >
                {LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="settings-preview-heading">
          <h3 className="settings-section__heading" id="settings-preview-heading">
            {t('settingsDialog.preview')}
          </h3>

          <div className="settings-field-list">
            <label className="settings-field">
              <span className="settings-field__label">{t('settingsDialog.fontFamily')}</span>
              <select
                className="select settings-field__control"
                value={settings.previewFontFamily}
                onChange={(e) => onChange({ previewFontFamily: e.target.value })}
              >
                {FONT_FAMILIES.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span className="settings-field__label">{t('settingsDialog.fontSize')}</span>
              <input
                className="input settings-field__control"
                type="number"
                min={12}
                max={24}
                step={1}
                value={settings.previewFontSize}
                onChange={(e) => {
                  if (Number.isFinite(e.currentTarget.valueAsNumber)) {
                    onChange({ previewFontSize: e.currentTarget.valueAsNumber })
                  }
                }}
              />
            </label>

            <label className="settings-field">
              <span className="settings-field__label">{t('settingsDialog.lineHeight')}</span>
              <input
                className="input settings-field__control"
                type="number"
                min={1.2}
                max={2.4}
                step={0.1}
                value={settings.previewLineHeight}
                onChange={(e) => {
                  if (Number.isFinite(e.currentTarget.valueAsNumber)) {
                    onChange({ previewLineHeight: e.currentTarget.valueAsNumber })
                  }
                }}
              />
            </label>
          </div>
        </section>
      </div>
    </section>
  )
}
