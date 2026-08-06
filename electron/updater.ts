import { app } from 'electron'
import electronUpdater, { type AppUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from './shared'

type StateListener = (state: UpdateState) => void

export interface UpdateController {
  getState: () => UpdateState
  check: () => Promise<UpdateState>
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
      check: async () => state
    }
  }

  // electron-updater is CommonJS; default import avoids ESM interop failures in packaged builds.
  const updater: AppUpdater = electronUpdater.autoUpdater
  updater.allowPrerelease = false

  updater.on('checking-for-update', () => {
    publish({ status: 'checking', error: undefined })
  })
  updater.on('update-available', (info: UpdateInfo) => {
    publish({ status: 'available', version: info.version, error: undefined })
  })
  updater.on('update-not-available', (info: UpdateInfo) => {
    publish({ status: 'up-to-date', version: info.version, error: undefined })
  })
  updater.on('error', (error: Error) => {
    publish({ status: 'error', error: errorMessage(error) })
  })

  const check = async (): Promise<UpdateState> => {
    if (state.status === 'checking') return state
    try {
      await updater.checkForUpdates()
    } catch (error) {
      publish({ status: 'error', error: errorMessage(error as Error) })
    }
    return state
  }

  return {
    getState: () => state,
    check
  }
}
