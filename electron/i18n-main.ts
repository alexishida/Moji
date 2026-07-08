// Minimal translation lookup for the native menu (main process).
// Reuses the exact same locale resource files as the renderer, so menu and
// UI stay in sync and adding a language means only adding a locale file.
import en from '../src/locales/en.json'
import ptBR from '../src/locales/pt-BR.json'
import es from '../src/locales/es.json'
import { DEFAULT_LANGUAGE, type Language } from './shared'

const resources: Record<Language, Record<string, unknown>> = {
  en,
  'pt-BR': ptBR,
  es
}

function lookup(obj: Record<string, unknown>, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
    return undefined
  }, obj)
  return typeof value === 'string' ? value : undefined
}

/** Translate a dotted key, falling back to English then the raw key. */
export function t(lang: Language, key: string): string {
  return lookup(resources[lang] ?? {}, key) ?? lookup(resources[DEFAULT_LANGUAGE], key) ?? key
}
