import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const exportTempDirectory = join(tmpdir(), 'moji-export-tests')
const selectedHtmlPath = join(exportTempDirectory, 'chosen', 'report.html')
const selectedPdfPath = join(exportTempDirectory, 'chosen', 'report.pdf')
const selectedPngPath = join(exportTempDirectory, 'chosen', 'report.png')

const state = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  writeFile: vi.fn(),
  updateSettings: vi.fn(),
  getSettings: vi.fn(),
  loadURL: vi.fn(),
  executeJavaScript: vi.fn(),
  printToPDF: vi.fn(),
  capturePage: vi.fn(),
  setContentSize: vi.fn(),
  toPNG: vi.fn(),
  destroy: vi.fn(),
  windows: [] as unknown[]
}))

vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = {
      executeJavaScript: state.executeJavaScript,
      printToPDF: state.printToPDF,
      capturePage: state.capturePage
    }

    constructor(options: unknown) {
      state.windows.push(options)
    }

    loadURL = state.loadURL
    setContentSize = state.setContentSize
    destroy = state.destroy
  },
  dialog: { showSaveDialog: state.showSaveDialog },
  nativeImage: { createFromBitmap: vi.fn(() => ({ toPNG: state.toPNG })) },
  screen: { getPrimaryDisplay: vi.fn(() => ({ scaleFactor: 1 })) }
}))

vi.mock('node:fs/promises', () => ({ writeFile: state.writeFile }))

vi.mock('./settings', () => ({
  getSettings: state.getSettings,
  updateSettings: state.updateSettings
}))

const request = {
  format: 'html' as const,
  pageSize: 'A4' as const,
  pageOrientation: 'portrait' as const,
  html: '<article><div class="mermaid-diagram"><svg id="flowchart"><rect /></svg></div></article>',
  baseName: 'Report'
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.windows.length = 0
  state.getSettings.mockReturnValue({ lastDialogDirectory: exportTempDirectory })
  state.executeJavaScript.mockResolvedValue(undefined)
})

describe('exportDocument', () => {
  it('rejects malformed requests before opening save dialog', async () => {
    const { exportDocument } = await import('./export')

    await expect(exportDocument({ format: 'zip' })).resolves.toEqual({ ok: false, error: 'Invalid export request.' })
    expect(state.showSaveDialog).not.toHaveBeenCalled()
  })

  it('returns cancellation when no export destination is selected', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: true })
    const { exportDocument } = await import('./export')

    await expect(exportDocument(request)).resolves.toEqual({ ok: false, canceled: true })
    expect(state.writeFile).not.toHaveBeenCalled()
  })

  it('writes HTML and remembers selected directory', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedHtmlPath })
    state.writeFile.mockResolvedValue(undefined)
    const { exportDocument } = await import('./export')

    await expect(exportDocument(request)).resolves.toEqual({ ok: true, path: selectedHtmlPath })
    expect(state.showSaveDialog).toHaveBeenCalledWith({
      defaultPath: join(exportTempDirectory, 'Report.html'),
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })
    expect(state.writeFile).toHaveBeenCalledWith(selectedHtmlPath, request.html, 'utf-8')
    expect(state.updateSettings).toHaveBeenCalledWith({ lastDialogDirectory: dirname(selectedHtmlPath) })
  })

  it('uses a safe default name when requested export name contains only separators', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: true })
    const { exportDocument } = await import('./export')

    await exportDocument({ ...request, baseName: ' /\\ ' })

    expect(state.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: join(exportTempDirectory, 'document.html')
    }))
  })

  it('uses file name alone when no previous dialog directory exists', async () => {
    state.getSettings.mockReturnValue({})
    state.showSaveDialog.mockResolvedValue({ canceled: true })
    const { exportDocument } = await import('./export')

    await exportDocument(request)

    expect(state.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'Report.html' }))
  })

  it('returns write errors to renderer', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedHtmlPath })
    state.writeFile.mockRejectedValue(new Error('Disk full'))
    const { exportDocument } = await import('./export')

    await expect(exportDocument(request)).resolves.toEqual({ ok: false, error: 'Disk full' })
  })

  it('renders PDF in a secure hidden window before writing it', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPdfPath })
    state.printToPDF.mockResolvedValue(Buffer.from('pdf'))
    state.writeFile.mockResolvedValue(undefined)
    const { exportDocument } = await import('./export')

    await expect(exportDocument({ ...request, format: 'pdf', pageOrientation: 'landscape' })).resolves.toEqual({
      ok: true,
      path: selectedPdfPath
    })

    expect(state.windows).toEqual([expect.objectContaining({
      show: false,
      width: 1123,
      height: 794,
      webPreferences: expect.objectContaining({ sandbox: true, contextIsolation: true, nodeIntegration: false })
    })])
    expect(state.printToPDF).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 'A4', landscape: true }))
    expect(state.loadURL).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent(request.html)), expect.anything())
    expect(state.writeFile).toHaveBeenCalledWith(selectedPdfPath, Buffer.from('pdf'))
    expect(state.destroy).toHaveBeenCalledOnce()
  })

  it('renders PNG from HTML containing a Mermaid SVG', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPngPath })
    state.writeFile.mockResolvedValue(undefined)
    state.executeJavaScript
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(0)
    state.capturePage.mockResolvedValue({
      getSize: () => ({ width: 100, height: 100 }),
      toBitmap: () => Buffer.alloc(100 * 100 * 4)
    })
    const { exportDocument } = await import('./export')

    await expect(exportDocument({ ...request, format: 'png' })).resolves.toEqual({ ok: true, path: selectedPngPath })

    expect(state.loadURL).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent(request.html)), expect.anything())

    // The capture is encoded straight to PNG rather than assembled into a bitmap first,
    // so assert on the written file: a PNG signature, then an IHDR of the captured size.
    const [writtenPath, written] = state.writeFile.mock.calls[0] as [string, Buffer]
    expect(writtenPath).toBe(selectedPngPath)
    expect(written.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(written.readUInt32BE(16)).toBe(100)
    expect(written.readUInt32BE(20)).toBe(100)
  })

  it('exports Mermaid fallback code without invoking a diagram renderer', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedHtmlPath })
    state.writeFile.mockResolvedValue(undefined)
    const fallback = '<pre class="hljs mermaid-flowchart"><code>flowchart invalid</code></pre>'
    const { exportDocument } = await import('./export')

    await expect(exportDocument({ ...request, html: fallback })).resolves.toEqual({ ok: true, path: selectedHtmlPath })
    expect(state.writeFile).toHaveBeenCalledWith(selectedHtmlPath, fallback, 'utf-8')
  })
})
