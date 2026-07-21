import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronRight, IconCollapseAll, IconExpandAll, IconFileText, IconList, IconOpen, IconSearch } from './icons'
import { OutlineTree } from './OutlineTree'
import { nestOutline, type OutlineItem, type OutlineNode } from '../lib/outline'
import type { WorkspaceFolder, WorkspaceSearchMatch } from '../../electron/shared'

interface SidebarProps {
  hasDoc: boolean
  outline: OutlineItem[]
  activeId: string | null
  showOutline: boolean
  workspaceFolder: WorkspaceFolder | null
  activeDocumentPath: string | null
  workspaceSearchTerm: string
  workspaceSearchResults: WorkspaceSearchMatch[]
  workspaceSearchLoading: boolean
  onSelectHeading: (id: string) => void
  onWorkspaceSearch: (term: string) => void
  onOpenWorkspaceFile: (path: string, search?: { term: string }) => void
}

interface WorkspaceNode {
  id: string
  name: string
  path: string | null
  relativePath: string
  children: WorkspaceNode[]
}

type SidebarPanel = 'files' | 'outline'

function collectCollapsible(nodes: OutlineNode[], acc: string[] = []): string[] {
  for (const node of nodes) {
    if (node.children.length > 0) {
      acc.push(node.id)
      collectCollapsible(node.children, acc)
    }
  }
  return acc
}

function buildWorkspaceTree(folder: WorkspaceFolder | null): WorkspaceNode[] {
  if (!folder) return []
  const root: WorkspaceNode = { id: '', name: folder.name, path: null, relativePath: '', children: [] }

  for (const file of folder.files) {
    const parts = file.relativePath.split('/').filter(Boolean)
    let parent = root
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const relativePath = parts.slice(0, index + 1).join('/')
      const isFile = index === parts.length - 1
      if (isFile) {
        parent.children.push({
          id: file.path,
          name: part,
          path: file.path,
          relativePath: file.relativePath,
          children: []
        })
        continue
      }

      let child = parent.children.find((node) => node.path === null && node.relativePath === relativePath)
      if (!child) {
        child = { id: relativePath, name: part, path: null, relativePath, children: [] }
        parent.children.push(child)
      }
      parent = child
    }
  }

  const sortNodes = (nodes: WorkspaceNode[]): WorkspaceNode[] => {
    nodes.sort((a, b) => {
      if ((a.path === null) !== (b.path === null)) return a.path === null ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    nodes.forEach((node) => sortNodes(node.children))
    return nodes
  }

  return sortNodes(root.children)
}

interface WorkspaceTreeProps {
  nodes: WorkspaceNode[]
  activeDocumentPath: string | null
  collapsed: Set<string>
  onToggle: (id: string) => void
  onOpenFile: (path: string) => void
}

function WorkspaceTree({ nodes, activeDocumentPath, collapsed, onToggle, onOpenFile }: WorkspaceTreeProps): JSX.Element {
  return (
    <ul className="workspace-tree">
      {nodes.map((node) => {
        const isFolder = node.path === null
        const isCollapsed = isFolder && collapsed.has(node.id)
        const isActive = Boolean(node.path && node.path === activeDocumentPath)
        return (
          <li className="workspace-tree__row" key={node.id}>
            <div className={`workspace-item ${isActive ? 'workspace-item--active' : ''}`}>
              {isFolder ? (
                <button
                  type="button"
                  className={`workspace-item__toggle ${!isCollapsed ? 'workspace-item__toggle--open' : ''}`}
                  onClick={() => onToggle(node.id)}
                  aria-label={node.name}
                  title={node.name}
                >
                  <IconChevronRight width={14} height={14} />
                </button>
              ) : (
                <span className="workspace-item__spacer" />
              )}

              <button
                type="button"
                className="workspace-item__label"
                onClick={() => (node.path ? onOpenFile(node.path) : onToggle(node.id))}
                title={node.relativePath}
              >
                {isFolder ? <IconOpen width={14} height={14} /> : <IconFileText width={14} height={14} />}
                <span className="workspace-item__text">{node.name}</span>
              </button>
            </div>

            {isFolder && !isCollapsed && node.children.length > 0 && (
              <div className="workspace-tree__children">
                <WorkspaceTree
                  nodes={node.children}
                  activeDocumentPath={activeDocumentPath}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  onOpenFile={onOpenFile}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const { t } = useTranslation()

  const tree = useMemo(() => nestOutline(props.outline), [props.outline])
  const collapsibleIds = useMemo(() => collectCollapsible(tree), [tree])
  const workspaceTree = useMemo(() => buildWorkspaceTree(props.workspaceFolder), [props.workspaceFolder])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [collapsedWorkspace, setCollapsedWorkspace] = useState<Set<string>>(new Set())
  const [activePanel, setActivePanel] = useState<SidebarPanel>(props.workspaceFolder ? 'files' : 'outline')

  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every((id) => collapsed.has(id))
  const canShowFiles = props.workspaceFolder !== null
  const canShowOutline = props.hasDoc && props.showOutline

  const toggleNode = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setCollapsed(allCollapsed ? new Set() : new Set(collapsibleIds))
  }, [allCollapsed, collapsibleIds])

  const toggleWorkspaceNode = useCallback((id: string) => {
    setCollapsedWorkspace((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    if (!canShowFiles && activePanel === 'files') setActivePanel('outline')
    if (!canShowOutline && activePanel === 'outline' && canShowFiles) setActivePanel('files')
  }, [activePanel, canShowFiles, canShowOutline])

  return (
    <aside className="sidebar">
      <div className="sidebar__body">
        {canShowFiles && canShowOutline && (
          <div className="sidebar-tabs" role="tablist" aria-label={t('sidebar.sections')}>
            <button
              className={`sidebar-tabs__button ${activePanel === 'files' ? 'sidebar-tabs__button--active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activePanel === 'files'}
              onClick={() => setActivePanel('files')}
            >
              {t('sidebar.files')}
            </button>
            <button
              className={`sidebar-tabs__button ${activePanel === 'outline' ? 'sidebar-tabs__button--active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activePanel === 'outline'}
              onClick={() => setActivePanel('outline')}
            >
              {t('sidebar.outline')}
            </button>
          </div>
        )}

        {canShowFiles && activePanel === 'files' && props.workspaceFolder && (
          <>
            <div className="outline-head">
              <div className="outline-head__title">
                <IconOpen width={14} height={14} />
                <span className="outline-head__label" title={props.workspaceFolder.path}>
                  {props.workspaceFolder.name}
                </span>
              </div>
            </div>

            <label className="workspace-search">
              <IconSearch width={14} height={14} />
              <input
                className="workspace-search__input"
                type="search"
                value={props.workspaceSearchTerm}
                onChange={(e) => props.onWorkspaceSearch(e.currentTarget.value)}
                placeholder={t('sidebar.searchFiles')}
              />
            </label>

            {props.workspaceSearchTerm.trim() ? (
              <div className="workspace-results">
                {props.workspaceSearchLoading ? (
                  <p className="outline__empty">{t('sidebar.searching')}</p>
                ) : props.workspaceSearchResults.length > 0 ? (
                  props.workspaceSearchResults.map((match) => (
                    <button
                      type="button"
                      className="workspace-result"
                      key={`${match.path}:${match.line}:${match.column}`}
                      onClick={() => props.onOpenWorkspaceFile(match.path, { term: props.workspaceSearchTerm })}
                      title={`${match.relativePath}:${match.line}:${match.column}`}
                    >
                      <span className="workspace-result__file">{match.relativePath}</span>
                      <span className="workspace-result__meta">
                        {t('sidebar.matchLocation', { line: match.line, column: match.column })}
                      </span>
                      <span className="workspace-result__excerpt">{match.excerpt}</span>
                    </button>
                  ))
                ) : (
                  <p className="outline__empty">{t('sidebar.noSearchResults')}</p>
                )}
              </div>
            ) : workspaceTree.length > 0 ? (
              <WorkspaceTree
                nodes={workspaceTree}
                activeDocumentPath={props.activeDocumentPath}
                collapsed={collapsedWorkspace}
                onToggle={toggleWorkspaceNode}
                onOpenFile={(path) => props.onOpenWorkspaceFile(path)}
              />
            ) : (
              <p className="outline__empty">{t('sidebar.noMarkdownFiles')}</p>
            )}
          </>
        )}

        {canShowOutline && activePanel === 'outline' && (
          <>
            <div className="outline-head">
              <div className="outline-head__title">
                <IconList width={14} height={14} />
                <span className="outline-head__label">{t('sidebar.outline')}</span>
              </div>
              {collapsibleIds.length > 0 && (
                <button
                  type="button"
                  className="outline-head__toggle"
                  onClick={toggleAll}
                  title={allCollapsed ? t('sidebar.expandAll') : t('sidebar.collapseAll')}
                  aria-label={allCollapsed ? t('sidebar.expandAll') : t('sidebar.collapseAll')}
                >
                  {allCollapsed ? <IconExpandAll width={16} height={16} /> : <IconCollapseAll width={16} height={16} />}
                </button>
              )}
            </div>

            {tree.length > 0 ? (
              <nav aria-label={t('sidebar.outline')}>
                <OutlineTree
                  nodes={tree}
                  activeId={props.activeId}
                  collapsed={collapsed}
                  onSelect={props.onSelectHeading}
                  onToggle={toggleNode}
                />
              </nav>
            ) : (
              <p className="outline__empty">{props.hasDoc ? t('sidebar.noHeadings') : t('sidebar.noDocument')}</p>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
