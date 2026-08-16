import { app } from 'electron'
import type { AutoSaveDraft } from './shared'
import { DraftStore, type AppendEditsOutcome } from './draftStore'
import type { DraftEdit } from './draftJournal'

let store: DraftStore | null = null

/** Built lazily: `app.getPath` is only valid once Electron is ready. */
function draftStore(): DraftStore {
  store ??= new DraftStore(app.getPath('userData'))
  return store
}

export function getDrafts(): Promise<AutoSaveDraft[]> {
  return draftStore().getDrafts()
}

export function saveDraft(draft: AutoSaveDraft): Promise<void> {
  return draftStore().saveDraft(draft)
}

export function appendDraftEdits(
  id: string,
  batches: readonly (readonly DraftEdit[])[],
  expectedLength: number
): Promise<AppendEditsOutcome> {
  return draftStore().appendEdits(id, batches, expectedLength)
}

export function removeDraft(id: string): Promise<void> {
  return draftStore().removeDraft(id)
}
