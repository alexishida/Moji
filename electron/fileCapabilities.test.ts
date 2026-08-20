import { describe, expect, it } from 'vitest'
import { join, resolve, sep } from 'node:path'
import { FileCapabilities } from './fileCapabilities'

describe('FileCapabilities', () => {
  it('allows exactly the file that was granted', () => {
    const capabilities = new FileCapabilities()
    const granted = capabilities.grant(join('docs', 'notes.md'))

    expect(capabilities.allows(granted)).toBe(true)
    expect(capabilities.allows(join('docs', 'other.md'))).toBe(false)
  })

  it('refuses a neighbouring file in a directory opened for assets', () => {
    const capabilities = new FileCapabilities()
    capabilities.grant(join('docs', 'notes.md'))

    // Granting a document opens its directory for images, not for reading other documents.
    expect(capabilities.directories.has(resolve('docs'))).toBe(true)
    expect(capabilities.allows(join('docs', 'secrets.md'))).toBe(false)
  })

  it('compares resolved paths, so a detour through the parent directory changes nothing', () => {
    const capabilities = new FileCapabilities()
    capabilities.grant(join('docs', 'notes.md'))

    expect(capabilities.allows(join('docs', 'nested', '..', 'notes.md'))).toBe(true)
    expect(capabilities.allows(join('docs', '..', 'notes.md'))).toBe(false)
  })

  it.runIf(process.platform === 'win32')('allows case variants on Windows', () => {
    const capabilities = new FileCapabilities()
    capabilities.grant(join('Docs', 'Notes.md'))

    expect(capabilities.allows(join('docs', 'notes.MD'))).toBe(true)
  })

  it('refuses anything that is not a string', () => {
    const capabilities = new FileCapabilities()
    capabilities.grant(join('docs', 'notes.md'))

    expect(capabilities.allows(undefined)).toBe(false)
    expect(capabilities.allows(null)).toBe(false)
    expect(capabilities.allows(42)).toBe(false)
    expect(capabilities.allows({ toString: () => resolve('docs', 'notes.md') })).toBe(false)
  })

  it('grants nothing by default, so an untouched session can reach no file', () => {
    const capabilities = new FileCapabilities()

    expect(capabilities.allows(join('docs', 'notes.md'))).toBe(false)
    expect(capabilities.directories.size).toBe(0)
  })

  it('accumulates directories as documents are opened', () => {
    const capabilities = new FileCapabilities()
    capabilities.grant(join(`${sep}one`, 'a.md'))
    capabilities.grant(join(`${sep}two`, 'b.md'))

    expect(capabilities.directories.size).toBe(2)
    expect(capabilities.allows(join(`${sep}one`, 'a.md'))).toBe(true)
    expect(capabilities.allows(join(`${sep}two`, 'b.md'))).toBe(true)
  })
})
