import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, isAbsolute, join } from 'node:path'
import {
  IPC,
  MARKDOWN_EXTENSIONS,
  SUPPORTED_LANGUAGES,
  type ImageDataResult,
  type Language,
  type OpenManyResult,
  type OpenResult,
  type Settings,
  type WriteResult
} from './shared'
import { getSettings, updateSettings } from './settings'
import { exportDocument } from './export'

let mainWindow: BrowserWindow | null = null
let pendingOpenPath: string | null = null
let forceQuit = false

if (process.platform === 'linux') {
  app.setDesktopName('moji.desktop')
}

const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const SAMPLE_FILES = new Set([
  'complete-markdown-guide.md',
  'guia-markdown-completo.md',
  'guia-markdown.es.md',
  'guia-markdown.ja.md',
  'guia-markdown.zh.md',
  'guia-markdown.ru.md',
])

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

function sanitizeSettingsPatch(value: unknown): Partial<Settings> {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const patch: Partial<Settings> = {}

  if (isLanguage(raw['language'])) patch.language = raw['language']
  if (typeof raw['previewFontFamily'] === 'string') patch.previewFontFamily = raw['previewFontFamily']
  if (typeof raw['previewFontSize'] === 'number') patch.previewFontSize = raw['previewFontSize']
  if (typeof raw['previewLineHeight'] === 'number') patch.previewLineHeight = raw['previewLineHeight']

  return patch
}

function suggestedMarkdownName(value: unknown): string {
  if (typeof value !== 'string') return 'untitled.md'
  const name = value.replace(/[\\/]/g, '').trim()
  if (!name) return 'untitled.md'
  return isMarkdown(name) ? name : `${name}.md`
}

function stripLeadingBom(content: string): string {
  return content.startsWith('\uFEFF') ? content.slice(1) : content
}

function isMarkdown(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string') return false
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extname(filePath).toLowerCase())
}

function isSupportedImage(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function imageMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.avif':
      return 'image/avif'
    case '.bmp':
      return 'image/bmp'
    case '.gif':
      return 'image/gif'
    case '.ico':
      return 'image/x-icon'
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

async function readImageAsDataUrl(filePath: unknown): Promise<ImageDataResult> {
  if (typeof filePath !== 'string') return { ok: false, error: 'unsupported' }
  if (!isAbsolute(filePath) || !isSupportedImage(filePath)) return { ok: false, error: 'unsupported' }
  try {
    const image = await readFile(filePath)
    return { ok: true, dataUrl: `data:${imageMimeType(filePath)};base64,${image.toString('base64')}` }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

function fileFromArgv(argv: string[]): string | null {
  // Skip the executable (and, in dev, the script path). Look for a real .md file.
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('-')) continue
    if (isMarkdown(arg) && existsSync(arg)) return arg
  }
  return null
}

function samplePath(sampleName: unknown): string | null {
  if (typeof sampleName !== 'string' || !SAMPLE_FILES.has(sampleName)) return null
  return join(app.getAppPath(), 'samples', sampleName)
}

async function readDocument(filePath: unknown): Promise<OpenResult> {
  if (!isMarkdown(filePath)) return { ok: false, error: 'unsupported' }
  try {
    const content = stripLeadingBom(await readFile(filePath, 'utf-8'))
    return { ok: true, path: filePath, content }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Single funnel for every open entry point (association, CLI, dialog, drop). */
async function openDocument(filePath: string): Promise<void> {
  const result = await readDocument(filePath)
  if (!mainWindow) {
    if (result.ok) pendingOpenPath = filePath
    return
  }
  if (result.ok) {
    mainWindow.webContents.send(IPC.openDocument, { path: result.path, content: result.content })
  }
}

function requestClose(): void {
  mainWindow?.webContents.send(IPC.requestClose)
}

function createWindow(): void {
  const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build', 'icon.png')
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    icon: existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: getSettings().theme === 'dark' ? '#1e1e1e' : '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.setMenuBarVisibility(false)
    mainWindow?.show()
    if (pendingOpenPath) {
      void openDocument(pendingOpenPath)
      pendingOpenPath = null
    }
  })

  // Open external links in the OS browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if ((devUrl && url.startsWith(devUrl)) || (!devUrl && url.startsWith('file://'))) return
    event.preventDefault()
    if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url)
  })

  // Close guard: ask the renderer before closing when there are unsaved edits.
  mainWindow.on('close', (e) => {
    if (forceQuit) return
    e.preventDefault()
    requestClose()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getSettings, (): Settings => getSettings())

  ipcMain.handle(IPC.setSettings, (_e, patch: unknown): Settings => updateSettings(sanitizeSettingsPatch(patch)))

  ipcMain.handle(IPC.openDialog, async (): Promise<OpenManyResult> => {
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    }
    const { canceled, filePaths } = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
    const results = await Promise.all(filePaths.map((filePath) => readDocument(filePath)))
    const failed = results.find((result) => !result.ok)
    if (failed && !failed.ok) return { ok: false, error: failed.error ?? 'open failed' }
    return {
      ok: true,
      documents: results
        .filter((result): result is { ok: true; path: string; content: string } => result.ok)
        .map(({ path, content }) => ({ path, content }))
    }
  })

  ipcMain.handle(IPC.readPath, (_e, filePath: unknown): Promise<OpenResult> => readDocument(filePath))

  ipcMain.handle(IPC.readImage, (_e, filePath: unknown): Promise<ImageDataResult> => readImageAsDataUrl(filePath))

  ipcMain.handle(IPC.readSample, (_e, name: unknown): Promise<OpenResult> => {
    const path = samplePath(name)
    return path ? readDocument(path) : Promise.resolve({ ok: false, error: 'unsupported' })
  })

  ipcMain.handle(IPC.save, async (_e, filePath: unknown, content: unknown): Promise<WriteResult> => {
    const path = asString(filePath)
    if (!path || !isMarkdown(path) || typeof content !== 'string') return { ok: false, error: 'unsupported' }
    try {
      await writeFile(path, content, 'utf-8')
      return { ok: true, path }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.saveAs, async (_e, content: unknown, suggestedName?: unknown): Promise<WriteResult> => {
    if (typeof content !== 'string') return { ok: false, error: 'unsupported' }
    const options: Electron.SaveDialogOptions = {
      defaultPath: suggestedMarkdownName(suggestedName),
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    }
    const { canceled, filePath } = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      await writeFile(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.export, (_e, request: unknown): Promise<WriteResult> => exportDocument(request))

  ipcMain.handle(IPC.confirmClose, (_e, shouldClose: unknown): void => {
    if (shouldClose === true && mainWindow) {
      forceQuit = true
      mainWindow.close()
    }
  })
}

// --- App lifecycle ---------------------------------------------------------

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const file = fileFromArgv(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    if (file) void openDocument(file)
  })

  // macOS / Linux file association via open-file event.
  app.on('open-file', (e, filePath) => {
    e.preventDefault()
    void openDocument(filePath)
  })

  app.whenReady().then(() => {
    pendingOpenPath = fileFromArgv(process.argv)
    registerIpc()
    Menu.setApplicationMenu(null)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
