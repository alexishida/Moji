import { app, BrowserWindow, dialog, screen } from 'electron'
import { open, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import {
  EXPORT_PAGE_SIZES,
  type DiagramPngRequest,
  type ExportFormat,
  type ExportPageOrientation,
  type ExportPageSize,
  type ExportRequest,
  type WriteResult
} from './shared'
import { getSettings, updateSettings } from './settings'
import { createPngFileWriter } from './png'
import { beginMainMeasure, captureMainMemory, captureWebContentsMemory } from './performance'

const FILTERS: Record<ExportFormat, Electron.FileFilter> = {
  html: { name: 'HTML', extensions: ['html'] },
  pdf: { name: 'PDF', extensions: ['pdf'] },
  png: { name: 'PNG', extensions: ['png'] }
}

/**
 * Chromium composes a page capture into a single GPU texture, which tops out at 16384px.
 * A capture taller than that fails outright with `UnknownVizError`, and a capture rect
 * taller than the window is silently truncated. Tall documents are therefore captured in
 * slices that stay under the cap.
 */
const MAX_CAPTURE_DEVICE_PX = 16384

/**
 * Height of one capture, in CSS pixels. The texture limit above only bounds this; it is
 * not a target. Since each slice is compressed and released as it is captured, a smaller
 * slice simply costs less memory, at the price of one more scroll and capture.
 */
const CAPTURE_SLICE_CSS_PX = 2048

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

  const { format, baseName } = request

  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: exportDefaultPath(baseName, format),
      filters: [FILTERS[format]]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    rememberDialogDirectory(filePath)

    return await exportDocumentToPath(request, filePath)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Export without native dialog. Used only by local `--benchmark` runner. */
export async function exportDocumentToPath(request: unknown, filePath: string): Promise<WriteResult> {
  if (!isExportRequest(request)) return { ok: false, error: 'Invalid export request.' }
  const { format, pageSize, pageOrientation, html, assetBaseUrl } = request
  const finishMeasure = beginMainMeasure('document:export', { htmlChars: html.length })
  try {
    if (format === 'html') await writeFile(filePath, html, 'utf-8')
    else if (format === 'pdf') await writeFile(filePath, await htmlToPdf(html, pageSize, pageOrientation, assetBaseUrl))
    else await htmlToPngFile(filePath, html, pageSize, pageOrientation, assetBaseUrl)
    void captureMainMemory('main:memory:document-export')
    return { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  } finally {
    finishMeasure()
  }
}

function isDiagramPngRequest(request: unknown): request is DiagramPngRequest {
  if (!request || typeof request !== 'object') return false
  const raw = request as Record<string, unknown>
  return typeof raw['dataUrl'] === 'string' && typeof raw['baseName'] === 'string'
}

/** Save one renderer-created Mermaid PNG through Electron's native save dialog. */
export async function exportDiagramPng(request: unknown): Promise<WriteResult> {
  if (!isDiagramPngRequest(request)) return { ok: false, error: 'Invalid diagram PNG request.' }

  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(request.dataUrl)
  if (!match) return { ok: false, error: 'Invalid diagram PNG data.' }

  const png = Buffer.from(match[1], 'base64')
  const isPng = png.length >= 8 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (!isPng) return { ok: false, error: 'Invalid diagram PNG data.' }

  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: exportDefaultPath(request.baseName, 'png'),
    filters: [FILTERS.png]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  rememberDialogDirectory(filePath)

  try {
    await writeFile(filePath, png)
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

/** Opening tag of the document head, where the `<base>` below has to land. */
const HEAD_TAG = /<head[^>]*>/i

/** The temporary file the hidden window loads, and the promise that removes it. */
interface ExportSource {
  path: string
  /** Removes the file. Never throws: a leftover temporary must not fail an export that worked. */
  discard: () => Promise<void>
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * Writes the document the hidden window renders from.
 *
 * The document used to travel as `data:text/html;charset=utf-8,` + `encodeURIComponent(html)`: a
 * percent-encoded copy of the whole export, around three times its size, built in main and parsed
 * back by Chromium. A temporary file carries the same bytes without that copy ever existing — the
 * document is written once, in slices that share the original string, and Chromium reads it from
 * disk.
 *
 * The `data:` URL resolved relative assets through `baseURLForDataURL`. A file in the temporary
 * directory would resolve them against that directory instead, so a `<base>` naming the document's
 * own directory is written into the head. Relative images and links written as raw HTML inside the
 * Markdown therefore keep resolving exactly where they did.
 */
async function writeExportSource(html: string, assetBaseUrl?: string): Promise<ExportSource> {
  const path = join(app.getPath('temp'), `moji-export-${randomUUID()}.html`)
  const base = exportAssetBaseUrl(assetBaseUrl)
  // Without a head there is nowhere valid to put the base: a stray tag before the doctype would
  // switch the document to quirks mode, which changes far more than asset resolution.
  const head = base ? HEAD_TAG.exec(html) : null
  const discard = async (): Promise<void> => {
    try {
      await unlink(path)
    } catch {
      // Already gone, or never created. Either way there is nothing to clean up.
    }
  }

  const handle = await open(path, 'w')
  try {
    if (head) {
      const insertAt = head.index + head[0].length
      await handle.write(html.slice(0, insertAt))
      await handle.write(`<base href="${escapeAttribute(base as string)}">`)
      await handle.write(html.slice(insertAt))
    } else {
      await handle.write(html)
    }
  } catch (err) {
    await discard()
    throw err
  } finally {
    await handle.close()
  }

  return { path, discard }
}

/**
 * Renders the export in a hidden window and tears down everything it needed.
 *
 * The window stays sandboxed, context-isolated and without Node, because it renders a document
 * assembled from the user's Markdown. The temporary file is removed after the window is gone,
 * whether the render succeeded, failed or never started.
 */
async function withExportWindow<T>(
  html: string,
  pageSize: ExportPageSize,
  pageOrientation: ExportPageOrientation,
  assetBaseUrl: string | undefined,
  use: (win: BrowserWindow) => Promise<T>
): Promise<T> {
  const source = await writeExportSource(html, assetBaseUrl)
  let win: BrowserWindow | null = null
  try {
    win = await createExportWindow(source.path, html.length, pageSize, pageOrientation)
    return await use(win)
  } finally {
    win?.destroy()
    await source.discard()
  }
}

async function createExportWindow(
  sourcePath: string,
  htmlChars: number,
  pageSize: ExportPageSize,
  pageOrientation: ExportPageOrientation
): Promise<BrowserWindow> {
  const finishMeasure = beginMainMeasure('export-window:mount', { htmlChars })
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
  try {
    await win.loadFile(sourcePath)
    await waitForFonts(win)
    void captureWebContentsMemory('export-window:memory', win.webContents)
    return win
  } catch (err) {
    // The caller never receives this window, so nothing else would close it.
    win.destroy()
    throw err
  } finally {
    finishMeasure()
  }
}

async function htmlToPdf(
  html: string,
  pageSize: ExportPageSize,
  pageOrientation: ExportPageOrientation,
  assetBaseUrl?: string
): Promise<Buffer> {
  return withExportWindow(html, pageSize, pageOrientation, assetBaseUrl, async (win) => {
    const finishMeasure = beginMainMeasure('export:pdf-render', { htmlChars: html.length })
    try {
      return await win.webContents.printToPDF({
        printBackground: true,
        margins: { marginType: 'default' },
        pageSize,
        landscape: pageOrientation === 'landscape'
      })
    } finally {
      finishMeasure()
    }
  })
}

/** Height of one capture, in CSS pixels, honouring both the texture cap and the display scale. */
function captureSliceHeight(): number {
  const withinTexture = Math.floor(MAX_CAPTURE_DEVICE_PX / screen.getPrimaryDisplay().scaleFactor)
  return Math.max(1, Math.min(CAPTURE_SLICE_CSS_PX, withinTexture))
}

/** Capture the page in slices and stream them straight into `filePath`. */
async function htmlToPngFile(
  filePath: string,
  html: string,
  pageSize: ExportPageSize,
  pageOrientation: ExportPageOrientation,
  assetBaseUrl?: string
): Promise<void> {
  const size = pagePixels(pageSize, pageOrientation)
  return withExportWindow(html, pageSize, pageOrientation, assetBaseUrl, async (win) => {
    const finishMeasure = beginMainMeasure('export:png-render', { htmlChars: html.length })
    try {
      await win.webContents.executeJavaScript("document.documentElement.classList.add('export-png')")
      const documentHeight = (await win.webContents.executeJavaScript(
        'Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))'
      )) as number

      const totalHeight = Math.max(size.height, documentHeight)
      const sliceHeight = captureSliceHeight()

      win.setContentSize(size.width, Math.min(totalHeight, sliceHeight))
      await new Promise((r) => setTimeout(r, 50))

      // Each slice is compressed and written out as it is captured, so peak memory follows
      // the slice height rather than the height of the document.
      const writer = await createPngFileWriter(filePath)
      let width = 0
      let height = 0

      try {
        for (let top = 0; top < totalHeight; top += sliceHeight) {
          const remaining = Math.min(sliceHeight, totalHeight - top)

          // The page cannot scroll past `totalHeight - viewport`, so the final scrollTo is
          // clamped. Capture from where the page actually landed, or the last slice repeats
          // a band already captured.
          const scrollY = (await win.webContents.executeJavaScript(
            `window.scrollTo(0, ${top}); Math.round(window.scrollY)`
          )) as number
          await new Promise((r) => setTimeout(r, 50))

          const image = await win.webContents.capturePage({
            x: 0,
            y: top - scrollY,
            width: size.width,
            height: remaining
          })

          const captured = image.getSize()
          width = captured.width
          height += captured.height
          await writer.addSlice(image.toBitmap(), captured.width, captured.height)
        }

        await writer.finish(width, height)
      } catch (err) {
        // A half-written capture is worse than no file at all.
        await writer.abort()
        throw err
      }
    } finally {
      finishMeasure()
    }
  })
}
