import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCollapseAll, IconExpandAll, IconList } from './icons'
import { OutlineTree } from './OutlineTree'
import { nestOutline, type OutlineItem, type OutlineNode } from '../lib/outline'

interface SidebarProps {
  hasDoc: boolean
  outline: OutlineItem[]
  activeId: string | null
  showOutline: boolean
  onSelectHeading: (id: string) => void
}

function collectCollapsible(nodes: OutlineNode[], acc: string[] = []): string[] {
  for (const node of nodes) {
    if (node.children.length > 0) {
      acc.push(node.id)
      collectCollapsible(node.children, acc)
    }
  }
  return acc
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const { t } = useTranslation()

  const tree = useMemo(() => nestOutline(props.outline), [props.outline])
  const collapsibleIds = useMemo(() => collectCollapsible(tree), [tree])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const allCollapsed = collapsibleIds.length > 0 && collapsibleIds.every((id) => collapsed.has(id))

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

  return (
    <aside className="sidebar">
      <div className="sidebar__body">
        {props.showOutline && (
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
