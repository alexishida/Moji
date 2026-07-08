// Types and constants shared between the main process, preload, and renderer.

export type Theme = 'light' | 'dark'

export const SUPPORTED_LANGUAGES = ['en', 'pt-BR', 'es'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'en'

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const

export interface Settings {
  theme: Theme
  language: Language
}

export interface DocumentPayload {
  path: string
  content: string
}

/** Result of an operation that reads/opens a file. */
export type OpenResult =
  | { ok: true; path: string; content: string }
  | { ok: false; canceled?: boolean; error?: string }

/** Result of a write-style operation (save / export). */
export type WriteResult =
  | { ok: true; path: string }
  | { ok: false; canceled?: boolean; error?: string }

export type ExportFormat = 'html' | 'pdf'

export interface ExportRequest {
  format: ExportFormat
  /** Fully-rendered, standalone HTML document (with inlined CSS). */
  html: string
  /** Suggested base name (without extension) for the save dialog. */
  baseName: string
}

/** Menu actions the main process forwards to the focused renderer. */
export const MENU_ACTIONS = [
  'open',
  'save',
  'save-as',
  'export:html',
  'export:pdf',
  'toggle-edit',
  'toggle-theme',
  'request-close'
] as const
export type MenuAction = (typeof MENU_ACTIONS)[number]

/** IPC channel names. */
export const IPC = {
  openDialog: 'file:open-dialog',
  readPath: 'file:read-path',
  save: 'file:save',
  saveAs: 'file:save-as',
  export: 'doc:export',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  setLanguage: 'settings:set-language',
  confirmClose: 'app:confirm-close',
  // main -> renderer push channels
  openDocument: 'doc:open',
  menuAction: 'menu:action'
} as const
