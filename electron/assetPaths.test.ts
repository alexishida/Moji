import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assetContentType,
  assetPathFromUrl,
  authorizedAsset,
  isPathWithin,
  isSupportedImage
} from './assetPaths'

const assetUrl = (path: string): string => `moji-asset://local/${encodeURIComponent(path)}`

describe('isPathWithin', () => {
  const parent = resolve(sep, 'documents', 'notes')

  it('accepts the directory itself and anything below it', () => {
    expect(isPathWithin(parent, parent)).toBe(true)
    expect(isPathWithin(parent, join(parent, 'logo.png'))).toBe(true)
    expect(isPathWithin(parent, join(parent, 'images', 'deep', 'logo.png'))).toBe(true)
  })

  it('rejects a parent directory and anything above it', () => {
    expect(isPathWithin(parent, resolve(sep, 'documents'))).toBe(false)
    expect(isPathWithin(parent, resolve(sep))).toBe(false)
  })

  it('rejects a sibling whose name merely starts with the parent name', () => {
    // A plain string prefix check would wrongly accept `notes-private`.
    expect(isPathWithin(parent, resolve(sep, 'documents', 'notes-private', 'secret.png'))).toBe(false)
  })

  it('rejects a traversal that climbs back out of the directory', () => {
    expect(isPathWithin(parent, resolve(parent, '..', '..', 'etc', 'passwd.png'))).toBe(false)
  })
})

describe('assetPathFromUrl', () => {
  it('decodes the percent-encoded path carried by the URL', () => {
    const path = resolve(sep, 'notes', 'my images', 'logo.png')

    expect(assetPathFromUrl(assetUrl(path))).toBe(path)
  })

  it.each([
    ['a different protocol', `file:///${encodeURIComponent('/notes/logo.png')}`],
    ['a different host', `moji-asset://remote/${encodeURIComponent('/notes/logo.png')}`],
    ['an empty path', 'moji-asset://local/'],
    ['an unparsable URL', 'not a url at all']
  ])('returns null for %s', (_case, url) => {
    expect(assetPathFromUrl(url)).toBeNull()
  })

  it('resolves traversal segments instead of passing them through', () => {
    // Normalizing here means `authorizedAsset` compares a real path, never a `..` chain.
    const escaped = assetPathFromUrl(assetUrl(`${resolve(sep, 'notes')}/../secrets/key.png`))

    expect(escaped).toBe(resolve(sep, 'secrets', 'key.png'))
    expect(escaped).not.toContain('..')
  })
})

describe('isSupportedImage / assetContentType', () => {
  it('accepts known image extensions regardless of case', () => {
    expect(isSupportedImage('/notes/logo.PNG')).toBe(true)
    expect(isSupportedImage('/notes/photo.jpeg')).toBe(true)
  })

  it('rejects extensions the protocol must never serve', () => {
    expect(isSupportedImage('/notes/guide.md')).toBe(false)
    expect(isSupportedImage('/notes/settings.json')).toBe(false)
    expect(isSupportedImage('/notes/logo')).toBe(false)
  })

  it('maps each served extension to its media type and falls back for the rest', () => {
    expect(assetContentType('/a/logo.PNG')).toBe('image/png')
    expect(assetContentType('/a/photo.jpg')).toBe('image/jpeg')
    expect(assetContentType('/a/icon.svg')).toBe('image/svg+xml')
    expect(assetContentType('/a/guide.md')).toBe('application/octet-stream')
  })
})

describe('authorizedAsset', () => {
  let root = ''
  let allowed = ''
  let outside = ''

  beforeAll(async () => {
    // `authorizedAsset` resolves through `realpath`, and on macOS the temp directory is
    // itself a symlink (/var -> /private/var). Resolve it here so the expectations
    // compare against the same path the implementation returns.
    root = await realpath(await mkdtemp(join(tmpdir(), 'moji-assets-')))
    allowed = join(root, 'allowed')
    outside = join(root, 'outside')
    await mkdir(join(allowed, 'images'), { recursive: true })
    await mkdir(outside, { recursive: true })
    await writeFile(join(allowed, 'logo.png'), 'png-bytes', 'utf-8')
    await writeFile(join(allowed, 'images', 'nested.png'), 'nested', 'utf-8')
    await writeFile(join(allowed, 'guide.md'), '# secret notes', 'utf-8')
    await writeFile(join(outside, 'private.png'), 'private', 'utf-8')
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('authorizes an image inside an allowed directory and reports its metadata', async () => {
    await expect(authorizedAsset(join(allowed, 'logo.png'), [allowed])).resolves.toMatchObject({
      path: join(allowed, 'logo.png'),
      size: 'png-bytes'.length
    })
  })

  it('authorizes an image nested below an allowed directory', async () => {
    await expect(authorizedAsset(join(allowed, 'images', 'nested.png'), [allowed])).resolves.not.toBeNull()
  })

  it('refuses an image that sits outside every allowed directory', async () => {
    await expect(authorizedAsset(join(outside, 'private.png'), [allowed])).resolves.toBeNull()
  })

  it('refuses a non-image even inside an allowed directory', async () => {
    // Otherwise the protocol would hand the renderer arbitrary readable files.
    await expect(authorizedAsset(join(allowed, 'guide.md'), [allowed])).resolves.toBeNull()
  })

  it('refuses a relative path', async () => {
    await expect(authorizedAsset('images/logo.png', [allowed])).resolves.toBeNull()
  })

  it('refuses a directory that happens to end in an image extension', async () => {
    const directory = join(allowed, 'trap.png')
    await mkdir(directory, { recursive: true })

    await expect(authorizedAsset(directory, [allowed])).resolves.toBeNull()
  })

  it('refuses a missing file', async () => {
    await expect(authorizedAsset(join(allowed, 'ghost.png'), [allowed])).resolves.toBeNull()
  })

  it('refuses everything when no directory has been allowed yet', async () => {
    await expect(authorizedAsset(join(allowed, 'logo.png'), [])).resolves.toBeNull()
  })

  it('refuses a symlink inside an allowed directory that points outside it', async (context) => {
    // The decisive case: the requested path looks contained, but the file it resolves to is not.
    const link = join(allowed, 'escape')
    try {
      await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      // Unprivileged Windows without Developer Mode cannot create links. Skip loudly rather than
      // passing without asserting anything.
      context.skip('link creation is not permitted on this machine')
      return
    }

    await expect(authorizedAsset(join(link, 'private.png'), [allowed])).resolves.toBeNull()
  })
})
