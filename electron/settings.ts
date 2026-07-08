import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type Language, type Settings } from './shared'

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
    language: resolveLanguage(app.getLocale()),
    previewFontFamily: 'Inter',
    previewFontSize: 16,
    previewLineHeight: 1.7
  }
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export function getSettings(): Settings {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), 'utf-8')) as Partial<Settings>
    const base = defaults()
    cache = {
      theme: 'dark' as const,
      language: raw.language && SUPPORTED_LANGUAGES.includes(raw.language) ? raw.language : base.language,
      previewFontFamily: typeof raw.previewFontFamily === 'string' ? raw.previewFontFamily : base.previewFontFamily,
      previewFontSize: boundedNumber(raw.previewFontSize, base.previewFontSize, 12, 24),
      previewLineHeight: boundedNumber(raw.previewLineHeight, base.previewLineHeight, 1.2, 2.4)
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
    previewFontFamily: typeof merged.previewFontFamily === 'string' ? merged.previewFontFamily : 'Inter',
    previewFontSize: boundedNumber(merged.previewFontSize, 16, 12, 24),
    previewLineHeight: boundedNumber(merged.previewLineHeight, 1.7, 1.2, 2.4)
  }
  cache = next
  try {
    writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf-8')
  } catch {
    // Non-fatal: preference simply won't persist this session.
  }
  return next
}
