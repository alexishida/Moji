import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { createPngFileWriter } from './png'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let directory = ''
let destination = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moji-png-'))
  destination = join(directory, 'capture.png')
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

/** Walk the chunk list: each is length, four-letter type, payload, CRC. */
function readChunks(png: Buffer): Array<{ type: string; payload: Buffer }> {
  const chunks: Array<{ type: string; payload: Buffer }> = []
  let offset = SIGNATURE.length

  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    const payload = png.subarray(offset + 8, offset + 8 + length)
    chunks.push({ type, payload })
    offset += 12 + length
  }

  return chunks
}

function scanlines(png: Buffer): Buffer {
  const data = readChunks(png)
    .filter((chunk) => chunk.type === 'IDAT')
    .map((chunk) => chunk.payload)
  return inflateSync(Buffer.concat(data))
}

/** One BGRA pixel, in the byte order `capturePage` returns. */
function bgra(blue: number, green: number, red: number, alpha = 255): number[] {
  return [blue, green, red, alpha]
}

describe('createPngFileWriter', () => {
  it('writes a PNG whose structure a decoder can walk', async () => {
    const writer = await createPngFileWriter(destination)
    await writer.addSlice(Buffer.from([...bgra(1, 2, 3), ...bgra(4, 5, 6)]), 2, 1)
    await writer.finish(2, 1)

    const png = await readFile(destination)
    expect(png.subarray(0, 8)).toEqual(SIGNATURE)

    const types = readChunks(png).map((chunk) => chunk.type)
    expect(types[0]).toBe('IHDR')
    expect(types.at(-1)).toBe('IEND')
    expect(types.filter((type) => type === 'IDAT').length).toBeGreaterThanOrEqual(1)
  })

  it('describes the image as 8-bit RGBA of the given size', async () => {
    const writer = await createPngFileWriter(destination)
    await writer.addSlice(Buffer.alloc(3 * 2 * 4), 3, 2)
    await writer.finish(3, 2)

    const header = readChunks(await readFile(destination)).find((chunk) => chunk.type === 'IHDR')?.payload as Buffer

    expect(header.readUInt32BE(0)).toBe(3) // width
    expect(header.readUInt32BE(4)).toBe(2) // height
    expect(header[8]).toBe(8) // bit depth
    expect(header[9]).toBe(6) // colour type: RGBA
    expect(header[12]).toBe(0) // not interlaced
  })

  it('converts the BGRA capture to RGBA and prefixes each row with its filter byte', async () => {
    const writer = await createPngFileWriter(destination)
    // Two rows of two pixels, in BGRA as capturePage hands them over.
    await writer.addSlice(
      Buffer.from([
        ...bgra(10, 20, 30), ...bgra(40, 50, 60),
        ...bgra(70, 80, 90), ...bgra(100, 110, 120)
      ]),
      2,
      2
    )
    await writer.finish(2, 2)

    expect([...scanlines(await readFile(destination))]).toEqual([
      0, /* filter: none */ 30, 20, 10, 255, 60, 50, 40, 255,
      0, /* filter: none */ 90, 80, 70, 255, 120, 110, 100, 255
    ])
  })

  it('preserves alpha rather than forcing pixels opaque', async () => {
    const writer = await createPngFileWriter(destination)
    await writer.addSlice(Buffer.from([...bgra(9, 9, 9, 128)]), 1, 1)
    await writer.finish(1, 1)

    expect([...scanlines(await readFile(destination))]).toEqual([0, 9, 9, 9, 128])
  })

  it('appends slices in the order they arrive, so a tall document is not scrambled', async () => {
    const writer = await createPngFileWriter(destination)
    await writer.addSlice(Buffer.from([...bgra(1, 1, 1)]), 1, 1)
    await writer.addSlice(Buffer.from([...bgra(2, 2, 2)]), 1, 1)
    await writer.addSlice(Buffer.from([...bgra(3, 3, 3)]), 1, 1)
    await writer.finish(1, 3)

    expect([...scanlines(await readFile(destination))]).toEqual([
      0, 1, 1, 1, 255,
      0, 2, 2, 2, 255,
      0, 3, 3, 3, 255
    ])
  })

  it('carries a valid CRC on every chunk', async () => {
    const writer = await createPngFileWriter(destination)
    await writer.addSlice(Buffer.alloc(4), 1, 1)
    await writer.finish(1, 1)

    const png = await readFile(destination)

    // Recompute each CRC independently and compare with the one written out.
    const table = new Int32Array(256)
    for (let byte = 0; byte < 256; byte += 1) {
      let value = byte
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
      table[byte] = value
    }
    const crc32 = (bytes: Buffer): number => {
      let crc = -1
      for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
      return (crc ^ -1) >>> 0
    }

    let offset = SIGNATURE.length
    let checked = 0
    while (offset < png.length) {
      const length = png.readUInt32BE(offset)
      const typed = png.subarray(offset + 4, offset + 8 + length)
      expect(png.readUInt32BE(offset + 8 + length)).toBe(crc32(typed))
      offset += 12 + length
      checked += 1
    }
    expect(checked).toBe(readChunks(png).length)
  })

  it('emits several IDAT chunks rather than holding the whole compressed image', async () => {
    const writer = await createPngFileWriter(destination)

    // Noise compresses badly, so this produces far more deflate output than one
    // internal buffer holds and forces the stream to emit repeatedly.
    const width = 512
    const height = 256
    const noise = Buffer.allocUnsafe(width * height * 4)
    for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) % 251

    await writer.addSlice(noise, width, height)
    await writer.finish(width, height)

    const chunks = readChunks(await readFile(destination))
    expect(chunks.filter((chunk) => chunk.type === 'IDAT').length).toBeGreaterThan(1)
    // The scanlines still round-trip, so splitting IDAT did not corrupt the stream.
    expect(scanlines(await readFile(destination)).length).toBe(height * (1 + width * 4))
  })

  it('publishes the file only once the image is complete', async () => {
    const writer = await createPngFileWriter(destination)
    await writer.addSlice(Buffer.from([...bgra(1, 1, 1)]), 1, 1)

    // Mid-encode the destination does not exist yet; only the sibling temp file does.
    expect(await readdir(directory)).toEqual(['capture.png.tmp'])

    await writer.finish(1, 1)
    expect(await readdir(directory)).toEqual(['capture.png'])
  })

  it('leaves no partial file behind when the export is abandoned', async () => {
    const writer = await createPngFileWriter(destination)
    await writer.addSlice(Buffer.from([...bgra(1, 1, 1)]), 1, 1)
    await writer.abort()

    expect(await readdir(directory)).toEqual([])
  })
})
