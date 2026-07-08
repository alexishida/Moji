import { useCallback, useRef, type MouseEvent } from 'react'

interface PreviewProps {
  html: string
  className?: string
}

/** Renders sanitized Markdown HTML and resolves in-document heading anchors. */
export function Preview({ html, className }: PreviewProps): JSX.Element {
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
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    // External http(s) links carry target="_blank"; the main process opens them
    // in the OS browser via the window-open handler.
  }, [])

  return (
    <div className={`pane ${className ?? ''}`}>
      <div
        ref={bodyRef}
        className="markdown-body"
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
