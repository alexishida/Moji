// Types and constants shared between the main process, preload, and renderer.

export type Theme = 'light' | 'dark'

export const SUPPORTED_LANGUAGES = ['en', 'pt-BR', 'es', 'ja', 'zh', 'ru'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'en'

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const

/** Max entries kept in the recent-files list shown on the Welcome screen. */
export const MAX_RECENT_FILES = 3

export const PREVIEW_WIDTH_MIN = 20
export const PREVIEW_WIDTH_MAX = 100
export const PREVIEW_WIDTH_STEP = 5
export const PREVIEW_WIDTH_DEFAULT = 60

/** Delay after the latest edit before an untitled draft is persisted. */
export const AUTO_SAVE_DELAY_MS = 750

export function normalizePreviewWidth(value: unknown, fallback = PREVIEW_WIDTH_DEFAULT): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const bounded = Math.min(PREVIEW_WIDTH_MAX, Math.max(PREVIEW_WIDTH_MIN, value))
  return Math.round(bounded / PREVIEW_WIDTH_STEP) * PREVIEW_WIDTH_STEP
}

export interface Settings {
  theme: Theme
  previewTheme: Theme
  language: Language
  previewFontFamily: string
  previewFontSize: number
  previewLineHeight: number
  previewFluidWidth: boolean
  /** Reading column width as a percentage (20-100, in steps of 5) of the available preview area. */
  previewWidth: number
  /** Persist and restore untitled documents between app sessions. */
  autoSave: boolean
  /** Absolute paths of recently opened documents, most-recent first. */
  recentFiles: string[]
  lastDialogDirectory?: string
  windowBounds?: WindowBounds
}

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

/** Everything known about a document before its bytes are read. */
export interface DocumentMetadata {
  path: string
  /** File size observed immediately before content is read. */
  sizeBytes: number
  sizeProfile: DocumentSizeProfile
}

export interface DocumentPayload extends DocumentMetadata {
  content: string
}

/**
 * Chunked document delivery over a `MessagePort`. Content crosses the process boundary as UTF-8
 * bytes, so main never materializes the UTF-16 string that `invoke` would have to clone, and its
 * peak memory stays at one chunk instead of the whole file.
 */
export type DocumentStreamMessage =
  | ({ type: 'meta' } & DocumentMetadata)
  | { type: 'chunk'; buffer: ArrayBuffer; byteLength: number }
  | { type: 'end' }
  | { type: 'error'; error: string }

export type DocumentSizeProfile = 'normal' | 'large' | 'very-large'

/** App-managed recovery copy for a document that has no filesystem path yet. */
export interface AutoSaveDraft {
  id: string
  title: string
  content: string
}

/**
 * Why a draft could not be written. Drafts have no size limit of their own: a save is refused only
 * when the machine cannot hold the result, and the refusal always carries the numbers behind it so
 * the renderer can say what is missing instead of showing a raw errno.
 */
export type DraftPersistReason = 'memory-budget' | 'disk-space'

export interface DraftPersistProblem {
  reason: DraftPersistReason
  /** Bytes the write needs, including the headroom kept free. */
  requiredBytes: number
  /** Bytes actually available under that limit. */
  availableBytes: number
}

export type DraftResult =
  | { ok: true }
  | { ok: false; error?: string; problem?: DraftPersistProblem }

/** One splice recorded by the editor, in the coordinates of the text it was produced against. */
export interface DraftEditPayload {
  from: number
  to: number
  insert: string
}

/**
 * Result of journaling edits. `out-of-sync` and `unknown-draft` are not failures: they mean the
 * renderer must fall back to persisting the whole draft.
 */
export type DraftAppendResult =
  | { ok: true }
  | { ok: false; reason: 'out-of-sync' | 'unknown-draft' | 'error'; error?: string; problem?: DraftPersistProblem }

/** Result of an operation that reads/opens a file. */
export type OpenResult =
  | { ok: true; path: string; content: string; sizeBytes: number; sizeProfile: DocumentSizeProfile }
  | { ok: false; canceled?: boolean; error?: string }

/** Result of starting a multi-file open session from the OS dialog. Documents stream in afterward via `openManyProgress`. */
export type OpenDialogResult =
  | { ok: true; sessionId: string; total: number }
  | { ok: false; canceled?: boolean; error?: string }

/** One file finishing (successfully or not) within an open-many session. */
export interface OpenManyProgress {
  sessionId: string
  completed: number
  total: number
  document?: DocumentPayload
  error?: string
}

/** Final summary of an open-many session: natural completion or user cancellation. */
export interface OpenManyDone {
  sessionId: string
  canceled: boolean
  errors: string[]
}

/** Result of a write-style operation (save / export). */
export type WriteResult =
  | { ok: true; path: string }
  | { ok: false; canceled?: boolean; error?: string }

export type UpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'error'

/** Serializable updater state sent from main to renderer. */
export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  version?: string
  error?: string
}

export type ExportFormat = 'pdf' | 'html' | 'png'

export type ExportPageSize = 'A4' | 'Letter' | 'Legal'

export type ExportPageOrientation = 'portrait' | 'landscape'

/** Numeric local performance sample. Never carries document content, paths, or user data. */
export interface PerformanceMetric {
  name: string
  durationMs: number
  timestamp: number
  details: Record<string, number>
}

export interface PerformanceReport {
  metrics: PerformanceMetric[]
}

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
  cancelOpenMany: 'file:open-many-cancel',
  readPathStream: 'file:read-path-stream',
  openLocalPath: 'file:open-local-path',
  readSample: 'file:read-sample',
  save: 'file:save',
  saveAs: 'file:save-as',
  export: 'doc:export',
  exportDiagramPng: 'diagram:export-png',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  getDrafts: 'drafts:get',
  saveDraft: 'drafts:save',
  appendDraftEdits: 'drafts:append-edits',
  removeDraft: 'drafts:remove',
  confirmClose: 'app:confirm-close',
  getUpdateState: 'update:get-state',
  checkForUpdate: 'update:check',
  getPerformanceReport: 'performance:get-report',
  // main -> renderer push channels
  requestClose: 'app:request-close',
  openDocument: 'doc:open',
  openManyProgress: 'file:open-many-progress',
  openManyDone: 'file:open-many-done',
  updateState: 'update:state'
} as const
