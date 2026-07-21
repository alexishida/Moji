import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  IPC,
  MARKDOWN_EXTENSIONS,
  MAX_WORKSPACE_SEARCH_RESULTS,
  SUPPORTED_LANGUAGES,
  type ImageDataResult,
  type Language,
  type OpenFolderResult,
  type OpenManyResult,
  type OpenPathResult,
  type OpenResult,
  type Settings,
  type UpdateState,
  type WorkspaceFileEntry,
  type WorkspaceSearchMatch,
  type WorkspaceSearchRequest,
  type WorkspaceSearchResult,
  type WindowBounds,
  type WriteResult
} from './shared'
import { getSettings, updateSettings } from './settings'
import { exportDiagramPng, exportDocument } from './export'
import { createUpdateController, type UpdateController } from './updater'

let mainWindow: BrowserWindow | null = null
let pendingOpenPath: string | null = null
let forceQuit = false
let pendingQuit = false
let pendingUpdateInstall = false
let updateController: UpdateController | null = null
let persistWindowBoundsTimer: NodeJS.Timeout | null = null

if (process.platform === 'linux') {
  app.setDesktopName('moji.desktop')
}

/**
 * macOS spells `app.name` throughout the application menu: "About …", "Hide …", "Quit …".
 * That name comes from the lowercase npm package name, so the menu would read "Quit moji".
 *
 * `app.name` also decides where `userData` lives, so renaming the app would move the
 * settings directory and orphan the preferences of everyone already running Moji, on every
 * platform. The name is corrected for display and the settings directory is pinned to the
 * one shipped builds already use.
 */
const SETTINGS_DIRECTORY = 'moji'
app.setName('Moji')
app.setPath('userData', join(app.getPath('appData'), SETTINGS_DIRECTORY))

const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const IGNORED_WORKSPACE_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release'
])
const SAMPLE_FILES = new Set([
  'markdown-guide.en.md',
  'markdown-guide.pt-BR.md',
  'markdown-guide.es.md',
  'markdown-guide.ja.md',
  'markdown-guide.zh.md',
  'markdown-guide.ru.md',
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
  if (raw['previewTheme'] === 'light' || raw['previewTheme'] === 'dark') patch.previewTheme = raw['previewTheme']
  if (typeof raw['previewFontFamily'] === 'string') patch.previewFontFamily = raw['previewFontFamily']
  if (typeof raw['previewFontSize'] === 'number') patch.previewFontSize = raw['previewFontSize']
  if (typeof raw['previewLineHeight'] === 'number') patch.previewLineHeight = raw['previewLineHeight']
  if (typeof raw['previewFluidWidth'] === 'boolean') patch.previewFluidWidth = raw['previewFluidWidth']
  if (Array.isArray(raw['recentFiles'])) patch.recentFiles = raw['recentFiles'].filter((p): p is string => typeof p === 'string')
  if (Array.isArray(raw['recentFolders'])) {
    patch.recentFolders = raw['recentFolders'].filter((p): p is string => typeof p === 'string')
  }
  if (isWindowBounds(raw['windowBounds'])) patch.windowBounds = raw['windowBounds']

  return patch
}

function isWindowBounds(value: unknown): value is WindowBounds {
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  return typeof raw['width'] === 'number' && typeof raw['height'] === 'number'
}

function suggestedMarkdownName(value: unknown): string {
  if (typeof value !== 'string') return 'untitled.md'
  const name = value.replace(/[\\/]/g, '').trim()
  if (!name) return 'untitled.md'
  return isMarkdown(name) ? name : `${name}.md`
}

function lastDialogDirectory(): string | undefined {
  const directory = getSettings().lastDialogDirectory
  return typeof directory === 'string' && directory.length > 0 ? directory : undefined
}

function rememberDialogDirectory(filePath: string): void {
  updateSettings({ lastDialogDirectory: dirname(filePath) })
}

function dialogDefaultPath(fileName: string): string {
  const directory = lastDialogDirectory()
  return directory ? join(directory, fileName) : fileName
}

function stripLeadingBom(content: string): string {
  return content.startsWith('\uFEFF') ? content.slice(1) : content
}

function isMarkdown(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string') return false
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extname(filePath).toLowerCase())
}

function toRelativePath(rootPath: string, filePath: string): string {
  return relative(rootPath, filePath).split(sep).join('/')
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
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
  // Skip the executable (and, in dev, the script path). Look for a real .md file or folder.
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('-')) continue
    if (existsSync(arg) && (isMarkdown(arg) || statSyncIsDirectory(arg))) return arg
  }
  return null
}

function statSyncIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
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

async function collectMarkdownFiles(rootPath: string): Promise<WorkspaceFileEntry[]> {
  const files: WorkspaceFileEntry[] = []

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

    for (const entry of entries) {
      const childPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_WORKSPACE_DIRECTORIES.has(entry.name)) await visit(childPath)
        continue
      }
      if (!entry.isFile() || !isMarkdown(childPath)) continue
      files.push({
        path: childPath,
        relativePath: toRelativePath(rootPath, childPath),
        name: entry.name
      })
    }
  }

  await visit(rootPath)
  return files
}

async function readWorkspaceFolder(folderPath: unknown): Promise<OpenFolderResult> {
  if (typeof folderPath !== 'string') return { ok: false, error: 'unsupported' }
  const normalizedPath = isAbsolute(folderPath) ? folderPath : resolve(folderPath)
  if (!(await isDirectory(normalizedPath))) {
    return { ok: false, error: 'unsupported' }
  }

  try {
    const files = await collectMarkdownFiles(normalizedPath)
    return {
      ok: true,
      folder: {
        path: normalizedPath,
        name: basename(normalizedPath),
        files
      }
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function readPathAsDocumentOrFolder(path: unknown): Promise<OpenPathResult> {
  if (typeof path !== 'string') return { ok: false, error: 'unsupported' }
  if (await isDirectory(path)) {
    const result = await readWorkspaceFolder(path)
    return result.ok ? { ok: true, type: 'folder', folder: result.folder } : result
  }

  const result = await readDocument(path)
  return result.ok
    ? { ok: true, type: 'file', document: { path: result.path, content: result.content } }
    : result
}

function parseWorkspaceSearchRequest(value: unknown): WorkspaceSearchRequest | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw['rootPath'] !== 'string' || typeof raw['term'] !== 'string') return null
  return {
    rootPath: raw['rootPath'],
    term: raw['term'],
    maxResults: typeof raw['maxResults'] === 'number' ? raw['maxResults'] : undefined
  }
}

function excerptForLine(line: string, index: number, termLength: number): string {
  const start = Math.max(0, index - 48)
  const end = Math.min(line.length, index + termLength + 72)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < line.length ? '...' : ''
  return `${prefix}${line.slice(start, end).trim()}${suffix}`
}

async function searchWorkspace(value: unknown): Promise<WorkspaceSearchResult> {
  const request = parseWorkspaceSearchRequest(value)
  const term = request?.term.trim()
  if (!request || !term || !isAbsolute(request.rootPath) || !(await isDirectory(request.rootPath))) {
    return { ok: false, error: 'unsupported' }
  }

  const maxResults = Math.min(
    MAX_WORKSPACE_SEARCH_RESULTS,
    Math.max(1, Math.floor(request.maxResults ?? MAX_WORKSPACE_SEARCH_RESULTS))
  )
  const needle = term.toLowerCase()
  const matches: WorkspaceSearchMatch[] = []

  try {
    const files = await collectMarkdownFiles(request.rootPath)
    for (const file of files) {
      const content = stripLeadingBom(await readFile(file.path, 'utf-8'))
      const lines = content.split(/\r?\n/)
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex]
        const columnIndex = line.toLowerCase().indexOf(needle)
        if (columnIndex < 0) continue
        matches.push({
          path: file.path,
          relativePath: file.relativePath,
          line: lineIndex + 1,
          column: columnIndex + 1,
          excerpt: excerptForLine(line, columnIndex, term.length)
        })
        if (matches.length >= maxResults) return { ok: true, matches }
      }
    }
    return { ok: true, matches }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Single funnel for every open entry point (association, CLI, dialog, drop). */
async function openDocument(filePath: string): Promise<void> {
  const result = await readPathAsDocumentOrFolder(filePath)
  if (!mainWindow) {
    if (result.ok) pendingOpenPath = filePath
    return
  }
  if (result.ok && result.type === 'file') {
    mainWindow.webContents.send(IPC.openDocument, result.document)
  }
  if (result.ok && result.type === 'folder') {
    mainWindow.webContents.send(IPC.openWorkspace, result.folder)
  }
}

function requestClose(): void {
  mainWindow?.webContents.send(IPC.requestClose)
}

/** Quit the whole app, not just the window. On macOS closing the last window keeps the app alive. */
function requestQuit(): void {
  if (!mainWindow) {
    forceQuit = true
    app.quit()
    return
  }
  pendingQuit = true
  requestClose()
}

/**
 * macOS routes clipboard and window shortcuts through the application menu: with no
 * menu installed, Cmd+C/V/X/A never reach the renderer. Windows and Linux keep no menu
 * at all, since every action lives in the in-app top bar.
 */
function installApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          // Custom quit so the unsaved-changes guard runs before the app exits.
          { label: `Quit ${app.name}`, accelerator: 'Command+Q', click: () => requestQuit() }
        ]
      },
      { role: 'editMenu' },
      { role: 'windowMenu' }
    ])
  )
}

function unavailableUpdateState(): UpdateState {
  return { status: 'unsupported', currentVersion: app.getVersion() }
}

function initializeUpdater(): void {
  updateController = createUpdateController((state) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.updateState, state)
  })

  // Let renderer finish loading before network check; current state remains queryable over IPC.
  setTimeout(() => {
    void updateController?.check()
  }, 3000)
}

function windowOptionsFromSettings(): Pick<Electron.BrowserWindowConstructorOptions, 'height' | 'width' | 'x' | 'y'> {
  const bounds = getSettings().windowBounds
  if (!bounds) return { width: 1000, height: 760 }
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  }
}

function persistWindowBounds(win: BrowserWindow): void {
  if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
  updateSettings({ windowBounds: win.getNormalBounds() })
}

function schedulePersistWindowBounds(win: BrowserWindow): void {
  if (persistWindowBoundsTimer) clearTimeout(persistWindowBoundsTimer)
  persistWindowBoundsTimer = setTimeout(() => {
    persistWindowBoundsTimer = null
    persistWindowBounds(win)
  }, 400)
}

function createWindow(): void {
  // `forceQuit` is what lets an approved close through the guard. On Windows and Linux the
  // process ends with the window, so it never outlives its purpose. On macOS the app stays
  // alive, so a window opened afterwards would inherit the raised flag and close without
  // ever asking about unsaved changes. Every new window starts with the guard armed.
  forceQuit = false
  pendingQuit = false

  const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build', 'icon.png')
  mainWindow = new BrowserWindow({
    ...windowOptionsFromSettings(),
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
    persistWindowBounds(mainWindow as BrowserWindow)
    if (forceQuit) return
    e.preventDefault()
    requestClose()
  })

  mainWindow.on('resize', () => {
    if (mainWindow) schedulePersistWindowBounds(mainWindow)
  })

  mainWindow.on('move', () => {
    if (mainWindow) schedulePersistWindowBounds(mainWindow)
  })

  mainWindow.on('closed', () => {
    if (persistWindowBoundsTimer) {
      clearTimeout(persistWindowBoundsTimer)
      persistWindowBoundsTimer = null
    }
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
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      defaultPath: lastDialogDirectory()
    }
    const { canceled, filePaths } = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
    rememberDialogDirectory(filePaths[0])
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

  ipcMain.handle(IPC.openFolderDialog, async (): Promise<OpenFolderResult> => {
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      defaultPath: lastDialogDirectory()
    }
    const { canceled, filePaths } = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
    rememberDialogDirectory(filePaths[0])
    return readWorkspaceFolder(filePaths[0])
  })

  ipcMain.handle(IPC.openPath, (_e, path: unknown): Promise<OpenPathResult> => readPathAsDocumentOrFolder(path))

  ipcMain.handle(IPC.readPath, (_e, filePath: unknown): Promise<OpenResult> => readDocument(filePath))

  ipcMain.handle(IPC.readWorkspaceFile, (_e, filePath: unknown): Promise<OpenResult> => readDocument(filePath))

  ipcMain.handle(IPC.searchWorkspace, (_e, request: unknown): Promise<WorkspaceSearchResult> => searchWorkspace(request))

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
      rememberDialogDirectory(path)
      return { ok: true, path }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.saveAs, async (_e, content: unknown, suggestedName?: unknown): Promise<WriteResult> => {
    if (typeof content !== 'string') return { ok: false, error: 'unsupported' }
    const fileName = suggestedMarkdownName(suggestedName)
    const options: Electron.SaveDialogOptions = {
      defaultPath: dialogDefaultPath(fileName),
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    }
    const { canceled, filePath } = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return { ok: false, canceled: true }
    rememberDialogDirectory(filePath)
    try {
      await writeFile(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.export, (_e, request: unknown): Promise<WriteResult> => exportDocument(request))
  ipcMain.handle(IPC.exportDiagramPng, (_e, request: unknown): Promise<WriteResult> => exportDiagramPng(request))

  ipcMain.handle(IPC.getUpdateState, (): UpdateState => updateController?.getState() ?? unavailableUpdateState())

  ipcMain.handle(
    IPC.checkForUpdate,
    (): Promise<UpdateState> => updateController?.check() ?? Promise.resolve(unavailableUpdateState())
  )

  ipcMain.handle(
    IPC.downloadUpdate,
    (): Promise<UpdateState> => updateController?.download() ?? Promise.resolve(unavailableUpdateState())
  )

  ipcMain.handle(IPC.installUpdate, (): boolean => {
    if (updateController?.getState().status !== 'downloaded') return false
    pendingUpdateInstall = true
    requestClose()
    return true
  })

  ipcMain.handle(IPC.confirmClose, (_e, shouldClose: unknown): void => {
    if (shouldClose === true && mainWindow) {
      forceQuit = true
      if (pendingUpdateInstall) {
        pendingUpdateInstall = false
        if (!updateController?.quitAndInstall()) mainWindow.close()
      } else if (pendingQuit) {
        pendingQuit = false
        app.quit()
      } else {
        mainWindow.close()
      }
    } else if (shouldClose === false) {
      pendingUpdateInstall = false
      pendingQuit = false
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

  // Dock "Quit" and Cmd+Q must pass through the unsaved-changes guard like any other exit.
  app.on('before-quit', (e) => {
    if (forceQuit || !mainWindow) return
    e.preventDefault()
    requestQuit()
  })

  app.whenReady().then(() => {
    pendingOpenPath = fileFromArgv(process.argv)
    registerIpc()
    installApplicationMenu()
    createWindow()
    initializeUpdater()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
