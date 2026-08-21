import { open, rename, unlink, type FileHandle } from 'node:fs/promises'
import { createDeflate } from 'node:zlib'
import { createScanlineConverter, type ScanlineConverter } from './pngScanlineConverter'

/**
 * Minimal streaming PNG encoder, written against the PNG specification (RFC 2083).
 *
 * A tall document is captured in slices. Holding every slice to stitch one bitmap costs
 * memory proportional to the whole document: a 30000px page needs more than a gigabyte
 * before a single byte is written. This encoder compresses each slice as it arrives and
 * writes the compressed bytes straight to the destination file, so memory follows one
 * slice plus the deflate window rather than the size of the finished image.
 *
 * The output is 8-bit RGBA with no per-row filtering, which is all the export needs.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const BIT_DEPTH = 8
const COLOUR_TYPE_RGBA = 6

/** Bytes of a complete IHDR chunk: length, type, 13-byte payload, CRC. */
const IHDR_CHUNK_BYTES = 25

const CRC_TABLE = buildCrcTable()

function buildCrcTable(): Int32Array {
  const table = new Int32Array(256)
  for (let byte = 0; byte < 256; byte += 1) {
    let value = byte
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[byte] = value
  }
  return table
}

function crc32(bytes: Buffer): number {
  let crc = -1
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

/** A PNG chunk: payload length, four-letter type, payload, then a CRC over type + payload. */
function chunk(type: string, payload: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(payload.length, 0)

  const typed = Buffer.concat([Buffer.from(type, 'ascii'), payload])

  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(typed), 0)

  return Buffer.concat([length, typed, checksum])
}

function imageHeader(width: number, height: number): Buffer {
  const payload = Buffer.alloc(13)
  payload.writeUInt32BE(width, 0)
  payload.writeUInt32BE(height, 4)
  payload[8] = BIT_DEPTH
  payload[9] = COLOUR_TYPE_RGBA
  // Bytes 10 to 12 stay zero: deflate compression, adaptive filtering, no interlacing.
  return chunk('IHDR', payload)
}

export interface PngFileWriter {
  /** Append the next horizontal slice, as the BGRA bitmap `capturePage` hands back. */
  addSlice: (bgra: Buffer, width: number, height: number) => Promise<void>
  /** Close the stream, stamp the final size, and move the file into place. */
  finish: (width: number, height: number) => Promise<void>
  /** Give up and leave no partial file behind. */
  abort: () => Promise<void>
}

/**
 * Open `destination` for a streamed PNG.
 *
 * Bytes go to a sibling `.tmp` file and are renamed into place only once the image is
 * complete, so a cancelled or failed export never leaves a truncated PNG where the user
 * asked for a picture. The sibling shares the destination's directory, which keeps the
 * rename on one filesystem and therefore atomic.
 *
 * The size is not known until the last slice has been captured, but IHDR has to be
 * written first. It is written with a placeholder size and rewritten in place at the end,
 * which is safe because IHDR always occupies the same 25 bytes right after the signature.
 */
export async function createPngFileWriter(
  destination: string,
  converter: ScanlineConverter = createScanlineConverter()
): Promise<PngFileWriter> {
  const temporary = `${destination}.tmp`
  const handle: FileHandle = await open(temporary, 'w')

  let closed = false
  const closeAndUnlink = async (): Promise<void> => {
    if (!closed) {
      closed = true
      await handle.close()
    }
    await unlink(temporary).catch(() => undefined)
  }

  try {
    await handle.write(SIGNATURE)
    await handle.write(imageHeader(0, 0))

    const deflate = createDeflate()
    let pumpError: Error | null = null

    // Consuming the stream with `for await` applies backpressure and keeps the IDAT
    // chunks in order: the next compressed block is only pulled once the previous one
    // has reached the file.
    const pump = (async () => {
      for await (const part of deflate) {
        await handle.write(chunk('IDAT', part as Buffer))
      }
    })()

    // A rejected pump with no attached handler would surface as an unhandled rejection
    // before `finish` gets to await it. Destroying `deflate` with the error also wakes any
    // `write()` still waiting on `drain`: breaking out of `for await` on a write failure
    // (e.g. disk full) does not by itself make the writable side emit anything, so without
    // this a pending slice would hang forever instead of failing the export.
    pump.catch((err: Error) => {
      pumpError = err
      if (!deflate.destroyed) deflate.destroy(err)
    })

    const write = (bytes: Buffer): Promise<void> => {
      if (deflate.destroyed) return Promise.reject(pumpError ?? new Error('PNG export stream closed'))
      if (deflate.write(bytes)) return Promise.resolve()
      return new Promise((resolve, reject) => {
        const cleanup = (): void => {
          deflate.off('drain', onDrain)
          deflate.off('error', onError)
          deflate.off('close', onClose)
        }
        const onDrain = (): void => {
          cleanup()
          resolve()
        }
        const onError = (err: Error): void => {
          cleanup()
          reject(err)
        }
        // `destroy()` without a synchronous listener error can settle as `close` alone on
        // some Node versions; either event must resolve this promise.
        const onClose = (): void => {
          cleanup()
          reject(pumpError ?? new Error('PNG export stream closed'))
        }
        deflate.once('drain', onDrain)
        deflate.once('error', onError)
        deflate.once('close', onClose)
      })
    }

    return {
      async addSlice(bgra, width, height) {
        // Rearranging a few million pixels is the one step that would otherwise hold the
        // main process, so it happens on a worker thread.
        const rows = await converter.convert(bgra, width, height)
        await write(Buffer.from(rows.buffer, rows.byteOffset, rows.byteLength))
      },

      async finish(width, height) {
        try {
          deflate.end()
          await pump

          await handle.write(chunk('IEND', Buffer.alloc(0)))
          // Now that the height is known, restate IHDR over the placeholder.
          await handle.write(imageHeader(width, height), 0, IHDR_CHUNK_BYTES, SIGNATURE.length)

          closed = true
          await handle.close()
        } catch (err) {
          await closeAndUnlink()
          throw err
        } finally {
          await converter.close()
        }

        try {
          await rename(temporary, destination)
        } catch (err) {
          // The handle is already closed at this point; only the sibling `.tmp` is left to
          // clean up, or a failed rename (destination locked, read-only, wrong volume) would
          // leave it behind in the directory the user picked for the export.
          await unlink(temporary).catch(() => undefined)
          throw err
        }
      },

      async abort() {
        deflate.destroy()
        await converter.close()
        await closeAndUnlink()
      }
    }
  } catch (err) {
    await converter.close()
    await closeAndUnlink()
    throw err
  }
}
