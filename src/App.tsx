import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { Preview } from './components/Preview'
import { Editor } from './components/Editor'
import { Welcome } from './components/Welcome'
import { DocumentTabs, type DocumentTabItem } from './components/DocumentTabs'
import { ConfirmDialog, type ConfirmChoice } from './components/ConfirmDialog'
import { ExportDialog, type ExportDialogOptions } from './components/ExportDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { AboutDialog } from './components/AboutDialog'
import { documentAssetBaseUrl, renderMarkdown } from './lib/markdown'
import { buildOutline } from './lib/outline'
import { getActivePreviewHeadingId, scrollPreviewHeadingIntoView } from './lib/previewScroll'
import { useDebounced } from './lib/useDebounced'
import { buildStandaloneHtml } from './lib/exportHtml'
import type { ExportFormat, Language, MenuAction, Settings, Theme } from '../electron/shared'
import packageJson from '../package.json'

interface DocumentState {
  id: string
  path: string | null
  title: string | null
  content: string
  savedContent: string
}

interface DocumentInput {
  path: string | null
  title?: string | null
  content: string
}

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function baseName(path: string | null): string | null {
  if (!path) return null
  return path.split(/[\\/]/).pop() ?? path
}

function documentName(doc: Pick<DocumentState, 'path' | 'title'>, fallback: string): string {
  return baseName(doc.path) ?? doc.title ?? fallback
}

function markdownFileName(name: string): string {
  return /\.(md|markdown)$/i.test(name) ? name : `${name}.md`
}

function findLiteralMatches(text: string, search: string): Array<{ from: number; to: number }> {
  if (!search) return []
  const needle = search.toLowerCase()
  const haystack = text.toLowerCase()
  const matches: Array<{ from: number; to: number }> = []

  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + search.length)) {
    matches.push({ from: index, to: index + search.length })
  }

  return matches
}

function replaceTextLiteral(
  text: string,
  search: string,
  replacement: string,
  all: boolean,
  activeIndex: number | null
): { text: string; count: number; nextIndex: number | null } {
  const matches = findLiteralMatches(text, search)
  if (matches.length === 0) return { text, count: 0, nextIndex: null }

  if (!all) {
    const index = Math.min(activeIndex ?? 0, matches.length - 1)
    const match = matches[index]
    const nextText = `${text.slice(0, match.from)}${replacement}${text.slice(match.to)}`
    const nextCount = findLiteralMatches(nextText, search).length
    return { text: nextText, count: 1, nextIndex: nextCount > 0 ? Math.min(index, nextCount - 1) : null }
  }

  let lastIndex = 0
  let nextText = ''

  for (const match of matches) {
    nextText += `${text.slice(lastIndex, match.from)}${replacement}`
    lastIndex = match.to
  }

  return { text: `${nextText}${text.slice(lastIndex)}`, count: matches.length, nextIndex: null }
}

export function App(): JSX.Element {
  const { t, i18n } = useTranslation()

  const [settings, setSettings] = useState<Settings>({
    theme: 'dark',
    language: 'en',
    previewFontFamily: 'Inter',
    previewFontSize: 16,
    previewLineHeight: 1.7
  })
  const [documents, setDocuments] = useState<DocumentState[]>([])
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [mdTheme, setMdTheme] = useState<Theme>('dark')
  const [, setLanguage] = useState<Language>('en')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [exportDialogFormat, setExportDialogFormat] = useState<ExportFormat | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const dialogResolver = useRef<((c: ConfirmChoice) => void) | null>(null)
  const nextDocSeq = useRef(1)

  const activeDoc = useMemo(
    () => documents.find((doc) => doc.id === activeDocId) ?? null,
    [documents, activeDocId]
  )
  const hasDoc = activeDoc !== null
  const content = activeDoc?.content ?? ''
  const savedContent = activeDoc?.savedContent ?? ''
  const dirty = hasDoc && content !== savedContent
  const hasDirtyDocs = documents.some((doc) => doc.content !== doc.savedContent)

  const debouncedContent = useDebounced(content, 150)
  const html = useMemo(
    () => renderMarkdown(debouncedContent, { documentPath: activeDoc?.path, assetMode: 'app' }),
    [activeDoc?.path, debouncedContent]
  )
  const outline = useMemo(() => buildOutline(html), [html])
  const words = useMemo(() => countWords(content), [content])
  const searchMatchCount = useMemo(() => findLiteralMatches(content, searchTerm.trim()).length, [content, searchTerm])
  const tabs = useMemo<DocumentTabItem[]>(
    () =>
      documents.map((doc) => ({
        id: doc.id,
        title: documentName(doc, t('app.untitled')),
        dirty: doc.content !== doc.savedContent
      })),
    [documents, t]
  )

  // Keep a live snapshot for stable menu/IPC handlers.
  const stateRef = useRef({
    documents,
    activeDocId,
    activeDoc,
    hasDoc,
    mode,
    mdTheme,
    dirty,
    hasDirtyDocs,
    exportDialogOpen: false,
    settingsOpen: false,
    aboutOpen: false
  })
  stateRef.current = {
    documents,
    activeDocId,
    activeDoc,
    hasDoc,
    mode,
    mdTheme,
    dirty,
    hasDirtyDocs,
    exportDialogOpen: exportDialogFormat !== null,
    settingsOpen,
    aboutOpen
  }

  const flash = useCallback((text: string, error = false) => {
    setNotice({ text, error })
    window.setTimeout(() => setNotice(null), 2600)
  }, [])

  const newDocumentId = useCallback(() => {
    const id = `doc-${Date.now()}-${nextDocSeq.current}`
    nextDocSeq.current += 1
    return id
  }, [])

  const addDocuments = useCallback(
    (items: DocumentInput[], nextMode: 'view' | 'edit' = 'view') => {
      if (items.length === 0) return

      const currentDocs = stateRef.current.documents
      const nextDocs = [...currentDocs]
      let nextActiveId: string | null = null

      for (const item of items) {
        const existingIndex = item.path ? nextDocs.findIndex((doc) => doc.path === item.path) : -1

        if (existingIndex >= 0) {
          const existing = nextDocs[existingIndex]
          nextActiveId ??= existing.id
          if (existing.content === existing.savedContent) {
            nextDocs[existingIndex] = { ...existing, content: item.content, savedContent: item.content }
          }
          continue
        }

        const doc: DocumentState = {
          id: newDocumentId(),
          path: item.path,
          title: item.title ?? null,
          content: item.content,
          savedContent: item.content
        }
        nextDocs.push(doc)
        nextActiveId ??= doc.id
      }

      setDocuments(nextDocs)
      setActiveDocId(nextActiveId)
      setMode(nextMode)
      setExportDialogFormat(null)
      setSettingsOpen(false)
      setAboutOpen(false)
    },
    [newDocumentId]
  )

  const updateActiveContent = useCallback((nextContent: string) => {
    const id = stateRef.current.activeDocId
    if (!id) return
    setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, content: nextContent } : doc)))
  }, [])

  // Keep active tab valid when the last active document is removed.
  useEffect(() => {
    if (documents.length > 0 && !activeDoc) setActiveDocId(documents[0].id)
  }, [documents, activeDoc])

  useEffect(() => {
    if (!searchTerm.trim() || searchMatchCount === 0) {
      setActiveSearchIndex(null)
      return
    }
    setActiveSearchIndex((index) => (index === null ? 0 : Math.min(index, searchMatchCount - 1)))
  }, [searchMatchCount, searchTerm])

  // --- Outline scroll-spy: highlight the heading nearest the viewport top --
  useEffect(() => {
    if (!hasDoc) {
      setActiveHeadingId(null)
      return
    }
    const body = document.querySelector('.markdown-body')
    const scroller = body?.closest('.pane') as HTMLElement | null
    if (!body || !scroller) return
    const heads = Array.from(body.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[]
    if (heads.length === 0) {
      setActiveHeadingId(null)
      return
    }
    const update = (): void => {
      setActiveHeadingId(getActivePreviewHeadingId(scroller, heads))
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    return () => scroller.removeEventListener('scroll', update)
  }, [hasDoc, html, mode, activeDocId])

  // --- Initial settings --------------------------------------------------
  useEffect(() => {
    void window.api.getSettings().then((s) => {
      setSettings(s)
      setLanguage(s.language)
      void i18n.changeLanguage(s.language)
    })
  }, [i18n])

  // --- Document title ----------------------------------------------------
  useEffect(() => {
    const name = activeDoc ? documentName(activeDoc, t('app.untitled')) : t('app.untitled')
    const marker = dirty ? `${t('app.modifiedMarker')} ` : ''
    document.title = hasDoc ? `${marker}${name} - ${t('app.name')}` : t('app.name')
  }, [activeDoc, dirty, hasDoc, t])

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

  const saveDocumentAs = useCallback(
    async (docId: string): Promise<boolean> => {
      const doc = stateRef.current.documents.find((item) => item.id === docId)
      if (!doc) return false

      const suggested = markdownFileName(documentName(doc, 'untitled'))
      const savedText = doc.content
      const res = await window.api.saveAs(savedText, suggested)
      if (res.ok) {
        setDocuments((prev) =>
          prev.map((item) => (item.id === docId ? { ...item, path: res.path, savedContent: savedText } : item))
        )
        flash(t('notice.saveSuccess'))
        return true
      }
      if (!res.canceled) flash(t('notice.saveFailed', { error: res.error }), true)
      return false
    },
    [flash, t]
  )

  const saveDocument = useCallback(
    async (docId: string): Promise<boolean> => {
      const doc = stateRef.current.documents.find((item) => item.id === docId)
      if (!doc) {
        flash(t('notice.noDocument'), true)
        return false
      }
      if (!doc.path) return saveDocumentAs(docId)

      const savedText = doc.content
      const res = await window.api.save(doc.path, savedText)
      if (res.ok) {
        setDocuments((prev) => prev.map((item) => (item.id === docId ? { ...item, savedContent: savedText } : item)))
        flash(t('notice.saveSuccess'))
        return true
      }
      flash(t('notice.saveFailed', { error: res.error }), true)
      return false
    },
    [flash, saveDocumentAs, t]
  )

  const doSave = useCallback(async (): Promise<boolean> => {
    const doc = stateRef.current.activeDoc
    if (!doc) {
      flash(t('notice.noDocument'), true)
      return false
    }
    return saveDocument(doc.id)
  }, [flash, saveDocument, t])

  const doSaveAs = useCallback(async (): Promise<boolean> => {
    const doc = stateRef.current.activeDoc
    if (!doc) {
      flash(t('notice.noDocument'), true)
      return false
    }
    return saveDocumentAs(doc.id)
  }, [flash, saveDocumentAs, t])

  const confirmUnsavedDocument = useCallback(
    async (docId: string): Promise<'proceed' | 'cancel'> => {
      const doc = stateRef.current.documents.find((item) => item.id === docId)
      if (!doc || doc.content === doc.savedContent) return 'proceed'

      setActiveDocId(docId)
      const choice = await askUnsaved()
      if (choice === 'discard') return 'proceed'
      if (choice === 'save') return (await saveDocument(docId)) ? 'proceed' : 'cancel'
      return 'cancel'
    },
    [askUnsaved, saveDocument]
  )

  const confirmAnyUnsaved = useCallback(async (): Promise<'proceed' | 'cancel'> => {
    const dirtyDocs = stateRef.current.documents.filter((doc) => doc.content !== doc.savedContent)
    if (dirtyDocs.length === 0) return 'proceed'

    setActiveDocId(dirtyDocs[0].id)
    const choice = await askUnsaved()
    if (choice === 'discard') return 'proceed'
    if (choice !== 'save') return 'cancel'

    for (const doc of dirtyDocs) {
      setActiveDocId(doc.id)
      if (!(await saveDocument(doc.id))) return 'cancel'
    }
    return 'proceed'
  }, [askUnsaved, saveDocument])

  const doOpen = useCallback(async () => {
    const res = await window.api.openDialog()
    if (res.ok) addDocuments(res.documents)
    else if (!res.canceled) flash(t('notice.openFailed', { error: res.error }), true)
  }, [addDocuments, flash, t])

  const openPaths = useCallback(
    async (paths: string[]) => {
      const opened: DocumentInput[] = []
      for (const path of paths) {
        const res = await window.api.readPath(path)
        if (res.ok) opened.push({ path: res.path, content: res.content })
        else if (res.error === 'unsupported') flash(t('notice.unsupported'), true)
        else flash(t('notice.openFailed', { error: res.error }), true)
      }
      addDocuments(opened)
    },
    [addDocuments, flash, t]
  )

  const openExportDialog = useCallback(
    (format: ExportFormat = 'pdf') => {
      const s = stateRef.current
      if (!s.hasDoc || !s.activeDoc) {
        flash(t('notice.noDocument'), true)
        return
      }
      setSettingsOpen(false)
      setAboutOpen(false)
      setExportDialogFormat(format)
    },
    [flash, t]
  )

  const doExport = useCallback(
    async ({ format, pageSize, pageOrientation }: ExportDialogOptions) => {
      const s = stateRef.current
      if (!s.hasDoc || !s.activeDoc) {
        flash(t('notice.noDocument'), true)
        return
      }
      const rendered = renderMarkdown(s.activeDoc.content, { documentPath: s.activeDoc.path })
      const name = documentName(s.activeDoc, t('app.untitled'))
      // Exports (HTML/PDF/PNG) always use the light theme, regardless of the preview theme.
      const doc = buildStandaloneHtml(rendered, 'light', name)
      const base = name.replace(/\.[^.]+$/, '')
      const res = await window.api.exportAs({
        format,
        pageSize,
        pageOrientation,
        html: doc,
        assetBaseUrl: documentAssetBaseUrl(s.activeDoc.path) ?? undefined,
        baseName: base
      })
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
    setSettingsOpen(false)
    setAboutOpen(false)
    setMode((m) => (m === 'view' ? 'edit' : 'view'))
  }, [])

  const setModeSafe = useCallback((next: 'view' | 'edit') => {
    if (!stateRef.current.hasDoc) return
    setExportDialogFormat(null)
    setSettingsOpen(false)
    setAboutOpen(false)
    setMode(next)
  }, [])

  const doNew = useCallback(() => {
    addDocuments([{ path: null, content: '' }], 'edit')
  }, [addDocuments])

  const doSearch = useCallback((term: string) => {
    setSearchTerm(term)
    const nextCount = findLiteralMatches(stateRef.current.activeDoc?.content ?? '', term.trim()).length
    setActiveSearchIndex(nextCount > 0 ? 0 : null)
  }, [])

  const doFindNext = useCallback(() => {
    const term = searchTerm.trim()
    const count = findLiteralMatches(stateRef.current.activeDoc?.content ?? '', term).length
    if (!term || count === 0) {
      flash(t('notice.replaceNone'), true)
      return
    }
    setExportDialogFormat(null)
    setSettingsOpen(false)
    setAboutOpen(false)
    setMode('edit')
    setActiveSearchIndex((index) => (index === null ? 0 : (index + 1) % count))
  }, [flash, searchTerm, t])

  const doReplace = useCallback(
    (search: string, replacement: string, all: boolean) => {
      const term = search.trim()
      const doc = stateRef.current.activeDoc

      if (!doc) {
        flash(t('notice.noDocument'), true)
        return
      }

      if (!term) {
        flash(t('notice.replaceNeedsSearch'), true)
        return
      }

      const result = replaceTextLiteral(doc.content, term, replacement, all, activeSearchIndex)
      if (result.count === 0) {
        flash(t('notice.replaceNone'), true)
        return
      }

      setDocuments((prev) => prev.map((item) => (item.id === doc.id ? { ...item, content: result.text } : item)))
      setActiveSearchIndex(result.nextIndex)
      setExportDialogFormat(null)
      setSettingsOpen(false)
      setAboutOpen(false)
      setMode('edit')
      flash(t(all ? 'notice.replaceAllSuccess' : 'notice.replaceOneSuccess', { count: result.count }))
    },
    [activeSearchIndex, flash, t]
  )

  const doGuide = useCallback(async () => {
    const res = await window.api.readSample('guia-markdown-completo.md')
    if (res.ok) addDocuments([{ path: res.path, content: res.content }])
    else flash(t('notice.openFailed', { error: res.error }), true)
  }, [addDocuments, flash, t])

  const selectDocument = useCallback((docId: string) => {
    setActiveDocId(docId)
    setExportDialogFormat(null)
    setSettingsOpen(false)
    setAboutOpen(false)
  }, [])

  const closeDocument = useCallback(
    async (docId: string) => {
      if ((await confirmUnsavedDocument(docId)) === 'cancel') return

      const currentDocs = stateRef.current.documents
      const index = currentDocs.findIndex((doc) => doc.id === docId)
      if (index < 0) return

      const nextDocs = currentDocs.filter((doc) => doc.id !== docId)
      const nextActive =
        stateRef.current.activeDocId === docId
          ? nextDocs[Math.min(index, nextDocs.length - 1)]?.id ?? null
          : stateRef.current.activeDocId

      setDocuments(nextDocs)
      setActiveDocId(nextActive)
      if (nextDocs.length === 0) setMode('view')
      setExportDialogFormat(null)
      setSettingsOpen(false)
      setAboutOpen(false)
    },
    [confirmUnsavedDocument]
  )

  const scrollToHeading = useCallback((id: string) => {
    const target = document.getElementById(id)
    if (!target) return
    scrollPreviewHeadingIntoView(target)
    setActiveHeadingId(id)
  }, [])

  const canToggleMdTheme = useCallback(() => {
    const s = stateRef.current
    return s.hasDoc && s.mode === 'view' && !s.exportDialogOpen && !s.settingsOpen && !s.aboutOpen
  }, [])

  const toggleMdTheme = useCallback(() => {
    if (!canToggleMdTheme()) return
    setMdTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [canToggleMdTheme])

  const changeLanguage = useCallback(
    (lang: Language) => {
      setLanguage(lang)
      setSettings((prev) => ({ ...prev, language: lang }))
      void i18n.changeLanguage(lang)
      void window.api.setLanguage(lang)
    },
    [i18n]
  )

  const changeSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...patch, theme: 'dark' }))
      if (patch.language) {
        changeLanguage(patch.language)
        return
      }
      void window.api.setSettings(patch).then((next) => setSettings(next))
    },
    [changeLanguage]
  )

  const openSettings = useCallback(() => {
    setExportDialogFormat(null)
    setAboutOpen(false)
    setSettingsOpen(true)
  }, [])

  const openAbout = useCallback(() => {
    setExportDialogFormat(null)
    setSettingsOpen(false)
    setAboutOpen(true)
  }, [])

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
          toggleMdTheme()
          break
        case 'request-close':
          void confirmAnyUnsaved().then((r) => window.api.confirmClose(r === 'proceed'))
          break
      }
    })
    const offDoc = window.api.onOpenDocument((doc) => {
      addDocuments([{ path: doc.path, content: doc.content }])
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
  }, [
    doOpen,
    doSave,
    doSaveAs,
    openExportDialog,
    toggleEdit,
    toggleMdTheme,
    confirmAnyUnsaved,
    addDocuments,
    i18n
  ])

  // --- Drag & drop -------------------------------------------------------
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const paths = Array.from(e.dataTransfer.files)
        .map((file) => window.api.getDroppedPath(file))
        .filter((path): path is string => Boolean(path))
      if (paths.length > 0) void openPaths(paths)
    },
    [openPaths]
  )

  const title = hasDoc
    ? `${dirty ? `${t('app.modifiedMarker')} ` : ''}${activeDoc ? documentName(activeDoc, t('app.untitled')) : ''}`
    : ''

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
        settingsOpen={settingsOpen}
        aboutOpen={aboutOpen}
        theme={mdTheme}
        onSetMode={setModeSafe}
        onOpen={doOpen}
        onNew={doNew}
        onSave={doSave}
        onSearch={doSearch}
        onFindNext={doFindNext}
        onReplace={doReplace}
        searchMatchCount={searchMatchCount}
        activeSearchIndex={activeSearchIndex}
        canToggleTheme={canToggleMdTheme()}
        onToggleTheme={toggleMdTheme}
        onExport={openExportDialog}
        onOpenSettings={openSettings}
        onOpenAbout={openAbout}
      />

      {hasDoc && (
        <DocumentTabs
          variant="bar"
          tabs={tabs}
          activeId={activeDocId}
          onSelect={selectDocument}
          onClose={(id) => void closeDocument(id)}
        />
      )}

      <div className="body">
        {hasDoc && mode === 'view' && !exportDialogFormat && !settingsOpen && !aboutOpen && (
          <Sidebar
            hasDoc={hasDoc}
            outline={outline}
            activeId={activeHeadingId}
            showOutline={mode === 'view' && !exportDialogFormat}
            onSelectHeading={scrollToHeading}
          />
        )}

        <main className="main">
          <div className="workspace">
            {settingsOpen ? (
              <div className="export-workspace">
                <SettingsDialog
                  settings={settings}
                  onClose={() => setSettingsOpen(false)}
                  onChange={changeSettings}
                />
              </div>
            ) : aboutOpen ? (
              <div className="export-workspace">
                <AboutDialog version={packageJson.version} onClose={() => setAboutOpen(false)} />
              </div>
            ) : !hasDoc ? (
              <Welcome onOpen={() => void doOpen()} onNew={doNew} />
            ) : exportDialogFormat ? (
              <div className="export-workspace">
                <ExportDialog
                  initialFormat={exportDialogFormat}
                  onCancel={() => setExportDialogFormat(null)}
                  onExport={confirmExport}
                />
              </div>
            ) : mode === 'edit' ? (
              <Editor
                value={content}
                theme={'dark'}
                searchTerm={searchTerm}
                activeSearchIndex={activeSearchIndex}
                onChange={updateActiveContent}
              />
            ) : (
              <Preview html={html} mdTheme={mdTheme} searchTerm={searchTerm} settings={settings} />
            )}
          </div>
        </main>
      </div>

      <StatusBar hasDoc={hasDoc} words={words} onGuide={doGuide} />

      {dragging && <div className="drop-overlay">{t('welcome.dropHint')}</div>}
      {notice && <div className={`notice ${notice.error ? 'notice--error' : ''}`}>{notice.text}</div>}
      {dialogOpen && <ConfirmDialog onChoice={onDialogChoice} />}
    </div>
  )
}
