import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconX } from './icons'
import { ContextMenu, revealInOsLabelKey, shortcutLabel, type ContextMenuItem } from './ContextMenu'

export interface DocumentTabItem {
  id: string
  title: string
  dirty: boolean
  /** File on disk, or `null` for an untitled document. */
  path: string | null
  readOnly: boolean
  /** True when `path` lies inside a folder loaded in the explorer. */
  inExplorer: boolean
}

/** View toggles the tab menu offers, mirroring the top-bar buttons. */
export interface DocumentTabViewState {
  explorerVisible: boolean
  outlineVisible: boolean
  canToggleOutline: boolean
  splitView: boolean
  canToggleSplit: boolean
}

interface DocumentTabsProps {
  tabs: DocumentTabItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseToRight: (id: string) => void
  onCloseSaved: () => void
  onCloseAll: () => void
  view: DocumentTabViewState
  onSave: (id: string) => void
  onSaveAs: (id: string) => void
  onCopyPath: (id: string, relative: boolean) => void
  onRevealInExplorer: (id: string) => void
  onRevealInOs: (id: string) => void
  onOpenWithDefaultApp: (id: string) => void
  onRename: (id: string) => void
  onToggleExplorer: () => void
  onToggleOutline: () => void
  onToggleSplit: () => void
  /** Double-click on the empty part of the strip: a new untitled document, as in VS Code. */
  onNew: () => void
}

interface MenuState {
  id: string
  x: number
  y: number
}

function DocumentTabsView({
  tabs,
  activeId,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseSaved,
  onCloseAll,
  ...actions
}: DocumentTabsProps): JSX.Element | null {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<MenuState | null>(null)

  if (tabs.length === 0) return null

  const menuIndex = menu ? tabs.findIndex((tab) => tab.id === menu.id) : -1
  const menuTab = menuIndex >= 0 ? tabs[menuIndex] : null
  const hasOthers = tabs.length > 1
  const hasRight = menuIndex >= 0 && menuIndex < tabs.length - 1
  const hasSaved = tabs.some((tab) => !tab.dirty)

  const items = (tab: DocumentTabItem): ContextMenuItem[] => {
    const onDisk = tab.path !== null && !tab.readOnly
    const { view } = actions
    return [
      { label: t('tabs.closeThis'), shortcut: shortcutLabel('Ctrl', 'W'), onSelect: () => onClose(tab.id) },
      { label: t('tabs.closeOthers'), disabled: !hasOthers, onSelect: () => onCloseOthers(tab.id) },
      { label: t('tabs.closeRight'), disabled: !hasRight, onSelect: () => onCloseToRight(tab.id) },
      { label: t('tabs.closeSaved'), disabled: !hasSaved, onSelect: onCloseSaved },
      { label: t('tabs.closeAll'), onSelect: onCloseAll },
      'separator',
      { label: t('tabs.save'), shortcut: shortcutLabel('Ctrl', 'S'), disabled: tab.readOnly, onSelect: () => actions.onSave(tab.id) },
      { label: t('tabs.saveAs'), shortcut: shortcutLabel('Ctrl', 'Shift', 'S'), disabled: tab.readOnly, onSelect: () => actions.onSaveAs(tab.id) },
      'separator',
      { label: t('explorer.copyPath'), disabled: !tab.path, onSelect: () => actions.onCopyPath(tab.id, false) },
      { label: t('explorer.copyRelativePath'), disabled: !tab.inExplorer, onSelect: () => actions.onCopyPath(tab.id, true) },
      'separator',
      { label: t('tabs.revealInExplorerView'), disabled: !tab.inExplorer, onSelect: () => actions.onRevealInExplorer(tab.id) },
      { label: t(revealInOsLabelKey()), disabled: !onDisk, onSelect: () => actions.onRevealInOs(tab.id) },
      { label: t('explorer.openWithDefaultApp'), disabled: !onDisk, onSelect: () => actions.onOpenWithDefaultApp(tab.id) },
      { label: t('explorer.renameEllipsis'), disabled: !onDisk || !tab.inExplorer, onSelect: () => actions.onRename(tab.id) },
      'separator',
      {
        label: view.explorerVisible ? t('toolbar.hideExplorer') : t('toolbar.showExplorer'),
        shortcut: shortcutLabel('Ctrl', 'Shift', 'B'),
        onSelect: actions.onToggleExplorer
      },
      {
        label: view.outlineVisible ? t('toolbar.hideOutline') : t('toolbar.showOutline'),
        disabled: !view.canToggleOutline,
        onSelect: actions.onToggleOutline
      },
      {
        label: view.splitView ? t('toolbar.hideLivePreview') : t('toolbar.showLivePreview'),
        shortcut: shortcutLabel('Ctrl', '\\'),
        disabled: !view.canToggleSplit,
        onSelect: actions.onToggleSplit
      }
    ]
  }

  return (
    <div
      className="document-tabs"
      role="tablist"
      aria-label={t('tabs.documents')}
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) actions.onNew()
      }}
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`document-tab ${activeId === tab.id ? 'document-tab--active' : ''}`}
          role="tab"
          aria-selected={activeId === tab.id}
          onMouseDown={(event) => {
            if (event.button === 1) {
              event.preventDefault()
              onClose(tab.id)
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu({ id: tab.id, x: event.clientX, y: event.clientY })
          }}
        >
          <button className="document-tab__label" type="button" onClick={() => onSelect(tab.id)} title={tab.path ?? tab.title}>
            <span className="document-tab__dirty" aria-hidden="true">
              {tab.dirty ? '•' : ''}
            </span>
            <span className="document-tab__title">{tab.title}</span>
          </button>
          <button
            className="document-tab__close"
            type="button"
            onClick={() => onClose(tab.id)}
            title={t('tabs.close')}
            aria-label={t('tabs.close')}
          >
            <IconX width={14} height={14} />
          </button>
        </div>
      ))}

      {menu && menuTab && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={items(menuTab)}
          label={menuTab.title}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function sameTabs(previous: DocumentTabItem[], next: DocumentTabItem[]): boolean {
  return previous.length === next.length && previous.every((tab, index) => (
    tab.id === next[index].id &&
    tab.title === next[index].title &&
    tab.dirty === next[index].dirty &&
    tab.path === next[index].path &&
    tab.readOnly === next[index].readOnly &&
    tab.inExplorer === next[index].inExplorer
  ))
}

function sameView(previous: DocumentTabViewState, next: DocumentTabViewState): boolean {
  return previous.explorerVisible === next.explorerVisible &&
    previous.outlineVisible === next.outlineVisible &&
    previous.canToggleOutline === next.canToggleOutline &&
    previous.splitView === next.splitView &&
    previous.canToggleSplit === next.canToggleSplit
}

export const DocumentTabs = memo(DocumentTabsView, (previous, next) => (
  previous.activeId === next.activeId &&
  previous.onSelect === next.onSelect &&
  previous.onClose === next.onClose &&
  previous.onCloseOthers === next.onCloseOthers &&
  previous.onCloseToRight === next.onCloseToRight &&
  previous.onCloseSaved === next.onCloseSaved &&
  previous.onCloseAll === next.onCloseAll &&
  previous.onSave === next.onSave &&
  previous.onSaveAs === next.onSaveAs &&
  previous.onCopyPath === next.onCopyPath &&
  previous.onRevealInExplorer === next.onRevealInExplorer &&
  previous.onRevealInOs === next.onRevealInOs &&
  previous.onOpenWithDefaultApp === next.onOpenWithDefaultApp &&
  previous.onRename === next.onRename &&
  previous.onToggleExplorer === next.onToggleExplorer &&
  previous.onToggleOutline === next.onToggleOutline &&
  previous.onToggleSplit === next.onToggleSplit &&
  previous.onNew === next.onNew &&
  sameView(previous.view, next.view) &&
  sameTabs(previous.tabs, next.tabs)
))
