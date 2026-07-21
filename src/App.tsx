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
import { UpdateNotice } from './components/UpdateNotice'
import { documentAssetBaseUrl, renderMarkdown } from './lib/markdown'
import { buildOutline } from './lib/outline'
import { getActivePreviewHeadingId, scrollPreviewHeadingIntoView } from './lib/previewScroll'
import { useDebounced } from './lib/useDebounced'
import { buildStandaloneHtml } from './lib/exportHtml'
import { getExtraMermaidGuideExamples } from './lib/mermaidGuide'
import { renderMermaidFlowcharts } from './lib/mermaid'
import {
  MAX_RECENT_FILES,
  MAX_RECENT_FOLDERS,
  MAX_WORKSPACE_SEARCH_RESULTS,
  type ExportFormat,
  type Settings,
  type Theme,
  type UpdateState,
  type WorkspaceFolder,
  type WorkspaceSearchMatch
} from '../electron/shared'
import packageJson from '../package.json'

const MIN_PREVIEW_FONT_SIZE = 12
const MAX_PREVIEW_FONT_SIZE = 24
const DEFAULT_PREVIEW_FONT_SIZE = 16

interface DocumentState {
  id: string
  path: string | null
  title: string | null
  content: string
  savedContent: string
  readOnly: boolean
}

interface DocumentInput {
  path: string | null
  title?: string | null
  content: string
  readOnly?: boolean
}

interface DocumentStats {
  lines: number
  tokens: number
  words: number
}

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function countLines(text: string): number {
  if (!text) return 0
  return text.split(/\r?\n/).length
}

function countTokens(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0

  return Math.ceil(Array.from(trimmed).length / 4)
}

function getDocumentStats(text: string): DocumentStats {
  return {
    lines: countLines(text),
    tokens: countTokens(text),
    words: countWords(text)
  }
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
    previewTheme: 'dark',
    language: 'en',
    previewFontFamily: 'Inter',
    previewFontSize: 16,
    previewLineHeight: 1.7,
    previewFluidWidth: false,
    recentFiles: [],
    recentFolders: []
  })
  const [documents, setDocuments] = useState<DocumentState[]>([])
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [workspaceFolder, setWorkspaceFolder] = useState<WorkspaceFolder | null>(null)
  const [workspaceSearchTerm, setWorkspaceSearchTerm] = useState('')
  const [workspaceSearchResults, setWorkspaceSearchResults] = useState<WorkspaceSearchMatch[]>([])
  const [workspaceSearchLoading, setWorkspaceSearchLoading] = useState(false)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [mdTheme, setMdTheme] = useState<Theme>('dark')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null)
  const [replaceActive, setReplaceActive] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'idle',
    currentVersion: packageJson.version
  })
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const [editorHeadingRequest, setEditorHeadingRequest] = useState<{ id: string; request: number } | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [exportDialogFormat, setExportDialogFormat] = useState<ExportFormat | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [outlineVisible, setOutlineVisible] = useState(true)
  const [searchFocusRequest, setSearchFocusRequest] = useState(0)
  const [replaceFocusRequest, setReplaceFocusRequest] = useState(0)
  const [topBarDismissRequest, setTopBarDismissRequest] = useState(0)
  const dialogResolver = useRef<((c: ConfirmChoice) => void) | null>(null)
  const nextDocSeq = useRef(1)
  const workspaceSearchRequest = useRef(0)

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
  const stats = useMemo(() => getDocumentStats(content), [content])
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

  const updateKey = `${updateState.status}:${updateState.version ?? ''}:${updateState.error ?? ''}`

  const downloadUpdate = useCallback(() => {
    void window.api.downloadUpdate().then(setUpdateState)
  }, [])

  const checkForUpdate = useCallback(() => {
    setDismissedUpdate(null)
    void window.api.checkForUpdate().then(setUpdateState)
  }, [])

  const installUpdate = useCallback(() => {
    void window.api.installUpdate()
  }, [])

  // --- Recent files ------------------------------------------------------
  // Live snapshot so the record/prune helpers never read a stale list.
  const recentFilesRef = useRef<string[]>(settings.recentFiles)
  recentFilesRef.current = settings.recentFiles

  const persistRecentFiles = useCallback((next: string[]) => {
    const capped = next.slice(0, MAX_RECENT_FILES)
    setSettings((prev) => ({ ...prev, recentFiles: capped }))
    void window.api.setSettings({ recentFiles: capped })
  }, [])

  // Move the given paths to the front (most-recent first), deduped.
  const rememberRecent = useCallback(
    (paths: Array<string | null>) => {
      const fresh = paths.filter((p): p is string => Boolean(p))
      const unique = fresh.filter((p, index) => fresh.indexOf(p) === index)
      if (unique.length === 0) return
      persistRecentFiles([...unique, ...recentFilesRef.current.filter((p) => !unique.includes(p))])
    },
    [persistRecentFiles]
  )

  const forgetRecent = useCallback(
    (paths: string[]) => {
      const remove = new Set(paths)
      const next = recentFilesRef.current.filter((p) => !remove.has(p))
      if (next.length !== recentFilesRef.current.length) persistRecentFiles(next)
    },
    [persistRecentFiles]
  )

  const recentFoldersRef = useRef<string[]>(settings.recentFolders)
  recentFoldersRef.current = settings.recentFolders

  const persistRecentFolders = useCallback((next: string[]) => {
    const capped = next.slice(0, MAX_RECENT_FOLDERS)
    setSettings((prev) => ({ ...prev, recentFolders: capped }))
    void window.api.setSettings({ recentFolders: capped })
  }, [])

  const rememberRecentFolder = useCallback(
    (path: string | null) => {
      if (!path) return
      persistRecentFolders([path, ...recentFoldersRef.current.filter((p) => p !== path)])
    },
    [persistRecentFolders]
  )

  const forgetRecentFolder = useCallback(
    (path: string) => {
      const next = recentFoldersRef.current.filter((p) => p !== path)
      if (next.length !== recentFoldersRef.current.length) persistRecentFolders(next)
    },
    [persistRecentFolders]
  )

  const debouncedWorkspaceSearchTerm = useDebounced(workspaceSearchTerm, 180)

  useEffect(() => {
    const term = debouncedWorkspaceSearchTerm.trim()
    const folder = workspaceFolder
    workspaceSearchRequest.current += 1
    const request = workspaceSearchRequest.current

    if (!folder || !term) {
      setWorkspaceSearchResults([])
      setWorkspaceSearchLoading(false)
      return
    }

    setWorkspaceSearchLoading(true)
    void window.api
      .searchWorkspace({ rootPath: folder.path, term, maxResults: MAX_WORKSPACE_SEARCH_RESULTS })
      .then((res) => {
        if (workspaceSearchRequest.current !== request) return
        setWorkspaceSearchResults(res.ok ? res.matches : [])
      })
      .finally(() => {
        if (workspaceSearchRequest.current === request) setWorkspaceSearchLoading(false)
      })
  }, [debouncedWorkspaceSearchTerm, workspaceFolder])

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
            nextDocs[existingIndex] = {
              ...existing,
              content: item.content,
              savedContent: item.content,
              readOnly: existing.readOnly || item.readOnly === true
            }
          }
          continue
        }

        const doc: DocumentState = {
          id: newDocumentId(),
          path: item.path,
          title: item.title ?? null,
          content: item.content,
          savedContent: item.content,
          readOnly: item.readOnly === true
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
    if (!id || stateRef.current.activeDoc?.readOnly) return
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
      setMdTheme(s.previewTheme)
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
      if (doc.readOnly) {
        flash(t('notice.readOnlyGuide'), true)
        return false
      }

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
      if (doc.readOnly) {
        flash(t('notice.readOnlyGuide'), true)
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
    if (res.ok) {
      addDocuments(res.documents)
      rememberRecent(res.documents.map((doc) => doc.path))
    } else if (!res.canceled) flash(t('notice.openFailed', { error: res.error }), true)
  }, [addDocuments, flash, rememberRecent, t])

  const openWorkspace = useCallback(
    (folder: WorkspaceFolder) => {
      setWorkspaceFolder(folder)
      setWorkspaceSearchTerm('')
      setWorkspaceSearchResults([])
      setWorkspaceSearchLoading(false)
      rememberRecentFolder(folder.path)
      setExportDialogFormat(null)
      setSettingsOpen(false)
      setAboutOpen(false)
      setOutlineVisible(true)
      flash(
        t('notice.folderOpened', {
          name: folder.name,
          count: folder.files.length
        })
      )
    },
    [flash, rememberRecentFolder, t]
  )

  const doOpenFolder = useCallback(async () => {
    const res = await window.api.openFolderDialog()
    if (res.ok) openWorkspace(res.folder)
    else if (!res.canceled) flash(t('notice.openFolderFailed', { error: res.error }), true)
  }, [flash, openWorkspace, t])

  const openPaths = useCallback(
    async (paths: string[]) => {
      const opened: DocumentInput[] = []
      const failed: string[] = []
      let folderToOpen: WorkspaceFolder | null = null
      for (const path of paths) {
        const res = await window.api.openPath(path)
        if (res.ok && res.type === 'file') opened.push({ path: res.document.path, content: res.document.content })
        else if (res.ok && res.type === 'folder') folderToOpen = res.folder
        else if (!res.ok) {
          failed.push(path)
          if (res.error === 'unsupported') flash(t('notice.unsupported'), true)
          else flash(t('notice.openFailed', { error: res.error }), true)
        }
      }
      addDocuments(opened)
      rememberRecent(opened.map((doc) => doc.path))
      if (folderToOpen) openWorkspace(folderToOpen)
      // Drop paths that no longer open (e.g. a recent file that was moved/deleted).
      forgetRecent(failed)
    },
    [addDocuments, flash, forgetRecent, openWorkspace, rememberRecent, t]
  )

  const openRecent = useCallback((path: string) => void openPaths([path]), [openPaths])

  const openRecentFolder = useCallback(
    async (path: string) => {
      const res = await window.api.openPath(path)
      if (res.ok && res.type === 'folder') {
        openWorkspace(res.folder)
        return
      }
      forgetRecentFolder(path)
      if (res.ok && res.type === 'file') addDocuments([{ path: res.document.path, content: res.document.content }])
      else if (!res.ok && !res.canceled) flash(t('notice.openFolderFailed', { error: res.error }), true)
    },
    [addDocuments, flash, forgetRecentFolder, openWorkspace, t]
  )

  const openWorkspaceFile = useCallback(
    async (path: string, search?: { term: string }) => {
      const res = await window.api.readWorkspaceFile(path)
      if (res.ok) {
        addDocuments([{ path: res.path, content: res.content }])
        rememberRecent([res.path])
        const term = search?.term.trim()
        if (term) {
          setSearchTerm(term)
          setActiveSearchIndex(findLiteralMatches(res.content, term).length > 0 ? 0 : null)
        }
      } else if (res.error === 'unsupported') flash(t('notice.unsupported'), true)
      else flash(t('notice.openFailed', { error: res.error }), true)
    },
    [addDocuments, flash, rememberRecent, t]
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
      const renderedMarkdown = renderMarkdown(s.activeDoc.content, { documentPath: s.activeDoc.path })
      const rendered = await renderMermaidFlowcharts(renderedMarkdown, 'light')
      const name = documentName(s.activeDoc, t('app.untitled'))
      // Exports (HTML/PDF/PNG) always use the light theme, regardless of the preview theme.
      const doc = buildStandaloneHtml(rendered, 'light', name, {
        fontFamily: settings.previewFontFamily,
        fontSize: settings.previewFontSize,
        lineHeight: settings.previewLineHeight
      })
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
    [flash, settings.previewFontFamily, settings.previewFontSize, settings.previewLineHeight, t]
  )

  const confirmExport = useCallback(
    (options: ExportDialogOptions) => {
      setExportDialogFormat(null)
      void doExport(options)
    },
    [doExport]
  )

  const setModeSafe = useCallback((next: 'view' | 'edit') => {
    if (!stateRef.current.hasDoc) return
    if (next === 'edit' && stateRef.current.activeDoc?.readOnly) return
    setExportDialogFormat(null)
    setSettingsOpen(false)
    setAboutOpen(false)
    setMode(next)
  }, [])

  const doNew = useCallback(() => {
    const documentCount = stateRef.current.documents.length
    const title = documentCount === 0 ? t('app.untitled') : `${t('app.untitled')} ${documentCount + 1}`
    addDocuments([{ path: null, title, content: '' }], 'edit')
  }, [addDocuments, t])

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
    if (!stateRef.current.activeDoc?.readOnly) setMode('edit')
    setActiveSearchIndex((index) => (index === null ? 0 : (index + 1) % count))
  }, [flash, searchTerm, t])

  const doFindPrevious = useCallback(() => {
    const term = searchTerm.trim()
    const count = findLiteralMatches(stateRef.current.activeDoc?.content ?? '', term).length
    if (!term || count === 0) {
      flash(t('notice.replaceNone'), true)
      return
    }
    setExportDialogFormat(null)
    setSettingsOpen(false)
    setAboutOpen(false)
    if (!stateRef.current.activeDoc?.readOnly) setMode('edit')
    setActiveSearchIndex((index) => (index === null ? count - 1 : (index - 1 + count) % count))
  }, [flash, searchTerm, t])

  const doReplace = useCallback(
    (search: string, replacement: string, all: boolean) => {
      const term = search.trim()
      const doc = stateRef.current.activeDoc

      if (!doc) {
        flash(t('notice.noDocument'), true)
        return
      }

      if (stateRef.current.mode !== 'edit') return

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
      flash(t(all ? 'notice.replaceAllSuccess' : 'notice.replaceOneSuccess', { count: result.count }))
    },
    [activeSearchIndex, flash, t]
  )

  const doGuide = useCallback(async () => {
    const guideFiles: Record<string, string> = {
      'en': 'markdown-guide.en.md',
      'pt-BR': 'markdown-guide.pt-BR.md',
      'es': 'markdown-guide.es.md',
      'ja': 'markdown-guide.ja.md',
      'zh': 'markdown-guide.zh.md',
      'ru': 'markdown-guide.ru.md',
    }
    const guideFile = guideFiles[settings.language] ?? guideFiles['en']
    const res = await window.api.readSample(guideFile)
    if (res.ok) addDocuments([{
      path: res.path,
      content: res.content.replace('<!-- MERMAID_EXAMPLES -->', getExtraMermaidGuideExamples(settings.language)),
      readOnly: true
    }])
    else flash(t('notice.openFailed', { error: res.error }), true)
  }, [addDocuments, flash, settings.language, t])

  const selectDocument = useCallback((docId: string) => {
    const selected = stateRef.current.documents.find((doc) => doc.id === docId)
    setActiveDocId(docId)
    if (selected?.readOnly) setMode('view')
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

  const closeDocuments = useCallback(
    async (ids: string[]) => {
      const idSet = new Set(ids)
      if (idSet.size === 0) return

      // Confirm each dirty document in the set; abort all if the user cancels.
      const dirtyDocs = stateRef.current.documents.filter(
        (doc) => idSet.has(doc.id) && doc.content !== doc.savedContent
      )
      for (const doc of dirtyDocs) {
        if ((await confirmUnsavedDocument(doc.id)) === 'cancel') return
      }

      const currentDocs = stateRef.current.documents
      const nextDocs = currentDocs.filter((doc) => !idSet.has(doc.id))
      const survivorIds = new Set(nextDocs.map((doc) => doc.id))

      let nextActive = stateRef.current.activeDocId
      if (nextActive && !survivorIds.has(nextActive)) {
        const activeIndex = currentDocs.findIndex((doc) => doc.id === nextActive)
        nextActive = null
        for (let i = activeIndex; i < currentDocs.length; i += 1) {
          if (survivorIds.has(currentDocs[i].id)) {
            nextActive = currentDocs[i].id
            break
          }
        }
        if (!nextActive) {
          for (let i = activeIndex - 1; i >= 0; i -= 1) {
            if (survivorIds.has(currentDocs[i].id)) {
              nextActive = currentDocs[i].id
              break
            }
          }
        }
      }

      setDocuments(nextDocs)
      setActiveDocId(nextActive)
      if (nextDocs.length === 0) setMode('view')
      setExportDialogFormat(null)
      setSettingsOpen(false)
      setAboutOpen(false)
    },
    [confirmUnsavedDocument]
  )

  const closeOtherDocuments = useCallback(
    (docId: string) => {
      const ids = stateRef.current.documents.filter((doc) => doc.id !== docId).map((doc) => doc.id)
      void closeDocuments(ids)
    },
    [closeDocuments]
  )

  const closeDocumentsToRight = useCallback(
    (docId: string) => {
      const docs = stateRef.current.documents
      const index = docs.findIndex((doc) => doc.id === docId)
      if (index < 0) return
      void closeDocuments(docs.slice(index + 1).map((doc) => doc.id))
    },
    [closeDocuments]
  )

  const closeSavedDocuments = useCallback(() => {
    const ids = stateRef.current.documents
      .filter((doc) => doc.content === doc.savedContent)
      .map((doc) => doc.id)
    void closeDocuments(ids)
  }, [closeDocuments])

  const closeAllDocuments = useCallback(() => {
    void closeDocuments(stateRef.current.documents.map((doc) => doc.id))
  }, [closeDocuments])

  const scrollToHeading = useCallback((id: string) => {
    if (mode === 'edit') {
      setEditorHeadingRequest((previous) => ({ id, request: (previous?.request ?? 0) + 1 }))
      setActiveHeadingId(id)
      return
    }
    const target = document.getElementById(id)
    if (!target) return
    scrollPreviewHeadingIntoView(target)
    setActiveHeadingId(id)
  }, [mode])

  const canToggleMdTheme = useCallback(() => {
    const s = stateRef.current
    return s.hasDoc && s.mode === 'view' && !s.exportDialogOpen && !s.settingsOpen && !s.aboutOpen
  }, [])

  const canToggleOutline = useCallback(() => {
    const s = stateRef.current
    return (s.hasDoc || workspaceFolder !== null) && !s.exportDialogOpen && !s.settingsOpen && !s.aboutOpen
  }, [workspaceFolder])

  const toggleOutline = useCallback(() => {
    if (!canToggleOutline()) return
    setOutlineVisible((prev) => !prev)
  }, [canToggleOutline])

  const toggleMdTheme = useCallback(() => {
    if (!canToggleMdTheme()) return
    setMdTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      setSettings((current) => ({ ...current, previewTheme: next }))
      void window.api.setSettings({ previewTheme: next }).then((saved) => {
        setSettings(saved)
        setMdTheme(saved.previewTheme)
      })
      return next
    })
  }, [canToggleMdTheme])

  const changeSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...patch, theme: 'dark' }))
      if (patch.language) {
        void i18n.changeLanguage(patch.language)
      }
      void window.api.setSettings(patch).then((next) => {
        setSettings(next)
        if (patch.language && next.language !== i18n.language) void i18n.changeLanguage(next.language)
      })
    },
    [i18n]
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

  const toggleSettings = useCallback(() => {
    if (stateRef.current.settingsOpen) {
      setSettingsOpen(false)
      return
    }
    openSettings()
  }, [openSettings])

  const toggleAbout = useCallback(() => {
    if (stateRef.current.aboutOpen) {
      setAboutOpen(false)
      return
    }
    openAbout()
  }, [openAbout])

  const focusSearch = useCallback(() => {
    if (!stateRef.current.hasDoc || stateRef.current.exportDialogOpen) return
    setSettingsOpen(false)
    setAboutOpen(false)
    setSearchFocusRequest((value) => value + 1)
  }, [])

  const focusReplace = useCallback(() => {
    const doc = stateRef.current.activeDoc
    if (!doc || doc.readOnly || stateRef.current.exportDialogOpen) return
    setSettingsOpen(false)
    setAboutOpen(false)
    setMode('edit')
    setReplaceFocusRequest((value) => value + 1)
  }, [])

  const selectAdjacentDocument = useCallback((direction: 1 | -1) => {
    const docs = stateRef.current.documents
    const activeId = stateRef.current.activeDocId
    if (docs.length < 2 || !activeId) return
    const index = docs.findIndex((doc) => doc.id === activeId)
    if (index < 0) return
    const next = docs[(index + direction + docs.length) % docs.length]
    selectDocument(next.id)
  }, [selectDocument])

  const toggleMode = useCallback(() => {
    const s = stateRef.current
    if (!s.hasDoc) return
    if (s.mode === 'view' && !s.activeDoc?.readOnly) setModeSafe('edit')
    else setModeSafe('view')
  }, [setModeSafe])

  const closeActivePanel = useCallback((): boolean => {
    const s = stateRef.current
    if (s.exportDialogOpen) {
      setExportDialogFormat(null)
      return true
    }
    if (s.settingsOpen) {
      setSettingsOpen(false)
      return true
    }
    if (s.aboutOpen) {
      setAboutOpen(false)
      return true
    }
    setTopBarDismissRequest((value) => value + 1)
    return false
  }, [])

  const changePreviewFontSize = useCallback(
    (next: number) => {
      if (!canToggleMdTheme()) return
      changeSettings({ previewFontSize: Math.min(MAX_PREVIEW_FONT_SIZE, Math.max(MIN_PREVIEW_FONT_SIZE, next)) })
    },
    [canToggleMdTheme, changeSettings]
  )

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    void document.documentElement.requestFullscreen()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing || dialogOpen) return

      const key = event.key.toLowerCase()
      const primary = event.ctrlKey || event.metaKey
      const onlyPrimary = primary && !event.altKey

      if (event.key === 'Escape') {
        closeActivePanel()
        return
      }

      if (event.key === 'F3') {
        event.preventDefault()
        if (event.shiftKey) doFindPrevious()
        else doFindNext()
        return
      }

      if (event.key === 'F11') {
        event.preventDefault()
        toggleFullscreen()
        return
      }

      if (!onlyPrimary) return

      if (key === 'n') {
        event.preventDefault()
        doNew()
        return
      }
      if (key === 'o') {
        event.preventDefault()
        if (event.shiftKey) void doOpenFolder()
        else void doOpen()
        return
      }
      if (key === 's') {
        event.preventDefault()
        const doc = stateRef.current.activeDoc
        if (!doc) {
          flash(t('notice.noDocument'), true)
          return
        }
        if (event.shiftKey) void saveDocumentAs(doc.id)
        else void saveDocument(doc.id)
        return
      }
      if (key === 'w') {
        event.preventDefault()
        const id = stateRef.current.activeDocId
        if (id) void closeDocument(id)
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        selectAdjacentDocument(event.shiftKey ? -1 : 1)
        return
      }
      if (key === 'f' && !event.shiftKey) {
        event.preventDefault()
        focusSearch()
        return
      }
      if (key === 'h' && !event.shiftKey) {
        event.preventDefault()
        focusReplace()
        return
      }
      if (key === 'b' && event.shiftKey) {
        event.preventDefault()
        toggleOutline()
        return
      }
      if (key === 'e' && event.shiftKey) {
        event.preventDefault()
        openExportDialog('pdf')
        return
      }
      if (key === 'e') {
        event.preventDefault()
        toggleMode()
        return
      }
      if (key === ',') {
        event.preventDefault()
        openSettings()
        return
      }
      if (key === 'q') {
        event.preventDefault()
        window.close()
        return
      }
      if (key === '+' || key === '=') {
        event.preventDefault()
        changePreviewFontSize(settings.previewFontSize + 1)
        return
      }
      if (key === '-') {
        event.preventDefault()
        changePreviewFontSize(settings.previewFontSize - 1)
        return
      }
      if (key === '0') {
        event.preventDefault()
        changePreviewFontSize(DEFAULT_PREVIEW_FONT_SIZE)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    changePreviewFontSize,
    closeActivePanel,
    closeDocument,
    dialogOpen,
    doFindNext,
    doFindPrevious,
    doNew,
    doOpen,
    doOpenFolder,
    flash,
    focusReplace,
    focusSearch,
    openExportDialog,
    openSettings,
    saveDocument,
    saveDocumentAs,
    selectAdjacentDocument,
    settings.previewFontSize,
    t,
    toggleFullscreen,
    toggleMode,
    toggleOutline
  ])

  // --- Wire main-process requests + pushed documents --------------------
  useEffect(() => {
    const offClose = window.api.onCloseRequest(() => {
      void confirmAnyUnsaved().then((result) => window.api.confirmClose(result === 'proceed'))
    })
    const offDoc = window.api.onOpenDocument((doc) => {
      addDocuments([{ path: doc.path, content: doc.content }])
      rememberRecent([doc.path])
    })
    const offWorkspace = window.api.onOpenWorkspace((folder) => {
      openWorkspace(folder)
    })
    return () => {
      offClose()
      offDoc()
      offWorkspace()
    }
  }, [confirmAnyUnsaved, addDocuments, openWorkspace, rememberRecent])

  useEffect(() => {
    const offUpdate = window.api.onUpdateState(setUpdateState)
    void window.api.getUpdateState().then(setUpdateState)
    return offUpdate
  }, [])

  // --- Drag & drop -------------------------------------------------------
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
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
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <TopBar
        title={title}
        hasDoc={hasDoc}
        readOnly={activeDoc?.readOnly === true}
        mode={mode}
        exportOpen={exportDialogFormat !== null}
        settingsOpen={settingsOpen}
        aboutOpen={aboutOpen}
        theme={mdTheme}
        onSetMode={setModeSafe}
        onOpen={doOpen}
        onOpenFolder={doOpenFolder}
        onNew={doNew}
        onSave={doSave}
        onSearch={doSearch}
        onFindNext={doFindNext}
        onReplace={doReplace}
        onReplaceActiveChange={setReplaceActive}
        searchMatchCount={searchMatchCount}
        activeSearchIndex={activeSearchIndex}
        canToggleTheme={canToggleMdTheme()}
        previewFontSize={settings.previewFontSize}
        canAdjustFontSize={canToggleMdTheme()}
        onFontSizeChange={(previewFontSize) => changeSettings({ previewFontSize })}
        previewFluidWidth={settings.previewFluidWidth}
        canTogglePreviewWidth={canToggleMdTheme()}
        onTogglePreviewWidth={() => changeSettings({ previewFluidWidth: !settings.previewFluidWidth })}
        outlineVisible={outlineVisible}
        canToggleOutline={canToggleOutline()}
        onToggleOutline={toggleOutline}
        onToggleTheme={toggleMdTheme}
        onExport={openExportDialog}
        onOpenSettings={toggleSettings}
        onOpenAbout={toggleAbout}
        searchFocusRequest={searchFocusRequest}
        replaceFocusRequest={replaceFocusRequest}
        dismissRequest={topBarDismissRequest}
      />

      {hasDoc && (
        <DocumentTabs
          tabs={tabs}
          activeId={activeDocId}
          onSelect={selectDocument}
          onClose={(id) => void closeDocument(id)}
          onCloseOthers={closeOtherDocuments}
          onCloseToRight={closeDocumentsToRight}
          onCloseSaved={closeSavedDocuments}
          onCloseAll={closeAllDocuments}
        />
      )}

      <div className="body">
        {(hasDoc || workspaceFolder) && !exportDialogFormat && !settingsOpen && !aboutOpen && outlineVisible && (
          <Sidebar
            hasDoc={hasDoc}
            outline={outline}
            activeId={activeHeadingId}
            showOutline={!exportDialogFormat}
            workspaceFolder={workspaceFolder}
            activeDocumentPath={activeDoc?.path ?? null}
            workspaceSearchTerm={workspaceSearchTerm}
            workspaceSearchResults={workspaceSearchResults}
            workspaceSearchLoading={workspaceSearchLoading}
            onSelectHeading={scrollToHeading}
            onWorkspaceSearch={setWorkspaceSearchTerm}
            onOpenWorkspaceFile={(path, search) => void openWorkspaceFile(path, search)}
          />
        )}

        <main className="main">
          <div className="workspace">
            {settingsOpen ? (
              <div className="export-workspace export-workspace--settings">
                <SettingsDialog
                  settings={settings}
                  onClose={() => setSettingsOpen(false)}
                  onChange={changeSettings}
                />
              </div>
            ) : aboutOpen ? (
              <div className="export-workspace">
                <AboutDialog
                  version={packageJson.version}
                  updateState={updateState}
                  onClose={() => setAboutOpen(false)}
                  onCheckForUpdates={checkForUpdate}
                />
              </div>
            ) : !hasDoc ? (
              <Welcome
                onOpen={() => void doOpen()}
                onOpenFolder={() => void doOpenFolder()}
                onNew={doNew}
                recentFiles={settings.recentFiles}
                recentFolders={settings.recentFolders}
                onOpenRecent={openRecent}
                onOpenRecentFolder={(path) => void openRecentFolder(path)}
                onForgetRecent={(path) => forgetRecent([path])}
                onForgetRecentFolder={forgetRecentFolder}
              />
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
                highlightActive={replaceActive}
                headingToReveal={editorHeadingRequest}
                onChange={updateActiveContent}
              />
            ) : (
              <Preview
                html={html}
                documentName={activeDoc ? documentName(activeDoc, t('app.untitled')) : t('app.untitled')}
                mdTheme={mdTheme}
                searchTerm={searchTerm}
                settings={settings}
              />
            )}
          </div>
        </main>
      </div>

      <StatusBar hasDoc={hasDoc} stats={stats} onGuide={doGuide} />

      {dragging && <div className="drop-overlay">{t('welcome.dropHint')}</div>}
      {dismissedUpdate !== updateKey && (
        <UpdateNotice
          state={updateState}
          onDismiss={() => setDismissedUpdate(updateKey)}
          onDownload={downloadUpdate}
          onInstall={installUpdate}
          onRetry={checkForUpdate}
        />
      )}
      {notice && <div className={`notice ${notice.error ? 'notice--error' : ''}`}>{notice.text}</div>}
      {dialogOpen && <ConfirmDialog onChoice={onDialogChoice} />}
    </div>
  )
}
