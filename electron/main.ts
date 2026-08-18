import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  IPC,
  type AutoSaveDraft,
  type DocumentMetadata,
  type DocumentSizeProfile,
  type DocumentStreamMessage,
  type DraftAppendResult,
  type DraftPersistProblem,
  type DraftResult,
  type OpenDialogResult,
  type OpenResult,
  type Settings,
  type UpdateState,
  type WriteResult
} from './shared'
import { getSettings, updateSettings } from './settings'
import { appendDraftEdits, getDrafts, removeDraft, saveDraft } from './drafts'
import { isDraftId } from './draftStore'
import { isDraftPersistError } from './draftCapacity'
import { areDraftEditBatches } from './draftJournal'
import { assetContentType, assetPathFromUrl, authorizedAsset } from './assetPaths'
import { FileCapabilities } from './fileCapabilities'
import { isMarkdown, sanitizeDraft, sanitizeSettingsPatch, suggestedMarkdownName } from './ipcInput'
import { cancelExport, exportDiagramPng, exportDocument } from './export'
import { benchmarkRequested, recordBenchmark } from './benchmark'
import { createUpdateController, type UpdateController } from './updater'
import { mapWithConcurrency } from './openPool'
import { readFileChunks } from './documentStream'
import { stripLeadingBom } from './documentDecoder'
import { AssetCache } from './assetCache'
import { beginMainMeasure, captureMainMemory, getMainPerformanceReport } from './performance'

let mainWindow: BrowserWindow | null = null
let pendingOpenPath: string | null = null
let forceQuit = false
let pendingQuit = false
let updateController: UpdateController | null = null
let persistWindowBoundsTimer: NodeJS.Timeout | null = null
const capabilities = new FileCapabilities()
const assetCache = new AssetCache(readFile)
const openManySessions = new Map<string, AbortController>()

protocol.registerSchemesAsPrivileged([{
  scheme: 'moji-asset',
  privileges: { secure: true, standard: true, supportFetchAPI: true }
}])

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

const NORMAL_DOCUMENT_SIZE_LIMIT = 5 * 1024 * 1024
const LARGE_DOCUMENT_SIZE_LIMIT = 20 * 1024 * 1024
const DOCUMENT_OPEN_CONCURRENCY = 3
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

function documentSizeProfile(sizeBytes: number): DocumentSizeProfile {
  if (sizeBytes <= NORMAL_DOCUMENT_SIZE_LIMIT) return 'normal'
  if (sizeBytes <= LARGE_DOCUMENT_SIZE_LIMIT) return 'large'
  return 'very-large'
}

/**
 * Grant access to a path the user chose.
 *
 * Every caller sits on a path that came from a dialog, the command line, a file
 * association or a drop — never from the renderer naming a file of its own accord.
 */
function grantDocument(documentPath: string): void {
  capabilities.grant(documentPath)
}

function registerAssetProtocol(): void {
  protocol.handle('moji-asset', async (request) => {
    const filePath = assetPathFromUrl(request.url)
    const asset = filePath ? await authorizedAsset(filePath, capabilities.directories) : null
    if (!asset) {
      return new Response('Forbidden', { status: 403 })
    }
    try {
      const bytes = await assetCache.read(asset.path, asset)
      return new Response(new Uint8Array(bytes), { headers: { 'content-type': assetContentType(asset.path) } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
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

async function readDocument(filePath: unknown, signal?: AbortSignal): Promise<OpenResult> {
  if (!isMarkdown(filePath)) return { ok: false, error: 'unsupported' }
  if (signal?.aborted) return { ok: false, canceled: true }
  const finishMeasure = beginMainMeasure('document:open')
  let sizeBytes = 0
  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return { ok: false, error: 'unsupported' }
    if (signal?.aborted) return { ok: false, canceled: true }
    const content = stripLeadingBom(await readFile(filePath, { encoding: 'utf-8', signal }))
    sizeBytes = fileStat.size
    grantDocument(filePath)
    void captureMainMemory('main:memory:document-open')
    return {
      ok: true,
      path: filePath,
      content,
      sizeBytes: fileStat.size,
      sizeProfile: documentSizeProfile(fileStat.size)
    }
  } catch (err) {
    if (signal?.aborted) return { ok: false, canceled: true }
    return { ok: false, error: (err as Error).message }
  } finally {
    finishMeasure({ sizeBytes })
  }
}

/** Validates a document and measures it without reading a single byte of content. */
async function statDocument(filePath: unknown): Promise<DocumentMetadata | null> {
  if (!isMarkdown(filePath)) return null
  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return null
    return { path: filePath, sizeBytes: fileStat.size, sizeProfile: documentSizeProfile(fileStat.size) }
  } catch {
    return null
  }
}

/**
 * Streams a document to the renderer as UTF-8 chunks over a `MessagePort`.
 *
 * The renderer decodes incrementally, so no step of the delivery ever holds a second full copy of
 * the document: main reads one chunk at a time and never builds the UTF-16 string that
 * `ipcRenderer.invoke` would have had to serialize.
 */
async function streamDocumentToPort(filePath: unknown, port: Electron.MessagePortMain): Promise<void> {

  const finishMeasure = beginMainMeasure('document:open-stream')
  let sizeBytes = 0
  let chunks = 0
  // The renderer may close its end mid-stream (window closed, reload). Reporting the failure must
  // never throw a second time out of an unawaited call.
  const postError = (error: string): void => {
    try {
      port.postMessage({ type: 'error', error } satisfies DocumentStreamMessage)
    } catch {
      // Port already gone; the pending read is abandoned with it.
    }
  }

  try {
    const metadata = await statDocument(filePath)
    if (!metadata) {
      postError('unsupported')
      return
    }

    sizeBytes = metadata.sizeBytes
    // Opening is how a file earns its capability. Recent files and drag-and-drop reach
    // this point with a path the renderer supplied, and both are legitimate ways for a
    // person to open a document, so the read itself is the grant — it is writing and
    // asset loading that are then confined to what has actually been opened.
    grantDocument(metadata.path)
    port.postMessage({ type: 'meta', ...metadata } satisfies DocumentStreamMessage)
    for await (const chunk of readFileChunks(metadata.path)) {
      chunks += 1
      port.postMessage({ type: 'chunk', buffer: chunk.buffer, byteLength: chunk.byteLength } satisfies DocumentStreamMessage)
    }
    port.postMessage({ type: 'end' } satisfies DocumentStreamMessage)
    void captureMainMemory('main:memory:document-open')
  } catch (err) {
    postError((err as Error).message)
  } finally {
    finishMeasure({ sizeBytes, chunks })
    port.close()
  }
}

/**
 * Reads many files with bounded concurrency, streaming each result to the renderer as it
 * completes instead of waiting for the whole batch. Lets a large selection show progress and
 * be canceled mid-flight without discarding files already opened.
 */
async function runOpenManySession(sessionId: string, filePaths: string[], sender: Electron.WebContents): Promise<void> {
  const controller = new AbortController()
  openManySessions.set(sessionId, controller)
  const total = filePaths.length
  let completed = 0
  const errors: string[] = []

  const send = (channel: string, payload: unknown): void => {
    if (!sender.isDestroyed()) sender.send(channel, payload)
  }

  try {
    await mapWithConcurrency(
      filePaths,
      DOCUMENT_OPEN_CONCURRENCY,
      (filePath) => readDocument(filePath, controller.signal),
      {
        signal: controller.signal,
        onResult: (result) => {
          completed += 1
          if (result.ok) {
            send(IPC.openManyProgress, {
              sessionId,
              completed,
              total,
              document: { path: result.path, content: result.content, sizeBytes: result.sizeBytes, sizeProfile: result.sizeProfile }
            })
          } else {
            if (!result.canceled && result.error) errors.push(result.error)
            send(IPC.openManyProgress, { sessionId, completed, total, error: result.canceled ? undefined : result.error })
          }
        }
      }
    )
  } finally {
    openManySessions.delete(sessionId)
    send(IPC.openManyDone, { sessionId, canceled: controller.signal.aborted, errors })
  }
}

async function openLocalPath(fileUrl: unknown): Promise<WriteResult> {
  if (typeof fileUrl !== 'string' || !fileUrl.startsWith('file:')) return { ok: false, error: 'unsupported' }

  try {
    const filePath = fileURLToPath(fileUrl)
    if (!isAbsolute(filePath) || !existsSync(filePath)) return { ok: false, error: 'File not found.' }
    const error = await shell.openPath(filePath)
    return error ? { ok: false, error } : { ok: true, path: filePath }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Single funnel for every open entry point (association, CLI, dialog, drop). Only metadata is
 * pushed: the renderer pulls the bytes through `readPathStream`, so document text crosses the
 * process boundary exactly once, in one place.
 */
async function openDocument(filePath: string): Promise<void> {
  const metadata = await statDocument(filePath)
  // This funnel is only reached from the OS or a dialog, so it is where the path earns
  // the right to be streamed back when the renderer asks for its bytes.
  if (metadata) grantDocument(metadata.path)
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (metadata) pendingOpenPath = filePath
    return
  }
  if (metadata) mainWindow.webContents.send(IPC.openDocument, metadata)
}

function revealMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function openAssociatedDocument(filePath: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingOpenPath = filePath
    if (app.isReady()) createWindow()
    return
  }

  revealMainWindow()
  void openDocument(filePath)
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

/**
 * Accept IPC only from this application's own top-level frame.
 *
 * Without this every handler answers whoever calls it. A subframe or a page that ended up
 * somewhere unexpected would reach the same file APIs as the app itself, so the sender is
 * checked once, centrally, rather than being assumed by twenty handlers.
 */
function isTrustedSender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  if (event.sender !== mainWindow.webContents) return false
  // Top frame only: a nested frame never legitimately drives the app.
  return event.senderFrame === null || event.senderFrame === event.sender.mainFrame
}

/** `ipcMain.handle`, refusing anything that did not come from the app window. */
function handleFromRenderer(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: never[]) => unknown
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('forbidden')
    return (listener as (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown)(event, ...args)
  })
}

/** `ipcMain.on`, refusing anything that did not come from the app window. */
function onFromRenderer(
  channel: string,
  listener: (event: Electron.IpcMainEvent, ...args: never[]) => void
): void {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) return
    ;(listener as (event: Electron.IpcMainEvent, ...args: unknown[]) => void)(event, ...args)
  })
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
    revealMainWindow()
    if (pendingOpenPath) {
      void openDocument(pendingOpenPath)
      pendingOpenPath = null
    }
    if (benchmarkRequested()) {
      void recordBenchmark(mainWindow as BrowserWindow, openDocument)
        .then(() => app.quit())
        .catch((error: Error) => { console.error('Benchmark failed:', error); app.exit(1) })
    }
  })

  // Open external links in the OS browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url)
    else if (url.startsWith('file:')) void openLocalPath(url)
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

/**
 * Describes a failed draft write to the renderer.
 *
 * A refusal for memory or disk carries its measurements so the renderer can name what is missing;
 * anything else keeps travelling as its message. Either way the draft in the editor is untouched,
 * so the renderer can retry after the user frees space.
 */
function draftFailure(err: unknown): { error: string; problem?: DraftPersistProblem } {
  const error = (err as Error).message
  return isDraftPersistError(err) ? { error, problem: err.problem } : { error }
}

function registerIpc(): void {
  handleFromRenderer(IPC.getSettings, (): Settings => getSettings())

  handleFromRenderer(IPC.setSettings, (_e, patch: unknown): Settings => updateSettings(sanitizeSettingsPatch(patch)))

  handleFromRenderer(IPC.getDrafts, (): Promise<AutoSaveDraft[]> => getDrafts())

  handleFromRenderer(IPC.saveDraft, async (_e, value: unknown): Promise<DraftResult> => {
    const draft = sanitizeDraft(value)
    if (!draft) return { ok: false, error: 'invalid-draft' }
    try {
      await saveDraft(draft)
      return { ok: true }
    } catch (err) {
      return { ok: false, ...draftFailure(err) }
    }
  })

  ipcMain.handle(
    IPC.appendDraftEdits,
    async (_e, id: unknown, batches: unknown, expectedLength: unknown): Promise<DraftAppendResult> => {
      if (!isDraftId(id) || !areDraftEditBatches(batches)) return { ok: false, reason: 'error', error: 'invalid-draft' }
      if (typeof expectedLength !== 'number' || !Number.isInteger(expectedLength) || expectedLength < 0) {
        return { ok: false, reason: 'error', error: 'invalid-draft' }
      }
      try {
        const outcome = await appendDraftEdits(id, batches, expectedLength)
        if (outcome === 'out-of-sync' || outcome === 'unknown-draft') return { ok: false, reason: outcome }
        return { ok: true }
      } catch (err) {
        return { ok: false, reason: 'error', ...draftFailure(err) }
      }
    }
  )

  handleFromRenderer(IPC.removeDraft, async (_e, value: unknown): Promise<DraftResult> => {
    if (!isDraftId(value)) return { ok: false, error: 'invalid-draft' }
    try {
      await removeDraft(value)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  handleFromRenderer(IPC.openDialog, async (event): Promise<OpenDialogResult> => {
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
    const sessionId = randomUUID()
    void runOpenManySession(sessionId, filePaths, event.sender)
    return { ok: true, sessionId, total: filePaths.length }
  })

  handleFromRenderer(IPC.cancelOpenMany, (_e, sessionId: unknown): void => {
    if (typeof sessionId !== 'string') return
    openManySessions.get(sessionId)?.abort()
  })

  onFromRenderer(IPC.readPathStream, (event, filePath: unknown): void => {
    const [port] = event.ports
    if (!port) return
    void streamDocumentToPort(filePath, port)
  })

  handleFromRenderer(IPC.openLocalPath, (_e, fileUrl: unknown): Promise<WriteResult> => openLocalPath(fileUrl))

  handleFromRenderer(IPC.readSample, (_e, name: unknown): Promise<OpenResult> => {
    const path = samplePath(name)
    return path ? readDocument(path) : Promise.resolve({ ok: false, error: 'unsupported' })
  })

  handleFromRenderer(IPC.save, async (_e, filePath: unknown, content: unknown): Promise<WriteResult> => {
    const path = asString(filePath)
    if (!path || !isMarkdown(path) || typeof content !== 'string') return { ok: false, error: 'unsupported' }
    // A Markdown extension is not authorisation. Only a file the user opened or chose in
    // the save dialog can be written to.
    if (!capabilities.allows(path)) return { ok: false, error: 'forbidden' }
    try {
      await writeFile(path, content, 'utf-8')
      rememberDialogDirectory(path)
      return { ok: true, path }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  handleFromRenderer(IPC.saveAs, async (_e, content: unknown, suggestedName?: unknown): Promise<WriteResult> => {
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
    grantDocument(filePath)
    try {
      await writeFile(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  handleFromRenderer(IPC.export, (event, request: unknown): Promise<WriteResult> =>
    exportDocument(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.exportProgress, progress)
    })
  )
  handleFromRenderer(IPC.cancelExport, (): void => cancelExport())
  handleFromRenderer(IPC.exportDiagramPng, (_e, request: unknown): Promise<WriteResult> => exportDiagramPng(request))

  handleFromRenderer(IPC.getUpdateState, (): UpdateState => updateController?.getState() ?? unavailableUpdateState())

  handleFromRenderer(IPC.getPerformanceReport, () => getMainPerformanceReport())

  ipcMain.handle(
    IPC.checkForUpdate,
    (): Promise<UpdateState> => updateController?.check() ?? Promise.resolve(unavailableUpdateState())
  )

  handleFromRenderer(IPC.confirmClose, (_e, shouldClose: unknown): void => {
    if (shouldClose === true && mainWindow) {
      forceQuit = true
      if (pendingQuit) {
        pendingQuit = false
        app.quit()
      } else {
        mainWindow.close()
      }
    } else if (shouldClose === false) {
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
    openAssociatedDocument(filePath)
  })

  // Dock "Quit" and Cmd+Q must pass through the unsaved-changes guard like any other exit.
  app.on('before-quit', (e) => {
    if (forceQuit || !mainWindow) return
    e.preventDefault()
    requestQuit()
  })

  app.whenReady().then(() => {
    pendingOpenPath ??= fileFromArgv(process.argv)
    registerAssetProtocol()
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
