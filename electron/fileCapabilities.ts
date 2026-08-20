import { dirname, resolve } from 'node:path'

function capabilityPath(filePath: string): string {
  const resolved = resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * What the renderer is allowed to touch on disk.
 *
 * The renderer names a path and the main process acts on it, so without a record of which
 * paths the user actually chose, "is it Markdown?" is the only thing standing between a
 * compromised renderer and every `.md` file on the machine — and reading one was enough to
 * authorise its whole directory for image loads.
 *
 * A capability is granted only where a person or the operating system supplied the path:
 * the open dialog, the save dialog, the command line, a file association, a drop. Anything
 * arriving over IPC is checked against that record rather than trusted for its extension.
 */
export class FileCapabilities {
  private readonly files = new Set<string>()
  private readonly assetDirectories = new Set<string>()

  /**
   * Record a path the user chose, and return it resolved.
   *
   * The document's own directory becomes readable for assets, because that is what makes a
   * relative image reference in the document work.
   */
  grant(filePath: string): string {
    const resolved = resolve(filePath)
    this.files.add(capabilityPath(filePath))
    this.assetDirectories.add(dirname(resolved))
    return resolved
  }

  /** True when this exact file was granted. Symlinks are resolved by the caller. */
  allows(filePath: unknown): filePath is string {
    return typeof filePath === 'string' && this.files.has(capabilityPath(filePath))
  }

  /** Directories an asset may be read from, for `authorizedAsset`. */
  get directories(): ReadonlySet<string> {
    return this.assetDirectories
  }

  /** Testing seam; the application never revokes a capability while running. */
  clear(): void {
    this.files.clear()
    this.assetDirectories.clear()
  }
}
