import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { Preview } from './components/Preview'
import { Welcome } from './components/Welcome'
import { DocumentTabs, type DocumentTabItem } from './components/DocumentTabs'
import { SplitView } from './components/SplitView'
import { ConfirmDialog, type ConfirmChoice } from './components/ConfirmDialog'
import type { ExportDialogOptions } from './components/ExportDialog'
import type { EditorDocumentStats, EditorHandle, EditorIdleStats } from './components/Editor'
import { SettingsDialog } from './components/SettingsDialog'
import { AboutDialog } from './components/AboutDialog'
import { UpdateNotice } from './components/UpdateNotice'
import { ExportProgress } from './components/ExportProgress'
import { OpenProgress } from './components/OpenProgress'
import {
  documentAssetBaseUrl,
  MarkdownWorkerRequestCanceledError,
  renderMarkdownDocumentInWorker,
  renderMarkdownInWorker,
  type MarkdownRenderResult
} from './lib/markdown'
import { getHeadingTopInScroller, scrollPreviewHeadingIntoView } from './lib/previewScroll'
import { buildSplitAnchors, editorLineForPreviewTop, headingIdForLine, previewTopForEditorLine } from './lib/splitScroll'
import { useDebounced } from './lib/useDebounced'
import { useDocumentState, usePanelState, useSearchState, useSettingsState, useUpdateState, type WorkspaceDocument } from './hooks/useAppState'
import { useElementWidth } from './hooks/useElementWidth'
import { getPreviewSchedule } from './lib/previewSchedule'
import { beginRendererMeasure } from './lib/performanceMetrics'
import { findLiteralMatches } from './lib/search'
import { draftFailureNotice } from './lib/draftFailure'
import type { OutlineItem } from './lib/outline'
import { getExtraMermaidGuideExamples } from './lib/mermaidGuide'
import { renderMermaidFlowcharts } from './lib/mermaid'
import {
  AUTO_SAVE_DELAY_MS,
  MAX_RECENT_FILES,
  SPLIT_MIN_WIDTH_PX,
  type DocumentSizeProfile,
  type DraftEditPayload,
  type ExportFormat,
  type ExportProgress as ExportProgressState,
  type Settings,
} from '../electron/shared'
import packageJson from '../package.json'

const loadEditor = (): Promise<typeof import('./components/Editor')> => import('./components/Editor')
const loadExportDialog = (): Promise<typeof import('./components/ExportDialog')> => import('./components/ExportDialog')

const Editor = lazy(async () => ({ default: (await loadEditor()).Editor }))
const ExportDialog = lazy(async () => ({ default: (await loadExportDialog()).ExportDialog }))

/**
 * Fetch the editor chunk once the app has settled.
 *
 * Splitting it out keeps CodeMirror off the startup path, but the first keystroke would
 * then pay for the download. Warming it while the window is idle keeps both: the chunk is
 * not on the critical path, and it is already there when the user starts typing. The
 * import is cached by the module registry, so `lazy` later resolves without a second
 * fetch, and a failure here is not surfaced — `lazy` will retry and report it properly.
 */
function warmLazyChunks(): () => void {
  const warm = (): void => {
    void loadEditor().catch(() => undefined)
  }

  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(warm, { timeout: 2000 })
    return () => cancelIdleCallback(handle)
  }

  const handle = setTimeout(warm, 1000)
  return () => clearTimeout(handle)
}

const MIN_PREVIEW_FONT_SIZE = 12
const MAX_PREVIEW_FONT_SIZE = 24
const DEFAULT_PREVIEW_FONT_SIZE = 16
const MIN_EDITOR_FONT_SIZE = 12
const MAX_EDITOR_FONT_SIZE = 24
/** Matches the `.cm-editor` base size, so an untouched editor looks unchanged. */
const DEFAULT_EDITOR_FONT_SIZE = 14

/** Below this file count, an open-dialog selection resolves fast enough that a progress banner would only flicker. */
const LARGE_OPEN_SELECTION_THRESHOLD = 4
/** How long the pane being scrolled keeps the sync to itself, so the other pane cannot bounce back. */
const SCROLL_OWNER_HOLD_MS = 150

type DocumentState = WorkspaceDocument

interface DocumentInput {
  path: string | null
  title?: string | null
  content: string
  savedContent?: string
  draftId?: string | null
  draftSavedContent?: string | null
  readOnly?: boolean
  sizeProfile?: DocumentSizeProfile
}

function needsUnsavedConfirmation(doc: DocumentState, autoSave: boolean): boolean {
  if (autoSave && !doc.path && doc.draftId) return doc.draftSavedRevision !== doc.revision
  return doc.savedRevision !== doc.revision
}

interface DocumentStats {
  length: number
  lines: number
  tokens: number
  words: number
}

function getDocumentStats(text: string): DocumentStats {
  let lines = text ? 1 : 0
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') lines += 1
  }

  const trimmed = text.trim()
  let words = 0
  let characters = 0
  let insideWord = false
  for (const character of trimmed) {
    characters += 1
    if (/\s/.test(character)) {
      insideWord = false
    } else if (!insideWord) {
      words += 1
      insideWord = true
    }
  }

  return {
    length: text.length,
    lines,
    tokens: Math.ceil(characters / 4),
    words
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

const EMPTY_MARKDOWN_RESULT: MarkdownRenderResult = { html: '', outline: [], headingLines: new Map() }

export function App(): JSX.Element {
  const { t, i18n } = useTranslation()

  const { settings, setSettings, mdTheme, setMdTheme } = useSettingsState()
  const { documents, setDocuments, activeDocId, setActiveDocId, mode, setMode, activeDoc } = useDocumentState()
  const { searchTerm, setSearchTerm, activeSearchIndex, setActiveSearchIndex, editorSearchMatchCount, setEditorSearchMatchCount, previewSearchMatchCount, setPreviewSearchMatchCount } = useSearchState()
  const [editorOutline, setEditorOutline] = useState<OutlineItem[]>([])
  const [previewState, setPreviewState] = useState<{
    documentId: string | null
    result: MarkdownRenderResult
  }>({ documentId: null, result: EMPTY_MARKDOWN_RESULT })
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [openProgress, setOpenProgress] = useState<{ completed: number; total: number; canceling: boolean } | null>(null)
  const [exportProgress, setExportProgress] = useState<{ progress: ExportProgressState; canceling: boolean } | null>(null)
  const openSessionRef = useRef<{ sessionId: string; showProgress: boolean; paths: string[] } | null>(null)
  const { updateState, setUpdateState, dismissedUpdate, setDismissedUpdate } = useUpdateState()
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const [editorHeadingRequest, setEditorHeadingRequest] = useState<{ line: number; request: number } | null>(null)
  const [previewHeadingRequest, setPreviewHeadingRequest] = useState<{ id: string; request: number } | null>(null)

  const { dialogOpen, setDialogOpen, exportDialogFormat, setExportDialogFormat, settingsOpen, setSettingsOpen, aboutOpen, setAboutOpen, outlineVisible, setOutlineVisible, searchFocusRequest, setSearchFocusRequest, replaceFocusRequest, setReplaceFocusRequest, topBarDismissRequest, setTopBarDismissRequest } = usePanelState()
  const dialogResolver = useRef<((c: ConfirmChoice) => void) | null>(null)
  const nextDocSeq = useRef(1)
  const draftsLoaded = useRef(false)
  const draftSavesInFlight = useRef(new Map<string, Promise<boolean>>())
  /** Editor transactions awaiting autosave, per draft, kept as ordered batches. */
  const pendingDraftEdits = useRef(new Map<string, DraftEditPayload[][]>())
  const previewHeadingsRef = useRef<HTMLElement[]>([])
  const editorRef = useRef<EditorHandle | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const previewPaneRef = useRef<HTMLDivElement | null>(null)
  const [previewPaneElement, setPreviewPaneElement] = useState<HTMLDivElement | null>(null)
  /** Pane the font-size control acts on while both are visible. */
  const [splitFocus, setSplitFocus] = useState<'editor' | 'preview'>('editor')
  const editorTopLineRef = useRef(0)
  const syncedHeadingRef = useRef<string | null>(null)
  /** Pane currently driving the split scroll sync, with the time of its last scroll. */
  const scrollOwnerRef = useRef<{ pane: 'editor' | 'preview'; at: number } | null>(null)

  const hasDoc = activeDoc !== null
  const content = activeDoc?.content ?? ''
  const dirty = hasDoc && activeDoc.revision !== activeDoc.savedRevision
  const hasDirtyDocs = documents.some((doc) => needsUnsavedConfirmation(doc, settings.autoSave))
  const previewSchedule = getPreviewSchedule(activeDoc?.stats.length ?? 0)
  const virtualizedPreview = activeDoc?.sizeProfile === 'very-large'
  const workspaceWidth = useElementWidth(mainRef)
  const panelOpen = exportDialogFormat !== null || settingsOpen || aboutOpen
  /** Two panes below this width leave neither of them readable. */
  const splitFits = workspaceWidth >= SPLIT_MIN_WIDTH_PX
  const canToggleSplit = hasDoc && activeDoc?.readOnly !== true && !panelOpen && splitFits && mode === 'edit'
  const splitActive = canToggleSplit && settings.splitView
  const previewVisible = mode === 'view' || splitActive

  const debouncedContent = useDebounced(content, previewSchedule.debounceMs)
  const debouncedSearchTerm = useDebounced(searchTerm, 200)

  useEffect(() => warmLazyChunks(), [])
  useEffect(() => {
    // With no document open the preview is not mounted at all — the welcome screen is —
    // so rendering here would be work nothing displays.
    if (!activeDoc || !previewVisible || debouncedContent !== content) {
      return
    }

    let canceled = false
    const documentId = activeDoc?.id ?? null
    const documentPath = activeDoc?.path
    void renderMarkdownDocumentInWorker(debouncedContent, {
      documentPath,
      assetMode: 'app',
      blockMode: virtualizedPreview
    })
      .then((result) => {
        if (!canceled) setPreviewState({ documentId, result })
      })
      .catch((error: unknown) => {
        if (!canceled && !(error instanceof MarkdownWorkerRequestCanceledError)) {
          console.error('Markdown preview failed:', error)
        }
      })

    return () => {
      canceled = true
    }
  }, [activeDoc?.id, activeDoc?.path, content, debouncedContent, previewVisible, virtualizedPreview])
  const preview = previewVisible && previewState.documentId === (activeDoc?.id ?? null)
    ? previewState.result
    : EMPTY_MARKDOWN_RESULT
  const html = preview.html
  const outline = useMemo(() => {
    if (!outlineVisible) return []
    return mode === 'view' ? preview.outline : editorOutline
  }, [editorOutline, mode, outlineVisible, preview.outline])
  const outlineRef = useRef(outline)
  outlineRef.current = outline
  const stats = activeDoc?.stats ?? { length: 0, lines: 0, tokens: 0, words: 0 }
  const searchMatchCount = mode === 'view' ? previewSearchMatchCount : editorSearchMatchCount
  // Live snapshot: the sync callback is stable but has to read the current render.
  const splitSyncRef = useRef({
    active: splitActive,
    virtualized: virtualizedPreview,
    headingLines: preview.headingLines,
    totalLines: stats.lines
  })
  splitSyncRef.current = {
    active: splitActive,
    virtualized: virtualizedPreview,
    headingLines: preview.headingLines,
    totalLines: stats.lines
  }
  // With both panes on screen the font control follows the pane last touched.
  const fontTarget: 'editor' | 'preview' = splitActive ? splitFocus : mode === 'edit' ? 'editor' : 'preview'
  const activeFontSize = fontTarget === 'editor' ? settings.editorFontSize : settings.previewFontSize
  const defaultFontSize = fontTarget === 'editor' ? DEFAULT_EDITOR_FONT_SIZE : DEFAULT_PREVIEW_FONT_SIZE
  const tabs = useMemo<DocumentTabItem[]>(
    () =>
      documents.map((doc) => ({
        id: doc.id,
        title: documentName(doc, t('app.untitled')),
        dirty: doc.revision !== doc.savedRevision
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
    autoSave: settings.autoSave,
    searchMatchCount,
    exportDialogOpen: false,
    settingsOpen: false,
    aboutOpen: false,
    canToggleSplit,
    splitView: settings.splitView,
    splitActive,
    fontTarget
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
    autoSave: settings.autoSave,
    searchMatchCount,
    exportDialogOpen: exportDialogFormat !== null,
    settingsOpen,
    aboutOpen,
    canToggleSplit,
    splitView: settings.splitView,
    splitActive,
    fontTarget
  }

  const flash = useCallback((text: string, error = false) => {
    setNotice({ text, error })
    window.setTimeout(() => setNotice(null), 2600)
  }, [])

  const openLocalPath = useCallback(async (fileUrl: string): Promise<void> => {
    const result = await window.api.openLocalPath(fileUrl)
    if (!result.ok) flash(t('notice.openFailed', { error: result.error }), true)
  }, [flash, t])

  const updateKey = `${updateState.status}:${updateState.version ?? ''}:${updateState.error ?? ''}`

  const checkForUpdate = useCallback(() => {
    setDismissedUpdate(null)
    void window.api.checkForUpdate().then(setUpdateState)
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
       const addedDocs: DocumentState[] = []
       let nextActiveId: string | null = null

      for (const item of items) {
        const existingIndex = item.path ? nextDocs.findIndex((doc) => doc.path === item.path) : -1

        if (existingIndex >= 0) {
          const existing = nextDocs[existingIndex]
          nextActiveId ??= existing.id
          if (existing.revision === existing.savedRevision) {
            nextDocs[existingIndex] = {
              ...existing,
              content: item.content,
              stats: getDocumentStats(item.content),
              revision: 0,
              savedRevision: 0,
              readOnly: existing.readOnly || item.readOnly === true,
              sizeProfile: item.sizeProfile ?? existing.sizeProfile
            }
          }
          continue
        }

        const doc: DocumentState = {
          id: newDocumentId(),
          path: item.path,
          title: item.title ?? null,
          content: item.content,
          stats: getDocumentStats(item.content),
          revision: item.savedContent === undefined || item.savedContent === item.content ? 0 : 1,
          savedRevision: 0,
          draftId: item.draftId ?? (item.path ? null : `draft-${newDocumentId()}`),
          draftSavedRevision: item.draftSavedContent === undefined ? null : 1,
          readOnly: item.readOnly === true,
          sizeProfile: item.sizeProfile
         }
         nextDocs.push(doc)
         addedDocs.push(doc)
         nextActiveId ??= doc.id
      }

      setDocuments(nextDocs)
      setActiveDocId(nextActiveId)
       // Very large editable documents open in the editor. Preview remains an
       // explicit action, avoiding an immediate full Markdown parse on open.
       const deferPreview = nextMode === 'view' && addedDocs.some(
         (doc) => !doc.readOnly && (doc.sizeProfile === 'very-large' || getPreviewSchedule(doc.content.length).deferred)
       )
       setMode(deferPreview ? 'edit' : nextMode)
      setExportDialogFormat(null)
      setSettingsOpen(false)
      setAboutOpen(false)
    },
    [newDocumentId]
  )

  const materializeEditorContent = useCallback((): string | null => {
    const doc = stateRef.current.activeDoc
    if (!doc || stateRef.current.mode !== 'edit') return null
    const nextContent = editorRef.current?.getContent()
    if (nextContent === undefined || nextContent === doc.content) return nextContent ?? null
    setDocuments((prev) => prev.map((item) => (item.id === doc.id ? { ...item, content: nextContent } : item)))
    return nextContent
  }, [])

  const updateActiveRevision = useCallback((documentId: string, nextStats: EditorDocumentStats) => {
    if (stateRef.current.activeDocId !== documentId || stateRef.current.activeDoc?.readOnly) return
    setDocuments((prev) => prev.map((doc) => (
      doc.id === documentId
        ? { ...doc, revision: doc.revision + 1, stats: { ...doc.stats, ...nextStats } }
        : doc
    )))
  }, [])

  /**
   * Feed the live preview while typing.
   *
   * Between saves the editor owns the text — keystrokes only bump the revision — so the split
   * view has to pull it out on idle. The document schedule sets the pace, which keeps large
   * documents from re-rendering faster than they can.
   */
  useEffect(() => {
    if (!splitActive) return
    const timer = window.setTimeout(() => materializeEditorContent(), previewSchedule.debounceMs)
    return () => window.clearTimeout(timer)
  }, [activeDoc?.revision, materializeEditorContent, previewSchedule.debounceMs, splitActive])

  /**
   * Queues one transaction for the next autosave. Batches stay separate because each is expressed
   * against the text the previous one produced.
   */
  const recordEditorEdits = useCallback((documentId: string, edits: DraftEditPayload[]) => {
    const doc = stateRef.current.documents.find((item) => item.id === documentId)
    if (!doc?.draftId || doc.path || doc.readOnly || !stateRef.current.autoSave) return
    const queued = pendingDraftEdits.current.get(doc.draftId)
    if (queued) queued.push(edits)
    else pendingDraftEdits.current.set(doc.draftId, [edits])
  }, [])

  const updateIdleStats = useCallback((documentId: string, nextStats: EditorIdleStats) => {
    setDocuments((prev) => prev.map((doc) => (doc.id === documentId ? { ...doc, stats: nextStats } : doc)))
  }, [])

  const updateEditorOutline = useCallback((documentId: string, nextOutline: OutlineItem[]) => {
    if (stateRef.current.activeDocId === documentId && stateRef.current.mode === 'edit') {
      setEditorOutline(nextOutline)
    }
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
  }, [debouncedSearchTerm, searchMatchCount])

  // --- Initial settings and recovered untitled documents ----------------
  useEffect(() => {
    if (draftsLoaded.current) return
    draftsLoaded.current = true

    void Promise.all([window.api.getSettings(), window.api.getDrafts()])
      .then(([s, drafts]) => {
        setSettings(s)
        setMdTheme(s.previewTheme)
        void i18n.changeLanguage(s.language)
        if (drafts.length > 0) {
          addDocuments(
            drafts.map((draft) => ({
              path: null,
              title: draft.title,
              content: draft.content,
              savedContent: '',
              draftId: draft.id,
              draftSavedContent: draft.content
            }))
          )
        }
      })
      .catch((err: Error) => flash(t('notice.draftRestoreFailed', { error: err.message }), true))
  }, [addDocuments, flash, i18n, t])

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

  const persistDraftDocument = useCallback(
    async (docId: string): Promise<boolean> => {
      if (!stateRef.current.autoSave) return false

      const doc = stateRef.current.documents.find((item) => item.id === docId)
      if (!doc || doc.path || doc.readOnly || !doc.draftId || doc.draftSavedRevision === doc.revision) {
        return false
      }

      const inFlight = draftSavesInFlight.current.get(doc.draftId)
      if (inFlight) return inFlight

      const draftId = doc.draftId
      const revision = doc.revision
      const title = documentName(doc, t('app.untitled'))
      // Drained together with the length they produce: both are updated by the same editor
      // transaction, and nothing can run between these two synchronous reads.
      const batches = pendingDraftEdits.current.get(draftId) ?? []
      pendingDraftEdits.current.delete(draftId)
      const editedLength = doc.stats.length
      // Journaling only works on top of a snapshot this draft already has on disk.
      const canJournal = doc.draftSavedRevision !== null && batches.length > 0

      const operation = (async (): Promise<boolean> => {
        try {
          if (canJournal) {
            const appended = await window.api.appendDraftEdits(draftId, batches, editedLength)
            if (appended.ok) {
              setDocuments((prev) =>
                prev.map((item) =>
                  item.id === docId && item.draftId === draftId
                    ? { ...item, draftSavedRevision: revision }
                    : item
                )
              )
              return true
            }
            if (appended.reason === 'error') {
              const notice = draftFailureNotice(appended)
              flash(t(notice.key, notice.params), true)
              return false
            }
            // The journal cannot describe this state; fall through to a full snapshot.
          }

          const content = doc.id === stateRef.current.activeDocId
            ? materializeEditorContent() ?? doc.content
            : doc.content
          const result = await window.api.saveDraft({ id: draftId, title, content })
          if (!result.ok) {
            const notice = draftFailureNotice(result)
            flash(t(notice.key, notice.params), true)
            return false
          }
          setDocuments((prev) =>
            prev.map((item) =>
              item.id === docId && item.draftId === draftId
                ? { ...item, content, draftSavedRevision: revision }
                : item
            )
          )
          return true
        } catch (err) {
          flash(t('notice.autoSaveFailed', { error: (err as Error).message }), true)
          return false
        }
      })()

      draftSavesInFlight.current.set(draftId, operation)
      try {
        return await operation
      } finally {
        draftSavesInFlight.current.delete(draftId)
      }
    },
    [flash, materializeEditorContent, t]
  )

  useEffect(() => {
    if (!settings.autoSave) return
    const pending = documents.filter(
      (doc) => !doc.path && !doc.readOnly && doc.draftId && doc.draftSavedRevision !== doc.revision
    )
    if (pending.length === 0) return

    const timer = window.setTimeout(() => {
      pending.forEach((doc) => void persistDraftDocument(doc.id))
    }, AUTO_SAVE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [documents, persistDraftDocument, settings.autoSave])

  /**
   * Writes every draft whose edits are still only in memory. Autosave is debounced, so leaving the
   * editor, switching tabs or quitting must not drop the window between the last keystroke and the
   * next tick.
   */
  const flushPendingDrafts = useCallback(async (): Promise<void> => {
    if (!stateRef.current.autoSave) return
    const pending = stateRef.current.documents.filter(
      (doc) => !doc.path && !doc.readOnly && doc.draftId && doc.draftSavedRevision !== doc.revision
    )
    await Promise.all(pending.map((doc) => persistDraftDocument(doc.id)))
  }, [persistDraftDocument])

  const removeDocumentDraft = useCallback(
    async (doc: Pick<DocumentState, 'draftId'>): Promise<boolean> => {
      if (!doc.draftId) return true
      await draftSavesInFlight.current.get(doc.draftId)
      try {
        const result = await window.api.removeDraft(doc.draftId)
        if (result.ok) return true
        flash(t('notice.autoSaveCleanupFailed', { error: result.error }), true)
        return false
      } catch (err) {
        flash(t('notice.autoSaveCleanupFailed', { error: (err as Error).message }), true)
        return false
      }
    },
    [flash, t]
  )

  const saveDocumentAs = useCallback(
    async (docId: string): Promise<boolean> => {
      const doc = stateRef.current.documents.find((item) => item.id === docId)
      if (!doc) return false
      if (doc.readOnly) {
        flash(t('notice.readOnlyGuide'), true)
        return false
      }

      const suggested = markdownFileName(documentName(doc, 'untitled'))
      const savedText = doc.id === stateRef.current.activeDocId
        ? materializeEditorContent() ?? doc.content
        : doc.content
      const savedRevision = doc.revision
      const res = await window.api.saveAs(savedText, suggested)
      if (res.ok) {
        const draftRemoved = await removeDocumentDraft(doc)
        setDocuments((prev) =>
          prev.map((item) =>
            item.id === docId
              ? {
                  ...item,
                  path: res.path,
                  content: savedText,
                  savedRevision,
                  draftId: draftRemoved ? null : item.draftId,
                  draftSavedRevision: draftRemoved ? null : item.draftSavedRevision
                }
              : item
          )
        )
        flash(t('notice.saveSuccess'))
        return true
      }
      if (!res.canceled) flash(t('notice.saveFailed', { error: res.error }), true)
      return false
    },
    [flash, removeDocumentDraft, t]
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

      const savedText = doc.id === stateRef.current.activeDocId
        ? materializeEditorContent() ?? doc.content
        : doc.content
      const savedRevision = doc.revision
      const res = await window.api.save(doc.path, savedText)
      if (res.ok) {
        const draftRemoved = await removeDocumentDraft(doc)
        setDocuments((prev) =>
          prev.map((item) =>
            item.id === docId
              ? {
                  ...item,
                  content: savedText,
                  savedRevision,
                  draftId: draftRemoved ? null : item.draftId,
                  draftSavedRevision: draftRemoved ? null : item.draftSavedRevision
                }
              : item
          )
        )
        flash(t('notice.saveSuccess'))
        return true
      }
      flash(t('notice.saveFailed', { error: res.error }), true)
      return false
    },
    [flash, removeDocumentDraft, saveDocumentAs, t]
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
      if (!doc || !needsUnsavedConfirmation(doc, stateRef.current.autoSave)) return 'proceed'

      setActiveDocId(docId)
      const choice = await askUnsaved()
      if (choice === 'discard') return 'proceed'
      if (choice === 'save') return (await saveDocument(docId)) ? 'proceed' : 'cancel'
      return 'cancel'
    },
    [askUnsaved, saveDocument]
  )

  const confirmAnyUnsaved = useCallback(async (): Promise<'proceed' | 'cancel'> => {
    // Persist debounced draft edits first, so quitting never asks about work autosave already owns.
    await flushPendingDrafts()
    const dirtyDocs = stateRef.current.documents.filter((doc) =>
      needsUnsavedConfirmation(doc, stateRef.current.autoSave)
    )
    if (dirtyDocs.length === 0) return 'proceed'

    setActiveDocId(dirtyDocs[0].id)
    const choice = await askUnsaved()
    if (choice === 'discard') {
      const removed = await Promise.all(dirtyDocs.map(removeDocumentDraft))
      return removed.every(Boolean) ? 'proceed' : 'cancel'
    }
    if (choice !== 'save') return 'cancel'

    for (const doc of dirtyDocs) {
      setActiveDocId(doc.id)
      if (!(await saveDocument(doc.id))) return 'cancel'
    }
    return 'proceed'
  }, [askUnsaved, flushPendingDrafts, removeDocumentDraft, saveDocument])

  const doOpen = useCallback(async () => {
    const res = await window.api.openDialog()
    if (!res.ok) {
      if (!res.canceled) flash(t('notice.openFailed', { error: res.error }), true)
      return
    }
    materializeEditorContent()
    const showProgress = res.total >= LARGE_OPEN_SELECTION_THRESHOLD
    openSessionRef.current = { sessionId: res.sessionId, showProgress, paths: [] }
    setOpenProgress(showProgress ? { completed: 0, total: res.total, canceling: false } : null)
  }, [flash, materializeEditorContent, t])

  const cancelExport = useCallback(() => {
    setExportProgress((prev) => (prev ? { ...prev, canceling: true } : prev))
    void window.api.cancelExport()
  }, [])

  const cancelOpenMany = useCallback(() => {
    const session = openSessionRef.current
    if (!session) return
    setOpenProgress((prev) => (prev ? { ...prev, canceling: true } : prev))
    void window.api.cancelOpenMany(session.sessionId)
  }, [])

  const openPaths = useCallback(
    async (paths: string[]) => {
      const opened: DocumentInput[] = []
      const failed: string[] = []
      for (const path of paths) {
        // Covers the whole delivery: main's chunked read, IPC, and streaming UTF-8 decode.
        const finishMeasure = beginRendererMeasure('document:ipc-delivery')
        const res = await window.api.readPath(path)
        finishMeasure({ sizeBytes: res.ok ? res.sizeBytes : 0 })
        if (res.ok) opened.push({ path: res.path, content: res.content, sizeProfile: res.sizeProfile })
        else {
          failed.push(path)
          if (res.error === 'unsupported') flash(t('notice.unsupported'), true)
          else flash(t('notice.openFailed', { error: res.error }), true)
        }
      }
      materializeEditorContent()
      addDocuments(opened)
      rememberRecent(opened.map((doc) => doc.path))
      // Drop paths that no longer open (e.g. a recent file that was moved/deleted).
      forgetRecent(failed)
    },
    [addDocuments, flash, forgetRecent, materializeEditorContent, rememberRecent, t]
  )

  const openRecent = useCallback((path: string) => void openPaths([path]), [openPaths])

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
      const sourceContent = s.activeDoc.id === s.activeDocId
        ? materializeEditorContent() ?? s.activeDoc.content
        : s.activeDoc.content
      const renderedMarkdown = await renderMarkdownInWorker(sourceContent, { documentPath: s.activeDoc.path })
      const rendered = await renderMermaidFlowcharts(renderedMarkdown, 'light')
      const { buildStandaloneHtml } = await import('./lib/exportHtml')
      const name = documentName(s.activeDoc, t('app.untitled'))
      // Exports (HTML/PDF/PNG) always use the light theme, regardless of the preview theme.
      const doc = buildStandaloneHtml(rendered, 'light', name, {
        fontFamily: settings.previewFontFamily,
        fontSize: settings.previewFontSize,
        lineHeight: settings.previewLineHeight
      })
      const base = name.replace(/\.[^.]+$/, '')
      setExportProgress({ progress: { phase: 'render' }, canceling: false })
      try {
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
      } finally {
        setExportProgress(null)
      }
    },
    [flash, materializeEditorContent, settings.previewFontFamily, settings.previewFontSize, settings.previewLineHeight, t]
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
    if (stateRef.current.mode === 'edit' && next === 'view') materializeEditorContent()
    setExportDialogFormat(null)
    setSettingsOpen(false)
    setAboutOpen(false)
    setMode(next)
  }, [materializeEditorContent])

  const doNew = useCallback(() => {
    const documentCount = stateRef.current.documents.length
    const title = documentCount === 0 ? t('app.untitled') : `${t('app.untitled')} ${documentCount + 1}`
    materializeEditorContent()
    addDocuments([{ path: null, title, content: '' }], 'edit')
  }, [addDocuments, materializeEditorContent, t])

  const doSearch = useCallback((term: string) => {
    setSearchTerm(term)
    setActiveSearchIndex(null)
    setEditorSearchMatchCount(0)
    setPreviewSearchMatchCount(0)
  }, [])

  const doFindNext = useCallback(() => {
    const term = searchTerm.trim()
    const count = stateRef.current.searchMatchCount
    if (!term || count === 0) {
      flash(t('notice.replaceNone'), true)
      return
    }
    setExportDialogFormat(null)
    setSettingsOpen(false)
    setAboutOpen(false)
    setActiveSearchIndex((index) => (index === null ? 0 : (index + 1) % count))
  }, [flash, searchTerm, t])

  const doFindPrevious = useCallback(() => {
    const term = searchTerm.trim()
    const count = stateRef.current.searchMatchCount
    if (!term || count === 0) {
      flash(t('notice.replaceNone'), true)
      return
    }
    setExportDialogFormat(null)
    setSettingsOpen(false)
    setAboutOpen(false)
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

      const sourceContent = materializeEditorContent() ?? doc.content
      const result = replaceTextLiteral(sourceContent, term, replacement, all, activeSearchIndex)
      if (result.count === 0) {
        flash(t('notice.replaceNone'), true)
        return
      }

      editorRef.current?.replaceContent(result.text)
      setActiveSearchIndex(result.nextIndex)
      setExportDialogFormat(null)
      setSettingsOpen(false)
      setAboutOpen(false)
      flash(t(all ? 'notice.replaceAllSuccess' : 'notice.replaceOneSuccess', { count: result.count }))
    },
    [activeSearchIndex, flash, materializeEditorContent, t]
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
    if (res.ok) {
      materializeEditorContent()
      addDocuments([{
      path: res.path,
      content: res.content.replace('<!-- MERMAID_EXAMPLES -->', getExtraMermaidGuideExamples(settings.language)),
      sizeProfile: res.sizeProfile,
      readOnly: true
      }])
    }
    else flash(t('notice.openFailed', { error: res.error }), true)
  }, [addDocuments, flash, materializeEditorContent, settings.language, t])

  const selectDocument = useCallback((docId: string) => {
    const selected = stateRef.current.documents.find((doc) => doc.id === docId)
    if (docId !== stateRef.current.activeDocId) {
      materializeEditorContent()
      void flushPendingDrafts()
    }
    setActiveDocId(docId)
    if (selected?.readOnly) setMode('view')
    setExportDialogFormat(null)
    setSettingsOpen(false)
    setAboutOpen(false)
  }, [flushPendingDrafts, materializeEditorContent])

  const closeDocument = useCallback(
    async (docId: string) => {
      if ((await confirmUnsavedDocument(docId)) === 'cancel') return

      const currentDocs = stateRef.current.documents
      const index = currentDocs.findIndex((doc) => doc.id === docId)
      if (index < 0) return
      if (!(await removeDocumentDraft(currentDocs[index]))) return

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
    [confirmUnsavedDocument, removeDocumentDraft]
  )

  const closeDocuments = useCallback(
    async (ids: string[]) => {
      const idSet = new Set(ids)
      if (idSet.size === 0) return

      // Confirm each dirty document in the set; abort all if the user cancels.
      const dirtyDocs = stateRef.current.documents.filter(
        (doc) => idSet.has(doc.id) && needsUnsavedConfirmation(doc, stateRef.current.autoSave)
      )
      for (const doc of dirtyDocs) {
        if ((await confirmUnsavedDocument(doc.id)) === 'cancel') return
      }

      const currentDocs = stateRef.current.documents
      const removed = await Promise.all(currentDocs.filter((doc) => idSet.has(doc.id)).map(removeDocumentDraft))
      if (!removed.every(Boolean)) return
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
    [confirmUnsavedDocument, removeDocumentDraft]
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

  const closeDocumentFromTab = useCallback((docId: string) => {
    void closeDocument(docId)
  }, [closeDocument])

  const closeSavedDocuments = useCallback(() => {
    const ids = stateRef.current.documents
      .filter((doc) => doc.revision === doc.savedRevision)
      .map((doc) => doc.id)
    void closeDocuments(ids)
  }, [closeDocuments])

  const closeAllDocuments = useCallback(() => {
    void closeDocuments(stateRef.current.documents.map((doc) => doc.id))
  }, [closeDocuments])

  const scrollToHeading = useCallback((id: string) => {
    if (mode === 'edit') {
      const line = outlineRef.current.find((item) => item.id === id)?.sourceLine
      if (line === undefined) return
      setEditorHeadingRequest((previous) => ({ line, request: (previous?.request ?? 0) + 1 }))
      setActiveHeadingId(id)
      return
    }
    const target = previewHeadingsRef.current.find((heading) => heading.id === id)
    if (target) scrollPreviewHeadingIntoView(target)
    else setPreviewHeadingRequest((previous) => ({ id, request: (previous?.request ?? 0) + 1 }))
    setActiveHeadingId(id)
  }, [mode])

  const setPreviewHeadings = useCallback((headings: HTMLElement[]) => {
    previewHeadingsRef.current = headings
  }, [])

  const canToggleMdTheme = useCallback(() => {
    const s = stateRef.current
    return s.hasDoc && (s.mode === 'view' || s.splitActive) && !s.exportDialogOpen && !s.settingsOpen && !s.aboutOpen
  }, [])

  const canAdjustFontSize = useCallback(() => {
    const s = stateRef.current
    return s.hasDoc && !s.exportDialogOpen && !s.settingsOpen && !s.aboutOpen
  }, [])

  const canToggleOutline = useCallback(() => {
    const s = stateRef.current
    return s.hasDoc && !s.exportDialogOpen && !s.settingsOpen && !s.aboutOpen
  }, [])

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

  const togglePreviewFluidWidth = useCallback(
    () => changeSettings({ previewFluidWidth: !settings.previewFluidWidth }),
    [changeSettings, settings.previewFluidWidth]
  )

  const toggleSplitView = useCallback(() => {
    const s = stateRef.current
    if (!s.canToggleSplit) return
    changeSettings({ splitView: !s.splitView })
  }, [changeSettings])

  const changeSplitRatio = useCallback(
    (ratio: number) => changeSettings({ splitRatio: ratio }),
    [changeSettings]
  )

  const setPreviewPane = useCallback((element: HTMLDivElement | null) => {
    previewPaneRef.current = element
    setPreviewPaneElement(element)
  }, [])

  /**
   * Sync runs one way at a time.
   *
   * Scrolling either pane scrolls the other, and that scroll is itself an event: without an
   * owner the two panes would keep correcting each other. The pane the user is scrolling holds
   * the sync until it goes quiet.
   */
  const claimScrollOwner = useCallback((pane: 'editor' | 'preview'): boolean => {
    const owner = scrollOwnerRef.current
    const now = performance.now()
    if (owner && owner.pane !== pane && now - owner.at < SCROLL_OWNER_HOLD_MS) return false
    scrollOwnerRef.current = { pane, at: now }
    return true
  }, [])

  const splitAnchorsFor = useCallback((pane: HTMLDivElement, headingLines: ReadonlyMap<string, number>) =>
    buildSplitAnchors(
      previewHeadingsRef.current.map((heading) => ({ id: heading.id, top: getHeadingTopInScroller(pane, heading) })),
      headingLines
    ), [])

  /**
   * Move the live preview to the part of the document the editor is showing.
   *
   * A virtualized preview only keeps the visible blocks in the DOM, so there are no heading
   * offsets to interpolate between; it falls back to jumping to the enclosing heading.
   */
  const syncPreviewToEditorLine = useCallback((line: number, realign = false) => {
    editorTopLineRef.current = line
    const { active, virtualized, headingLines, totalLines } = splitSyncRef.current
    if (!active) return
    // A realign follows a re-render, not a scroll, so it must not take the sync from the preview.
    if (!realign && !claimScrollOwner('editor')) return

    if (virtualized) {
      const id = headingIdForLine(line, headingLines)
      if (!id || id === syncedHeadingRef.current) return
      syncedHeadingRef.current = id
      setPreviewHeadingRequest((previous) => ({ id, request: (previous?.request ?? 0) + 1 }))
      return
    }

    const pane = previewPaneRef.current
    if (!pane) return
    const top = previewTopForEditorLine(line, splitAnchorsFor(pane, headingLines), {
      contentHeight: pane.scrollHeight,
      maxScrollTop: Math.max(0, pane.scrollHeight - pane.clientHeight),
      totalLines
    })
    if (Math.abs(pane.scrollTop - top) > 1) pane.scrollTo({ top, behavior: 'auto' })
  }, [claimScrollOwner, splitAnchorsFor])

  /** Move the editor to the part of the document the live preview is showing. */
  const syncEditorToPreviewScroll = useCallback(() => {
    const { active, headingLines, totalLines } = splitSyncRef.current
    const pane = previewPaneRef.current
    const editor = editorRef.current
    if (!active || !pane || !editor) return
    if (!claimScrollOwner('preview')) return

    const line = editorLineForPreviewTop(pane.scrollTop, splitAnchorsFor(pane, headingLines), {
      contentHeight: pane.scrollHeight,
      maxScrollTop: Math.max(0, pane.scrollHeight - pane.clientHeight),
      totalLines
    })
    editorTopLineRef.current = line
    editor.scrollToLine(line)
  }, [claimScrollOwner, splitAnchorsFor])

  // Follow the preview while it is the pane being scrolled.
  useEffect(() => {
    if (!splitActive || !previewPaneElement) return
    let frame = 0
    const onScroll = (): void => {
      // Scroll fires far more often than the editor can be laid out; one sync per frame is enough.
      if (frame !== 0) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        syncEditorToPreviewScroll()
      })
    }
    previewPaneElement.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame)
      previewPaneElement.removeEventListener('scroll', onScroll)
    }
  }, [previewPaneElement, splitActive, syncEditorToPreviewScroll])

  // Another tab starts from an unknown position in the preview.
  useEffect(() => {
    syncedHeadingRef.current = null
  }, [activeDocId])

  // Re-align after the preview re-renders: new content shifts every offset below the edit.
  useEffect(() => {
    if (!splitActive) return
    const frame = window.requestAnimationFrame(() => {
      syncPreviewToEditorLine(editorRef.current?.getTopVisibleLine() ?? editorTopLineRef.current, true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [html, settings.previewFluidWidth, settings.previewFontSize, settings.previewWidth, splitActive, syncPreviewToEditorLine])

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

  // Font size follows the visible pane: preview in view mode, source editor in edit mode, and
  // the pane last touched while the split view shows both.
  const changeFontSize = useCallback(
    (next: number) => {
      if (!canAdjustFontSize()) return
      if (stateRef.current.fontTarget === 'editor') {
        changeSettings({ editorFontSize: Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, next)) })
        return
      }
      changeSettings({ previewFontSize: Math.min(MAX_PREVIEW_FONT_SIZE, Math.max(MIN_PREVIEW_FONT_SIZE, next)) })
    },
    [canAdjustFontSize, changeSettings]
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
        void doOpen()
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
      if (key === '\\') {
        event.preventDefault()
        toggleSplitView()
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
        changeFontSize(activeFontSize + 1)
        return
      }
      if (key === '-') {
        event.preventDefault()
        changeFontSize(activeFontSize - 1)
        return
      }
      if (key === '0') {
        event.preventDefault()
        changeFontSize(defaultFontSize)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeFontSize,
    changeFontSize,
    closeActivePanel,
    closeDocument,
    dialogOpen,
    doFindNext,
    doFindPrevious,
    doNew,
    doOpen,
    flash,
    focusReplace,
    focusSearch,
    openExportDialog,
    openSettings,
    saveDocument,
    saveDocumentAs,
    defaultFontSize,
    selectAdjacentDocument,
    t,
    toggleFullscreen,
    toggleMode,
    toggleSplitView
  ])

  // --- Wire main-process requests + pushed documents --------------------
  useEffect(() => {
    const offClose = window.api.onCloseRequest(() => {
      void confirmAnyUnsaved().then((result) => window.api.confirmClose(result === 'proceed'))
    })
    // Main pushes only metadata; the content arrives through the same streamed read as every
    // other open, so document text is fetched in exactly one place.
    const offDoc = window.api.onOpenDocument((doc) => {
      void openPaths([doc.path])
    })
    const offProgress = window.api.onOpenManyProgress((progress) => {
      const session = openSessionRef.current
      if (!session || session.sessionId !== progress.sessionId) return
      if (progress.document) {
        addDocuments([{ path: progress.document.path, content: progress.document.content, sizeProfile: progress.document.sizeProfile }])
        session.paths.push(progress.document.path)
      }
      if (session.showProgress) {
        setOpenProgress((prev) => (prev ? { ...prev, completed: progress.completed, total: progress.total } : prev))
      }
    })
    const offExport = window.api.onExportProgress((progress) => {
      // Only decorate a run this window started; the export owns its own lifetime.
      setExportProgress((prev) => (prev ? { ...prev, progress } : prev))
    })
    const offDone = window.api.onOpenManyDone((done) => {
      const session = openSessionRef.current
      if (!session || session.sessionId !== done.sessionId) return
      openSessionRef.current = null
      setOpenProgress(null)
      if (session.paths.length > 0) rememberRecent(session.paths)
      if (done.errors.length > 0) flash(t('notice.openFailed', { error: done.errors[0] }), true)
    })
    return () => {
      offExport()
      offClose()
      offDoc()
      offProgress()
      offDone()
    }
  }, [confirmAnyUnsaved, addDocuments, openPaths, rememberRecent, flash, t])

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

  const previewPane = activeDoc ? (
    <Preview
      html={html}
      blocks={preview.blocks}
      virtualized={virtualizedPreview}
      headingRequest={previewHeadingRequest}
      documentName={documentName(activeDoc, t('app.untitled'))}
      mdTheme={mdTheme}
      searchTerm={debouncedSearchTerm}
      activeSearchIndex={activeSearchIndex}
      onSearchMatchCountChange={setPreviewSearchMatchCount}
      onActiveHeadingChange={setActiveHeadingId}
      settings={settings}
      onOpenLocalPath={(fileUrl) => void openLocalPath(fileUrl)}
      onPreviewHeadingsChange={setPreviewHeadings}
      onPaneElement={setPreviewPane}
    />
  ) : null

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
        onNew={doNew}
        onSave={doSave}
        onSearch={doSearch}
        onFindNext={doFindNext}
        onFindPrevious={doFindPrevious}
        onReplace={doReplace}
        searchMatchCount={searchMatchCount}
        activeSearchIndex={activeSearchIndex}
        canToggleTheme={canToggleMdTheme()}
        fontSize={activeFontSize}
        minFontSize={mode === 'edit' ? MIN_EDITOR_FONT_SIZE : MIN_PREVIEW_FONT_SIZE}
        maxFontSize={mode === 'edit' ? MAX_EDITOR_FONT_SIZE : MAX_PREVIEW_FONT_SIZE}
        defaultFontSize={defaultFontSize}
        canAdjustFontSize={canAdjustFontSize()}
        onFontSizeChange={changeFontSize}
        previewFluidWidth={settings.previewFluidWidth}
        canTogglePreviewWidth={canToggleMdTheme()}
        onTogglePreviewWidth={togglePreviewFluidWidth}
        outlineVisible={outlineVisible}
        canToggleOutline={canToggleOutline()}
        onToggleOutline={toggleOutline}
        splitView={settings.splitView}
        canToggleSplit={canToggleSplit}
        splitFits={splitFits}
        onToggleSplit={toggleSplitView}
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
          onClose={closeDocumentFromTab}
          onCloseOthers={closeOtherDocuments}
          onCloseToRight={closeDocumentsToRight}
          onCloseSaved={closeSavedDocuments}
          onCloseAll={closeAllDocuments}
        />
      )}

      <div className="body">
        {hasDoc && !exportDialogFormat && !settingsOpen && !aboutOpen && outlineVisible && (
          <Sidebar
            hasDoc={hasDoc}
            outline={outline}
            activeId={activeHeadingId}
            showOutline={!exportDialogFormat}
            onSelectHeading={scrollToHeading}
          />
        )}

        <main className="main" ref={mainRef}>
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
                onNew={doNew}
                recentFiles={settings.recentFiles}
                onOpenRecent={openRecent}
                onForgetRecent={(path) => forgetRecent([path])}
              />
            ) : exportDialogFormat ? (
              <div className="export-workspace">
                <Suspense fallback={null}>
                  <ExportDialog
                    initialFormat={exportDialogFormat}
                    onCancel={() => setExportDialogFormat(null)}
                    onExport={confirmExport}
                  />
                </Suspense>
              </div>
            ) : mode === 'edit' ? (
              <SplitView
                split={splitActive}
                ratio={settings.splitRatio}
                onRatioChange={changeSplitRatio}
                onFocusPane={setSplitFocus}
                editor={
                  <Suspense fallback={null}>
                    <Editor
                      ref={editorRef}
                      documentId={activeDoc.id}
                      value={content}
                      theme={'dark'}
                      fontSize={settings.editorFontSize}
                      searchTerm={debouncedSearchTerm}
                      activeSearchIndex={activeSearchIndex}
                      highlightActive={activeSearchIndex !== null}
                      headingToReveal={editorHeadingRequest}
                      outlineVisible={outlineVisible}
                      onSearchMatchCountChange={setEditorSearchMatchCount}
                      onChange={updateActiveRevision}
                      onEdits={recordEditorEdits}
                      onIdleStatsChange={updateIdleStats}
                      onOutlineChange={updateEditorOutline}
                      onBlur={() => void persistDraftDocument(activeDoc.id)}
                      onVisibleLineChange={syncPreviewToEditorLine}
                    />
                  </Suspense>
                }
                preview={splitActive ? previewPane : null}
              />
            ) : (
              previewPane
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
          onRetry={checkForUpdate}
        />
      )}
      {exportProgress && (
        <ExportProgress
          progress={exportProgress.progress}
          canceling={exportProgress.canceling}
          onCancel={cancelExport}
        />
      )}
      {openProgress && (
        <OpenProgress
          completed={openProgress.completed}
          total={openProgress.total}
          canceling={openProgress.canceling}
          onCancel={cancelOpenMany}
        />
      )}
      {notice && <div className={`notice ${notice.error ? 'notice--error' : ''}`}>{notice.text}</div>}
      {dialogOpen && <ConfirmDialog onChoice={onDialogChoice} />}
    </div>
  )
}
