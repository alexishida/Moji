import { readdir, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { isMarkdown, sanitizeFileNameComponent } from './ipcInput'
import { isPathWithin } from './assetPaths'
import {
  EXPLORER_MAX_DEPTH,
  EXPLORER_MAX_FILES,
  type ExplorerFileResult,
  type ExplorerNode,
  type ExplorerScanResult
} from './shared'

/** Directories that never hold documents worth browsing and can be enormous. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', '__pycache__', '$RECYCLE.BIN', 'System Volume Information'])

function compareNodes(a: ExplorerNode, b: ExplorerNode): number {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

interface ScanBudget {
  files: number
  truncated: boolean
}

/**
 * Lists one directory, keeping only Markdown files and the subdirectories that (eventually)
 * contain one. Hidden entries and symlinks are skipped: hidden folders are mostly tooling
 * (`.git`, `.cache`), and following links could leave the folder the user picked or loop.
 */
async function scanDirectory(directory: string, depth: number, budget: ScanBudget): Promise<ExplorerNode[]> {
  if (depth > EXPLORER_MAX_DEPTH) {
    budget.truncated = true
    return []
  }
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    // An unreadable subfolder (permissions, a share gone offline) must not hide its siblings.
    return []
  }

  const nodes: ExplorerNode[] = []
  for (const entry of entries) {
    if (budget.files >= EXPLORER_MAX_FILES) {
      budget.truncated = true
      break
    }
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue
      const children = await scanDirectory(entryPath, depth + 1, budget)
      if (children.length > 0) nodes.push({ name: entry.name, path: entryPath, kind: 'directory', children })
    } else if (entry.isFile() && isMarkdown(entry.name)) {
      budget.files += 1
      nodes.push({ name: entry.name, path: entryPath, kind: 'file' })
    }
  }
  return nodes.sort(compareNodes)
}

/** Builds the Markdown-only tree for a folder the user chose. */
export async function scanExplorerFolder(folderPath: string): Promise<ExplorerScanResult> {
  const root = resolve(folderPath)
  try {
    const rootStat = await stat(root)
    if (!rootStat.isDirectory()) return { ok: false, path: root, error: 'ENOTDIR' }
  } catch (err) {
    return { ok: false, path: root, error: (err as Error).message }
  }
  const budget: ScanBudget = { files: 0, truncated: false }
  const children = await scanDirectory(root, 0, budget)
  return {
    ok: true,
    root: { name: basename(root) || root, path: root, kind: 'directory', children },
    fileCount: budget.files,
    truncated: budget.truncated
  }
}

/**
 * Resolves `filePath` only when it is a real Markdown file inside one of `roots`.
 *
 * Both sides go through `realpath`, so a link inside an opened folder cannot be used to reach a
 * file outside it.
 */
export async function resolveExplorerFile(filePath: unknown, roots: Iterable<string>): Promise<string | null> {
  if (!isMarkdown(filePath)) return null
  try {
    const [candidate, candidateStat] = await Promise.all([realpath(filePath), stat(filePath)])
    if (!candidateStat.isFile() || !isMarkdown(candidate)) return null
    for (const root of roots) {
      try {
        if (isPathWithin(await realpath(root), candidate)) return resolve(filePath)
      } catch {
        // A folder that disappeared must not hide the grants that follow it.
      }
    }
    return null
  } catch {
    return null
  }
}

/** Resolves `directory` only when it is a real folder inside (or equal to) one of `roots`. */
export async function resolveExplorerDirectory(directory: unknown, roots: Iterable<string>): Promise<string | null> {
  if (typeof directory !== 'string' || directory.length === 0) return null
  try {
    const [candidate, candidateStat] = await Promise.all([realpath(directory), stat(directory)])
    if (!candidateStat.isDirectory()) return null
    for (const root of roots) {
      try {
        if (isPathWithin(await realpath(root), candidate)) return resolve(directory)
      } catch {
        // A folder that disappeared must not hide the grants that follow it.
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Turns what the user typed into a Markdown file name, or `null` when nothing usable is left.
 *
 * A name with a path separator, or one starting with a dot, is refused rather than silently
 * rewritten: the first would be reshaped into something the user never typed, the second would be
 * a hidden file the explorer itself does not list. A missing Markdown extension becomes `.md`.
 */
export function explorerFileName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (/[\\/]/.test(trimmed) || trimmed.startsWith('.')) return null
  const name = sanitizeFileNameComponent(trimmed)
  if (!name || name === '.md' || name === '.markdown') return null
  return isMarkdown(name) ? name : `${name}.md`
}

function sameFile(a: string, b: string): boolean {
  return process.platform === 'win32' || process.platform === 'darwin' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** Creates an empty Markdown file inside an explorer folder, never overwriting one that exists. */
export async function createExplorerFile(directory: unknown, name: unknown, roots: Iterable<string>): Promise<ExplorerFileResult> {
  const folder = await resolveExplorerDirectory(directory, roots)
  if (!folder) return { ok: false, error: 'forbidden' }
  const fileName = explorerFileName(name)
  if (!fileName) return { ok: false, error: 'invalid-name' }
  const target = join(folder, fileName)
  try {
    // `wx` fails with EEXIST instead of truncating a file the user already has.
    await writeFile(target, '', { encoding: 'utf-8', flag: 'wx' })
    return { ok: true, path: target }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    return { ok: false, error: code === 'EEXIST' ? 'exists' : (err as Error).message }
  }
}

/** Renames a Markdown file inside its own folder. Moving it elsewhere is not possible by design. */
export async function renameExplorerFile(filePath: unknown, name: unknown, roots: Iterable<string>): Promise<ExplorerFileResult> {
  const source = await resolveExplorerFile(filePath, roots)
  if (!source) return { ok: false, error: 'forbidden' }
  const fileName = explorerFileName(name)
  if (!fileName) return { ok: false, error: 'invalid-name' }
  const target = join(dirname(source), fileName)
  if (target === source) return { ok: true, path: source }
  try {
    // A case-only rename on a case-insensitive disk is the same file, not a collision.
    if (!sameFile(target, source)) {
      try {
        await stat(target)
        return { ok: false, error: 'exists' }
      } catch {
        // Target is free.
      }
    }
    await rename(source, target)
    return { ok: true, path: target }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
