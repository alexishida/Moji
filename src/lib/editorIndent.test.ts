import { describe, expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import { EDITOR_INDENT_UNIT, indentWithTab, outdentWithShiftTab } from './editorIndent'

function createState(doc: string, selection?: { anchor: number; head?: number }): EditorState {
  return EditorState.create({
    doc,
    selection,
    extensions: [indentUnit.of(EDITOR_INDENT_UNIT)]
  })
}

function run(command: typeof indentWithTab, state: EditorState): { handled: boolean; doc: string } {
  let next = state
  const handled = command({
    state,
    dispatch: (transaction: Transaction) => {
      next = transaction.state
    }
  })
  return { handled, doc: next.doc.toString() }
}

describe('indentWithTab', () => {
  it('nests a list item when the cursor is at the start of the line', () => {
    const state = createState('- This\n- Inside of "This"', { anchor: 7 })
    expect(run(indentWithTab, state)).toEqual({ handled: true, doc: '- This\n  - Inside of "This"' })
  })

  it('inserts an indent unit at the cursor when there is text before it', () => {
    const state = createState('- This', { anchor: 6 })
    expect(run(indentWithTab, state)).toEqual({ handled: true, doc: '- This  ' })
  })

  it('indents every line of a selection', () => {
    const state = createState('- one\n- two', { anchor: 0, head: 11 })
    expect(run(indentWithTab, state)).toEqual({ handled: true, doc: '  - one\n  - two' })
  })

  it('does nothing on a read-only document', () => {
    const state = EditorState.create({
      doc: '- This',
      extensions: [indentUnit.of(EDITOR_INDENT_UNIT), EditorState.readOnly.of(true)]
    })
    expect(run(indentWithTab, state)).toEqual({ handled: false, doc: '- This' })
  })
})

describe('outdentWithShiftTab', () => {
  it('removes one indent unit from the current line', () => {
    const state = createState('- This\n  - Inside of "This"', { anchor: 12 })
    expect(run(outdentWithShiftTab, state)).toEqual({ handled: true, doc: '- This\n- Inside of "This"' })
  })

  it('leaves a line without leading whitespace untouched', () => {
    const state = createState('- This', { anchor: 3 })
    expect(run(outdentWithShiftTab, state).doc).toBe('- This')
  })

  it('does nothing on a read-only document', () => {
    const state = EditorState.create({
      doc: '  - This',
      extensions: [indentUnit.of(EDITOR_INDENT_UNIT), EditorState.readOnly.of(true)]
    })
    expect(run(outdentWithShiftTab, state)).toEqual({ handled: false, doc: '  - This' })
  })
})
