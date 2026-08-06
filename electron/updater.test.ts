import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  isPackaged: true,
  checkForUpdates: vi.fn<() => Promise<unknown>>(),
  listeners: new Map<string, (value: never) => void>()
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return state.isPackaged
    },
    getVersion: () => '0.1.4'
  }
}))

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {
      allowPrerelease: false,
      on: (event: string, listener: (value: never) => void) => state.listeners.set(event, listener),
      checkForUpdates: () => state.checkForUpdates()
    }
  }
}))

beforeEach(() => {
  state.isPackaged = true
  state.listeners.clear()
  state.checkForUpdates.mockReset()
  vi.resetModules()
})

describe('update controller', () => {
  it('reports unsupported when packaged update checks are unavailable', async () => {
    state.isPackaged = false
    const { createUpdateController } = await import('./updater')

    const controller = createUpdateController(vi.fn())

    await expect(controller.check()).resolves.toMatchObject({ status: 'unsupported', currentVersion: '0.1.4' })
  })

  it('reports an available release without local download state', async () => {
    state.checkForUpdates.mockResolvedValue(undefined)
    const { createUpdateController } = await import('./updater')
    const notify = vi.fn()
    const controller = createUpdateController(notify)

    await controller.check()
    state.listeners.get('update-available')?.({ version: '0.2.0' } as never)

    expect(controller.getState()).toEqual({ status: 'available', currentVersion: '0.1.4', version: '0.2.0', error: undefined })
    expect(controller).not.toHaveProperty('download')
    expect(controller).not.toHaveProperty('quitAndInstall')
  })

  it('reports current and failed release checks as recoverable states', async () => {
    state.checkForUpdates.mockResolvedValue(undefined)
    const { createUpdateController } = await import('./updater')
    const controller = createUpdateController(vi.fn())

    await controller.check()
    state.listeners.get('update-not-available')?.({ version: '0.1.4' } as never)
    expect(controller.getState()).toMatchObject({ status: 'up-to-date', version: '0.1.4' })

    state.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    await controller.check()
    expect(controller.getState()).toMatchObject({ status: 'error', error: 'offline' })
  })
})
