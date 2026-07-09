import { useState } from 'react'
import type { SVGProps } from 'react'
import { useTranslation } from 'react-i18next'
import { EXPORT_PAGE_SIZES, type ExportFormat, type ExportPageOrientation, type ExportPageSize } from '../../electron/shared'
import { IconCode, IconDownload, IconFilePdf, IconImage, IconX } from './icons'

export interface ExportDialogOptions {
  format: ExportFormat
  pageSize: ExportPageSize
  pageOrientation: ExportPageOrientation
}

interface ExportDialogProps {
  initialFormat: ExportFormat
  onCancel: () => void
  onExport: (options: ExportDialogOptions) => void
}

const FORMATS: Array<{
  value: ExportFormat
  titleKey: string
  descriptionKey: string
  icon: (props: SVGProps<SVGSVGElement>) => JSX.Element
}> = [
  {
    value: 'pdf',
    titleKey: 'exportDialog.pdfTitle',
    descriptionKey: 'exportDialog.pdfDescription',
    icon: IconFilePdf
  },
  {
    value: 'html',
    titleKey: 'exportDialog.htmlTitle',
    descriptionKey: 'exportDialog.htmlDescription',
    icon: IconCode
  },
  {
    value: 'png',
    titleKey: 'exportDialog.pngTitle',
    descriptionKey: 'exportDialog.pngDescription',
    icon: IconImage
  }
]

export function ExportDialog({ initialFormat, onCancel, onExport }: ExportDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [format, setFormat] = useState<ExportFormat>(initialFormat)
  const [pageSize, setPageSize] = useState<ExportPageSize>('A4')
  const [pageOrientation, setPageOrientation] = useState<ExportPageOrientation>('portrait')

  return (
    <section className="export-dialog export-dialog--inline" aria-label={t('exportDialog.title')}>
      <header className="export-dialog__header">
        <h2 className="export-dialog__title">
          <IconDownload width={18} height={18} aria-hidden="true" />
          <span>{t('exportDialog.title')}</span>
        </h2>
        <button className="iconbtn" onClick={onCancel} title={t('dialog.cancel')} aria-label={t('dialog.cancel')}>
          <IconX />
        </button>
      </header>

      <div className="export-dialog__body">
        <div className="export-dialog__panel">
          <h3 className="export-dialog__heading">{t('exportDialog.format')}</h3>
          <div className="export-format-list" role="radiogroup" aria-label={t('exportDialog.format')}>
            {FORMATS.map((option) => {
              const Icon = option.icon
              const selected = format === option.value
              return (
                <button
                  key={option.value}
                  className={`export-format ${selected ? 'export-format--selected' : ''}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setFormat(option.value)}
                >
                  <span className="export-format__radio" aria-hidden="true" />
                  <Icon className="export-format__icon" width={24} height={24} />
                  <span className="export-format__copy">
                    <span className="export-format__title">{t(option.titleKey)}</span>
                    <span className="export-format__description">{t(option.descriptionKey)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="export-dialog__divider" />

        <div className="export-dialog__panel">
          {format === 'pdf' && <h3 className="export-dialog__heading">{t('exportDialog.settings')}</h3>}
          {format === 'pdf' && (
            <div className="export-field-list">
              <label className="export-field">
                <span className="export-field__label">{t('exportDialog.pageSize')}</span>
                <select
                  className="select export-field__control"
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as ExportPageSize)}
                >
                  {EXPORT_PAGE_SIZES.map((size) => (
                    <option key={size.value} value={size.value}>
                      {size.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="export-field">
                <span className="export-field__label">{t('exportDialog.orientation')}</span>
                <select
                  className="select export-field__control"
                  value={pageOrientation}
                  onChange={(e) => setPageOrientation(e.target.value as ExportPageOrientation)}
                >
                  <option value="portrait">{t('exportDialog.portrait')}</option>
                  <option value="landscape">{t('exportDialog.landscape')}</option>
                </select>
              </label>
            </div>
          )}
        </div>
      </div>

      <footer className="export-dialog__footer">
        <button className="btn btn--primary" onClick={() => onExport({ format, pageSize, pageOrientation })}>
          <IconDownload width={15} height={15} />
          {t('exportDialog.export')}
        </button>
      </footer>
    </section>
  )
}
