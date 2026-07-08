import { useTranslation } from 'react-i18next'

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
        <h2 className="dialog__title">{t('dialog.unsavedTitle')}</h2>
        <p className="dialog__body">{t('dialog.unsavedBody')}</p>
        <div className="dialog__actions">
          <button className="btn" onClick={() => onChoice('cancel')}>
            {t('dialog.cancel')}
          </button>
          <button className="btn" onClick={() => onChoice('discard')}>
            {t('dialog.discard')}
          </button>
          <button className="btn btn--primary" onClick={() => onChoice('save')}>
            {t('dialog.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
