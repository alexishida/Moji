/**
 * The pixel loop of the PNG export, kept apart from both the encoder and the worker that
 * usually runs it so the two share one implementation and it can be tested on its own.
 */

const FILTER_NONE = 0
export const BYTES_PER_PIXEL = 4

/** Bytes one slice occupies once it carries a filter byte per row. */
export function scanlineBytes(width: number, height: number): number {
  return height * (1 + width * BYTES_PER_PIXEL)
}

/**
 * Turn one BGRA capture slice into PNG scanlines: a filter byte, then RGBA pixels, per row.
 *
 * The result is allocated as a plain `Uint8Array` rather than through `Buffer.allocUnsafe`,
 * because pooled buffers share one `ArrayBuffer` and could not be transferred out of a
 * worker without dragging unrelated memory along.
 */
export function toScanlines(bgra: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * BYTES_PER_PIXEL
  const rows = new Uint8Array(scanlineBytes(width, height))

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

  return rows
}
