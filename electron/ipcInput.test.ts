import { describe, expect, it } from 'vitest'
import { isMarkdown, isWindowBounds, sanitizeDraft, sanitizeSettingsPatch, suggestedMarkdownName } from './ipcInput'

describe('sanitizeSettingsPatch', () => {
  it('keeps supported fields with the right type', () => {
    expect(sanitizeSettingsPatch({
      language: 'pt-BR',
      previewTheme: 'light',
      previewFontSize: 18,
      editorFontSize: 15,
      previewLineHeight: 1.6,
      previewFluidWidth: true,
      previewWidth: 60,
      autoSave: false,
      recentFiles: ['a.md', 'b.md'],
      windowBounds: { width: 800, height: 600 }
    })).toEqual({
      language: 'pt-BR',
      previewTheme: 'light',
      previewFontSize: 18,
      editorFontSize: 15,
      previewLineHeight: 1.6,
      previewFluidWidth: true,
      previewWidth: 60,
      autoSave: false,
      recentFiles: ['a.md', 'b.md'],
      windowBounds: { width: 800, height: 600 }
    })
  })

  it('drops fields whose type does not match', () => {
    expect(sanitizeSettingsPatch({
      language: 'klingon',
      previewTheme: 'neon',
      previewFontSize: '18',
      autoSave: 'yes',
      windowBounds: { width: 800 }
    })).toEqual({})
  })

  it('drops unknown fields instead of forwarding them to the settings file', () => {
    // Anything not listed here would otherwise be persisted verbatim from renderer input.
    expect(sanitizeSettingsPatch({
      previewWidth: 60,
      lastDialogDirectory: '/etc',
      arbitrary: 'value'
    })).toEqual({ previewWidth: 60 })
  })

  it('does not carry a __proto__ payload into the patch', () => {
    // JSON.parse gives `__proto__` as a real own property, which an object literal cannot.
    const hostile = JSON.parse('{"__proto__":{"polluted":true},"previewWidth":60}')

    const patch = sanitizeSettingsPatch(hostile)

    expect(patch).toEqual({ previewWidth: 60 })
    expect(Object.getPrototypeOf(patch)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('keeps only the string entries of recentFiles', () => {
    expect(sanitizeSettingsPatch({ recentFiles: ['a.md', 42, null, 'b.md', { path: 'c.md' }] }))
      .toEqual({ recentFiles: ['a.md', 'b.md'] })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'previewWidth=60'],
    ['a number', 7],
    ['an array', ['previewWidth']]
  ])('returns an empty patch for %s', (_case, value) => {
    expect(sanitizeSettingsPatch(value)).toEqual({})
  })
})

describe('isWindowBounds', () => {
  it('requires numeric width and height', () => {
    expect(isWindowBounds({ width: 800, height: 600 })).toBe(true)
    expect(isWindowBounds({ width: 800, height: 600, x: 10, y: 20 })).toBe(true)
    expect(isWindowBounds({ width: '800', height: 600 })).toBe(false)
    expect(isWindowBounds({ width: 800 })).toBe(false)
    expect(isWindowBounds(null)).toBe(false)
  })
})

describe('sanitizeDraft', () => {
  const draft = { id: 'draft-1', title: 'Untitled', content: '# hello' }

  it('narrows a valid draft to exactly the persisted fields', () => {
    expect(sanitizeDraft({ ...draft, path: '/etc/passwd', dirty: true })).toEqual(draft)
  })

  it.each([
    ['a traversal id', { ...draft, id: '../escape' }],
    ['an absolute id', { ...draft, id: '/etc/passwd' }],
    ['an id outside the draft namespace', { ...draft, id: 'manifest' }],
    ['a non-string title', { ...draft, title: 42 }],
    ['a non-string content', { ...draft, content: null }],
    ['a non-object', 'draft-1']
  ])('rejects %s', (_case, value) => {
    expect(sanitizeDraft(value)).toBeNull()
  })
})

describe('isMarkdown', () => {
  it('accepts the supported extensions regardless of case', () => {
    expect(isMarkdown('notes.md')).toBe(true)
    expect(isMarkdown('notes.MARKDOWN')).toBe(true)
  })

  it('rejects anything else, including non-strings', () => {
    expect(isMarkdown('notes.txt')).toBe(false)
    expect(isMarkdown('notes')).toBe(false)
    expect(isMarkdown('.md')).toBe(false)
    expect(isMarkdown(42)).toBe(false)
    expect(isMarkdown(null)).toBe(false)
  })
})

describe('suggestedMarkdownName', () => {
  it('appends the extension only when it is missing', () => {
    expect(suggestedMarkdownName('Report')).toBe('Report.md')
    expect(suggestedMarkdownName('Report.md')).toBe('Report.md')
    expect(suggestedMarkdownName('Report.markdown')).toBe('Report.markdown')
  })

  it('strips path separators so a title can never redirect the save dialog', () => {
    expect(suggestedMarkdownName('../../etc/passwd')).toBe('....etcpasswd.md')
    expect(suggestedMarkdownName('C:\\Windows\\system32\\config')).toBe('C:Windowssystem32config.md')
  })

  it.each([
    ['a non-string', 42],
    ['an empty string', ''],
    ['only whitespace', '   '],
    ['only separators', ' /\\ ']
  ])('falls back to a safe default for %s', (_case, value) => {
    expect(suggestedMarkdownName(value)).toBe('untitled.md')
  })
})
