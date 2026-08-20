// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import './i18n'

/**
 * Integration cover for the window itself.
 *
 * These assert the behaviour the performance work depends on and that unit tests cannot
 * see: that Editor mode does no preview work, and that switching tabs does not lose text
 * the editor is still holding.
 */

/** What the main process persists; App replaces its defaults with whatever this returns. */
const settings = {
  theme: 'dark' as const,
  previewTheme: 'dark' as const,
  language: 'en' as const,
  previewFontFamily: 'Inter',
  previewFontSize: 16,
  editorFontSize: 14,
  previewLineHeight: 1.7,
  previewFluidWidth: false,
  previewWidth: 900,
  autoSave: true,
  recentFiles: [] as string[]
}

const api = {
  getDrafts: vi.fn(async () => []),
  saveDraft: vi.fn(async () => ({ ok: true as const })),
  appendDraftEdits: vi.fn(async () => ({ ok: true as const, outcome: 'appended' as const })),
  removeDraft: vi.fn(async () => ({ ok: true as const })),
  setSettings: vi.fn(async () => settings),
  readPath: vi.fn(async () => ({ ok: false as const, error: 'unsupported' })),
  readSample: vi.fn(async () => ({ ok: false as const, error: 'unsupported' })),
  openDialog: vi.fn(async () => ({ ok: false as const, canceled: true })),
  cancelOpenMany: vi.fn(async () => undefined),
  openLocalPath: vi.fn(async () => ({ ok: true as const, path: '' })),
  save: vi.fn(async () => ({ ok: true as const, path: '/doc.md' })),
  saveAs: vi.fn(async () => ({ ok: true as const, path: '/doc.md' })),
  exportAs: vi.fn(async () => ({ ok: true as const, path: '/doc.pdf' })),
  cancelExport: vi.fn(async () => undefined),
  confirmClose: vi.fn(async () => undefined),
  checkForUpdate: vi.fn(async () => undefined),
  getDroppedPath: vi.fn(() => null),
  onOpenDocument: vi.fn(() => () => undefined),
  onOpenManyProgress: vi.fn(() => () => undefined),
  onOpenManyDone: vi.fn(() => () => undefined),
  onExportProgress: vi.fn(() => () => undefined),
  onCloseRequest: vi.fn(() => () => undefined),
  onUpdateState: vi.fn(() => () => undefined),
  getUpdateState: vi.fn(async () => ({ status: 'unsupported' as const, currentVersion: '1.0.0' })),
  getSettings: vi.fn(async () => settings),
  getPerformanceReport: vi.fn(async () => ({}))
}

const renderMarkdownInWorker = vi.fn(async (source: string) => `<p>${source}</p>`)
const renderMarkdownDocumentInWorker = vi.fn(async (source: string) => ({
  html: `<p>${source}</p>`,
  outline: [],
  headingLines: new Map<string, number>()
}))

// The worker client needs a real Worker; the render itself is covered by markdown tests.
vi.mock('./lib/markdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/markdown')>()
  return {
    ...actual,
    renderMarkdownInWorker: (source: string) => renderMarkdownInWorker(source),
    renderMarkdownDocumentInWorker: (source: string) => renderMarkdownDocumentInWorker(source)
  }
})

// CodeMirror needs layout APIs jsdom does not provide, and this suite is about App's
// behaviour around the editor rather than the editor itself.
vi.mock('./components/Editor', () => ({
  Editor: ({ value }: { value: string }) => <textarea data-testid="editor" readOnly value={value} />
}))

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false
    })
  })
})

afterEach(() => {
  cleanup()
})

async function renderApp(): Promise<void> {
  const { App } = await import('./App')
  render(<App />)
  // The first paint kicks off draft restoration; let it settle before asserting.
  await waitFor(() => expect(api.getDrafts).toHaveBeenCalled())
}

describe('App', () => {
  it('mounts and offers the welcome screen when there is no document', async () => {
    await renderApp()

    expect(screen.queryByTestId('editor')).toBeNull()
  })

  it('does no preview rendering while there is nothing to show', async () => {
    await renderApp()

    // PERF-101: rendering markdown is the expensive path, and an empty workspace must
    // not enter it at all.
    expect(renderMarkdownDocumentInWorker).not.toHaveBeenCalled()
    expect(renderMarkdownInWorker).not.toHaveBeenCalled()
  })

  it('restores drafts saved by an earlier session', async () => {
    api.getDrafts.mockResolvedValueOnce([
      { id: 'draft-1', title: 'Recovered', content: '# Recovered' }
    ] as never)

    await renderApp()

    await waitFor(() => {
      expect(screen.getByText('Recovered')).toBeTruthy()
    })
  })

  it('asks the main process for drafts exactly once per session', async () => {
    await renderApp()

    expect(api.getDrafts).toHaveBeenCalledTimes(1)
  })
})

describe('App with a document open', () => {
  beforeEach(() => {
    api.getDrafts.mockResolvedValue([
      { id: 'draft-1', title: 'Notes', content: '# Heading\n\ntext' }
    ] as never)
  })

  it('renders the preview once for the restored document', async () => {
    await renderApp()

    await waitFor(() => expect(renderMarkdownDocumentInWorker).toHaveBeenCalled())
    expect(renderMarkdownDocumentInWorker).toHaveBeenCalledWith('# Heading\n\ntext')
  })

  it('stops rendering the preview once the editor takes over', async () => {
    const user = userEvent.setup()
    await renderApp()
    await waitFor(() => expect(renderMarkdownDocumentInWorker).toHaveBeenCalled())

    const renders = renderMarkdownDocumentInWorker.mock.calls.length
    await user.click(screen.getByRole('tab', { name: 'Editor' }))
    await waitFor(() => expect(screen.getByTestId('editor')).toBeTruthy())

    // PERF-101: the preview is unmounted in Editor mode, so no further render may run.
    expect(renderMarkdownDocumentInWorker.mock.calls.length).toBe(renders)
  })

  it('keeps the document text when switching back from the editor', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('tab', { name: 'Editor' }))
    const editor = await screen.findByTestId('editor')
    expect((editor as HTMLTextAreaElement).value).toBe('# Heading\n\ntext')

    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    await waitFor(() => expect(screen.queryByTestId('editor')).toBeNull())

    // The text survived the round trip rather than being dropped with the editor.
    // The preview render is debounced, so wait for it rather than assuming it already ran.
    await waitFor(() =>
      expect(renderMarkdownDocumentInWorker).toHaveBeenLastCalledWith('# Heading\n\ntext')
    )
  })
})
