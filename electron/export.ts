import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { EXPORT_PAGE_SIZES, type ExportFormat, type ExportPageSize, type ExportRequest, type WriteResult } from './shared'

const FILTERS: Record<ExportFormat, Electron.FileFilter> = {
  html: { name: 'HTML', extensions: ['html'] },
  pdf: { name: 'PDF', extensions: ['pdf'] },
  png: { name: 'PNG', extensions: ['png'] }
}

function isExportFormat(format: unknown): format is ExportFormat {
  return format === 'pdf' || format === 'html' || format === 'png'
}

function isPageSize(pageSize: unknown): pageSize is ExportPageSize {
  return EXPORT_PAGE_SIZES.some((size) => size.value === pageSize)
}

function pagePixels(pageSize: ExportPageSize): { width: number; height: number } {
  return EXPORT_PAGE_SIZES.find((size) => size.value === pageSize) ?? EXPORT_PAGE_SIZES[0]
}

/**
 * Export the current document. `request.html` is a fully rendered, standalone
 * HTML document (theme CSS already inlined by the renderer).
 * - HTML: write the string as-is.
 * - PDF: load the HTML into a hidden window and print it to PDF.
 * - PNG: render the HTML at the selected page width and capture it as an image.
 */
export async function exportDocument(request: ExportRequest): Promise<WriteResult> {
  const { format, pageSize, html, baseName } = request
  if (!isExportFormat(format) || !isPageSize(pageSize)) return { ok: false, error: 'Invalid export options.' }
  if (typeof html !== 'string' || typeof baseName !== 'string') return { ok: false, error: 'Invalid export content.' }

  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `${baseName}.${format}`,
    filters: [FILTERS[format]]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  try {
    if (format === 'html') {
      await writeFile(filePath, html, 'utf-8')
    } else if (format === 'pdf') {
      const pdf = await htmlToPdf(html, pageSize)
      await writeFile(filePath, pdf)
    } else {
      const png = await htmlToPng(html, pageSize)
      await writeFile(filePath, png)
    }
    return { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function createExportWindow(html: string, pageSize: ExportPageSize): Promise<BrowserWindow> {
  const size = pagePixels(pageSize)
  const win = new BrowserWindow({
    show: false,
    width: size.width,
    height: size.height,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  // Give web fonts / highlight styles a tick to settle.
  await new Promise((r) => setTimeout(r, 150))
  return win
}

async function htmlToPdf(html: string, pageSize: ExportPageSize): Promise<Buffer> {
  const win = await createExportWindow(html, pageSize)
  try {
    return await win.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'default' },
      pageSize
    })
  } finally {
    win.destroy()
  }
}

async function htmlToPng(html: string, pageSize: ExportPageSize): Promise<Buffer> {
  const size = pagePixels(pageSize)
  const win = await createExportWindow(html, pageSize)
  try {
    const documentHeight = (await win.webContents.executeJavaScript(
      'Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))'
    )) as number
    const height = Math.max(size.height, documentHeight)
    win.setContentSize(size.width, height)
    await new Promise((r) => setTimeout(r, 50))
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: size.width, height })
    return image.toPNG()
  } finally {
    win.destroy()
  }
}
