import { appendFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutoSaveDraft } from './shared'
import { stripLeadingBom } from './documentDecoder'
import {
  applyDraftEditBatches,
  encodeJournalEntries,
  encodeJournalHeader,
  replayJournal,
  splitJournalHeader,
  type DraftEdit
} from './draftJournal'
import {
  defaultMemoryBudgetBytes,
  diskSpaceErrorFrom,
  DISK_HEADROOM_BYTES,
  DraftPersistError,
  draftBytes,
  freeDiskBytes
} from './draftCapacity'

/**
 * Recovery drafts on disk.
 *
 * Each draft owns a content file, and a small manifest holds only ids and titles. Saving one
 * draft therefore rewrites that draft plus a few hundred bytes of manifest, never the text of
 * every other draft.
 *
 * Size is bounded by the machine rather than by a fixed character count: every write is checked
 * against a memory budget and the free space on the volume, and a write that does not fit is
 * refused whole, with the numbers behind the refusal. See `draftCapacity.ts`.
 *
 * Autosave appends edits to a per-draft journal instead of rewriting the snapshot, so the cost of
 * a keystroke follows the size of the edit. The journal is folded back into the snapshot once it
 * grows past `COMPACT_JOURNAL_BYTES`, which bounds both its size and the work done at startup.
 *
 * Layout under `userData`:
 *   drafts/manifest.json   { version, drafts: [{ id, title }] }
 *   drafts/<id>.md         snapshot, readable by hand if recovery is ever needed
 *   drafts/<id>.journal    edits appended after the snapshot, one JSON array per line
 */
export const DRAFTS_DIRECTORY = 'drafts'
export const MANIFEST_FILE = 'manifest.json'
export const LEGACY_DRAFTS_FILE = 'drafts.json'
const MANIFEST_VERSION = 2

/** Journal size that triggers folding it back into the snapshot. */
export const COMPACT_JOURNAL_BYTES = 256 * 1024

export type AppendEditsOutcome = 'appended' | 'compacted' | 'unknown-draft' | 'out-of-sync'

const MAX_TITLE_LENGTH = 512
const DRAFT_ID_PATTERN = /^draft-[a-zA-Z0-9-]+$/

interface ManifestEntry {
  id: string
  title: string
}

/** Injection points for the capacity checks, so tests can shrink the machine instead of filling it. */
export interface DraftStoreLimits {
  /** Bytes all drafts together may occupy in main-process memory. */
  memoryBudgetBytes?: number
  /** Free bytes on the volume holding the drafts directory, or `null` when unknown. */
  freeDiskBytes?: (directory: string) => Promise<number | null>
}

export function isDraftId(value: unknown): value is string {
  return typeof value === 'string' && DRAFT_ID_PATTERN.test(value)
}

/**
 * Shape check only.
 *
 * Content length is deliberately unbounded here: how much text can be kept is a property of the
 * machine, not of the message, so it is decided by `DraftStore` at write time — where the answer
 * can be measured in bytes and reported. The title stays bounded because it lives in the manifest,
 * which is rewritten whole.
 */
export function isDraft(value: unknown): value is AutoSaveDraft {
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  return (
    isDraftId(raw['id']) &&
    typeof raw['title'] === 'string' &&
    raw['title'].length <= MAX_TITLE_LENGTH &&
    typeof raw['content'] === 'string'
  )
}

/**
 * Write to a sibling temporary file, then rename. A crash leaves either the old file or the new one.
 *
 * A failed write also leaves neither a half-written draft nor a stray temporary file: the partial
 * copy is removed before the error propagates, and the previous content stays in place.
 */
async function writeFileAtomic(file: string, data: string): Promise<void> {
  const temporaryFile = `${file}.tmp`
  try {
    await writeFile(temporaryFile, data, 'utf-8')
  } catch (err) {
    await removeIfPresent(temporaryFile)
    throw diskSpaceErrorFrom(err, Buffer.byteLength(data, 'utf-8')) ?? err
  }
  await rename(temporaryFile, file)
}

async function removeIfPresent(file: string): Promise<void> {
  try {
    await unlink(file)
  } catch {
    // Already gone, which is the state we wanted.
  }
}

export class DraftStore {
  private readonly directory: string
  private readonly manifestFile: string
  private readonly legacyFile: string
  private cache: AutoSaveDraft[] | null = null
  private loadPromise: Promise<void> | null = null
  /** One chain per draft: writes to the same draft never interleave, different drafts never block. */
  private readonly draftQueues = new Map<string, Promise<void>>()
  /** The manifest is shared state, so it is serialized across every draft. */
  private manifestQueue = Promise.resolve()
  /**
   * Position of each draft, fixed when it first appears. Drafts write in parallel, so without this
   * the stored order would follow whichever write finished first and tabs would shuffle between
   * sessions.
   */
  private readonly order = new Map<string, number>()
  /**
   * Ids `removeDraft` has retired. A draft id is never reused, so once removed it must stay
   * gone: without this, a debounced autosave issued just before the removal but only reaching
   * the front of this id's queue afterward would resurrect the draft on disk — claiming a fresh
   * position at the end of the tab order in the process, since its old one was already freed.
   */
  private readonly retired = new Set<string>()
  private nextOrder = 0
  /** Bytes each cached draft currently costs, so the memory budget never rescans every draft. */
  private readonly bytes = new Map<string, number>()
  private readonly memoryBudgetBytes: number
  private readonly freeDiskBytes: (directory: string) => Promise<number | null>

  constructor(userDataDirectory: string, limits: DraftStoreLimits = {}) {
    this.directory = join(userDataDirectory, DRAFTS_DIRECTORY)
    this.manifestFile = join(this.directory, MANIFEST_FILE)
    this.legacyFile = join(userDataDirectory, LEGACY_DRAFTS_FILE)
    this.memoryBudgetBytes = limits.memoryBudgetBytes ?? defaultMemoryBudgetBytes()
    this.freeDiskBytes = limits.freeDiskBytes ?? freeDiskBytes
  }

  private contentFile(id: string): string {
    return join(this.directory, `${id}.md`)
  }

  private journalFile(id: string): string {
    return join(this.directory, `${id}.journal`)
  }

  private async readManifestEntries(): Promise<ManifestEntry[]> {
    try {
      const raw = JSON.parse(await readFile(this.manifestFile, 'utf-8')) as unknown
      if (!raw || typeof raw !== 'object') return []
      const drafts = (raw as { drafts?: unknown }).drafts
      if (!Array.isArray(drafts)) return []
      return drafts.filter(
        (entry): entry is ManifestEntry =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          isDraftId((entry as ManifestEntry).id) &&
          typeof (entry as ManifestEntry).title === 'string'
      )
    } catch {
      return []
    }
  }

  private writeManifest(entries: ManifestEntry[]): Promise<void> {
    const write = this.manifestQueue.then(() =>
      writeFileAtomic(this.manifestFile, JSON.stringify({ version: MANIFEST_VERSION, drafts: entries }, null, 2))
    )
    this.manifestQueue = write.catch(() => undefined)
    return write
  }

  /** Snapshot plus any edits journaled after it. */
  private async readContent(id: string): Promise<string | null> {
    let snapshot: string
    try {
      snapshot = await readFile(this.contentFile(id), 'utf-8')
    } catch {
      return null
    }

    let journalRaw: string
    try {
      journalRaw = await readFile(this.journalFile(id), 'utf-8')
    } catch {
      return snapshot
    }

    const { baseLength, body } = splitJournalHeader(journalRaw)
    // `writeSnapshot` writes the snapshot before removing the journal it superseded; a crash
    // between those two steps leaves a journal whose edits `snapshot` already contains. Its
    // header still names the *pre-edit* length, which the current snapshot no longer has —
    // replaying it here would duplicate every edit it holds, so it is discarded instead.
    if (baseLength !== null && baseLength !== snapshot.length) return snapshot
    return replayJournal(snapshot, body)
  }

  /** Writes the snapshot and drops the journal it superseded. */
  private async writeSnapshot(id: string, content: string): Promise<void> {
    await writeFileAtomic(this.contentFile(id), content)
    await removeIfPresent(this.journalFile(id))
  }

  /**
   * Moves a legacy `drafts.json` into the per-file layout. The old file is deleted only after the
   * new manifest has been written and read back, so an interruption at any point leaves the legacy
   * file intact and the migration simply runs again on the next start.
   */
  private async migrateLegacy(): Promise<void> {
    let legacyRaw: string
    try {
      // An editor that saved with a BOM would otherwise make the file unparsable.
      legacyRaw = stripLeadingBom(await readFile(this.legacyFile, 'utf-8'))
    } catch {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(legacyRaw)
    } catch {
      // Deliberately kept: an unreadable legacy file is still the user's only copy of those
      // drafts, and deleting it would turn a recoverable problem into data loss.
      return
    }

    // A manifest already exists: migration completed earlier and only the unlink was lost.
    if ((await this.readManifestEntries()).length > 0) {
      await removeIfPresent(this.legacyFile)
      return
    }

    const drafts = Array.isArray(parsed) ? parsed.filter(isDraft) : []
    for (const draft of drafts) {
      await writeFileAtomic(this.contentFile(draft.id), draft.content)
    }
    await this.writeManifest(drafts.map(({ id, title }) => ({ id, title })))

    // Confirm the manifest is readable before dropping the only other copy of this data.
    const confirmed = await this.readManifestEntries()
    if (confirmed.length !== drafts.length) return
    await removeIfPresent(this.legacyFile)
  }

  /** Drops interrupted temporary files and content files no longer referenced by the manifest. */
  private async cleanupOrphans(entries: ManifestEntry[]): Promise<void> {
    let names: string[]
    try {
      names = await readdir(this.directory)
    } catch {
      return
    }

    const known = new Set(entries.flatMap((entry) => [`${entry.id}.md`, `${entry.id}.journal`]))
    for (const name of names) {
      if (name === MANIFEST_FILE) continue
      const tracked = (name.endsWith('.md') || name.endsWith('.journal')) && known.has(name)
      if (name.endsWith('.tmp') || !tracked) {
        await removeIfPresent(join(this.directory, name))
      }
    }
  }

  /**
   * Runs migration, recovery and orphan cleanup exactly once.
   *
   * Per-draft queues let operations overlap, so this must not repeat: its cleanup deletes stray
   * `.tmp` files, which would otherwise race a concurrent atomic write on another draft and delete
   * its temporary file between `writeFile` and `rename`.
   */
  private ensureLoaded(): Promise<void> {
    this.loadPromise ??= this.load().then(() => undefined)
    return this.loadPromise
  }

  private async load(): Promise<AutoSaveDraft[]> {
    await mkdir(this.directory, { recursive: true })
    await this.migrateLegacy()

    const entries = await this.readManifestEntries()
    // Stored order is the restore order, so it is claimed before any content is read.
    for (const entry of entries) this.reserveOrder(entry.id)

    const drafts: AutoSaveDraft[] = []
    const surviving: ManifestEntry[] = []
    for (const entry of entries) {
      const content = await this.readContent(entry.id)
      // An entry whose content never landed is an interrupted save, not a recoverable draft.
      if (content === null) continue
      drafts.push({ id: entry.id, title: entry.title, content })
      // Restored drafts are counted, never rejected: text already on disk is the user's, whatever
      // the budget says about writing more of it.
      this.bytes.set(entry.id, draftBytes(content))
      surviving.push(entry)
    }

    if (surviving.length !== entries.length) await this.writeManifest(surviving)
    await this.cleanupOrphans(surviving)

    this.cache = drafts
    return drafts
  }

  /**
   * Applies a change to the shared draft list.
   *
   * Per-draft queues let two drafts write at the same time, so the list itself must never be
   * rebuilt from a copy read before an `await` — the second writer would drop the first one's
   * entry. Every mutation reads `this.cache` at the moment it writes, with no await in between.
   */
  private mutateCache(change: (drafts: AutoSaveDraft[]) => AutoSaveDraft[]): AutoSaveDraft[] {
    const next = change(this.cache ?? [])
    next.sort((a, b) => this.reserveOrder(a.id) - this.reserveOrder(b.id))
    this.cache = next
    return next
  }

  /** Assigns a draft's position the first time it is seen, then always returns that position. */
  private reserveOrder(id: string): number {
    let position = this.order.get(id)
    if (position === undefined) {
      position = this.nextOrder++
      this.order.set(id, position)
    }
    return position
  }

  /**
   * Refuses a write that the machine cannot back, before anything touches the disk.
   *
   * `contentBytes` is what the draft will cost once stored, and `writeBytes` is what this particular
   * write puts on the volume — the whole snapshot when it is rewritten, only the appended edits when
   * it is not. Either check fails whole: the caller is told what was missing and the draft on disk
   * stays exactly as it was.
   */
  private async assertCanPersist(id: string, contentBytes: number, writeBytes: number): Promise<void> {
    let others = 0
    for (const [draftId, size] of this.bytes) if (draftId !== id) others += size
    const required = others + contentBytes
    if (required > this.memoryBudgetBytes) {
      throw new DraftPersistError('memory-budget', required, this.memoryBudgetBytes)
    }

    const free = await this.freeDiskBytes(this.directory)
    const needed = writeBytes + DISK_HEADROOM_BYTES
    if (free !== null && needed > free) throw new DraftPersistError('disk-space', needed, free)
  }

  private manifestEntries(drafts: readonly AutoSaveDraft[]): ManifestEntry[] {
    return drafts.map(({ id, title }) => ({ id, title }))
  }

  private enqueue<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.draftQueues.get(id) ?? Promise.resolve()
    const queued = previous.then(operation, operation)
    const settled = queued.then(() => undefined, () => undefined)
    this.draftQueues.set(id, settled)
    // Drop the entry once its queue is empty, or one map entry survives forever per draft
    // ever seen, even after `removeDraft` retires the id for good.
    void settled.then(() => {
      if (this.draftQueues.get(id) === settled) this.draftQueues.delete(id)
    })
    return queued
  }

  async getDrafts(): Promise<AutoSaveDraft[]> {
    await this.ensureLoaded()
    return this.cache ?? []
  }

  saveDraft(draft: AutoSaveDraft): Promise<void> {
    if (this.retired.has(draft.id)) return Promise.resolve()
    // Claimed before queuing, so position follows the order saves were requested in.
    this.reserveOrder(draft.id)
    return this.enqueue(draft.id, async () => {
      if (this.retired.has(draft.id)) return
      await this.ensureLoaded()

      const bytes = draftBytes(draft.content)
      await this.assertCanPersist(draft.id, bytes, bytes)

      // Content lands before the manifest names it, so the manifest never points at a missing file.
      await this.writeSnapshot(draft.id, draft.content)
      this.bytes.set(draft.id, bytes)

      const previous = (this.cache ?? []).find((item) => item.id === draft.id)
      const next = this.mutateCache((drafts) => {
        const index = drafts.findIndex((item) => item.id === draft.id)
        if (index < 0) return [...drafts, draft]
        const updated = [...drafts]
        updated[index] = draft
        return updated
      })

      if (!previous || previous.title !== draft.title) {
        await this.writeManifest(this.manifestEntries(next))
      }
    })
  }

  /**
   * Records one transaction's edits without rewriting the draft.
   *
   * `expectedLength` is the length the renderer expects afterwards. A mismatch means the two sides
   * disagree about the base text, so nothing is written and the caller is told to send a full
   * snapshot instead — a wrong journal entry would corrupt every later replay.
   */
  appendEdits(
    id: string,
    batches: readonly (readonly DraftEdit[])[],
    expectedLength: number
  ): Promise<AppendEditsOutcome> {
    if (this.retired.has(id)) return Promise.resolve('unknown-draft')
    return this.enqueue(id, async () => {
      if (this.retired.has(id)) return 'unknown-draft'
      await this.ensureLoaded()
      const current = (this.cache ?? []).find((draft) => draft.id === id)
      if (!current) return 'unknown-draft'

      let content: string
      try {
        content = applyDraftEditBatches(current.content, batches)
      } catch {
        return 'out-of-sync'
      }
      if (content.length !== expectedLength) return 'out-of-sync'

      const encoded = encodeJournalEntries(batches)
      const compacting = await this.shouldCompact(id, encoded)
      const contentBytes = draftBytes(content)
      // Compaction rewrites the snapshot; an append only adds the encoded edits.
      await this.assertCanPersist(id, contentBytes, compacting ? contentBytes : draftBytes(encoded))

      if (compacting) await this.writeSnapshot(id, content)
      // One write for the whole batch: a crash can tear the tail, never the middle.
      else if (encoded) await this.appendJournal(id, current.content, encoded)
      this.bytes.set(id, contentBytes)

      this.mutateCache((drafts) =>
        drafts.map((draft) => (draft.id === id ? { ...draft, content } : draft))
      )
      return compacting ? 'compacted' : 'appended'
    })
  }

  /**
   * `baseContent` is the draft content the journal is being appended against — the whole
   * snapshot's content the first time (right after a fresh snapshot or compaction), just this
   * batch's edits every time after. Only the first append after a fresh snapshot stamps a
   * header, so `readContent` can tell a journal apart from one a crash left behind mid-compaction.
   */
  private async appendJournal(id: string, baseContent: string, encoded: string): Promise<void> {
    const journalFile = this.journalFile(id)
    let isFreshJournal: boolean
    try {
      await stat(journalFile)
      isFreshJournal = false
    } catch {
      isFreshJournal = true
    }
    const payload = isFreshJournal ? encodeJournalHeader(baseContent.length) + encoded : encoded
    try {
      await appendFile(journalFile, payload, 'utf-8')
    } catch (err) {
      throw diskSpaceErrorFrom(err, draftBytes(payload)) ?? err
    }
  }

  private async shouldCompact(id: string, encoded: string): Promise<boolean> {
    try {
      const journal = await stat(this.journalFile(id))
      return journal.size + draftBytes(encoded) >= COMPACT_JOURNAL_BYTES
    } catch {
      return false
    }
  }

  removeDraft(id: string): Promise<void> {
    this.retired.add(id)
    return this.enqueue(id, async () => {
      await this.ensureLoaded()
      if (!(this.cache ?? []).some((draft) => draft.id === id)) return

      // Manifest first: a crash before the unlink leaves an orphan file, which load() sweeps up.
      const next = this.mutateCache((drafts) => drafts.filter((draft) => draft.id !== id))
      this.bytes.delete(id)
      this.order.delete(id)
      await this.writeManifest(this.manifestEntries(next))
      await removeIfPresent(this.contentFile(id))
      await removeIfPresent(this.journalFile(id))
    })
  }
}
