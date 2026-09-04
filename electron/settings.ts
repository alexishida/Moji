import { app, screen } from 'electron'
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_LANGUAGE,
  MAX_RECENT_FILES,
  PREVIEW_WIDTH_DEFAULT,
  SPLIT_RATIO_DEFAULT,
  SUPPORTED_LANGUAGES,
  normalizePreviewWidth,
  normalizeSplitRatio,
  type Language,
  type Settings,
  type WindowBounds
} from './shared'

let cache: Settings | null = null

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/**
 * Write to a sibling temporary file, then rename over the destination.
 *
 * `writeFileSync` straight to `settings.json` leaves a truncated file if the process dies mid
 * write — a real risk here, since a resize or move schedules a write on every settle — and the
 * next launch would fall back to defaults, losing language, recent files and window bounds. The
 * rename is what makes the swap atomic: the file on disk is always either the old settings or
 * the new ones, never a partial write of either.
 */
function writeFileAtomicSync(file: string, data: string): void {
  const temporary = `${file}.tmp`
  let wrote = false
  try {
    writeFileSync(temporary, data, 'utf-8')
    wrote = true
    renameSync(temporary, file)
  } catch (err) {
    // A failed write (disk full) or a failed rename over a locked destination must not leave
    // a sibling `.tmp` behind in the user-data directory; the next write would overwrite it,
    // but that is cleanup-by-accident, not by design.
    if (wrote) {
      try {
        unlinkSync(temporary)
      } catch {
        // Already gone.
      }
    }
    throw err
  }
}

/** Pick the closest shipped language for an OS locale like "pt-BR" or "es-419". */
export function resolveLanguage(locale: string): Language {
  if (!locale) return DEFAULT_LANGUAGE
  const exact = SUPPORTED_LANGUAGES.find((l) => l.toLowerCase() === locale.toLowerCase())
  if (exact) return exact
  const base = locale.split('-')[0].toLowerCase()
  const byBase = SUPPORTED_LANGUAGES.find((l) => l.split('-')[0].toLowerCase() === base)
  return byBase ?? DEFAULT_LANGUAGE
}

function defaults(): Settings {
  return {
    theme: 'dark' as const,
    previewTheme: 'dark' as const,
    language: resolveLanguage(app.getLocale()),
    previewFontFamily: 'Inter',
    previewFontSize: 16,
    editorFontSize: 14,
    previewLineHeight: 1.7,
    previewFluidWidth: false,
    splitView: false,
    splitRatio: SPLIT_RATIO_DEFAULT,
    previewWidth: PREVIEW_WIDTH_DEFAULT,
    autoSave: true,
    recentFiles: []
  }
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function optionalBoundedNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined
}

function sanitizeWindowBounds(value: unknown): WindowBounds | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const width = boundedNumber(raw['width'], 1000, 640, 8192)
  const height = boundedNumber(raw['height'], 760, 480, 8192)

  const bounds: WindowBounds = {
    x: optionalBoundedNumber(raw['x'], -8192, 8192),
    y: optionalBoundedNumber(raw['y'], -8192, 8192),
    width,
    height
  }

  if (bounds.x === undefined || bounds.y === undefined) return bounds
  const visible = screen.getAllDisplays().some(({ workArea }) => (
    bounds.x! < workArea.x + workArea.width &&
    bounds.x! + bounds.width > workArea.x &&
    bounds.y! < workArea.y + workArea.height &&
    bounds.y! + bounds.height > workArea.y
  ))
  return visible ? bounds : { width, height }
}

/** Keep only string paths, drop duplicates, and cap the list length. */
function sanitizeRecentFiles(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const list: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || seen.has(entry)) continue
    seen.add(entry)
    list.push(entry)
    if (list.length >= MAX_RECENT_FILES) break
  }
  return list
}

export function getSettings(): Settings {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), 'utf-8')) as Partial<Settings>
    const base = defaults()
    cache = {
      theme: 'dark' as const,
      previewTheme: raw.previewTheme === 'light' || raw.previewTheme === 'dark' ? raw.previewTheme : base.previewTheme,
      language: raw.language && SUPPORTED_LANGUAGES.includes(raw.language) ? raw.language : base.language,
      previewFontFamily: typeof raw.previewFontFamily === 'string' ? raw.previewFontFamily : base.previewFontFamily,
      previewFontSize: boundedNumber(raw.previewFontSize, base.previewFontSize, 12, 24),
      editorFontSize: boundedNumber(raw.editorFontSize, base.editorFontSize, 12, 24),
      previewLineHeight: boundedNumber(raw.previewLineHeight, base.previewLineHeight, 1.2, 2.4),
      previewFluidWidth: base.previewFluidWidth,
      splitView: typeof raw.splitView === 'boolean' ? raw.splitView : base.splitView,
      splitRatio: normalizeSplitRatio(raw.splitRatio, base.splitRatio),
      previewWidth: normalizePreviewWidth(raw.previewWidth, base.previewWidth),
      autoSave: typeof raw.autoSave === 'boolean' ? raw.autoSave : base.autoSave,
      recentFiles: sanitizeRecentFiles(raw.recentFiles),
      lastDialogDirectory: typeof raw.lastDialogDirectory === 'string' ? raw.lastDialogDirectory : undefined,
      windowBounds: sanitizeWindowBounds(raw.windowBounds)
    }
  } catch {
    cache = defaults()
  }
  return cache
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const merged = { ...getSettings(), ...patch, theme: 'dark' as const }
  const next: Settings = {
    ...merged,
    language: SUPPORTED_LANGUAGES.includes(merged.language) ? merged.language : getSettings().language,
    previewTheme: merged.previewTheme === 'light' || merged.previewTheme === 'dark' ? merged.previewTheme : 'dark',
    previewFontFamily: typeof merged.previewFontFamily === 'string' ? merged.previewFontFamily : 'Inter',
    previewFontSize: boundedNumber(merged.previewFontSize, 16, 12, 24),
    editorFontSize: boundedNumber(merged.editorFontSize, 14, 12, 24),
    previewLineHeight: boundedNumber(merged.previewLineHeight, 1.7, 1.2, 2.4),
    previewFluidWidth: typeof merged.previewFluidWidth === 'boolean' ? merged.previewFluidWidth : false,
    splitView: typeof merged.splitView === 'boolean' ? merged.splitView : false,
    splitRatio: normalizeSplitRatio(merged.splitRatio),
    previewWidth: normalizePreviewWidth(merged.previewWidth),
    autoSave: typeof merged.autoSave === 'boolean' ? merged.autoSave : true,
    recentFiles: sanitizeRecentFiles(merged.recentFiles),
    lastDialogDirectory: typeof merged.lastDialogDirectory === 'string' ? merged.lastDialogDirectory : undefined,
    windowBounds: sanitizeWindowBounds(merged.windowBounds)
  }
  cache = next
  try {
    const persisted: Partial<Settings> = { ...next }
    // Full-width stays a per-session toggle; font sizes are configured in Settings and persist.
    delete persisted.previewFluidWidth
    writeFileAtomicSync(settingsFile(), JSON.stringify(persisted, null, 2))
  } catch {
    // Non-fatal: preference simply won't persist this session. Any temporary file this attempt
    // left behind is swept up (or simply overwritten) the next time a write succeeds.
  }
  return next
}
