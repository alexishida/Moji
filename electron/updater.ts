import { app } from 'electron'
import electronUpdater, { type AppUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from './shared'

type StateListener = (state: UpdateState) => void
const MOCK_UPDATE_VERSION = '99.0.0'

export interface UpdateController {
  getState: () => UpdateState
  check: () => Promise<UpdateState>
}

function supportsAutomaticUpdates(): boolean {
  if (!app.isPackaged) return false
  if (process.platform === 'win32') return true
  return process.platform === 'linux' && typeof process.env['APPIMAGE'] === 'string'
}

function mocksAvailableUpdate(): boolean {
  return !app.isPackaged && process.env['MOJI_MOCK_UPDATE'] === '1'
}

function errorMessage(error: Error): string {
  return error.message || 'update failed'
}

export function createUpdateController(notify: StateListener): UpdateController {
  const mockUpdate = mocksAvailableUpdate()
  let state: UpdateState = {
    status: mockUpdate || supportsAutomaticUpdates() ? 'idle' : 'unsupported',
    currentVersion: app.getVersion()
  }

  const publish = (patch: Partial<UpdateState>): UpdateState => {
    state = { ...state, ...patch }
    notify(state)
    return state
  }

  if (mockUpdate) {
    return {
      getState: () => state,
      check: async () => {
        publish({ status: 'checking', version: undefined, error: undefined })
        return publish({ status: 'available', version: MOCK_UPDATE_VERSION })
      }
    }
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
  updater.autoDownload = false

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

  /**
   * Upper bound on a check, so a hung network request cannot leave `status: 'checking'`
   * forever — the guard below would otherwise refuse every later check indefinitely, and
   * the settings screen would show its spinner with no way out of it.
   */
  const CHECK_TIMEOUT_MS = 20_000

  const check = async (): Promise<UpdateState> => {
    if (state.status === 'checking') return state
    let settled = false
    const timeout = setTimeout(() => {
      if (!settled && state.status === 'checking') {
        publish({ status: 'error', error: 'Update check timed out.' })
      }
    }, CHECK_TIMEOUT_MS)
    try {
      await updater.checkForUpdates()
    } catch (error) {
      publish({ status: 'error', error: errorMessage(error as Error) })
    } finally {
      settled = true
      clearTimeout(timeout)
    }
    return state
  }

  return {
    getState: () => state,
    check
  }
}
