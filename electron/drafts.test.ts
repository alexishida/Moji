import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_DATA = 'C:/test-user-data'
const DRAFTS_FILE = join(USER_DATA, 'drafts.json')

const state = vi.hoisted(() => ({ files: new Map<string, string>() }))

vi.mock('electron', () => ({
  app: {
    getPath: () => USER_DATA
  }
}))

vi.mock('node:fs/promises', () => ({
  readFile: (file: string) => {
    const content = state.files.get(file)
    if (content === undefined) throw new Error('ENOENT')
    return content
  },
  writeFile: (file: string, content: string) => state.files.set(file, content),
  rename: (source: string, destination: string) => {
    const content = state.files.get(source)
    if (content === undefined) throw new Error('ENOENT')
    state.files.set(destination, content)
    state.files.delete(source)
  }
}))

beforeEach(() => {
  state.files.clear()
  vi.resetModules()
})

describe('draft recovery', () => {
  it('loads only valid drafts', async () => {
    state.files.set(DRAFTS_FILE, JSON.stringify([
      { id: 'draft-1', title: 'Untitled', content: '# one' },
      { id: 2, title: 'Invalid', content: '# two' },
      { id: '../invalid', title: 'Invalid', content: '# three' }
    ]))
    const { getDrafts } = await import('./drafts')

    await expect(getDrafts()).resolves.toEqual([{ id: 'draft-1', title: 'Untitled', content: '# one' }])
  })

  it('creates, updates, and removes drafts', async () => {
    const { getDrafts, removeDraft, saveDraft } = await import('./drafts')

    await saveDraft({ id: 'draft-1', title: 'Untitled', content: 'first' })
    await saveDraft({ id: 'draft-1', title: 'Untitled', content: 'latest' })

    await expect(getDrafts()).resolves.toEqual([{ id: 'draft-1', title: 'Untitled', content: 'latest' }])
    await removeDraft('draft-1')
    await expect(getDrafts()).resolves.toEqual([])
    expect(JSON.parse(state.files.get(DRAFTS_FILE) ?? 'null')).toEqual([])
  })

  it('serializes concurrent draft writes', async () => {
    const { getDrafts, saveDraft } = await import('./drafts')

    await Promise.all([
      saveDraft({ id: 'draft-1', title: 'One', content: 'first' }),
      saveDraft({ id: 'draft-2', title: 'Two', content: 'second' })
    ])

    await expect(getDrafts()).resolves.toEqual([
      { id: 'draft-1', title: 'One', content: 'first' },
      { id: 'draft-2', title: 'Two', content: 'second' }
    ])
  })
})
