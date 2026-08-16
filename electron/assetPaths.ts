import { realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import type { AssetMetadata } from './assetCache'

/**
 * Authorization for the `moji-asset://` protocol.
 *
 * The renderer can ask for any URL, so every request is treated as untrusted input: the path is
 * decoded, resolved, and only served when it is a real image file inside a directory the main
 * process explicitly opened. Resolution happens through `realpath`, so a symlink cannot be used
 * to step outside an allowed directory.
 */

export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.avif', '.bmp', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp'
])

export interface AuthorizedAsset extends AssetMetadata {
  path: string
}

export function isSupportedImage(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase())
}

/**
 * True when `candidate` is `parent` itself or sits below it.
 *
 * `relative` is the reliable test here: a candidate outside `parent` produces either a path that
 * escapes upwards (`..`) or, on Windows, an absolute path when the two live on different drives.
 */
export function isPathWithin(parent: string, candidate: string): boolean {
  const pathRelative = relative(parent, candidate)
  return pathRelative === ''
    || (!pathRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
      && pathRelative !== '..'
      && !isAbsolute(pathRelative))
}

/** Decodes the file path carried by a `moji-asset://local/...` URL. */
export function assetPathFromUrl(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl)
    if (url.protocol !== 'moji-asset:' || url.hostname !== 'local') return null
    const encodedPath = url.pathname.slice(1)
    return encodedPath ? resolve(decodeURIComponent(encodedPath)) : null
  } catch {
    return null
  }
}

export function assetContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.avif': return 'image/avif'
    case '.bmp': return 'image/bmp'
    case '.gif': return 'image/gif'
    case '.ico': return 'image/x-icon'
    case '.jpeg':
    case '.jpg': return 'image/jpeg'
    case '.png': return 'image/png'
    case '.svg': return 'image/svg+xml'
    case '.webp': return 'image/webp'
    default: return 'application/octet-stream'
  }
}

/**
 * Resolves an asset request to a real file, or `null` when it must not be served.
 *
 * Both the asset and each allowed directory go through `realpath` before being compared, so the
 * check is made on the true location of the file rather than on the path the renderer supplied.
 */
export async function authorizedAsset(
  filePath: string,
  allowedDirectories: Iterable<string>
): Promise<AuthorizedAsset | null> {
  if (!isAbsolute(filePath) || !isSupportedImage(filePath)) return null
  try {
    const [assetPath, assetStat] = await Promise.all([realpath(filePath), stat(filePath)])
    if (!assetStat.isFile()) return null
    for (const assetDirectory of allowedDirectories) {
      if (isPathWithin(await realpath(assetDirectory), assetPath)) {
        return { path: assetPath, size: assetStat.size, mtimeMs: assetStat.mtimeMs }
      }
    }
    return null
  } catch {
    return null
  }
}
