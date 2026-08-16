export interface AssetMetadata {
  size: number
  mtimeMs: number
}

type ReadAssetFile = (path: string) => Promise<Buffer>

interface CacheEntry extends AssetMetadata {
  bytes: Buffer
}

/**
 * Bounded LRU cache. Callers stat an asset before each lookup, so changed files
 * naturally miss the cache and replace their previous bytes.
 */
export class AssetCache {
  private readonly entries = new Map<string, CacheEntry>()
  private usedBytes = 0

  constructor(
    private readonly readFile: ReadAssetFile,
    private readonly maxBytes = 64 * 1024 * 1024,
    private readonly maxEntries = 128
  ) {}

  async read(path: string, metadata: AssetMetadata): Promise<Buffer> {
    const cached = this.entries.get(path)
    if (cached && cached.size === metadata.size && cached.mtimeMs === metadata.mtimeMs) {
      this.entries.delete(path)
      this.entries.set(path, cached)
      return cached.bytes
    }

    if (cached) this.delete(path)
    const bytes = await this.readFile(path)
    if (bytes.length <= this.maxBytes) this.store(path, { ...metadata, bytes })
    return bytes
  }

  private store(path: string, entry: CacheEntry): void {
    while (this.entries.size >= this.maxEntries || this.usedBytes + entry.bytes.length > this.maxBytes) {
      const oldestPath = this.entries.keys().next().value as string | undefined
      if (!oldestPath) return
      this.delete(oldestPath)
    }
    this.entries.set(path, entry)
    this.usedBytes += entry.bytes.length
  }

  private delete(path: string): void {
    const entry = this.entries.get(path)
    if (!entry) return
    this.entries.delete(path)
    this.usedBytes -= entry.bytes.length
  }
}
