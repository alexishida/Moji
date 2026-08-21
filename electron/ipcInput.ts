import { extname } from 'node:path'
import { isDraft } from './draftStore'
import {
  MARKDOWN_EXTENSIONS,
  SUPPORTED_LANGUAGES,
  type AutoSaveDraft,
  type Language,
  type Settings,
  type WindowBounds
} from './shared'

/**
 * Normalization of values that arrive from the renderer over IPC.
 *
 * Everything here treats its argument as `unknown` on purpose: a compromised or simply buggy
 * renderer can send any shape, so each value is narrowed to the fields the main process actually
 * persists instead of being forwarded as-is.
 */

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

export function isWindowBounds(value: unknown): value is WindowBounds {
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  return typeof raw['width'] === 'number' && typeof raw['height'] === 'number'
}

export function isMarkdown(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string') return false
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extname(filePath).toLowerCase())
}

/** Keeps only the known settings fields; range limits are applied later by `settings.ts`. */
export function sanitizeSettingsPatch(value: unknown): Partial<Settings> {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const patch: Partial<Settings> = {}

  if (isLanguage(raw['language'])) patch.language = raw['language']
  if (raw['previewTheme'] === 'light' || raw['previewTheme'] === 'dark') patch.previewTheme = raw['previewTheme']
  if (typeof raw['previewFontFamily'] === 'string') patch.previewFontFamily = raw['previewFontFamily']
  if (typeof raw['previewFontSize'] === 'number') patch.previewFontSize = raw['previewFontSize']
  if (typeof raw['editorFontSize'] === 'number') patch.editorFontSize = raw['editorFontSize']
  if (typeof raw['previewLineHeight'] === 'number') patch.previewLineHeight = raw['previewLineHeight']
  if (typeof raw['previewFluidWidth'] === 'boolean') patch.previewFluidWidth = raw['previewFluidWidth']
  if (typeof raw['splitView'] === 'boolean') patch.splitView = raw['splitView']
  if (typeof raw['splitRatio'] === 'number') patch.splitRatio = raw['splitRatio']
  if (typeof raw['previewWidth'] === 'number') patch.previewWidth = raw['previewWidth']
  if (typeof raw['autoSave'] === 'boolean') patch.autoSave = raw['autoSave']
  if (Array.isArray(raw['recentFiles'])) patch.recentFiles = raw['recentFiles'].filter((p): p is string => typeof p === 'string')
  if (isWindowBounds(raw['windowBounds'])) patch.windowBounds = raw['windowBounds']

  return patch
}

/** Validated by the same rules the store enforces, then narrowed to exactly the persisted fields. */
export function sanitizeDraft(value: unknown): AutoSaveDraft | null {
  if (!isDraft(value)) return null
  return { id: value.id, title: value.title, content: value.content }
}

/** Characters Windows refuses in a file name, plus C0 control characters. `\` and `/` are
 *  included so a title can only ever name a file inside the directory the user picked, never
 *  escape it. */
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g

/** Windows reserves these for device files, with or without an extension: `CON.md` is exactly
 *  as unwritable as `CON`. Case-insensitive, and only `COM0`/`LPT0` through `COM9`/`LPT9`. */
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

/**
 * Makes `name` safe to use as a file name on Windows, macOS and Linux.
 *
 * Windows also rejects a name ending in a dot or space; `.trim()` only covers the space, so a
 * trailing run of dots is stripped separately.
 */
export function sanitizeFileNameComponent(name: string): string {
  const cleaned = name.replace(INVALID_FILENAME_CHARS, '').trim().replace(/\.+$/, '')
  if (!cleaned) return cleaned
  const dot = cleaned.indexOf('.')
  const base = dot < 0 ? cleaned : cleaned.slice(0, dot)
  return RESERVED_WINDOWS_NAME.test(base) ? `_${cleaned}` : cleaned
}

/** Turns a renderer-supplied document title into a file name for the native save dialog. */
export function suggestedMarkdownName(value: unknown): string {
  if (typeof value !== 'string') return 'untitled.md'
  const name = sanitizeFileNameComponent(value)
  if (!name) return 'untitled.md'
  return isMarkdown(name) ? name : `${name}.md`
}
