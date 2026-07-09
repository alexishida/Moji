import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import {
  EXPORT_PAGE_SIZES,
  type ExportFormat,
  type ExportPageOrientation,
  type ExportPageSize,
  type ExportRequest,
  type WriteResult
} from './shared'

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

function isPageOrientation(pageOrientation: unknown): pageOrientation is ExportPageOrientation {
  return pageOrientation === 'portrait' || pageOrientation === 'landscape'
}

function isExportRequest(request: unknown): request is ExportRequest {
  if (!request || typeof request !== 'object') return false
  const raw = request as Record<string, unknown>
  return (
    isExportFormat(raw['format']) &&
    isPageSize(raw['pageSize']) &&
    isPageOrientation(raw['pageOrientation']) &&
    typeof raw['html'] === 'string' &&
    typeof raw['baseName'] === 'string'
  )
}

function pagePixels(pageSize: ExportPageSize, pageOrientation: ExportPageOrientation): { width: number; height: number } {
  const size = EXPORT_PAGE_SIZES.find((item) => item.value === pageSize) ?? EXPORT_PAGE_SIZES[0]
  if (pageOrientation === 'portrait') return size
  return { width: size.height, height: size.width }
}

function exportAssetBaseUrl(assetBaseUrl: unknown): string | undefined {
  if (typeof assetBaseUrl !== 'string') return undefined
  return assetBaseUrl.startsWith('file://') ? assetBaseUrl : undefined
}

function exportBaseName(baseName: string): string {
  return baseName.replace(/[\\/]/g, '').trim() || 'document'
}

/**
 * Export the current document. `request.html` is a fully rendered, standalone
 * HTML document (theme CSS already inlined by the renderer).
 * - HTML: write the string as-is.
 * - PDF: load the HTML into a hidden window and print it to PDF.
 * - PNG: render the HTML at the selected page width and capture it as an image.
 */
export async function exportDocument(request: unknown): Promise<WriteResult> {
  if (!isExportRequest(request)) return { ok: false, error: 'Invalid export request.' }

  const { format, pageSize, pageOrientation, html, assetBaseUrl, baseName } = request

  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `${exportBaseName(baseName)}.${format}`,
    filters: [FILTERS[format]]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  try {
    if (format === 'html') {
      await writeFile(filePath, html, 'utf-8')
    } else if (format === 'pdf') {
      const pdf = await htmlToPdf(html, pageSize, pageOrientation, assetBaseUrl)
      await writeFile(filePath, pdf)
    } else {
      const png = await htmlToPng(html, pageSize, pageOrientation, assetBaseUrl)
      await writeFile(filePath, png)
    }
    return { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function waitForFonts(win: BrowserWindow): Promise<void> {
  await Promise.race([
    win.webContents.executeJavaScript('document.fonts.ready'),
    new Promise((r) => setTimeout(r, 5000))
  ])
}

async function createExportWindow(
  html: string,
  pageSize: ExportPageSize,
  pageOrientation: ExportPageOrientation,
  assetBaseUrl?: string
): Promise<BrowserWindow> {
  const size = pagePixels(pageSize, pageOrientation)
  const win = new BrowserWindow({
    show: false,
    width: size.width,
    height: size.height,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html), {
    baseURLForDataURL: exportAssetBaseUrl(assetBaseUrl)
  })
  await waitForFonts(win)
  return win
}

async function htmlToPdf(
  html: string,
  pageSize: ExportPageSize,
  pageOrientation: ExportPageOrientation,
  assetBaseUrl?: string
): Promise<Buffer> {
  const win = await createExportWindow(html, pageSize, pageOrientation, assetBaseUrl)
  try {
    return await win.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'default' },
      pageSize,
      landscape: pageOrientation === 'landscape'
    })
  } finally {
    win.destroy()
  }
}

async function htmlToPng(
  html: string,
  pageSize: ExportPageSize,
  pageOrientation: ExportPageOrientation,
  assetBaseUrl?: string
): Promise<Buffer> {
  const size = pagePixels(pageSize, pageOrientation)
  const win = await createExportWindow(html, pageSize, pageOrientation, assetBaseUrl)
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
