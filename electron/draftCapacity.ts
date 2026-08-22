import { statfs } from 'node:fs/promises'
import { getHeapStatistics } from 'node:v8'
import type { DraftPersistProblem, DraftPersistReason } from './shared'

/**
 * What a draft is allowed to cost.
 *
 * Drafts used to be capped at 10 million characters, a number that matched nothing about the
 * machine: it rejected text that would have saved fine and accepted text that would not. The cap is
 * gone, and what remains are the two resources that can actually run out — the memory the main
 * process spends holding drafts, and the free space on the volume that stores them. Both are
 * measured in bytes at the moment of the write, and a write that does not fit is refused whole.
 * Nothing is ever shortened to make it fit.
 */

/** Share of the V8 heap limit that all drafts together may occupy in the main process. */
export const DRAFT_MEMORY_BUDGET_FRACTION = 0.25

/** Floor for the budget above, so a small heap still allows drafts far past the old 10 MB cap. */
export const MIN_DRAFT_MEMORY_BUDGET_BYTES = 128 * 1024 * 1024

/**
 * Free space never spent on a draft. An atomic write needs room for the temporary copy while the
 * previous file is still there, and filling the volume to the last byte breaks far more than
 * autosave.
 */
export const DISK_HEADROOM_BYTES = 32 * 1024 * 1024

/** Refusal to write, carrying the numbers that produced it. */
export class DraftPersistError extends Error {
  readonly problem: DraftPersistProblem

  constructor(reason: DraftPersistReason, requiredBytes: number, availableBytes: number) {
    super(`draft needs ${requiredBytes} bytes, ${availableBytes} available (${reason})`)
    this.name = 'DraftPersistError'
    this.problem = { reason, requiredBytes, availableBytes }
  }
}

export function isDraftPersistError(value: unknown): value is DraftPersistError {
  return value instanceof DraftPersistError
}

/**
 * Bytes a draft costs.
 *
 * UTF-8 length is used for both resources: it is exactly what the file takes on disk, and it is at
 * or above what V8 spends on the string in memory — one-byte strings cost a byte per character,
 * and every character that V8 stores in two bytes needs two or more in UTF-8.
 */
export function draftBytes(content: string): number {
  return Buffer.byteLength(content, 'utf-8')
}

export function defaultMemoryBudgetBytes(): number {
  return Math.max(MIN_DRAFT_MEMORY_BUDGET_BYTES, Math.floor(getHeapStatistics().heap_size_limit * DRAFT_MEMORY_BUDGET_FRACTION))
}

/** Free bytes on the volume holding `directory`, or `null` where the platform cannot report it. */
export async function freeDiskBytes(directory: string): Promise<number | null> {
  try {
    const stats = await statfs(directory)
    return Number(stats.bavail) * Number(stats.bsize)
  } catch {
    // An unknown amount of space is not a reason to refuse a save: the write itself still fails
    // loudly if the volume is full, and that path is translated below.
    return null
  }
}

/**
 * Turns an out-of-space write failure into the same refusal the pre-check would have produced.
 *
 * The check runs before the write, so a volume that fills in between still reaches this path, as do
 * quota limits that free-space numbers never show.
 */
export function diskSpaceErrorFrom(error: unknown, requiredBytes: number): DraftPersistError | null {
  const code = (error as NodeJS.ErrnoException | null)?.code
  if (code !== 'ENOSPC' && code !== 'EDQUOT' && code !== 'EFBIG') return null
  return new DraftPersistError('disk-space', requiredBytes, 0)
}
