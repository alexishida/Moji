import { open } from 'node:fs/promises'

/**
 * Bytes per chunk moved from main to renderer. Large enough that per-message overhead stays
 * negligible on a 50 MB document, small enough that main never holds the whole file.
 */
export const DOCUMENT_CHUNK_BYTES = 1024 * 1024

export interface DocumentChunk {
  /** Dedicated buffer, safe to hand to a transfer list. */
  buffer: ArrayBuffer
  /** Valid bytes; the final chunk usually fills only part of `buffer`. */
  byteLength: number
}

/**
 * Reads a file as a sequence of chunks whose `ArrayBuffer`s are exclusively owned, so each one
 * can be transferred to the renderer instead of copied. `Buffer.allocUnsafe` is deliberately
 * avoided: pooled buffers share an `ArrayBuffer` with unrelated data, which must never be
 * transferred out of this process.
 */
export async function* readFileChunks(
  filePath: string,
  chunkSize: number = DOCUMENT_CHUNK_BYTES,
  signal?: AbortSignal
): AsyncGenerator<DocumentChunk> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError('chunkSize must be a positive integer')
  }

  const handle = await open(filePath, 'r')
  try {
    for (;;) {
      if (signal?.aborted) return
      const bytes = new Uint8Array(chunkSize)
      const { bytesRead } = await handle.read(bytes, 0, chunkSize)
      if (bytesRead === 0) return
      yield { buffer: bytes.buffer, byteLength: bytesRead }
    }
  } finally {
    await handle.close()
  }
}
