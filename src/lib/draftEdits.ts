import type { ChangeSet } from '@codemirror/state'
import type { DraftEditPayload } from '../../electron/shared'

/**
 * Flattens one transaction's changes into the shape the draft journal replays.
 *
 * `iterChanges` reports ranges in the coordinates of the document *before* the transaction
 * (`fromA`/`toA`), ascending and non-overlapping — exactly what `applyDraftEdits` expects. The
 * post-change coordinates are deliberately ignored: mixing the two would corrupt the replay.
 */
export function collectDraftEdits(changes: ChangeSet): DraftEditPayload[] {
  const edits: DraftEditPayload[] = []
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    edits.push({ from: fromA, to: toA, insert: inserted.toString() })
  })
  return edits
}
