import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SPLIT_RATIO_DEFAULT, SPLIT_RATIO_MAX, SPLIT_RATIO_MIN, normalizeSplitRatio } from '../../electron/shared'

interface SplitViewProps {
  /** When false only the editor pane is rendered, in the same tree position. */
  split: boolean
  /** Keep editor mounted but show only the preview. */
  viewOnly?: boolean
  /** Editor share of the width, as a percentage. */
  ratio: number
  editor: ReactNode
  preview: ReactNode
  onRatioChange: (ratio: number) => void
  onFocusPane: (pane: 'editor' | 'preview') => void
}

const KEYBOARD_STEP = 2

/**
 * Editor with an optional live preview beside it.
 *
 * The editor keeps the same position in the tree whether or not the preview is showing, so
 * toggling the split never remounts CodeMirror and never drops undo history or the caret.
 */
export function SplitView({ split, viewOnly = false, ratio, editor, preview, onRatioChange, onFocusPane }: SplitViewProps): JSX.Element {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const current = dragRatio ?? normalizeSplitRatio(ratio)

  const ratioAtPointer = useCallback((clientX: number): number | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return normalizeSplitRatio(((clientX - rect.left) / rect.width) * 100)
  }, [])

  const startDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragRatio(ratioAtPointer(event.clientX) ?? current)
  }, [current, ratioAtPointer])

  const moveDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragRatio === null) return
    const next = ratioAtPointer(event.clientX)
    if (next !== null) setDragRatio(next)
  }, [dragRatio, ratioAtPointer])

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragRatio === null) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragRatio(null)
    if (dragRatio !== ratio) onRatioChange(dragRatio)
  }, [dragRatio, onRatioChange, ratio])

  // The divider unmounts the instant `split` turns off (e.g. the window shrank below the
  // width the split needs mid-drag), so a pointerup/pointercancel on it never fires. Without
  // this the ratio picked mid-gesture is silently dropped instead of persisted, and a later
  // `dragRatio` stays stuck overriding `ratio` until another drag starts and finishes normally.
  useEffect(() => {
    if (split || dragRatio === null) return
    const finalRatio = dragRatio
    setDragRatio(null)
    if (finalRatio !== ratio) onRatioChange(finalRatio)
  }, [split, dragRatio, ratio, onRatioChange])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowLeft' ? -KEYBOARD_STEP : event.key === 'ArrowRight' ? KEYBOARD_STEP : 0
    if (step !== 0) {
      event.preventDefault()
      onRatioChange(normalizeSplitRatio(current + step))
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      onRatioChange(event.key === 'Home' ? SPLIT_RATIO_MIN : SPLIT_RATIO_MAX)
    }
  }, [current, onRatioChange])

  return (
    <div
      ref={containerRef}
      className={`split ${split ? 'split--active' : ''} ${viewOnly ? 'split--view-only' : ''} ${dragRatio !== null ? 'split--dragging' : ''}`}
      style={{ '--split-ratio': `${current}%` } as CSSProperties}
    >
      <div className="split__pane split__pane--editor" onPointerDownCapture={() => onFocusPane('editor')}>
        {editor}
      </div>

      {(split || viewOnly) && (
        <>
          {split && <div
            className="split__divider"
            role="separator"
            aria-orientation="vertical"
            aria-label={t('toolbar.resizeSplit')}
            aria-valuenow={current}
            aria-valuemin={SPLIT_RATIO_MIN}
            aria-valuemax={SPLIT_RATIO_MAX}
            tabIndex={0}
            title={t('toolbar.resizeSplit')}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
            onDoubleClick={() => onRatioChange(SPLIT_RATIO_DEFAULT)}
          />}
          <div className="split__pane split__pane--preview" onPointerDownCapture={() => onFocusPane('preview')}>
            {preview}
          </div>
        </>
      )}
    </div>
  )
}
