import { EditorState, type TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { applyDraftEdits } from '../../electron/draftJournal'
import { collectDraftEdits } from './draftEdits'

/** Replaying the collected edits must land on exactly the document CodeMirror produced. */
function expectRoundTrip(doc: string, spec: TransactionSpec): void {
  const state = EditorState.create({ doc })
  const transaction = state.update(spec)
  const replayed = applyDraftEdits(state.doc.toString(), collectDraftEdits(transaction.changes))

  expect(replayed).toBe(transaction.state.doc.toString())
}

describe('collectDraftEdits', () => {
  it('reproduces a simple insertion', () => {
    expectRoundTrip('hello', { changes: { from: 5, insert: ' world' } })
  })

  it('reproduces a deletion', () => {
    expectRoundTrip('hello world', { changes: { from: 5, to: 11 } })
  })

  it('reproduces a replacement', () => {
    expectRoundTrip('hello world', { changes: { from: 6, to: 11, insert: 'there' } })
  })

  it('reproduces several changes made in one transaction', () => {
    // The second range is expressed against the original document, not the edited one.
    expectRoundTrip('one two three', {
      changes: [
        { from: 0, to: 3, insert: '1' },
        { from: 8, to: 13, insert: '3' }
      ]
    })
  })

  it('reproduces edits around multi-byte text', () => {
    expectRoundTrip('coração 日本語 fim', { changes: { from: 8, to: 11, insert: 'ok' } })
  })

  it('reproduces a whole-document replacement', () => {
    expectRoundTrip('old content', { changes: { from: 0, to: 11, insert: 'brand new' } })
  })

  it('reproduces edits spanning line breaks', () => {
    expectRoundTrip('first\nsecond\nthird', { changes: { from: 5, to: 12, insert: '\nmiddle\n' } })
  })

  it('produces nothing for a transaction that does not touch the document', () => {
    const state = EditorState.create({ doc: 'unchanged' })
    const transaction = state.update({ selection: { anchor: 2 } })

    expect(collectDraftEdits(transaction.changes)).toEqual([])
  })

  it('keeps consecutive transactions replayable in order', () => {
    let state = EditorState.create({ doc: 'abc' })
    const batches = []
    for (const spec of [
      { changes: { from: 3, insert: 'd' } },
      { changes: { from: 0, to: 1, insert: 'A' } },
      { changes: { from: 2, to: 4, insert: 'X' } }
    ]) {
      const transaction = state.update(spec)
      batches.push(collectDraftEdits(transaction.changes))
      state = transaction.state
    }

    let replayed = 'abc'
    for (const edits of batches) replayed = applyDraftEdits(replayed, edits)
    expect(replayed).toBe(state.doc.toString())
  })
})
