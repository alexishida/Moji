// Types and constants shared between the main process, preload, and renderer.

export type Theme = 'light' | 'dark'

export const SUPPORTED_LANGUAGES = ['en', 'pt-BR', 'es', 'ja', 'zh', 'ru'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'en'

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const

export interface Settings {
  theme: Theme
  language: Language
  previewFontFamily: string
  previewFontSize: number
  previewLineHeight: number
}

export interface DocumentPayload {
  path: string
  content: string
}

/** Result of an operation that reads/opens a file. */
export type OpenResult =
  | { ok: true; path: string; content: string }
  | { ok: false; canceled?: boolean; error?: string }

/** Result of an operation that opens one or more files. */
export type OpenManyResult =
  | { ok: true; documents: DocumentPayload[] }
  | { ok: false; canceled?: boolean; error?: string }

/** Result of a write-style operation (save / export). */
export type WriteResult =
  | { ok: true; path: string }
  | { ok: false; canceled?: boolean; error?: string }

export type ImageDataResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error?: string }

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

/** IPC channel names. */
export const IPC = {
  openDialog: 'file:open-dialog',
  readPath: 'file:read-path',
  readImage: 'file:read-image',
  readSample: 'file:read-sample',
  save: 'file:save',
  saveAs: 'file:save-as',
  export: 'doc:export',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  confirmClose: 'app:confirm-close',
  // main -> renderer push channels
  requestClose: 'app:request-close',
  openDocument: 'doc:open'
} as const
