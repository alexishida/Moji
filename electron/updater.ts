import { app } from 'electron'
import electronUpdater, { type AppUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from './shared'

type StateListener = (state: UpdateState) => void

export interface UpdateController {
  getState: () => UpdateState
  check: () => Promise<UpdateState>
  download: () => Promise<UpdateState>
  quitAndInstall: () => boolean
}

function supportsAutomaticUpdates(): boolean {
  if (!app.isPackaged) return false
  if (process.platform === 'win32') return true
  return process.platform === 'linux' && typeof process.env['APPIMAGE'] === 'string'
}

function errorMessage(error: Error): string {
  return error.message || 'update failed'
}

export function createUpdateController(notify: StateListener): UpdateController {
  let state: UpdateState = {
    status: supportsAutomaticUpdates() ? 'idle' : 'unsupported',
    currentVersion: app.getVersion()
  }

  const publish = (patch: Partial<UpdateState>): UpdateState => {
    state = { ...state, ...patch }
    notify(state)
    return state
  }

  if (state.status === 'unsupported') {
    return {
      getState: () => state,
      check: async () => state,
      download: async () => state,
      quitAndInstall: () => false
    }
  }

  // electron-updater is CommonJS; default import avoids ESM interop failures in packaged builds.
  const updater: AppUpdater = electronUpdater.autoUpdater
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = true
  updater.allowPrerelease = false

  updater.on('checking-for-update', () => {
    publish({ status: 'checking', error: undefined, percent: undefined })
  })
  updater.on('update-available', (info: UpdateInfo) => {
    publish({ status: 'available', version: info.version, error: undefined, percent: undefined })
  })
  updater.on('update-not-available', (info: UpdateInfo) => {
    publish({ status: 'up-to-date', version: info.version, error: undefined, percent: undefined })
  })
  updater.on('download-progress', (progress: ProgressInfo) => {
    publish({ status: 'downloading', percent: Math.round(progress.percent * 10) / 10 })
  })
  updater.on('update-downloaded', (info: UpdateInfo) => {
    publish({ status: 'downloaded', version: info.version, percent: 100, error: undefined })
  })
  updater.on('error', (error: Error) => {
    publish({ status: 'error', error: errorMessage(error), percent: undefined })
  })

  const check = async (): Promise<UpdateState> => {
    if (state.status === 'checking' || state.status === 'downloading') return state
    try {
      await updater.checkForUpdates()
    } catch (error) {
      publish({ status: 'error', error: errorMessage(error as Error), percent: undefined })
    }
    return state
  }

  const download = async (): Promise<UpdateState> => {
    if (state.status !== 'available') return state
    try {
      publish({ status: 'downloading', percent: 0, error: undefined })
      await updater.downloadUpdate()
    } catch (error) {
      publish({ status: 'error', error: errorMessage(error as Error), percent: undefined })
    }
    return state
  }

  return {
    getState: () => state,
    check,
    download,
    quitAndInstall: () => {
      if (state.status !== 'downloaded') return false
      updater.quitAndInstall(false, true)
      return true
    }
  }
}
