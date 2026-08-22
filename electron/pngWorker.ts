import { parentPort } from 'node:worker_threads'
import { toScanlines } from './pngScanlines'

/**
 * Worker entry for the PNG export.
 *
 * A capture slice is a few million pixels, and rearranging it byte by byte is the one
 * genuinely blocking step of the export: deflate already runs on libuv's thread pool, but
 * this loop would hold the main process — and with it every window — for the duration.
 *
 * Both the slice in and the scanlines out are transferred rather than copied, so moving
 * the work off the main thread does not cost two copies of the bitmap.
 */

export interface ScanlineRequest {
  id: number
  bgra: ArrayBuffer
  width: number
  height: number
}

export type ScanlineResponse =
  | { id: number; rows: ArrayBuffer }
  | { id: number; error: string }

parentPort?.on('message', (request: ScanlineRequest) => {
  const port = parentPort
  if (!port) return

  try {
    const rows = toScanlines(new Uint8Array(request.bgra), request.width, request.height)
    const response: ScanlineResponse = { id: request.id, rows: rows.buffer as ArrayBuffer }
    port.postMessage(response, [rows.buffer as ArrayBuffer])
  } catch (err) {
    port.postMessage({ id: request.id, error: (err as Error).message } satisfies ScanlineResponse)
  }
})
