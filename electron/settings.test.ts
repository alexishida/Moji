import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_DATA = 'C:/test-user-data'
const SETTINGS_FILE = join(USER_DATA, 'settings.json')

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  displays: [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]
}))

vi.mock('electron', () => ({
  app: {
    getLocale: () => 'pt-PT',
    getPath: () => 'C:/test-user-data'
  },
  screen: { getAllDisplays: () => state.displays }
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
  state.displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]
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
      previewFontSize: 20,
      editorFontSize: 99,
      previewWidth: 10,
      recentFiles: ['a.md', 'a.md', 1, 'b.md', 'c.md', 'd.md'],
      windowBounds: { width: 10, height: 9000, x: 'bad' }
    }))
    const { getSettings } = await import('./settings')

    expect(getSettings()).toMatchObject({
      language: 'pt-BR',
      previewTheme: 'light',
      previewLineHeight: 2.4,
      previewFontSize: 20,
      editorFontSize: 24,
      previewWidth: 20,
      autoSave: true,
      recentFiles: ['a.md', 'b.md', 'c.md'],
      windowBounds: { width: 640, height: 8192 }
    })
  })

  it('bounds updates and persists supported settings', async () => {
    const { updateSettings } = await import('./settings')

    const updated = updateSettings({ previewFontSize: 99, editorFontSize: 2, previewLineHeight: 0, previewWidth: 200, recentFiles: ['a.md', 'a.md'] })

    expect(updated).toMatchObject({ previewFontSize: 24, editorFontSize: 12, previewLineHeight: 1.2, previewWidth: 100, recentFiles: ['a.md'] })
    const persisted = JSON.parse(state.files.get(SETTINGS_FILE) ?? '{}')
    expect(persisted.previewFontSize).toBe(24)
    expect(persisted.editorFontSize).toBe(12)
    expect(persisted).not.toHaveProperty('previewFluidWidth')
    expect(persisted.previewWidth).toBe(100)
  })

  it('drops restored coordinates outside every active display', async () => {
    state.files.set(SETTINGS_FILE, JSON.stringify({
      windowBounds: { x: 3000, y: 200, width: 1000, height: 760 }
    }))
    const { getSettings } = await import('./settings')

    expect(getSettings().windowBounds).toEqual({ width: 1000, height: 760 })
  })

  it('normalizes reading width to five-percent steps', async () => {
    const { updateSettings } = await import('./settings')

    expect(updateSettings({ previewWidth: 43 }).previewWidth).toBe(45)
    expect(updateSettings({ previewWidth: 42 }).previewWidth).toBe(40)
  })

  it('enables draft recovery by default and persists an explicit choice', async () => {
    const { getSettings, updateSettings } = await import('./settings')

    expect(getSettings().autoSave).toBe(true)
    expect(updateSettings({ autoSave: false }).autoSave).toBe(false)

    const persisted = JSON.parse(state.files.get(SETTINGS_FILE) ?? '{}')
    expect(persisted.autoSave).toBe(false)
  })

  it('persists the split view and clamps the pane ratio', async () => {
    const { getSettings, updateSettings } = await import('./settings')

    expect(getSettings().splitView).toBe(false)
    expect(updateSettings({ splitView: true, splitRatio: 95 })).toMatchObject({ splitView: true, splitRatio: 80 })
    expect(updateSettings({ splitRatio: 5 }).splitRatio).toBe(20)

    const persisted = JSON.parse(state.files.get(SETTINGS_FILE) ?? '{}')
    expect(persisted.splitView).toBe(true)
    expect(persisted.splitRatio).toBe(20)
  })

  it('falls back to defaults when settings file is invalid JSON', async () => {
    state.files.set(SETTINGS_FILE, '{ invalid')
    const { getSettings } = await import('./settings')

    expect(getSettings()).toMatchObject({
      theme: 'dark',
      previewTheme: 'dark',
      language: 'pt-BR',
      previewWidth: 60,
      autoSave: true,
      recentFiles: []
    })
  })
})
