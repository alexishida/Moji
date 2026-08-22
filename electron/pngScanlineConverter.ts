import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { toScanlines } from './pngScanlines'
import type { ScanlineRequest, ScanlineResponse } from './pngWorker'

/**
 * Runs the PNG pixel loop on a worker thread, falling back to the calling thread.
 *
 * The fallback is not a nicety: a worker can fail to start (an unexpected layout on disk,
 * a sandboxed environment, a unit test running from source), and an export that produced
 * no file at all would be a worse outcome than one that briefly blocked. Every failure
 * path therefore degrades to converting in place rather than surfacing an error.
 */

export interface ScanlineConverter {
  convert: (bgra: Buffer, width: number, height: number) => Promise<Uint8Array>
  /** Stop the worker. Safe to call more than once, and after a failure. */
  close: () => Promise<void>
}

function defaultWorkerPath(): string {
  return join(__dirname, 'pngWorker.js')
}

/**
 * Copy the slice into a buffer of its own to hand to the worker.
 *
 * Transferring the captured bitmap directly would avoid the copy, but it also detaches it:
 * if the worker then died, the fallback would read an empty buffer and write a black band
 * into the image without any error to show for it. A memcpy costs far less than the pixel
 * loop it is protecting, so the original stays intact and usable.
 */
function transferableBytes(bgra: Buffer): ArrayBuffer {
  const copy = new Uint8Array(bgra.byteLength)
  copy.set(bgra)
  return copy.buffer
}

export function createScanlineConverter(workerPath: string = defaultWorkerPath()): ScanlineConverter {
  let worker: Worker | null = null
  let unavailable = false
  let nextId = 0
  const pending = new Map<number, { resolve: (rows: Uint8Array) => void; reject: (err: Error) => void }>()

  const failPending = (reason: string): void => {
    for (const [, waiter] of pending) waiter.reject(new Error(reason))
    pending.clear()
  }

  const retire = (reason: string): void => {
    unavailable = true
    const retiring = worker
    worker = null
    failPending(reason)
    void retiring?.terminate()
  }

  const start = (): Worker | null => {
    if (unavailable) return null
    if (worker) return worker

    try {
      const started = new Worker(workerPath)
      started.on('message', (response: ScanlineResponse) => {
        const waiter = pending.get(response.id)
        if (!waiter) return
        pending.delete(response.id)
        if ('error' in response) waiter.reject(new Error(response.error))
        else waiter.resolve(new Uint8Array(response.rows))
      })
      // A worker that dies mid-export takes its queue with it, so the pending slices are
      // rejected and every later slice converts in place.
      started.on('error', (err) => retire(err.message))
      started.on('exit', () => {
        if (pending.size > 0) retire('PNG worker exited')
      })
      started.unref()
      worker = started
      return started
    } catch {
      unavailable = true
      return null
    }
  }

  return {
    async convert(bgra, width, height) {
      const active = start()
      if (!active) return toScanlines(bgra, width, height)

      const id = nextId
      nextId += 1

      try {
        return await new Promise<Uint8Array>((resolve, reject) => {
          pending.set(id, { resolve, reject })
          const bytes = transferableBytes(bgra)
          const request: ScanlineRequest = { id, bgra: bytes, width, height }
          active.postMessage(request, [bytes])
        })
      } catch {
        // The worker failed or died with this slice in flight. The captured bitmap was
        // never transferred, so the band can still be produced here.
        return toScanlines(bgra, width, height)
      }
    },

    async close() {
      const closing = worker
      worker = null
      unavailable = true
      failPending('PNG export closed')
      if (closing) await closing.terminate()
    }
  }
}
