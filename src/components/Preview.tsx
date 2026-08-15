import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Settings, Theme } from '../../electron/shared'
import { getActivePreviewHeadingId, scrollPreviewHeadingIntoView } from '../lib/previewScroll'
import { activatePreviewSearchMatch, highlightPreviewSearchMatches } from '../lib/previewSearch'
import { renderMermaidFlowcharts } from '../lib/mermaid'
import { MermaidDiagramDialog, type DiagramContent } from './MermaidDiagramDialog'

interface PreviewProps {
  html: string
  documentName: string
  mdTheme: Theme
  searchTerm: string
  onActiveHeadingChange: (id: string | null) => void
  activeSearchIndex: number | null
  onSearchMatchCountChange: (count: number) => void
  settings: Settings
  onOpenLocalPath: (fileUrl: string) => void
  onPreviewHeadingsChange: (headings: HTMLElement[]) => void
  className?: string
}

interface ActiveDiagram {
  content: DiagramContent
  name: string
  index: number
  total: number
}

type PreviewGraphic = SVGSVGElement | HTMLImageElement
const MAX_SEARCH_HIGHLIGHTS = 2_000

function previewGraphics(body: HTMLDivElement | null): PreviewGraphic[] {
  if (!body) return []
  return Array.from(body.querySelectorAll<PreviewGraphic>('svg, img')).filter((graphic) =>
    !graphic.closest('.katex') &&
    (graphic instanceof HTMLImageElement || !graphic.parentElement?.closest('svg'))
  )
}

function graphicContent(graphic: PreviewGraphic): DiagramContent {
  if (graphic instanceof SVGSVGElement) {
    return { type: 'svg', svgMarkup: graphic.outerHTML }
  }

  return {
    type: 'image',
    imageSrc: graphic.currentSrc || graphic.src,
    imageSize: {
      width: graphic.naturalWidth || graphic.clientWidth || 1000,
      height: graphic.naturalHeight || graphic.clientHeight || 700
    }
  }
}

/** Renders sanitized Markdown HTML and resolves in-document heading anchors. */
export function Preview({
  html,
  documentName,
  mdTheme,
  searchTerm,
  onActiveHeadingChange,
  activeSearchIndex,
  onSearchMatchCountChange,
  settings,
  onOpenLocalPath,
  onPreviewHeadingsChange,
  className
}: PreviewProps): JSX.Element {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [renderedHtml, setRenderedHtml] = useState(html)
  const [activeDiagram, setActiveDiagram] = useState<ActiveDiagram | null>(null)

  const openDiagramAt = useCallback((index: number): void => {
    const diagrams = previewGraphics(bodyRef.current)
    const graphic = diagrams[index]
    if (!graphic) return
    const container = graphic.closest<HTMLElement>('.mermaid-diagram')
    const type = container?.dataset.mermaidType
    const graphicName = graphic instanceof SVGSVGElement
      ? graphic.querySelector('title')?.textContent?.trim()
      : graphic.alt.trim()
    // Author-provided titles stay verbatim; type names are localized.
    const name = (container?.dataset.mermaidTitle ?? graphicName)
      || (type ? t(`preview.diagramTypes.${type}`, { defaultValue: t('preview.diagramTitle') }) : t('preview.diagramTitle'))
    setActiveDiagram({ content: graphicContent(graphic), name, index: index + 1, total: diagrams.length })
  }, [t])

  useEffect(() => {
    let canceled = false
    setRenderedHtml(html)

    void renderMermaidFlowcharts(html, mdTheme).then((nextHtml) => {
      if (!canceled) setRenderedHtml(nextHtml)
    })

    return () => {
      canceled = true
    }
  }, [html, mdTheme])

  const handleClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const copyButton = target.closest<HTMLButtonElement>('.code-copy-button')
    if (copyButton) {
      const code = copyButton.closest('.code-block')?.querySelector('code')?.textContent ?? ''
      void navigator.clipboard.writeText(code).then(() => {
        copyButton.classList.add('code-copy-button--copied')
        copyButton.setAttribute('aria-label', t('preview.codeCopied'))
        copyButton.title = t('preview.codeCopied')
        window.setTimeout(() => {
          copyButton.classList.remove('code-copy-button--copied')
          copyButton.setAttribute('aria-label', t('preview.copyCode'))
          copyButton.title = t('preview.copyCode')
        }, 1600)
      })
      return
    }

    const mermaidGraphic = target.closest('.mermaid-diagram')?.querySelector<SVGSVGElement>('svg')
    const graphic = mermaidGraphic ?? target.closest<SVGSVGElement>('svg') ?? target.closest<HTMLImageElement>('img')
    if (graphic && !graphic.closest('.katex')) {
      const diagrams = previewGraphics(bodyRef.current)
      openDiagramAt(Math.max(diagrams.indexOf(graphic), 0))
      return
    }

    const anchor = target.closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    if (href.startsWith('#')) {
      e.preventDefault()
      const id = decodeURIComponent(href.slice(1))
      const target =
        bodyRef.current?.querySelector(`#${CSS.escape(id)}`) ?? document.getElementById(id)
      if (target instanceof HTMLElement) scrollPreviewHeadingIntoView(target)
      return
    }
    if (/^file:/i.test(href)) {
      e.preventDefault()
      onOpenLocalPath(href)
    }
    // External http(s) links carry target="_blank"; the main process opens them
    // in the OS browser via the window-open handler.
  }, [onOpenLocalPath, openDiagramAt, t])

  useEffect(() => {
    if (!bodyRef.current) return

    bodyRef.current.querySelectorAll('.code-copy-button').forEach((button) => button.remove())
    bodyRef.current.querySelectorAll('pre').forEach((pre) => {
      if (!pre.querySelector(':scope > code')) return
      let wrapper = pre.parentElement
      if (!wrapper?.classList.contains('code-block')) {
        wrapper = document.createElement('div')
        wrapper.className = 'code-block'
        pre.before(wrapper)
        wrapper.append(pre)
      }
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'code-copy-button'
      button.setAttribute('aria-label', t('preview.copyCode'))
      button.title = t('preview.copyCode')
      wrapper.append(button)
    })
  }, [renderedHtml, t])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return

    const handleSelectionChange = (): void => {
      const selection = document.getSelection()
      const range = selection && !selection.isCollapsed && selection.rangeCount > 0
        ? selection.getRangeAt(0)
        : null
      const selectionElement = (node: Node | null): Element | null =>
        node instanceof Element ? node : node?.parentElement ?? null
      const selectionInsideCode = Boolean(
        selection && !selection.isCollapsed && (
          selectionElement(selection.anchorNode)?.closest('.code-block') ||
          selectionElement(selection.focusNode)?.closest('.code-block')
        )
      )
      const selectsCode = selectionInsideCode || Boolean(
        range && Array.from(body.querySelectorAll('.code-block')).some((block) => range.intersectsNode(block))
      )

      body.classList.toggle('markdown-body--selecting-code', selectsCode)
      body.querySelectorAll<HTMLButtonElement>('.code-copy-button').forEach((button) => {
        button.hidden = selectsCode
      })
    }

    const handlePointerUp = (): void => {
      window.setTimeout(handleSelectionChange)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keyup', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('keyup', handleSelectionChange)
    }
  }, [])

  useEffect(() => {
    if (!bodyRef.current) return
    let canceled = false
    const images = Array.from(bodyRef.current.querySelectorAll('img[data-local-src]')) as HTMLImageElement[]

    for (const image of images) {
      const filePath = image.dataset.localSrc
      if (!filePath) continue

      void window.api.readImageAsDataUrl(filePath).then((result) => {
        if (canceled || !result.ok) return
        image.src = result.dataUrl
      })
    }

    return () => {
      canceled = true
    }
  }, [renderedHtml])

  useEffect(() => {
    if (!bodyRef.current) return
    const count = highlightPreviewSearchMatches(bodyRef.current, searchTerm, MAX_SEARCH_HIGHLIGHTS)
    onSearchMatchCountChange(count)
  }, [onSearchMatchCountChange, renderedHtml, searchTerm])

  useEffect(() => {
    if (!bodyRef.current || !searchTerm.trim()) return
    const activeMatch = activatePreviewSearchMatch(bodyRef.current, activeSearchIndex)
    activeMatch?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  }, [activeSearchIndex, renderedHtml, searchTerm])

  // Keep outline state tied to preview DOM currently displayed. `renderedHtml`
  // can differ from `html` while Mermaid diagrams finish rendering.
  useEffect(() => {
    const body = bodyRef.current
    const scroller = body?.closest('.pane') as HTMLElement | null
    if (!body || !scroller) return

    const headings = Array.from(body.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
    onPreviewHeadingsChange(headings)
    if (headings.length === 0) {
      onActiveHeadingChange(null)
      return
    }

    const updateActiveHeading = (): void => {
      onActiveHeadingChange(getActivePreviewHeadingId(scroller, headings))
    }

    updateActiveHeading()
    scroller.addEventListener('scroll', updateActiveHeading, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', updateActiveHeading)
      onPreviewHeadingsChange([])
    }
  }, [onActiveHeadingChange, onPreviewHeadingsChange, renderedHtml])

  return (
    <div className={`pane ${className ?? ''}`} data-md-theme={mdTheme}>
      <div
        ref={bodyRef}
        className={`markdown-body ${settings.previewFluidWidth ? 'markdown-body--fluid' : ''}`}
        style={{
          fontFamily: settings.previewFontFamily,
          fontSize: `${settings.previewFontSize}px`,
          lineHeight: settings.previewLineHeight,
          '--reading-width': `${settings.previewWidth}%`
        } as CSSProperties}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
      <MermaidDiagramDialog
        content={activeDiagram?.content ?? null}
        diagramName={activeDiagram?.name ?? t('preview.diagramTitle')}
        diagramIndex={activeDiagram?.index ?? 0}
        diagramCount={activeDiagram?.total ?? 0}
        documentName={documentName}
        mdTheme={mdTheme}
        onPrevious={activeDiagram && activeDiagram.index > 1 ? () => openDiagramAt(activeDiagram.index - 2) : undefined}
        onNext={activeDiagram && activeDiagram.index < activeDiagram.total ? () => openDiagramAt(activeDiagram.index) : undefined}
        onClose={() => setActiveDiagram(null)}
      />
    </div>
  )
}
