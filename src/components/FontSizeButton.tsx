import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconMinus, IconPlus, IconRefresh, IconTextSize } from './icons'

interface FontSizeButtonProps {
  value: number
  disabled: boolean
  onChange: (value: number) => void
}

const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 24
const DEFAULT_FONT_SIZE = 16

export function FontSizeButton({ value, disabled, onChange }: FontSizeButtonProps): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const controlRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!open) return

    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="font-size-control" ref={controlRef}>
      <button
        className={`iconbtn ${open ? 'iconbtn--active' : ''}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        title={t('toolbar.fontSize')}
        aria-label={t('toolbar.fontSize')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <IconTextSize />
      </button>

      {open && (
        <div className="font-size-popover" role="dialog" aria-label={t('toolbar.fontSize')}>
          <button
            className="iconbtn font-size-popover__button"
            type="button"
            onClick={() => onChange(Math.max(MIN_FONT_SIZE, value - 1))}
            disabled={value <= MIN_FONT_SIZE}
            title={t('toolbar.decreaseFontSize')}
            aria-label={t('toolbar.decreaseFontSize')}
          >
            <IconMinus width={16} height={16} />
          </button>
          <output className="font-size-popover__value" aria-live="polite">
            {value} px
          </output>
          <button
            className="iconbtn font-size-popover__button"
            type="button"
            onClick={() => onChange(Math.min(MAX_FONT_SIZE, value + 1))}
            disabled={value >= MAX_FONT_SIZE}
            title={t('toolbar.increaseFontSize')}
            aria-label={t('toolbar.increaseFontSize')}
          >
            <IconPlus width={16} height={16} />
          </button>
          <button
            className="btn font-size-popover__reset"
            type="button"
            onClick={() => onChange(DEFAULT_FONT_SIZE)}
            disabled={value === DEFAULT_FONT_SIZE}
            title={t('toolbar.resetFontSize')}
          >
            <IconRefresh width={15} height={15} />
            {t('toolbar.resetFontSize')}
          </button>
        </div>
      )}
    </div>
  )
}
