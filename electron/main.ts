import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import {
  IPC,
  MARKDOWN_EXTENSIONS,
  type ExportRequest,
  type Language,
  type MenuAction,
  type OpenResult,
  type Settings,
  type WriteResult
} from './shared'
import { getSettings, updateSettings } from './settings'
import { buildMenu } from './menu'
import { exportDocument } from './export'

let mainWindow: BrowserWindow | null = null
let pendingOpenPath: string | null = null
let forceQuit = false

function isMarkdown(filePath: string): boolean {
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extname(filePath).toLowerCase())
}

function fileFromArgv(argv: string[]): string | null {
  // Skip the executable (and, in dev, the script path). Look for a real .md file.
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('-')) continue
    if (isMarkdown(arg) && existsSync(arg)) return arg
  }
  return null
}

async function readDocument(filePath: string): Promise<OpenResult> {
  if (!isMarkdown(filePath)) return { ok: false, error: 'unsupported' }
  try {
    const content = await readFile(filePath, 'utf-8')
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

function sendMenuAction(action: MenuAction): void {
  mainWindow?.webContents.send(IPC.menuAction, action)
}

function refreshMenu(): void {
  buildMenu({
    language: getSettings().language,
    send: sendMenuAction,
    setLanguage: (lang) => applyLanguage(lang)
  })
}

function applyLanguage(lang: Language): void {
  updateSettings({ language: lang })
  refreshMenu()
  // Renderer keeps its own i18n in sync via the pushed setting.
  mainWindow?.webContents.send(IPC.setLanguage, lang)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: getSettings().theme === 'dark' ? '#1e1e1e' : '#ffffff',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
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

  // Close guard: ask the renderer before closing when there are unsaved edits.
  mainWindow.on('close', (e) => {
    if (forceQuit) return
    e.preventDefault()
    sendMenuAction('request-close')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getSettings, (): Settings => getSettings())

  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>): Settings => updateSettings(patch))

  ipcMain.handle(IPC.setLanguage, (_e, lang: Language): void => applyLanguage(lang))

  ipcMain.handle(IPC.openDialog, async (): Promise<OpenResult> => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
    return readDocument(filePaths[0])
  })

  ipcMain.handle(IPC.readPath, (_e, filePath: string): Promise<OpenResult> => readDocument(filePath))

  ipcMain.handle(IPC.save, async (_e, filePath: string, content: string): Promise<WriteResult> => {
    try {
      await writeFile(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.saveAs, async (_e, content: string, suggestedName?: string): Promise<WriteResult> => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: suggestedName ?? 'untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      await writeFile(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.export, (_e, request: ExportRequest): Promise<WriteResult> => exportDocument(request))

  ipcMain.handle(IPC.confirmClose, (_e, shouldClose: boolean): void => {
    if (shouldClose && mainWindow) {
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
    refreshMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
