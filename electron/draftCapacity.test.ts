import { describe, expect, it } from 'vitest'
import {
  defaultMemoryBudgetBytes,
  diskSpaceErrorFrom,
  DraftPersistError,
  draftBytes,
  freeDiskBytes,
  isDraftPersistError,
  MIN_DRAFT_MEMORY_BUDGET_BYTES
} from './draftCapacity'

describe('draftBytes', () => {
  it('measures what the draft costs on disk, not its character count', () => {
    expect(draftBytes('abc')).toBe(3)
    expect(draftBytes('café')).toBe(5)
    expect(draftBytes('日本語')).toBe(9)
    expect(draftBytes('🙂')).toBe(4)
  })
})

describe('defaultMemoryBudgetBytes', () => {
  it('never drops below the floor, so a small heap still allows large drafts', () => {
    expect(defaultMemoryBudgetBytes()).toBeGreaterThanOrEqual(MIN_DRAFT_MEMORY_BUDGET_BYTES)
    // The floor is well past the 10 MB the old character cap allowed.
    expect(MIN_DRAFT_MEMORY_BUDGET_BYTES).toBeGreaterThan(10 * 1024 * 1024)
  })
})

describe('freeDiskBytes', () => {
  it('reports free space for a real directory', async () => {
    await expect(freeDiskBytes(process.cwd())).resolves.toBeGreaterThan(0)
  })

  it('answers null instead of throwing when the volume cannot be measured', async () => {
    await expect(freeDiskBytes('/definitely/not/a/directory/here')).resolves.toBeNull()
  })
})

describe('diskSpaceErrorFrom', () => {
  it.each(['ENOSPC', 'EDQUOT', 'EFBIG'])('translates %s into a refusal the renderer can explain', (code) => {
    const translated = diskSpaceErrorFrom(Object.assign(new Error('write failed'), { code }), 4096)
    expect(translated?.problem).toEqual({ reason: 'disk-space', requiredBytes: 4096, availableBytes: 0 })
  })

  it('leaves an unrelated failure alone', () => {
    expect(diskSpaceErrorFrom(Object.assign(new Error('nope'), { code: 'EACCES' }), 1)).toBeNull()
    expect(diskSpaceErrorFrom(new Error('nope'), 1)).toBeNull()
  })
})

describe('isDraftPersistError', () => {
  it('separates a capacity refusal from any other failure', () => {
    expect(isDraftPersistError(new DraftPersistError('memory-budget', 2, 1))).toBe(true)
    expect(isDraftPersistError(new Error('disk-space'))).toBe(false)
  })
})
