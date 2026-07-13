import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const exportTempDirectory = join(tmpdir(), 'moji-export-tests')
const selectedHtmlPath = join(exportTempDirectory, 'chosen', 'report.html')
const selectedPdfPath = join(exportTempDirectory, 'chosen', 'report.pdf')

const state = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  writeFile: vi.fn(),
  updateSettings: vi.fn(),
  getSettings: vi.fn(),
  loadURL: vi.fn(),
  executeJavaScript: vi.fn(),
  printToPDF: vi.fn(),
  destroy: vi.fn(),
  windows: [] as unknown[]
}))

vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = {
      executeJavaScript: state.executeJavaScript,
      printToPDF: state.printToPDF
    }

    constructor(options: unknown) {
      state.windows.push(options)
    }

    loadURL = state.loadURL
    destroy = state.destroy
  },
  dialog: { showSaveDialog: state.showSaveDialog }
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
  html: '<article>Content</article>',
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
    expect(state.writeFile).toHaveBeenCalledWith(selectedPdfPath, Buffer.from('pdf'))
    expect(state.destroy).toHaveBeenCalledOnce()
  })
})
