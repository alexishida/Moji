import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC, type DocumentStreamMessage } from './shared'
import type { RendererApi } from './preload'

/**
 * The preload bridge is the only surface the renderer can reach, so what is worth pinning down is
 * the part that is not a one-line `invoke`: `readPath` reassembles a document from chunks arriving
 * over a private MessagePort, and it must settle exactly once on every path, including failures.
 */

const state = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  postMessage: vi.fn(),
  getPathForFile: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (key: string, value: unknown) => state.exposed.set(key, value) },
  ipcRenderer: {
    invoke: state.invoke,
    on: state.on,
    removeListener: state.removeListener,
    postMessage: state.postMessage
  },
  webUtils: { getPathForFile: state.getPathForFile }
}))

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

async function loadApi(): Promise<RendererApi> {
  await import('./preload')
  return state.exposed.get('api') as RendererApi
}

/** The port main would hold: `readPath` transfers it, and this is what writes back to the renderer. */
function mainPort(): MessagePort {
  const [, , transfer] = state.postMessage.mock.calls[0] as [string, string, MessagePort[]]
  return transfer[0]
}

function send(port: MessagePort, message: DocumentStreamMessage, transfer: Transferable[] = []): void {
  port.postMessage(message, transfer)
}

function chunk(bytes: Uint8Array): DocumentStreamMessage {
  // Main transfers an exclusively owned buffer per chunk.
  const owned = bytes.slice()
  return { type: 'chunk', buffer: owned.buffer as ArrayBuffer, byteLength: owned.byteLength }
}

const meta = (path: string, sizeBytes: number): DocumentStreamMessage =>
  ({ type: 'meta', path, sizeBytes, sizeProfile: 'normal' })

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.exposed.clear()
})

describe('readPath', () => {
  it('reassembles a document from its chunks and reports the metadata', async () => {
    const api = await loadApi()
    const pending = api.readPath('/notes/guide.md')
    const port = mainPort()
    port.start()

    expect(state.postMessage).toHaveBeenCalledWith(IPC.readPathStream, '/notes/guide.md', [expect.anything()])

    send(port, meta('/notes/guide.md', 11))
    send(port, chunk(encode('# Título')))
    send(port, chunk(encode('\n\ncorpo')))
    send(port, { type: 'end' })

    await expect(pending).resolves.toEqual({
      ok: true,
      path: '/notes/guide.md',
      content: '# Título\n\ncorpo',
      sizeBytes: 11,
      sizeProfile: 'normal'
    })
  })

  it('keeps a multi-byte character split across two chunks intact', async () => {
    const api = await loadApi()
    const pending = api.readPath('/notes/utf8.md')
    const port = mainPort()
    port.start()
    const bytes = encode('日本語')

    send(port, meta('/notes/utf8.md', bytes.byteLength))
    send(port, chunk(bytes.subarray(0, 2)))
    send(port, chunk(bytes.subarray(2)))
    send(port, { type: 'end' })

    await expect(pending).resolves.toMatchObject({ ok: true, content: '日本語' })
  })

  it('resolves an empty document that carries no chunks', async () => {
    const api = await loadApi()
    const pending = api.readPath('/notes/empty.md')
    const port = mainPort()
    port.start()

    send(port, meta('/notes/empty.md', 0))
    send(port, { type: 'end' })

    await expect(pending).resolves.toMatchObject({ ok: true, content: '' })
  })

  it('fails when the stream ends without ever describing the document', async () => {
    const api = await loadApi()
    const pending = api.readPath('/notes/guide.md')
    const port = mainPort()
    port.start()

    send(port, { type: 'end' })

    await expect(pending).resolves.toEqual({ ok: false, error: 'open failed' })
  })

  it('surfaces an error reported by main', async () => {
    const api = await loadApi()
    const pending = api.readPath('/notes/locked.md')
    const port = mainPort()
    port.start()

    send(port, meta('/notes/locked.md', 10))
    send(port, { type: 'error', error: 'EACCES' })

    await expect(pending).resolves.toEqual({ ok: false, error: 'EACCES' })
  })

  it('settles once, so a message arriving after the result cannot overwrite it', async () => {
    const api = await loadApi()
    const pending = api.readPath('/notes/guide.md')
    const port = mainPort()
    port.start()

    send(port, meta('/notes/guide.md', 4))
    send(port, chunk(encode('done')))
    send(port, { type: 'end' })
    send(port, { type: 'error', error: 'too late' })

    await expect(pending).resolves.toMatchObject({ ok: true, content: 'done' })
  })

  it('opens a private port per request, so two reads cannot cross', async () => {
    const api = await loadApi()
    const first = api.readPath('/notes/one.md')
    const second = api.readPath('/notes/two.md')

    const [firstCall, secondCall] = state.postMessage.mock.calls as Array<[string, string, MessagePort[]]>
    expect(firstCall[2][0]).not.toBe(secondCall[2][0])

    for (const [port, path, body] of [
      [firstCall[2][0], '/notes/one.md', 'one'],
      [secondCall[2][0], '/notes/two.md', 'two']
    ] as Array<[MessagePort, string, string]>) {
      port.start()
      send(port, meta(path, body.length))
      send(port, chunk(encode(body)))
      send(port, { type: 'end' })
    }

    await expect(first).resolves.toMatchObject({ path: '/notes/one.md', content: 'one' })
    await expect(second).resolves.toMatchObject({ path: '/notes/two.md', content: 'two' })
  })
})

describe('exposed bridge', () => {
  it('publishes the API under window.api and nothing else', async () => {
    await loadApi()

    expect([...state.exposed.keys()]).toEqual(['api'])
  })

  it('routes each request to its own IPC channel', async () => {
    const api = await loadApi()
    state.invoke.mockResolvedValue(undefined)

    await api.setSettings({ previewWidth: 60 })
    await api.saveDraft({ id: 'draft-1', title: 'Untitled', content: 'x' })
    await api.appendDraftEdits('draft-1', [[{ from: 0, to: 0, insert: 'a' }]], 1)
    await api.save('/notes/guide.md', 'body')

    expect(state.invoke.mock.calls).toEqual([
      [IPC.setSettings, { previewWidth: 60 }],
      [IPC.saveDraft, { id: 'draft-1', title: 'Untitled', content: 'x' }],
      [IPC.appendDraftEdits, 'draft-1', [[{ from: 0, to: 0, insert: 'a' }]], 1],
      [IPC.save, '/notes/guide.md', 'body']
    ])
  })

  // `onCloseRequest` is a bare signal; the rest forward a payload. Either way the Electron event
  // object that arrives as the first argument must never reach the renderer callback.
  it.each([
    ['onOpenDocument', IPC.openDocument, true],
    ['onOpenManyProgress', IPC.openManyProgress, true],
    ['onOpenManyDone', IPC.openManyDone, true],
    ['onUpdateState', IPC.updateState, true],
    ['onCloseRequest', IPC.requestClose, false]
  ])('%s subscribes and returns an unsubscribe that removes the same listener', async (name, channel, forwardsPayload) => {
    const api = await loadApi()
    const callback = vi.fn()

    const off = (api[name as keyof RendererApi] as (cb: unknown) => () => void)(callback)

    expect(state.on).toHaveBeenCalledWith(channel, expect.any(Function))
    const [, listener] = state.on.mock.calls.at(-1) as [string, (...args: unknown[]) => void]

    listener({ senderId: 1 }, { version: '1.1.0' })
    expect(callback).toHaveBeenCalledWith(...(forwardsPayload ? [{ version: '1.1.0' }] : []))

    off()
    expect(state.removeListener).toHaveBeenCalledWith(channel, listener)
  })

  it('resolves a dropped File to its path through webUtils', async () => {
    const api = await loadApi()
    const file = new File(['x'], 'guide.md')
    state.getPathForFile.mockReturnValue('/notes/guide.md')

    expect(api.getDroppedPath(file)).toBe('/notes/guide.md')
    expect(state.getPathForFile).toHaveBeenCalledWith(file)
  })
})
