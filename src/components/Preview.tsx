import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Settings, Theme } from '../../electron/shared'
import type { MarkdownRenderBlock } from '../lib/markdown'
import { findPreviewHeadingTarget, getActivePreviewHeadingId, scrollPreviewHeadingIntoView } from '../lib/previewScroll'
import { activatePreviewSearchMatch, highlightPreviewSearchMatchesIncremental } from '../lib/previewSearch'
import { collectPreviewBlockMetrics } from '../lib/previewLayoutMetrics'
import { selectionTouchesCodeBlock } from '../lib/previewSelection'
import {
  buildVirtualOffsets,
  buildVirtualSearchIndex,
  calculateVirtualRange,
  findVirtualBlockForHeading,
  findVirtualBlockForSearch,
  getVirtualActiveHeadingId
} from '../lib/previewVirtualization'
import { patchMermaidFlowcharts } from '../lib/mermaid'
import { beginRendererMeasure, captureRendererMemory, recordRendererMeasure, recordRendererObservation } from '../lib/performanceMetrics'
import { MermaidDiagramDialog, type DiagramContent } from './MermaidDiagramDialog'

interface PreviewProps {
  html: string
  blocks?: MarkdownRenderBlock[]
  virtualized?: boolean
  headingRequest?: { id: string; request: number } | null
  documentName: string
  mdTheme: Theme
  searchTerm: string
  onActiveHeadingChange: (id: string | null) => void
  activeSearchIndex: number | null
  onSearchMatchCountChange: (count: number) => void
  settings: Settings
  onOpenLocalPath: (fileUrl: string) => void
  onPreviewHeadingsChange: (headings: HTMLElement[]) => void
  /** Publishes the scroller so the split view can follow the editor. */
  onPaneElement?: (element: HTMLDivElement | null) => void
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
const LOCAL_IMAGE_LOAD_CONCURRENCY = 3
const LOCAL_IMAGE_PRELOAD_MARGIN = '600px 0px'
const VIRTUAL_OVERSCAN_PX = 900
const EMPTY_MARKDOWN_BLOCKS: MarkdownRenderBlock[] = []

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
  blocks = EMPTY_MARKDOWN_BLOCKS,
  virtualized = false,
  headingRequest = null,
  documentName,
  mdTheme,
  searchTerm,
  onActiveHeadingChange,
  activeSearchIndex,
  onSearchMatchCountChange,
  settings,
  onOpenLocalPath,
  onPreviewHeadingsChange,
  onPaneElement,
  className
}: PreviewProps): JSX.Element {
  const { t } = useTranslation()
  const paneRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const previewGeneration = useRef(0)
  const mermaidPatchGeneration = useRef(0)
  const previewMountMeasure = useRef<{ generation: number; finish: (details?: Record<string, number>) => void } | null>(null)
  const [activeDiagram, setActiveDiagram] = useState<ActiveDiagram | null>(null)
  const [measuredBlockHeights, setMeasuredBlockHeights] = useState<Map<number, number>>(new Map())
  const [virtualViewport, setVirtualViewport] = useState({ scrollTop: 0, height: 760 })
  const [domPatchVersion, setDomPatchVersion] = useState(0)
  const [searchScanVersion, setSearchScanVersion] = useState(0)
  const virtualScrollAnchor = useRef<{ index: number; distance: number } | null>(null)
  const virtualBlocks = virtualized ? blocks : EMPTY_MARKDOWN_BLOCKS
  const virtualOffsets = useMemo(
    () => buildVirtualOffsets(virtualBlocks, measuredBlockHeights),
    [measuredBlockHeights, virtualBlocks]
  )
  const virtualSearch = useMemo(
    () => buildVirtualSearchIndex(virtualBlocks, searchTerm, MAX_SEARCH_HIGHLIGHTS),
    [searchTerm, virtualBlocks]
  )
  const searchBlockIndex = findVirtualBlockForSearch(virtualSearch, activeSearchIndex)
  const requestedHeadingBlockIndex = headingRequest
    ? findVirtualBlockForHeading(virtualBlocks, headingRequest.id)
    : null
  const virtualRange = useMemo(
    () => calculateVirtualRange(
      virtualOffsets,
      virtualViewport.scrollTop,
      virtualViewport.height,
      VIRTUAL_OVERSCAN_PX
    ),
    [virtualOffsets, virtualViewport.height, virtualViewport.scrollTop]
  )
  const virtualOffsetsRef = useRef(virtualOffsets)
  virtualOffsetsRef.current = virtualOffsets
  /**
   * Identity of the body DOM currently mounted.
   *
   * The body is keyed by theme, so switching themes remounts it from the pristine HTML and
   * drops every imperative patch: image sources, copy buttons, search marks, observed nodes.
   * Effects that patch or observe the body re-run whenever this changes.
   */
  const bodyVersion = `${mdTheme}:${domPatchVersion}`

  useEffect(() => {
    onPaneElement?.(paneRef.current)
    return () => onPaneElement?.(null)
  }, [onPaneElement])

  useLayoutEffect(() => {
    const anchor = virtualScrollAnchor.current
    const pane = paneRef.current
    if (!anchor || !pane) return
    const top = virtualOffsets[anchor.index]
    if (top !== undefined) pane.scrollTop = Math.max(0, top - anchor.distance)
    virtualScrollAnchor.current = null
  }, [virtualOffsets])

  const handlePaneScroll = useCallback((): void => {
    const pane = paneRef.current
    if (!pane || !virtualized) return
    setVirtualViewport({ scrollTop: pane.scrollTop, height: pane.clientHeight })
  }, [virtualized])

  useEffect(() => {
    if (!virtualized || searchBlockIndex === null || !searchTerm.trim()) return
    const pane = paneRef.current
    if (!pane) return
    const top = virtualOffsetsRef.current[searchBlockIndex] ?? 0
    pane.scrollTo({ top, behavior: 'smooth' })
    setVirtualViewport({ scrollTop: top, height: pane.clientHeight })
  }, [activeSearchIndex, searchBlockIndex, searchTerm, virtualized])

  useEffect(() => {
    if (!virtualized || requestedHeadingBlockIndex === null || !headingRequest) return
    const pane = paneRef.current
    if (!pane) return
    const top = virtualOffsetsRef.current[requestedHeadingBlockIndex] ?? 0
    pane.scrollTo({ top, behavior: 'auto' })
    setVirtualViewport({ scrollTop: top, height: pane.clientHeight })
  }, [headingRequest, requestedHeadingBlockIndex, virtualized])

  useEffect(() => {
    if (!virtualized || !headingRequest || requestedHeadingBlockIndex === null) return
    if (requestedHeadingBlockIndex < virtualRange.start || requestedHeadingBlockIndex >= virtualRange.end) return
    const frame = requestAnimationFrame(() => {
      const candidate = document.getElementById(headingRequest.id)
      const target = candidate && bodyRef.current?.contains(candidate) ? candidate : null
      if (target) scrollPreviewHeadingIntoView(target, 'auto')
    })
    return () => cancelAnimationFrame(frame)
  }, [headingRequest, requestedHeadingBlockIndex, virtualRange.end, virtualRange.start, virtualized])

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
    const generation = previewGeneration.current + 1
    previewGeneration.current = generation
    previewMountMeasure.current = {
      generation,
      finish: beginRendererMeasure('preview:mount', { htmlChars: html.length })
    }
    return () => {
      if (previewGeneration.current === generation) previewGeneration.current += 1
    }
  }, [html, mdTheme, virtualBlocks, virtualized])

  useEffect(() => {
    setMeasuredBlockHeights(new Map())
  }, [mdTheme, virtualBlocks])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const generation = previewGeneration.current
    const patchGeneration = mermaidPatchGeneration.current + 1
    mermaidPatchGeneration.current = patchGeneration
    const isCurrent = (): boolean => (
      generation === previewGeneration.current && patchGeneration === mermaidPatchGeneration.current
    )
    void patchMermaidFlowcharts(body, mdTheme, isCurrent).then((patched) => {
      if (patched > 0 && isCurrent()) {
        setDomPatchVersion((version) => version + 1)
      }
    })
    return () => {
      if (mermaidPatchGeneration.current === patchGeneration) mermaidPatchGeneration.current += 1
    }
  }, [html, mdTheme, virtualBlocks, virtualRange.end, virtualRange.start, virtualized])

  useEffect(() => {
    if (!virtualized) return
    const pane = paneRef.current
    if (!pane) return
    const frame = requestAnimationFrame(() => {
      setVirtualViewport({ scrollTop: pane.scrollTop, height: pane.clientHeight })
    })
    return () => cancelAnimationFrame(frame)
  }, [virtualized, virtualBlocks])

  useEffect(() => {
    if (!virtualized || typeof ResizeObserver === 'undefined') return
    const body = bodyRef.current
    if (!body) return
    const observer = new ResizeObserver((entries) => {
      const pane = paneRef.current
      if (pane) {
        virtualScrollAnchor.current = {
          index: virtualRange.start,
          distance: (virtualOffsetsRef.current[virtualRange.start] ?? 0) - pane.scrollTop
        }
      }
      setMeasuredBlockHeights((previous) => {
        const next = new Map(previous)
        let changed = false
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.previewBlockIndex)
          const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height
          if (!Number.isInteger(index) || height <= 0 || Math.abs((next.get(index) ?? 0) - height) < 1) continue
          next.set(index, height)
          changed = true
        }
        return changed ? next : previous
      })
    })
    body.querySelectorAll<HTMLElement>('[data-preview-block-index]').forEach((block) => observer.observe(block))
    return () => observer.disconnect()
  }, [bodyVersion, virtualRange.end, virtualRange.start, virtualized])

  useEffect(() => {
    const measurement = previewMountMeasure.current
    const body = bodyRef.current
    if (!measurement || !body) return
    const frame = requestAnimationFrame(() => {
      if (previewMountMeasure.current !== measurement) return
      const nodeCount = body.querySelectorAll('*').length
      const blockCount = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, table, blockquote, ul, ol, hr, img, svg').length
      const blockMetrics = collectPreviewBlockMetrics(body)
      const details = {
        htmlChars: virtualized
          ? virtualBlocks.reduce((sum, block) => sum + block.html.length, 0)
          : html.length,
        nodeCount,
        blockCount,
        virtualBlockCount: virtualBlocks.length,
        mountedVirtualBlockCount: virtualized ? virtualRange.end - virtualRange.start : 0,
        ...blockMetrics
      }
      measurement.finish(details)
      recordRendererObservation('preview:dom', details)
      captureRendererMemory()
      previewMountMeasure.current = null
    })
    return () => cancelAnimationFrame(frame)
  }, [bodyVersion, html, virtualBlocks, virtualRange.end, virtualRange.start, virtualized])

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
      }).catch((error: unknown) => {
        console.error('Copy code failed:', error)
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
      const target = bodyRef.current ? findPreviewHeadingTarget(bodyRef.current, href) : null
      if (target) {
        scrollPreviewHeadingIntoView(target)
      } else if (virtualized) {
        const fragment = href.slice(1)
        let decodedHeadingId = fragment
        try {
          decodedHeadingId = decodeURIComponent(fragment)
        } catch {
          // Keep malformed fragments literal.
        }
        const headingId = [fragment, decodedHeadingId].find((id) => (
          findVirtualBlockForHeading(virtualBlocks, id) !== null
        )) ?? fragment
        const blockIndex = findVirtualBlockForHeading(virtualBlocks, headingId)
        const pane = paneRef.current
        if (blockIndex !== null && pane) {
          const top = virtualOffsetsRef.current[blockIndex] ?? 0
          pane.scrollTo({ top, behavior: 'smooth' })
          setVirtualViewport({ scrollTop: top, height: pane.clientHeight })
          requestAnimationFrame(() => {
            const candidate = document.getElementById(headingId)
            if (candidate && bodyRef.current?.contains(candidate)) scrollPreviewHeadingIntoView(candidate)
          })
        }
      }
      return
    }
    if (/^file:/i.test(href)) {
      e.preventDefault()
      onOpenLocalPath(href)
    }
    // External http(s) links carry target="_blank"; the main process opens them
    // in the OS browser via the window-open handler.
  }, [onOpenLocalPath, openDiagramAt, t, virtualBlocks, virtualized])

  useEffect(() => {
    if (!bodyRef.current) return

    bodyRef.current.querySelectorAll('.code-copy-button').forEach((button) => button.remove())
    bodyRef.current.querySelectorAll('pre').forEach((pre) => {
      if (pre.classList.contains('mermaid-diagram-candidate')) return
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
  }, [bodyVersion, html, t, virtualRange.end, virtualRange.start, virtualized])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return

    const handleSelectionChange = (): void => {
      const selection = document.getSelection()
      const selectsCode = selectionTouchesCodeBlock(body, selection)

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
  }, [mdTheme, virtualized])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    let canceled = false
    const images = Array.from(body.querySelectorAll('img[data-local-asset]')) as HTMLImageElement[]
    const queued = new Set<HTMLImageElement>()
    let inFlight = 0

    const pumpQueue = (): void => {
      while (!canceled && inFlight < LOCAL_IMAGE_LOAD_CONCURRENCY && queued.size > 0) {
        const image = queued.values().next().value as HTMLImageElement | undefined
        if (!image) return
        queued.delete(image)

        const assetUrl = image.dataset.localAsset
        if (!assetUrl) continue
        const loadingImage = image
        const loadStartedAt = performance.now()
        inFlight += 1
        loadingImage.addEventListener('load', onComplete, { once: true })
        loadingImage.addEventListener('error', onComplete, { once: true })
        loadingImage.src = assetUrl

        function onComplete(): void {
          inFlight -= 1
          recordRendererMeasure('preview:image-load', performance.now() - loadStartedAt, {
            loaded: loadingImage.complete && loadingImage.naturalWidth > 0 ? 1 : 0,
            naturalWidth: loadingImage.naturalWidth,
            naturalHeight: loadingImage.naturalHeight
          })
          pumpQueue()
        }
      }
    }

    const enqueue = (image: HTMLImageElement): void => {
      if (!image.dataset.localAsset || queued.has(image)) return
      queued.add(image)
      pumpQueue()
    }

    const scroller = body.closest<HTMLElement>('.pane')
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          observer?.unobserve(entry.target)
          enqueue(entry.target as HTMLImageElement)
        }
      }, { root: scroller, rootMargin: LOCAL_IMAGE_PRELOAD_MARGIN })

    for (const image of images) {
      if (observer) observer.observe(image)
      else enqueue(image)
    }

    return () => {
      canceled = true
      observer?.disconnect()
      queued.clear()
    }
  }, [bodyVersion, html, virtualRange.end, virtualRange.start, virtualized])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    let canceled = false
    const matchOffset = virtualized ? (virtualSearch.offsets[virtualRange.start] ?? 0) : 0
    void highlightPreviewSearchMatchesIncremental(
      body,
      searchTerm,
      MAX_SEARCH_HIGHLIGHTS,
      {
        matchIndexOffset: matchOffset,
        shouldContinue: () => !canceled,
        onProgress: (mountedCount) => {
          if (!canceled) onSearchMatchCountChange(virtualized ? virtualSearch.total : mountedCount)
        }
      }
    ).then((mountedCount) => {
      if (canceled) return
      onSearchMatchCountChange(virtualized ? virtualSearch.total : mountedCount)
      setSearchScanVersion((version) => version + 1)
    })
    return () => {
      canceled = true
    }
  }, [
    bodyVersion,
    html,
    onSearchMatchCountChange,
    searchTerm,
    virtualRange.end,
    virtualRange.start,
    virtualSearch,
    virtualized
  ])

  useEffect(() => {
    if (!bodyRef.current || !searchTerm.trim() || activeSearchIndex === null) return
    const activeMatch = activatePreviewSearchMatch(bodyRef.current, activeSearchIndex)
    activeMatch?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  }, [
    activeSearchIndex,
    searchScanVersion,
    searchTerm,
    virtualRange.end,
    virtualRange.start,
    virtualized
  ])

  // Keep outline state tied to preview DOM currently displayed.
  useEffect(() => {
    const body = bodyRef.current
    const scroller = body?.closest('.pane') as HTMLElement | null
    if (!body || !scroller) return

    const headings = Array.from(body.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
    onPreviewHeadingsChange(headings)
    if (!virtualized && headings.length === 0) {
      onActiveHeadingChange(null)
      return
    }

    const updateActiveHeading = (): void => {
      onActiveHeadingChange(virtualized
        ? getVirtualActiveHeadingId(virtualBlocks, virtualOffsetsRef.current, scroller.scrollTop)
        : getActivePreviewHeadingId(scroller, headings))
    }

    updateActiveHeading()
    scroller.addEventListener('scroll', updateActiveHeading, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', updateActiveHeading)
      onPreviewHeadingsChange([])
    }
  }, [
    onActiveHeadingChange,
    onPreviewHeadingsChange,
    bodyVersion,
    html,
    virtualBlocks,
    virtualRange.end,
    virtualRange.start,
    virtualized
  ])

  return (
    <div
      ref={paneRef}
      className={`pane ${className ?? ''}`}
      data-md-theme={mdTheme}
      data-virtualized={virtualized || undefined}
      onScroll={handlePaneScroll}
    >
      {virtualized ? (
        <div
          key={`virtual:${mdTheme}`}
          ref={bodyRef}
          className={`markdown-body markdown-body--virtual ${settings.previewFluidWidth ? 'markdown-body--fluid' : ''}`}
          style={{
            fontFamily: settings.previewFontFamily,
            fontSize: `${settings.previewFontSize}px`,
            lineHeight: settings.previewLineHeight,
            '--reading-width': `${settings.previewWidth}%`
          } as CSSProperties}
          onClick={handleClick}
        >
          <div
            className="virtual-preview__spacer"
            style={{ height: `${virtualRange.top}px` }}
            aria-hidden="true"
          />
          {virtualBlocks.slice(virtualRange.start, virtualRange.end).map((block, offset) => {
            const index = virtualRange.start + offset
            return (
              <div
                key={`${mdTheme}:${block.id}`}
                className="virtual-preview__block"
                data-preview-block-index={index}
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
            )
          })}
          <div
            className="virtual-preview__spacer"
            style={{ height: `${virtualRange.bottom}px` }}
            aria-hidden="true"
          />
        </div>
      ) : (
        <div
          key={`normal:${mdTheme}`}
          ref={bodyRef}
          className={`markdown-body ${settings.previewFluidWidth ? 'markdown-body--fluid' : ''}`}
          style={{
            fontFamily: settings.previewFontFamily,
            fontSize: `${settings.previewFontSize}px`,
            lineHeight: settings.previewLineHeight,
            '--reading-width': `${settings.previewWidth}%`
          } as CSSProperties}
          onClick={handleClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      <MermaidDiagramDialog
        content={activeDiagram?.content ?? null}
        diagramName={activeDiagram?.name ?? t('preview.diagramTitle')}
        diagramIndex={activeDiagram?.index ?? 0}
        diagramCount={activeDiagram?.total ?? 0}
        // A virtualized preview only mounts the blocks near the viewport, so `previewGraphics`
        // (DOM-only) sees a window of the document's diagrams, not all of them: the count and
        // prev/next navigation would be wrong rather than merely incomplete, so both are hidden.
        showNavigation={!virtualized}
        documentName={documentName}
        mdTheme={mdTheme}
        onPrevious={!virtualized && activeDiagram && activeDiagram.index > 1 ? () => openDiagramAt(activeDiagram.index - 2) : undefined}
        onNext={!virtualized && activeDiagram && activeDiagram.index < activeDiagram.total ? () => openDiagramAt(activeDiagram.index) : undefined}
        onClose={() => setActiveDiagram(null)}
      />
    </div>
  )
}
