import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconChevronRight,
  IconCollapseAll,
  IconFilePlus,
  IconFileText,
  IconFolder,
  IconFolderPlus,
  IconPencil,
  IconRefresh,
  IconX
} from './icons'
import { ContextMenu, revealInOsLabelKey, shortcutLabel, type ContextMenuItem } from './ContextMenu'
import type { ExplorerNode, ExplorerScanResult, ExplorerTransferMode } from '../../electron/shared'

/** `null` on success, otherwise an error code (`exists`, `invalid-name`, `forbidden`, or a message). */
export type ExplorerActionResult = string | null

/** Asks the explorer to do something on behalf of another part of the app (e.g. a tab menu). */
export interface ExplorerRequest {
  kind: 'reveal' | 'rename'
  path: string
  /** Increments per request so repeating the same one still triggers. */
  id: number
}

interface ExplorerProps {
  folders: string[]
  /** Path of the active document, highlighted when it lives in a loaded folder. */
  activePath: string | null
  /** Paths of every open document; marks which explorer files are already in a tab. */
  openPaths: string[]
  request: ExplorerRequest | null
  /** Called once `request` has been carried out (or cannot be), so it is never replayed. */
  onRequestHandled: () => void
  onAddFolder: () => void
  onRemoveFolder: (path: string) => void
  onOpenFile: (path: string, mode?: 'view' | 'edit') => void
  /** Creates `name` inside `directory` and opens it; resolves to an error code or `null`. */
  onCreateFile: (directory: string, name: string) => Promise<ExplorerActionResult>
  /** Renames `path` to `name` in its own folder; resolves to an error code or `null`. */
  onRenameFile: (path: string, name: string) => Promise<ExplorerActionResult>
  /** Copies or moves files into `directory`; resolves to an error code or `null`. */
  onTransfer: (sources: string[], directory: string, mode: ExplorerTransferMode) => Promise<ExplorerActionResult>
  /** Moves entries to the OS trash after confirmation. Resolves to `true` when anything was removed. */
  onDelete: (paths: string[]) => Promise<boolean>
  onRevealInOs: (path: string) => void
  onOpenWithDefaultApp: (path: string) => void
  onCopyText: (text: string) => void
}

/** Inline name field: a new file being named inside `directory`, or an existing file being renamed. */
type Draft =
  | { kind: 'create'; directory: string }
  | { kind: 'rename'; path: string; name: string }

interface MenuState {
  x: number
  y: number
  kind: 'file' | 'directory' | 'root' | 'blank'
  path: string
  name: string
}

interface Clipboard {
  mode: ExplorerTransferMode
  paths: string[]
}

interface FlatEntry {
  path: string
  kind: 'file' | 'directory' | 'root'
  name: string
  directory: string
}

const NEW_FILE_NAME = 'Untitled.md'
const DRAG_MIME = 'application/x-moji-explorer'

/** Windows paths compare case-insensitively; everything else exactly. */
function pathKey(path: string): string {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\') ? path.toLowerCase() : path
}

function folderLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function parentOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index > 0 ? path.slice(0, index) : path
}

function relativeTo(root: string, path: string): string {
  if (!path.startsWith(root)) return path
  return path.slice(root.length).replace(/^[\\/]+/, '') || folderLabel(path)
}

function collectDirectories(node: ExplorerNode, acc: string[] = []): string[] {
  for (const child of node.children ?? []) {
    if (child.kind === 'directory') {
      acc.push(child.path)
      collectDirectories(child, acc)
    }
  }
  return acc
}

interface Located {
  /** The entry's path exactly as the scan spells it (case may differ from the lookup key). */
  path: string
  name: string
  kind: 'file' | 'directory'
  /** Folders between a loaded root and the entry, root first. */
  ancestors: string[]
}

/** Finds the listed entry whose path matches `key` (see `pathKey`); `null` when not listed. */
function locate(results: Map<string, ExplorerScanResult>, key: string): Located | null {
  const visit = (node: ExplorerNode, trail: string[]): Located | null => {
    for (const child of node.children ?? []) {
      if (pathKey(child.path) === key) return { path: child.path, name: child.name, kind: child.kind, ancestors: trail }
      if (child.kind === 'directory') {
        const found = visit(child, [...trail, child.path])
        if (found) return found
      }
    }
    return null
  }
  for (const [folder, result] of results) {
    if (!result.ok) continue
    const found = visit(result.root, [folder])
    if (found) return found
  }
  return null
}

function ancestorsOf(results: Map<string, ExplorerScanResult>, key: string): string[] | null {
  return locate(results, key)?.ancestors ?? null
}

/** Every listed path, by kind: what selection and transfers are checked against. */
function listedPaths(results: Map<string, ExplorerScanResult>): { files: Set<string>; directories: Set<string> } {
  const files = new Set<string>()
  const directories = new Set<string>()
  const walk = (node: ExplorerNode): void => {
    for (const child of node.children ?? []) {
      if (child.kind === 'file') files.add(child.path)
      else {
        directories.add(child.path)
        walk(child)
      }
    }
  }
  for (const result of results.values()) if (result.ok) walk(result.root)
  return { files, directories }
}

function rootOf(folders: string[], path: string): string | undefined {
  const key = pathKey(path)
  return folders
    .filter((folder) => key === pathKey(folder) || key.startsWith(pathKey(folder) + '/') || key.startsWith(pathKey(folder) + '\\'))
    .sort((a, b) => b.length - a.length)[0]
}

interface NameInputProps {
  initial: string
  depth: number
  error: string | null
  busy: boolean
  onCommit: (value: string) => void
  onCancel: () => void
  onChange: () => void
}

/** Inline file-name field, VS Code style: Enter commits, Escape cancels, blur commits. */
function NameInput(props: NameInputProps): JSX.Element {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(props.initial)

  useEffect(() => {
    const input = ref.current
    if (!input) return
    input.focus()
    // Select the base name only, so typing replaces "Untitled" but keeps ".md".
    const dot = props.initial.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : props.initial.length)
  }, [props.initial])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    // Keep app-wide shortcuts (Escape closes panels, etc.) from also reacting to this field.
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      props.onCommit(value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      props.onCancel()
    }
  }

  return (
    <li className="explorer-input" style={{ paddingLeft: `${4 + props.depth * 12}px` }}>
      <div className="explorer-input__row">
        <span className="explorer-item__chevron" aria-hidden="true" />
        <IconFileText className="explorer-item__icon" width={15} height={15} />
        <input
          ref={ref}
          className={`explorer-input__field ${props.error ? 'explorer-input__field--error' : ''}`}
          type="text"
          value={value}
          // `readOnly`, not `disabled`: a disabled field drops focus, so a failed name could not be
          // corrected without clicking back into it.
          readOnly={props.busy}
          spellCheck={false}
          aria-label={t('explorer.fileName')}
          aria-invalid={props.error !== null}
          onChange={(event) => {
            setValue(event.target.value)
            props.onChange()
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (props.busy) return
            // Clicking away after an error gives up instead of re-reporting the same error.
            if (props.error) props.onCancel()
            else props.onCommit(value)
          }}
        />
      </div>
      {props.error && <p className="explorer-input__error" role="alert">{props.error}</p>}
    </li>
  )
}

interface TreeContext {
  expanded: Set<string>
  activeKey: string | null
  openKeys: Set<string>
  selected: Set<string>
  focusedPath: string | null
  cutKeys: Set<string>
  dropTarget: string | null
  draft: Draft | null
  draftError: string | null
  draftBusy: boolean
  onRowClick: (event: ReactMouseEvent, entry: FlatEntry) => void
  onRowDoubleClick: (entry: FlatEntry) => void
  onContextMenu: (event: ReactMouseEvent, entry: FlatEntry) => void
  onStartRename: (path: string, name: string) => void
  onCommitDraft: (value: string) => void
  onCancelDraft: () => void
  onDraftChange: () => void
  onDragStart: (event: ReactDragEvent, entry: FlatEntry) => void
  onDragEnd: () => void
  onDragOverFolder: (event: ReactDragEvent, directory: string) => void
  onDropOnFolder: (event: ReactDragEvent, directory: string) => void
}

interface TreeProps {
  nodes: ExplorerNode[]
  depth: number
  /** Folder that owns `nodes`; a pending "new file" draft for it renders first in the list. */
  directory: string
  ctx: TreeContext
}

function ExplorerTree({ nodes, depth, directory, ctx }: TreeProps): JSX.Element {
  const { t } = useTranslation()
  const { draft } = ctx
  const creatingHere = draft?.kind === 'create' && draft.directory === directory
  return (
    <ul className="explorer-tree" role="group">
      {creatingHere && (
        <NameInput
          initial={NEW_FILE_NAME}
          depth={depth}
          error={ctx.draftError}
          busy={ctx.draftBusy}
          onCommit={ctx.onCommitDraft}
          onCancel={ctx.onCancelDraft}
          onChange={ctx.onDraftChange}
        />
      )}
      {nodes.map((node) => {
        const indent = { paddingLeft: `${4 + depth * 12}px` }
        const key = pathKey(node.path)
        const stateClasses = [
          ctx.selected.has(node.path) ? 'explorer-item--selected' : '',
          ctx.focusedPath === node.path ? 'explorer-item--focused' : '',
          ctx.cutKeys.has(key) ? 'explorer-item--cut' : ''
        ].join(' ')
        if (node.kind === 'directory') {
          const open = ctx.expanded.has(node.path)
          const entry: FlatEntry = { path: node.path, kind: 'directory', name: node.name, directory: node.path }
          return (
            <li key={node.path} role="treeitem" aria-expanded={open} aria-selected={ctx.selected.has(node.path)}>
              <button
                type="button"
                data-explorer-path={node.path}
                className={`explorer-item explorer-item--dir ${stateClasses} ${ctx.dropTarget === node.path ? 'explorer-item--drop' : ''}`}
                style={indent}
                title={node.path}
                draggable
                onClick={(event) => ctx.onRowClick(event, entry)}
                onContextMenu={(event) => ctx.onContextMenu(event, entry)}
                onDragStart={(event) => ctx.onDragStart(event, entry)}
                onDragEnd={ctx.onDragEnd}
                onDragOver={(event) => ctx.onDragOverFolder(event, node.path)}
                onDrop={(event) => ctx.onDropOnFolder(event, node.path)}
              >
                <span className={`explorer-item__chevron ${open ? 'explorer-item__chevron--open' : ''}`} aria-hidden="true">
                  <IconChevronRight width={14} height={14} />
                </span>
                <IconFolder className="explorer-item__icon" width={15} height={15} />
                <span className="explorer-item__name">{node.name}</span>
              </button>
              {(open || (draft?.kind === 'create' && draft.directory === node.path)) && (
                <ExplorerTree nodes={node.children ?? []} depth={depth + 1} directory={node.path} ctx={ctx} />
              )}
            </li>
          )
        }
        if (draft?.kind === 'rename' && draft.path === node.path) {
          return (
            <NameInput
              key={node.path}
              initial={node.name}
              depth={depth}
              error={ctx.draftError}
              busy={ctx.draftBusy}
              onCommit={ctx.onCommitDraft}
              onCancel={ctx.onCancelDraft}
              onChange={ctx.onDraftChange}
            />
          )
        }
        const active = ctx.activeKey === key
        const isOpen = ctx.openKeys.has(key)
        const entry: FlatEntry = { path: node.path, kind: 'file', name: node.name, directory }
        return (
          <li key={node.path} role="treeitem" aria-selected={ctx.selected.has(node.path)} className="explorer-file">
            <button
              type="button"
              data-explorer-path={node.path}
              className={`explorer-item explorer-item--file ${active ? 'explorer-item--active' : ''} ${stateClasses}`}
              style={indent}
              title={node.path}
              draggable
              onClick={(event) => ctx.onRowClick(event, entry)}
              onDoubleClick={() => ctx.onRowDoubleClick(entry)}
              onContextMenu={(event) => ctx.onContextMenu(event, entry)}
              onDragStart={(event) => ctx.onDragStart(event, entry)}
              onDragEnd={ctx.onDragEnd}
              onDragOver={(event) => ctx.onDragOverFolder(event, directory)}
              onDrop={(event) => ctx.onDropOnFolder(event, directory)}
            >
              <span className="explorer-item__chevron" aria-hidden="true" />
              <IconFileText className="explorer-item__icon" width={15} height={15} />
              <span className="explorer-item__name">{node.name}</span>
              {isOpen && !active && <span className="explorer-item__open-dot" title={t('explorer.openInTab')} aria-label={t('explorer.openInTab')} />}
            </button>
            <button
              type="button"
              className="explorer-item__action"
              onClick={() => ctx.onStartRename(node.path, node.name)}
              title={t('explorer.rename')}
              aria-label={t('explorer.renameNamed', { name: node.name })}
            >
              <IconPencil width={13} height={13} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export const Explorer = memo(function Explorer(props: ExplorerProps): JSX.Element {
  const { t } = useTranslation()
  const { folders, onOpenFile, onRemoveFolder, onCreateFile, onRenameFile, onTransfer, onDelete, onCopyText, onRequestHandled } = props
  const [results, setResults] = useState<Map<string, ExplorerScanResult>>(new Map())
  const [loading, setLoading] = useState(false)
  /** Expanded folders (roots and subfolders), keyed by path. Roots start open. */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(folders))
  /** Folder a "New file" lands in: the last folder clicked, or the folder of the last file opened. */
  const [selectedDir, setSelectedDir] = useState<string | null>(null)
  /** Multi-selection (Ctrl/Shift+click), used by cut/copy/delete/drag. */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** Keyboard cursor in the tree. */
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  /** Where a Shift+click / Shift+Arrow range starts; moves only on a plain click or arrow. */
  const [anchorPath, setAnchorPath] = useState<string | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const knownRoots = useRef(new Set(folders))
  const scanRequest = useRef(0)
  const bodyRef = useRef<HTMLDivElement>(null)

  const rescan = useCallback(async () => {
    const request = ++scanRequest.current
    setLoading(true)
    const scanned = await Promise.all(folders.map((folder) => window.api.explorerScan(folder)))
    if (request !== scanRequest.current) return
    const next = new Map(folders.map((folder, index) => [folder, scanned[index]]))
    setResults(next)
    setLoading(false)
    // Drop selections and clipboard entries for paths that moved, were renamed or deleted.
    const listed = listedPaths(next)
    const stillListed = (path: string): boolean => listed.files.has(path) || listed.directories.has(path)
    setSelected((prev) => {
      const kept = [...prev].filter(stillListed)
      return kept.length === prev.size ? prev : new Set(kept)
    })
    setClipboard((prev) => {
      if (!prev) return prev
      const kept = prev.paths.filter((path) => listed.files.has(path))
      if (kept.length === prev.paths.length) return prev
      return kept.length > 0 ? { ...prev, paths: kept } : null
    })
  }, [folders])

  useEffect(() => {
    // A newly added folder opens expanded and becomes the target for new files.
    const added = folders.filter((folder) => !knownRoots.current.has(folder))
    knownRoots.current = new Set(folders)
    if (added.length > 0) {
      setExpanded((prev) => new Set([...prev, ...added]))
      setSelectedDir(added[added.length - 1])
    }
    setSelectedDir((prev) => (prev && rootOf(folders, prev) ? prev : null))
    void rescan()
  }, [folders, rescan])

  // Files are created and removed outside the app; refresh when the user comes back to it.
  useEffect(() => {
    const onFocus = (): void => void rescan()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [rescan])

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const collapseAll = useCallback(() => setExpanded(new Set()), [])

  const activeKey = useMemo(() => (props.activePath ? pathKey(props.activePath) : null), [props.activePath])
  const openKeys = useMemo(() => new Set(props.openPaths.map(pathKey)), [props.openPaths])
  const cutKeys = useMemo(
    () => new Set(clipboard?.mode === 'move' ? clipboard.paths.map(pathKey) : []),
    [clipboard]
  )

  /** Every row currently rendered, top to bottom: the order arrow keys and Shift+click follow. */
  const flatEntries = useMemo(() => {
    const list: FlatEntry[] = []
    const walk = (nodes: ExplorerNode[], directory: string): void => {
      for (const node of nodes) {
        if (node.kind === 'directory') {
          list.push({ path: node.path, kind: 'directory', name: node.name, directory: node.path })
          if (expanded.has(node.path)) walk(node.children ?? [], node.path)
        } else {
          list.push({ path: node.path, kind: 'file', name: node.name, directory })
        }
      }
    }
    for (const folder of folders) {
      list.push({ path: folder, kind: 'root', name: folderLabel(folder), directory: folder })
      const result = results.get(folder)
      if (expanded.has(folder) && result?.ok) walk(result.root.children ?? [], folder)
    }
    return list
  }, [expanded, folders, results])

  /** Expands, selects and scrolls to a listed entry; returns it, or `null` when it is not listed. */
  const revealPath = useCallback((requested: string): Located | null => {
    const found = locate(results, pathKey(requested))
    if (!found) return null
    const { ancestors, path } = found
    setExpanded((prev) => (ancestors.every((p) => prev.has(p)) ? prev : new Set([...prev, ...ancestors])))
    setSelected(new Set([path]))
    setFocusedPath(path)
    setAnchorPath(path)
    setSelectedDir(ancestors[ancestors.length - 1] ?? null)
    // Scroll after the expanded folders render.
    window.requestAnimationFrame(() => {
      const row = bodyRef.current?.querySelector<HTMLElement>(`[data-explorer-path="${CSS.escape(path)}"]`)
      row?.scrollIntoView({ block: 'nearest' })
      row?.focus({ preventScroll: true })
    })
    return found
  }, [results])

  // Reveal the active document: open every folder between its root and the file.
  useEffect(() => {
    if (!activeKey) return
    const ancestors = ancestorsOf(results, activeKey)
    if (!ancestors || ancestors.length === 0) return
    setExpanded((prev) => (ancestors.every((path) => prev.has(path)) ? prev : new Set([...prev, ...ancestors])))
  }, [activeKey, results])

  const errorText = useCallback((code: string): string => {
    if (code === 'exists') return t('explorer.errors.exists')
    if (code === 'invalid-name') return t('explorer.errors.invalidName')
    if (code === 'forbidden') return t('explorer.errors.forbidden')
    return t('explorer.errors.failed', { error: code })
  }, [t])

  /** Starts naming a new file in `directory` (or the best guess when omitted). */
  const startCreate = useCallback((directory?: string) => {
    const activeDir = activeKey ? ancestorsOf(results, activeKey)?.slice(-1)[0] : undefined
    const target = directory ?? selectedDir ?? activeDir ?? folders[0]
    if (!target) {
      props.onAddFolder()
      return
    }
    setMenu(null)
    setDraftError(null)
    setExpanded((prev) => new Set([...prev, target]))
    setSelectedDir(target)
    setDraft({ kind: 'create', directory: target })
  }, [activeKey, folders, props, results, selectedDir])

  const startRename = useCallback((path: string, name: string) => {
    setMenu(null)
    setDraftError(null)
    setDraft({ kind: 'rename', path, name })
  }, [])

  // Requests from outside (tab menu "Reveal in Explorer View" / "Rename…"). Each is carried out
  // once the folder holding it has been scanned, then handed back so it is never replayed —
  // including after this component remounts when the explorer is shown again.
  useEffect(() => {
    const request = props.request
    if (!request) return
    const root = rootOf(folders, request.path)
    const rootResult = root ? results.get(root) : undefined
    // Still scanning the folder that would hold it: try again when results arrive.
    if (root && !rootResult) return
    const found = revealPath(request.path)
    if (found && request.kind === 'rename' && found.kind === 'file') startRename(found.path, found.name)
    onRequestHandled()
  }, [folders, onRequestHandled, props.request, results, revealPath, startRename])

  const cancelDraft = useCallback(() => {
    setDraft(null)
    setDraftError(null)
  }, [])

  const commitDraft = useCallback(async (value: string) => {
    if (!draft || draftBusy) return
    const name = value.trim()
    // Leaving the field empty, or unchanged on rename, is a cancel rather than an error.
    if (!name || (draft.kind === 'rename' && name === draft.name)) {
      cancelDraft()
      return
    }
    setDraftBusy(true)
    const error = draft.kind === 'create'
      ? await onCreateFile(draft.directory, name)
      : await onRenameFile(draft.path, name)
    setDraftBusy(false)
    if (error) {
      setDraftError(errorText(error))
      return
    }
    setDraft(null)
    setDraftError(null)
    void rescan()
  }, [cancelDraft, draft, draftBusy, errorText, onCreateFile, onRenameFile, rescan])

  // --- Selection ----------------------------------------------------------
  /** What an action applies to: the whole selection when `path` is part of it, else just `path`. */
  const targetsFor = useCallback((path: string): string[] => (
    selected.has(path) ? [...selected] : [path]
  ), [selected])

  const rangeTo = useCallback((path: string, additive: boolean): boolean => {
    const from = flatEntries.findIndex((item) => item.path === anchorPath)
    const to = flatEntries.findIndex((item) => item.path === path)
    if (from < 0 || to < 0) return false
    const [start, end] = from < to ? [from, to] : [to, from]
    const range = flatEntries.slice(start, end + 1).filter((item) => item.kind !== 'root').map((item) => item.path)
    setSelected((prev) => new Set(additive ? [...prev, ...range] : range))
    setFocusedPath(path)
    return true
  }, [anchorPath, flatEntries])

  const onRowClick = useCallback((event: ReactMouseEvent, entry: FlatEntry) => {
    const additive = event.ctrlKey || event.metaKey
    if (event.shiftKey && anchorPath && rangeTo(entry.path, additive)) return
    setFocusedPath(entry.path)
    setAnchorPath(entry.path)
    if (additive) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(entry.path)) next.delete(entry.path)
        else next.add(entry.path)
        return next
      })
      return
    }
    setSelected(entry.kind === 'root' ? new Set() : new Set([entry.path]))
    setSelectedDir(entry.directory)
    if (entry.kind === 'file') onOpenFile(entry.path)
    else toggle(entry.path)
  }, [anchorPath, onOpenFile, rangeTo, toggle])

  const onRowDoubleClick = useCallback((entry: FlatEntry) => {
    // VS Code: single click previews, double click keeps it open for editing.
    if (entry.kind === 'file') onOpenFile(entry.path, 'edit')
  }, [onOpenFile])

  // --- Clipboard / transfer ---------------------------------------------
  const listed = useMemo(() => listedPaths(results), [results])

  // Only files move or copy; folders in a mixed selection are skipped rather than half-copied.
  // Checked against the scan, not the visible rows, so a selection inside a collapsed folder
  // behaves the same for cut/copy/drag as it does for delete.
  const filesOnly = useCallback((paths: string[]): string[] => (
    [...new Set(paths.filter((path) => listed.files.has(path)))]
  ), [listed])

  const copyToClipboard = useCallback((paths: string[], mode: ExplorerTransferMode) => {
    const files = filesOnly(paths)
    if (files.length === 0) return
    setClipboard({ mode, paths: files })
  }, [filesOnly])

  const transfer = useCallback(async (sources: string[], directory: string, mode: ExplorerTransferMode) => {
    const error = await onTransfer(sources, directory, mode)
    if (!error && mode === 'move') setClipboard(null)
    setExpanded((prev) => new Set([...prev, directory]))
    void rescan()
  }, [onTransfer, rescan])

  const paste = useCallback((directory: string) => {
    if (!clipboard) return
    void transfer(clipboard.paths, directory, clipboard.mode)
  }, [clipboard, transfer])

  const remove = useCallback(async (paths: string[]) => {
    const candidates = [...new Set(paths)].filter((path) => listed.files.has(path) || listed.directories.has(path))
    // A file inside a folder that is also being deleted goes with the folder.
    const keys = candidates.map(pathKey)
    const deletable = candidates.filter((path) => {
      const key = pathKey(path)
      return !keys.some((other) => other !== key && (key.startsWith(other + '/') || key.startsWith(other + '\\')))
    })
    if (deletable.length === 0) return
    if (await onDelete(deletable)) {
      setSelected(new Set())
      setClipboard((prev) => (prev ? { ...prev, paths: prev.paths.filter((path) => !deletable.includes(path)) } : prev))
      void rescan()
    }
  }, [listed, onDelete, rescan])

  // --- Drag and drop (move; hold Ctrl/Alt to copy) -------------------------
  const onDragStart = useCallback((event: ReactDragEvent, entry: FlatEntry) => {
    const files = filesOnly(targetsFor(entry.path))
    if (files.length === 0) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify(files))
    event.dataTransfer.effectAllowed = 'copyMove'
  }, [filesOnly, targetsFor])

  // A drag cancelled with Escape or dropped outside the tree never reaches `onDropOnFolder`.
  const onDragEnd = useCallback(() => setDropTarget(null), [])

  const onDragOverFolder = useCallback((event: ReactDragEvent, directory: string) => {
    if (!event.dataTransfer.types.includes(DRAG_MIME)) return
    event.preventDefault()
    // Keep the window-level "drop a file to open it" overlay out of internal moves.
    event.stopPropagation()
    event.dataTransfer.dropEffect = event.ctrlKey || event.altKey ? 'copy' : 'move'
    setDropTarget(directory)
  }, [])

  const onDropOnFolder = useCallback((event: ReactDragEvent, directory: string) => {
    if (!event.dataTransfer.types.includes(DRAG_MIME)) return
    event.preventDefault()
    event.stopPropagation()
    setDropTarget(null)
    let sources: string[] = []
    try {
      sources = JSON.parse(event.dataTransfer.getData(DRAG_MIME)) as string[]
    } catch {
      return
    }
    const mode: ExplorerTransferMode = event.ctrlKey || event.altKey ? 'copy' : 'move'
    const movable = sources.filter((path) => mode === 'copy' || pathKey(parentOf(path)) !== pathKey(directory))
    if (movable.length > 0) void transfer(movable, directory, mode)
  }, [transfer])

  // --- Context menus -------------------------------------------------------
  const openMenu = useCallback((event: ReactMouseEvent, entry: FlatEntry | null) => {
    event.preventDefault()
    event.stopPropagation()
    if (entry && !selected.has(entry.path)) {
      setSelected(entry.kind === 'root' ? new Set() : new Set([entry.path]))
      setFocusedPath(entry.path)
      setAnchorPath(entry.path)
    }
    setMenu(entry
      ? { x: event.clientX, y: event.clientY, kind: entry.kind, path: entry.path, name: entry.name }
      : { x: event.clientX, y: event.clientY, kind: 'blank', path: '', name: '' })
  }, [selected])

  const copyPath = useCallback((paths: string[], relative: boolean) => {
    const text = paths
      .map((path) => {
        if (!relative) return path
        const root = rootOf(folders, path)
        return root ? relativeTo(root, path) : path
      })
      .join('\n')
    onCopyText(text)
  }, [folders, onCopyText])

  const menuItems = useMemo((): ContextMenuItem[] => {
    if (!menu) return []
    const revealLabel = t(revealInOsLabelKey())
    if (menu.kind === 'blank') {
      return [
        { label: t('explorer.newFile'), onSelect: () => startCreate() , disabled: folders.length === 0 },
        { label: t('explorer.addFolder'), onSelect: props.onAddFolder },
        'separator',
        { label: t('explorer.refresh'), onSelect: () => void rescan(), disabled: folders.length === 0 },
        { label: t('sidebar.collapseAll'), onSelect: collapseAll, disabled: folders.length === 0 }
      ]
    }
    const targets = targetsFor(menu.path)
    const many = targets.length > 1
    const targetFiles = filesOnly(targets)
    const pasteHere = menu.kind === 'file' ? parentOf(menu.path) : menu.path
    const common: ContextMenuItem[] = [
      { label: t('explorer.cut'), shortcut: shortcutLabel('Ctrl', 'X'), disabled: targetFiles.length === 0, onSelect: () => copyToClipboard(targets, 'move') },
      { label: t('explorer.copy'), shortcut: shortcutLabel('Ctrl', 'C'), disabled: targetFiles.length === 0, onSelect: () => copyToClipboard(targets, 'copy') },
      {
        label: clipboard && clipboard.paths.length > 1 ? t('explorer.pasteCount', { count: clipboard.paths.length }) : t('explorer.paste'),
        shortcut: shortcutLabel('Ctrl', 'V'),
        disabled: !clipboard,
        onSelect: () => paste(pasteHere)
      },
      'separator',
      { label: t('explorer.copyPath'), shortcut: shortcutLabel('Shift', 'Alt', 'C'), onSelect: () => copyPath(targets, false) },
      { label: t('explorer.copyRelativePath'), onSelect: () => copyPath(targets, true) }
    ]

    if (menu.kind === 'file') {
      return [
        { label: t('explorer.open'), onSelect: () => onOpenFile(menu.path) },
        { label: t('explorer.openInEditor'), onSelect: () => onOpenFile(menu.path, 'edit') },
        { label: t('explorer.openWithDefaultApp'), onSelect: () => props.onOpenWithDefaultApp(menu.path) },
        { label: revealLabel, shortcut: shortcutLabel('Shift', 'Alt', 'R'), onSelect: () => props.onRevealInOs(menu.path) },
        'separator',
        { label: t('explorer.newFile'), onSelect: () => startCreate(parentOf(menu.path)) },
        'separator',
        ...common,
        'separator',
        { label: t('explorer.duplicate'), disabled: many, onSelect: () => void transfer([menu.path], parentOf(menu.path), 'copy') },
        { label: t('explorer.renameEllipsis'), shortcut: 'F2', disabled: many, onSelect: () => startRename(menu.path, menu.name) },
        {
          label: many ? t('explorer.deleteCount', { count: targets.length }) : t('explorer.delete'),
          shortcut: shortcutLabel('Delete'),
          danger: true,
          onSelect: () => void remove(targets)
        }
      ]
    }

    return [
      { label: t('explorer.newFile'), onSelect: () => startCreate(menu.path) },
      'separator',
      { label: revealLabel, shortcut: shortcutLabel('Shift', 'Alt', 'R'), onSelect: () => props.onRevealInOs(menu.path) },
      { label: t('explorer.openWithDefaultApp'), onSelect: () => props.onOpenWithDefaultApp(menu.path) },
      'separator',
      ...common,
      'separator',
      { label: t('explorer.refresh'), onSelect: () => void rescan() },
      { label: t('explorer.collapseFolder'), disabled: !expanded.has(menu.path), onSelect: () => toggle(menu.path) },
      'separator',
      menu.kind === 'root'
        ? { label: t('explorer.removeFolder'), onSelect: () => onRemoveFolder(menu.path) }
        : {
            label: many ? t('explorer.deleteCount', { count: targets.length }) : t('explorer.delete'),
            shortcut: shortcutLabel('Delete'),
            danger: true,
            onSelect: () => void remove(targets)
          }
    ]
  }, [clipboard, collapseAll, copyPath, copyToClipboard, expanded, filesOnly, folders.length, menu, onOpenFile, onRemoveFolder, paste, props, remove, rescan, startCreate, startRename, t, targetsFor, toggle, transfer])

  // --- Keyboard (tree focused) ---------------------------------------------
  const onTreeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (draft || (event.target as HTMLElement).tagName === 'INPUT') return
    const index = flatEntries.findIndex((item) => item.path === focusedPath)
    const current = index >= 0 ? flatEntries[index] : null
    const primary = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    const handled = (): void => {
      event.preventDefault()
      event.stopPropagation()
    }
    const focusRow = (entry: FlatEntry | undefined): void => {
      if (!entry) return
      if (event.shiftKey && anchorPath) {
        rangeTo(entry.path, false)
      } else {
        setFocusedPath(entry.path)
        setAnchorPath(entry.path)
        setSelected(entry.kind === 'root' ? new Set() : new Set([entry.path]))
      }
      bodyRef.current?.querySelector<HTMLElement>(`[data-explorer-path="${CSS.escape(entry.path)}"]`)?.focus()
    }

    if (event.key === 'ArrowDown') { handled(); focusRow(flatEntries[Math.min(flatEntries.length - 1, index + 1)]); return }
    if (event.key === 'ArrowUp') { handled(); focusRow(flatEntries[Math.max(0, index - 1)]); return }
    if (event.key === 'Home') { handled(); focusRow(flatEntries[0]); return }
    if (event.key === 'End') { handled(); focusRow(flatEntries[flatEntries.length - 1]); return }
    if (!current) return
    if (event.key === 'ArrowRight' && current.kind !== 'file') {
      handled()
      if (!expanded.has(current.path)) toggle(current.path)
      else focusRow(flatEntries[index + 1])
      return
    }
    if (event.key === 'ArrowLeft') {
      handled()
      if (current.kind !== 'file' && expanded.has(current.path)) toggle(current.path)
      else focusRow(flatEntries.find((item) => item.path === parentOf(current.path)) ?? flatEntries.find((item) => item.path === current.directory && item.path !== current.path))
      return
    }
    if (event.key === 'F2' && current.kind === 'file') { handled(); startRename(current.path, current.name); return }
    if ((event.key === 'Delete' || (event.key === 'Backspace' && event.metaKey)) && current.kind !== 'root') {
      handled()
      void remove(targetsFor(current.path))
      return
    }
    if (primary && !event.shiftKey && !event.altKey && key === 'c') { handled(); copyToClipboard(targetsFor(current.path), 'copy'); return }
    if (primary && !event.shiftKey && !event.altKey && key === 'x') { handled(); copyToClipboard(targetsFor(current.path), 'move'); return }
    if (primary && !event.shiftKey && !event.altKey && key === 'v') {
      handled()
      paste(current.kind === 'file' ? current.directory : current.path)
      return
    }
    if (primary && key === 'a' && !event.shiftKey) {
      handled()
      setSelected(new Set(flatEntries.filter((item) => item.kind !== 'root').map((item) => item.path)))
      return
    }
    if (event.shiftKey && event.altKey && key === 'c') { handled(); copyPath(targetsFor(current.path), false); return }
    if (event.shiftKey && event.altKey && key === 'r') { handled(); props.onRevealInOs(current.path); return }
    if (event.key === 'Escape' && (selected.size > 0 || clipboard)) {
      handled()
      setSelected(new Set())
      setClipboard(null)
    }
  }, [anchorPath, clipboard, copyPath, copyToClipboard, draft, expanded, flatEntries, focusedPath, paste, props, rangeTo, remove, selected.size, startRename, targetsFor, toggle])

  const anyExpanded = useMemo(() => {
    for (const result of results.values()) {
      if (result.ok && (expanded.has(result.root.path) || collectDirectories(result.root).some((p) => expanded.has(p)))) return true
    }
    return false
  }, [expanded, results])

  const ctx: TreeContext = {
    expanded,
    activeKey,
    openKeys,
    selected,
    focusedPath,
    cutKeys,
    dropTarget,
    draft,
    draftError,
    draftBusy,
    onRowClick,
    onRowDoubleClick,
    onContextMenu: openMenu,
    onStartRename: startRename,
    onCommitDraft: (value: string) => void commitDraft(value),
    onCancelDraft: cancelDraft,
    onDraftChange: () => setDraftError(null),
    onDragStart,
    onDragEnd,
    onDragOverFolder,
    onDropOnFolder
  }

  return (
    <aside className="sidebar explorer" aria-label={t('explorer.title')}>
      <div className="explorer__head">
        <span className="explorer__title">{t('explorer.title')}</span>
        <div className="explorer__actions">
          <button
            type="button"
            className="outline-head__toggle"
            onClick={() => startCreate()}
            disabled={folders.length === 0}
            title={t('explorer.newFile')}
            aria-label={t('explorer.newFile')}
          >
            <IconFilePlus width={15} height={15} />
          </button>
          <button
            type="button"
            className="outline-head__toggle"
            onClick={props.onAddFolder}
            title={t('explorer.addFolder')}
            aria-label={t('explorer.addFolder')}
          >
            <IconFolderPlus width={15} height={15} />
          </button>
          <button
            type="button"
            className={`outline-head__toggle ${loading ? 'explorer__refresh--busy' : ''}`}
            onClick={() => void rescan()}
            disabled={folders.length === 0}
            title={t('explorer.refresh')}
            aria-label={t('explorer.refresh')}
          >
            <IconRefresh width={15} height={15} />
          </button>
          <button
            type="button"
            className="outline-head__toggle"
            onClick={collapseAll}
            disabled={!anyExpanded}
            title={t('sidebar.collapseAll')}
            aria-label={t('sidebar.collapseAll')}
          >
            <IconCollapseAll width={15} height={15} />
          </button>
        </div>
      </div>

      <div
        ref={bodyRef}
        className="sidebar__body explorer__body"
        onKeyDown={onTreeKeyDown}
        onContextMenu={(event) => openMenu(event, null)}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null)
        }}
        onMouseDown={(event) => {
          // Clicking empty space clears the selection, as in any file tree.
          if (event.target === event.currentTarget) setSelected(new Set())
        }}
      >
        {folders.length === 0 ? (
          <div className="explorer__empty">
            <p className="outline__empty">{t('explorer.empty')}</p>
            <button type="button" className="btn btn--primary explorer__add" onClick={props.onAddFolder}>
              <IconFolderPlus width={16} height={16} />
              {t('explorer.openFolder')}
            </button>
          </div>
        ) : (
          <ul className="explorer-roots" role="tree" aria-label={t('explorer.title')} aria-multiselectable="true">
            {folders.map((folder) => {
              const result = results.get(folder)
              const open = expanded.has(folder)
              const creatingInRoot = draft?.kind === 'create' && draft.directory === folder
              const rootEntry: FlatEntry = { path: folder, kind: 'root', name: folderLabel(folder), directory: folder }
              return (
                <li key={folder} className="explorer-root" role="treeitem" aria-expanded={open}>
                  <div className="explorer-root__row">
                    <button
                      type="button"
                      data-explorer-path={folder}
                      className={[
                        'explorer-item explorer-item--root',
                        selectedDir === folder ? 'explorer-item--target' : '',
                        focusedPath === folder ? 'explorer-item--focused' : '',
                        dropTarget === folder ? 'explorer-item--drop' : ''
                      ].join(' ')}
                      title={folder}
                      onClick={(event) => onRowClick(event, rootEntry)}
                      onContextMenu={(event) => openMenu(event, rootEntry)}
                      onDragOver={(event) => onDragOverFolder(event, folder)}
                      onDrop={(event) => onDropOnFolder(event, folder)}
                    >
                      <span className={`explorer-item__chevron ${open ? 'explorer-item__chevron--open' : ''}`} aria-hidden="true">
                        <IconChevronRight width={14} height={14} />
                      </span>
                      <span className="explorer-item__name">{folderLabel(folder)}</span>
                    </button>
                    <div className="explorer-root__actions">
                      <button
                        type="button"
                        className="explorer-item__action"
                        onClick={() => startCreate(folder)}
                        title={t('explorer.newFile')}
                        aria-label={t('explorer.newFileIn', { name: folderLabel(folder) })}
                      >
                        <IconFilePlus width={13} height={13} />
                      </button>
                      <button
                        type="button"
                        className="explorer-item__action"
                        onClick={() => onRemoveFolder(folder)}
                        title={t('explorer.removeFolder')}
                        aria-label={t('explorer.removeFolder')}
                      >
                        <IconX width={13} height={13} />
                      </button>
                    </div>
                  </div>
                  {(open || creatingInRoot) && (
                    !result ? (
                      <p className="outline__empty explorer__status">{t('explorer.loading')}</p>
                    ) : !result.ok ? (
                      <p className="outline__empty explorer__status explorer__status--error">{t('explorer.unavailable')}</p>
                    ) : (
                      <>
                        <ExplorerTree nodes={result.root.children ?? []} depth={0} directory={folder} ctx={ctx} />
                        {(result.root.children ?? []).length === 0 && !creatingInRoot && (
                          <p className="outline__empty explorer__status">{t('explorer.noMarkdown')}</p>
                        )}
                        {result.truncated && (
                          <p className="outline__empty explorer__status">{t('explorer.truncated', { count: result.fileCount })}</p>
                        )}
                      </>
                    )
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          label={menu.name || t('explorer.title')}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  )
})
