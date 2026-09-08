export interface AssetMetadata {
  size: number
  mtimeMs: number
}

type ReadAssetFile = (path: string) => Promise<Buffer>

interface CacheEntry extends AssetMetadata {
  bytes: Buffer
}

interface PendingRead extends AssetMetadata {
  promise: Promise<Buffer>
}

/**
 * Bounded LRU cache. Callers stat an asset before each lookup, so changed files
 * naturally miss the cache and replace their previous bytes.
 */
export class AssetCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly pendingReads = new Map<string, PendingRead>()
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
    const pending = this.pendingReads.get(path)
    if (pending && pending.size === metadata.size && pending.mtimeMs === metadata.mtimeMs) {
      return pending.promise
    }

    const read = { ...metadata, promise: this.readFile(path) }
    this.pendingReads.set(path, read)
    try {
      const bytes = await read.promise
      // A slower read of an older version must not replace the latest cached bytes.
      if (this.pendingReads.get(path) === read && bytes.length === metadata.size && bytes.length <= this.maxBytes) {
        this.store(path, { ...metadata, bytes })
      }
      return bytes
    } finally {
      if (this.pendingReads.get(path) === read) this.pendingReads.delete(path)
    }
  }

  private store(path: string, entry: CacheEntry): void {
    this.delete(path)
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
