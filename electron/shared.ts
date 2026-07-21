// Types and constants shared between the main process, preload, and renderer.

export type Theme = 'light' | 'dark'

export const SUPPORTED_LANGUAGES = ['en', 'pt-BR', 'es', 'ja', 'zh', 'ru'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'en'

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const

/** Max entries kept in the recent-files list shown on the Welcome screen. */
export const MAX_RECENT_FILES = 3
export const MAX_RECENT_FOLDERS = 5
export const MAX_WORKSPACE_SEARCH_RESULTS = 200

export interface Settings {
  theme: Theme
  previewTheme: Theme
  language: Language
  previewFontFamily: string
  previewFontSize: number
  previewLineHeight: number
  previewFluidWidth: boolean
  /** Absolute paths of recently opened documents, most-recent first. */
  recentFiles: string[]
  /** Absolute paths of recently opened folders, most-recent first. */
  recentFolders: string[]
  lastDialogDirectory?: string
  windowBounds?: WindowBounds
}

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

export interface DocumentPayload {
  path: string
  content: string
}

export interface WorkspaceFileEntry {
  path: string
  relativePath: string
  name: string
}

export interface WorkspaceFolder {
  path: string
  name: string
  files: WorkspaceFileEntry[]
}

export interface WorkspaceSearchRequest {
  rootPath: string
  term: string
  maxResults?: number
}

export interface WorkspaceSearchMatch {
  path: string
  relativePath: string
  line: number
  column: number
  excerpt: string
}

/** Result of an operation that reads/opens a file. */
export type OpenResult =
  | { ok: true; path: string; content: string }
  | { ok: false; canceled?: boolean; error?: string }

/** Result of an operation that opens one or more files. */
export type OpenManyResult =
  | { ok: true; documents: DocumentPayload[] }
  | { ok: false; canceled?: boolean; error?: string }

export type OpenFolderResult =
  | { ok: true; folder: WorkspaceFolder }
  | { ok: false; canceled?: boolean; error?: string }

export type OpenPathResult =
  | { ok: true; type: 'file'; document: DocumentPayload }
  | { ok: true; type: 'folder'; folder: WorkspaceFolder }
  | { ok: false; canceled?: boolean; error?: string }

export type OpenLocalPathResult =
  | { ok: true; type: 'file'; document: DocumentPayload }
  | { ok: true; type: 'folder'; folder: WorkspaceFolder }
  | { ok: true; type: 'external'; path: string }
  | { ok: false; canceled?: boolean; error?: string }

export type WorkspaceSearchResult =
  | { ok: true; matches: WorkspaceSearchMatch[] }
  | { ok: false; error?: string }

/** Result of a write-style operation (save / export). */
export type WriteResult =
  | { ok: true; path: string }
  | { ok: false; canceled?: boolean; error?: string }

export type ImageDataResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error?: string }

export type UpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

/** Serializable updater state sent from main to renderer. */
export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  version?: string
  percent?: number
  error?: string
}

export type ExportFormat = 'pdf' | 'html' | 'png'

export type ExportPageSize = 'A4' | 'Letter' | 'Legal'

export type ExportPageOrientation = 'portrait' | 'landscape'

export const EXPORT_PAGE_SIZES: Array<{ value: ExportPageSize; label: string; width: number; height: number }> = [
  { value: 'A4', label: 'A4 (210 x 297 mm)', width: 794, height: 1123 },
  { value: 'Letter', label: 'Letter (8.5 x 11 in)', width: 816, height: 1056 },
  { value: 'Legal', label: 'Legal (8.5 x 14 in)', width: 816, height: 1344 }
]

export interface ExportRequest {
  format: ExportFormat
  pageSize: ExportPageSize
  pageOrientation: ExportPageOrientation
  /** Fully-rendered, standalone HTML document (with inlined CSS). */
  html: string
  /** Base URL for resolving local assets while rendering HTML exports. */
  assetBaseUrl?: string
  /** Suggested base name (without extension) for the save dialog. */
  baseName: string
}

/** PNG generated from one rendered Mermaid diagram in the renderer. */
export interface DiagramPngRequest {
  dataUrl: string
  /** Suggested base name (without extension) for the save dialog. */
  baseName: string
}

/** IPC channel names. */
export const IPC = {
  openDialog: 'file:open-dialog',
  openFolderDialog: 'folder:open-dialog',
  openPath: 'path:open',
  openLocalPath: 'path:open-local',
  readPath: 'file:read-path',
  readWorkspaceFile: 'folder:read-file',
  searchWorkspace: 'folder:search',
  readImage: 'file:read-image',
  readSample: 'file:read-sample',
  save: 'file:save',
  saveAs: 'file:save-as',
  export: 'doc:export',
  exportDiagramPng: 'diagram:export-png',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  confirmClose: 'app:confirm-close',
  getUpdateState: 'update:get-state',
  checkForUpdate: 'update:check',
  downloadUpdate: 'update:download',
  installUpdate: 'update:install',
  // main -> renderer push channels
  requestClose: 'app:request-close',
  openDocument: 'doc:open',
  openWorkspace: 'workspace:open',
  updateState: 'update:state'
} as const
