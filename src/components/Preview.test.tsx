// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Preview } from './Preview'
import type { Settings, Theme } from '../../electron/shared'
import { renderComponent, type Rendered } from '../test/harness'

vi.mock('../lib/mermaid', () => ({
  patchMermaidFlowcharts: () => Promise.resolve(0)
}))

const settings: Settings = {
  theme: 'dark',
  previewTheme: 'dark',
  language: 'en',
  previewFontFamily: 'Inter',
  previewFontSize: 16,
  editorFontSize: 14,
  previewLineHeight: 1.7,
  previewFluidWidth: false,
  splitView: false,
  splitRatio: 50,
  previewWidth: 70,
  autoSave: true,
  recentFiles: []
}

const html = '<p><img data-local-asset="moji-asset://doc/picture.png" alt="picture"></p>'

function view(mdTheme: Theme) {
  return (
    <Preview
      html={html}
      documentName="doc.md"
      mdTheme={mdTheme}
      searchTerm=""
      activeSearchIndex={null}
      onSearchMatchCountChange={() => {}}
      onActiveHeadingChange={() => {}}
      settings={settings}
      onOpenLocalPath={() => {}}
      onPreviewHeadingsChange={() => {}}
    />
  )
}

let rendered: Rendered | null = null

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

describe('Preview local images', () => {
  it('keeps loading them after the reading theme changes', () => {
    rendered = renderComponent(view('light'))
    const image = () => rendered?.container.querySelector('img') as HTMLImageElement
    expect(image().getAttribute('src')).toBe('moji-asset://doc/picture.png')

    rendered.rerender(view('dark'))
    // The body remounts from the pristine HTML, so the source has to be applied again.
    expect(image().getAttribute('src')).toBe('moji-asset://doc/picture.png')
  })
})
