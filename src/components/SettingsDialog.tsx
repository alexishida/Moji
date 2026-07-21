import { useState } from 'react'
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

const SHORTCUT_SECTIONS = [
  {
    key: 'file',
    items: [
      { action: 'newDocument', keys: ['Ctrl', 'N'] },
      { action: 'open', keys: ['Ctrl', 'O'] },
      { action: 'save', keys: ['Ctrl', 'S'] },
      { action: 'saveAs', keys: ['Ctrl', 'Shift', 'S'] },
      { action: 'closeTab', keys: ['Ctrl', 'W'] },
      { action: 'quit', keys: ['Ctrl', 'Q'] }
    ]
  },
  {
    key: 'search',
    items: [
      { action: 'search', keys: ['Ctrl', 'F'] },
      { action: 'replace', keys: ['Ctrl', 'H'] },
      { action: 'findNext', keys: ['F3'] },
      { action: 'findPrevious', keys: ['Shift', 'F3'] }
    ]
  },
  {
    key: 'view',
    items: [
      { action: 'toggleEdit', keys: ['Ctrl', 'E'] },
      { action: 'toggleOutline', keys: ['Ctrl', 'Shift', 'B'] },
      { action: 'export', keys: ['Ctrl', 'Shift', 'E'] },
      { action: 'settings', keys: ['Ctrl', ','] },
      { action: 'commandPalette', keys: ['Ctrl', 'Shift', 'P'] },
      { action: 'fullscreen', keys: ['F11'] },
      { action: 'closePanel', keys: ['Esc'] }
    ]
  },
  {
    key: 'font',
    items: [
      { action: 'increaseFont', keys: ['Ctrl', '+'] },
      { action: 'increaseFontAlt', keys: ['Ctrl', '='] },
      { action: 'decreaseFont', keys: ['Ctrl', '-'] },
      { action: 'resetFont', keys: ['Ctrl', '0'] }
    ]
  },
  {
    key: 'tabs',
    items: [
      { action: 'nextTab', keys: ['Ctrl', 'Tab'] },
      { action: 'previousTab', keys: ['Ctrl', 'Shift', 'Tab'] }
    ]
  },
  {
    key: 'editor',
    items: [
      { action: 'bold', keys: ['Ctrl', 'B'] },
      { action: 'italic', keys: ['Ctrl', 'I'] },
      { action: 'inlineCode', keys: ['Ctrl', 'Alt', 'C'] },
      { action: 'link', keys: ['Ctrl', 'K'] },
      { action: 'list', keys: ['Ctrl', 'L'] },
      { action: 'checklist', keys: ['Ctrl', 'Shift', 'L'] },
      { action: 'blockquote', keys: ['Ctrl', 'Alt', 'Q'] },
      { action: 'heading1', keys: ['Ctrl', 'Alt', '1'] },
      { action: 'heading2', keys: ['Ctrl', 'Alt', '2'] },
      { action: 'heading3', keys: ['Ctrl', 'Alt', '3'] },
      { action: 'codeBlock', keys: ['Ctrl', 'Shift', 'K'] }
    ]
  }
] as const

type SettingsTab = 'general' | 'preview' | 'shortcuts'

export function SettingsDialog({ settings, onClose, onChange }: SettingsDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

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
        <div className="settings-tabs" role="tablist" aria-label={t('settingsDialog.title')}>
          {(['general', 'preview', 'shortcuts'] as const).map((tab) => (
            <button
              key={tab}
              className={`settings-tabs__button ${activeTab === tab ? 'settings-tabs__button--active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {t(`settingsDialog.${tab}`)}
            </button>
          ))}
        </div>

        {activeTab === 'general' && (
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
        )}

        {activeTab === 'preview' && (
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
        )}

        {activeTab === 'shortcuts' && (
          <div className="settings-shortcuts" aria-label={t('settingsDialog.shortcuts')}>
            {SHORTCUT_SECTIONS.map((section) => (
              <section className="settings-section" key={section.key}>
                <h3 className="settings-section__heading">
                  {t(`settingsDialog.shortcutSections.${section.key}`)}
                </h3>

                <div className="settings-shortcut-list">
                  {section.items.map((item) => (
                    <div className="settings-shortcut" key={item.action}>
                      <span className="settings-shortcut__label">
                        {t(`settingsDialog.shortcutActions.${item.action}`)}
                      </span>
                      <span className="settings-shortcut__keys">
                        {item.keys.map((key) => (
                          <kbd className="settings-shortcut__key" key={key}>
                            {key}
                          </kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
