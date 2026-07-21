import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_DATA = 'C:/test-user-data'
const SETTINGS_FILE = join(USER_DATA, 'settings.json')

const state = vi.hoisted(() => ({ files: new Map<string, string>() }))

vi.mock('electron', () => ({
  app: {
    getLocale: () => 'pt-PT',
    getPath: () => 'C:/test-user-data'
  }
}))

vi.mock('node:fs', () => ({
  readFileSync: (file: string) => {
    const content = state.files.get(file)
    if (content === undefined) throw new Error('ENOENT')
    return content
  },
  writeFileSync: (file: string, content: string) => state.files.set(file, content)
}))

beforeEach(() => {
  state.files.clear()
  vi.resetModules()
})

describe('settings', () => {
  it('resolves locale to closest supported language', async () => {
    const { resolveLanguage } = await import('./settings')

    expect(resolveLanguage('pt-PT')).toBe('pt-BR')
    expect(resolveLanguage('fr-CA')).toBe('en')
  })

  it('sanitizes persisted preferences and keeps recent files unique', async () => {
    state.files.set(SETTINGS_FILE, JSON.stringify({
      language: 'invalid',
      previewTheme: 'light',
      previewLineHeight: 8,
      recentFiles: ['a.md', 'a.md', 1, 'b.md', 'c.md', 'd.md'],
      recentFolders: ['docs', 'docs', 1, 'notes', 'wiki', 'work', 'more', 'extra'],
      windowBounds: { width: 10, height: 9000, x: 'bad' }
    }))
    const { getSettings } = await import('./settings')

    expect(getSettings()).toMatchObject({
      language: 'pt-BR',
      previewTheme: 'light',
      previewLineHeight: 2.4,
      recentFiles: ['a.md', 'b.md', 'c.md'],
      recentFolders: ['docs', 'notes', 'wiki', 'work', 'more'],
      windowBounds: { width: 640, height: 8192 }
    })
  })

  it('bounds updates and persists supported settings', async () => {
    const { updateSettings } = await import('./settings')

    const updated = updateSettings({
      previewFontSize: 99,
      previewLineHeight: 0,
      recentFiles: ['a.md', 'a.md'],
      recentFolders: ['docs', 'docs']
    })

    expect(updated).toMatchObject({
      previewFontSize: 24,
      previewLineHeight: 1.2,
      recentFiles: ['a.md'],
      recentFolders: ['docs']
    })
    const persisted = JSON.parse(state.files.get(SETTINGS_FILE) ?? '{}')
    expect(persisted).not.toHaveProperty('previewFontSize')
    expect(persisted).not.toHaveProperty('previewFluidWidth')
  })

  it('falls back to defaults when settings file is invalid JSON', async () => {
    state.files.set(SETTINGS_FILE, '{ invalid')
    const { getSettings } = await import('./settings')

    expect(getSettings()).toMatchObject({
      theme: 'dark',
      previewTheme: 'dark',
      language: 'pt-BR',
      recentFiles: [],
      recentFolders: []
    })
  })
})
