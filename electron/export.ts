import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import type { ExportFormat, ExportRequest, WriteResult } from './shared'

const FILTERS: Record<ExportFormat, Electron.FileFilter> = {
  html: { name: 'HTML', extensions: ['html'] },
  pdf: { name: 'PDF', extensions: ['pdf'] }
}

/**
 * Export the current document. `request.html` is a fully rendered, standalone
 * HTML document (theme CSS already inlined by the renderer).
 * - HTML: write the string as-is.
 * - PDF: load the HTML into a hidden window and print it to PDF.
 */
export async function exportDocument(request: ExportRequest): Promise<WriteResult> {
  const { format, html, baseName } = request
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `${baseName}.${format}`,
    filters: [FILTERS[format]]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  try {
    if (format === 'html') {
      await writeFile(filePath, html, 'utf-8')
    } else {
      const pdf = await htmlToPdf(html)
      await writeFile(filePath, pdf)
    }
    return { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function htmlToPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true }
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    // Give web fonts / highlight styles a tick to settle.
    await new Promise((r) => setTimeout(r, 150))
    return await win.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'default' },
      pageSize: 'A4'
    })
  } finally {
    win.destroy()
  }
}
