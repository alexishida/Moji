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

  /**
   * One in-flight check at a time, tracked independently of the published `status`.
   *
   * `status` cannot serve as the guard: a check that loses the race against `CHECK_TIMEOUT_MS`
   * publishes `status: 'error'` while its `checkForUpdates()` is still pending, so a quick
   * "Try again" would pass a `status === 'checking'` check and start a second concurrent
   * `checkForUpdates()` against the same updater.
   */
  let checkInFlight: Promise<UpdateState> | null = null

  const performCheck = async (): Promise<UpdateState> => {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<'timed-out'>((resolve) => {
      timer = setTimeout(() => resolve('timed-out'), CHECK_TIMEOUT_MS)
    })
    // The `.then(() => updater.checkForUpdates())` indirection catches a synchronous throw
    // (not just a rejection) and routes it through the same 'done' folding as a rejection.
    const request = Promise.resolve()
      .then(() => updater.checkForUpdates())
      .then(
        () => 'done' as const,
        () => 'done' as const
      )
    const outcome = await Promise.race([request, timeout])
    if (timer !== undefined) clearTimeout(timer)
    // Read through a function boundary: TS narrows `state.status` from the early-return guard
    // above across the whole rest of this function, and does not know `publish` (a separate
    // closure) can reassign `state` out from under that narrowing while this awaits.
    const isChecking = (): boolean => state.status === 'checking'
    if (outcome === 'timed-out' && isChecking()) {
      publish({ status: 'error', error: 'Update check timed out.' })
    }
    return state
  }

  const check = (): Promise<UpdateState> => {
    checkInFlight ??= performCheck().finally(() => {
      checkInFlight = null
    })
    return checkInFlight
  }

  return {
    getState: () => state,
    check
  }
}
