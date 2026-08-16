import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DocumentTextDecoder } from './documentDecoder'
import { readFileChunks } from './documentStream'

let directory = ''
const fixture = (name: string): string => join(directory, name)

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moji-stream-'))
})

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

async function collect(filePath: string, chunkSize: number, signal?: AbortSignal): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = []
  for await (const chunk of readFileChunks(filePath, chunkSize, signal)) {
    chunks.push(new Uint8Array(chunk.buffer, 0, chunk.byteLength))
  }
  return chunks
}

describe('readFileChunks', () => {
  it('round-trips a document through chunks and the streaming decoder', async () => {
    const text = `# Título\n\n${'linha com acentuação — ções\n'.repeat(500)}`
    const path = fixture('round-trip.md')
    await writeFile(path, text, 'utf-8')

    const decoder = new DocumentTextDecoder()
    for (const chunk of await collect(path, 64)) decoder.push(chunk)

    expect(decoder.finish()).toBe(text)
  })

  it('gives each chunk an exclusively owned buffer of the requested size', async () => {
    const path = fixture('owned.md')
    await writeFile(path, 'abcdefgh', 'utf-8')

    const chunks: Array<{ buffer: ArrayBuffer; byteLength: number }> = []
    for await (const chunk of readFileChunks(path, 5)) chunks.push(chunk)

    expect(chunks.map((chunk) => chunk.byteLength)).toEqual([5, 3])
    // Distinct buffers, so transferring one never invalidates another.
    expect(chunks[0].buffer).not.toBe(chunks[1].buffer)
    expect(chunks[0].buffer.byteLength).toBe(5)
  })

  it('yields nothing for an empty file', async () => {
    const path = fixture('empty.md')
    await writeFile(path, '', 'utf-8')

    expect(await collect(path, 16)).toEqual([])
  })

  it('stops early once the signal aborts', async () => {
    const path = fixture('abort.md')
    await writeFile(path, 'x'.repeat(100), 'utf-8')

    const controller = new AbortController()
    const chunks: Uint8Array[] = []
    for await (const chunk of readFileChunks(path, 10, controller.signal)) {
      chunks.push(new Uint8Array(chunk.buffer, 0, chunk.byteLength))
      if (chunks.length === 2) controller.abort()
    }

    expect(chunks).toHaveLength(2)
  })

  it('rejects an invalid chunk size', async () => {
    const path = fixture('invalid.md')
    await writeFile(path, 'data', 'utf-8')

    await expect(collect(path, 0)).rejects.toThrow('chunkSize must be a positive integer')
  })
})
