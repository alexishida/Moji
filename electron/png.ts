import { createDeflate } from 'node:zlib'

/**
 * Minimal streaming PNG encoder, written against the PNG specification (RFC 2083).
 *
 * A tall document is captured in slices. Keeping every slice in order to stitch one
 * bitmap costs memory proportional to the whole document: a 30000px page needs more
 * than a gigabyte before a single byte is written. This encoder compresses each slice
 * as it arrives and lets it go, so memory stays proportional to one slice instead of
 * to the document.
 *
 * The output is 8-bit RGBA with no per-row filtering, which is all the export needs.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const BIT_DEPTH = 8
const COLOUR_TYPE_RGBA = 6
const FILTER_NONE = 0
const BYTES_PER_PIXEL = 4

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

export interface PngEncoder {
  /** Append the next horizontal slice, as the BGRA bitmap `capturePage` hands back. */
  addSlice: (bgra: Buffer, width: number, height: number) => Promise<void>
  /** Close the stream and assemble the complete PNG. */
  finish: (width: number, height: number) => Promise<Buffer>
}

export function createPngEncoder(): PngEncoder {
  const deflate = createDeflate()
  const compressed: Buffer[] = []

  deflate.on('data', (part: Buffer) => compressed.push(part))
  const drained = new Promise<void>((resolve) => deflate.on('end', resolve))

  const write = (bytes: Buffer): Promise<void> =>
    deflate.write(bytes) ? Promise.resolve() : new Promise((resolve) => deflate.once('drain', () => resolve()))

  return {
    async addSlice(bgra, width, height) {
      const stride = width * BYTES_PER_PIXEL

      // Every PNG row is a filter byte followed by its pixels. Laying the whole slice out
      // in one buffer keeps this to a single write, rather than two per row.
      const rows = Buffer.allocUnsafe(height * (1 + stride))

      for (let y = 0; y < height; y += 1) {
        const source = y * stride
        const target = y * (1 + stride)
        rows[target] = FILTER_NONE

        for (let i = 0; i < stride; i += BYTES_PER_PIXEL) {
          // capturePage returns BGRA; PNG expects RGBA.
          rows[target + 1 + i] = bgra[source + i + 2]
          rows[target + 2 + i] = bgra[source + i + 1]
          rows[target + 3 + i] = bgra[source + i]
          rows[target + 4 + i] = bgra[source + i + 3]
        }
      }

      await write(rows)
    },

    async finish(width, height) {
      deflate.end()
      await drained

      return Buffer.concat([
        SIGNATURE,
        imageHeader(width, height),
        chunk('IDAT', Buffer.concat(compressed)),
        chunk('IEND', Buffer.alloc(0))
      ])
    }
  }
}
