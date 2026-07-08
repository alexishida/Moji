import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { Preview } from './components/Preview'
import { Editor } from './components/Editor'
import { Welcome } from './components/Welcome'
import { ConfirmDialog, type ConfirmChoice } from './components/ConfirmDialog'
import { ExportDialog, type ExportDialogOptions } from './components/ExportDialog'
import { renderMarkdown } from './lib/markdown'
import { buildOutline } from './lib/outline'
import { GUIDE_MARKDOWN } from './lib/guide'
import { useDebounced } from './lib/useDebounced'
import { buildStandaloneHtml } from './lib/exportHtml'
import type { ExportFormat, Language, MenuAction, Theme } from '../electron/shared'

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function baseName(path: string | null): string | null {
  if (!path) return null
  return path.split(/[\\/]/).pop() ?? path
}

export function App(): JSX.Element {
  const { t, i18n } = useTranslation()

  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [hasDoc, setHasDoc] = useState(false)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [theme, setTheme] = useState<Theme>('light')
  const [language, setLanguage] = useState<Language>('en')
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [exportDialogFormat, setExportDialogFormat] = useState<ExportFormat | null>(null)
  const dialogResolver = useRef<((c: ConfirmChoice) => void) | null>(null)

  const dirty = hasDoc && content !== savedContent
  const debouncedContent = useDebounced(content, 150)
  const html = useMemo(() => renderMarkdown(debouncedContent), [debouncedContent])
  const outline = useMemo(() => buildOutline(html), [html])
  const words = useMemo(() => countWords(content), [content])

  // Keep a live snapshot for stable menu/IPC handlers.
  const stateRef = useRef({ content, filePath, hasDoc, mode, theme, dirty })
  stateRef.current = { content, filePath, hasDoc, mode, theme, dirty }

  const flash = useCallback((text: string, error = false) => {
    setNotice({ text, error })
    window.setTimeout(() => setNotice(null), 2600)
  }, [])

  // --- Theme -------------------------------------------------------------
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // --- Outline scroll-spy: highlight the heading nearest the viewport top --
  useEffect(() => {
    if (!hasDoc) {
      setActiveId(null)
      return
    }
    const body = document.querySelector('.markdown-body')
    const scroller = body?.closest('.pane') as HTMLElement | null
    if (!body || !scroller) return
    const heads = Array.from(body.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[]
    if (heads.length === 0) {
      setActiveId(null)
      return
    }
    const update = (): void => {
      const top = scroller.getBoundingClientRect().top
      let current = heads[0].id
      for (const h of heads) {
        if (h.getBoundingClientRect().top - top <= 88) current = h.id
        else break
      }
      setActiveId(current)
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    return () => scroller.removeEventListener('scroll', update)
  }, [hasDoc, html, mode])

  // --- Initial settings --------------------------------------------------
  useEffect(() => {
    void window.api.getSettings().then((s) => {
      setTheme(s.theme)
      setLanguage(s.language)
      void i18n.changeLanguage(s.language)
    })
  }, [i18n])

  // --- Document title ----------------------------------------------------
  useEffect(() => {
    const name = baseName(filePath) ?? t('app.untitled')
    const marker = dirty ? `${t('app.modifiedMarker')} ` : ''
    document.title = hasDoc ? `${marker}${name} — ${t('app.name')}` : t('app.name')
  }, [filePath, dirty, hasDoc, t])

  // --- Unsaved-changes guard --------------------------------------------
  const askUnsaved = useCallback((): Promise<ConfirmChoice> => {
    return new Promise((resolve) => {
      dialogResolver.current = resolve
      setDialogOpen(true)
    })
  }, [])

  const onDialogChoice = useCallback((choice: ConfirmChoice) => {
    setDialogOpen(false)
    dialogResolver.current?.(choice)
    dialogResolver.current = null
  }, [])

  const loadDocument = useCallback((path: string | null, text: string) => {
    setFilePath(path)
    setContent(text)
    setSavedContent(text)
    setHasDoc(true)
    setMode('view')
    setExportDialogFormat(null)
  }, [])

  const doSave = useCallback(async (): Promise<boolean> => {
    const s = stateRef.current
    if (!s.hasDoc) {
      flash(t('notice.noDocument'), true)
      return false
    }
    if (!s.filePath) return doSaveAs()
    const res = await window.api.save(s.filePath, s.content)
    if (res.ok) {
      setSavedContent(s.content)
      flash(t('notice.saveSuccess'))
      return true
    }
    flash(t('notice.saveFailed', { error: res.error }), true)
    return false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash, t])

  const doSaveAs = useCallback(async (): Promise<boolean> => {
    const s = stateRef.current
    const suggested = baseName(s.filePath) ?? 'untitled.md'
    const res = await window.api.saveAs(s.content, suggested)
    if (res.ok) {
      setFilePath(res.path)
      setSavedContent(s.content)
      flash(t('notice.saveSuccess'))
      return true
    }
    if (!res.canceled) flash(t('notice.saveFailed', { error: res.error }), true)
    return false
  }, [flash, t])

  const confirmUnsaved = useCallback(async (): Promise<'proceed' | 'cancel'> => {
    if (!stateRef.current.dirty) return 'proceed'
    const choice = await askUnsaved()
    if (choice === 'discard') return 'proceed'
    if (choice === 'save') return (await doSave()) ? 'proceed' : 'cancel'
    return 'cancel'
  }, [askUnsaved, doSave])

  const doOpen = useCallback(async () => {
    if ((await confirmUnsaved()) === 'cancel') return
    const res = await window.api.openDialog()
    if (res.ok) loadDocument(res.path, res.content)
    else if (!res.canceled) flash(t('notice.openFailed', { error: res.error }), true)
  }, [confirmUnsaved, loadDocument, flash, t])

  const openPath = useCallback(
    async (path: string) => {
      if ((await confirmUnsaved()) === 'cancel') return
      const res = await window.api.readPath(path)
      if (res.ok) loadDocument(res.path, res.content)
      else if (res.error === 'unsupported') flash(t('notice.unsupported'), true)
      else flash(t('notice.openFailed', { error: res.error }), true)
    },
    [confirmUnsaved, loadDocument, flash, t]
  )

  const openExportDialog = useCallback(
    (format: ExportFormat = 'pdf') => {
      const s = stateRef.current
      if (!s.hasDoc) {
        flash(t('notice.noDocument'), true)
        return
      }
      setExportDialogFormat(format)
    },
    [flash, t]
  )

  const doExport = useCallback(
    async ({ format, pageSize }: ExportDialogOptions) => {
      const s = stateRef.current
      if (!s.hasDoc) {
        flash(t('notice.noDocument'), true)
        return
      }
      const rendered = renderMarkdown(s.content)
      const doc = buildStandaloneHtml(rendered, s.theme, baseName(s.filePath) ?? t('app.untitled'))
      const base = (baseName(s.filePath) ?? 'document').replace(/\.[^.]+$/, '')
      const res = await window.api.exportAs({ format, pageSize, html: doc, baseName: base })
      if (res.ok) flash(t('notice.exportSuccess', { path: res.path }))
      else if (!res.canceled) flash(t('notice.exportFailed', { error: res.error }), true)
    },
    [flash, t]
  )

  const confirmExport = useCallback(
    (options: ExportDialogOptions) => {
      setExportDialogFormat(null)
      void doExport(options)
    },
    [doExport]
  )

  const toggleEdit = useCallback(() => {
    if (!stateRef.current.hasDoc) return
    setExportDialogFormat(null)
    setMode((m) => (m === 'view' ? 'edit' : 'view'))
  }, [])

  const setModeSafe = useCallback((next: 'view' | 'edit') => {
    if (!stateRef.current.hasDoc) return
    setExportDialogFormat(null)
    setMode(next)
  }, [])

  const doNew = useCallback(async () => {
    if ((await confirmUnsaved()) === 'cancel') return
    setFilePath(null)
    setContent('')
    setSavedContent('')
    setHasDoc(true)
    setMode('edit')
    setExportDialogFormat(null)
  }, [confirmUnsaved])

  const doGuide = useCallback(async () => {
    if ((await confirmUnsaved()) === 'cancel') return
    loadDocument(null, GUIDE_MARKDOWN)
  }, [confirmUnsaved, loadDocument])

  const scrollToHeading = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(id)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      void window.api.setSettings({ theme: next })
      return next
    })
  }, [])

  const changeLanguage = useCallback(
    (lang: Language) => {
      setLanguage(lang)
      void i18n.changeLanguage(lang)
      void window.api.setLanguage(lang)
    },
    [i18n]
  )

  // --- Wire menu actions + pushed documents -----------------------------
  useEffect(() => {
    const offMenu = window.api.onMenuAction((action: MenuAction) => {
      switch (action) {
        case 'open':
          void doOpen()
          break
        case 'save':
          void doSave()
          break
        case 'save-as':
          void doSaveAs()
          break
        case 'export:html':
          openExportDialog('html')
          break
        case 'export:pdf':
          openExportDialog('pdf')
          break
        case 'toggle-edit':
          toggleEdit()
          break
        case 'toggle-theme':
          toggleTheme()
          break
        case 'request-close':
          void confirmUnsaved().then((r) => window.api.confirmClose(r === 'proceed'))
          break
      }
    })
    const offDoc = window.api.onOpenDocument((doc) => {
      void confirmUnsaved().then((r) => {
        if (r === 'proceed') loadDocument(doc.path, doc.content)
      })
    })
    const offLang = window.api.onLanguageChanged((lang) => {
      setLanguage(lang)
      void i18n.changeLanguage(lang)
    })
    return () => {
      offMenu()
      offDoc()
      offLang()
    }
  }, [doOpen, doSave, doSaveAs, openExportDialog, toggleEdit, toggleTheme, confirmUnsaved, loadDocument, i18n])

  // --- Drag & drop -------------------------------------------------------
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (!file) return
      const path = window.api.getDroppedPath(file)
      if (path) void openPath(path)
    },
    [openPath]
  )

  const title = hasDoc ? `${dirty ? `${t('app.modifiedMarker')} ` : ''}${baseName(filePath) ?? t('app.untitled')}` : ''

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <TopBar
        title={title}
        hasDoc={hasDoc}
        mode={mode}
        exportOpen={exportDialogFormat !== null}
        theme={theme}
        language={language}
        onSetMode={setModeSafe}
        onToggleTheme={toggleTheme}
        onNew={() => void doNew()}
        onOpen={() => void doOpen()}
        onExport={openExportDialog}
        onChangeLanguage={changeLanguage}
      />

      <div className="body">
        <Sidebar
          hasDoc={hasDoc}
          outline={outline}
          activeId={activeId}
          language={language}
          theme={theme}
          onSelectHeading={scrollToHeading}
          onHelp={() => flash(t('help.hint'))}
          onChangeLanguage={changeLanguage}
          onToggleTheme={toggleTheme}
        />

        <main className="main">
          <div className="workspace">
            {!hasDoc ? (
              <Welcome onOpen={() => void doOpen()} onNew={() => void doNew()} />
            ) : exportDialogFormat ? (
              <div className="export-workspace">
                <ExportDialog
                  initialFormat={exportDialogFormat}
                  onCancel={() => setExportDialogFormat(null)}
                  onExport={confirmExport}
                />
              </div>
            ) : mode === 'edit' ? (
              <Editor value={content} theme={theme} onChange={setContent} />
            ) : (
              <Preview html={html} />
            )}
          </div>
        </main>
      </div>

      <StatusBar hasDoc={hasDoc} words={words} onGuide={() => void doGuide()} />

      {dragging && <div className="drop-overlay">{t('welcome.dropHint')}</div>}
      {notice && <div className={`notice ${notice.error ? 'notice--error' : ''}`}>{notice.text}</div>}
      {dialogOpen && <ConfirmDialog onChoice={onDialogChoice} />}
    </div>
  )
}
