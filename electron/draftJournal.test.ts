import { describe, expect, it } from 'vitest'
import {
  applyDraftEditBatches,
  applyDraftEdits,
  areDraftEditBatches,
  areDraftEdits,
  encodeJournalEntries,
  encodeJournalEntry,
  MAX_EDITS_PER_ENTRY,
  parseJournal,
  replayJournal,
  type DraftEdit
} from './draftJournal'

const edit = (from: number, to: number, insert: string): DraftEdit => ({ from, to, insert })

describe('applyDraftEdits', () => {
  it('inserts, replaces and deletes', () => {
    expect(applyDraftEdits('hello', [edit(5, 5, ' world')])).toBe('hello world')
    expect(applyDraftEdits('hello', [edit(0, 5, 'bye')])).toBe('bye')
    expect(applyDraftEdits('hello', [edit(1, 4, '')])).toBe('ho')
  })

  it('applies several edits from one transaction in original coordinates', () => {
    // Both offsets refer to 'one two three', as CodeMirror reports them.
    expect(applyDraftEdits('one two three', [edit(0, 3, '1'), edit(8, 13, '3')])).toBe('1 two 3')
  })

  it('returns the base unchanged for an empty batch', () => {
    expect(applyDraftEdits('same', [])).toBe('same')
  })

  it('preserves multi-byte text around the edit', () => {
    expect(applyDraftEdits('coração 日本', [edit(8, 10, 'ok')])).toBe('coração ok')
  })

  it('rejects overlapping or out-of-range edits instead of corrupting the draft', () => {
    expect(() => applyDraftEdits('abcdef', [edit(3, 5, 'x'), edit(2, 4, 'y')])).toThrow(RangeError)
    expect(() => applyDraftEdits('abc', [edit(0, 99, 'x')])).toThrow(RangeError)
  })
})

describe('areDraftEdits', () => {
  it('accepts well-formed batches and rejects malformed ones', () => {
    expect(areDraftEdits([edit(0, 1, 'a')])).toBe(true)
    expect(areDraftEdits([])).toBe(true)
    expect(areDraftEdits([{ from: 2, to: 1, insert: 'a' }])).toBe(false)
    expect(areDraftEdits([{ from: -1, to: 1, insert: 'a' }])).toBe(false)
    expect(areDraftEdits([{ from: 0, to: 1 }])).toBe(false)
    expect(areDraftEdits([{ from: 0.5, to: 1, insert: 'a' }])).toBe(false)
    expect(areDraftEdits('nope')).toBe(false)
  })
})

/**
 * `areDraftEditBatches` is what `main.ts` puts between the renderer and the journal file, so its
 * ceiling is a size guard rather than a formatting detail.
 */
describe('areDraftEditBatches', () => {
  it('accepts well-formed batches and rejects malformed ones', () => {
    expect(areDraftEditBatches([])).toBe(true)
    expect(areDraftEditBatches([[edit(0, 1, 'a')], [edit(1, 2, 'b')]])).toBe(true)
    expect(areDraftEditBatches([[]])).toBe(true)
    expect(areDraftEditBatches([edit(0, 1, 'a')])).toBe(false) // flat, not batched
    expect(areDraftEditBatches([[{ from: 2, to: 1, insert: 'a' }]])).toBe(false)
    expect(areDraftEditBatches('nope')).toBe(false)
    expect(areDraftEditBatches(null)).toBe(false)
  })

  it('caps the number of batches', () => {
    const batch = [edit(0, 0, '')]
    expect(areDraftEditBatches(Array.from({ length: MAX_EDITS_PER_ENTRY }, () => []))).toBe(true)
    expect(areDraftEditBatches(Array.from({ length: MAX_EDITS_PER_ENTRY + 1 }, () => batch))).toBe(false)
  })

  it('caps the total number of edits spread across batches', () => {
    // Many small batches must not add up past the ceiling one large batch would hit.
    const half = Array.from({ length: MAX_EDITS_PER_ENTRY / 2 }, () => edit(0, 0, 'x'))

    expect(areDraftEditBatches([half, half])).toBe(true)
    expect(areDraftEditBatches([half, half, [edit(0, 0, 'x')]])).toBe(false)
  })

  it('caps a single oversized batch', () => {
    const oversized = Array.from({ length: MAX_EDITS_PER_ENTRY + 1 }, () => edit(0, 0, 'x'))

    expect(areDraftEdits(oversized)).toBe(false)
    expect(areDraftEditBatches([oversized])).toBe(false)
  })
})

describe('applyDraftEditBatches', () => {
  it('applies each batch against the text the previous one produced', () => {
    // The second batch addresses 'abcd', which only exists after the first batch ran.
    expect(applyDraftEditBatches('abc', [[edit(3, 3, 'd')], [edit(0, 1, 'A')], [edit(2, 4, 'X')]])).toBe('AbX')
  })

  it('returns the base unchanged for no batches', () => {
    expect(applyDraftEditBatches('same', [])).toBe('same')
  })

  it('propagates a batch that does not fit instead of applying it partially', () => {
    expect(() => applyDraftEditBatches('abc', [[edit(0, 1, 'A')], [edit(50, 60, 'x')]])).toThrow(RangeError)
  })
})

describe('journal encoding', () => {
  it('encodes batches so replaying them matches applying them directly', () => {
    const batches = [[edit(5, 5, ' world')], [edit(0, 0, '# ')]]

    expect(replayJournal('hello', encodeJournalEntries(batches))).toBe(applyDraftEditBatches('hello', batches))
  })

  it('encodes nothing for no batches', () => {
    expect(encodeJournalEntries([])).toBe('')
  })

  it('round-trips entries', () => {
    const raw = encodeJournalEntry([edit(0, 0, 'a')]) + encodeJournalEntry([edit(1, 1, 'b')])

    expect(parseJournal(raw)).toEqual([[edit(0, 0, 'a')], [edit(1, 1, 'b')]])
  })

  it('keeps entries containing newlines on a single line', () => {
    const raw = encodeJournalEntry([edit(0, 0, 'first\nsecond\n')])

    expect(raw.split('\n')).toHaveLength(2)
    expect(parseJournal(raw)).toEqual([[edit(0, 0, 'first\nsecond\n')]])
  })

  it('drops a trailing entry left half-written by a crash', () => {
    const complete = encodeJournalEntry([edit(0, 0, 'kept')])
    const torn = '[{"from":0,"to":0,"insert":"lo'

    expect(parseJournal(complete + torn)).toEqual([[edit(0, 0, 'kept')]])
  })

  it('ignores an empty journal', () => {
    expect(parseJournal('')).toEqual([])
  })
})

describe('replayJournal', () => {
  it('rebuilds the current text from snapshot plus journal', () => {
    const raw = encodeJournalEntry([edit(5, 5, ' world')]) + encodeJournalEntry([edit(0, 0, '# ')])

    expect(replayJournal('hello', raw)).toBe('# hello world')
  })

  it('replays everything that survived a torn final entry', () => {
    const raw = `${encodeJournalEntry([edit(5, 5, '!')])}[{"from":0,"to":0,"inse`

    expect(replayJournal('hello', raw)).toBe('hello!')
  })

  it('stops at an entry that no longer fits the text', () => {
    const raw = encodeJournalEntry([edit(0, 1, 'H')]) + encodeJournalEntry([edit(50, 60, 'x')])

    expect(replayJournal('hello', raw)).toBe('Hello')
  })

  it('returns the snapshot when there is no journal', () => {
    expect(replayJournal('only snapshot', '')).toBe('only snapshot')
  })
})
