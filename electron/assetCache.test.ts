import { describe, expect, it } from 'vitest'
import { AssetCache } from './assetCache'

describe('AssetCache', () => {
  it('reuses bytes when path, size and mtime match', async () => {
    let reads = 0
    const cache = new AssetCache(async () => {
      reads += 1
      return Buffer.from('first')
    })
    const metadata = { size: 5, mtimeMs: 100 }

    await expect(cache.read('/image.png', metadata)).resolves.toEqual(Buffer.from('first'))
    await expect(cache.read('/image.png', metadata)).resolves.toEqual(Buffer.from('first'))

    expect(reads).toBe(1)
  })

  it('invalidates bytes when external metadata changes', async () => {
    let version = 0
    const cache = new AssetCache(async () => Buffer.from(`image-${++version}`))

    await expect(cache.read('/image.png', { size: 7, mtimeMs: 100 })).resolves.toEqual(Buffer.from('image-1'))
    await expect(cache.read('/image.png', { size: 8, mtimeMs: 101 })).resolves.toEqual(Buffer.from('image-2'))
  })

  it('evicts least-recently-used bytes inside its budget', async () => {
    let reads = 0
    const cache = new AssetCache(async (path) => {
      reads += 1
      return Buffer.from(path)
    }, 4, 2)

    await cache.read('a', { size: 1, mtimeMs: 1 })
    await cache.read('b', { size: 1, mtimeMs: 1 })
    await cache.read('a', { size: 1, mtimeMs: 1 })
    await cache.read('c', { size: 1, mtimeMs: 1 })
    await cache.read('b', { size: 1, mtimeMs: 1 })

    expect(reads).toBe(4)
  })
})
