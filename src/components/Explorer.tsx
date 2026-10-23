import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
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
import type { ExplorerNode, ExplorerScanResult } from '../../electron/shared'

/** `null` on success, otherwise an error code (`exists`, `invalid-name`, `forbidden`, or a message). */
export type ExplorerActionResult = string | null

interface ExplorerProps {
  folders: string[]
  /** Path of the active document, highlighted when it lives in a loaded folder. */
  activePath: string | null
  onAddFolder: () => void
  onRemoveFolder: (path: string) => void
  onOpenFile: (path: string) => void
  /** Creates `name` inside `directory` and opens it; resolves to an error code or `null`. */
  onCreateFile: (directory: string, name: string) => Promise<ExplorerActionResult>
  /** Renames `path` to `name` in its own folder; resolves to an error code or `null`. */
  onRenameFile: (path: string, name: string) => Promise<ExplorerActionResult>
}

/** Inline name field: a new file being named inside `directory`, or an existing file being renamed. */
type Draft =
  | { kind: 'create'; directory: string }
  | { kind: 'rename'; path: string; name: string }

interface MenuState {
  x: number
  y: number
  kind: 'file' | 'directory' | 'root'
  path: string
  name: string
}

const NEW_FILE_NAME = 'Untitled.md'

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

function collectDirectories(node: ExplorerNode, acc: string[] = []): string[] {
  for (const child of node.children ?? []) {
    if (child.kind === 'directory') {
      acc.push(child.path)
      collectDirectories(child, acc)
    }
  }
  return acc
}

/** Folders between a loaded root and the file at `key`, root first; `null` when not listed. */
function ancestorsOf(results: Map<string, ExplorerScanResult>, key: string): string[] | null {
  const visit = (node: ExplorerNode, trail: string[]): string[] | null => {
    for (const child of node.children ?? []) {
      if (child.kind === 'file' && pathKey(child.path) === key) return trail
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

interface TreeProps {
  nodes: ExplorerNode[]
  depth: number
  /** Folder that owns `nodes`; a pending "new file" draft for it renders first in the list. */
  directory: string
  expanded: Set<string>
  activeKey: string | null
  selectedDir: string | null
  draft: Draft | null
  draftError: string | null
  draftBusy: boolean
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
  onSelectDir: (path: string) => void
  onContextMenu: (event: ReactMouseEvent, menu: Omit<MenuState, 'x' | 'y'>) => void
  onStartRename: (path: string, name: string) => void
  onCommitDraft: (value: string) => void
  onCancelDraft: () => void
  onDraftChange: () => void
}

function ExplorerTree(props: TreeProps): JSX.Element {
  const { t } = useTranslation()
  const { draft } = props
  const creatingHere = draft?.kind === 'create' && draft.directory === props.directory
  return (
    <ul className="explorer-tree" role="group">
      {creatingHere && (
        <NameInput
          initial={NEW_FILE_NAME}
          depth={props.depth}
          error={props.draftError}
          busy={props.draftBusy}
          onCommit={props.onCommitDraft}
          onCancel={props.onCancelDraft}
          onChange={props.onDraftChange}
        />
      )}
      {props.nodes.map((node) => {
        const indent = { paddingLeft: `${4 + props.depth * 12}px` }
        if (node.kind === 'directory') {
          const open = props.expanded.has(node.path)
          const selected = props.selectedDir === node.path
          return (
            <li key={node.path} role="treeitem" aria-expanded={open}>
              <button
                type="button"
                className={`explorer-item explorer-item--dir ${selected ? 'explorer-item--selected' : ''}`}
                style={indent}
                title={node.path}
                onClick={() => {
                  props.onSelectDir(node.path)
                  props.onToggle(node.path)
                }}
                onContextMenu={(event) => props.onContextMenu(event, { kind: 'directory', path: node.path, name: node.name })}
              >
                <span className={`explorer-item__chevron ${open ? 'explorer-item__chevron--open' : ''}`} aria-hidden="true">
                  <IconChevronRight width={14} height={14} />
                </span>
                <IconFolder className="explorer-item__icon" width={15} height={15} />
                <span className="explorer-item__name">{node.name}</span>
              </button>
              {(open || (draft?.kind === 'create' && draft.directory === node.path)) && (
                <ExplorerTree {...props} nodes={node.children ?? []} depth={props.depth + 1} directory={node.path} />
              )}
            </li>
          )
        }
        if (draft?.kind === 'rename' && draft.path === node.path) {
          return (
            <NameInput
              key={node.path}
              initial={node.name}
              depth={props.depth}
              error={props.draftError}
              busy={props.draftBusy}
              onCommit={props.onCommitDraft}
              onCancel={props.onCancelDraft}
              onChange={props.onDraftChange}
            />
          )
        }
        const active = props.activeKey === pathKey(node.path)
        return (
          <li key={node.path} role="treeitem" aria-selected={active} className="explorer-file">
            <button
              type="button"
              className={`explorer-item explorer-item--file ${active ? 'explorer-item--active' : ''}`}
              style={indent}
              title={node.path}
              onClick={() => {
                props.onSelectDir(props.directory)
                props.onOpenFile(node.path)
              }}
              onKeyDown={(event) => {
                if (event.key === 'F2') {
                  event.preventDefault()
                  props.onStartRename(node.path, node.name)
                }
              }}
              onContextMenu={(event) => props.onContextMenu(event, { kind: 'file', path: node.path, name: node.name })}
            >
              <span className="explorer-item__chevron" aria-hidden="true" />
              <IconFileText className="explorer-item__icon" width={15} height={15} />
              <span className="explorer-item__name">{node.name}</span>
            </button>
            <button
              type="button"
              className="explorer-item__action"
              onClick={() => props.onStartRename(node.path, node.name)}
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
  const { folders, onOpenFile, onRemoveFolder, onCreateFile, onRenameFile } = props
  const [results, setResults] = useState<Map<string, ExplorerScanResult>>(new Map())
  const [loading, setLoading] = useState(false)
  /** Expanded folders (roots and subfolders), keyed by path. Roots start open. */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(folders))
  /** Folder a "New file" lands in: the last folder clicked, or the folder of the last file opened. */
  const [selectedDir, setSelectedDir] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const knownRoots = useRef(new Set(folders))
  const scanRequest = useRef(0)

  const rescan = useCallback(async () => {
    const request = ++scanRequest.current
    setLoading(true)
    const scanned = await Promise.all(folders.map((folder) => window.api.explorerScan(folder)))
    if (request !== scanRequest.current) return
    setResults(new Map(folders.map((folder, index) => [folder, scanned[index]])))
    setLoading(false)
  }, [folders])

  useEffect(() => {
    // A newly added folder opens expanded and becomes the target for new files.
    const added = folders.filter((folder) => !knownRoots.current.has(folder))
    knownRoots.current = new Set(folders)
    if (added.length > 0) {
      setExpanded((prev) => new Set([...prev, ...added]))
      setSelectedDir(added[added.length - 1])
    }
    setSelectedDir((prev) => (prev && folders.some((folder) => prev === folder || prev.startsWith(folder)) ? prev : null))
    void rescan()
  }, [folders, rescan])

  // Files are created and removed outside the app; refresh when the user comes back to it.
  useEffect(() => {
    const onFocus = (): void => void rescan()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [rescan])

  // Dismiss the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

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

  // Reveal the active document: open every folder between its root and the file.
  useEffect(() => {
    if (!activeKey) return
    const ancestors = ancestorsOf(results, activeKey)
    if (!ancestors || ancestors.length === 0) return
    setExpanded((prev) => (ancestors.every((path) => prev.has(path)) ? prev : new Set([...prev, ...ancestors])))
  }, [activeKey, results])

  const anyExpanded = useMemo(() => {
    for (const result of results.values()) {
      if (result.ok && (expanded.has(result.root.path) || collectDirectories(result.root).some((p) => expanded.has(p)))) return true
    }
    return false
  }, [expanded, results])

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

  const openMenu = useCallback((event: ReactMouseEvent, target: Omit<MenuState, 'x' | 'y'>) => {
    event.preventDefault()
    setMenu({ ...target, x: event.clientX, y: event.clientY })
  }, [])

  const run = (action: () => void): void => {
    setMenu(null)
    action()
  }

  const treeProps = {
    expanded,
    activeKey,
    selectedDir,
    draft,
    draftError,
    draftBusy,
    onToggle: toggle,
    onOpenFile,
    onSelectDir: setSelectedDir,
    onContextMenu: openMenu,
    onStartRename: startRename,
    onCommitDraft: (value: string) => void commitDraft(value),
    onCancelDraft: cancelDraft,
    onDraftChange: () => setDraftError(null)
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

      <div className="sidebar__body explorer__body">
        {folders.length === 0 ? (
          <div className="explorer__empty">
            <p className="outline__empty">{t('explorer.empty')}</p>
            <button type="button" className="btn btn--primary explorer__add" onClick={props.onAddFolder}>
              <IconFolderPlus width={16} height={16} />
              {t('explorer.openFolder')}
            </button>
          </div>
        ) : (
          <ul className="explorer-roots" role="tree" aria-label={t('explorer.title')}>
            {folders.map((folder) => {
              const result = results.get(folder)
              const open = expanded.has(folder)
              const creatingInRoot = draft?.kind === 'create' && draft.directory === folder
              return (
                <li key={folder} className="explorer-root" role="treeitem" aria-expanded={open}>
                  <div className="explorer-root__row">
                    <button
                      type="button"
                      className={`explorer-item explorer-item--root ${selectedDir === folder ? 'explorer-item--selected' : ''}`}
                      title={folder}
                      onClick={() => {
                        setSelectedDir(folder)
                        toggle(folder)
                      }}
                      onContextMenu={(event) => openMenu(event, { kind: 'root', path: folder, name: folderLabel(folder) })}
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
                        <ExplorerTree {...treeProps} nodes={result.root.children ?? []} depth={0} directory={folder} />
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
        <div
          className="tab-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {menu.kind === 'file' ? (
            <>
              <button className="tab-menu__item" type="button" role="menuitem" onClick={() => run(() => onOpenFile(menu.path))}>
                {t('explorer.open')}
              </button>
              <button className="tab-menu__item" type="button" role="menuitem" onClick={() => run(() => startRename(menu.path, menu.name))}>
                {t('explorer.rename')}
              </button>
              <div className="tab-menu__sep" role="separator" />
              <button className="tab-menu__item" type="button" role="menuitem" onClick={() => run(() => startCreate(parentOf(menu.path)))}>
                {t('explorer.newFile')}
              </button>
            </>
          ) : (
            <>
              <button className="tab-menu__item" type="button" role="menuitem" onClick={() => run(() => startCreate(menu.path))}>
                {t('explorer.newFile')}
              </button>
              <button className="tab-menu__item" type="button" role="menuitem" onClick={() => run(() => void rescan())}>
                {t('explorer.refresh')}
              </button>
              {menu.kind === 'root' && (
                <>
                  <div className="tab-menu__sep" role="separator" />
                  <button className="tab-menu__item" type="button" role="menuitem" onClick={() => run(() => onRemoveFolder(menu.path))}>
                    {t('explorer.removeFolder')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  )
})
