// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { OutlineTree } from './OutlineTree'
import type { OutlineKind, OutlineNode } from '../lib/outline'
import { click, get, queryAll, renderComponent, text } from '../test/harness'

function node(
  id: string,
  label: string,
  kind: OutlineKind = 'heading',
  children: OutlineNode[] = []
): OutlineNode {
  return { id, text: label, level: 1, kind, children }
}

const tree = [
  node('intro', 'Introduction', 'heading', [
    node('req', 'Keep data', 'requirement', [node('scen', 'User opens file', 'scenario')])
  ]),
  node('end', 'Conclusion')
]

function setup(nodes: OutlineNode[], activeId: string | null = null, collapsed = new Set<string>()) {
  const onSelect = vi.fn()
  const onToggle = vi.fn()
  const rendered = renderComponent(
    <OutlineTree nodes={nodes} activeId={activeId} collapsed={collapsed} onSelect={onSelect} onToggle={onToggle} />
  )
  return { ...rendered, onSelect, onToggle }
}

const labels = (container: HTMLElement): string[] => queryAll(container, '.outline-item__text').map(text)

afterEach(() => {
  document.body.innerHTML = ''
})

describe('OutlineTree', () => {
  it('renders an empty list for an empty outline', () => {
    const { container } = setup([])

    expect(get(container, '.outline-tree').children).toHaveLength(0)
  })

  it('renders nested headings down every level', () => {
    const { container } = setup(tree)

    expect(labels(container)).toEqual(['Introduction', 'Keep data', 'User opens file', 'Conclusion'])
  })

  it('hides the children of a collapsed heading but keeps its siblings', () => {
    const { container } = setup(tree, null, new Set(['intro']))

    expect(labels(container)).toEqual(['Introduction', 'Conclusion'])
  })

  it('collapses only the heading named in the set', () => {
    const { container } = setup(tree, null, new Set(['req']))

    expect(labels(container)).toEqual(['Introduction', 'Keep data', 'Conclusion'])
  })

  it('marks only the root level with the root class', () => {
    const { container } = setup(tree)

    expect(queryAll(container, '.outline-item--root').length).toBe(2)
  })

  it('marks the active heading, at any depth', () => {
    const { container } = setup(tree, 'scen')

    const active = queryAll(container, '.outline-item--active')
    expect(active).toHaveLength(1)
    expect(text(active[0])).toContain('User opens file')
  })

  it('marks no heading when the active id is not in the outline', () => {
    const { container } = setup(tree, 'missing')

    expect(queryAll(container, '.outline-item--active')).toHaveLength(0)
  })

  it('selects a heading when its label is clicked', () => {
    const { container, onSelect } = setup(tree)

    click(queryAll(container, '.outline-item__label')[2])

    expect(onSelect).toHaveBeenCalledWith('scen')
  })

  it('toggles a heading from its chevron without selecting it', () => {
    const { container, onSelect, onToggle } = setup(tree)

    click(queryAll(container, '.outline-item__toggle')[0])

    expect(onToggle).toHaveBeenCalledWith('intro')
    expect(onSelect).not.toHaveBeenCalled()
  })

  describe('toggle affordance', () => {
    it('gives a heading with children an expanded, collapsible control', () => {
      const { container } = setup(tree)
      const toggle = queryAll(container, '.outline-item__toggle')[0]

      expect(toggle.tagName).toBe('BUTTON')
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      expect(toggle.getAttribute('aria-label')).toBe('Collapse')
      expect(toggle.className).toContain('outline-item__toggle--open')
    })

    it('flips the control to expandable once collapsed', () => {
      const { container } = setup(tree, null, new Set(['intro']))
      const toggle = queryAll(container, '.outline-item__toggle')[0]

      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      expect(toggle.getAttribute('aria-label')).toBe('Expand')
      expect(toggle.className).not.toContain('outline-item__toggle--open')
    })

    it('gives a leaf a non-interactive placeholder instead of a button', () => {
      const { container } = setup([node('leaf', 'Alone')])
      const toggle = get(container, '.outline-item__toggle')

      expect(toggle.tagName).toBe('SPAN')
      expect(toggle.className).toContain('outline-item__toggle--leaf')
      expect(toggle.getAttribute('aria-hidden')).toBe('true')
    })
  })

  describe('semantic kinds', () => {
    it('gives each kind its own modifier class', () => {
      const { container } = setup(tree)

      expect(queryAll(container, '.outline-item').map((item) => (
        Array.from(item.classList).find((name) => name.startsWith('outline-item--') && !name.endsWith('--root'))
      ))).toEqual([
        'outline-item--heading',
        'outline-item--requirement',
        'outline-item--scenario',
        'outline-item--heading'
      ])
    })

    it('draws an icon for requirements and scenarios but not plain headings', () => {
      const { container } = setup(tree)

      const withIcon = queryAll(container, '.outline-item')
        .filter((item) => item.querySelector('.outline-item__icon'))
        .map((item) => text(item))

      expect(withIcon).toEqual(['Keep data', 'User opens file'])
    })
  })

  it('exposes the full heading text as a tooltip, since long ones are truncated', () => {
    const long = 'A heading long enough that the sidebar has to cut it short'
    const { container } = setup([node('long', long)])

    expect(get(container, '.outline-item__label').getAttribute('title')).toBe(long)
  })
})
