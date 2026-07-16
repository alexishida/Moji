import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Theme } from '../../electron/shared'
import { IconChevronRight, IconDownload, IconFitToView, IconImage, IconMinus, IconPlus, IconX } from './icons'

export type DiagramContent =
  | { type: 'svg'; svgMarkup: string }
  | { type: 'image'; imageSrc: string; imageSize: DiagramSize }

interface MermaidDiagramDialogProps {
  content: DiagramContent | null
  diagramName: string
  diagramIndex: number
  diagramCount: number
  documentName: string
  mdTheme: Theme
  onPrevious?: () => void
  onNext?: () => void
  onClose: () => void
}

interface DiagramSize {
  width: number
  height: number
}

interface DiagramView {
  zoom: number
  x: number
  y: number
}

interface ModalBounds {
  left: number
  top: number
  width: number
  height: number
}

type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const ZOOM_LEVELS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 10]
const MIN_ZOOM = ZOOM_LEVELS[0]
const MAX_ZOOM = ZOOM_LEVELS.at(-1) ?? 8
const MINIMAP_WIDTH = 160
const MINIMAP_HEIGHT = 110
const MODAL_MIN_WIDTH = 480
const MODAL_MIN_HEIGHT = 360
const MODAL_WINDOW_GUTTER = 32

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function diagramSize(svgMarkup: string): DiagramSize {
  const svg = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml').documentElement
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: viewBox[2], height: viewBox[3] }
  }

  const width = Number.parseFloat(svg.getAttribute('width') ?? '')
  const height = Number.parseFloat(svg.getAttribute('height') ?? '')
  return {
    width: Number.isFinite(width) && width > 0 ? width : 1000,
    height: Number.isFinite(height) && height > 0 ? height : 700
  }
}

function exportNamePart(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

async function svgToPngDataUrl(svgMarkup: string): Promise<string> {
  const size = diagramSize(svgMarkup)
  const scale = Math.min(2, 8192 / Math.max(size.width, size.height))
  const svg = svgMarkup.includes('xmlns=')
    ? svgMarkup
    : svgMarkup.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"')
  // Renderer CSP allows `data:` images but deliberately blocks `blob:` URLs.
  // Keeping the SVG local also avoids granting broader image-source permission.
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Could not render diagram image.'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(size.width * scale)
  canvas.height = Math.ceil(size.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create image canvas.')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

async function imageToPngDataUrl(imageSrc: string, size: DiagramSize): Promise<string> {
  const scale = Math.min(2, 8192 / Math.max(size.width, size.height))
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Could not render diagram image.'))
    image.src = imageSrc
  })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(size.width * scale)
  canvas.height = Math.ceil(size.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create image canvas.')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/** Full-screen graphic viewer with pan, zoom, minimap, and PNG export. */
export function MermaidDiagramDialog({
  content,
  diagramName,
  diagramIndex,
  diagramCount,
  documentName,
  mdTheme,
  onPrevious,
  onNext,
  onClose
}: MermaidDiagramDialogProps): JSX.Element | null {
  const { t } = useTranslation()
  const modalRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null)
  const minimapPointerRef = useRef<number | null>(null)
  const resizeRef = useRef<{ pointerId: number; direction: ResizeDirection; x: number; y: number } & ModalBounds | null>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [modalBounds, setModalBounds] = useState<ModalBounds | null>(null)
  const [view, setView] = useState<DiagramView>({ zoom: 1, x: 0, y: 0 })
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const sourceSize = useMemo(() => {
    if (!content) return null
    return content.type === 'svg' ? diagramSize(content.svgMarkup) : content.imageSize
  }, [content])
  const contentSize = useMemo<DiagramSize>(() => {
    if (!sourceSize || !stageSize.width || !stageSize.height) return { width: 0, height: 0 }
    const scale = Math.min(
      (stageSize.width - 80) / sourceSize.width,
      (stageSize.height - 80) / sourceSize.height,
      1
    )
    return { width: sourceSize.width * scale, height: sourceSize.height * scale }
  }, [sourceSize, stageSize])

  useEffect(() => {
    setView({ zoom: 1, x: 0, y: 0 })
    setExportError(null)
  }, [content])

  useEffect(() => {
    if (!content) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [content, onClose])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !content) return
    const update = (): void => setStageSize({ width: stage.clientWidth, height: stage.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [content])

  if (!content || !sourceSize) return null

  const updateZoom = (zoom: number): void => {
    setView((current) => {
      const nextZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
      const zoomRatio = nextZoom / current.zoom
      // Keep the same diagram coordinate at the center of the viewport while
      // zoom changes; preserving pixel offsets would make a panned diagram drift.
      return {
        zoom: nextZoom,
        x: current.x * zoomRatio,
        y: current.y * zoomRatio
      }
    })
  }

  const fitToView = (): void => {
    setView({ zoom: 1, x: 0, y: 0 })
  }

  const stepZoom = (direction: -1 | 1): void => {
    const currentIndex = ZOOM_LEVELS.indexOf(view.zoom)
    const nearestIndex = currentIndex >= 0
      ? currentIndex
      : ZOOM_LEVELS.findIndex((zoom) => zoom >= view.zoom)
    const nextIndex = clamp(nearestIndex + direction, 0, ZOOM_LEVELS.length - 1)
    updateZoom(ZOOM_LEVELS[nextIndex])
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    dragRef.current = {
      pointerId: event.pointerId,
      x: view.x,
      y: view.y,
      startX: event.clientX,
      startY: event.clientY
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setView((current) => ({
      ...current,
      x: drag.x + event.clientX - drag.startX,
      y: drag.y + event.clientY - drag.startY
    }))
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>): void => {
    event.preventDefault()
    stepZoom(event.deltaY < 0 ? 1 : -1)
  }

  const handleResizePointerDown = (direction: ResizeDirection, event: PointerEvent<HTMLDivElement>): void => {
    const bounds = modalRef.current?.getBoundingClientRect()
    if (!bounds) return
    event.stopPropagation()
    resizeRef.current = {
      pointerId: event.pointerId,
      direction,
      x: event.clientX,
      y: event.clientY,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleResizePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    event.stopPropagation()
    const deltaX = event.clientX - resize.x
    const deltaY = event.clientY - resize.y
    const right = resize.left + resize.width
    const bottom = resize.top + resize.height
    const resizeFromWest = resize.direction.includes('w')
    const resizeFromNorth = resize.direction.includes('n')
    const width = resize.direction.includes('e')
      ? clamp(resize.width + deltaX, MODAL_MIN_WIDTH, window.innerWidth - MODAL_WINDOW_GUTTER - resize.left)
      : resizeFromWest
        ? clamp(resize.width - deltaX, MODAL_MIN_WIDTH, right - MODAL_WINDOW_GUTTER)
        : resize.width
    const height = resize.direction.includes('s')
      ? clamp(resize.height + deltaY, MODAL_MIN_HEIGHT, window.innerHeight - MODAL_WINDOW_GUTTER - resize.top)
      : resizeFromNorth
        ? clamp(resize.height - deltaY, MODAL_MIN_HEIGHT, bottom - MODAL_WINDOW_GUTTER)
        : resize.height
    setModalBounds({
      left: resizeFromWest ? right - width : resize.left,
      top: resizeFromNorth ? bottom - height : resize.top,
      width,
      height
    })
  }

  const handleResizePointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    if (resizeRef.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const visibleWidth = stageSize.width / view.zoom
  const visibleHeight = stageSize.height / view.zoom
  const centerX = contentSize.width / 2 - view.x / view.zoom
  const centerY = contentSize.height / 2 - view.y / view.zoom
  const viewportLeft = centerX - visibleWidth / 2
  const viewportTop = centerY - visibleHeight / 2
  const viewportRight = centerX + visibleWidth / 2
  const viewportBottom = centerY + visibleHeight / 2
  const paddingX = Math.max(48, visibleWidth * 0.16)
  const paddingY = Math.max(48, visibleHeight * 0.16)
  const minimapLeft = Math.min(0, viewportLeft) - paddingX
  const minimapTop = Math.min(0, viewportTop) - paddingY
  const minimapRight = Math.max(contentSize.width, viewportRight) + paddingX
  const minimapBottom = Math.max(contentSize.height, viewportBottom) + paddingY
  const minimapWorldWidth = minimapRight - minimapLeft
  const minimapWorldHeight = minimapBottom - minimapTop
  const minimapScale = minimapWorldWidth && minimapWorldHeight
    ? Math.min(MINIMAP_WIDTH / minimapWorldWidth, MINIMAP_HEIGHT / minimapWorldHeight)
    : 1
  const minimapRenderedWidth = minimapWorldWidth * minimapScale
  const minimapRenderedHeight = minimapWorldHeight * minimapScale
  const minimapOffsetX = (MINIMAP_WIDTH - minimapRenderedWidth) / 2
  const minimapOffsetY = (MINIMAP_HEIGHT - minimapRenderedHeight) / 2
  const minimapDiagramX = minimapOffsetX + (0 - minimapLeft) * minimapScale
  const minimapDiagramY = minimapOffsetY + (0 - minimapTop) * minimapScale
  const viewportWidth = visibleWidth * minimapScale
  const viewportHeight = visibleHeight * minimapScale
  const viewportX = minimapOffsetX + (viewportLeft - minimapLeft) * minimapScale
  const viewportY = minimapOffsetY + (viewportTop - minimapTop) * minimapScale

  const navigateMinimap = (event: PointerEvent<HTMLDivElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = clamp(
      (event.clientX - bounds.left - minimapOffsetX) / minimapScale + minimapLeft,
      minimapLeft,
      minimapRight
    )
    const y = clamp(
      (event.clientY - bounds.top - minimapOffsetY) / minimapScale + minimapTop,
      minimapTop,
      minimapBottom
    )
    setView((current) => {
      return {
        ...current,
        x: (contentSize.width / 2 - x) * current.zoom,
        y: (contentSize.height / 2 - y) * current.zoom
      }
    })
  }

  const handleMinimapPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    minimapPointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    navigateMinimap(event)
  }

  const handleMinimapPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (minimapPointerRef.current !== event.pointerId) return
    event.stopPropagation()
    navigateMinimap(event)
  }

  const handleMinimapPointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    if (minimapPointerRef.current !== event.pointerId) return
    event.stopPropagation()
    minimapPointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleExport = async (): Promise<void> => {
    setExportError(null)
    setExporting(true)
    try {
      const dataUrl = content.type === 'svg'
        ? await svgToPngDataUrl(content.svgMarkup)
        : await imageToPngDataUrl(content.imageSrc, content.imageSize)
      const fileName = exportNamePart(documentName.replace(/\.[^.]+$/, ''), 'document')
      const name = exportNamePart(diagramName, 'diagram')
      const result = await window.api.exportDiagramPng({ dataUrl, baseName: `${fileName}-${name}-${diagramIndex}` })
      if (!result.ok && !result.canceled) setExportError(result.error ?? t('preview.diagramExportFailed'))
    } catch (error) {
      setExportError(error instanceof Error ? error.message : t('preview.diagramExportFailed'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="diagram-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        ref={modalRef}
        className="diagram-modal"
        style={modalBounds ? { position: 'fixed', ...modalBounds } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagram-modal-title"
      >
        <header className="diagram-modal__header">
          <h2 id="diagram-modal-title" className="diagram-modal__title">
            <IconImage aria-hidden="true" />
            <span>{diagramName}</span>
          </h2>
          <div className="diagram-modal__navigation">
            <button className="iconbtn diagram-modal__navigation-button" type="button" onClick={onPrevious} disabled={!onPrevious} aria-label={t('preview.previousDiagram')} title={t('preview.previousDiagram')}>
              <IconChevronRight className="diagram-modal__previous-icon" strokeWidth={2.6} />
            </button>
            <span className="diagram-modal__count">{diagramIndex}/{diagramCount}</span>
            <button className="iconbtn diagram-modal__navigation-button" type="button" onClick={onNext} disabled={!onNext} aria-label={t('preview.nextDiagram')} title={t('preview.nextDiagram')}>
              <IconChevronRight strokeWidth={2.6} />
            </button>
          </div>
          <div className="diagram-modal__actions">
            <button className="iconbtn" type="button" onClick={() => stepZoom(-1)} disabled={view.zoom === MIN_ZOOM} aria-label={t('preview.zoomOut')} title={t('preview.zoomOut')}>
              <IconMinus />
            </button>
            <select className="diagram-modal__zoom-select" value={String(view.zoom)} onChange={(event) => {
              if (event.target.value === 'fit') fitToView()
              else updateZoom(Number(event.target.value))
            }} aria-label={t('preview.zoomLevel', { value: Math.round(view.zoom * 100) })}>
              <option value="fit">{t('preview.fitToView')}</option>
              {ZOOM_LEVELS.map((zoom) => <option key={zoom} value={zoom}>{Math.round(zoom * 100)}%</option>)}
            </select>
            <button className="iconbtn" type="button" onClick={() => stepZoom(1)} disabled={view.zoom === MAX_ZOOM} aria-label={t('preview.zoomIn')} title={t('preview.zoomIn')}>
              <IconPlus />
            </button>
            <button className="iconbtn" type="button" onClick={fitToView} aria-label={t('preview.fitToView')} title={t('preview.fitToView')}>
              <IconFitToView />
            </button>
            <button className="iconbtn diagram-modal__export" type="button" onClick={() => void handleExport()} disabled={exporting} aria-label={t('preview.exportDiagramPng')} title={t('preview.exportDiagramPng')}>
              <IconDownload />
            </button>
            <button className="iconbtn diagram-modal__close" type="button" onClick={onClose} aria-label={t('preview.closeDiagram')} title={t('preview.closeDiagram')}>
              <IconX />
            </button>
          </div>
        </header>
        <div
          ref={stageRef}
          className={`diagram-modal__stage${dragRef.current ? ' diagram-modal__stage--dragging' : ''}`}
          data-md-theme={mdTheme}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
        >
          <div
            className="diagram-modal__canvas"
            style={{
              width: contentSize.width,
              height: contentSize.height,
              transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.zoom})`
            }}
          >
            {content.type === 'svg'
              ? <div dangerouslySetInnerHTML={{ __html: content.svgMarkup }} />
              : <img src={content.imageSrc} alt="" draggable={false} />}
          </div>
          {view.zoom > 1 && (
            <div
              className="diagram-minimap"
              onPointerDown={handleMinimapPointerDown}
              onPointerMove={handleMinimapPointerMove}
              onPointerUp={handleMinimapPointerEnd}
              onPointerCancel={handleMinimapPointerEnd}
              aria-label={t('preview.minimap')}
            >
              <div
                className="diagram-minimap__canvas"
                style={{
                  width: contentSize.width,
                  height: contentSize.height,
                  left: minimapDiagramX,
                  top: minimapDiagramY,
                  transform: `scale(${minimapScale})`
                }}
              >
                {content.type === 'svg'
                  ? <div dangerouslySetInnerHTML={{ __html: content.svgMarkup }} />
                  : <img src={content.imageSrc} alt="" draggable={false} />}
              </div>
              <div className="diagram-minimap__viewport" style={{ left: viewportX, top: viewportY, width: viewportWidth, height: viewportHeight }} />
            </div>
          )}
        </div>
        {exportError && <p className="diagram-modal__error" role="alert">{exportError}</p>}
        {(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as const).map((direction) => (
          <div
            key={direction}
            className={`diagram-modal__resize-handle diagram-modal__resize-handle--${direction}`}
            onPointerDown={(event) => handleResizePointerDown(direction, event)}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerEnd}
            onPointerCancel={handleResizePointerEnd}
          />
        ))}
      </section>
    </div>
  )
}
