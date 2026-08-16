/**
 * Append-only journal of edits for one draft.
 *
 * Autosave used to rewrite the whole draft on every tick. A journal records only what changed, so
 * the cost of a keystroke follows the size of the edit instead of the size of the document. The
 * draft on disk is therefore a snapshot plus the edits appended after it.
 */

/** One splice, in the coordinates of the text it was produced against. */
export interface DraftEdit {
  from: number
  to: number
  insert: string
}

/** Ceiling on a single journal entry, so a malformed request cannot grow the file without bound. */
export const MAX_EDITS_PER_ENTRY = 5_000

export function isDraftEdit(value: unknown): value is DraftEdit {
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  return (
    typeof raw['from'] === 'number' &&
    Number.isInteger(raw['from']) &&
    raw['from'] >= 0 &&
    typeof raw['to'] === 'number' &&
    Number.isInteger(raw['to']) &&
    raw['to'] >= raw['from'] &&
    typeof raw['insert'] === 'string'
  )
}

export function areDraftEdits(value: unknown): value is DraftEdit[] {
  return Array.isArray(value) && value.length <= MAX_EDITS_PER_ENTRY && value.every(isDraftEdit)
}

/**
 * Each transaction's edits are expressed against the text as it was *before* that transaction, so
 * batches from different transactions can never be flattened into one array — they must stay
 * ordered and be applied one after another.
 */
export function areDraftEditBatches(value: unknown): value is DraftEdit[][] {
  if (!Array.isArray(value) || value.length > MAX_EDITS_PER_ENTRY) return false
  let total = 0
  for (const batch of value) {
    if (!areDraftEdits(batch)) return false
    total += batch.length
    if (total > MAX_EDITS_PER_ENTRY) return false
  }
  return true
}

/** Applies consecutive transactions, each against the text the previous one produced. */
export function applyDraftEditBatches(base: string, batches: readonly (readonly DraftEdit[])[]): string {
  let content = base
  for (const edits of batches) content = applyDraftEdits(content, edits)
  return content
}

export function encodeJournalEntries(batches: readonly (readonly DraftEdit[])[]): string {
  return batches.map(encodeJournalEntry).join('')
}

/**
 * Applies one transaction's edits to `base`.
 *
 * Edits must be ascending and non-overlapping, which is how CodeMirror's `iterChanges` reports
 * them. That lets the whole transaction apply in a single pass, and it makes a malformed batch
 * detectable rather than silently corrupting the draft.
 */
export function applyDraftEdits(base: string, edits: readonly DraftEdit[]): string {
  if (edits.length === 0) return base

  const parts: string[] = []
  let cursor = 0
  for (const edit of edits) {
    if (edit.from < cursor || edit.to > base.length) {
      throw new RangeError('draft edits must be ascending, non-overlapping and within the document')
    }
    parts.push(base.slice(cursor, edit.from), edit.insert)
    cursor = edit.to
  }
  parts.push(base.slice(cursor))
  return parts.join('')
}

export function encodeJournalEntry(edits: readonly DraftEdit[]): string {
  return `${JSON.stringify(edits)}\n`
}

/**
 * Reads entries from journal text.
 *
 * A crash can leave the final line half-written, so an unparsable or malformed trailing line is
 * dropped rather than failing the whole recovery: every complete entry before it is still valid.
 */
export function parseJournal(raw: string): DraftEdit[][] {
  const entries: DraftEdit[][] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      break
    }
    if (!areDraftEdits(parsed)) break
    entries.push(parsed)
  }
  return entries
}

/** Replays a snapshot plus its journal. Entries that no longer fit the text stop the replay. */
export function replayJournal(snapshot: string, raw: string): string {
  let content = snapshot
  for (const edits of parseJournal(raw)) {
    try {
      content = applyDraftEdits(content, edits)
    } catch {
      break
    }
  }
  return content
}
