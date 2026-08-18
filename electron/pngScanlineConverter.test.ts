import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createScanlineConverter } from './pngScanlineConverter'
import { toScanlines } from './pngScanlines'

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moji-scanline-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

/** A stand-in for the built worker, so the message protocol is exercised for real. */
async function writeWorker(body: string): Promise<string> {
  const path = join(directory, 'worker.cjs')
  await writeFile(path, body, 'utf-8')
  return path
}

const workingWorker = `
const { parentPort } = require('node:worker_threads')
parentPort.on('message', (request) => {
  const bgra = new Uint8Array(request.bgra)
  const stride = request.width * 4
  const rows = new Uint8Array(request.height * (1 + stride))
  for (let y = 0; y < request.height; y += 1) {
    const source = y * stride
    const target = y * (1 + stride)
    rows[target] = 0
    for (let i = 0; i < stride; i += 4) {
      rows[target + 1 + i] = bgra[source + i + 2]
      rows[target + 2 + i] = bgra[source + i + 1]
      rows[target + 3 + i] = bgra[source + i]
      rows[target + 4 + i] = bgra[source + i + 3]
    }
  }
  parentPort.postMessage({ id: request.id, rows: rows.buffer }, [rows.buffer])
})
`

// blue, green, red, alpha — the order capturePage hands back.
const slice = Buffer.from([10, 20, 30, 255, 40, 50, 60, 128])
const expected = [0, 30, 20, 10, 255, 60, 50, 40, 128]

describe('createScanlineConverter', () => {
  it('converts a slice on the worker thread', async () => {
    const converter = createScanlineConverter(await writeWorker(workingWorker))

    await expect(converter.convert(slice, 2, 1)).resolves.toEqual(new Uint8Array(expected))
    await converter.close()
  })

  it('leaves the caller its bitmap, so a later failure can still be recovered from', async () => {
    const converter = createScanlineConverter(await writeWorker(workingWorker))

    await converter.convert(slice, 2, 1)

    // The slice was copied rather than transferred, so it is still readable here.
    expect(slice.byteLength).toBe(8)
    expect([...slice]).toEqual([10, 20, 30, 255, 40, 50, 60, 128])
    await converter.close()
  })

  it('converts in place when the worker cannot be started', async () => {
    const converter = createScanlineConverter(join(directory, 'missing-worker.cjs'))

    await expect(converter.convert(slice, 2, 1)).resolves.toEqual(new Uint8Array(expected))
    await converter.close()
  })

  it('converts in place when the worker reports a failure', async () => {
    const failing = await writeWorker(`
      const { parentPort } = require('node:worker_threads')
      parentPort.on('message', (request) => {
        parentPort.postMessage({ id: request.id, error: 'out of memory' })
      })
    `)
    const converter = createScanlineConverter(failing)

    await expect(converter.convert(slice, 2, 1)).resolves.toEqual(new Uint8Array(expected))
    await converter.close()
  })

  it('keeps producing slices after the worker dies mid-export', async () => {
    const suicidal = await writeWorker(`
      const { parentPort } = require('node:worker_threads')
      parentPort.on('message', () => process.exit(1))
    `)
    const converter = createScanlineConverter(suicidal)

    // The first slice loses its worker; both it and every slice after it convert in place.
    await expect(converter.convert(slice, 2, 1)).resolves.toEqual(new Uint8Array(expected))
    await expect(converter.convert(slice, 2, 1)).resolves.toEqual(new Uint8Array(expected))
    await converter.close()
  })

  it('produces exactly what converting in place produces', async () => {
    const converter = createScanlineConverter(await writeWorker(workingWorker))
    const wide = Buffer.allocUnsafe(64 * 4 * 3)
    for (let i = 0; i < wide.length; i += 1) wide[i] = (i * 7) % 256

    await expect(converter.convert(wide, 64, 3)).resolves.toEqual(toScanlines(wide, 64, 3))
    await converter.close()
  })

  it('can be closed more than once', async () => {
    const converter = createScanlineConverter(await writeWorker(workingWorker))
    await converter.convert(slice, 2, 1)

    await converter.close()
    await expect(converter.close()).resolves.toBeUndefined()
  })
})
