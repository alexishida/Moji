import { constants as fsConstants } from 'node:fs'
import { copyFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { isMarkdown, sanitizeFileNameComponent } from './ipcInput'
import { isPathWithin } from './assetPaths'
import {
  EXPLORER_MAX_DEPTH,
  EXPLORER_MAX_FILES,
  type ExplorerFileResult,
  type ExplorerNode,
  type ExplorerScanResult,
  type ExplorerTransferMode,
  type ExplorerTransferResult
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
  return renameMarkdownFile(source, name)
}

/**
 * Renames an already-authorized Markdown file (`source` must have been checked by the caller)
 * within its own folder, refusing to replace another file.
 */
export async function renameMarkdownFile(source: string, name: unknown): Promise<ExplorerFileResult> {
  const fileName = explorerFileName(name)
  if (!fileName) return { ok: false, error: 'invalid-name' }
  const target = join(dirname(source), fileName)
  if (target === source) return { ok: true, path: source }
  try {
    // A case-only rename on a case-insensitive disk is the same file, not a collision.
    if (!sameFile(target, source) && (await pathExists(target))) return { ok: false, error: 'exists' }
    await rename(source, target)
    return { ok: true, path: target }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** What an explorer path resolved to: a Markdown file, or a folder strictly inside a loaded root. */
export interface ExplorerEntry {
  path: string
  kind: 'file' | 'directory'
  /** True when the folder is a loaded root, or contains one (nested roots). */
  containsRoot: boolean
}

/** Resolves a Markdown file or a folder inside one of `roots`, resolving links on both sides. */
export async function resolveExplorerEntry(target: unknown, roots: Iterable<string>): Promise<ExplorerEntry | null> {
  if (typeof target !== 'string' || target.length === 0) return null
  const rootList = [...roots]
  const file = await resolveExplorerFile(target, rootList)
  if (file) return { path: file, kind: 'file', containsRoot: false }
  const directory = await resolveExplorerDirectory(target, rootList)
  if (!directory) return null
  const real = await realpath(directory)
  let containsRoot = false
  for (const root of rootList) {
    try {
      // Deleting `A/B` would also delete a root loaded at `A/B/C`.
      if (isPathWithin(real, await realpath(root))) containsRoot = true
    } catch {
      // Ignore roots that disappeared.
    }
  }
  return { path: directory, kind: 'directory', containsRoot }
}

/**
 * Whether the explorer actually lists this folder: hidden folders (`.git`), skipped ones
 * (`node_modules`) and folders without Markdown are never shown, so they can never be the target
 * of an explorer delete either.
 */
export function isListedExplorerDirectory(directory: string, roots: Iterable<string>): boolean {
  for (const root of roots) {
    const rel = relative(resolve(root), resolve(directory))
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue
    const parts = rel.split(/[\\/]/)
    if (parts.every((part) => part.length > 0 && !part.startsWith('.') && !SKIPPED_DIRECTORIES.has(part))) return true
  }
  return false
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** `notes.md` -> `notes copy.md`, then `notes copy 2.md`, ... — the first name not taken in `directory`. */
export async function uniqueCopyPath(directory: string, fileName: string): Promise<string> {
  const extension = extname(fileName)
  const stem = fileName.slice(0, fileName.length - extension.length)
  for (let attempt = 1; attempt < 1000; attempt += 1) {
    const candidate = join(directory, `${stem} copy${attempt === 1 ? '' : ` ${attempt}`}${extension}`)
    if (!(await pathExists(candidate))) return candidate
  }
  throw new Error('No free name for the copy.')
}

/**
 * Copies or moves Markdown files into a folder of the explorer.
 *
 * Copies never overwrite: a name that is taken gets a ` copy` suffix, like a duplicate in the OS
 * file manager. Moves refuse to replace an existing file instead, since silently renaming a file
 * the user moved would be surprising. Every file is handled independently, so one failure does
 * not undo the others.
 */
export async function transferExplorerFiles(
  sources: unknown,
  targetDirectory: unknown,
  mode: unknown,
  roots: Iterable<string>
): Promise<ExplorerTransferResult> {
  if (!Array.isArray(sources) || (mode !== 'copy' && mode !== 'move')) return { ok: false, error: 'invalid' }
  const rootList = [...roots]
  const folder = await resolveExplorerDirectory(targetDirectory, rootList)
  if (!folder) return { ok: false, error: 'forbidden' }
  const transferMode: ExplorerTransferMode = mode
  const moved: Array<{ from: string; to: string }> = []
  const errors: string[] = []

  for (const source of sources.slice(0, 500)) {
    const file = await resolveExplorerFile(source, rootList)
    if (!file) {
      errors.push('forbidden')
      continue
    }
    try {
      if (transferMode === 'copy') {
        const target = await uniqueCopyPath(folder, basename(file))
        await copyFile(file, target, fsConstants.COPYFILE_EXCL)
        moved.push({ from: file, to: target })
        continue
      }
      const target = join(folder, basename(file))
      if (resolve(dirname(file)) === resolve(folder)) continue
      if (await pathExists(target)) {
        errors.push('exists')
        continue
      }
      try {
        await rename(file, target)
      } catch (err) {
        // Across drives `rename` cannot move; copy then remove the original instead.
        if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
        await copyFile(file, target, fsConstants.COPYFILE_EXCL)
        await unlink(file)
      }
      moved.push({ from: file, to: target })
    } catch (err) {
      errors.push((err as Error).message)
    }
  }
  return { ok: true, moved, errors }
}
