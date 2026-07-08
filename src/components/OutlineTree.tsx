import { useTranslation } from 'react-i18next'
import { IconBlock, IconChevronRight, IconFlow } from './icons'
import type { OutlineKind, OutlineNode } from '../lib/outline'

interface OutlineTreeProps {
  nodes: OutlineNode[]
  activeId: string | null
  collapsed: Set<string>
  depth?: number
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}

function kindIcon(kind: OutlineKind): JSX.Element | null {
  if (kind === 'requirement') return <IconBlock className="outline-item__icon" width={15} height={15} />
  if (kind === 'scenario') return <IconFlow className="outline-item__icon" width={15} height={15} />
  return null
}

export function OutlineTree(props: OutlineTreeProps): JSX.Element {
  const { t } = useTranslation()
  const depth = props.depth ?? 0

  return (
    <ul className="outline-tree">
      {props.nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const open = hasChildren && !props.collapsed.has(node.id)
        const isActive = props.activeId === node.id
        const cls = [
          'outline-item',
          `outline-item--${node.kind}`,
          depth === 0 ? 'outline-item--root' : '',
          isActive ? 'outline-item--active' : ''
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <li key={node.id} className="outline-tree__node">
            <div className={cls}>
              {hasChildren ? (
                <button
                  type="button"
                  className={`outline-item__toggle ${open ? 'outline-item__toggle--open' : ''}`}
                  aria-label={open ? t('sidebar.collapse') : t('sidebar.expand')}
                  aria-expanded={open}
                  onClick={() => props.onToggle(node.id)}
                >
                  <IconChevronRight width={14} height={14} />
                </button>
              ) : (
                <span className="outline-item__toggle outline-item__toggle--leaf" aria-hidden="true" />
              )}

              <button
                type="button"
                className="outline-item__label"
                title={node.text}
                onClick={() => props.onSelect(node.id)}
              >
                {kindIcon(node.kind)}
                <span className="outline-item__text">{node.text}</span>
              </button>
            </div>

            {open && (
              <div className="outline-tree__children">
                <OutlineTree
                  nodes={node.children}
                  activeId={props.activeId}
                  collapsed={props.collapsed}
                  depth={depth + 1}
                  onSelect={props.onSelect}
                  onToggle={props.onToggle}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
