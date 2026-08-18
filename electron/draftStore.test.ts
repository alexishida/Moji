import { appendFile, mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DraftStore, DRAFTS_DIRECTORY, isDraft, isDraftId, LEGACY_DRAFTS_FILE, MANIFEST_FILE } from './draftStore'
import { DISK_HEADROOM_BYTES } from './draftCapacity'

let userData = ''
const draftsDirectory = (): string => join(userData, DRAFTS_DIRECTORY)
const manifestPath = (): string => join(draftsDirectory(), MANIFEST_FILE)
const contentPath = (id: string): string => join(draftsDirectory(), `${id}.md`)
const journalPath = (id: string): string => join(draftsDirectory(), `${id}.journal`)
const legacyPath = (): string => join(userData, LEGACY_DRAFTS_FILE)

const readManifest = async (): Promise<{ version: number; drafts: Array<{ id: string; title: string }> }> =>
  JSON.parse(await readFile(manifestPath(), 'utf-8'))

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), 'moji-drafts-'))
})

afterEach(async () => {
  await rm(userData, { recursive: true, force: true })
})

/**
 * `isDraftId` and `isDraft` are the gate every draft IPC call passes through, and an id becomes a
 * file name under the drafts directory. They are therefore tested as input validation, not as
 * helpers.
 */
describe('isDraftId', () => {
  it('accepts the ids the renderer generates', () => {
    expect(isDraftId('draft-1')).toBe(true)
    expect(isDraftId('draft-3f8a2b1c-9d4e-4a7b-8c1d-2e5f6a7b8c9d')).toBe(true)
  })

  it.each([
    ['a traversal segment', '../escape'],
    ['a traversal after the prefix', 'draft-../escape'],
    ['a path separator', 'draft-a/b'],
    ['a backslash', 'draft-a\\b'],
    ['a nul byte', 'draft-a\0b'],
    ['an extension of its own', 'draft-1.journal'],
    ['a missing prefix', 'note-1'],
    ['the bare prefix', 'draft-'],
    ['the manifest name', 'manifest'],
    ['an empty string', ''],
    ['a number', 1],
    ['null', null],
    ['an object', { id: 'draft-1' }]
  ])('rejects %s', (_case, value) => {
    expect(isDraftId(value)).toBe(false)
  })
})

describe('isDraft', () => {
  const draft = { id: 'draft-1', title: 'Untitled', content: '# hello' }

  it('accepts a well-formed draft, including empty text', () => {
    expect(isDraft(draft)).toBe(true)
    expect(isDraft({ id: 'draft-1', title: '', content: '' })).toBe(true)
  })

  it('rejects a title past the manifest limit', () => {
    expect(isDraft({ ...draft, title: 'x'.repeat(512) })).toBe(true)
    expect(isDraft({ ...draft, title: 'x'.repeat(513) })).toBe(false)
  })

  // Content size is a machine limit, decided at write time by the store, not by this shape check.
  it('accepts content past the character cap the store used to enforce', () => {
    expect(isDraft({ ...draft, content: 'x'.repeat(10 * 1024 * 1024 + 1) })).toBe(true)
  })

  it.each([
    ['an invalid id', { ...draft, id: '../escape' }],
    ['a missing id', { title: 'Untitled', content: '' }],
    ['a non-string title', { ...draft, title: 42 }],
    ['a non-string content', { ...draft, content: null }],
    ['a non-object', 'draft-1'],
    ['null', null]
  ])('rejects %s', (_case, value) => {
    expect(isDraft(value)).toBe(false)
  })
})

describe('DraftStore', () => {
  it('creates, updates, and removes drafts', async () => {
    const store = new DraftStore(userData)

    await store.saveDraft({ id: 'draft-1', title: 'Untitled', content: 'first' })
    await store.saveDraft({ id: 'draft-1', title: 'Untitled', content: 'latest' })
    await expect(store.getDrafts()).resolves.toEqual([{ id: 'draft-1', title: 'Untitled', content: 'latest' }])

    await store.removeDraft('draft-1')
    await expect(store.getDrafts()).resolves.toEqual([])
    expect(existsSync(contentPath('draft-1'))).toBe(false)
    expect((await readManifest()).drafts).toEqual([])
  })

  it('keeps content out of the manifest and in one file per draft', async () => {
    const store = new DraftStore(userData)
    await store.saveDraft({ id: 'draft-1', title: 'One', content: '# conteúdo um' })
    await store.saveDraft({ id: 'draft-2', title: 'Two', content: '# conteúdo dois' })

    const manifest = await readManifest()
    expect(manifest.drafts).toEqual([
      { id: 'draft-1', title: 'One' },
      { id: 'draft-2', title: 'Two' }
    ])
    expect(JSON.stringify(manifest)).not.toContain('conteúdo')
    await expect(readFile(contentPath('draft-1'), 'utf-8')).resolves.toBe('# conteúdo um')
    await expect(readFile(contentPath('draft-2'), 'utf-8')).resolves.toBe('# conteúdo dois')
  })

  it('does not rewrite other drafts when saving one', async () => {
    const store = new DraftStore(userData)
    await store.saveDraft({ id: 'draft-1', title: 'One', content: 'original' })
    await store.saveDraft({ id: 'draft-2', title: 'Two', content: 'two' })

    // A sentinel written behind the store's back survives only if draft-1 is left untouched.
    await writeFile(contentPath('draft-1'), 'SENTINEL', 'utf-8')
    await store.saveDraft({ id: 'draft-2', title: 'Two', content: 'two updated' })

    await expect(readFile(contentPath('draft-1'), 'utf-8')).resolves.toBe('SENTINEL')
  })

  it('restores drafts written by a previous session', async () => {
    await new DraftStore(userData).saveDraft({ id: 'draft-1', title: 'Kept', content: 'persisted' })

    await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
      { id: 'draft-1', title: 'Kept', content: 'persisted' }
    ])
  })

  it('serializes concurrent draft writes', async () => {
    const store = new DraftStore(userData)

    await Promise.all([
      store.saveDraft({ id: 'draft-1', title: 'One', content: 'first' }),
      store.saveDraft({ id: 'draft-2', title: 'Two', content: 'second' })
    ])

    await expect(store.getDrafts()).resolves.toEqual([
      { id: 'draft-1', title: 'One', content: 'first' },
      { id: 'draft-2', title: 'Two', content: 'second' }
    ])
    // Drafts write in parallel, so the shared manifest must not lose the slower writer.
    expect((await readManifest()).drafts).toEqual([
      { id: 'draft-1', title: 'One' },
      { id: 'draft-2', title: 'Two' }
    ])
    await expect(new DraftStore(userData).getDrafts()).resolves.toHaveLength(2)
  })

  it('keeps request order when parallel saves finish out of order', async () => {
    const store = new DraftStore(userData)

    // Bigger content finishes later, so completion order is the reverse of request order.
    await Promise.all([
      store.saveDraft({ id: 'draft-1', title: 'One', content: 'x'.repeat(400_000) }),
      store.saveDraft({ id: 'draft-2', title: 'Two', content: 'tiny' })
    ])

    expect((await readManifest()).drafts.map((entry) => entry.id)).toEqual(['draft-1', 'draft-2'])
    await expect(new DraftStore(userData).getDrafts()).resolves.toMatchObject([
      { id: 'draft-1' },
      { id: 'draft-2' }
    ])
  })

  describe('incremental autosave', () => {
    it('journals edits instead of rewriting the snapshot', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'hello' })

      await expect(store.appendEdits('draft-1', [[{ from: 5, to: 5, insert: ' world' }]], 11)).resolves.toBe('appended')

      // Snapshot untouched; the edit lives in the journal.
      await expect(readFile(contentPath('draft-1'), 'utf-8')).resolves.toBe('hello')
      expect(existsSync(journalPath('draft-1'))).toBe(true)
      await expect(store.getDrafts()).resolves.toEqual([{ id: 'draft-1', title: 'One', content: 'hello world' }])
    })

    it('recovers snapshot plus journal in a new session', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'hello' })
      await store.appendEdits('draft-1', [[{ from: 5, to: 5, insert: ' world' }]], 11)
      await store.appendEdits('draft-1', [[{ from: 0, to: 0, insert: '# ' }]], 13)

      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
        { id: 'draft-1', title: 'One', content: '# hello world' }
      ])
    })

    it('applies batches from several transactions in sequence', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'abc' })

      // Each batch is written against the text the previous batch produced, not against 'abc'.
      await expect(store.appendEdits('draft-1', [
        [{ from: 3, to: 3, insert: 'd' }],
        [{ from: 4, to: 4, insert: 'e' }],
        [{ from: 0, to: 1, insert: 'A' }]
      ], 5)).resolves.toBe('appended')

      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
        { id: 'draft-1', title: 'One', content: 'Abcde' }
      ])
    })

    it('recovers everything before a journal entry torn by a crash', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'hello' })
      await store.appendEdits('draft-1', [[{ from: 5, to: 5, insert: '!' }]], 6)
      await appendFile(journalPath('draft-1'), '[{"from":0,"to":0,"inse', 'utf-8')

      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
        { id: 'draft-1', title: 'One', content: 'hello!' }
      ])
    })

    it('refuses edits that disagree with the stored text', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'hello' })

      // Renderer expects 99 characters; the store holds 11.
      await expect(store.appendEdits('draft-1', [[{ from: 5, to: 5, insert: ' world' }]], 99)).resolves.toBe('out-of-sync')
      await expect(store.appendEdits('draft-1', [[{ from: 40, to: 50, insert: 'x' }]], 5)).resolves.toBe('out-of-sync')

      expect(existsSync(journalPath('draft-1'))).toBe(false)
      await expect(store.getDrafts()).resolves.toEqual([{ id: 'draft-1', title: 'One', content: 'hello' }])
    })

    it('reports an unknown draft rather than creating one', async () => {
      const store = new DraftStore(userData)

      await expect(store.appendEdits('draft-missing', [[{ from: 0, to: 0, insert: 'x' }]], 1)).resolves.toBe('unknown-draft')
      expect(existsSync(contentPath('draft-missing'))).toBe(false)
    })

    it('folds a large journal back into the snapshot', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: '' })

      const chunk = 'x'.repeat(16 * 1024)
      let length = 0
      let outcome = ''
      for (let index = 0; index < 40 && outcome !== 'compacted'; index += 1) {
        const next = length + chunk.length
        outcome = await store.appendEdits('draft-1', [[{ from: length, to: length, insert: chunk }]], next)
        length = next
      }

      expect(outcome).toBe('compacted')
      expect(existsSync(journalPath('draft-1'))).toBe(false)
      await expect(readFile(contentPath('draft-1'), 'utf-8')).resolves.toHaveLength(length)
      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
        { id: 'draft-1', title: 'One', content: 'x'.repeat(length) }
      ])
    })

    it('drops the journal when a full save supersedes it', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'hello' })
      await store.appendEdits('draft-1', [[{ from: 5, to: 5, insert: '!' }]], 6)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'replaced' })

      expect(existsSync(journalPath('draft-1'))).toBe(false)
      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
        { id: 'draft-1', title: 'One', content: 'replaced' }
      ])
    })

    it('applies concurrent edits to one draft in order', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: '' })

      await Promise.all([
        store.appendEdits('draft-1', [[{ from: 0, to: 0, insert: 'a' }]], 1),
        store.appendEdits('draft-1', [[{ from: 1, to: 1, insert: 'b' }]], 2),
        store.appendEdits('draft-1', [[{ from: 2, to: 2, insert: 'c' }]], 3)
      ])

      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
        { id: 'draft-1', title: 'One', content: 'abc' }
      ])
    })

    it('removes the journal along with the draft', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'hello' })
      await store.appendEdits('draft-1', [[{ from: 5, to: 5, insert: '!' }]], 6)

      await store.removeDraft('draft-1')

      expect(existsSync(journalPath('draft-1'))).toBe(false)
      expect(existsSync(contentPath('draft-1'))).toBe(false)
    })

    it('sweeps a journal left behind without its draft', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'hello' })
      await writeFile(journalPath('draft-orphan'), '[]\n', 'utf-8')

      await new DraftStore(userData).getDrafts()

      expect(existsSync(journalPath('draft-orphan'))).toBe(false)
      expect(existsSync(contentPath('draft-1'))).toBe(true)
    })
  })

  describe('recovery after an interrupted write', () => {
    it('drops a manifest entry whose content file never landed', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'one' })
      await store.saveDraft({ id: 'draft-2', title: 'Two', content: 'two' })
      await rm(contentPath('draft-2'))

      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
        { id: 'draft-1', title: 'One', content: 'one' }
      ])
      expect((await readManifest()).drafts).toEqual([{ id: 'draft-1', title: 'One' }])
    })

    it('removes leftover temporary files and unreferenced content', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'one' })
      await writeFile(join(draftsDirectory(), 'draft-1.md.tmp'), 'partial', 'utf-8')
      await writeFile(contentPath('draft-orphan'), 'orphan', 'utf-8')

      await new DraftStore(userData).getDrafts()

      expect((await readdir(draftsDirectory())).sort()).toEqual([MANIFEST_FILE, 'draft-1.md'].sort())
    })

    it('survives a corrupt manifest without losing the directory', async () => {
      await mkdir(draftsDirectory(), { recursive: true })
      await writeFile(manifestPath(), '{ not json', 'utf-8')

      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([])
    })
  })

  describe('migration from drafts.json', () => {
    it('moves every valid draft and deletes the legacy file', async () => {
      await writeFile(legacyPath(), JSON.stringify([
        { id: 'draft-1', title: 'One', content: '# one' },
        { id: 'draft-2', title: 'Two', content: '# two' }
      ]), 'utf-8')

      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
        { id: 'draft-1', title: 'One', content: '# one' },
        { id: 'draft-2', title: 'Two', content: '# two' }
      ])
      await expect(readFile(contentPath('draft-1'), 'utf-8')).resolves.toBe('# one')
      expect(existsSync(legacyPath())).toBe(false)
    })

    it('migrates only valid entries', async () => {
      await writeFile(legacyPath(), JSON.stringify([
        { id: 'draft-1', title: 'Untitled', content: '# one' },
        { id: 2, title: 'Invalid', content: '# two' },
        { id: '../invalid', title: 'Invalid', content: '# three' }
      ]), 'utf-8')

      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
        { id: 'draft-1', title: 'Untitled', content: '# one' }
      ])
      expect(existsSync(join(draftsDirectory(), '../invalid.md'))).toBe(false)
    })

    it('keeps the migrated data when the legacy file outlived its deletion', async () => {
      const store = new DraftStore(userData)
      await store.saveDraft({ id: 'draft-1', title: 'Migrated', content: 'new layout' })
      // Interruption between writing the manifest and unlinking the legacy file.
      await writeFile(legacyPath(), JSON.stringify([
        { id: 'draft-1', title: 'Stale', content: 'old layout' }
      ]), 'utf-8')

      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
        { id: 'draft-1', title: 'Migrated', content: 'new layout' }
      ])
      expect(existsSync(legacyPath())).toBe(false)
    })

    it('migrates a legacy file saved with a BOM', async () => {
      await writeFile(legacyPath(), `﻿${JSON.stringify([
        { id: 'draft-1', title: 'One', content: '# one' }
      ])}`, 'utf-8')

      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([
        { id: 'draft-1', title: 'One', content: '# one' }
      ])
      expect(existsSync(legacyPath())).toBe(false)
    })

    it('keeps an unparsable legacy file instead of destroying it', async () => {
      await writeFile(legacyPath(), 'not json at all', 'utf-8')

      await expect(new DraftStore(userData).getDrafts()).resolves.toEqual([])
      // The file is the only copy of whatever it held; recovery must stay possible.
      expect(existsSync(legacyPath())).toBe(true)
      await expect(readFile(legacyPath(), 'utf-8')).resolves.toBe('not json at all')
    })
  })

  /**
   * Drafts are no longer capped at a character count. What replaces it is measured in bytes against
   * the machine, and a draft that does not fit is refused whole — the store never writes a shortened
   * copy, because a draft the user cannot see is truncated is worse than one that failed loudly.
   */
  describe('capacity', () => {
    const plentyOfDisk = async (): Promise<number> => 8 * 1024 * 1024 * 1024

    it('stores and restores a draft far past the old ten-million-character cap', async () => {
      const content = 'x'.repeat(12 * 1024 * 1024)
      await new DraftStore(userData).saveDraft({ id: 'draft-1', title: 'Big', content })

      const restored = await new DraftStore(userData).getDrafts()
      expect(restored).toHaveLength(1)
      expect(restored[0]?.content).toBe(content)
      expect(restored[0]?.content.length).toBe(content.length)
    })

    it('refuses a draft past the memory budget and keeps the stored one intact', async () => {
      const store = new DraftStore(userData, { memoryBudgetBytes: 1024, freeDiskBytes: plentyOfDisk })
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'kept' })

      await expect(
        store.saveDraft({ id: 'draft-1', title: 'One', content: 'y'.repeat(2048) })
      ).rejects.toMatchObject({ problem: { reason: 'memory-budget', requiredBytes: 2048, availableBytes: 1024 } })

      await expect(readFile(contentPath('draft-1'), 'utf-8')).resolves.toBe('kept')
      await expect(store.getDrafts()).resolves.toEqual([{ id: 'draft-1', title: 'One', content: 'kept' }])
      expect(existsSync(join(draftsDirectory(), 'draft-1.md.tmp'))).toBe(false)
    })

    it('counts every draft against one budget', async () => {
      const store = new DraftStore(userData, { memoryBudgetBytes: 1000, freeDiskBytes: plentyOfDisk })
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'a'.repeat(600) })

      await expect(store.saveDraft({ id: 'draft-2', title: 'Two', content: 'b'.repeat(600) })).rejects.toMatchObject({
        problem: { reason: 'memory-budget' }
      })

      // Removing the first one gives the budget back, so the same draft now fits.
      await store.removeDraft('draft-1')
      await expect(store.saveDraft({ id: 'draft-2', title: 'Two', content: 'b'.repeat(600) })).resolves.toBeUndefined()
    })

    it('refuses a write that would fill the volume, reporting both sizes', async () => {
      const store = new DraftStore(userData, { freeDiskBytes: async () => 1024 })

      await expect(store.saveDraft({ id: 'draft-1', title: 'One', content: 'x'.repeat(10) })).rejects.toMatchObject({
        problem: { reason: 'disk-space', requiredBytes: 10 + DISK_HEADROOM_BYTES, availableBytes: 1024 }
      })
      expect(existsSync(contentPath('draft-1'))).toBe(false)
    })

    it('saves when free space cannot be measured', async () => {
      const store = new DraftStore(userData, { freeDiskBytes: async () => null })

      await expect(store.saveDraft({ id: 'draft-1', title: 'One', content: 'written' })).resolves.toBeUndefined()
      await expect(readFile(contentPath('draft-1'), 'utf-8')).resolves.toBe('written')
    })

    it('refuses journaled edits it cannot back and leaves the journal untouched', async () => {
      let free = 8 * 1024 * 1024 * 1024
      const store = new DraftStore(userData, { freeDiskBytes: async () => free })
      await store.saveDraft({ id: 'draft-1', title: 'One', content: 'hello' })
      free = 1024

      await expect(store.appendEdits('draft-1', [[{ from: 5, to: 5, insert: '!' }]], 6)).rejects.toMatchObject({
        problem: { reason: 'disk-space' }
      })

      expect(existsSync(journalPath('draft-1'))).toBe(false)
      await expect(readFile(contentPath('draft-1'), 'utf-8')).resolves.toBe('hello')
    })
  })
})
