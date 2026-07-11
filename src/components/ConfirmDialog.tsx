import { useTranslation } from 'react-i18next'
import { IconAlertTriangle, IconSave, IconTrash, IconX } from './icons'

export type ConfirmChoice = 'save' | 'discard' | 'cancel'

interface ConfirmDialogProps {
  onChoice: (choice: ConfirmChoice) => void
}

/** Modal shown before an action would discard unsaved changes. */
export function ConfirmDialog({ onChoice }: ConfirmDialogProps): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="dialog-backdrop" onClick={() => onChoice('cancel')}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog__title">
          <IconAlertTriangle className="dialog__title-icon" aria-hidden="true" />
          <span>{t('dialog.unsavedTitle')}</span>
        </h2>
        <p className="dialog__body">{t('dialog.unsavedBody')}</p>
        <div className="dialog__actions">
          <button className="btn" onClick={() => onChoice('cancel')}>
            <IconX aria-hidden="true" />
            {t('dialog.cancel')}
          </button>
          <button className="btn" onClick={() => onChoice('discard')}>
            <IconTrash aria-hidden="true" />
            {t('dialog.discard')}
          </button>
          <button className="btn btn--primary" onClick={() => onChoice('save')}>
            <IconSave aria-hidden="true" />
            {t('dialog.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
