import { useEffect, useMemo, useState } from 'react'
import { PREVIEW_WIDTH_DEFAULT, type DocumentSizeProfile, type ExportFormat, type Settings, type Theme, type UpdateState } from '../../electron/shared'
import packageJson from '../../package.json'

export interface WorkspaceDocument {
  id: string
  path: string | null
  title: string | null
  content: string
  stats: { length: number; lines: number; tokens: number; words: number }
  revision: number
  savedRevision: number
  draftId: string | null
  draftSavedRevision: number | null
  readOnly: boolean
  sizeProfile?: DocumentSizeProfile
}

export function useSettingsState() {
  const [settings, setSettings] = useState<Settings>({
    theme: 'dark', previewTheme: 'dark', language: 'en', previewFontFamily: 'Inter', previewFontSize: 16, editorFontSize: 14,
    previewLineHeight: 1.7, previewFluidWidth: false, previewWidth: PREVIEW_WIDTH_DEFAULT, autoSave: true, recentFiles: []
  })
  const [mdTheme, setMdTheme] = useState<Theme>('dark')
  return { settings, setSettings, mdTheme, setMdTheme }
}

export function useDocumentState() {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([])
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const activeDoc = useMemo(() => documents.find((doc) => doc.id === activeDocId) ?? null, [documents, activeDocId])
  return { documents, setDocuments, activeDocId, setActiveDocId, mode, setMode, activeDoc }
}

export function useSearchState() {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null)
  const [editorSearchMatchCount, setEditorSearchMatchCount] = useState(0)
  const [previewSearchMatchCount, setPreviewSearchMatchCount] = useState(0)
  return { searchTerm, setSearchTerm, activeSearchIndex, setActiveSearchIndex, editorSearchMatchCount, setEditorSearchMatchCount, previewSearchMatchCount, setPreviewSearchMatchCount }
}

export function usePanelState() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [exportDialogFormat, setExportDialogFormat] = useState<ExportFormat | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [outlineVisible, setOutlineVisible] = useState(true)
  const [searchFocusRequest, setSearchFocusRequest] = useState(0)
  const [replaceFocusRequest, setReplaceFocusRequest] = useState(0)
  const [topBarDismissRequest, setTopBarDismissRequest] = useState(0)
  return { dialogOpen, setDialogOpen, exportDialogFormat, setExportDialogFormat, settingsOpen, setSettingsOpen, aboutOpen, setAboutOpen, outlineVisible, setOutlineVisible, searchFocusRequest, setSearchFocusRequest, replaceFocusRequest, setReplaceFocusRequest, topBarDismissRequest, setTopBarDismissRequest }
}

export function useUpdateState() {
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle', currentVersion: packageJson.version })
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null)
  useEffect(() => {
    const offUpdate = window.api.onUpdateState(setUpdateState)
    void window.api.getUpdateState().then(setUpdateState)
    return offUpdate
  }, [])
  return { updateState, setUpdateState, dismissedUpdate, setDismissedUpdate }
}
