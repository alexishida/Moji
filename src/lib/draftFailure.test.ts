import { describe, expect, it } from 'vitest'
import { draftFailureNotice, formatBytes } from './draftFailure'

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [12 * 1024 * 1024, '12 MB'],
    [3.5 * 1024 * 1024 * 1024, '3.5 GB']
  ])('renders %d bytes as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})

describe('draftFailureNotice', () => {
  it('names the missing memory instead of showing an error code', () => {
    expect(
      draftFailureNotice({ problem: { reason: 'memory-budget', requiredBytes: 600 * 1024 * 1024, availableBytes: 128 * 1024 * 1024 } })
    ).toEqual({ key: 'notice.autoSaveOverMemoryBudget', params: { required: '600 MB', available: '128 MB' } })
  })

  it('names the missing disk space', () => {
    expect(
      draftFailureNotice({ problem: { reason: 'disk-space', requiredBytes: 34 * 1024 * 1024, availableBytes: 1024 } })
    ).toEqual({ key: 'notice.autoSaveNoDiskSpace', params: { required: '34 MB', available: '1 KB' } })
  })

  it('falls back to the raw message for a failure that is not about capacity', () => {
    expect(draftFailureNotice({ error: 'EACCES' })).toEqual({ key: 'notice.autoSaveFailed', params: { error: 'EACCES' } })
  })
})
