import { useCallback, useEffect, useRef, type MouseEvent } from 'react'
import type { Settings, Theme } from '../../electron/shared'
import { scrollPreviewHeadingIntoView } from '../lib/previewScroll'

interface PreviewProps {
  html: string
  mdTheme: Theme
  searchTerm: string
  settings: Settings
  className?: string
}

/** Renders sanitized Markdown HTML and resolves in-document heading anchors. */
export function Preview({ html, mdTheme, searchTerm, settings, className }: PreviewProps): JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null)

  const handleClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a')
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
  }, [html])

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
      if (!(walker.currentNode.parentElement?.closest('style,script,svg,mark'))) {
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
  }, [html, searchTerm])

  return (
    <div className={`pane ${className ?? ''}`} data-md-theme={mdTheme}>
      <div
        ref={bodyRef}
        className="markdown-body"
        style={{
          fontFamily: settings.previewFontFamily,
          fontSize: `${settings.previewFontSize}px`,
          lineHeight: settings.previewLineHeight
        }}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
