import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
// `rm` is mocked below, so the fixture directory is reset through the unmocked sync API.
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const exportTempDirectory = join(tmpdir(), 'moji-export-tests')

const selectedHtmlPath = join(exportTempDirectory, 'chosen', 'report.html')
const selectedPdfPath = join(exportTempDirectory, 'chosen', 'report.pdf')
const selectedPngPath = join(exportTempDirectory, 'chosen', 'report.png')
const selectedDiagramPngPath = join(exportTempDirectory, 'chosen', 'mermaid-diagram.png')
const pngDataUrl = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1]).toString('base64')}`

/** Side of the square page the fake capture stands in for, in device pixels. */
const capturedSize = 100
/** A captured pixel is blue, green, red, alpha: the BGRA layout `toBitmap` returns. */
const BYTES_PER_PIXEL = 4

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
// The IHDR chunk opens the file: signature (8), length (4), type (4), then width and height.
const IHDR_WIDTH_OFFSET = 16
const IHDR_HEIGHT_OFFSET = 20

const paths = vi.hoisted(() => {
  const { tmpdir } = require('node:os')
  const { join } = require('node:path')
  const directory = join(tmpdir(), 'moji-export-tests-temp')
  return { directory, page: join(directory, 'moji-export-fixed-uuid.html') }
})

/** Stands in for the OS temp directory the export page is written into. */
const exportPageDirectory = paths.directory
/** The page path `writeExportSource` builds from that directory and a fixed UUID. */
const exportPagePath = paths.page

const state = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  writeFile: vi.fn(),
  updateSettings: vi.fn(),
  getSettings: vi.fn(),
  loadURL: vi.fn(),
  loadFile: vi.fn(),
  open: vi.fn(),
  unlink: vi.fn(),
  /** Everything written to the temp export page, in order. */
  sourceWrites: [] as string[],
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
    loadFile = state.loadFile
    setContentSize = state.setContentSize
    destroy = state.destroy
  },
  app: { getPath: vi.fn(() => exportPageDirectory) },
  dialog: { showSaveDialog: state.showSaveDialog },
  nativeImage: { createFromBitmap: vi.fn(() => ({ toPNG: state.toPNG })) },
  screen: { getPrimaryDisplay: vi.fn(() => ({ scaleFactor: 1 })) }
}))

// The PNG writer opens the destination itself and streams into it, so the real file
// system stays in place and only the calls the export makes directly are observed.
// Partial mock: the PNG writer opens and renames the destination for real, so only the
// calls the export makes for its temp page are intercepted.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    writeFile: state.writeFile,
    unlink: (path: string) => {
      state.unlink(path)
      return actual.unlink(path).catch(() => undefined)
    },
    open: (path: string, flags: string) =>
      path === paths.page ? state.open(path, flags) : actual.open(path, flags)
  }
})

// A fixed name keeps the temp page path predictable across a run.
vi.mock('node:crypto', () => ({ randomUUID: () => 'fixed-uuid' }))

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

beforeEach(async () => {
  // The streamed PNG lands on the real file system, so give it a real, empty directory.
  rmSync(dirname(selectedPngPath), { recursive: true, force: true })
  mkdirSync(dirname(selectedPngPath), { recursive: true })
  vi.resetModules()
  vi.clearAllMocks()
  state.windows.length = 0
  state.getSettings.mockReturnValue({ lastDialogDirectory: exportTempDirectory })
  state.executeJavaScript.mockResolvedValue(undefined)
  state.sourceWrites.length = 0
  state.open.mockResolvedValue({
    write: (chunk: string) => {
      state.sourceWrites.push(chunk)
      return Promise.resolve()
    },
    close: () => Promise.resolve()
  })
  state.unlink.mockResolvedValue(undefined)
  state.loadFile.mockResolvedValue(undefined)
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
    expect(state.loadFile).toHaveBeenCalledWith(exportPagePath)
    expect(state.loadURL).not.toHaveBeenCalled()
    expect(state.writeFile).toHaveBeenCalledWith(selectedPdfPath, Buffer.from('pdf'))
    expect(state.destroy).toHaveBeenCalledOnce()
  })

  it('renders PNG from HTML containing a Mermaid SVG', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPngPath })
    state.writeFile.mockResolvedValue(undefined)
    state.executeJavaScript
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(capturedSize)
      .mockResolvedValueOnce(0)
    state.capturePage.mockResolvedValue({
      getSize: () => ({ width: capturedSize, height: capturedSize }),
      toBitmap: () => Buffer.alloc(capturedSize * capturedSize * BYTES_PER_PIXEL)
    })
    const { exportDocument } = await import('./export')

    await expect(exportDocument({ ...request, format: 'png' })).resolves.toEqual({ ok: true, path: selectedPngPath })

    expect(state.loadFile).toHaveBeenCalledWith(exportPagePath)

    // The capture is encoded straight to PNG rather than assembled into a bitmap first,
    // so assert on the written file: a PNG signature, then an IHDR of the captured size.
    const written = await readFile(selectedPngPath)
    expect(written.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE)
    expect(written.readUInt32BE(IHDR_WIDTH_OFFSET)).toBe(capturedSize)
    expect(written.readUInt32BE(IHDR_HEIGHT_OFFSET)).toBe(capturedSize)
  })

  it('leaves no partial PNG behind when a capture fails midway', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPngPath })
    state.writeFile.mockResolvedValue(undefined)
    state.executeJavaScript
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(capturedSize)
      .mockResolvedValueOnce(0)
    state.capturePage.mockRejectedValue(new Error('UnknownVizError'))
    const { exportDocument } = await import('./export')

    await expect(exportDocument({ ...request, format: 'png' })).resolves.toEqual({
      ok: false,
      error: 'UnknownVizError'
    })
    await expect(readFile(selectedPngPath)).rejects.toThrow()
    await expect(readFile(`${selectedPngPath}.tmp`)).rejects.toThrow()
  })

  it('hands the page to Chromium as a temp file rather than a percent-encoded data URL', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPdfPath })
    state.printToPDF.mockResolvedValue(Buffer.from('pdf'))
    state.writeFile.mockResolvedValue(undefined)
    const { exportDocument } = await import('./export')

    await exportDocument({ ...request, format: 'pdf' })

    // The document reaches Chromium as a file: no percent-encoded copy of the whole export.
    expect(state.loadFile).toHaveBeenCalledWith(exportPagePath)
    expect(state.loadURL).not.toHaveBeenCalled()
    expect(state.sourceWrites.join('')).toBe(request.html)
  })

  it('resolves relative assets by giving the page a base href', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPdfPath })
    state.printToPDF.mockResolvedValue(Buffer.from('pdf'))
    state.writeFile.mockResolvedValue(undefined)
    const { exportDocument } = await import('./export')

    await exportDocument({
      ...request,
      format: 'pdf',
      html: '<html><head></head><body>x</body></html>',
      assetBaseUrl: 'file:///docs/notes/'
    })

    expect(state.sourceWrites.join('')).toContain('<base href="file:///docs/notes/">')
  })

  it('writes no base href when the document has no head to put it in', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPdfPath })
    state.printToPDF.mockResolvedValue(Buffer.from('pdf'))
    state.writeFile.mockResolvedValue(undefined)
    const { exportDocument } = await import('./export')

    // A tag before the doctype would switch the document to quirks mode.
    await exportDocument({ ...request, format: 'pdf', html: '<p>no head</p>', assetBaseUrl: 'file:///docs/' })

    expect(state.sourceWrites.join('')).toBe('<p>no head</p>')
  })

  it('leaves the exported HTML file free of the base href used by the hidden window', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedHtmlPath })
    state.writeFile.mockResolvedValue(undefined)
    const { exportDocument } = await import('./export')

    await exportDocument({ ...request, assetBaseUrl: 'file:///docs/notes/' })

    // The saved file carries no local path from the machine that produced it.
    expect(state.writeFile).toHaveBeenCalledWith(selectedHtmlPath, request.html, 'utf-8')
  })

  it('removes the temp page after a successful export', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPdfPath })
    state.printToPDF.mockResolvedValue(Buffer.from('pdf'))
    state.writeFile.mockResolvedValue(undefined)
    const { exportDocument } = await import('./export')

    await exportDocument({ ...request, format: 'pdf' })

    expect(state.unlink).toHaveBeenCalledWith(exportPagePath)
  })

  it('removes the temp page when rendering fails', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPdfPath })
    state.printToPDF.mockRejectedValue(new Error('Render crashed'))
    state.writeFile.mockResolvedValue(undefined)
    const { exportDocument } = await import('./export')

    await expect(exportDocument({ ...request, format: 'pdf' })).resolves.toEqual({
      ok: false,
      error: 'Render crashed'
    })
    expect(state.unlink).toHaveBeenCalledWith(exportPagePath)
    expect(state.destroy).toHaveBeenCalledOnce()
  })

  it('removes the temp page when the page itself cannot be loaded', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPdfPath })
    state.loadFile.mockRejectedValue(new Error('ERR_FILE_NOT_FOUND'))
    state.writeFile.mockResolvedValue(undefined)
    const { exportDocument } = await import('./export')

    await expect(exportDocument({ ...request, format: 'pdf' })).resolves.toEqual({
      ok: false,
      error: 'ERR_FILE_NOT_FOUND'
    })
    expect(state.unlink).toHaveBeenCalledWith(exportPagePath)
  })

})

describe('exportDiagramPng', () => {
  it('writes a renderer-created diagram PNG through the native save dialog', async () => {
    state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedDiagramPngPath })
    state.writeFile.mockResolvedValue(undefined)
    const { exportDiagramPng } = await import('./export')

    await expect(exportDiagramPng({ dataUrl: pngDataUrl, baseName: 'mermaid-diagram' })).resolves.toEqual({
      ok: true,
      path: selectedDiagramPngPath
    })

    expect(state.showSaveDialog).toHaveBeenCalledWith({
      defaultPath: join(exportTempDirectory, 'mermaid-diagram.png'),
      filters: [{ name: 'PNG', extensions: ['png'] }]
    })
    expect(state.writeFile).toHaveBeenCalledWith(selectedDiagramPngPath, Buffer.from(pngDataUrl.split(',')[1], 'base64'))
  })

  it('rejects non-PNG data before opening the save dialog', async () => {
    const { exportDiagramPng } = await import('./export')

    await expect(exportDiagramPng({ dataUrl: 'data:image/png;base64,aGVsbG8=', baseName: 'diagram' })).resolves.toEqual({
      ok: false,
      error: 'Invalid diagram PNG data.'
    })
    expect(state.showSaveDialog).not.toHaveBeenCalled()
  })
})
