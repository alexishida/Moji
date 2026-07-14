import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Settings, Theme } from '../../electron/shared'
import { scrollPreviewHeadingIntoView } from '../lib/previewScroll'
import { renderMermaidFlowcharts } from '../lib/mermaid'
import { MermaidDiagramDialog, type DiagramContent } from './MermaidDiagramDialog'

interface PreviewProps {
  html: string
  documentName: string
  mdTheme: Theme
  searchTerm: string
  settings: Settings
  className?: string
}

interface ActiveDiagram {
  content: DiagramContent
  name: string
  index: number
  total: number
}

type PreviewGraphic = SVGSVGElement | HTMLImageElement

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
export function Preview({ html, documentName, mdTheme, searchTerm, settings, className }: PreviewProps): JSX.Element {
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
    }
    // External http(s) links carry target="_blank"; the main process opens them
    // in the OS browser via the window-open handler.
  }, [openDiagramAt, t])

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
    const el = bodyRef.current
    // Remove previous highlight spans
    el.querySelectorAll('.search-highlight').forEach((s) => {
      const parent = s.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(s.textContent ?? ''), s)
        parent.normalize()
      }
    })
    if (!searchTerm.trim()) return

    const term = searchTerm.toLowerCase()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.textContent && node.textContent.toLowerCase().includes(term)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
    })
    const nodes: Text[] = []
    while (walker.nextNode()) {
      if (!(walker.currentNode.parentElement?.closest('style,script,svg,mark,button'))) {
        nodes.push(walker.currentNode as Text)
      }
    }

    for (const node of nodes) {
      const text = node.textContent ?? ''
      const lower = text.toLowerCase()
      const parts: (string | Node)[] = []
      let lastIndex = 0
      for (let i = lower.indexOf(term, lastIndex); i !== -1; i = lower.indexOf(term, lastIndex)) {
        if (i > lastIndex) parts.push(text.slice(lastIndex, i))
        const mark = document.createElement('mark')
        mark.className = 'search-highlight'
        mark.textContent = text.slice(i, i + term.length)
        parts.push(mark)
        lastIndex = i + term.length
      }
      if (lastIndex < text.length) parts.push(text.slice(lastIndex))
      if (parts.length > 1) {
        const frag = document.createDocumentFragment()
        for (const part of parts) frag.append(part)
        node.parentNode?.replaceChild(frag, node)
      }
    }
  }, [renderedHtml, searchTerm])

  return (
    <div className={`pane ${className ?? ''}`} data-md-theme={mdTheme}>
      <div
        ref={bodyRef}
        className={`markdown-body ${settings.previewFluidWidth ? 'markdown-body--fluid' : ''}`}
        style={{
          fontFamily: settings.previewFontFamily,
          fontSize: `${settings.previewFontSize}px`,
          lineHeight: settings.previewLineHeight
        }}
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
