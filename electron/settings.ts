import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_LANGUAGE,
  MAX_RECENT_FILES,
  MAX_RECENT_FOLDERS,
  SUPPORTED_LANGUAGES,
  type Language,
  type Settings,
  type WindowBounds
} from './shared'

let cache: Settings | null = null

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
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
    previewLineHeight: 1.7,
    previewFluidWidth: false,
    recentFiles: [],
    recentFolders: []
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

  return {
    x: optionalBoundedNumber(raw['x'], -8192, 8192),
    y: optionalBoundedNumber(raw['y'], -8192, 8192),
    width,
    height
  }
}

/** Keep only string paths, drop duplicates, and cap the list length. */
function sanitizeRecentList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const list: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || seen.has(entry)) continue
    seen.add(entry)
    list.push(entry)
    if (list.length >= limit) break
  }
  return list
}

function sanitizeRecentFiles(value: unknown): string[] {
  return sanitizeRecentList(value, MAX_RECENT_FILES)
}

function sanitizeRecentFolders(value: unknown): string[] {
  return sanitizeRecentList(value, MAX_RECENT_FOLDERS)
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
      previewFontSize: base.previewFontSize,
      previewLineHeight: boundedNumber(raw.previewLineHeight, base.previewLineHeight, 1.2, 2.4),
      previewFluidWidth: base.previewFluidWidth,
      recentFiles: sanitizeRecentFiles(raw.recentFiles),
      recentFolders: sanitizeRecentFolders(raw.recentFolders),
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
    previewLineHeight: boundedNumber(merged.previewLineHeight, 1.7, 1.2, 2.4),
    previewFluidWidth: typeof merged.previewFluidWidth === 'boolean' ? merged.previewFluidWidth : false,
    recentFiles: sanitizeRecentFiles(merged.recentFiles),
    recentFolders: sanitizeRecentFolders(merged.recentFolders),
    lastDialogDirectory: typeof merged.lastDialogDirectory === 'string' ? merged.lastDialogDirectory : undefined,
    windowBounds: sanitizeWindowBounds(merged.windowBounds)
  }
  cache = next
  try {
    const persisted: Partial<Settings> = { ...next }
    delete persisted.previewFontSize
    delete persisted.previewFluidWidth
    writeFileSync(settingsFile(), JSON.stringify(persisted, null, 2), 'utf-8')
  } catch {
    // Non-fatal: preference simply won't persist this session.
  }
  return next
}
