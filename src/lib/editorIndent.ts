import { indentLess, indentMore } from '@codemirror/commands'
import type { StateCommand } from '@codemirror/state'

/** Two spaces: the Markdown convention for one nesting level of a list. */
export const EDITOR_INDENT_UNIT = '  '

/**
 * Tab indents whole lines when there is a selection or when the cursor sits in
 * the leading whitespace (nesting a list item); anywhere else it inserts one
 * indent unit at the cursor, like any plain text editor.
 */
export const indentWithTab: StateCommand = (target) => {
  const { state } = target
  if (state.readOnly) return false

  if (!state.selection.ranges.every((range) => range.empty)) return indentMore(target)

  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  if (!line.text.slice(0, head - line.from).trim()) return indentMore(target)

  target.dispatch(state.update(state.replaceSelection(EDITOR_INDENT_UNIT), {
    scrollIntoView: true,
    userEvent: 'input.indent'
  }))
  return true
}

/** Shift-Tab removes one indent unit from every touched line. */
export const outdentWithShiftTab: StateCommand = (target) => {
  if (target.state.readOnly) return false
  return indentLess(target)
}
