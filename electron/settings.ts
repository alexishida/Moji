import { app, nativeTheme } from 'electron'
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
    theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    language: resolveLanguage(app.getLocale())
  }
}

export function getSettings(): Settings {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), 'utf-8')) as Partial<Settings>
    const base = defaults()
    cache = {
      theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : base.theme,
      language: raw.language && SUPPORTED_LANGUAGES.includes(raw.language) ? raw.language : base.language
    }
  } catch {
    cache = defaults()
  }
  return cache
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  cache = next
  try {
    writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf-8')
  } catch {
    // Non-fatal: preference simply won't persist this session.
  }
  return next
}
