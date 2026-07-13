import { BrowserWindow, dialog, nativeImage, screen } from 'electron'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  EXPORT_PAGE_SIZES,
  type ExportFormat,
  type ExportPageOrientation,
  type ExportPageSize,
  type ExportRequest,
  type WriteResult
} from './shared'
import { getSettings, updateSettings } from './settings'

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

function exportDefaultPath(baseName: string, format: ExportFormat): string {
  const fileName = `${exportBaseName(baseName)}.${format}`
  const directory = getSettings().lastDialogDirectory
  return directory ? join(directory, fileName) : fileName
}

function rememberDialogDirectory(filePath: string): void {
  updateSettings({ lastDialogDirectory: dirname(filePath) })
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
    defaultPath: exportDefaultPath(baseName, format),
    filters: [FILTERS[format]]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  rememberDialogDirectory(filePath)

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

/**
 * Chromium composes a page capture into a single GPU texture, which tops out at 16384px.
 * A capture taller than that fails outright with `UnknownVizError`, and a capture rect
 * taller than the window is silently truncated. Tall documents are therefore captured in
 * slices that stay under the cap and stitched back together.
 */
const MAX_CAPTURE_DEVICE_PX = 16384

async function htmlToPng(
  html: string,
  pageSize: ExportPageSize,
  pageOrientation: ExportPageOrientation,
  assetBaseUrl?: string
): Promise<Buffer> {
  const size = pagePixels(pageSize, pageOrientation)
  const win = await createExportWindow(html, pageSize, pageOrientation, assetBaseUrl)
  try {
    await win.webContents.executeJavaScript("document.documentElement.classList.add('export-png')")
    const documentHeight = (await win.webContents.executeJavaScript(
      'Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))'
    )) as number
    const totalHeight = Math.max(size.height, documentHeight)

    // The capture comes back in device pixels, so the usable slice shrinks as the display
    // scale grows: 8192 CSS pixels on a 2x screen, 16384 on a 1x one.
    const sliceHeight = Math.max(1, Math.floor(MAX_CAPTURE_DEVICE_PX / screen.getPrimaryDisplay().scaleFactor))

    win.setContentSize(size.width, Math.min(totalHeight, sliceHeight))
    await new Promise((r) => setTimeout(r, 50))

    const slices: Buffer[] = []
    let deviceWidth = 0
    let deviceHeight = 0

    for (let top = 0; top < totalHeight; top += sliceHeight) {
      const height = Math.min(sliceHeight, totalHeight - top)
      // The page cannot scroll past `totalHeight - viewport`, so the final scrollTo is
      // clamped. Capture from where the page actually landed, or the last slice repeats a
      // band already captured.
      const scrollY = (await win.webContents.executeJavaScript(
        `window.scrollTo(0, ${top}); Math.round(window.scrollY)`
      )) as number
      await new Promise((r) => setTimeout(r, 50))

      const image = await win.webContents.capturePage({
        x: 0,
        y: top - scrollY,
        width: size.width,
        height
      })
      const captured = image.getSize()
      deviceWidth = captured.width
      deviceHeight += captured.height
      slices.push(image.toBitmap())
    }

    return nativeImage
      .createFromBitmap(Buffer.concat(slices), { width: deviceWidth, height: deviceHeight, scaleFactor: 1 })
      .toPNG()
  } finally {
    win.destroy()
  }
}
