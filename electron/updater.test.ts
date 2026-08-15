import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const originalMockUpdate = process.env['MOJI_MOCK_UPDATE']

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
    getVersion: () => '1.0.5'
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
  delete process.env['MOJI_MOCK_UPDATE']
  vi.resetModules()
})

afterAll(() => {
  if (originalMockUpdate === undefined) delete process.env['MOJI_MOCK_UPDATE']
  else process.env['MOJI_MOCK_UPDATE'] = originalMockUpdate
})

describe('update controller', () => {
  it('reports unsupported when packaged update checks are unavailable', async () => {
    state.isPackaged = false
    const { createUpdateController } = await import('./updater')

    const controller = createUpdateController(vi.fn())

    await expect(controller.check()).resolves.toMatchObject({ status: 'unsupported', currentVersion: '1.0.5' })
  })

  it('simulates an available update in development when requested', async () => {
    state.isPackaged = false
    process.env['MOJI_MOCK_UPDATE'] = '1'
    const { createUpdateController } = await import('./updater')
    const notify = vi.fn()
    const controller = createUpdateController(notify)

    expect(controller.getState()).toEqual({ status: 'idle', currentVersion: '1.0.5' })
    await expect(controller.check()).resolves.toEqual({
      status: 'available',
      currentVersion: '1.0.5',
      version: '99.0.0',
      error: undefined
    })
    expect(notify).toHaveBeenNthCalledWith(1, {
      status: 'checking',
      currentVersion: '1.0.5',
      version: undefined,
      error: undefined
    })
    expect(notify).toHaveBeenNthCalledWith(2, {
      status: 'available',
      currentVersion: '1.0.5',
      version: '99.0.0',
      error: undefined
    })
    expect(state.checkForUpdates).not.toHaveBeenCalled()
  })

  it('reports an available release without local download state', async () => {
    state.checkForUpdates.mockResolvedValue(undefined)
    const { createUpdateController } = await import('./updater')
    const notify = vi.fn()
    const controller = createUpdateController(notify)

    await controller.check()
    state.listeners.get('update-available')?.({ version: '1.1.0' } as never)

    expect(controller.getState()).toEqual({ status: 'available', currentVersion: '1.0.5', version: '1.1.0', error: undefined })
    expect(controller).not.toHaveProperty('download')
    expect(controller).not.toHaveProperty('quitAndInstall')
  })

  it('reports current and failed release checks as recoverable states', async () => {
    state.checkForUpdates.mockResolvedValue(undefined)
    const { createUpdateController } = await import('./updater')
    const controller = createUpdateController(vi.fn())

    await controller.check()
    state.listeners.get('update-not-available')?.({ version: '1.0.5' } as never)
    expect(controller.getState()).toMatchObject({ status: 'up-to-date', version: '1.0.5' })

    state.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    await controller.check()
    expect(controller.getState()).toMatchObject({ status: 'error', error: 'offline' })
  })
})
